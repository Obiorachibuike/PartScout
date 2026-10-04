import type {
  CompatibleModelFinding,
  ConfidenceResult,
  EvaluatedSource,
  EvidenceLevel,
  NormalizedClaim,
  Verdict,
} from "@/types/research";

/**
 * Stage 9 — evidence confidence.
 *
 * The score is NOT a probability that the part fits. It is a transparent measure
 * of how strong and how consistent the *evidence* is: how good the sources are,
 * how many independent publishers agree, how specific they are about model and
 * part numbers, and how much they contradict each other.
 *
 * Everything is computed deterministically from the collected claims so the same
 * evidence always produces the same number, and so the UI can explain it.
 */

export const CONFIDENCE_DISCLAIMER =
  "This score represents the strength and agreement of the web evidence found. It is not a laboratory guarantee.";

export const EVIDENCE_LEVELS: Record<EvidenceLevel, { label: string; emoji: string; description: string }> = {
  CONFIRMED: {
    label: "Confirmed",
    emoji: "🟢",
    description: "Multiple high-quality, independent sources explicitly confirm compatibility.",
  },
  HIGH_CONFIDENCE: {
    label: "High confidence",
    emoji: "🟢",
    description: "Strong, direct evidence from reliable sources supports compatibility.",
  },
  LIKELY: {
    label: "Likely",
    emoji: "🟡",
    description: "Several signals support compatibility, but direct confirmation is limited.",
  },
  POSSIBLE: {
    label: "Possible",
    emoji: "🟠",
    description: "Some evidence exists, but it is not sufficient to rely on.",
  },
  UNKNOWN: {
    label: "Unknown",
    emoji: "⚪",
    description: "Not enough reliable evidence was found to make a compatibility statement.",
  },
  NOT_COMPATIBLE: {
    label: "Not compatible",
    emoji: "🔴",
    description: "Strong evidence indicates that this part does not fit this device.",
  },
};

export interface ConfidenceInput {
  verdict: Verdict;
  sources: EvaluatedSource[];
  claims: NormalizedClaim[];
  supporting: NormalizedClaim[];
  opposing: NormalizedClaim[];
  compatibleModels: CompatibleModelFinding[];
  checklist: Array<{ status: string }>;
  conflicts: number;
  variantRisks: number;
  partNumberMatched: boolean;
  exactTargetEvidence: boolean;
}

