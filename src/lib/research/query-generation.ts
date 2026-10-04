import type { ResearchQueryPlan } from "@/types/research";
import { limits } from "@/lib/config";
import { getPartCategory } from "@/lib/domain/parts";
import { variantLabel } from "@/lib/domain/devices";
import { normalizeForMatch } from "@/lib/text";
import type { QueryUnderstanding } from "@/lib/research/query-understanding";
import type { AIProvider } from "@/lib/providers/ai/AIProvider";
import { collapseWhitespace } from "@/lib/text";

/**
 * Stage 2 — search query generation.
 *
 * PartScout never runs a single search. Each research run generates several
 * targeted queries covering different facets (exact model number, part number,
 * supplier catalogues, technical documentation, technician forums) because
 * compatibility evidence is scattered across all of them.
 *
 * Queries are generated deterministically (so behaviour is reproducible and free)
 * with an optional AI pass that may propose up to two additional queries. Those
 * extra queries are only accepted when they reference a device/model/part term we
 * already extracted — the model cannot redirect research to unrelated topics.
 */

export interface QueryGenerationOptions {
  ai?: AIProvider | null;
  maxQueries?: number;
  logger?: { warn: (message: string, meta?: unknown) => void };
}

export function generateDeterministicQueries(
  understanding: QueryUnderstanding,
  maxQueries = limits.maxQueriesPerResearch,
): ResearchQueryPlan[] {
  const definition = getPartCategory(understanding.partCategory);
  const partLabel = definition.label.toLowerCase();
  const device = understanding.device?.trim() || null;
  const primaryModel = understanding.modelNumbers[0] ?? null;
  const partNumber = understanding.partNumber;
  const variantText = understanding.variantMarkers.map(variantLabel).join(" ");
  const deviceWithVariant = [device, variantText].filter(Boolean).join(" ").trim() || null;

  const queries: ResearchQueryPlan[] = [];
  const push = (query: string | null, purpose: string, kind: ResearchQueryPlan["kind"]) => {
    if (!query) return;
    const cleaned = collapseWhitespace(query).replace(/\s{2,}/g, " ").trim();
    if (cleaned.length < 6) return;
    queries.push({ query: cleaned, purpose, kind });
  };

  if (understanding.intent === "identify" && !device) {
    const identifier = partNumber ?? understanding.rawQuery;
    push(`"${identifier}" compatible phones`, "Find which devices reference this identifier", "part_number");
    push(`"${identifier}" replacement ${partLabel}`, "Identify the part type and fitment", "part_number");
    push(`"${identifier}" ${definition.searchAngles[0] ?? "compatible models"}`, "Supplier listings for this identifier", "part_number");
    push(`"${identifier}" specifications`, "Technical specifications and attributes", "spec");
    return dedupe(queries).slice(0, maxQueries);
  }

  if (understanding.intent === "part_to_phones") {
    const partPhrase = [understanding.part ?? partLabel, partNumber].filter(Boolean).join(" ");
    push(`${partPhrase} compatible phones`, "Reverse lookup — which phones take this part", "part_to_phone");
    push(`${partPhrase} compatible models list`, "Supplier fitment lists", "part_to_phone");
    if (partNumber) push(`"${partNumber}" compatible devices`, "Exact part-number fitment", "part_number");
    if (partNumber) push(`"${partNumber}" replacement ${partLabel}`, "Part-number catalogue entries", "part_number");
    push(`which phones use ${partPhrase}`, "Technician discussion of fitment", "forum");
    push(`${partPhrase} cross reference`, "Cross-reference tables", "part_to_phone");
  } else {
    // phone_to_parts + compatibility_check share the same facet strategy.
    push(`${deviceWithVariant ?? device} ${partLabel} compatibility`, "Primary compatibility statement", "device_part_compat");
    push(`${deviceWithVariant ?? device} ${definition.searchAngles[0] ?? `${partLabel} replacement`}`, "Supplier catalogue fitment", "device_part_compat");
    if (primaryModel) push(`"${primaryModel}" ${partLabel} compatible`, "Exact SKU fitment via model number", "model_number");
    if (primaryModel) push(`${primaryModel} ${definition.searchAngles[1] ?? `${partLabel} replacement`}`, "Exact SKU replacement part", "model_number");
    if (partNumber) push(`"${partNumber}" compatible models`, "Part-number fitment matrix", "part_number");
    push(`${device ?? deviceWithVariant} ${partLabel} compatible models list`, "Multi-model fitment lists", "device_part_compat");
    if (understanding.modelNumbers[1]) {
      push(`"${understanding.modelNumbers[1]}" ${partLabel} replacement`, "Regional SKU cross-check", "model_number");
    }
    push(`${deviceWithVariant ?? device} ${partLabel} forum technician`, "Field reports from repair technicians", "forum");
    push(`${device ?? ""} ${partLabel} part number OEM`.trim(), "OEM part number lookup", "spec");
  }

  return dedupe(queries).slice(0, maxQueries);
}

