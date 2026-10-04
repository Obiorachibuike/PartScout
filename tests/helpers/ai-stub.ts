import type {
  AIJsonRequest,
  AIJsonResponse,
  AIProvider,
  AITextRequest,
  AITextResponse,
  AIVisionRequest,
  AnswerGenerationInput,
  AnswerGenerationResult,
  CompatibilityReasoningInput,
  CompatibilityReasoningResult,
  ExtractEvidenceInput,
  ExtractEvidenceResult,
  IdentifyPartInput,
  PartIdentificationResult,
  QueryUnderstandingSuggestion,
  UnderstandQueryInput,
  AIModelTier,
} from "@/lib/providers/ai/AIProvider";

/**
 * Deterministic AI provider double.
 *
 * The pipeline must behave identically whether or not a model is configured (the
 * model is only ever a reasoning/reading layer), so tests can inject this stub to
 * prove the AI paths add no compatibility facts of their own.
 */
export class StubAIProvider implements AIProvider {
  readonly id = "openai" as const;
  readonly supportsVision = true;
  calls: string[] = [];

  constructor(
    private readonly visionResult: PartIdentificationResult = {
      identifierType: "part_number",
      identifier: "BN5A",
      candidateDevice: "Galaxy A15 4G",
      manufacturer: "Samsung",
      partCategory: "battery",
      parts: [{ name: "Battery", partNumber: "BN5A", label: "Model", value: "BN5A" }],
      printedText: ["BN5A", "3.87V", "5000mAh"],
      confidence: 0.82,
      notes: [],
    },
  ) {}

  isConfigured(): boolean {
    return true;
  }

  modelFor(tier: AIModelTier): string {
    return tier === "smart" ? "stub-smart" : "stub-fast";
  }

  async complete(request: AITextRequest): Promise<AITextResponse> {
    this.calls.push(request.label);
    return {
      text: "stub",
      usage: { provider: this.id, model: this.modelFor(request.tier ?? "fast"), promptTokens: 10, completionTokens: 5, latencyMs: 1 },
    };
  }

  async completeJson<T>(request: AIJsonRequest<T>): Promise<AIJsonResponse<T>> {
    this.calls.push(request.label);
    return {
      data: request.schema.parse({}) as T,
      repaired: false,
      usage: { provider: this.id, model: this.modelFor(request.tier ?? "fast"), promptTokens: 10, completionTokens: 5, latencyMs: 1 },
    };
  }

  async completeVisionJson<T>(request: AIVisionRequest<T>): Promise<AIJsonResponse<T>> {
    this.calls.push(request.label);
    return {
      data: request.schema.parse(this.visionResult) as T,
      repaired: false,
      usage: { provider: this.id, model: "stub-vision", promptTokens: 40, completionTokens: 20, latencyMs: 1 },
    };
  }

  async understandQuery(_input: UnderstandQueryInput): Promise<QueryUnderstandingSuggestion> {
    return {};
  }

  async extractEvidence(_input: ExtractEvidenceInput): Promise<ExtractEvidenceResult> {
    return { claims: [], notes: [] };
  }

  async analyzeCompatibility(_input: CompatibilityReasoningInput): Promise<CompatibilityReasoningResult> {
    return { assessment: "uncertain", reasoning: [], caveats: [], inferredChecks: [] };
  }

  async generateAnswer(_input: AnswerGenerationInput): Promise<AnswerGenerationResult> {
    return { answer: "", summaryBullets: [], verifyBeforeInstall: [] };
  }

  async identifyPartImage(_input: IdentifyPartInput): Promise<PartIdentificationResult> {
    this.calls.push("identify_part_image");
    return this.visionResult;
  }
}
