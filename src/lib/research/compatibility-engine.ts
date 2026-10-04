import type {
  CheckStatus,
  CompatibleModelFinding,
  CompatiblePartFinding,
  CompatibilityCheck,
  ConflictRecord,
  EvaluatedSource,
  NormalizedClaim,
  PartCategory,
  VariantRisk,
  Verdict,
} from "@/types/research";
import { getPartCategory, type ChecklistItem } from "@/lib/domain/parts";
import { buildFamilyBaseKey, deviceCoreTokens, normalizeIdentifier, variantLabel } from "@/lib/domain/devices";
import { normalizeForMatch } from "@/lib/text";
import { type ClaimCluster, targetKeysFor } from "@/lib/research/claim-normalization";
import type { QueryUnderstanding } from "@/lib/research/query-understanding";

/**
 * Stage 8 — the compatibility engine.
 *
 * This is where PartScout decides. It never uses one simplistic rule (the classic
 * "same phone size = compatible"); for every part category it walks through the
 * checklist that actually determines interchangeability (connector, board
 * revision, frame, voltage, cutouts, …) and marks each dimension as
 * supported / contradicted / conflicting / unknown based on the retrieved
 * evidence only.
 *
 * Every branch below is designed to fail conservative: missing evidence produces
 * "unknown" and a lower verdict, never an optimistic guess.
 */

export interface CompatibilityAnalysisInput {
  understanding: QueryUnderstanding;
  sources: EvaluatedSource[];
  claims: NormalizedClaim[];
  clusters: ClaimCluster[];
  conflicts: ConflictRecord[];
  variantRisks: VariantRisk[];
}

export interface CompatibilityAnalysis {
  verdict: Verdict;
  checks: CompatibilityCheck[];
  compatibleModels: CompatibleModelFinding[];
  incompatibleModels: CompatibleModelFinding[];
  compatibleParts: CompatiblePartFinding[];
  supportingClaims: NormalizedClaim[];
  opposingClaims: NormalizedClaim[];
  warnings: string[];
  /** True when evidence speaks about the exact requested device/variant. */
  exactTargetEvidence: boolean;
}

const ATTRIBUTE_TO_CHECK: Record<string, string[]> = {
  connector: ["connector", "charging_port", "connector_type"],
  pin_count: ["connector", "charging_port"],
  revision: ["board_design", "display_revision", "battery_revision", "revision"],
  voltage: ["voltage"],
  capacity: ["capacity"],
  dimensions: ["dimensions", "device_dimensions"],
  size: ["size"],
  resolution: ["resolution"],
  panel: ["panel_technology"],
  frame: ["frame"],
  megapixels: ["sensor"],
};

