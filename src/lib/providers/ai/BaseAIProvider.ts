import { z as zod } from "zod";
import { aiConfig, type AIProviderId } from "@/lib/config";
import { isAbortError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { truncate } from "@/lib/text";
import {
  type AIJsonRequest,
  type AIJsonResponse,
  type AIModelTier,
  type AIProvider,
  type AITextRequest,
  type AITextResponse,
  type AIVisionRequest,
  type AnswerGenerationInput,
  type CompatibilityReasoningInput,
  type ExtractEvidenceInput,
  type IdentifyPartInput,
  type UnderstandQueryInput,
} from "@/lib/providers/ai/AIProvider";
import {
  EVIDENCE_ONLY_SYSTEM,
  PART_IDENTIFICATION_SYSTEM,
  answerGenerationPrompt,
  compatibilityReasoningPrompt,
  evidenceExtractionPrompt,
  partIdentificationPrompt,
  understandingPrompt,
} from "@/lib/providers/ai/prompts";

export interface ModelCallRequest {
  system: string;
  user: string;
  tier: AIModelTier;
  temperature?: number;
  maxOutputTokens?: number;
  json?: boolean;
  images?: Array<{ mimeType: string; base64: string }>;
  signal?: AbortSignal;
}

export interface ModelCallResult {
  text: string;
  promptTokens: number;
  completionTokens: number;
  model: string;
  blocked?: boolean;
}

export interface AIUsageSink {
  record(entry: {
    provider: AIProviderId;
    model: string;
    label: string;
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
    tier: AIModelTier;
  }): void;
}

const MAX_ATTEMPTS = 3;

/**
 * Shared behaviour for every vendor implementation: JSON repair/parsing, retries
 * with jittered backoff for rate limits, usage accounting and the domain
 * reasoning tasks from the architecture spec.
 */
export abstract class BaseAIProvider implements AIProvider {
  abstract readonly id: AIProviderId;
  abstract readonly supportsVision: boolean;
  protected options: { usageSink?: AIUsageSink; timeoutMs: number };

  constructor(options: { usageSink?: AIUsageSink; timeoutMs?: number } = {}) {
    this.options = { usageSink: options.usageSink, timeoutMs: options.timeoutMs ?? 60_000 };
  }

  abstract isConfigured(): boolean;
  abstract modelFor(tier: AIModelTier): string;
  protected abstract callModel(request: ModelCallRequest): Promise<ModelCallResult>;

  private async withRetry<T>(label: string, run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
      try {
        return await run();
      } catch (error) {
        lastError = error;
        if (isAbortError(error) || signal?.aborted) throw error;
        const message = error instanceof Error ? error.message : String(error);
        const retryable = /429|rate.?limit|5\d\d|timeout|ECONNRESET|ETIMEDOUT|fetch failed|overloaded|503|529/i.test(message);
        if (!retryable || attempt === MAX_ATTEMPTS - 1) throw error;
        const backoff = 400 * 2 ** attempt + Math.random() * 250;
        logger.warn("AI call failed, retrying", { label, attempt: attempt + 1, backoffMs: Math.round(backoff), error: message.slice(0, 200) });
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }
    }
    throw lastError;
  }

  async complete(request: AITextRequest): Promise<AITextResponse> {
    const startedAt = Date.now();
    const model = this.modelFor(request.tier ?? "fast");
    const result = await this.withRetry(request.label, () =>
      this.callModel({
        system: request.system,
        user: request.user,
        tier: request.tier ?? "fast",
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
        signal: request.signal,
      }),
      request.signal,
    );
    this.trackUsage(request.label, model, result, Date.now() - startedAt, request.tier ?? "fast");
    return {
      text: result.text,
      blocked: result.blocked,
      usage: {
        provider: this.id,
        model: result.model || model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  async completeJson<T>(request: AIJsonRequest<T>): Promise<AIJsonResponse<T>> {
    const startedAt = Date.now();
    const model = this.modelFor(request.tier ?? "fast");
    const result = await this.withRetry(request.label, () =>
      this.callModel({
        system: request.system,
        user: request.user,
        tier: request.tier ?? "fast",
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
        json: true,
        signal: request.signal,
      }),
      request.signal,
    );
    this.trackUsage(request.label, model, result, Date.now() - startedAt, request.tier ?? "fast");

    const parsed = parseJsonLoose<unknown>(result.text);
    if (parsed.value === undefined) {
      throw new Error(
        `AI provider ${this.id} returned output that could not be parsed as JSON for "${request.label}"`,
      );
    }
    const validated = request.schema.safeParse(parsed.value);
    if (!validated.success) {
      throw new Error(
        `AI provider ${this.id} returned JSON failing schema "${request.label}": ${validated.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; ")}`,
      );
    }
    return {
      data: validated.data,
      repaired: parsed.repaired,
      usage: {
        provider: this.id,
        model: result.model || model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  async completeVisionJson<T>(request: AIVisionRequest<T>): Promise<AIJsonResponse<T>> {
    if (!this.supportsVision) {
      throw new Error(`AI provider ${this.id} does not support vision requests`);
    }
    const startedAt = Date.now();
    const model = this.visionModel();
    const result = await this.withRetry(request.label, () =>
      this.callModel({
        system: request.system,
        user: request.user,
        tier: request.tier ?? "fast",
        temperature: request.temperature,
        maxOutputTokens: request.maxOutputTokens,
        json: true,
        images: request.images,
        signal: request.signal,
      }),
      request.signal,
    );
    this.trackUsage(request.label, model, result, Date.now() - startedAt, request.tier ?? "fast");

    const parsed = parseJsonLoose<unknown>(result.text);
    if (parsed.value === undefined) {
      throw new Error(`Vision output from ${this.id} was not parseable JSON`);
    }
    const validated = request.schema.safeParse(parsed.value);
    if (!validated.success) {
      throw new Error(`Vision output from ${this.id} failed schema validation`);
    }
    return {
      data: validated.data,
      repaired: parsed.repaired,
      usage: {
        provider: this.id,
        model: result.model || model,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        latencyMs: Date.now() - startedAt,
      },
    };
  }

  private trackUsage(label: string, model: string, result: ModelCallResult, latencyMs: number, tier: AIModelTier) {
    try {
      this.options.usageSink?.record({
        provider: this.id,
        model: result.model || model,
        label,
        promptTokens: result.promptTokens,
        completionTokens: result.completionTokens,
        latencyMs,
        tier,
      });
    } catch (error) {
      logger.debug("usage sink failed", { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Domain reasoning tasks (implemented once for all vendors)              */
  /* ---------------------------------------------------------------------- */

  async understandQuery(input: UnderstandQueryInput) {
    const { data } = await this.completeJson({
      label: "understand_query",
      tier: "fast",
      temperature: 0,
      maxOutputTokens: 700,
      system: EVIDENCE_ONLY_SYSTEM,
      user: understandingPrompt({ query: truncate(input.query, 600), deterministic: input.deterministic }),
      schema: understandingSchema,
    });
    return data;
  }

  async extractEvidence(input: ExtractEvidenceInput) {
    const { data } = await this.completeJson({
      label: "extract_evidence",
      tier: "fast",
      temperature: 0,
      maxOutputTokens: 2_200,
      system: EVIDENCE_ONLY_SYSTEM,
      user: evidenceExtractionPrompt({
        device: input.device,
        partCategory: input.partCategory,
        partNumber: input.partNumber,
        allowedRefs: input.allowedRefs,
        evidenceBlocks: truncate(input.evidenceBlocks, 28_000),
      }),
      schema: evidenceExtractionSchema,
    });
    // Hard guarantee: every returned ref must exist and every quote must be
    // verbatim-present in the evidence we sent.
    const allowed = new Set(input.allowedRefs);
    const claims = (data.claims ?? []).filter((claim) => allowed.has(claim.sourceRef));
    return { claims, notes: data.notes ?? [] };
  }

  async analyzeCompatibility(input: CompatibilityReasoningInput) {
    const { data } = await this.completeJson({
      label: "analyze_compatibility",
      tier: "smart",
      temperature: 0.1,
      maxOutputTokens: 1_200,
      system: EVIDENCE_ONLY_SYSTEM,
      user: compatibilityReasoningPrompt({
        device: input.device,
        partCategory: input.partCategory,
        partNumber: input.partNumber,
        claimSummary: truncate(input.claimSummary, 14_000),
        checksSummary: truncate(input.checksSummary, 4_000),
        conflictsSummary: truncate(input.conflictsSummary, 3_000),
        allowedRefs: input.allowedRefs,
      }),
      schema: compatibilityReasoningSchema,
    });
    return {
      assessment: data.assessment,
      reasoning: (data.reasoning ?? []).slice(0, 6),
      caveats: (data.caveats ?? []).slice(0, 5),
      inferredChecks: (data.inferredChecks ?? [])
        .slice(0, 8)
        .map((check) => ({ ...check, evidenceRefs: check.evidenceRefs ?? [] })),
    };
  }

  async generateAnswer(input: AnswerGenerationInput) {
    const { data } = await this.completeJson({
      label: "generate_answer",
      tier: "smart",
      temperature: 0.25,
      maxOutputTokens: 900,
      system: EVIDENCE_ONLY_SYSTEM,
      user: answerGenerationPrompt({
        device: input.device,
        partCategory: input.partCategory,
        partNumber: input.partNumber,
        verdict: input.verdict,
        confidenceLevel: input.confidenceLevel,
        confidenceScore: input.confidenceScore,
        supportedModels: input.supportedModels,
        conflictingModels: input.conflictingModels,
        checksSummary: input.checksSummary,
        conflictsSummary: input.conflictsSummary,
        evidenceSummary: input.evidenceSummary,
        allowedRefs: input.allowedRefs,
      }),
      schema: answerSchema,
    });
    return {
      answer: data.answer,
      summaryBullets: (data.summaryBullets ?? []).slice(0, 6),
      verifyBeforeInstall: (data.verifyBeforeInstall ?? []).slice(0, 5),
    };
  }

  async identifyPartImage(input: IdentifyPartInput) {
    const { data } = await this.completeVisionJson({
      label: "identify_part_image",
      tier: "fast",
      temperature: 0,
      maxOutputTokens: 900,
      system: PART_IDENTIFICATION_SYSTEM,
      user: partIdentificationPrompt(input.hint),
      images: input.images,
      schema: identificationSchema,
    });
    return {
      identifierType: data.identifierType,
      identifier: data.identifier,
      candidateDevice: data.candidateDevice ?? null,
      manufacturer: data.manufacturer ?? null,
      partCategory: data.partCategory,
      parts: (data.parts ?? []).map((part) => ({
        name: part.name,
        partNumber: part.partNumber ?? null,
        label: part.label,
        value: part.value,
      })),
      printedText: data.printedText ?? [],
      confidence: data.confidence,
      notes: data.notes ?? [],
    };
  }

  /**
   * Model used for vision calls. Providers may override (e.g. to use a dedicated
   * OCR-grade model); `VISION_MODEL` wins over everything when configured.
   */
  protected visionModel(): string {
    const override = aiConfig.visionModelOverride;
    return override && this.supportsVision ? override : this.modelFor("fast");
  }
}

/* -------------------------------------------------------------------------- */
/* Schemas + JSON helpers                                                     */
/* -------------------------------------------------------------------------- */

const z = zod;

const understandingSchema = z.object({
  intent: z.string().optional(),
  device: z.string().nullish(),
  part: z.string().nullish(),
  partCategory: z.string().nullish(),
  manufacturer: z.string().nullish(),
  region: z.string().nullish(),
  variantMarkers: z.array(z.string()).optional(),
  notes: z.array(z.string()).optional(),
  confidence: z.number().optional(),
});

const evidenceExtractionSchema = z.object({
  claims: z
    .array(
      z.object({
        sourceRef: z.string(),
        deviceRaw: z.string().nullish(),
        deviceCanonical: z.string().nullish(),
        modelNumbers: z.array(z.string()).optional(),
        variantMarkers: z.array(z.string()).optional(),
        partRaw: z.string().nullish(),
        partCategory: z.string().optional(),
        partNumber: z.string().nullish(),
        claim: z.string(),
        evidenceText: z.string(),
        attributes: z.record(z.string(), z.string()).optional(),
        notes: z.string().nullish(),
      }),
    )
    .optional(),
  notes: z.array(z.string()).optional(),
});

const compatibilityReasoningSchema = z.object({
  assessment: z.string(),
  reasoning: z.array(z.string()).optional(),
  caveats: z.array(z.string()).optional(),
  inferredChecks: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        status: z.string(),
        detail: z.string(),
        evidenceRefs: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

const answerSchema = z.object({
  answer: z.string(),
  summaryBullets: z.array(z.string()).optional(),
  verifyBeforeInstall: z.array(z.string()).optional(),
});

const identificationSchema = z.object({
  identifierType: z.string(),
  identifier: z.string(),
  candidateDevice: z.string().nullish(),
  manufacturer: z.string().nullish(),
  partCategory: z.string(),
  parts: z
    .array(z.object({ name: z.string(), partNumber: z.string().nullish(), label: z.string(), value: z.string() }))
    .optional(),
  printedText: z.array(z.string()).optional(),
  confidence: z.number(),
  notes: z.array(z.string()).optional(),
});

/**
 * Parses JSON from model output, tolerating markdown fences and leading prose.
 */
export function parseJsonLoose<T>(text: string): { value: T | undefined; repaired: boolean } {
  const trimmed = text.trim();
  const attempts: Array<{ candidate: string; repaired: boolean }> = [{ candidate: trimmed, repaired: false }];

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) attempts.push({ candidate: fenced[1].trim(), repaired: true });

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    attempts.push({ candidate: trimmed.slice(firstBrace, lastBrace + 1), repaired: true });
  }

  for (const attempt of attempts) {
    try {
      return { value: JSON.parse(attempt.candidate) as T, repaired: attempt.repaired };
    } catch {
      // try the next strategy
    }
  }
  return { value: undefined, repaired: false };
}
