import type { ConflictRecord, EvaluatedSource, NormalizedClaim, VariantRisk } from "@/types/research";
import type { EvidenceClaim } from "@/types/research";
import {
  GENERATION_MARKERS,
  buildFamilyBaseKey,
  buildFamilyKey,
  extractDeviceMention,
  inferBrandFromModelNumbers,
  normalizeIdentifier,
} from "@/lib/domain/devices";
import { canonicalizePartTerm } from "@/lib/domain/part-match";
import { normalizeForMatch } from "@/lib/text";
import type { QueryUnderstanding } from "@/lib/research/query-understanding";

/**
 * Stage 7 — claim normalisation and comparison.
 *
 * Websites describe the same part in a dozen different ways. Normalisation groups
 * claims so they can be compared, while keeping the distinctions that matter:
 *
 *   family base key   "samsung galaxy a15"           → same chassis family
 *   variant key       "samsung galaxy a15|4g"        → same radio/region config
 *   model number      "SM-A155F"                     → exact SKU
 *
 * Crucially, similar names do NOT imply interchangeability: two claims only merge
 * when their variant keys (or model numbers) agree, and cross-variant evidence is
 * tracked separately so the engine can flag "this evidence is about the 5G model".
 */

export interface ClaimCluster {
  key: string;
  familyKey: string | null;
  familyBaseKey: string | null;
  variantKey: string | null;
  deviceLabel: string;
  modelNumbers: string[];
  variantMarkers: string[];
  supporting: NormalizedClaim[];
  opposing: NormalizedClaim[];
  unclear: NormalizedClaim[];
  specOnly: NormalizedClaim[];
  independentDomains: number;
  totalDomains: number;
  averageSourceQuality: number;
  maxStrength: number;
  /** True when at least one claim names the exact requested part number. */
  partNumberMatched: boolean;
}

/**
 * Builds the three target keys for the requested device using exactly the same
 * normalisation the claims go through. Both sides must agree, so this lives in
 * one place and is used by the compatibility engine too.
 */
export function targetKeysFor(
  device: string | null,
  brand: string | null,
  markers: string[],
): { familyKey: string; baseKey: string; variantKey: string } | null {
  if (!device) return null;
  const familyKey = buildFamilyKey(device, brand);
  const baseKey = buildFamilyBaseKey(familyKey);
  const generations = markers.filter((marker) => GENERATION_MARKERS.includes(marker)).sort();
  return { familyKey, baseKey, variantKey: `${baseKey}|${generations.join(",")}` };
}

export interface NormalizationResult {
  claims: NormalizedClaim[];
  clusters: ClaimCluster[];
  conflicts: ConflictRecord[];
  variantRisks: VariantRisk[];
  /** Clusters that describe the requested device (or requested part) directly. */
  targetClusters: ClaimCluster[];
  /** Clusters for sibling variants of the requested device. */
  siblingClusters: ClaimCluster[];
}

export function normalizeClaims(
  claims: EvidenceClaim[],
  sources: EvaluatedSource[],
  understanding: QueryUnderstanding,
): NormalizationResult {
  const qualityBySource = new Map(sources.map((source) => [source.id, source.quality.total]));
  const target = targetKeysFor(understanding.device, understanding.deviceBrand, understanding.variantMarkers);
  const targetFamilyKey = target?.familyKey ?? null;
  const targetBaseKey = target?.baseKey ?? null;

  const normalized: NormalizedClaim[] = claims.map((claim) => {
    const mention = claim.deviceRaw ? extractDeviceMention(claim.deviceRaw) : null;
    const label = claim.deviceRaw ?? claim.deviceCanonical;
    // When the page omits the brand ("A15 4G"), recover it from the SKU shapes
    // quoted alongside so the claim lands in the right family.
    const inferredBrand = inferBrandFromModelNumbers(claim.modelNumbers);
    const familyKey =
      mention?.familyKey ??
      (label ? buildFamilyKey(label, inferredBrand?.id ?? null) : null);
    const variantMarkers = unique([...(mention?.variantMarkers ?? []), ...claim.variantMarkers]);
    const part = canonicalizePartTerm(claim.partRaw ?? claim.partCategory ?? "");

    return {
      ...claim,
      partCanonical: part.canonical,
      deviceFamilyKey: familyKey,
      variantKey: familyKey ? buildVariantKeyLocal(familyKey, variantMarkers) : null,
      variantMarkers,
      sourceQuality: qualityBySource.get(claim.sourceId) ?? 0.4,
    } satisfies NormalizedClaim & { sourceQuality: number } as unknown as NormalizedClaim;
  });

  const clusters = buildClusters(normalized, understanding, qualityBySource);
  const conflicts = detectConflicts(clusters);
  const variantRisks = detectVariantRisks(clusters, targetBaseKey, targetFamilyKey, understanding);

  const isReverse = understanding.intent === "part_to_phones";
  const targetClusters = clusters.filter((cluster) => {
    if (isReverse) return true; // every device that references the part is a result
    if (!targetBaseKey) return cluster.familyBaseKey !== null;
    return cluster.familyBaseKey === targetBaseKey;
  });
  const siblingClusters = clusters.filter(
    (cluster) => !targetClusters.includes(cluster) && cluster.familyBaseKey && targetBaseKey && shareBase(cluster.familyBaseKey, targetBaseKey),
  );

  return { claims: normalized, clusters, conflicts, variantRisks, targetClusters, siblingClusters };
}

