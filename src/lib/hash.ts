import { createHash } from "node:crypto";

/** Stable SHA-256 hex digest of an arbitrary JSON-serialisable value. */
export function stableHash(value: unknown): string {
  return createHash("sha256").update(stableKey(value)).digest("hex");
}

/** Deterministic stringification (object keys sorted) used for cache keys. */
export function stableKey(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return Object.fromEntries(entries.map(([k, v]) => [k, sortValue(v)]));
  }
  return value;
}

export function shortHash(value: unknown, length = 12): string {
  return stableHash(value).slice(0, length);
}

/** Collision-resistant id with a readable prefix (no external dependency). */
export function makeId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}${random}`;
}

/**
 * Cache key for a research request. Includes the pipeline version so a change
 * to the reasoning logic invalidates previously cached reports.
 */
export function researchCacheKey(input: {
  normalizedQuestion: string;
  intent: string;
  pipelineVersion: string;
  providerIds: string[];
  mode?: string;
}): string {
  return stableHash({
    q: input.normalizedQuestion,
    intent: input.intent,
    v: input.pipelineVersion,
    p: [...input.providerIds].sort(),
    m: input.mode ?? "default",
  });
}

export function searchCacheKey(input: {
  provider: string;
  query: string;
  limit: number;
  recencyDays?: number;
}): string {
  return stableHash({
    provider: input.provider,
    q: input.query.trim().toLowerCase(),
    l: input.limit,
    r: input.recencyDays ?? null,
  });
}

export function sourceCacheKey(url: string): string {
  return stableHash({ url: canonicalize(url) });
}

/** Cache key for an image identification request (content-addressed). */
export function imageCacheKey(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Best-effort URL canonicalisation for dedupe purposes: drops tracking params,
 * fragments and common listing noise while keeping meaningful query params.
 */
export function canonicalize(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.protocol = "https:";
    const dropPrefixes = ["utm_", "gclid", "fbclid", "mc_", "_ga", "ref", "aff", "affiliate"];
    for (const key of [...url.searchParams.keys()]) {
      const lowered = key.toLowerCase();
      if (dropPrefixes.some((prefix) => lowered.startsWith(prefix))) url.searchParams.delete(key);
    }
    const orderedParams = [...url.searchParams.entries()].sort(([a], [b]) => (a < b ? -1 : 1));
    url.search = orderedParams.length ? `?${new URLSearchParams(orderedParams).toString()}` : "";
    // strip trailing slash for stable dedupe
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    return url.toString();
  } catch {
    return rawUrl.trim();
  }
}
