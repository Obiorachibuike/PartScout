import type {
  ClaimKind,
  EvaluatedSource,
  EvidenceClaim,
  EvidenceStrength,
  ExtractedSource,
  PartCategory,
} from "@/types/research";
import { stableHash } from "@/lib/hash";
import { logger as defaultLogger } from "@/lib/logger";
import { limits } from "@/lib/config";
import { PART_CATEGORY_DEFINITIONS, getPartCategory } from "@/lib/domain/parts";
import { buildVariantKey, extractModelNumbers, extractVariantMarkers, normalizeIdentifier } from "@/lib/domain/devices";
import { asEvidenceBlock } from "@/lib/safety/untrusted";
import { type AIProvider } from "@/lib/providers/ai/AIProvider";
import type { QueryUnderstanding } from "@/lib/research/query-understanding";
import { normalizeForMatch, splitSegments, snippetAround, collapseWhitespace, truncate } from "@/lib/text";

/**
 * Stage 5 — evidence extraction.
 *
 * We never hand a whole webpage to the model and ask "is this compatible?".
 * Instead every page is segmented and scanned for spans that contain
 * (device + part + claim) together, which are turned into structured claims.
 *
 * Deterministic extraction runs first and is enough on its own. An optional AI
 * pass then reads pages where the deterministic scan found nothing — and every
 * quote it returns is verified to appear verbatim in the page text before it is
 * accepted, so hallucinated evidence is dropped.
 */

