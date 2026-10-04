import { aiConfig, type AIProviderId } from "@/lib/config";
import { ProviderNotConfiguredError } from "@/lib/errors";
import {
  BaseAIProvider,
  type AIUsageSink,
  type ModelCallRequest,
  type ModelCallResult,
} from "@/lib/providers/ai/BaseAIProvider";
import { mergeSignals, safeErrorText } from "@/lib/providers/ai/OpenAIProvider";
import type { AIModelTier } from "@/lib/providers/ai/AIProvider";

/** Anthropic Claude implementation (Messages API, tool-free JSON prompting). */
export class AnthropicProvider extends BaseAIProvider {
  readonly id: AIProviderId = "anthropic";
  readonly supportsVision = true;
  private static readonly API_VERSION = "2023-06-01";

  constructor(options: { usageSink?: AIUsageSink; timeoutMs?: number } = {}) {
    super(options);
  }

  isConfigured(): boolean {
    return Boolean(aiConfig.anthropic.apiKey);
  }

  modelFor(tier: AIModelTier): string {
    return tier === "smart" ? aiConfig.anthropic.modelSmart : aiConfig.anthropic.modelFast;
  }

  protected async callModel(request: ModelCallRequest): Promise<ModelCallResult> {
    if (!this.isConfigured()) {
      throw new ProviderNotConfiguredError("ANTHROPIC_API_KEY is not configured", [
        "Set ANTHROPIC_API_KEY, or switch AI_PROVIDER to another configured provider.",
      ]);
    }
    const model = this.modelFor(request.tier);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const signal = mergeSignals(request.signal, controller.signal);

    const content: unknown[] = [{ type: "text", text: request.user }];
    for (const image of request.images ?? []) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: image.mimeType, data: image.base64 },
      });
    }

    // Claude has no JSON mode; we ask explicitly and parse leniently downstream.
    const system = request.json
      ? `${request.system}\n\nRespond with a single JSON object and nothing else.`
      : request.system;

    try {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": aiConfig.anthropic.apiKey,
          "anthropic-version": AnthropicProvider.API_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: request.maxOutputTokens ?? 1_200,
          temperature: request.temperature ?? 0.2,
          system,
          messages: [{ role: "user", content: request.images?.length ? content : request.user }],
        }),
        signal,
      });

      if (!response.ok) {
        const detail = await safeErrorText(response);
        throw new Error(`Anthropic ${response.status}: ${detail}`);
      }

      const payload = (await response.json()) as {
        content?: Array<{ type: string; text?: string }>;
        usage?: { input_tokens?: number; output_tokens?: number };
        model?: string;
        stop_reason?: string;
      };

      const text = (payload.content ?? [])
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");

      return {
        text,
        promptTokens: payload.usage?.input_tokens ?? 0,
        completionTokens: payload.usage?.output_tokens ?? 0,
        model: payload.model ?? model,
        blocked: payload.stop_reason === "refusal",
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
