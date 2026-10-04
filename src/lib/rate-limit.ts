import { RateLimitError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Process-local sliding-window rate limiter.
 *
 * Deliberately dependency-free: for a single-node deployment this is enough,
 * and the interface is swappable for Redis/Upstash in a multi-region setup
 * (see README → Scaling). Every expensive endpoint (research, identify) is
 * additionally protected by the per-user DB usage records.
 */

interface Bucket {
  timestamps: number[];
}

const buckets = new Map<string, Bucket>();

const MAX_TRACKED_KEYS = 5_000;

function prune(now: number, windowMs: number) {
  for (const [key, bucket] of buckets) {
    bucket.timestamps = bucket.timestamps.filter((at) => now - at < windowMs);
    if (bucket.timestamps.length === 0) buckets.delete(key);
  }
}

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
  /** Throw a RateLimitError instead of returning a result. */
  throwOnLimit?: boolean;
  message?: string;
}

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterMs: number;
  limit: number;
}

export function checkRateLimit(options: RateLimitOptions): RateLimitResult {
  const { key, limit, windowMs } = options;
  const now = Date.now();

  if (buckets.size > MAX_TRACKED_KEYS) prune(now, windowMs);

  const bucket = buckets.get(key) ?? { timestamps: [] };
  bucket.timestamps = bucket.timestamps.filter((at) => now - at < windowMs);

  if (bucket.timestamps.length >= limit) {
    const oldest = bucket.timestamps[0]!;
    const retryAfterMs = Math.max(0, windowMs - (now - oldest));
    buckets.set(key, bucket);
    if (options.throwOnLimit) {
      throw new RateLimitError(
        options.message ??
          `Research limit reached (${limit} per ${Math.round(windowMs / 60_000)} minutes). Try again in ${Math.ceil(retryAfterMs / 60_000)} minute(s).`,
      );
    }
    return { ok: false, remaining: 0, retryAfterMs, limit };
  }

  bucket.timestamps.push(now);
  buckets.set(key, bucket);
  return {
    ok: true,
    remaining: Math.max(0, limit - bucket.timestamps.length),
    retryAfterMs: 0,
    limit,
  };
}

/** Best-effort client IP extraction from proxy headers. */
export function clientIp(request: Request): string {
  const headers = request.headers;
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    headers.get("cf-connecting-ip") ||
    headers.get("x-real-ip") ||
    headers.get("x-vercel-forwarded-for") ||
    "unknown"
  );
}

export function rateLimitKey(scope: string, identifier: string): string {
  return `${scope}:${identifier}`;
}

logger.debug("rate limiter initialised (in-process sliding window)");
