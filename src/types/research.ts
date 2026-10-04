/**
 * Shared research domain types.
 *
 * These types are the contract between the research pipeline, the API layer and
 * the UI. Everything a research report exposes is derived from real, retrieved
 * web evidence — there is deliberately no field for "model knowledge".
 */

export type SearchIntent =
  | "phone_to_parts"
  | "part_to_phones"
  | "compatibility_check"
  | "identify"
  | "unknown";

export const PART_CATEGORIES = [
  "screen",
  "battery",
  "charging_flex",
  "charging_board",
  "power_flex",
  "volume_flex",
  "back_cover",
  "back_glass",
  "housing",
  "camera",
  "speaker",
  "microphone",
  "fingerprint",
  "buttons",
  "sensors",
  "antenna",
  "nfc",
  "wireless_charging",
  "other",
] as const;

export type PartCategory = (typeof PART_CATEGORIES)[number];

export type EvidenceStrength = "high" | "medium" | "low";

export type SourceTier = 1 | 2 | 3 | 4;

export type EvidenceLevel =
  | "CONFIRMED"
  | "HIGH_CONFIDENCE"
  | "LIKELY"
  | "POSSIBLE"
  | "UNKNOWN"
  | "NOT_COMPATIBLE";

/** Normalised result returned by every SearchProvider implementation. */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  /** Provider id that produced the result (tavily, exa, serper, brave…). */
  provider: string;
  /** Provider relevance score when available (0..1 where documented). */
  score?: number;
  publishedAt?: string;
  /** Full-ish page text when the provider returns it (Exa/Tavily). */
  rawContent?: string;
  /** The generated query that surfaced this result. */
  query: string;
  rank: number;
}

export interface SearchOptions {
  /** Max results to request from the provider. */
  limit?: number;
  /** Only return results published after this ISO date. */
  recencyDays?: number;
  /** Restrict to these domains where the provider supports it. */
  includeDomains?: string[];
  excludeDomains?: string[];
  signal?: AbortSignal;
}

/** A search result after content extraction. */
export interface ExtractedSource {
  id: string;
  url: string;
  canonicalUrl: string;
  domain: string;
  siteName: string;
  title: string;
  snippet: string;
  publishedAt?: string;
  /** Readable page text (truncated, script/style stripped). */
  text: string;
  /** True when we retrieved the page body ourselves. */
  fetched: boolean;
  /** True when we relied on provider-supplied content instead of a fetch. */
  usedProviderContent: boolean;
  wordCount: number;
  failureReason?: string;
  /** Number of instruction-like spans neutralised in this page (injection defence). */
  injectionFindings?: number;
}

export interface SourceQuality {
  total: number;
  tier: SourceTier;
  tierLabel: string;
  authority: number;
  relevance: number;
  directness: number;
  modelSpecificity: number;
  partSpecificity: number;
  recency: number;
  independence: number;
  explicitClaim: number;
  notes: string[];
}

export interface EvaluatedSource extends ExtractedSource {
  quality: SourceQuality;
  /** Which research queries surfaced this URL. */
  queries: string[];
  /** Search providers that returned this URL. */
  providerIds: string[];
}

export type ClaimKind = "compatible" | "not_compatible" | "unclear" | "spec_only";

export interface EvidenceClaim {
  id: string;
  sourceId: string;
  sourceUrl: string;
  sourceTitle: string;
  sourceDomain: string;
  /** Raw device string as written on the page. */
  deviceRaw: string | null;
  /** Canonical device family name (variants preserved separately). */
  deviceCanonical: string | null;
  /** Explicit model numbers referenced by the evidence. */
  modelNumbers: string[];
  /** Explicit variant markers (4G/5G/Plus/Pro/regional suffixes). */
  variantMarkers: string[];
  partRaw: string | null;
  partCategory: PartCategory | null;
  partNumber: string | null;
  claim: ClaimKind;
  /** Verbatim (short) evidence snippet from the page. */
  evidenceText: string;
  evidenceStrength: EvidenceStrength;
  /** 0..1 strength derived from phrasing + specificity. */
  strength: number;
  extractionMethod: "deterministic" | "ai";
  attributes: Record<string, string>;
}

export interface NormalizedClaim extends EvidenceClaim {
  /** Canonical part name after synonym normalisation. */
  partCanonical: string | null;
  /** Grouping key for the canonical device family (variants collapse here). */
  deviceFamilyKey: string | null;
  /** Key that must match for a real interchangeability claim. */
  variantKey: string | null;
  /** Variant markers kept from the source text (4g, 5g, us, …). */
  variantMarkers: string[];
  /** Quality score of the source that produced this claim. */
  sourceQuality?: number;
}

export type CheckStatus = "supported" | "contradicted" | "conflicting" | "unknown";

export interface CompatibilityCheck {
  id: string;
  label: string;
  /** Why this check matters for this part category. */
  rationale: string;
  status: CheckStatus;
  detail: string;
  evidenceClaimIds: string[];
}