function dedupe(queries: ResearchQueryPlan[]): ResearchQueryPlan[] {
  const seen = new Set<string>();
  const out: ResearchQueryPlan[] = [];
  for (const entry of queries) {
    const key = normalizeForMatch(entry.query);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(entry);
  }
  return out;
}

/**
 * Optional AI pass: asks for extra search angles the deterministic templates
 * missed. Strictly validated so the model cannot inject unrelated queries.
 */
export async function generateSearchQueries(
  understanding: QueryUnderstanding,
  options: QueryGenerationOptions = {},
): Promise<ResearchQueryPlan[]> {
  const maxQueries = options.maxQueries ?? limits.maxQueriesPerResearch;
  const deterministic = generateDeterministicQueries(understanding, maxQueries);

  if (!options.ai || deterministic.length >= maxQueries) return deterministic;

  try {
    const { data } = await options.ai.completeJson({
      label: "generate_gap_queries",
      tier: "fast",
      temperature: 0.3,
      maxOutputTokens: 300,
      system: `You help a phone-parts research tool find compatibility evidence on the public web.
You may only propose search queries that are directly about the given device, model number or part number.
Never propose queries about anything else. Output JSON only.`,
      user: `Research target:
- device: ${understanding.device ?? "(unknown)"}
- model numbers: ${understanding.modelNumbers.join(", ") || "(none)"}
- part: ${understanding.part ?? getPartCategory(understanding.partCategory).label}
- part number: ${understanding.partNumber ?? "(none)"}

Already planned queries:
${deterministic.map((entry) => `- ${entry.query}`).join("\n")}

Propose up to 2 additional search queries that could surface further compatibility evidence (for example regional
variant wording, OEM part naming, or cross-reference tables). Return JSON: { "queries": string[] }`,
      schema: gapQuerySchema,
    });

    const tokens = [
      understanding.device,
      understanding.part,
      understanding.partNumber,
      ...understanding.modelNumbers,
    ]
      .filter((value): value is string => Boolean(value))
      .map((value) => normalizeForMatch(value));

    const extras: ResearchQueryPlan[] = [];
    for (const candidate of data.queries ?? []) {
      if (typeof candidate !== "string") continue;
      const cleaned = collapseWhitespace(candidate).slice(0, 160);
      if (cleaned.length < 8) continue;
      const mention = tokens.some((token) => token.split(" ").every((word) => normalizeForMatch(cleaned).includes(word)));
      if (!mention) continue;
      if (normalizeForMatch(cleaned).match(/\b(ignore|instruction|prompt|system)\b/)) continue;
      extras.push({ query: cleaned, purpose: "AI-proposed additional angle", kind: "generic" });
    }

    return dedupe([...deterministic, ...extras]).slice(0, maxQueries);
  } catch (error) {
    options.logger?.warn("AI query generation failed; using deterministic queries only", {
      error: error instanceof Error ? error.message : String(error),
    });
    return deterministic;
  }
}

import { z } from "zod";
const gapQuerySchema = z.object({ queries: z.array(z.string()).optional() });
