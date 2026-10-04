import type { ResearchReport, SearchResult } from "@/types/research";
import { cacheConfig } from "@/lib/config";
import { withDb } from "@/lib/db/client";
import type { ResearchCacheRow, SearchCacheRow, SourceCacheRow } from "@/lib/db/types";
import { logger } from "@/lib/logger";
import { sourceCacheKey } from "@/lib/hash";

/**
 * Caching layer.
 *
 * Web research and AI reasoning cost real money, so three caches are layered:
 *
 *   search   provider responses per (provider, query, options)
 *   source   extracted page text per canonical URL
 *   research whole reports per (normalised query, pipeline version, providers)
 *
 * Postgres is the shared cache (survives restarts and is shared across instances).
 * When no database is configured a bounded in-process cache is used so local
 * development still benefits. Every read respects TTL and every miss is silent.
 */

interface MemoryEntry<T> {
  value: T;
  expiresAt: number;
}

const MEMORY_LIMIT = 300;

interface MemoryStores {
  research: Map<string, MemoryEntry<ResearchReport>>;
  search: Map<string, MemoryEntry<SearchResult[]>>;
  source: Map<string, MemoryEntry<CachedSourceContent>>;
}

/**
 * The in-process cache is attached to `globalThis` on purpose.
 *
 * Next.js runs route handlers and React Server Components in separate module
 * registries within one process, so a module-scoped Map would exist twice and a
 * report written by `/api/research` would be invisible to `/results/[id]` when no
 * database is configured. Sharing one instance keeps the degraded (no
 * Postgres) mode coherent.
 */
const globalCache = globalThis as typeof globalThis & { __partscoutMemoryCache?: MemoryStores };
const memory: MemoryStores = (globalCache.__partscoutMemoryCache ??= {
  research: new Map<string, MemoryEntry<ResearchReport>>(),
  search: new Map<string, MemoryEntry<SearchResult[]>>(),
  source: new Map<string, MemoryEntry<CachedSourceContent>>(),
});