export function analyzeCompatibility(input: CompatibilityAnalysisInput): CompatibilityAnalysis {
  const { understanding, claims, clusters, conflicts, variantRisks } = input;
  const definition = getPartCategory(understanding.partCategory);
  const warnings: string[] = [];

  const target = targetKeysFor(understanding.device, understanding.deviceBrand, understanding.variantMarkers);
  const targetVariantKey = target?.variantKey ?? null;
  const targetBaseKey = target?.baseKey ?? null;

  // ------------------------------------------------------------------ claims
  const relevantClaims = claims.filter((claim) => isClaimAboutTarget(claim, understanding, targetBaseKey));

  // Without a requested device (reverse lookup) there is no variant to compare
  // against: every relevant claim is treated as on-target.
  const exactClaims = understanding.device
    ? relevantClaims.filter((claim) => isExactVariant(claim, targetVariantKey, understanding))
    : relevantClaims;
  const siblingClaims = understanding.device
    ? relevantClaims.filter((claim) => !exactClaims.includes(claim))
    : [];

  const supportingClaims = exactClaims.filter((claim) => claim.claim === "compatible");
  const opposingClaims = exactClaims.filter((claim) => claim.claim === "not_compatible");
  const siblingSupport = siblingClaims.filter((claim) => claim.claim === "compatible");
  const siblingOppose = siblingClaims.filter((claim) => claim.claim === "not_compatible");

  // ------------------------------------------------------------------ models
  const compatibleModels = buildModelFindings(clusters, "support", understanding, exactClaims, siblingClaims);
  const incompatibleModels = buildModelFindings(clusters, "oppose", understanding, exactClaims, siblingClaims);

  // ------------------------------------------------------------------ parts
  const compatibleParts = buildPartFindings(relevantClaims, understanding);

  // ------------------------------------------------------------------ checks
  const checks = runChecklist({
    checklist: definition.checklist,
    claims: exactClaims.length > 0 ? exactClaims : [...siblingClaims],
    allClaims: relevantClaims,
    understanding,
    sources: input.sources,
  });

  // ------------------------------------------------------------------ verdict
  const supportStrength = totalStrength(supportingClaims);
  const opposeStrength = totalStrength(opposingClaims);

  const supportDomains = uniqueDomains(supportingClaims);
  const opposeDomains = uniqueDomains(opposingClaims);
  const maxSupportStrength = maxOf(supportingClaims.map((claim) => claim.strength));
  const maxOpposeStrength = maxOf(opposingClaims.map((claim) => claim.strength));
  const avgSupportQuality = averageOf(supportingClaims.map((claim) => claim.sourceQuality ?? 0.4));

  const isReverse = understanding.intent === "part_to_phones";
  const hasAnyEvidence = relevantClaims.length > 0;
  const exactTargetEvidence = exactClaims.length > 0;

  let verdict: Verdict;

  if (isReverse) {
    // Part → phones: the question is "which devices does this part fit".
    const deviceClusters = clusters.filter((cluster) => cluster.supporting.length > 0);
    const deviceDomains = new Set(deviceClusters.flatMap((cluster) => cluster.supporting.map((claim) => claim.sourceDomain)));
    if (deviceClusters.length === 0) verdict = hasAnyEvidence ? "uncertain" : "insufficient_evidence";
    else if (deviceDomains.size >= 2) verdict = "compatible";
    else verdict = "likely_compatible";
  } else if (!hasAnyEvidence) {
    verdict = "insufficient_evidence";
  } else if (opposeStrength > supportStrength * 1.15 && opposeDomains.size >= 2 && maxOpposeStrength >= 0.55 && !exactTargetEvidence) {
    verdict = "insufficient_evidence";
  } else if (opposeStrength > supportStrength * 1.15 && opposeDomains.size >= 1 && maxOpposeStrength >= 0.55 && supportDomains.size === 0) {
    verdict = "not_compatible";
  } else if (opposingClaims.length > 0 && supportingClaims.length > 0) {
    verdict = "uncertain";
    warnings.push(
      "Sources disagree about this specific device/part combination. Both sides are shown in the conflict section.",
    );
  } else if (supportingClaims.length === 0 && opposingClaims.length > 0) {
    verdict = maxOpposeStrength >= 0.55 ? "not_compatible" : "uncertain";
  } else if (supportingClaims.length === 0 && siblingSupport.length > 0) {
    verdict = "uncertain";
    warnings.push(
      "Compatibility evidence was found for a sibling variant of this device, not for the exact model requested.",
    );
  } else if (supportingClaims.length === 0) {
    verdict = relevantClaims.some((claim) => claim.claim === "unclear" || claim.claim === "spec_only")
      ? "uncertain"
      : "insufficient_evidence";
  } else if (supportDomains.size >= 3 && avgSupportQuality >= 0.6 && maxSupportStrength >= 0.6) {
    verdict = "compatible";
  } else if (supportDomains.size >= 2 && avgSupportQuality >= 0.5) {
    verdict = "likely_compatible";
  } else if (maxSupportStrength >= 0.6) {
    verdict = "likely_compatible";
  } else {
    verdict = "uncertain";
  }

  // A sibling-variant mismatch can never yield better than "uncertain".
  if (understanding.device && !exactTargetEvidence && verdict === "compatible" && siblingOppose.length > 0) {
    verdict = "uncertain";
  }

  // ------------------------------------------------------------------ warnings
  if (siblingClaims.length > 0 && siblingSupport.length + siblingOppose.length > 0) {
    const variants = [...new Set(siblingClaims.flatMap((claim) => claim.variantMarkers.map(variantLabel)))];
    if (variants.length > 0) {
      warnings.push(
        `Some evidence concerns sibling variant(s) ${variants.join(", ")}. Sibling variants often use physically different parts and are reported separately.`,
      );
    }
  }
  if (conflicts.length > 0) {
    warnings.push(`${conflicts.length} conflicting evidence group(s) detected — see the conflicting evidence section.`);
  }
  if (variantRisks.length > 0) {
    warnings.push(...variantRisks.map((risk) => risk.message));
  }
  const snippetOnly = supportingClaims.filter((claim) => {
    const source = input.sources.find((candidate) => candidate.id === claim.sourceId);
    return source && !source.fetched && !source.usedProviderContent;
  });
  if (snippetOnly.length > 0 && supportingClaims.length > 0) {
    warnings.push(
      `${snippetOnly.length} supporting claim(s) come from search snippets only — the underlying page could not be retrieved.`,
    );
  }
  const injectionSources = input.sources.filter((source) => (source.injectionFindings ?? 0) > 0);
  if (injectionSources.length > 0) {
    warnings.push(
      `${injectionSources.length} source(s) contained instruction-like text that was neutralised and never treated as instructions.`,
    );
  }

  return {
    verdict,
    checks,
    compatibleModels,
    incompatibleModels,
    compatibleParts,
    supportingClaims: exactClaims.length > 0 ? supportingClaims : siblingSupport,
    opposingClaims: exactClaims.length > 0 ? opposingClaims : siblingOppose,
    warnings: dedupeStrings(warnings),
    exactTargetEvidence,
  };
}

