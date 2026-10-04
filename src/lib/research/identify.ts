import type { IdentificationResult, PartCategory } from "@/types/research";
import { getPartCategory } from "@/lib/domain/parts";
import { normalizeIdentifier, extractModelNumbers, extractVariantMarkers } from "@/lib/domain/devices";
import { normalizeForMatch } from "@/lib/text";
import { imageCacheKey } from "@/lib/hash";
import type { AIProvider } from "@/lib/providers/ai/AIProvider";
import { emptyUsageSummary, UsageTracker } from "@/lib/research/usage";
import { persistIdentification } from "@/lib/db/research-repository";

/**
 * Image part identification.
 *
 * A photo of a screen flex, battery label or charging flex is sent to a
 * vision-capable model which extracts printed identifiers (part numbers, model
 * codes, voltage, capacity). The identifier is then researched on the live web —
 * the model reads the part, it never decides compatibility.
 *
 * When no vision provider is configured the endpoint says so plainly instead of
 * pretending to identify the part.
 */

export interface IdentifyInput {
  buffer: Buffer;
  mimeType: string;
  hint?: string | null;
  userId?: string | null;
  ai?: AIProvider | null;
  tracker?: UsageTracker;
}

export async function identifyPartFromImage(input: IdentifyInput): Promise<{
  identification: IdentificationResult;
  imageHash: string;
  researchQuestion: string | null;
  identificationId: string | null;
}> {
  const tracker = input.tracker ?? new UsageTracker();
  const imageHash = imageCacheKey(input.buffer);
  const ai = input.ai ?? null;

  if (!ai || !ai.supportsVision) {
    return {
      imageHash,
      identificationId: null,
      researchQuestion: null,
      identification: {
        identifierType: "unknown",
        identifier: "",
        candidateDevice: null,
        manufacturer: null,
        partCategory: "other",
        parts: [],
        printedText: [],
        confidence: 0,
        notes: [
          "Image identification needs a vision-capable AI provider (set AI_PROVIDER=openai|gemini|anthropic with a key).",
          "You can still search by typing the part number or model number printed on the part.",
        ],
        method: "unavailable",
        usage: emptyUsageSummary(false),
      },
    };
  }

  try {
    const result = await ai.identifyPartImage({
      images: [{ mimeType: input.mimeType, base64: input.buffer.toString("base64") }],
      hint: input.hint ?? null,
    });

    const category = isPartCategory(result.partCategory) ? result.partCategory : "other";
    const identifier = String(result.identifier ?? "").trim().slice(0, 80);

    // Cross-check the model's identifier against the raw strings before we search:
    // the identifier must look like a part/model number or a device phrase.
    const identifiers = extractModelNumbers(identifier);
    const plausible =
      identifiers.partNumbers.length > 0 ||
      identifiers.deviceModels.length > 0 ||
      /^[A-Z0-9][A-Z0-9-]{2,}$/i.test(identifier) ||
      identifier.split(/\s+/).length >= 2;

    const printedText = (result.printedText ?? []).map((value) => String(value).slice(0, 120)).slice(0, 20);
    const notes = [...(result.notes ?? []).map((note) => String(note).slice(0, 240))];

    if (!plausible || identifier.length < 2) {
      notes.push(
        "The printed identifier was not legible enough to research reliably. Please type the part number or retake the photo closer to the label.",
      );
    }

    const identification: IdentificationResult = {
      identifierType: normaliseIdentifierType(result.identifierType),
      identifier,
      candidateDevice: result.candidateDevice ?? null,
      manufacturer: result.manufacturer ?? null,
      partCategory: category,
      parts: (result.parts ?? [])
        .map((part) => ({
          name: String(part.name ?? "").slice(0, 80),
          partNumber: part.partNumber ? normalizeIdentifier(String(part.partNumber)).slice(0, 40) : null,
          label: String(part.label ?? "").slice(0, 80),
          value: String(part.value ?? "").slice(0, 120),
        }))
        .slice(0, 12),
      printedText,
      confidence: Math.max(0, Math.min(1, Number(result.confidence) || 0)),
      notes,
      method: "vision",
      usage: tracker.toSummary({ cached: false }),
    };

    const researchQuestion =
      plausible && identifier.length >= 2
        ? buildResearchQuestion(identification, identifiers.partNumbers[0] ?? null)
        : null;

    const identificationId = await persistIdentification({
      userId: input.userId ?? null,
      identifierType: identification.identifierType,
      identifier: identification.identifier,
      device: identification.candidateDevice,
      manufacturer: identification.manufacturer,
      partCategory: identification.partCategory,
      imageHash,
      imageMimeType: input.mimeType,
      confidence: identification.confidence,
      method: "vision",
      result: identification as unknown as Record<string, unknown>,
      tracker,
    });

    return { identification, imageHash, researchQuestion, identificationId };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      imageHash,
      identificationId: null,
      researchQuestion: null,
      identification: {
        identifierType: "unknown",
        identifier: "",
        candidateDevice: null,
        manufacturer: null,
        partCategory: "other",
        parts: [],
        printedText: [],
        confidence: 0,
        notes: [
          "The vision provider could not read this photo. Retake it with the printed label in focus and good lighting, or type the identifier manually.",
          message.slice(0, 200),
        ],
        method: "vision",
        usage: tracker.toSummary({ cached: false }),
      },
    };
  }
}

function buildResearchQuestion(identification: IdentificationResult, partNumber: string | null): string {
  const label = getPartCategory(identification.partCategory).label.toLowerCase();
  const identifier = partNumber ?? identification.identifier;
  if (identification.identifierType === "model_number" || identification.identifierType === "device") {
    return `What ${label} fits ${identification.identifier}?`;
  }
  return `Which phones use this ${label} ${identifier}${identification.candidateDevice ? ` (looks like ${identification.candidateDevice})` : ""}?`;
}

function normaliseIdentifierType(value: string): IdentificationResult["identifierType"] {
  const lowered = normalizeForMatch(value ?? "");
  if (lowered.includes("part")) return "part_number";
  if (lowered.includes("model")) return "model_number";
  if (lowered.includes("device") || lowered.includes("phone")) return "device";
  return "unknown";
}

function isPartCategory(value: string): value is PartCategory {
  return typeof value === "string" && normalizeForMatch(value).length > 0 && value in PART_CATEGORY_TABLE;
}

import { PART_CATEGORY_DEFINITIONS as PART_CATEGORY_TABLE } from "@/lib/domain/parts";

/** Extracts a suggested search query when the user corrects the identifier. */
export function buildOverrideQuestion(identifier: string, hint?: string | null): string {
  const cleaned = identifier.trim().slice(0, 80);
  const category = hint ? hint.slice(0, 60) : "";
  return `Which phones are compatible with ${category ? `${category} ` : ""}${cleaned}?`;
}

export { extractVariantMarkers };
