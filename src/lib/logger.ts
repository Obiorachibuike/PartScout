/**
 * Minimal structured logger. Intentionally dependency-free so it can be used
 * from middleware, route handlers and scripts alike.
 */

type Level = "debug" | "info" | "warn" | "error";

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function currentLevel(): Level {
  const configured = (process.env.LOG_LEVEL || "").toLowerCase() as Level;
  if (configured in LEVEL_ORDER) return configured;
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

function serialise(meta: unknown): string {
  if (meta === undefined) return "";
  try {
    return ` ${JSON.stringify(meta)}`;
  } catch {
    return " [unserialisable meta]";
  }
}

function emit(level: Level, message: string, meta?: unknown, scope?: string) {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[currentLevel()]) return;
  const prefix = `[partscout${scope ? `:${scope}` : ""}]`;
  const line = `${new Date().toISOString()} ${level.toUpperCase()} ${prefix} ${message}${serialise(meta)}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
  child(scope: string): Logger;
}

export function createLogger(scope?: string): Logger {
  return {
    debug: (m, meta) => emit("debug", m, meta, scope),
    info: (m, meta) => emit("info", m, meta, scope),
    warn: (m, meta) => emit("warn", m, meta, scope),
    error: (m, meta) => emit("error", m, meta, scope),
    child: (childScope) => createLogger(scope ? `${scope}:${childScope}` : childScope),
  };
}

export const logger = createLogger();

/**
 * Records a research/AI provider failure for the admin dashboard. Never throws.
 */
export async function recordApiError(input: {
  area: string;
  provider?: string | null;
  message: string;
  detail?: string | null;
  retryable?: boolean;
  context?: string | null;
}): Promise<void> {
  try {
    const { recordApiErrorRecord } = await import("@/lib/db/client");
    await recordApiErrorRecord(input);
  } catch (error) {
    logger.warn("could not persist API error record", {
      area: input.area,
      reason: error instanceof Error ? error.message : String(error),
    });
  }
}