/* -------------------------------------------------------------------------- */
/* Matching                                                                   */
/* -------------------------------------------------------------------------- */

function isClaimAboutTarget(claim: NormalizedClaim, understanding: QueryUnderstanding, targetBaseKey: string | null): boolean {
  if (understanding.intent === "part_to_phones") {
    // Reverse lookup: the claim must be about the requested part.
    const partNumbers = understanding.partNumber
      ? claim.partNumber && normalizeIdentifier(claim.partNumber) === normalizeIdentifier(understanding.partNumber)
      : false;
    const categoryMatch = claim.partCategory === understanding.partCategory;
    const partTextMatch = understanding.part
      ? normalizeForMatch(claim.partRaw ?? "").includes(normalizeForMatch(understanding.part))
      : false;
    return partNumbers || categoryMatch || partTextMatch;
  }

  if (!targetBaseKey) return claim.partCategory === understanding.partCategory;
  return isSameFamily(claim, understanding, targetBaseKey);
}

/**
 * Lenient "is this claim about the requested device family" test. Pages phrase
 * the same device in many ways ("Samsung Galaxy A15", "Galaxy A15", "A15",
 * "SM-A155F"), so we accept a shared family base, an exact SKU, or the device's
 * model core appearing inside the quoted SKUs. Generation markers are still
 * enforced separately by `isExactVariant`.
 */
function isSameFamily(claim: NormalizedClaim, understanding: QueryUnderstanding, targetBaseKey: string): boolean {
  const claimBase = claim.deviceFamilyKey ? buildFamilyBaseKey(claim.deviceFamilyKey) : null;
  const baseMatch =
    Boolean(claimBase) &&
    (claimBase === targetBaseKey || claimBase!.includes(targetBaseKey) || targetBaseKey.includes(claimBase!));
  if (baseMatch) return true;

  // Exact SKU matches always count, even if the family name was phrased oddly.
  const modelMatch = understanding.modelNumbers.some((model) =>
    claim.modelNumbers.some((candidate) => normalizeIdentifier(candidate) === normalizeIdentifier(model)),
  );
  if (modelMatch) return true;

  const cores = deviceCoreTokens(understanding.device);
  return (
    cores.length > 0 &&
    claim.modelNumbers.some((candidate) => cores.some((core) => normalizeForMatch(candidate).includes(core)))
  );
}

