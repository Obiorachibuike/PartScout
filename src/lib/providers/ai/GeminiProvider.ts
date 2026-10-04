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

/** Google Gemini implementation (generateContent API, JSON mode, vision). */
export class GeminiProvider extends BaseAIProvider {
  readonly id: AIProviderId = "gemini";
  readonly supportsVision = true;

  constructor(options: { usageSink?: AIUsageSink; timeoutMs?: number } = {}) {
    super(options);
  }

  isConfigured(): boolean {
    return Boolean(aiConfig.gemini.apiKey);
  }

  modelFor(tier: AIModelTier): string {
    return tier === "smart" ? aiConfig.gemini.modelSmart : aiConfig.gemini.modelFast;
  }

  protected async callModel(request: ModelCallRequest): Promise<ModelCallResult> {
    if (!this.isConfigured()) {
      throw new ProviderNotConfiguredError("GEMINI_API_KEY is not configured", [
        "Set GEMINI_API_KEY, or switch AI_PROVIDER to another configured provider.",
      ]);
    }
    const model = this.modelFor(request.tier);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs);
    const signal = mergeSignals(request.signal, controller.signal);

    const parts: unknown[] = [{ text: request.user }];
    for (const image of request.images ?? []) {
      parts.push({ inlineData: { mimeType: image.mimeType, data: image.base64 } });
    }

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-goog-api-key": aiConfig.gemini.apiKey,
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: request.system }] },
            contents: [{ role: "user", parts }],
            generationConfig: {
              temperature: request.temperature ?? 0.2,
              maxOutputTokens: request.maxOutputTokens ?? 1_200,
              ...(request.json ? { responseMimeType: "application/json" } : {}),
            },
            safetySettings: [
              { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
              { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
              { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
              { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
            ],
          }),
          signal,
        },
      );

      if (!response.ok) {
        const detail = await safeErrorText(response);
        throw new Error(`Gemini ${response.status}: ${detail}`);
      }

      const payload = (await response.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
          finishReason?: string;
        }>;
        usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number };
        modelVersion?: string;
      };

      const candidate = payload.candidates?.[0];
      const text = (candidate?.content?.parts ?? [])
        .map((part) => part.text ?? "")
        .join("");

      return {
        text,
        promptTokens: payload.usageMetadata?.promptTokenCount ?? 0,
        completionTokens: payload.usageMetadata?.candidatesTokenCount ?? 0,
        model: payload.modelVersion ?? model,
        blocked: candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT",
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