export function calculateConfidence(input: ConfidenceInput): ConfidenceResult {
  const rationale: string[] = [];

  const claims = [...input.supporting, ...input.opposing];
  const supportingDomains = new Set(input.supporting.map((claim) => claim.sourceDomain));
  const opposingDomains = new Set(input.opposing.map((claim) => claim.sourceDomain));

  // --- 1. Source quality of the claims we actually rely on -------------------
  const claimQuality = average(input.supporting.map((claim) => claim.sourceQuality ?? 0.4));
  const highQualityDomains = new Set(
    input.sources.filter((source) => source.quality.total >= 0.6).map((source) => source.domain),
  );
  const sourceQuality = clamp01(claimQuality);
  rationale.push(
    input.supporting.length > 0
      ? `${supportingDomains.size} independent source(s) support compatibility; average source quality ${(claimQuality * 100).toFixed(0)}%.`
      : "No supporting claims were found in the retrieved sources.",
  );

  // --- 2. Independent sources ------------------------------------------------
  // Three independent publishers is treated as "enough corroboration"; more
  // domains still add a little through the high-quality-domain bonus below.
  const independentSources = clamp01(supportingDomains.size / 3);
  if (supportingDomains.size > 0) {
    rationale.push(
      `${supportingDomains.size} distinct domain(s) support the finding (${[...supportingDomains].slice(0, 4).join(", ")}).`,
    );
  }

  // --- 3. Agreement / disagreement ------------------------------------------
  const supportWeight = sum(input.supporting.map((claim) => claim.strength));
  const opposeWeight = sum(input.opposing.map((claim) => claim.strength));
  const agreement =
    supportWeight + opposeWeight === 0 ? 0 : supportWeight / (supportWeight + opposeWeight);
  const claimAgreement = clamp01(agreement);
  if (input.opposing.length > 0) {
    rationale.push(
      `${opposingDomains.size} source(s) contradict the finding, which caps the achievable confidence.`,
    );
  } else if (input.supporting.length > 0) {
    rationale.push("No retrieved source contradicts the finding.");
  }

  // --- 4. Technical specificity ---------------------------------------------
  const resolvedChecks = input.checklist.filter((check) => check.status === "supported" || check.status === "contradicted").length;
  const checkCoverage = input.checklist.length === 0 ? 0 : resolvedChecks / input.checklist.length;
  const technicalSpecificity = clamp01(checkCoverage * 0.8 + (input.partNumberMatched ? 0.2 : 0));
  rationale.push(
    `Checklist coverage: ${resolvedChecks}/${input.checklist.length} compatibility dimensions are backed by evidence.`,
  );
  if (input.partNumberMatched) rationale.push("At least one source names the exact part number.");

  // --- Weights ---------------------------------------------------------------
  const base =
    sourceQuality * 0.24 +
    independentSources * 0.22 +
    claimAgreement * 0.2 +
    technicalSpecificity * 0.12 +
    (input.partNumberMatched ? 0.12 : 0) +
    (highQualityDomains.size >= 2 ? 0.06 : 0) +
    (input.exactTargetEvidence ? 0.04 : 0);

  // --- Penalties -------------------------------------------------------------
  const conflictsPenalty = Math.min(0.25, input.conflicts * 0.12);
  const variantPenalty = Math.min(0.12, input.variantRisks * 0.06);
  const volumePenalty = claims.length === 0 ? 0.35 : claims.length === 1 ? 0.12 : 0;
  const singleSourcePenalty = supportingDomains.size === 1 ? 0.08 : 0;
  const exactnessPenalty = input.exactTargetEvidence ? 0 : claims.length > 0 ? 0.12 : 0;

  if (conflictsPenalty > 0) rationale.push(`Conflicting evidence applies a ${(conflictsPenalty * 100).toFixed(0)}% penalty.`);
  if (variantPenalty > 0) rationale.push("Evidence is about a sibling variant, which applies a penalty.");
  if (volumePenalty > 0) rationale.push("Very few usable evidence items were found.");

  const rawScore = base - conflictsPenalty - variantPenalty - volumePenalty - singleSourcePenalty - exactnessPenalty;
  let score = Math.round(clamp01(rawScore) * 100);

  // --- Level mapping ---------------------------------------------------------
  let level: EvidenceLevel;
  const hasSupport = input.supporting.length > 0;
  const hasOpposition = input.opposing.length > 0;

  if (input.verdict === "not_compatible") {
    level = "NOT_COMPATIBLE";
    score = Math.max(score, 60);
  } else if (input.verdict === "insufficient_evidence" || input.verdict === "research_failed" || input.verdict === "not_configured") {
    level = "UNKNOWN";
    score = Math.min(score, 18);
  } else if (hasOpposition && hasSupport) {
    level = score >= 55 ? "POSSIBLE" : "UNKNOWN";
    score = Math.min(score, 58);
  } else if (!hasSupport) {
    level = score >= 35 ? "POSSIBLE" : "UNKNOWN";
    score = Math.min(score, 40);
  } else if (verdictIsStrong(input.verdict) && supportingDomains.size >= 4 && score >= 85 && highQualityDomains.size >= 2 && !hasOpposition) {
    level = "CONFIRMED";
  } else if (verdictIsStrong(input.verdict) && supportingDomains.size >= 3 && score >= 72) {
    level = "HIGH_CONFIDENCE";
  } else if (score >= 55) {
    level = "LIKELY";
  } else if (score >= 35) {
    level = "POSSIBLE";
  } else {
    level = "UNKNOWN";
  }

  // Consistency rails: the confidence level must never contradict the verdict
  // shown next to it (e.g. "likely compatible" with an UNKNOWN badge).
  if (verdictIsStrong(input.verdict) && hasSupport && !hasOpposition) {
    if (level === "UNKNOWN") level = "POSSIBLE";
    score = Math.max(score, level === "LIKELY" ? 55 : level === "POSSIBLE" ? 35 : score);
  }

  // Conservative safety rails: never show CONFIRMED/HIGH without exact-target
  // evidence, and never above LIKELY when sources disagree.
  if ((level === "CONFIRMED" || level === "HIGH_CONFIDENCE") && !input.exactTargetEvidence) {
    level = "LIKELY";
  }
  if (level === "CONFIRMED" && hasOpposition) level = "HIGH_CONFIDENCE";

  const summary = buildSummary(level, input, supportingDomains.size);

  return {
    score,
    level,
    label: EVIDENCE_LEVELS[level].label,
    summary,
    rationale,
    breakdown: {
      sourceQuality: round(sourceQuality),
      independentSources: round(independentSources),
      claimAgreement: round(claimAgreement),
      technicalSpecificity: round(technicalSpecificity),
      conflictsPenalty: round(conflictsPenalty),
      evidenceVolumePenalty: round(volumePenalty + singleSourcePenalty + exactnessPenalty + variantPenalty),
    },
    disclaimer: CONFIDENCE_DISCLAIMER,
  };
}

function verdictIsStrong(verdict: Verdict): boolean {
  return verdict === "compatible" || verdict === "likely_compatible";
}

function buildSummary(level: EvidenceLevel, input: ConfidenceInput, domainCount: number): string {
  const sourceText = domainCount === 0 ? "no supporting sources" : `${domainCount} independent source(s)`;
  switch (level) {
    case "CONFIRMED":
      return `${input.compatibleModels.length} device reference(s) confirmed by ${sourceText} with consistent technical detail.`;
    case "HIGH_CONFIDENCE":
      return `Direct, consistent evidence from ${sourceText}.`;
    case "LIKELY":
      return `Supporting signals from ${sourceText}, but no source states this combination unambiguously.`;
    case "POSSIBLE":
      return `Some evidence exists (${sourceText}) but it is too thin to rely on.`;
    case "NOT_COMPATIBLE":
      return "Sources explicitly state that this part does not fit the requested device.";
    default:
      return "PartScout could not find enough reliable evidence to confirm compatibility.";
  }
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