/**
 * Decides whether a claim describes the *same device configuration* the user
 * asked about. Matching is driven by the physical generation (4G/5G) and the
 * family base; region, SIM configuration and chipset wording are informational
 * (a "SM-A155F/DS" listing is still the same 4G phone).
 */
function isExactVariant(claim: NormalizedClaim, targetVariantKey: string | null, understanding: QueryUnderstanding): boolean {
  const modelMatch = understanding.modelNumbers.some((model) =>
    claim.modelNumbers.some((candidate) => normalizeIdentifier(candidate) === normalizeIdentifier(model)),
  );
  if (modelMatch) return true;

  if (!targetVariantKey) return claim.variantKey === null;
  if (!claim.variantKey) return true; // claim names no variant: treat as family-level

  const [targetBase, targetVariants] = targetVariantKey.split("|");
  const [, claimVariants] = claim.variantKey.split("|");
  if (!isSameFamily(claim, understanding, targetBase)) return false;

  const generationMarkers = ["3g", "4g", "5g", "lte"];
  const targetGenerations = (targetVariants ?? "").split(",").filter((marker) => generationMarkers.includes(marker));
  const claimGenerations = (claimVariants ?? "").split(",").filter((marker) => generationMarkers.includes(marker));

  if (targetGenerations.length === 0 || claimGenerations.length === 0) return true;
  return targetGenerations.some((marker) => claimGenerations.includes(marker));
}

function uniqueDomains(claims: NormalizedClaim[]): Set<string> {
  return new Set(claims.map((claim) => claim.sourceDomain));
}

/* -------------------------------------------------------------------------- */
/* Model + part findings                                                      */
/* -------------------------------------------------------------------------- */

function buildModelFindings(
  clusters: ClaimCluster[],
  side: "support" | "oppose",
  understanding: QueryUnderstanding,
  exactClaims: NormalizedClaim[],
  siblingClaims: NormalizedClaim[],
): CompatibleModelFinding[] {
  const findings: CompatibleModelFinding[] = [];

  for (const cluster of clusters) {
    const claims = side === "support" ? cluster.supporting : cluster.opposing;
    if (claims.length === 0) continue;

    // Drop device clusters that are actually just the part phrasing.
    if (cluster.deviceLabel && understanding.part && normalizeForMatch(cluster.deviceLabel) === normalizeForMatch(understanding.part)) {
      continue;
    }

    const domains = [...new Set(claims.map((claim) => claim.sourceDomain))];
    const averageQuality = averageOf(claims.map((claim) => claim.sourceQuality ?? 0.4));

    findings.push({
      device: cluster.deviceLabel,
      modelNumbers: cluster.modelNumbers,
      variantMarkers: cluster.variantMarkers,
      supportingClaimIds: claims.map((claim) => claim.id),
      supportingDomains: domains,
      independentSources: domains.length,
      averageSourceQuality: Number(averageQuality.toFixed(3)),
      partNumberMatched: cluster.partNumberMatched,
    });
  }

  // If the requested device itself has no cluster (common when the page only
  // lists model numbers), synthesise the finding from the exact claims so the
  // report always shows what was actually found.
  if (findings.length === 0 && understanding.device) {
    const claims = side === "support"
      ? exactClaims.filter((claim) => claim.claim === "compatible").concat(siblingClaims.filter((claim) => claim.claim === "compatible"))
      : [];
    if (claims.length > 0) {
      const domains = [...new Set(claims.map((claim) => claim.sourceDomain))];
      findings.push({
        device: understanding.device,
        modelNumbers: [...new Set(claims.flatMap((claim) => claim.modelNumbers))],
        variantMarkers: understanding.variantMarkers,
        supportingClaimIds: claims.map((claim) => claim.id),
        supportingDomains: domains,
        independentSources: domains.length,
        averageSourceQuality: Number(averageOf(claims.map((claim) => claim.sourceQuality ?? 0.4)).toFixed(3)),
        partNumberMatched: claims.some((claim) => Boolean(claim.partNumber)),
      });
    }
  }

  return findings.sort((a, b) => b.independentSources * b.averageSourceQuality - a.independentSources * a.averageSourceQuality);
}

