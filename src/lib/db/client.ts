import { appConfig } from "@/lib/config";
import { logger } from "@/lib/logger";
import type { PartScoutClient } from "@/lib/db/types";

/**
 * Lazy, failure-tolerant Prisma loader.
 *
 * The Prisma client is resolved at runtime (never bundled) and every operation is
 * wrapped so that a missing/unreachable database degrades PartScout instead of
 * breaking it:
 *
 *   - research still runs and is returned to the user
 *   - history, saved searches, feedback and cache are simply unavailable
 *   - the UI/admin surfaces a clear "database not configured" notice
 *
 * Tests can inject their own client with `setDatabaseClientForTesting()`.
 */

let cachedClient: PartScoutClient | null = null;
let loadAttempted = false;
let available = false;
let lastProbeAt = 0;
const PROBE_INTERVAL_MS = 60_000;

function runtimeRequire(): ((id: string) => unknown) | null {
  try {
    const moduleBuiltin = (
      process as unknown as { getBuiltinModule?: (id: string) => unknown }
    ).getBuiltinModule?.("module") as { createRequire?: (path: string) => (id: string) => unknown } | undefined;
    if (moduleBuiltin?.createRequire) {
      const req = moduleBuiltin.createRequire(`${process.cwd()}/partscout-db.cjs`);
      return (id: string) => req(id);
    }
  } catch {
    // fall through to global require below
  }
  const globalRequire = (globalThis as { require?: (id: string) => unknown }).require;
  return typeof globalRequire === "function" ? globalRequire : null;
}

function loadPrismaClient(): PartScoutClient | null {
  if (loadAttempted) return cachedClient;
  loadAttempted = true;

  if (!appConfig.databaseUrl) {
    logger.info("DATABASE_URL not set — running in degraded mode (no persistence, no cache)");
    return null;
  }

  const req = runtimeRequire();
  if (!req) {
    logger.warn("no CommonJS require available to load @prisma/client — persistence disabled");
    return null;
  }

  try {
    const mod = req("@prisma/client") as { PrismaClient?: new () => unknown } | undefined;
    if (!mod?.PrismaClient) {
      logger.warn("@prisma/client has no exported PrismaClient — run `npm run db:generate` (persistence disabled)");
      return null;
    }
    const instance = new mod.PrismaClient() as unknown as PartScoutClient;
    cachedClient = instance;
    logger.info("Prisma client loaded");
    return cachedClient;
  } catch (error) {
    logger.warn("could not initialise Prisma client — persistence disabled", {
      error: error instanceof Error ? error.message.slice(0, 300) : String(error),
    });
    return null;
  }
}

export function getDatabaseClient(): PartScoutClient | null {
  return loadPrismaClient();
}

/**
 * Probes connectivity (cached for a minute) so hot paths do not hammer a dead
 * database. Returns true when persistence is usable right now.
 */
export async function isDatabaseAvailable(): Promise<boolean> {
  const client = getDatabaseClient();
  if (!client) return false;
  const now = Date.now();
  if (available && now - lastProbeAt < PROBE_INTERVAL_MS) return true;
  lastProbeAt = now;
  try {
    if (client.$queryRawUnsafe) {
      await client.$queryRawUnsafe("SELECT 1");
      available = true;
      return true;
    }
    // Fall back to a lightweight table read when the raw API is unavailable.
    await client.researchSession.count();
    available = true;
    return true;
  } catch (error) {
    available = false;
    logger.debug("database probe failed", {
      error: error instanceof Error ? error.message.slice(0, 200) : String(error),
    });
    return false;
  }
}

/** True when a DATABASE_URL is configured at all (regardless of reachability). */
export function isDatabaseConfigured(): boolean {
  return Boolean(appConfig.databaseUrl);
}

/**
 * Runs `fn` with the database client. Returns `null` when the database is not
 * configured or an operation fails — callers must treat null as "not persisted".
 */
export async function withDb<T>(fn: (client: PartScoutClient) => Promise<T>): Promise<T | null> {
  const client = getDatabaseClient();
  if (!client) return null;
  if (!(await isDatabaseAvailable())) return null;
  try {
    return await fn(client);
  } catch (error) {
    logger.warn("database operation failed", {
      error: error instanceof Error ? error.message.slice(0, 300) : String(error),
    });
    return null;
  }
}

/** Records a provider/API failure for the admin dashboard. Never throws. */
export async function recordApiErrorRecord(input: {
  area: string;
  provider?: string | null;
  message: string;
  detail?: string | null;
  retryable?: boolean;
  context?: string | null;
}): Promise<void> {
  await withDb(async (client) => {
    await client.apiErrorLog.create({
      data: {
        area: input.area,
        provider: input.provider ?? null,
        message: input.message.slice(0, 1_000),
        detail: input.detail?.slice(0, 2_000) ?? null,
        retryable: input.retryable ?? false,
        context: input.context?.slice(0, 1_000) ?? null,
      },
    });
  });
}

/* -------------------------------------------------------------------------- */
/* Test hooks                                                                 */
/* -------------------------------------------------------------------------- */

/** Injects an in-memory client (tests) or null to simulate "no database". */
export function setDatabaseClientForTesting(client: PartScoutClient | null | undefined): void {
  cachedClient = client ?? null;
  loadAttempted = true;
  available = Boolean(client);
  lastProbeAt = client ? Number.MAX_SAFE_INTEGER : 0;
}
