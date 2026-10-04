import type { EvidenceLevel, Verdict } from "@/types/research";

/**
 * Presentation metadata for verdicts and confidence levels.
 *
 * The wording here is deliberately conservative: PartScout reports *evidence*
 * confidence from public sources, never a laboratory guarantee, and a
 * "compatible" verdict always carries the same caveat as the API payload.
 */

export interface VerdictMeta {
  label: string;
  short: string;
  description: string;
  tone: "success" | "warning" | "danger" | "info" | "muted";
  emoji: string;
  /** Tailwind-independent colours consumed by inline styles. */
  color: string;
}

export const VERDICT_META: Record<Verdict, VerdictMeta> = {
  compatible: {
    label: "Compatible",
    short: "Compatible",
    description:
      "Published sources state that this part fits the device in question. Model-specific differences were checked against the category checklist.",
    tone: "success",
    emoji: "✅",
    color: "#22C55E",
  },
  likely_compatible: {
    label: "Likely compatible",
    short: "Likely",
    description:
      "The evidence points to compatibility, but the sources are thinner or less specific than a fully confirmed answer. Verify the part before fitting.",
    tone: "success",
    emoji: "🟢",
    color: "#22C55E",
  },
  uncertain: {
    label: "Uncertain — evidence conflicts or is incomplete",
    short: "Uncertain",
    description:
      "There is relevant evidence, but it either conflicts on a checkpoint that matters or only covers sibling variants. Read the conflicts and warnings before using this part.",
    tone: "warning",
    emoji: "🟡",
    color: "#F59E0B",
  },
  not_compatible: {
    label: "Not compatible",
    short: "Not compatible",
    description:
      "The gathered evidence states that this part does not fit, or identifies a difference (connector, revision, variant) that prevents it. Do not fit it without independent verification.",
    tone: "danger",
    emoji: "🔴",
    color: "#EF4444",
  },
  insufficient_evidence: {
    label: "PartScout could not find enough reliable evidence to confirm compatibility",
    short: "Not enough evidence",
    description:
      "The honest answer: the public sources PartScout could reach do not contain enough specific evidence. Try adding an exact model number or OEM part number, or check the manufacturer documentation directly.",
    tone: "muted",
    emoji: "⚪",
    color: "#94A3B8",
  },
  research_failed: {
    label: "Research could not complete",
    short: "Research failed",
    description:
      "A technical failure (provider error or timeout) stopped the research. The failure reason below says what happened — this is not a compatibility statement.",
    tone: "danger",
    emoji: "⚠️",
    color: "#EF4444",
  },
  not_configured: {
    label: "Search provider not configured",
    short: "Not configured",
    description:
      "This deployment has no usable search provider, so PartScout cannot research the live web. Configure SEARCH_PROVIDER and its API key to enable research.",
    tone: "warning",
    emoji: "⚠️",
    color: "#F59E0B",
  },
};

export const LEVEL_META: Record<EvidenceLevel, { emoji: string; color: string; label: string }> = {
  CONFIRMED: { emoji: "🟢", color: "#22C55E", label: "Confirmed" },
  HIGH_CONFIDENCE: { emoji: "🟢", color: "#22C55E", label: "High confidence" },
  LIKELY: { emoji: "🟡", color: "#F59E0B", label: "Likely" },
  POSSIBLE: { emoji: "🟠", color: "#F97316", label: "Possible" },
  UNKNOWN: { emoji: "⚪", color: "#94A3B8", label: "Unknown" },
  NOT_COMPATIBLE: { emoji: "🔴", color: "#EF4444", label: "Not compatible" },
};

export function verdictMeta(verdict: Verdict | string): VerdictMeta {
  return VERDICT_META[verdict as Verdict] ?? VERDICT_META.insufficient_evidence;
}

export function levelMeta(level: EvidenceLevel | string): { emoji: string; color: string; label: string } {
  return LEVEL_META[level as EvidenceLevel] ?? LEVEL_META.UNKNOWN;
}

export function tierLabel(tier: number): string {
  switch (tier) {
    case 1:
      return "Tier 1 · manufacturer / official";
    case 2:
      return "Tier 2 · repair database / professional supplier";
    case 3:
      return "Tier 3 · marketplace / reseller";
    default:
      return "Tier 4 · forum / community";
  }
}

export function checkStatusMeta(status: string): { label: string; tone: "success" | "warning" | "danger" | "muted" } {
  switch (status) {
    case "supported":
      return { label: "Supported", tone: "success" };
    case "contradicted":
      return { label: "Contradicted", tone: "danger" };
    case "conflicting":
      return { label: "Conflicting", tone: "warning" };
    default:
      return { label: "Unknown", tone: "muted" };
  }
}
