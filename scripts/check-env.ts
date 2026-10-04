/**
 * Environment doctor: `npm run env:check`.
 *
 * Prints exactly which capabilities this environment enables, what is missing and
 * how to fix it — without ever calling an external service. Exit code is non-zero
 * only when the environment cannot do the thing PartScout exists for (live search)
 * or when an unsafe configuration is detected (fixtures enabled in production).
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function loadEnv(path: string, override = false): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^["']|["']$/g, "");
    if (!key) continue;
    if (override || process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnv(resolve(process.cwd(), ".env"));
loadEnv(resolve(process.cwd(), ".env.local"), true);

type Level = "ok" | "info" | "warn" | "error";

interface Finding {
  level: Level;
  area: string;
  message: string;
  fix?: string;
}

const ICONS: Record<Level, string> = { ok: "✅", info: "ℹ️ ", warn: "⚠️ ", error: "❌" };

async function main(): Promise<void> {
  const {
    aiConfig,
    appConfig,
    authConfig,
    cacheConfig,
    getCapabilities,
    fixturesAllowed,
    isSearchProviderReady,
    limits,
  } = await import("@/lib/config");
  const { describeAIProvider } = await import("@/lib/providers/ai");
  const { describeSearchSetup } = await import("@/lib/providers/search");
  const { isDatabaseAvailable, isDatabaseConfigured } = await import("@/lib/db/client");

  const findings: Finding[] = [];
  const isProduction = process.env.NODE_ENV === "production";

  /* Search provider — the only hard requirement. */
  const search = describeSearchSetup();
  if (!searchConfigured()) {
    const selected = search.providerId ?? "(none)";
    findings.push({
      level: "error",
      area: "search",
      message: isSearchProviderReady()
        ? `SEARCH_PROVIDER=${selected} is selected but unreachable.`
        : `Live research is disabled: SEARCH_PROVIDER=${search.configuredRaw || "(unset)"} has no usable credential.`,
      fix: "set SEARCH_PROVIDER to tavily | exa | serper | brave and provide the matching API key (see .env.example), or set PARTSCOUT_ALLOW_FIXTURES=true for offline development",
    });
  } else {
    findings.push({
      level: search.providerId === "fixture" ? "warn" : "ok",
      area: "search",
      message:
        search.providerId === "fixture"
          ? "Using the fixture provider: synthetic pages only — results are labelled as fixture data and are never real research."
          : `Search provider ready: ${search.providerId}. PartScout uses the provider API only and never scrapes SERPs.`,
    });
  }

  function searchConfigured(): boolean {
    return isSearchProviderReady();
  }

  /* AI reasoning layer — optional by design. */
  const ai = describeAIProvider();
  if (ai.configured) {
    findings.push({
      level: "ok",
      area: "ai",
      message: `AI reasoning enabled (${ai.id}) — fast=${ai.fastModel ?? "?"}, smart=${ai.smartModel ?? "?"}, vision=${ai.supportsVision ? "yes" : "no"}.`,
    });
  } else if (aiConfig.providerId !== "none") {
    findings.push({
      level: "warn",
      area: "ai",
      message: `AI_PROVIDER=${aiConfig.providerId} is selected but its API key is missing.`,
      fix: `set the API key for ${aiConfig.providerId}, or AI_PROVIDER=none for the deterministic-only mode`,
    });
  } else {
    findings.push({
      level: "info",
      area: "ai",
      message: "AI_PROVIDER=none: research runs on the deterministic engine. Photo identification is disabled.",
      fix: "set AI_PROVIDER=openai|gemini|anthropic plus a key to enable query planning, claim reading and photo identification",
    });
  }

  /* Database — optional, but without it nothing persists. */
  const databaseConfigured = isDatabaseConfigured();
  if (!databaseConfigured) {
    findings.push({
      level: "warn",
      area: "database",
      message: "DATABASE_URL is not set: degraded mode. Research works, but history, saved searches, feedback and persistence are unavailable.",
      fix: "set DATABASE_URL, then run `npm run db:generate && npm run db:deploy`",
    });
  } else {
    const reachable = await isDatabaseAvailable();
    findings.push(
      reachable
        ? { level: "ok", area: "database", message: "Database reachable — history, saved searches, cache and metrics are enabled." }
        : {
            level: "warn",
            area: "database",
            message: "DATABASE_URL is set but the database is unreachable or the Prisma client is not generated.",
            fix: "start Postgres, run `npm run db:generate && npm run db:deploy`",
          },
    );
  }

  /* Auth. */
  if (!authConfig.secret) {
    findings.push({
      level: isProduction ? "error" : "warn",
      area: "auth",
      message: isProduction
        ? "AUTH_SECRET is not set. In production PartScout refuses to sign session cookies."
        : "AUTH_SECRET is not set — a development-only fallback secret is used.",
      fix: "generate one with `openssl rand -base64 48` and set AUTH_SECRET",
    });
  } else if (authConfig.secret.length < 16) {
    findings.push({
      level: isProduction ? "error" : "warn",
      area: "auth",
      message: "AUTH_SECRET is shorter than 16 characters.",
      fix: "generate a longer secret with `openssl rand -base64 48`",
    });
  } else {
    findings.push({ level: "ok", area: "auth", message: "Session signing secret present." });
  }

  findings.push({
    level: authConfig.google.clientId && authConfig.google.clientSecret ? "ok" : "info",
    area: "auth",
    message:
      authConfig.google.clientId && authConfig.google.clientSecret
        ? "Google OAuth enabled."
        : "Google OAuth disabled (set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to enable).",
  });

  /* Safety rails. */
  if (isProduction && fixturesAllowed) {
    findings.push({
      level: "error",
      area: "safety",
      message: "PARTSCOUT_ALLOW_FIXTURES=true in production — synthetic pages must never be served as research.",
      fix: "remove PARTSCOUT_ALLOW_FIXTURES (fixtures are hard-disabled in production unless explicitly forced)",
    });
  }
  if (isProduction && appConfig.appUrl.includes("localhost")) {
    findings.push({
      level: "warn",
      area: "safety",
      message: `NEXT_PUBLIC_APP_URL is still ${appConfig.appUrl} — canonical URLs, sitemap and OAuth redirects will be wrong.`,
      fix: "set NEXT_PUBLIC_APP_URL to your public origin",
    });
  }

  /* Reporting. */
  const capabilities = getCapabilities({ databaseConfigured });
  console.log("\nPartScout environment check\n" + "─".repeat(32));
  console.log(`app:        ${appConfig.appName} @ ${appConfig.appUrl}`);
  console.log(`env:        ${process.env.NODE_ENV ?? "development"}`);
  console.log(`pipeline:   ${cacheConfig.pipelineVersion}`);
  console.log(
    `limits:     ${limits.maxQueriesPerResearch} queries · ${limits.maxPagesToFetch} pages · ${limits.maxResearchesPerHourPerIp} runs/h/IP · ${limits.maxIdentificationsPerHourPerIp} ids/h/IP`,
  );
  console.log("");

  for (const finding of findings) {
    console.log(`${ICONS[finding.level]} [${finding.area}] ${finding.message}`);
    if (finding.fix) console.log(`   ↳ fix: ${finding.fix}`);
  }

  const errors = findings.filter((finding) => finding.level === "error");
  const warnings = findings.filter((finding) => finding.level === "warn");

  console.log("");
  console.log(
    `summary: ${findings.filter((f) => f.level === "ok").length} ok · ${warnings.length} warning(s) · ${errors.length} error(s)`,
  );
  if (!capabilities.searchConfigured) {
    console.log("PartScout will answer with `not_configured` instead of inventing research until search is configured.");
  }
  console.log("");

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("env:check failed:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
