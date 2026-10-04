import { z } from "zod";
import type { PartCategory, ResearchPlan, SearchIntent } from "@/types/research";
import { PART_CATEGORY_DEFINITIONS, getPartCategory } from "@/lib/domain/parts";
import {
  type DeviceMention,
  buildVariantKey,
  extractDeviceMention,
  extractModelNumbers,
  extractVariantMarkers,
  findBrand,
} from "@/lib/domain/devices";
import { canonicalizePartTerm, findPartMention } from "@/lib/domain/part-match";
import type { AIProvider } from "@/lib/providers/ai/AIProvider";

export type QueryUnderstanding = Omit<ResearchPlan, "queries">;

/**
 * Stage 1 — query understanding.
 *
 * Two layers, always in this order:
 *   1. A deterministic parser (regex + taxonomy) that always runs. This is the
 *      only layer whose output the pipeline *requires*, so PartScout still works
 *      with no AI provider configured and no AI budget.
 *   2. Optional AI enrichment that fills gaps (intent, region, manufacturer).
 *      It can never invent model numbers or part numbers — anything it returns is
 *      merged only if the deterministic layer did not already know better, and
 *      model/part numbers are re-derived from the raw query text.
 */

const INTENT_PATTERNS: Array<{ intent: SearchIntent; pattern: RegExp; weight: number }> = [
  { intent: "part_to_phones", pattern: /\b(what|which|any)\b[^?]*\b(phones?|models?|devices?|handsets?)\b[^?]*\b(use|uses|take|takes|fit|fits|work|works|compatible)\b/i, weight: 3 },
  { intent: "part_to_phones", pattern: /\b(this|these|my)\b[^?]*\b(flex|part|battery|screen|display|board|coil|module|cable)\b[^?]*\b(fits?|go(es)? in|belongs to|used (in|on))\b/i, weight: 2 },
  { intent: "part_to_phones", pattern: /\b(flex|part|battery|screen|display|board|coil|camera|speaker)\b[^?]*\bcompatible (phones|models|devices)\b/i, weight: 3 },
  { intent: "identify", pattern: /\b(identify|what (is|'s) this|which part is this|decode|what part number|identify this part)\b/i, weight: 3 },
  { intent: "phone_to_parts", pattern: /\bwhat\b[^?]*\b(screens?|batteries|battery|displays?|flex(es)?|cams?|cameras?|speakers?|parts?)\b[^?]*\b(work|works|fit|fits|are compatible|can i use|do i need)\b/i, weight: 3 },
  { intent: "phone_to_parts", pattern: /\b(find|looking for|need|source|which|where (can|to) (i|buy))\b[^?]*\b(replacement )?(screens?|batteries|battery|charging flex|flex(es)?|display|part|parts)\b/i, weight: 2 },
  { intent: "compatibility_check", pattern: /\b(can i|can you|could i|is it possible to|will it|does it|would it)\b[^?]*\b(use|fit|work|swap|install|replace)\b/i, weight: 3 },
  { intent: "compatibility_check", pattern: /\bcompatible with\b|\binterchangeable\b|\bwill (this|it) work\b|\bfit (my|a|an|the)\b/i, weight: 3 },
];

function scoreIntents(query: string): Array<{ intent: SearchIntent; score: number }> {
  const scores = new Map<SearchIntent, number>();
  for (const { intent, pattern, weight } of INTENT_PATTERNS) {
    if (pattern.test(query)) {
      scores.set(intent, (scores.get(intent) ?? 0) + weight);
    }
  }
  return [...scores.entries()]
    .map(([intent, score]) => ({ intent, score }))
    .sort((a, b) => b.score - a.score);
}

const REGION_PATTERNS: Array<{ region: string; pattern: RegExp }> = [
  { region: "US", pattern: /\b(us|usa|united states|american)\b/i },
  { region: "EU", pattern: /\b(eu|europe|european|uk|britain)\b/i },
  { region: "IN", pattern: /\b(india|indian)\b/i },
  { region: "CN", pattern: /\b(china|chinese|cn)\b/i },
  { region: "KR", pattern: /\b(korea|korean)\b/i },
  { region: "LATAM", pattern: /\b(latam|latin america|brazil|mexico)\b/i },
  { region: "MEA", pattern: /\b(middle east|africa|uae|nigeria|kenya)\b/i },
  { region: "GLOBAL", pattern: /\b(global|international|worldwide)\b/i },
];

const MANUFACTURER_HINTS = [
  "samsung","apple","xiaomi","huawei","oppo","vivo","oneplus","realme","motorola","nokia","sony","lg",
  "google","tecno","infinix","itel","tcl","alcatel","asus","lenovo","zte","nothing","meizu","fairphone",
  "sharp","blackview",
];

export interface DeterministicUnderstanding extends QueryUnderstanding {
  deviceMention: DeviceMention | null;
  /** True when the query looks like a bare part/model identifier. */
  looksLikeIdentifier: boolean;
}

export function parseQueryDeterministically(query: string, requestedIntent?: SearchIntent): DeterministicUnderstanding {
  const trimmed = query.trim();
  const notes: string[] = [];

  const deviceMention = extractDeviceMention(trimmed);
  const partMention = findPartMention(trimmed);
  const partTerm = partMention ? canonicalizePartTerm(partMention.matchedAlias) : null;

  const identifiers = extractModelNumbers(trimmed, { brand: deviceMention?.brand ?? null });
  const variantMarkers = extractVariantMarkers(trimmed);

  // A bare identifier ("BN5A", "SM-A155F screen") is treated as identification.
  const wordCount = trimmed.split(/\s+/).length;
  const looksLikeIdentifier =
    !partMention &&
    wordCount <= 3 &&
    (identifiers.partNumbers.length > 0 || identifiers.deviceModels.length > 0);

  const intentScores = scoreIntents(trimmed);
  let intent: SearchIntent = requestedIntent ?? intentScores[0]?.intent ?? "unknown";
  if (!requestedIntent) {
    if (intent === "unknown") {
      if (deviceMention && partMention) intent = "compatibility_check";
      else if (deviceMention) intent = "phone_to_parts";
      else if (partMention || identifiers.partNumbers.length > 0) intent = "part_to_phones";
      else if (looksLikeIdentifier) intent = "identify";
    }
    if (looksLikeIdentifier && identifiers.partNumbers.length > 0) intent = "identify";
    // A part + no device is inherently a reverse lookup.
    if (intent === "compatibility_check" && partMention && !deviceMention && identifiers.partNumbers.length === 0) {
      intent = "part_to_phones";
    }
  }

  const partCategory: PartCategory = partMention?.category ?? inferCategoryFromPartNumbers(identifiers.partNumbers, intent);

  const deviceParts = [
    deviceMention?.family ?? null,
    deviceMention?.familyKey ? null : identifiers.deviceModels[0] ?? null,
  ].filter(Boolean) as string[];
  const device = deviceParts[0] ?? null;

  const region = REGION_PATTERNS.find((entry) => entry.pattern.test(trimmed))?.region ?? null;
  const manufacturer =
    deviceMention?.brandLabel ??
    MANUFACTURER_HINTS.find((hint) => trimmed.toLowerCase().includes(hint)) ??
    null;

  if (partMention) {
    notes.push(`Detected part category “${getPartCategory(partMention.category).label}” from the wording “${partMention.matchedAlias}”.`);
  }
  if (partTerm?.notes.length) notes.push(...partTerm.notes);
  if (deviceMention?.family) {
    notes.push(`Detected device “${deviceMention.family}”${deviceMention.brandLabel ? ` (${deviceMention.brandLabel})` : ""}.`);
  }
  if (identifiers.deviceModels.length) notes.push(`Model number(s): ${identifiers.deviceModels.join(", ")}.`);
  if (identifiers.partNumbers.length) notes.push(`Possible part number(s): ${identifiers.partNumbers.join(", ")}.`);
  if (variantMarkers.length) notes.push(`Variant markers kept separate: ${variantMarkers.join(", ")}.`);

  return {
    intent,
    device,
    deviceBrand: deviceMention?.brandLabel ?? (findBrand(trimmed)?.label ?? null),
    modelNumbers: identifiers.deviceModels,
    variantMarkers,
    part: partMention ? getPartCategory(partMention.category).label : partTerm?.canonical ?? null,
    partCategory,
    partNumber: identifiers.partNumbers[0] ?? null,
    manufacturer,
    region,
    rawQuery: trimmed,
    understandingNotes: notes,
    understandingMethod: "deterministic",
    deviceMention,
    looksLikeIdentifier,
  };
}

function inferCategoryFromPartNumbers(partNumbers: string[], intent: SearchIntent): PartCategory {
  for (const partNumber of partNumbers) {
    if (/^(EB-|BN\d)/i.test(partNumber)) return "battery";
    if (/^GH\d{2}-/i.test(partNumber)) return "screen";
    if (/^821-/i.test(partNumber)) return "screen";
  }
  return intent === "identify" ? "other" : "other";
}

const aiUnderstandingSchema = z.object({
  intent: z.enum(["phone_to_parts", "part_to_phones", "compatibility_check", "identify", "unknown"]).optional(),
  device: z.string().max(120).nullish(),
  part: z.string().max(120).nullish(),
  partCategory: z.string().max(40).nullish(),
  manufacturer: z.string().max(60).nullish(),
  region: z.string().max(20).nullish(),
  variantMarkers: z.array(z.string().max(30)).max(10).optional(),
  notes: z.array(z.string().max(240)).max(6).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

export interface UnderstandOptions {
  ai?: AIProvider | null;
  requestedIntent?: SearchIntent;
  logger?: { warn: (message: string, meta?: unknown) => void };
}

/**
 * Full understanding stage: deterministic parse, then optional AI enrichment.
 * AI output is advisory only — it never introduces model numbers.
 */
export async function understandQuery(query: string, options: UnderstandOptions = {}): Promise<QueryUnderstanding> {
  const deterministic = parseQueryDeterministically(query, options.requestedIntent);

  if (!options.ai) {
    return stripInternal(deterministic);
  }

  try {
    const aiResult = await options.ai.understandQuery({
      query,
      deterministic: {
        intent: deterministic.intent,
        device: deterministic.device,
        part: deterministic.part,
        partCategory: deterministic.partCategory,
        modelNumbers: deterministic.modelNumbers,
        variantMarkers: deterministic.variantMarkers,
        partNumber: deterministic.partNumber,
      },
    });

    const parsed = aiUnderstandingSchema.safeParse(aiResult);
    if (!parsed.success) {
      options.logger?.warn("AI understanding returned an unexpected shape; using deterministic parse", {
        issues: parsed.error.issues.slice(0, 3),
      });
      return stripInternal(deterministic);
    }

    const ai = parsed.data;
    const notes = [...deterministic.understandingNotes];
    if (ai.notes?.length) notes.push(...ai.notes.slice(0, 3));

    const validCategory = (value?: string | null): PartCategory | null =>
      value && value in PART_CATEGORY_DEFINITIONS ? (value as PartCategory) : null;

    const merged: QueryUnderstanding = {
      intent: options.requestedIntent ?? ai.intent ?? deterministic.intent,
      // Never trust AI-provided device/model strings over the raw query text.
      device: deterministic.device ?? (ai.device ? ai.device.trim().slice(0, 120) : null),
      deviceBrand: deterministic.deviceBrand ?? (ai.manufacturer ? ai.manufacturer.trim().slice(0, 60) : null),
      modelNumbers: deterministic.modelNumbers,
      // Variant markers are always re-derived from the query itself.
      variantMarkers: deterministic.variantMarkers.length ? deterministic.variantMarkers : (ai.variantMarkers ?? []).slice(0, 10),
      part: deterministic.part ?? (ai.part ? ai.part.trim().slice(0, 120) : null),
      partCategory: deterministic.partCategory !== "other" || !validCategory(ai.partCategory)
        ? deterministic.partCategory
        : validCategory(ai.partCategory)!,
      partNumber: deterministic.partNumber,
      manufacturer: deterministic.manufacturer ?? (ai.manufacturer ? ai.manufacturer.trim().slice(0, 60) : null),
      region: deterministic.region ?? (ai.region ? ai.region.trim().slice(0, 20) : null),
      rawQuery: deterministic.rawQuery,
      understandingNotes: notes,
      understandingMethod: ai.intent || ai.device || ai.part ? "hybrid" : "deterministic",
    };

    return merged;
  } catch (error) {
    options.logger?.warn("AI understanding failed; continuing with deterministic parse", {
      error: error instanceof Error ? error.message : String(error),
    });
    return stripInternal(deterministic);
  }
}

function stripInternal(understanding: DeterministicUnderstanding): QueryUnderstanding {
  const { deviceMention: _deviceMention, looksLikeIdentifier: _looksLike, ...rest } = understanding;
  return rest;
}

/** Helper used by the API layer for lightweight pre-validation. */
export function deriveRequestedIntent(mode?: string): SearchIntent | undefined {
  switch (mode) {
    case "phone":
    case "phone_to_parts":
      return "phone_to_parts";
    case "part":
    case "part_to_phones":
      return "part_to_phones";
    case "compatibility":
    case "check":
      return "compatibility_check";
    case "identify":
      return "identify";
    default:
      return undefined;
  }
}

/**
 * Convenience wrapper used when the caller already knows the device + part
 * (Check Compatibility mode with structured fields).
 */
export function composeQueryFromFields(input: {
  device?: string | null;
  modelNumber?: string | null;
  part?: string | null;
  partNumber?: string | null;
  freeText?: string | null;
}): string {
  const bits = [
    input.freeText?.trim(),
    input.device?.trim(),
    input.modelNumber?.trim(),
    input.part?.trim(),
    input.partNumber?.trim(),
  ].filter((value): value is string => Boolean(value && value.length > 0));
  if (bits.length === 0) return "";
  const [heading, ...rest] = bits;
  const restText = rest.length ? ` (${rest.join(", ")})` : "";
  return `Is ${heading}${restText} compatible and which devices does it fit?`;
}

export { buildVariantKey };
