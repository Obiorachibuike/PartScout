import { aiConfig, type AIProviderId } from "@/lib/config";
import { ProviderNotConfiguredError } from "@/lib/errors";
import {
  BaseAIProvider,
  type AIUsageSink,
  type ModelCallRequest,
  type ModelCallResult,
} from "@/lib/providers/ai/BaseAIProvider";
import type { AIModelTier } from "@/lib/providers/ai/AIProvider";

/** OpenAI implementation (Chat Completions API, JSON mode, vision). */
export class OpenAIProvider extends BaseAIProvider {
  readonly id: AIProviderId = "openai";
  readonly supportsVision = true;

  constructor(options: { usageSink?: AIUsageSink; timeoutMs?: number } = {}) {
    super(options);
  }

  isConfigured(): boolean {
    return Boolean(aiConfig.openai.apiKey);
  }

  modelFor(tier: AIModelTier): string {
    return tier === "smart" ? aiConfig.openai.modelSmart : aiConfig.openai.modelFast;
  }

  protected async callModel(request: ModelCallRequest): Promise<ModelCallResult> {
    if (!this.isConfigured()) {
      throw new ProviderNotConfiguredError("OPENAI_API_KEY is not configured", [
        "Set OPENAI_API_KEY, or switch AI_PROVIDER to another configured provider.",
      ]);
    }
    const model = this.modelFor(request.tier);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const signal = mergeSignals(request.signal, controller.signal);

    const content: unknown[] = [{ type: "text", text: request.user }];
    if (request.images?.length) {
      for (const image of request.images) {
        content.push({
          type: "image_url",
          image_url: { url: `data:${image.mimeType};base64,${image.base64}` },
        });
      }
    }

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${aiConfig.openai.apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: request.system },
            { role: "user", content: request.images?.length ? content : request.user },
          ],
          temperature: request.temperature ?? 0.2,
          max_completion_tokens: request.maxOutputTokens ?? 1_200,
          ...(request.json ? { response_format: { type: "json_object" } } : {}),
        }),
        signal,
      });

      if (!response.ok) {
        const detail = await safeErrorText(response);
        throw new Error(`OpenAI ${response.status}: ${detail}`);
      }

      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
        model?: string;
      };

      const text = payload.choices?.[0]?.message?.content ?? "";
      return {
        text,
        promptTokens: payload.usage?.prompt_tokens ?? 0,
        completionTokens: payload.usage?.completion_tokens ?? 0,
        model: payload.model ?? model,
        blocked: payload.choices?.[0]?.finish_reason === "content_filter",
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function mergeSignals(...signals: Array<AbortSignal | undefined>): AbortSignal {
  const usable = signals.filter((signal): signal is AbortSignal => Boolean(signal));
  if (usable.length === 1) return usable[0]!;
  const controller = new AbortController();
  for (const signal of usable) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      break;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

export async function safeErrorText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 400);
  } catch {
    return "(no body)";
  }
}