function buildPartFindings(claims: NormalizedClaim[], understanding: QueryUnderstanding): CompatiblePartFinding[] {
  const supporting = claims.filter((claim) => claim.claim === "compatible");
  if (supporting.length === 0) return [];

  const byPart = new Map<string, NormalizedClaim[]>();
  for (const claim of supporting) {
    const key = claim.partNumber
      ? `pn:${normalizeIdentifier(claim.partNumber)}`
      : `name:${normalizeForMatch(claim.partCanonical ?? claim.partRaw ?? claim.partCategory ?? "part")}`;
    const list = byPart.get(key) ?? [];
    list.push(claim);
    byPart.set(key, list);
  }

  const findings: CompatiblePartFinding[] = [];
  for (const [, list] of byPart) {
    const first = list[0]!;
    const domains = [...new Set(list.map((claim) => claim.sourceDomain))];
    const attributes: Record<string, string> = {};
    for (const claim of list) {
      for (const [key, value] of Object.entries(claim.attributes)) {
        if (!attributes[key]) attributes[key] = value;
      }
    }
    findings.push({
      partName: first.partCanonical ?? first.partRaw ?? getPartCategory(first.partCategory ?? understanding.partCategory).label,
      partNumber: first.partNumber ?? null,
      partCategory: (first.partCategory ?? understanding.partCategory) as PartCategory,
      device: first.deviceCanonical ?? understanding.device ?? "unspecified device",
      supportingClaimIds: list.map((claim) => claim.id),
      supportingDomains: domains,
      independentSources: domains.length,
      averageSourceQuality: Number(averageOf(list.map((claim) => claim.sourceQuality ?? 0.4)).toFixed(3)),
      attributes,
    });
  }

  return findings.sort((a, b) => b.independentSources - a.independentSources);
}

/* -------------------------------------------------------------------------- */
/* Checklist                                                                  */
/* -------------------------------------------------------------------------- */