const CLAIM_PATTERNS: Array<{ kind: ClaimKind; pattern: RegExp; weight: number }> = [
  { kind: "not_compatible", pattern: /\b(not compatible|incompatible|will not fit|won't fit|does not fit|doesn't fit|not interchangeable|cannot be used|can't be used|may damage)\b/i, weight: 0.95 },
  { kind: "not_compatible", pattern: /\b(only fits|for the .{0,20} only|exclusively for)\b/i, weight: 0.6 },
  { kind: "compatible", pattern: /\bcompatible (with|for)\b|\bcompatibility list\b/i, weight: 0.95 },
  { kind: "compatible", pattern: /\b(fits|fit for|fits for|fitting)\b/i, weight: 0.8 },
  { kind: "compatible", pattern: /\b(replacement for|replaces|replace part for)\b/i, weight: 0.7 },
  { kind: "compatible", pattern: /\b(works? (with|for|on)|will work|working on)\b/i, weight: 0.65 },
  { kind: "compatible", pattern: /\b(suitable for|designed for|for use (with|in|on)|used (in|on|with))\b/i, weight: 0.6 },
  { kind: "compatible", pattern: /\b(interchangeable|same as original|oem equivalent)\b/i, weight: 0.8 },
  { kind: "compatible", pattern: /\b(shared (across|between|with)|same (part|assembly) as|swap(ped)? (between|with)|can be (used|swapped))\b/i, weight: 0.6 },
  // Hedged wording ("mixed reports", "some say it did not") is reported as
  // unclear rather than being rounded to a yes/no answer.
  { kind: "unclear", pattern: /\b(mixed reports?|reports? vary|inconsistent|some (users|people|technicians) say|unclear|uncertain|not sure)\b/i, weight: 0.78 },
  { kind: "not_compatible", pattern: /\b(is different|are different|differs? from|not the same (part|assembly)|do not swap|don't swap)\b/i, weight: 0.7 },
  { kind: "spec_only", pattern: /\b(\d+(\.\d+)?\s?(v|volt|volts|mah|ah|w|a)\b|capacity|voltage|impedance|resolution|refresh rate)\b/i, weight: 0.4 },
];

const ATTRIBUTE_PATTERNS: Array<{ key: string; pattern: RegExp }> = [
  { key: "voltage", pattern: /\b(\d\.\d{1,2}\s?(?:v|volt|volts))\b/i },
  { key: "capacity", pattern: /\b(\d{3,5}\s?(?:mah|mAh))\b/ },
  { key: "connector", pattern: /\b(usb[\s-]?c|type[\s-]?c|micro[\s-]?usb|lightning|30[\s-]?pin|fpc|zif|btb)\b/i },
  { key: "pin_count", pattern: /\b(\d{1,2})[\s-]?pin\b/i },
  { key: "revision", pattern: /\b(rev(?:ision)?\.?\s?[a-z0-9]{1,3}|v[1-9]\b|version\s?\d)\b/i },
  { key: "size", pattern: /\b(\d(?:\.\d{1,2})?\s?(?:inch|"|inches))\b/i },
  { key: "resolution", pattern: /\b(\d{3,4}\s?[x×]\s?\d{3,4})\b/i },
  { key: "panel", pattern: /\b(amoled|super amoled|oled|lcd|ips|tft|incell)\b/i },
  { key: "frame", pattern: /\b(with frame|without frame|no frame|service pack)\b/i },
  { key: "dimensions", pattern: /\b(\d{1,3}(?:\.\d)?\s?x\s?\d{1,3}(?:\.\d)?\s?x?\s?\d{0,3}(?:\.\d)?\s?mm)\b/i },
  { key: "megapixels", pattern: /\b(\d{1,3}\s?(?:mp|megapixel)s?)\b/i },
];

/** Brand words that identify a device reference inside a page segment. */
const BRAND_MENTION =
  /\b(samsung|galaxy|iphone|apple|redmi|xiaomi|poco|huawei|honor|oppo|vivo|oneplus|realme|motorola|moto|nokia|sony|pixel|tecno|infinix|itel|tcl|asus|lenovo|nothing phone)\b/i;

const MODEL_TOKEN_PATTERN = /\b(sm-[a-z]\d{2,4}[a-z0-9]*|gt-[a-z0-9]{4,10}|rmx\d{4,6}|cph\d{3,5}|xt\d{4,5}|ta-\d{3,4}|a\d{4}|m\d{4}[a-z0-9]{2,5}|[a-z]{2}\d{3,4}[a-z]?)\b/gi;

export interface EvidenceExtractionResult {
  claims: EvidenceClaim[];
  method: "deterministic" | "ai" | "hybrid";
  aiNotes: string[];
  warnings: string[];
}

export interface EvidenceExtractionOptions {
  ai?: AIProvider | null;
  logger?: typeof defaultLogger;
  signal?: AbortSignal;
  maxAiSources?: number;
}

export async function extractCompatibilityClaims(
  sources: EvaluatedSource[],
  understanding: QueryUnderstanding,
  options: EvidenceExtractionOptions = {},
): Promise<EvidenceExtractionResult> {
  const log = options.logger ?? defaultLogger;
  const deterministic = sources.flatMap((source) => extractClaimsFromSource(source, understanding));
  const warnings: string[] = [];

  if (deterministic.some((claim) => claim.extractionMethod === "deterministic")) {
    log.debug("deterministic evidence extraction", { claims: deterministic.length });
  }

  if (!options.ai) {
    return {
      claims: dedupeClaims(deterministic),
      method: "deterministic",
      aiNotes: [],
      warnings,
    };
  }

  // Which pages still need the AI pass? High-quality pages with no usable claim.
  const coverage = new Map<string, number>();
  for (const claim of deterministic) coverage.set(claim.sourceId, (coverage.get(claim.sourceId) ?? 0) + 1);

  const candidates = sources
    .filter((source) => (coverage.get(source.id) ?? 0) === 0)
    .filter((source) => source.quality.total >= 0.45 && source.text.length > 220)
    .sort((a, b) => b.quality.total - a.quality.total)
    .slice(0, options.maxAiSources ?? 6);

  if (candidates.length === 0) {
    return { claims: dedupeClaims(deterministic), method: "deterministic", aiNotes: [], warnings };
  }

  try {
    const refs = new Map<string, EvaluatedSource>();
    const blocks: string[] = [];
    let budget = limits.maxAiInputChars;
    candidates.forEach((source, index) => {
      const ref = `S${index + 1}`;
      const digest = buildEvidenceDigest(source.text, understanding, 3_500);
      if (digest.length === 0 || budget - digest.length < 0) return;
      budget -= digest.length;
      refs.set(ref, source);
      blocks.push(asEvidenceBlock(ref, digest));
    });

    if (refs.size === 0) {
      return { claims: dedupeClaims(deterministic), method: "deterministic", aiNotes: [], warnings };
    }

    const { claims: aiClaims, notes } = await options.ai.extractEvidence({
      evidenceBlocks: blocks.join("\n\n"),
      device: understanding.device,
      partCategory: understanding.partCategory,
      partNumber: understanding.partNumber,
      allowedRefs: [...refs.keys()],
    });

    const validated: EvidenceClaim[] = [];
    for (const raw of aiClaims as unknown as Array<Record<string, unknown>>) {
      const claim = validateAiClaim(raw, refs, understanding);
      if (claim) validated.push(claim);
      else warnings.push("An AI-extracted claim was discarded because its quote could not be verified in the page text.");
    }

    const method = deterministic.length > 0 ? "hybrid" : validated.length > 0 ? "ai" : "deterministic";
    return {
      claims: dedupeClaims([...deterministic, ...validated]),
      method,
      aiNotes: (notes ?? []).slice(0, 4),
      warnings: dedupeStrings(warnings).slice(0, 5),
    };
  } catch (error) {
    log.warn("AI evidence extraction failed; keeping deterministic claims", {
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      claims: dedupeClaims(deterministic),
      method: "deterministic",
      aiNotes: [],
      warnings: ["AI evidence extraction was unavailable for this run; results rely on the deterministic extraction layer."],
    };
  }
}

/* -------------------------------------------------------------------------- */
/* Deterministic extraction                                                   */
/* -------------------------------------------------------------------------- */

export function extractClaimsFromSource(source: EvaluatedSource, understanding: QueryUnderstanding): EvidenceClaim[] {
  const definition = getPartCategory(understanding.partCategory);
  const partTerms = [
    ...definition.aliases,
    understanding.part ?? "",
    ...(understanding.partNumber ? [understanding.partNumber] : []),
  ]
    .map((term) => normalizeForMatch(term))
    .filter((term) => term.length >= 3);

  const deviceTerms = [
    understanding.device ?? "",
    understanding.deviceBrand ?? "",
    ...understanding.modelNumbers,
    // Loose family tokens ("a15") dramatically improve recall on supplier pages.
    ...(understanding.device ? normalizeForMatch(understanding.device).split(" ").filter((token) => /[a-z]*\d/.test(token)) : []),
  ]
    .map((term) => normalizeForMatch(term))
    .filter((term) => term.length >= 2);

  // Tokens with digits from the requested device ("A15" → "a15", "Note 12" → "12")
  // let us recognise its SKUs inside pages (e.g. SM-A155F) even when the page
  // never repeats the marketing name.
  const deviceCores = deviceTerms.filter((term) => /\d/.test(term) && term.length >= 2);
  const segments = splitSegments(source.text);
  // Part numbers printed anywhere on the page (used to enrich claims whose own
  // sentence does not repeat the number, e.g. a "Part number: …" line).
  const pagePartNumbers = findPartNumbersWithPositions(source.text);
  let cursor = 0;
  const claims: EvidenceClaim[] = [];
  let inherited: InheritedClaim | null = null;

  for (const segment of segments) {
    if (segment.length < 12 || segment.length > 1_200) continue;
    // Segments that contained instruction-like text were rewritten by the
    // injection defence; the remainder of such a sentence is not trustworthy
    // evidence and is skipped.
    if (segment.includes("REDACTED-INSTRUCTION-LIKE-TEXT") || segment.includes("[TAG-REMOVED]")) continue;
    const segmentStart = source.text.indexOf(segment, cursor);
    cursor = segmentStart >= 0 ? segmentStart + segment.length : cursor;
    const nearbyPartNumber =
      segmentStart >= 0
        ? pagePartNumbers.find(
            (entry) => entry.index >= segmentStart - 360 && entry.index <= segmentStart + segment.length + 360,
          )?.value ?? null
        : null;
    // Reads of the previous iteration's context are typed through this local so
    // the loop-carried value is explicit (and never narrowed away by flow analysis).
    const previousInherited = inherited as InheritedClaim | null;

    const normalised = normalizeForMatch(segment);
    const hasQueryDevice = deviceTerms.length > 0;
    const deviceHit = deviceTerms.some((term) => term && normalised.includes(term));
    const partHit = partTerms.some((term) => term && normalised.includes(term));
    const partNumberHit = understanding.partNumber
      ? normalised.includes(normalizeForMatch(understanding.partNumber))
      : false;

    const claimMatch = CLAIM_PATTERNS.flatMap((entry) => (entry.pattern.test(segment) ? [entry] : [])).sort(
      (a, b) => b.weight - a.weight,
    )[0];

    const segmentModels = extractModelsFromSegment(segment);
    const segmentVariants = extractVariantMarkers(segment);

    // The device side of a claim can also be expressed as one of its SKUs.
    const modelFamilyHit =
      deviceCores.length > 0 &&
      segmentModels.some((model) => deviceCores.some((core) => normalizeForMatch(model).includes(core)));

    // For reverse lookups ("which phones use this flex?") the user gives no
    // device, so any device-shaped reference in the page (brand name or an SKU)
    // counts as the device side of the claim.
    const effectiveDeviceHit =
      deviceHit || modelFamilyHit || (!hasQueryDevice && (segmentModels.length > 0 || BRAND_MENTION.test(segment)));

    // Case A — the segment itself carries device + part + claim. When the part
    // is implicit ("Also fits SM-A155F…") the part context of the previous
    // claim-bearing sentence on the same page is used.
    const inheritedPartHit = Boolean(previousInherited?.partRaw);

    // Relevant mention without an explicit claim verb: still recorded (as
    // "unclear") because it carries device/part context for later sentences.
    const relevantMention = effectiveDeviceHit && (partHit || partNumberHit || inheritedPartHit);

    if (relevantMention && (claimMatch || partHit || partNumberHit)) {
      const category = detectCategoryInSegment(segment) ?? previousInherited?.category ?? understanding.partCategory;
      const claimKind: ClaimKind = claimMatch?.kind ?? (deviceHit && partHit ? "unclear" : "spec_only");
      const attributes = extractAttributes(segment);
      const strength = scoreStrength({
        claimKind,
        claimWeight: claimMatch?.weight ?? 0.35,
        hasExactModel: segmentModels.some((model) =>
          understanding.modelNumbers.some((target) => normalizeForMatch(target) === normalizeForMatch(model)),
        ),
        modelCount: segmentModels.length,
        hasPartNumber: /gh\d{2}-|eb-|bn\d{2}[a-z]?|821-/i.test(segment),
        deviceExplicit: effectiveDeviceHit,
        partExplicit: partHit || partNumberHit,
        attributes: Object.keys(attributes).length,
      });

      const devicePhrase = extractDevicePhrase(segment);
      const genericDevicePhrase =
        devicePhrase && !/\d/.test(devicePhrase) && segmentModels.length === 0 ? null : devicePhrase;

      inherited = {
        partRaw: extractPartPhrase(segment, definition.aliases) ?? previousInherited?.partRaw ?? understanding.part,
        category,
        claim: claimKind,
        deviceRaw: genericDevicePhrase,
        modelNumbers: segmentModels,
        variantMarkers: segmentVariants,
      };

      claims.push(
        buildClaim({
          source,
          segment,
          understanding,
          category,
          claimKind,
          strength,
          modelNumbers: segmentModels,
          variantMarkers: segmentVariants,
          attributes,
          deviceRaw: inherited.deviceRaw,
          partRaw: inherited.partRaw,
          nearbyPartNumber,
          method: "deterministic",
        }),
      );
      continue;
    }

    // Case B — a bare model list item ("SM-A155F") inherits the claim context of
    // the preceding sentence. This is how supplier "Compatible models" lists read.
    const isModelList = segmentModels.length > 0 && normalised.replace(/[a-z0-9-]/g, "").length < segment.length * 0.35;
    if (inherited && isModelList && !claimMatch) {
      claims.push(
        buildClaim({
          source,
          segment,
          understanding,
          category: inherited.category,
          claimKind: inherited.claim,
          strength: scoreStrength({
            claimKind: inherited.claim,
            claimWeight: 0.7,
            hasExactModel: true,
            modelCount: segmentModels.length,
            hasPartNumber: false,
            deviceExplicit: true,
            partExplicit: true,
            attributes: 0,
          }),
          modelNumbers: segmentModels,
          variantMarkers: segmentVariants,
          attributes: {},
          deviceRaw: inherited.deviceRaw,
          partRaw: inherited.partRaw,
          nearbyPartNumber,
          method: "deterministic",
        }),
      );
    }
  }

  return claims;
}

function buildClaim(input: {
  source: EvaluatedSource;
  segment: string;
  understanding: QueryUnderstanding;
  category: PartCategory;
  claimKind: ClaimKind;
  strength: number;
  modelNumbers: string[];
  variantMarkers: string[];
  attributes: Record<string, string>;
  deviceRaw: string | null;
  partRaw: string | null;
  /** Part number printed elsewhere on the same page, close to this claim. */
  nearbyPartNumber?: string | null;
  method: "deterministic" | "ai";
}): EvidenceClaim {
  const { source, segment, understanding } = input;
  const deviceCanonical = input.deviceRaw ?? understanding.device ?? input.modelNumbers[0] ?? null;

  return {
    id: stableHash({
      source: source.canonicalUrl,
      device: deviceCanonical,
      part: input.partRaw,
      claim: input.claimKind,
      models: input.modelNumbers,
      text: segment.slice(0, 120),
    }).slice(0, 20),
    sourceId: source.id,
    sourceUrl: source.canonicalUrl,
    sourceTitle: source.title,
    sourceDomain: source.domain,
    deviceRaw: input.deviceRaw,
    deviceCanonical,
    modelNumbers: input.modelNumbers,
    variantMarkers: input.variantMarkers,
    partRaw: input.partRaw ?? understanding.part,
    partCategory: input.category,
    partNumber: extractPartNumber(segment) ?? input.nearbyPartNumber ?? understanding.partNumber ?? null,
    claim: input.claimKind,
    evidenceText: truncate(collapseWhitespace(segment), 320),
    evidenceStrength: strengthToLevel(input.strength),
    strength: Number(input.strength.toFixed(3)),
    extractionMethod: input.method,
    attributes: input.attributes,
  };
}

export function extractModelsFromSegment(segment: string): string[] {
  const slug = segment.replace(/<[^>]+>/g, " ");
  const matches = slug.match(MODEL_TOKEN_PATTERN) ?? [];
  const fromDevices = extractModelNumbers(segment).deviceModels;
  const merged = [...fromDevices, ...matches.map((match) => normalizeIdentifier(match))];
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const value of merged) {
    // Ignore tokens that are clearly not device SKUs.
    if (value.length < 4) continue;
    if (/^(PS|GB|MB|MS|PDF|VID|IMG|HTTP|WWW)\d*$/i.test(value)) continue;
    if (/^M\d{6,}$/.test(value) && !/^M2\d/.test(value)) continue;
    const key = value.replace(/-/g, "");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(value);
  }
  return unique.slice(0, 8);
}

interface PartNumberMatch {
  value: string;
  index: number;
}

/** Every part-number-shaped token on a page, with its position. */
export function findPartNumbersWithPositions(text: string): PartNumberMatch[] {
  const patterns = [
    /\bGH\d{2}-\d{4,6}[A-Z]\b/gi,
    /\bEB-[A-Z0-9-]{4,14}\b/gi,
    /\b(?:BN|BP|BM)\d{1,2}[A-Z0-9]?\b/g,
    /\b821-\d{4,5}-[A-Z0-9]{1,3}\b/gi,
  ];
  const found: PartNumberMatch[] = [];
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.source, pattern.flags);
    let match: RegExpExecArray | null;
    while ((match = regex.exec(text)) !== null) {
      found.push({ value: normalizeIdentifier(match[0]), index: match.index });
      if (found.length > 40) break;
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

function extractPartNumber(segment: string): string | null {
  const patterns = [/\bGH\d{2}-\d{4,6}[A-Z]\b/i, /\bEB-[A-Z0-9-]{4,14}\b/i, /\bBN\d{2}[A-Z]?\b/, /\b821-\d{4,5}-[A-Z0-9]{1,3}\b/i];
  for (const pattern of patterns) {
    const match = segment.match(pattern);
    if (match) return normalizeIdentifier(match[0]);
  }
  return null;
}

function extractAttributes(segment: string): Record<string, string> {
  const attributes: Record<string, string> = {};
  for (const { key, pattern } of ATTRIBUTE_PATTERNS) {
    const match = segment.match(pattern);
    if (match) attributes[key] = collapseWhitespace(match[1] ?? match[0]).slice(0, 60);
  }
  return attributes;
}

/** Claim context carried from one sentence to the next within a page. */
interface InheritedClaim {
  partRaw: string | null;
  category: PartCategory;
  claim: ClaimKind;
  deviceRaw: string | null;
  modelNumbers: string[];
  variantMarkers: string[];
}

function detectCategoryInSegment(segment: string): PartCategory | null {
  const normalised = normalizeForMatch(segment);
  let best: { category: PartCategory; length: number } | null = null;
  for (const definition of Object.values(PART_CATEGORY_DEFINITIONS)) {
    for (const alias of definition.aliases) {
      const needle = normalizeForMatch(alias);
      if (needle.length < 4) continue;
      if (normalised.includes(needle) && (!best || alias.length > best.length)) {
        best = { category: definition.id, length: alias.length };
      }
    }
  }
  return best?.category ?? null;
}

function extractPartPhrase(segment: string, aliases: string[]): string | null {
  const normalised = normalizeForMatch(segment);
  const match = [...aliases].sort((a, b) => b.length - a.length).find((alias) => normalised.includes(normalizeForMatch(alias)));
  return match ?? null;
}

const DEVICE_PHRASE_STOP_WORDS = new Set([
  "models","model","modelnumbers","fits","fit","fitsfor","compatible","compatibility","replacement","for","and",
  "or","the","with","is","are","also","only","works","work","used","use","screen","display","battery","flex",
  "cable","camera","speaker","housing","cover","glass","button","sensor","antenna","charging","port","board",
  "lcd","oled","assembly","part","parts","series","edition",
]);

function extractDevicePhrase(segment: string): string | null {
  const match = segment.match(
    /\b((?:samsung|apple|iphone|galaxy|redmi|xiaomi|poco|huawei|honor|oppo|vivo|oneplus|realme|motorola|moto|nokia|sony|google|pixel|tecno|infinix|itel|tcl|asus|lenovo|nothing)[a-z0-9+.\- ]{0,32})/i,
  );
  if (!match) return null;
  const tokens: string[] = [];
  for (const token of collapseWhitespace(match[1]!).split(" ")) {
    const key = token.toLowerCase().replace(/[^a-z0-9+]/g, "");
    if (tokens.length > 0 && DEVICE_PHRASE_STOP_WORDS.has(key)) break;
    if (tokens.length >= 5) break;
    tokens.push(token);
  }
  return tokens.join(" ").replace(/[,.;:]+$/, "").slice(0, 60) || null;
}

function scoreStrength(input: {
  claimKind: ClaimKind;
  claimWeight: number;
  hasExactModel: boolean;
  modelCount: number;
  hasPartNumber: boolean;
  deviceExplicit: boolean;
  partExplicit: boolean;
  attributes: number;
}): number {
  let score = input.claimWeight * 0.42;
  if (input.hasExactModel) score += 0.22;
  else if (input.modelCount > 0) score += 0.12;
  if (input.hasPartNumber) score += 0.16;
  if (input.deviceExplicit) score += 0.1;
  if (input.partExplicit) score += 0.08;
  if (input.attributes > 0) score += 0.05;
  if (input.claimKind === "spec_only") score *= 0.8;
  if (input.claimKind === "unclear") score *= 0.85;
  return Math.max(0.05, Math.min(1, score));
}

function strengthToLevel(strength: number): EvidenceStrength {
  if (strength >= 0.68) return "high";
  if (strength >= 0.45) return "medium";
  return "low";
}

/* -------------------------------------------------------------------------- */
/* AI extraction validation                                                   */
/* -------------------------------------------------------------------------- */

function validateAiClaim(
  raw: Record<string, unknown>,
  refs: Map<string, EvaluatedSource>,
  understanding: QueryUnderstanding,
): EvidenceClaim | null {
  const ref = typeof raw.sourceRef === "string" ? raw.sourceRef : null;
  if (!ref) return null;
  const source = refs.get(ref);
  if (!source) return null;

  const evidenceText = typeof raw.evidenceText === "string" ? collapseWhitespace(raw.evidenceText) : "";
  if (evidenceText.length < 15) return null;

  // The quote must exist in the page. This is what makes AI extraction safe:
  // a fabricated quote can never survive this check.
  const pageText = collapseWhitespace(source.text);
  if (!pageText.includes(evidenceText.slice(0, Math.min(evidenceText.length, 120)))) return null;

  const claimKind = normaliseClaimKind(raw.claim);
  const rawModels = Array.isArray(raw.modelNumbers) ? raw.modelNumbers.filter((value): value is string => typeof value === "string") : [];
  // Keep only model numbers that literally appear in the quote or page text.
  const modelNumbers = rawModels
    .map((value) => normalizeIdentifier(value))
    .filter((value) => value.length >= 3 && (evidenceText.toUpperCase().includes(value) || pageText.toUpperCase().includes(value)));

  const category =
    typeof raw.partCategory === "string" && raw.partCategory in PART_CATEGORY_DEFINITIONS
      ? (raw.partCategory as PartCategory)
      : understanding.partCategory;

  const attributes: Record<string, string> = {};
  if (raw.attributes && typeof raw.attributes === "object") {
    for (const [key, value] of Object.entries(raw.attributes as Record<string, unknown>)) {
      if (typeof value === "string") attributes[key.slice(0, 40)] = value.slice(0, 60);
    }
  }

  const strength = scoreStrength({
    claimKind,
    claimWeight: claimKind === "compatible" || claimKind === "not_compatible" ? 0.9 : 0.5,
    hasExactModel: modelNumbers.some((model) =>
      understanding.modelNumbers.some((target) => normalizeForMatch(target) === normalizeForMatch(model)),
    ),
    modelCount: modelNumbers.length,
    hasPartNumber: /gh\d{2}-|eb-|bn\d{2}[a-z]?|821-/i.test(evidenceText),
    deviceExplicit: Boolean(raw.deviceRaw),
    partExplicit: Boolean(raw.partRaw),
    attributes: Object.keys(attributes).length,
  });

  const deviceRaw = typeof raw.deviceRaw === "string" ? raw.deviceRaw.slice(0, 120) : null;

  return {
    id: stableHash({ ref, text: evidenceText, claim: claimKind }).slice(0, 20),
    sourceId: source.id,
    sourceUrl: source.canonicalUrl,
    sourceTitle: source.title,
    sourceDomain: source.domain,
    deviceRaw,
    deviceCanonical: typeof raw.deviceCanonical === "string" ? raw.deviceCanonical.slice(0, 120) : deviceRaw ?? understanding.device,
    modelNumbers,
    variantMarkers: Array.isArray(raw.variantMarkers)
      ? raw.variantMarkers.filter((value): value is string => typeof value === "string").slice(0, 6)
      : [],
    partRaw: typeof raw.partRaw === "string" ? raw.partRaw.slice(0, 120) : understanding.part,
    partCategory: category,
    partNumber: typeof raw.partNumber === "string" ? normalizeIdentifier(raw.partNumber).slice(0, 40) : null,
    claim: claimKind,
    evidenceText: truncate(evidenceText, 320),
    evidenceStrength: strengthToLevel(strength),
    strength: Number(strength.toFixed(3)),
    extractionMethod: "ai",
    attributes,
  };
}

function normaliseClaimKind(value: unknown): ClaimKind {
  const lowered = typeof value === "string" ? value.toLowerCase() : "";
  if (lowered.includes("not") || lowered === "incompatible") return "not_compatible";
  if (lowered === "compatible" || lowered === "fits") return "compatible";
  if (lowered === "spec_only" || lowered === "specification") return "spec_only";
  return "unclear";
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Builds a token-efficient digest of a page: segments that mention the device,
 * part or a model number, plus a little surrounding context. Used for the AI pass
 * so we never send 60 KB of navigation boilerplate to a model.
 */
export function buildEvidenceDigest(text: string, understanding: QueryUnderstanding, maxChars: number): string {
  const definition = getPartCategory(understanding.partCategory);
  const terms = [
    understanding.device,
    ...understanding.modelNumbers,
    understanding.part,
    understanding.partNumber,
    ...definition.aliases.slice(0, 8),
  ]
    .filter((term): term is string => Boolean(term))
    .map((term) => normalizeForMatch(term));

  const segments = splitSegments(text);
  const selected: string[] = [];
  const contextWindow = 1;

  segments.forEach((segment, index) => {
    const normalised = normalizeForMatch(segment);
    if (!terms.some((term) => term && normalised.includes(term))) return;
    for (let offset = -contextWindow; offset <= contextWindow; offset += 1) {
      const candidate = segments[index + offset];
      if (candidate && !selected.includes(candidate)) selected.push(candidate);
    }
  });

  const digest = selected.join("\n");
  return truncate(digest.length > 0 ? digest : text, maxChars);
}

export function dedupeClaims(claims: EvidenceClaim[]): EvidenceClaim[] {
  const byKey = new Map<string, EvidenceClaim>();
  for (const claim of claims) {
    const key = [
      claim.sourceDomain,
      claim.claim,
      normalizeForMatch(claim.deviceCanonical ?? ""),
      normalizeForMatch(claim.partRaw ?? ""),
      [...claim.modelNumbers].sort().join(","),
    ].join("|");
    const existing = byKey.get(key);
    if (!existing || claim.strength > existing.strength) byKey.set(key, claim);
  }
  return [...byKey.values()].sort((a, b) => b.strength - a.strength);
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}

/** Snippet helper re-exported for the UI layer. */
export { snippetAround };

export type { ExtractedSource as ExtractedSourceForClaims };
export { buildVariantKey };