function memoryGet<T>(store: Map<string, MemoryEntry<T>>, key: string): T | null {
  const entry = store.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

function memoryPut<T>(store: Map<string, MemoryEntry<T>>, key: string, value: T, ttlMs: number): void {
  if (store.size >= MEMORY_LIMIT) {
    const oldest = store.keys().next().value;
    if (oldest) store.delete(oldest);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export interface CachedSourceContent {
  url: string;
  title: string;
  domain: string;
  text: string;
  fetched: boolean;
  wordCount: number;
}

/* ------------------------------- research --------------------------------- */

export async function getCachedResearch(cacheKey: string): Promise<{ report: ResearchReport; createdAt: Date } | null> {
  if (!cacheConfig.enabled) return null;

  const fromMemory = memoryGet(memory.research, cacheKey);
  if (fromMemory) return { report: fromMemory, createdAt: new Date() };

  return withDb(async (client) => {
    const row: ResearchCacheRow | null = await client.researchCache.findUnique({ where: { key: cacheKey } });
    if (!row) return null;
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      // Expired: clean up lazily and report a miss so the research can refresh.
      await client.researchCache.deleteMany({ where: { key: cacheKey } });
      return null;
    }
    void client.researchCache
      .update({ where: { key: cacheKey }, data: { hits: row.hits + 1 } })
      .catch(() => undefined);
    return { report: row.report as ResearchReport, createdAt: new Date(row.createdAt) };
  });
}

export async function putCachedResearch(input: {
  cacheKey: string;
  normalisedQuery: string;
  intent: string;
  report: ResearchReport;
  verdict: string;
  confidenceScore: number;
}): Promise<void> {
  if (!cacheConfig.enabled) return;
  const ttlMs = cacheConfig.researchTtlMinutes * 60_000;

  memoryPut(memory.research, input.cacheKey, input.report, ttlMs);
  // Alias by report id so /results/<id> works even when no database is
  // configured (research is then ephemeral but still shareable in-process).
  memoryPut(memory.research, `id:${input.report.id}`, input.report, ttlMs);

  await withDb(async (client) => {
    const expiresAt = new Date(Date.now() + ttlMs);
    await client.researchCache.upsert({
      where: { key: input.cacheKey },
      create: {
        key: input.cacheKey,
        normalisedQuery: input.normalisedQuery,
        intent: input.intent,
        report: input.report as unknown as Record<string, unknown>,
        verdict: input.verdict,
        confidenceScore: input.confidenceScore,
        expiresAt,
      },
      update: {
        report: input.report as unknown as Record<string, unknown>,
        verdict: input.verdict,
        confidenceScore: input.confidenceScore,
        expiresAt,
      },
    });
  });
}

/**
 * In-process lookup by report id. Postgres keeps its own id index
 * (ResearchSession); this covers the "database not configured" deployment mode
 * where reports live only in the local research cache.
 */
export function getMemoryCachedReportById(id: string): ResearchReport | null {
  if (!cacheConfig.enabled) return null;
  return memoryGet(memory.research, `id:${id}`);
}

/** Manual refresh: drop the cached report so the next request re-researches. */
export async function invalidateCachedResearch(cacheKey: string): Promise<void> {
  memory.research.delete(cacheKey);
  await withDb(async (client) => {
    await client.researchCache.deleteMany({ where: { key: cacheKey } });
  });
}

export async function researchCacheStats(): Promise<{ entries: number; hits: number }> {
  const memoryEntries = memory.research.size;
  const persisted = await withDb(async (client) => {
    const rows = await client.researchCache.findMany({ take: 1_000 });
    return rows.reduce(
      (totals, row) => ({ entries: totals.entries + 1, hits: totals.hits + row.hits }),
      { entries: 0, hits: 0 },
    );
  });
  return persisted ?? { entries: memoryEntries, hits: 0 };
}

/* -------------------------------- search ---------------------------------- */

export async function getCachedSearchResults(key: string): Promise<SearchResult[] | null> {
  if (!cacheConfig.enabled) return null;
  const fromMemory = memoryGet(memory.search, key);
  if (fromMemory) return fromMemory;

  return withDb(async (client) => {
    const row: SearchCacheRow | null = await client.searchCache.findUnique({ where: { key } });
    if (!row) return null;
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      await client.searchCache.deleteMany({ where: { key } });
      return null;
    }
    await client.searchCache.update({ where: { key }, data: { hits: row.hits + 1 } }).catch(() => undefined);
    return row.payload as SearchResult[];
  });
}

export async function putCachedSearchResults(input: {
  key: string;
  provider: string;
  query: string;
  results: SearchResult[];
}): Promise<void> {
  if (!cacheConfig.enabled) return;
  const ttlMs = cacheConfig.searchTtlMinutes * 60_000;
  memoryPut(memory.search, input.key, input.results, ttlMs);

  await withDb(async (client) => {
    const expiresAt = new Date(Date.now() + ttlMs);
    await client.searchCache.upsert({
      where: { key: input.key },
      create: {
        key: input.key,
        provider: input.provider,
        query: input.query.slice(0, 500),
        payload: input.results as unknown as Record<string, unknown>,
        expiresAt,
      },
      update: { payload: input.results as unknown as Record<string, unknown>, expiresAt },
    });
  });
}

/* -------------------------------- sources --------------------------------- */

export async function getCachedSource(url: string): Promise<CachedSourceContent | null> {
  if (!cacheConfig.enabled) return null;
  const key = sourceCacheKey(url);
  const fromMemory = memoryGet(memory.source, key);
  if (fromMemory) return fromMemory;

  return withDb(async (client) => {
    const row: SourceCacheRow | null = await client.sourceCache.findUnique({ where: { key } });
    if (!row) return null;
    if (new Date(row.expiresAt).getTime() < Date.now()) {
      await client.sourceCache.deleteMany({ where: { key } });
      return null;
    }
    return {
      url: row.url,
      title: row.title ?? "",
      domain: row.domain ?? "",
      text: row.text,
      fetched: row.fetched,
      wordCount: row.wordCount,
    };
  });
}

export async function putCachedSource(content: CachedSourceContent): Promise<void> {
  if (!cacheConfig.enabled) return;
  const key = sourceCacheKey(content.url);
  const ttlMs = cacheConfig.sourceTtlMinutes * 60_000;
  memoryPut(memory.source, key, content, ttlMs);

  await withDb(async (client) => {
    const expiresAt = new Date(Date.now() + ttlMs);
    await client.sourceCache.upsert({
      where: { key },
      create: {
        key,
        url: content.url,
        title: content.title.slice(0, 300),
        domain: content.domain,
        text: content.text,
        wordCount: content.wordCount,
        fetched: content.fetched,
        expiresAt,
      },
      update: {
        title: content.title.slice(0, 300),
        text: content.text,
        wordCount: content.wordCount,
        expiresAt,
      },
    });
  });
}

/** Removes obviously stale cache rows (called opportunistically, never blocking). */
export async function pruneExpiredCache(): Promise<void> {
  await withDb(async (client) => {
    const now = new Date();
    const results = await Promise.all([
      client.researchCache.deleteMany({ where: { expiresAt: { lt: now } } }),
      client.searchCache.deleteMany({ where: { expiresAt: { lt: now } } }),
      client.sourceCache.deleteMany({ where: { expiresAt: { lt: now } } }),
    ]);
    logger.debug("pruned expired cache rows", {
      research: results[0]?.count ?? 0,
      search: results[1]?.count ?? 0,
      source: results[2]?.count ?? 0,
    });
  });
}

export function clearMemoryCache(): void {
  memory.research.clear();
  memory.search.clear();
  memory.source.clear();
}