function shareBase(a: string, b: string): boolean {
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Cluster key: family base + physical generation only.
 *
 * Region, SIM layout and chipset wording describe the same physical phone and
 * must NOT split a cluster (a "SM-A155F/DS" listing is still the A15 4G), while
 * 4G and 5G stay strictly separate because they use different parts.
 */
function buildVariantKeyLocal(familyKey: string, variantMarkers: string[]): string {
  const generations = variantMarkers.filter((marker) => GENERATION_MARKERS.includes(marker)).sort();
  return `${buildFamilyBaseKey(familyKey)}|${generations.join(",")}`;
}

function buildClusters(
  claims: NormalizedClaim[],
  understanding: QueryUnderstanding,
  qualityBySource: Map<string, number>,
): ClaimCluster[] {
  const byKey = new Map<string, NormalizedClaim[]>();

  for (const claim of claims) {
    // Claims about a device cluster by variant; claims without any device
    // (pure spec statements) cluster under the research target itself.
    const key = claim.variantKey ?? claim.deviceFamilyKey ?? `target|${understanding.partCategory}`;
    const list = byKey.get(key) ?? [];
    list.push(claim);
    byKey.set(key, list);
  }

  const clusters: ClaimCluster[] = [];
  for (const [key, list] of byKey) {
    const first = list[0]!;
    const modelNumbers = unique(list.flatMap((claim) => claim.modelNumbers));
    const variantMarkers = unique(list.flatMap((claim) => claim.variantMarkers));
    const domains = new Set(list.map((claim) => claim.sourceDomain));
    const qualityValues = list.map((claim) => qualityBySource.get(claim.sourceId) ?? 0.4);

    clusters.push({
      key,
      familyKey: first.deviceFamilyKey,
      familyBaseKey: first.deviceFamilyKey ? buildFamilyBaseKey(first.deviceFamilyKey) : null,
      variantKey: first.variantKey,
      deviceLabel: labelFor(first, modelNumbers),
      modelNumbers,
      variantMarkers,
      supporting: list.filter((claim) => claim.claim === "compatible"),
      opposing: list.filter((claim) => claim.claim === "not_compatible"),
      unclear: list.filter((claim) => claim.claim === "unclear"),
      specOnly: list.filter((claim) => claim.claim === "spec_only"),
      independentDomains: domains.size,
      totalDomains: domains.size,
      averageSourceQuality: qualityValues.length ? average(qualityValues) : 0,
      maxStrength: Math.max(...list.map((claim) => claim.strength), 0),
      partNumberMatched: list.some(
        (claim) =>
          claim.partNumber &&
          understanding.partNumber &&
          normalizeIdentifier(claim.partNumber) === normalizeIdentifier(understanding.partNumber),
      ),
    });
  }

  return clusters.sort((a, b) => b.averageSourceQuality * b.independentDomains - a.averageSourceQuality * a.independentDomains);
}

function labelFor(claim: NormalizedClaim, modelNumbers: string[]): string {
  if (claim.deviceCanonical) return claim.deviceCanonical;
  if (claim.deviceRaw) return claim.deviceRaw;
  if (modelNumbers[0]) return modelNumbers[0];
  return "Unspecified device";
}

/**
 * A conflict exists when independent sources make *directly opposing* statements
 * about the same variant. Where the disagreement is better explained by a variant
 * difference, it is reported as a variant risk instead of a flat conflict.
 */
export function detectConflicts(clusters: ClaimCluster[]): ConflictRecord[] {
  const conflicts: ConflictRecord[] = [];

  for (const cluster of clusters) {
    if (cluster.supporting.length === 0 || cluster.opposing.length === 0) continue;

    const supportingDomains = unique(cluster.supporting.map((claim) => claim.sourceDomain));
    const opposingDomains = unique(cluster.opposing.map((claim) => claim.sourceDomain));

    conflicts.push({
      topic: `${cluster.deviceLabel} — ${cluster.supporting[0]?.partCanonical ?? cluster.supporting[0]?.partCategory ?? "part"}`,
      supporting: cluster.supporting.slice(0, 4).map(toConflictItem),
      opposing: cluster.opposing.slice(0, 4).map(toConflictItem),
      explanation: `${supportingDomains.length} source(s) state the part is compatible while ${opposingDomains.length} state it is not.`,
      possibleExplanations: conflictingExplanations(cluster),
    });
  }

  return conflicts;
}

function toConflictItem(claim: NormalizedClaim) {
  return {
    claimId: claim.id,
    domain: claim.sourceDomain,
    url: claim.sourceUrl,
    text: claim.evidenceText,
  };
}

function conflictingExplanations(cluster: ClaimCluster): string[] {
  const explanations = [
    "Sources may refer to different regional variants or hardware revisions of the same model.",
    "One source may sell a different assembly (frame-less vs with frame, aftermarket vs OEM) under the same name.",
  ];
  if (cluster.modelNumbers.length > 1) {
    explanations.push(`Different model numbers are in play: ${cluster.modelNumbers.join(", ")}.`);
  }
  if (cluster.variantMarkers.length > 0) {
    explanations.push(`Variant wording differs between sources (${cluster.variantMarkers.join(", ")}).`);
  }
  return explanations;
}

/**
 * Cross-variant risk: the requested device is the 4G model but the strongest
 * evidence is about the 5G model (or vice versa).
 */
function detectVariantRisks(
  clusters: ClaimCluster[],
  targetBaseKey: string | null,
  targetFamilyKey: string | null,
  understanding: QueryUnderstanding,
): VariantRisk[] {
  if (!targetBaseKey) return [];

  const targetGeneration = understanding.variantMarkers.filter((marker) => GENERATION_MARKERS.includes(marker));

  return clusters
    .filter((cluster) => cluster.familyBaseKey && shareBase(cluster.familyBaseKey, targetBaseKey))
    // Only clusters that declare a *different* generation than the request are
    // reported as sibling-variant risks; unnamed variants are handled by the
    // cluster matching itself, not treated as a risk.
    .filter((cluster) => {
      const clusterGeneration = cluster.variantMarkers.filter((marker) => GENERATION_MARKERS.includes(marker));
      if (clusterGeneration.length === 0 || targetGeneration.length === 0) return false;
      return !clusterGeneration.some((marker) => targetGeneration.includes(marker));
    })
    .map((cluster) => {
      const clusterGeneration = cluster.variantMarkers.find((marker) => GENERATION_MARKERS.includes(marker));
      const targetGenerationLabel = targetGeneration[0]?.toUpperCase() ?? "requested variant";
      return {
        requestedVariant: targetGenerationLabel,
        evidenceVariant: clusterGeneration?.toUpperCase() ?? "unspecified variant",
        deviceLabel: cluster.deviceLabel,
        modelNumbers: cluster.modelNumbers,
        claimIds: [...cluster.supporting, ...cluster.opposing].map((claim) => claim.id),
        message: `PartScout also found evidence about “${cluster.deviceLabel}” (${clusterGeneration?.toUpperCase() ?? "different variant"}). Sibling variants frequently use physically different parts, so that evidence is reported separately from the requested ${targetGenerationLabel} variant.`,
      } satisfies VariantRisk;
    })
    .slice(0, 3);
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function average(values: number[]): number {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/** Exposed for the UI/debug views: how a raw device string was interpreted. */
export function explainDeviceNormalization(text: string) {
  const mention = extractDeviceMention(text);
  return {
    normalized: normalizeForMatch(text),
    family: mention?.family ?? null,
    familyKey: mention?.familyKey ?? null,
    familyBaseKey: mention?.familyKey ? buildFamilyBaseKey(mention.familyKey) : null,
    variantMarkers: mention?.variantMarkers ?? [],
  };
}
