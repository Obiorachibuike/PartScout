import { type AIProviderId, aiConfig, isAIReady } from "@/lib/config";
import type { AIProvider } from "@/lib/providers/ai/AIProvider";
import type { AIUsageSink } from "@/lib/providers/ai/BaseAIProvider";
import { OpenAIProvider } from "@/lib/providers/ai/OpenAIProvider";
import { GeminiProvider } from "@/lib/providers/ai/GeminiProvider";
import { AnthropicProvider } from "@/lib/providers/ai/AnthropicProvider";

/**
 * Provider registry.
 *
 * `AI_PROVIDER` selects the implementation; switching providers never requires
 * touching business logic because everything downstream depends on the
 * `AIProvider` interface only.
 */

const registry: Record<Exclude<AIProviderId, "none">, (options: ProviderOptions) => AIProvider> = {
  openai: (options) => new OpenAIProvider(options),
  gemini: (options) => new GeminiProvider(options),
  anthropic: (options) => new AnthropicProvider(options),
};

export interface ProviderOptions {
  usageSink?: AIUsageSink;
  timeoutMs?: number;
}

export function createAIProvider(id: AIProviderId, options: ProviderOptions = {}): AIProvider | null {
  if (id === "none") return null;
  const factory = registry[id];
  if (!factory) return null;
  return factory(options);
}

/**
 * Returns the configured provider (or null when AI is disabled / unconfigured).
 * Never throws — a missing AI key degrades gracefully to the deterministic
 * engine instead of breaking research.
 */
export function getAIProvider(options: ProviderOptions = {}): AIProvider | null {
  if (!isAIReady()) return null;
  return createAIProvider(aiConfig.providerId, options);
}

export function describeAIProvider(): {
  id: AIProviderId;
  configured: boolean;
  fastModel: string | null;
  smartModel: string | null;
  supportsVision: boolean;
} {
  const provider = createAIProvider(aiConfig.providerId);
  return {
    id: aiConfig.providerId,
    configured: isAIReady(),
    fastModel: provider?.isConfigured() ? provider.modelFor("fast") : null,
    smartModel: provider?.isConfigured() ? provider.modelFor("smart") : null,
    supportsVision: provider?.supportsVision ?? false,
  };
}