export interface ConflictRecord {
  topic: string;
  supporting: Array<{ claimId: string; domain: string; url: string; text: string }>;
  opposing: Array<{ claimId: string; domain: string; url: string; text: string }>;
  explanation: string;
  possibleExplanations: string[];
}

export interface CompatibleModelFinding {
  device: string;
  modelNumbers: string[];
  variantMarkers: string[];
  supportingClaimIds: string[];
  supportingDomains: string[];
  independentSources: number;
  averageSourceQuality: number;
  /** True when a source states the part number for this model. */
  partNumberMatched: boolean;
}

export interface VariantRisk {
  requestedVariant: string;
  evidenceVariant: string;
  deviceLabel: string;
  modelNumbers: string[];
  claimIds: string[];
  message: string;
}

export interface CompatiblePartFinding {
  partName: string;
  partNumber: string | null;
  partCategory: PartCategory;
  device: string;
  supportingClaimIds: string[];
  supportingDomains: string[];
  independentSources: number;
  averageSourceQuality: number;
  attributes: Record<string, string>;
}

export interface ConfidenceBreakdown {
  sourceQuality: number;
  independentSources: number;
  claimAgreement: number;
  technicalSpecificity: number;
  conflictsPenalty: number;
  evidenceVolumePenalty: number;
}

export interface ConfidenceResult {
  /** 0..100, evidence confidence — never a laboratory guarantee. */
  score: number;
  level: EvidenceLevel;
  label: string;
  summary: string;
  rationale: string[];
  breakdown: ConfidenceBreakdown;
  disclaimer: string;
}

export type Verdict =
  | "compatible"
  | "likely_compatible"
  | "uncertain"
  | "not_compatible"
  | "insufficient_evidence"
  | "research_failed"
  | "not_configured";

export interface ResearchQueryPlan {
  query: string;
  purpose: string;
  /** Which part category / device component the query targets. */
  kind:
    | "device_part_compat"
    | "model_number"
    | "part_number"
    | "part_to_phone"
    | "spec"
    | "forum"
    | "generic";
}

export interface ResearchPlan {
  intent: SearchIntent;
  device: string | null;
  deviceBrand: string | null;
  modelNumbers: string[];
  variantMarkers: string[];
  part: string | null;
  partCategory: PartCategory;
  partNumber: string | null;
  manufacturer: string | null;
  region: string | null;
  /** Free-form rest of the user question, kept for the answer narrative. */
  rawQuery: string;
  queries: ResearchQueryPlan[];
  understandingNotes: string[];
  understandingMethod: "deterministic" | "ai" | "hybrid";
}

export interface ResearchStageEvent {
  stage: string;
  label: string;
  status: "pending" | "active" | "done" | "error" | "skipped";
  detail?: string;
  at: string;
}

export interface UsageSummary {
  searchCalls: number;
  pagesFetched: number;
  aiCalls: number;
  aiPromptTokens: number;
  aiCompletionTokens: number;
  durationMs: number;
  estimatedCostUsd: number;
  cached: boolean;
}

export interface ResearchReport {
  id: string;
  /** Stable key for this research question — used by "refresh research". */
  cacheKey: string;
  createdAt: string;
  intent: SearchIntent;
  question: string;
  plan: ResearchPlan;
  verdict: Verdict;
  headline: string;
  answer: string;
  answerMethod: "deterministic" | "ai_synthesis";
  summaryBullets: string[];
  compatibleModels: CompatibleModelFinding[];
  incompatibleModels: CompatibleModelFinding[];
  compatibleParts: CompatiblePartFinding[];
  checks: CompatibilityCheck[];
  conflicts: ConflictRecord[];
  variantRisks: VariantRisk[];
  verifyBeforeInstall: string[];
  warnings: string[];
  sources: EvaluatedSource[];
  claims: NormalizedClaim[];
  confidence: ConfidenceResult;
  usage: UsageSummary;
  /** Populated when research could not complete. */
  failure?: {
    code:
      | "provider_not_configured"
      | "search_failed"
      | "timeout"
      | "no_sources"
      | "no_evidence"
      | "rate_limited"
      | "invalid_input";
    message: string;
    remediation: string[];
  };
  /** True when the data came from synthetic fixtures (dev only). */
  fixtureData: boolean;
  cached: boolean;
}

export interface IdentificationResult {
  identifierType: "part_number" | "model_number" | "device" | "unknown";
  identifier: string;
  candidateDevice: string | null;
  manufacturer: string | null;
  partCategory: PartCategory;
  parts: Array<{
    name: string;
    partNumber: string | null;
    label: string;
    value: string;
  }>;
  printedText: string[];
  confidence: number;
  notes: string[];
  method: "vision" | "ocr_offline" | "unavailable";
  usage: UsageSummary;
}
