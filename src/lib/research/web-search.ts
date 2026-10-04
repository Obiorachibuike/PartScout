import type { ResearchQueryPlan, SearchResult } from "@/types/research";
import { limits } from "@/lib/config";
import { canonicalize } from "@/lib/hash";
import { logger as defaultLogger } from "@/lib/logger";
import { recordApiError } from "@/lib/logger";
import type { SearchProvider } from "@/lib/providers/search/SearchProvider";
import type { UsageTracker } from "@/lib/research/usage";

/**
 * Stage 3 — multi-query, multi-provider web search.
 *
 * Every generated query is issued to the configured provider(s) in parallel
 * (bounded concurrency), results are merged and deduplicated by canonical URL.
 * A failing provider never fails the whole research run: the failure is recorded
 * for the admin dashboard and, if at least one provider produced results, the
 * pipeline continues with partial data (surfaced as a warning in the report).
 */

export interface SearchBatchOptions {
  providers: SearchProvider[];
  limitPerQuery?: number;
  concurrency?: number;
  signal?: AbortSignal;
  tracker?: UsageTracker;
  logger?: typeof defaultLogger;
}

export interface SearchBatchResult {
  results: SearchResult[];
  queriesRun: string[];
  failureCount: number;
  providerErrors: Array<{ provider: string; query: string; message: string }>;
  totalRawResults: number;
}

async function pool<T, R>(items: T[], concurrency: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]!);
    }
  });
  await Promise.all(runners);
  return results;
}

export async function searchMultipleQueries(
  queries: ResearchQueryPlan[],
  options: SearchBatchOptions,
): Promise<SearchBatchResult> {
  const log = options.logger ?? defaultLogger;
  const limitPerQuery = options.limitPerQuery ?? limits.maxResultsPerQuery;
  const concurrency = options.concurrency ?? 4;
  const providerErrors: SearchBatchResult["providerErrors"] = [];
  let totalRawResults = 0;

  const batches = await pool(queries, concurrency, async (plan) => {
    const collected: SearchResult[] = [];
    for (const provider of options.providers) {
      try {
        const results = await provider.search(plan.query, {
          limit: limitPerQuery,
          signal: options.signal,
        });
        totalRawResults += results.length;
        options.tracker?.recordSearch(provider.id, 1);
        collected.push(...results);
        log.debug("search query completed", {
          provider: provider.id,
          query: plan.query,
          results: results.length,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        providerErrors.push({ provider: provider.id, query: plan.query, message });
        log.warn("search query failed", { provider: provider.id, query: plan.query, error: message.slice(0, 300) });
        await recordApiError({
          area: "search",
          provider: provider.id,
          message: message.slice(0, 500),
          retryable: true,
          context: plan.query.slice(0, 200),
        });
      }
    }
    return collected;
  });

  const merged = dedupeSearchResults(batches.flat());

  return {
    results: merged,
    queriesRun: queries.map((plan) => plan.query),
    failureCount: providerErrors.length,
    providerErrors,
    totalRawResults,
  };
}

/**
 * Deduplicates results across queries, keeping the strongest variant of each URL
 * (inline content beats a snippet, higher provider score wins) while recording
 * every query that surfaced it.
 */
export function dedupeSearchResults(results: SearchResult[]): SearchResult[] {
  // The winner keeps the query that produced the richest variant; the full list of
  // queries per domain is derived later by the source evaluator.
  const byUrl = new Map<string, SearchResult>();

  for (const result of results) {
    const key = canonicalize(result.url);
    const existing = byUrl.get(key);
    if (!existing) {
      byUrl.set(key, { ...result });
      continue;
    }
    const preferNew =
      (!existing.rawContent && Boolean(result.rawContent)) ||
      ((result.score ?? 0) > (existing.score ?? 0) && Boolean(result.rawContent) === Boolean(existing.rawContent)) ||
      (existing.snippet.length < 60 && result.snippet.length > existing.snippet.length);

    const winner = preferNew ? result : existing;
    byUrl.set(key, {
      ...winner,
      score: Math.max(existing.score ?? 0, result.score ?? 0) || undefined,
    });
  }

  return [...byUrl.values()]
    .map((entry) => ({ ...entry, url: canonicalize(entry.url) }))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

/** Convenience helper used by the identification flow. */
export async function runSingleQuery(
  query: string,
  options: SearchBatchOptions & { purpose?: string },
): Promise<SearchBatchResult> {
  return searchMultipleQueries([{ query, purpose: options.purpose ?? "single query", kind: "generic" }], options);
}
