import type { z } from "zod";
import type { AIProviderId } from "@/lib/config";

/**
 * AI provider abstraction.
 *
 * PartScout treats AI as a reasoning/reading layer, never as a source of truth.
 * Every capability below is therefore shaped so the model can only:
 *   • classify and expand a research question,
 *   • read identifiers printed on a part photo,
 *   • lift short verbatim quotes out of retrieved pages,
 *   • phrase an answer from claims that a deterministic engine already grouped.
 *
 * A model is never asked whether a part fits a phone and its output can never
 * create a compatibility fact: `compatibility-engine.ts` groups evidence and
 * `confidence-engine.ts` scores it, while the model output is validated against
 * the evidence (refs, quotes, model numbers) before it is used at all.
 */

export type AIModelTier = "fast" | "smart";

/** Token usage attributable to a single provider call. */
export interface AIUsage {
  provider: AIProviderId;
  model: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
}

export interface AITextRequest {
  /** Short task label used for logs, usage records and admin metrics. */
  label: string;
  system: string;
  user: string;
  tier?: AIModelTier;
  temperature?: number;
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface AITextResponse {
  text: string;
  /** True when the provider refused/blocked the request. */
  blocked?: boolean;
  usage: AIUsage;
}

export interface AIJsonRequest<T> extends AITextRequest {
  /** Schema the JSON body must satisfy; invalid output is rejected, not patched. */
  schema: z.ZodType<T>;
}

export interface AIJsonResponse<T> {
  data: T;
  /** True when the JSON had to be recovered from fenced/prose-wrapped output. */
  repaired: boolean;
  usage: AIUsage;
}

export interface AIImageInput {
  /** base64 payload (no data: prefix) or an https URL. */
  base64: string;
  mimeType: string;
}

export interface AIVisionRequest<T> extends AITextRequest {
  images: AIImageInput[];
  schema: z.ZodType<T>;
}

/* -------------------------------------------------------------------------- */
/* Reasoning task inputs                                                      */
/* -------------------------------------------------------------------------- */

export interface UnderstandQueryInput {
  query: string;
  /** Deterministic parse result handed to the model as a starting point. */
  deterministic: Record<string, unknown>;
}

/** Shape returned by the understanding prompt (see prompts.ts). */
export interface QueryUnderstandingSuggestion {
  intent?: string;
  device?: string | null;
  part?: string | null;
  partCategory?: string | null;
  manufacturer?: string | null;
  region?: string | null;
  variantMarkers?: string[];
  notes?: string[];
  confidence?: number;
}

export interface ExtractEvidenceInput {
  device: string | null;
  partCategory: string;
  partNumber: string | null;
  /** Evidence refs (S1, S2…) the model is allowed to cite. */
  allowedRefs: string[];
  /** Pre-formatted, injection-neutralised evidence blocks. */
  evidenceBlocks: string;
}

export interface ExtractedEvidenceItem {
  sourceRef: string;
  deviceRaw?: string | null;
  deviceCanonical?: string | null;
  modelNumbers?: string[];
  variantMarkers?: string[];
  partRaw?: string | null;
  partCategory?: string;
  partNumber?: string | null;
  claim: string;
  evidenceText: string;
  attributes?: Record<string, string>;
  notes?: string | null;
}

export interface ExtractEvidenceResult {
  claims: ExtractedEvidenceItem[];
  notes: string[];
}

export interface CompatibilityReasoningInput {
  device: string | null;
  partCategory: string;
  partNumber: string | null;
  claimSummary: string;
  checksSummary: string;
  conflictsSummary: string;
  allowedRefs: string[];
}

export interface CompatibilityReasoningResult {
  assessment: string;
  reasoning: string[];
  caveats: string[];
  inferredChecks: Array<{
    id: string;
    label: string;
    status: string;
    detail: string;
    evidenceRefs: string[];
  }>;
}

export interface AnswerGenerationInput {
  device: string | null;
  partCategory: string;
  partNumber: string | null;
  verdict: string;
  confidenceLevel: string;
  confidenceScore: number;
  supportedModels: string[];
  conflictingModels: string[];
  checksSummary: string;
  conflictsSummary: string;
  evidenceSummary: string;
  allowedRefs: string[];
}

export interface AnswerGenerationResult {
  answer: string;
  summaryBullets: string[];
  verifyBeforeInstall: string[];
}

export interface IdentifyPartInput {
  images: AIImageInput[];
  hint?: string | null;
}

export interface PartIdentificationResult {
  identifierType: string;
  identifier: string;
  candidateDevice: string | null;
  manufacturer: string | null;
  partCategory: string;
  parts: Array<{ name: string; partNumber: string | null; label: string; value: string }>;
  printedText: string[];
  confidence: number;
  notes: string[];
}

/* -------------------------------------------------------------------------- */
/* Provider interface                                                         */
/* -------------------------------------------------------------------------- */

export interface AIProvider {
  readonly id: AIProviderId;
  /** Whether this provider can read part photos. */
  readonly supportsVision: boolean;

  /** True when the vendor key is present. */
  isConfigured(): boolean;
  /** Model id used for a tier (surfaced in admin metrics + the README). */
  modelFor(tier: AIModelTier): string;

  /* Primitives (implemented per vendor) */
  complete(request: AITextRequest): Promise<AITextResponse>;
  completeJson<T>(request: AIJsonRequest<T>): Promise<AIJsonResponse<T>>;
  completeVisionJson<T>(request: AIVisionRequest<T>): Promise<AIJsonResponse<T>>;

  /* Reasoning tasks (implemented once in BaseAIProvider) */
  understandQuery(input: UnderstandQueryInput): Promise<QueryUnderstandingSuggestion>;
  extractEvidence(input: ExtractEvidenceInput): Promise<ExtractEvidenceResult>;
  analyzeCompatibility(input: CompatibilityReasoningInput): Promise<CompatibilityReasoningResult>;
  generateAnswer(input: AnswerGenerationInput): Promise<AnswerGenerationResult>;
  identifyPartImage(input: IdentifyPartInput): Promise<PartIdentificationResult>;
}
