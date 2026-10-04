/**
 * Environment parsing + runtime capability detection.
 *
 * Nothing here throws at import time: PartScout must boot (and clearly explain
 * what is missing) even when no provider keys are configured, instead of
 * crashing the whole app or silently faking results.
 */

export type SearchProviderId = "tavily" | "exa" | "serper" | "brave" | "fixture";
export type AIProviderId = "openai" | "gemini" | "anthropic" | "none";

function str(key: string, fallback = ""): string {
  const value = process.env[key];
  return typeof value === "string" ? value.trim() : fallback;
}

function num(key: string, fallback: number): number {
  const raw = str(key);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(key: string, fallback: boolean): boolean {
  const raw = str(key).toLowerCase();
  if (!raw) return fallback;
  return ["1", "true", "yes", "on"].includes(raw);
}

const SEARCH_PROVIDER_IDS: SearchProviderId[] = ["tavily", "exa", "serper", "brave", "fixture"];
const AI_PROVIDER_IDS: AIProviderId[] = ["openai", "gemini", "anthropic", "none"];

function parseSearchProvider(value: string): SearchProviderId | null {
  const normalised = value.toLowerCase() as SearchProviderId;
  return SEARCH_PROVIDER_IDS.includes(normalised) ? normalised : null;
}

function parseAIProvider(value: string): AIProviderId {
  const normalised = value.toLowerCase() as AIProviderId;
  return AI_PROVIDER_IDS.includes(normalised) ? normalised : "none";
}

export const isProduction = process.env.NODE_ENV === "production";

/**
 * Fixtures are synthetic pages used by the automated test-suite and for local UI
 * work without spending API credits. They are hard-disabled in production and
 * must be opted into explicitly.
 */
export const fixturesAllowed =
  bool("PARTSCOUT_ALLOW_FIXTURES", false) && !isProduction;

export const limits = {
  maxQueriesPerResearch: Math.min(num("MAX_QUERIES_PER_RESEARCH", 6), 10),
  maxResultsPerQuery: Math.min(num("MAX_RESULTS_PER_QUERY", 8), 20),
  maxPagesToFetch: Math.min(num("MAX_PAGES_TO_FETCH", 10), 25),
  maxFetchBytes: Math.min(num("MAX_FETCH_BYTES", 1_500_000), 8_000_000),
  maxPageTextChars: Math.min(num("MAX_PAGE_TEXT_CHARS", 14_000), 60_000),
  maxAiInputChars: Math.min(num("MAX_AI_INPUT_CHARS", 24_000), 120_000),
  maxAiOutputTokens: Math.min(num("MAX_AI_OUTPUT_TOKENS", 2_000), 8_000),
  researchTimeoutMs: Math.min(num("RESEARCH_TIMEOUT_MS", 75_000), 240_000),
  pageFetchTimeoutMs: Math.min(num("PAGE_FETCH_TIMEOUT_MS", 9_000), 30_000),
  maxResearchesPerHourPerIp: num("MAX_RESEARCHES_PER_HOUR_PER_IP", 20),
  maxIdentificationsPerHourPerIp: num("MAX_IDENTIFICATIONS_PER_HOUR_PER_IP", 10),
  maxUploadBytes: Math.min(num("MAX_UPLOAD_BYTES", 6_000_000), 12_000_000),
} as const;

export const cacheConfig = {
  enabled: bool("CACHE_ENABLED", true),
  researchTtlMinutes: num("RESEARCH_CACHE_TTL_MINUTES", 720),
  sourceTtlMinutes: num("SOURCE_CACHE_TTL_MINUTES", 1440),
  searchTtlMinutes: num("SEARCH_CACHE_TTL_MINUTES", 360),
  /** Bump when the pipeline changes materially to invalidate stale reports. */
  pipelineVersion: "2026-10-04.1",
} as const;

export const searchConfig = {
  providerId: parseSearchProvider(str("SEARCH_PROVIDER", "tavily")),
  configuredRawValue: str("SEARCH_PROVIDER"),
  fallbackProviderId: parseSearchProvider(str("SEARCH_FALLBACK_PROVIDER")),
  tavily: {
    apiKey: str("TAVILY_API_KEY"),
    searchDepth: (str("TAVILY_SEARCH_DEPTH", "basic") as "basic" | "advanced") || "basic",
  },
  exa: {
    apiKey: str("EXA_API_KEY"),
    mode: (str("EXA_SEARCH_MODE", "auto") as "auto" | "keyword" | "neural") || "auto",
    includeText: bool("EXA_INCLUDE_TEXT", true),
  },
  serper: {
    apiKey: str("SERPER_API_KEY"),
    engine: str("SERPER_SEARCH_ENGINE", "google"),
  },
  brave: {
    apiKey: str("BRAVE_SEARCH_API_KEY"),
    country: str("BRAVE_SEARCH_COUNTRY", "us"),
  },
} as const;

export const aiConfig = {
  providerId: parseAIProvider(str("AI_PROVIDER", "none")),
  configuredRawValue: str("AI_PROVIDER"),
  openai: {
    apiKey: str("OPENAI_API_KEY"),
    modelFast: str("OPENAI_MODEL_FAST", "gpt-5-mini"),
    modelSmart: str("OPENAI_MODEL_SMART", "gpt-5"),
  },
  gemini: {
    apiKey: str("GEMINI_API_KEY"),
    modelFast: str("GEMINI_MODEL_FAST", "gemini-3-flash"),
    modelSmart: str("GEMINI_MODEL_SMART", "gemini-3-pro"),
  },
  anthropic: {
    apiKey: str("ANTHROPIC_API_KEY"),
    modelFast: str("ANTHROPIC_MODEL_FAST", "claude-haiku-4-5"),
    modelSmart: str("ANTHROPIC_MODEL_SMART", "claude-sonnet-4-5"),
  },
  visionModelOverride: str("VISION_MODEL"),
} as const;

export const authConfig = {
  secret: str("AUTH_SECRET") || str("NEXTAUTH_SECRET"),
  cookieName: "ps_session",
  csrfCookieName: "ps_csrf",
  sessionDays: 30,
  google: {
    clientId: str("GOOGLE_CLIENT_ID"),
    clientSecret: str("GOOGLE_CLIENT_SECRET"),
  },
} as const;

export const appConfig = {
  appName: str("NEXT_PUBLIC_APP_NAME", "PartScout"),
  tagline: "Find the right part. Verify compatibility.",
  appUrl: str("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
  databaseUrl: str("DATABASE_URL"),
  adminEmails: str("ADMIN_EMAILS")
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean),
  fixturesAllowed,
} as const;

/** True when a real (non-fixture) search provider has an API key available. */
export function isSearchProviderReady(): boolean {
  const provider = searchConfig.providerId;
  if (!provider) return false;
  switch (provider) {
    case "tavily":
      return Boolean(searchConfig.tavily.apiKey);
    case "exa":
      return Boolean(searchConfig.exa.apiKey);
    case "serper":
      return Boolean(searchConfig.serper.apiKey);
    case "brave":
      return Boolean(searchConfig.brave.apiKey);
    case "fixture":
      return fixturesAllowed;
    default:
      return false;
  }
}

export function isAIReady(): boolean {
  switch (aiConfig.providerId) {
    case "openai":
      return Boolean(aiConfig.openai.apiKey);
    case "gemini":
      return Boolean(aiConfig.gemini.apiKey);
    case "anthropic":
      return Boolean(aiConfig.anthropic.apiKey);
    default:
      return false;
  }
}

export interface Capabilities {
  searchConfigured: boolean;
  searchProvider: SearchProviderId | null;
  searchProviderRaw: string;
  aiConfigured: boolean;
  aiProvider: AIProviderId;
  aiProviderRaw: string;
  visionConfigured: boolean;
  databaseConfigured: boolean;
  googleOAuthConfigured: boolean;
  fixturesEnabled: boolean;
  /** Human readable list of what to fix before live research works. */
  setupIssues: string[];
}

export function getCapabilities(options: { databaseConfigured?: boolean } = {}): Capabilities {
  const searchConfigured = isSearchProviderReady();
  const aiConfigured = isAIReady();
  const databaseConfigured = Boolean(appConfig.databaseUrl) && (options.databaseConfigured ?? true);
  const setupIssues: string[] = [];

  if (!searchConfig.providerId) {
    setupIssues.push(
      `SEARCH_PROVIDER "${searchConfig.configuredRawValue || "(empty)"}" is not a known provider. Use tavily | exa | serper | brave.`,
    );
  } else if (!searchConfigured) {
    setupIssues.push(
      `SEARCH_PROVIDER is "${searchConfig.providerId}" but its API key is missing. Set the matching *_API_KEY.`,
    );
  }

  if (aiConfig.providerId !== "none" && !aiConfigured) {
    setupIssues.push(
      `AI_PROVIDER is "${aiConfig.providerId}" but its API key is missing. PartScout will use its deterministic engine only.`,
    );
  }

  if (!appConfig.databaseUrl) {
    setupIssues.push(
      "DATABASE_URL is not set. PartScout runs in degraded mode: research works but nothing is persisted (no history, saved searches or cache).",
    );
  }

  return {
    searchConfigured,
    searchProvider: searchConfig.providerId,
    searchProviderRaw: searchConfig.configuredRawValue,
    aiConfigured,
    aiProvider: aiConfig.providerId,
    aiProviderRaw: aiConfig.configuredRawValue,
    visionConfigured: aiConfigured,
    databaseConfigured,
    googleOAuthConfigured: Boolean(authConfig.google.clientId && authConfig.google.clientSecret),
    fixturesEnabled: fixturesAllowed,
    setupIssues,
  };
}