function runChecklist(input: {
  checklist: ChecklistItem[];
  claims: NormalizedClaim[];
  allClaims: NormalizedClaim[];
  understanding: QueryUnderstanding;
  sources: EvaluatedSource[];
}): CompatibilityCheck[] {
  const { checklist, claims, understanding } = input;

  // A claim's own sentence often omits technical detail ("compatible with
  // SM-A155F") while the same page states the connector/revision nearby. Each
  // claim therefore gets a bounded context window (±400 chars) from its source,
  // which is what the checklist scans.
  const sourceById = new Map(input.sources.map((source) => [source.id, source]));
  const contextByClaimId = new Map<string, string>();
  for (const claim of claims) {
    const source = sourceById.get(claim.sourceId);
    let context = claim.evidenceText;
    if (source) {
      const index = source.text.indexOf(claim.evidenceText.slice(0, 60));
      if (index >= 0) {
        context = `${source.text.slice(Math.max(0, index - 400), index + 800)} ${context}`;
      }
    }
    contextByClaimId.set(claim.id, normalizeForMatch(context));
  }
  const contextOf = (claim: NormalizedClaim) =>
    `${contextByClaimId.get(claim.id) ?? normalizeForMatch(claim.evidenceText)} ${normalizeForMatch(
      Object.keys(claim.attributes).join(" "),
    )} ${normalizeForMatch(Object.values(claim.attributes).join(" "))}`;

  return checklist.map((item) => {
    const base = {
      id: item.id,
      label: item.label,
      rationale: item.rationale,
    };

    // The device_model dimension is satisfied by the model numbers themselves.
    if (item.id === "device_model") {
      const models = [...new Set(claims.flatMap((claim) => claim.modelNumbers))];
      const explicitForTarget = understanding.modelNumbers.filter((model) =>
        claims.some((claim) => claim.modelNumbers.some((candidate) => normalizeIdentifier(candidate) === normalizeIdentifier(model))),
      );
      const compatibleClaims = claims.filter((claim) => claim.claim === "compatible");
      if (explicitForTarget.length > 0 && compatibleClaims.length > 0) {
        return {
          ...base,
          status: "supported" as CheckStatus,
          detail: `Evidence names the exact model number(s) ${explicitForTarget.join(", ")} alongside the part.`,
          evidenceClaimIds: compatibleClaims.filter((claim) =>
            claim.modelNumbers.some((candidate) => explicitForTarget.includes(normalizeIdentifier(candidate))),
          ).map((claim) => claim.id),
        };
      }
      if (models.length > 0) {
        return {
          ...base,
          status: "supported" as CheckStatus,
          detail: `Evidence lists model numbers for this part: ${models.slice(0, 6).join(", ")}.`,
          evidenceClaimIds: claims.filter((claim) => claim.modelNumbers.length > 0).map((claim) => claim.id),
        };
      }
      return {
        ...base,
        status: "unknown" as CheckStatus,
        detail: "No source listed explicit model numbers for this part.",
        evidenceClaimIds: [],
      };
    }

    const indicators = item.indicators.map((indicator) => normalizeForMatch(indicator)).filter((indicator) => indicator.length >= 3);
    const mentions = claims.filter((claim) => {
      const haystack = contextOf(claim);
      return indicators.some((indicator) => haystack.includes(indicator));
    });

    // Attribute keys give a strong signal for dimensions such as voltage.
    const attributeKeys = new Set(claims.flatMap((claim) => Object.keys(claim.attributes)));
    const attributeMatches = Object.entries(ATTRIBUTE_TO_CHECK)
      .filter(([attribute, checkIds]) => attributeKeys.has(attribute) && checkIds.includes(item.id))
      .map(([attribute]) => attribute);

    if (mentions.length === 0 && attributeMatches.length === 0) {
      return {
        ...base,
        status: "unknown" as CheckStatus,
        detail: `No source in this research mentioned ${item.label.toLowerCase()}.`,
        evidenceClaimIds: [],
      };
    }

    const supporting = mentions.filter((claim) => claim.claim === "compatible");
    const opposing = mentions.filter((claim) => claim.claim === "not_compatible");

    if (supporting.length > 0 && opposing.length > 0) {
      return {
        ...base,
        status: "conflicting" as CheckStatus,
        detail: `Sources disagree about ${item.label.toLowerCase()}: ${uniqueDomains(supporting).size} source(s) confirm it, ${uniqueDomains(opposing).size} contradict it.`,
        evidenceClaimIds: [...supporting, ...opposing].map((claim) => claim.id),
      };
    }
    if (opposing.length > 0) {
      return {
        ...base,
        status: "contradicted" as CheckStatus,
        detail: `Evidence explicitly states ${item.label.toLowerCase()} does not match: ${summarise(opposing)}`,
        evidenceClaimIds: opposing.map((claim) => claim.id),
      };
    }
    if (supporting.length > 0) {
      return {
        ...base,
        status: "supported" as CheckStatus,
        detail: `Supported by ${uniqueDomains(supporting).size} source(s): ${summarise(supporting)}`,
        evidenceClaimIds: supporting.map((claim) => claim.id),
      };
    }
    return {
      ...base,
      status: "unknown" as CheckStatus,
      detail: `${item.label} is mentioned but no source makes a clear compatibility statement about it.`,
      evidenceClaimIds: mentions.map((claim) => claim.id),
    };
  });
}

function summarise(claims: NormalizedClaim[]): string {
  return claims
    .slice(0, 2)
    .map((claim) => `“${claim.evidenceText.slice(0, 110)}” (${claim.sourceDomain})`)
    .join("; ");
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function totalStrength(claims: NormalizedClaim[]): number {
  return claims.reduce((total, claim) => total + claim.strength * (0.5 + (claim.sourceQuality ?? 0.4) * 0.5), 0);
}

function maxOf(values: number[]): number {
  return values.length ? Math.max(...values) : 0;
}

function averageOf(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

function dedupeStrings(values: string[]): string[] {
  return [...new Set(values)];
}
