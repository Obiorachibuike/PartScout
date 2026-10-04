import type { UsageSummary } from "@/types/research";
import type { AIUsageSink } from "@/lib/providers/ai/BaseAIProvider";
import type { AIProviderId } from "@/lib/config";

/**
 * Per-research usage + cost accounting.
 *
 * PartScout caps work per request (queries, pages, tokens) and records what was
 * actually spent so the admin dashboard can answer "what does research cost?".
 * Prices below are documented list prices used for *estimates only* — the
 * README explains how to update them when providers change pricing.
 */

const SEARCH_COST_PER_CALL: Record<string, number> = {
  tavily: 0.008,
  exa: 0.005,
  serper: 0.001,
  brave: 0.005,
  fixture: 0,
};

/** USD per 1M tokens, matched by model-id prefix (longest match wins). */
const AI_TOKEN_PRICES: Array<{ prefix: string; input: number; output: number }> = [
  { prefix: "gemini-3-pro", input: 1.25, output: 10 },
  { prefix: "gemini-3-flash", input: 0.1, output: 0.4 },
  { prefix: "gemini-2.5-pro", input: 1.25, output: 10 },
  { prefix: "gemini-2.5-flash", input: 0.3, output: 2.5 },
  { prefix: "gpt-5-mini", input: 0.25, output: 2 },
  { prefix: "gpt-5", input: 1.25, output: 10 },
  { prefix: "gpt-4.1-mini", input: 0.4, output: 1.6 },
  { prefix: "claude-haiku", input: 1, output: 5 },
  { prefix: "claude-sonnet", input: 3, output: 15 },
  { prefix: "claude-opus", input: 15, output: 75 },
];

export function estimateAiCost(model: string, promptTokens: number, completionTokens: number): number {
  const match = [...AI_TOKEN_PRICES]
    .sort((a, b) => b.prefix.length - a.prefix.length)
    .find((entry) => model.toLowerCase().startsWith(entry.prefix));
  if (!match) return 0;
  return (promptTokens / 1_000_000) * match.input + (completionTokens / 1_000_000) * match.output;
}

export interface AiCallRecord {
  provider: AIProviderId;
  model: string;
  label: string;
  promptTokens: number;
  completionTokens: number;
  latencyMs: number;
  tier: string;
}

export class UsageTracker {
  readonly startedAt = Date.now();
  searchCalls = 0;
  pagesFetched = 0;
  aiCalls = 0;
  aiPromptTokens = 0;
  aiCompletionTokens = 0;
  estimatedCostUsd = 0;
  readonly searchProviders = new Set<string>();
  readonly aiCalls_detail: AiCallRecord[] = [];

  recordSearch(providerId: string, calls = 1): void {
    this.searchCalls += calls;
    this.searchProviders.add(providerId);
    this.estimatedCostUsd += (SEARCH_COST_PER_CALL[providerId] ?? 0) * calls;
  }

  recordPageFetch(count = 1): void {
    this.pagesFetched += count;
  }

  /** `AIUsageSink` implementation handed to provider instances. */
  readonly aiSink: AIUsageSink = {
    record: (entry) => {
      this.aiCalls += 1;
      this.aiPromptTokens += entry.promptTokens;
      this.aiCompletionTokens += entry.completionTokens;
      this.estimatedCostUsd += estimateAiCost(entry.model, entry.promptTokens, entry.completionTokens);
      this.aiCalls_detail.push({
        provider: entry.provider,
        model: entry.model,
        label: entry.label,
        promptTokens: entry.promptTokens,
        completionTokens: entry.completionTokens,
        latencyMs: entry.latencyMs,
        tier: entry.tier,
      });
    },
  };

  toSummary(options: { cached: boolean; durationMs?: number }): UsageSummary {
    return {
      searchCalls: this.searchCalls,
      pagesFetched: this.pagesFetched,
      aiCalls: this.aiCalls,
      aiPromptTokens: this.aiPromptTokens,
      aiCompletionTokens: this.aiCompletionTokens,
      durationMs: options.durationMs ?? Date.now() - this.startedAt,
      estimatedCostUsd: Number(this.estimatedCostUsd.toFixed(6)),
      cached: options.cached,
    };
  }
}

export const emptyUsageSummary = (cached = false): UsageSummary => ({
  searchCalls: 0,
  pagesFetched: 0,
  aiCalls: 0,
  aiPromptTokens: 0,
  aiCompletionTokens: 0,
  durationMs: 0,
  estimatedCostUsd: 0,
  cached,
});
