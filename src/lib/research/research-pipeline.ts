import type {
  EvaluatedSource,
  EvidenceClaim,
  ExtractedSource,
  NormalizedClaim,
  ResearchPlan,
  ResearchReport,
  ResearchStageEvent,
  SearchIntent,
  SearchResult,
  Verdict,
} from "@/types/research";
import { appConfig, cacheConfig, getCapabilities, isSearchProviderReady, limits, searchConfig } from "@/lib/config";
import { canonicalize, makeId, researchCacheKey, shortHash } from "@/lib/hash";
import { createLogger, type Logger } from "@/lib/logger";
import { normalizeQuestion } from "@/lib/text";
import { getAIProvider } from "@/lib/providers/ai";
import type { AIProvider } from "@/lib/providers/ai/AIProvider";
import { ProviderNotConfiguredError, isAbortError } from "@/lib/errors";
import { getSearchProviders } from "@/lib/providers/search";
import type { SearchProvider } from "@/lib/providers/search/SearchProvider";
import { emptyUsageSummary, UsageTracker } from "@/lib/research/usage";
import { getCachedSource, getCachedResearch, putCachedResearch, putCachedSource } from "@/lib/research/cache";
import {
  type QueryUnderstanding,
  deriveRequestedIntent,
  understandQuery,
} from "@/lib/research/query-understanding";
import { generateSearchQueries } from "@/lib/research/query-generation";
import { searchMultipleQueries } from "@/lib/research/web-search";
import { extractSources } from "@/lib/research/source-extraction";
import { evaluateSources } from "@/lib/research/source-evaluation";
import { extractCompatibilityClaims } from "@/lib/research/evidence-extraction";
import { normalizeClaims } from "@/lib/research/claim-normalization";
import { analyzeCompatibility } from "@/lib/research/compatibility-engine";
import { calculateConfidence, CONFIDENCE_DISCLAIMER } from "@/lib/research/confidence-engine";
import { generateFinalAnswer } from "@/lib/research/answer-generator";
import { persistResearch } from "@/lib/db/research-repository";

/**
 * The PartScout research pipeline.
 *
 *   understand → plan queries → search (provider API) → extract content →
 *   score sources → extract evidence → normalise claims → compatibility engine →
 *   confidence → answer → persist + cache
 *
 * Design guarantees enforced here:
 *   • Never a single search: several targeted queries are always issued.
 *   • Never an answer without evidence: an empty evidence set produces an explicit
 *     "not enough evidence" report, never a guess.
 *   • Never a fabricated source: sources come only from provider results we then
 *     retrieved, and every claim points at one of them.
 *   • Every stage is streamed to the UI so the research is inspectable live.
 */

export interface ResearchOptions {
  question: string;
  /** "auto" | "phone" | "part" | "compatibility" | "identify" */
  mode?: string;
  userId?: string | null;
  ipHash?: string | null;
  forceRefresh?: boolean;
  onStage?: (event: ResearchStageEvent) => void;
  signal?: AbortSignal;
  /** Injection points for tests. */
  aiOverride?: AIProvider | null;
  providersOverride?: SearchProvider[];
  logger?: Logger;
  persist?: boolean;
}

interface PipelineState {
  understanding?: QueryUnderstanding;
  plan?: ResearchPlan;
  results: SearchResult[];
  sources: ExtractedSource[];
  evaluated: EvaluatedSource[];
  claims: EvidenceClaim[];
  normalized?: ReturnType<typeof normalizeClaims>;
  analysis?: ReturnType<typeof analyzeCompatibility>;
  confidence?: ReturnType<typeof calculateConfidence>;
  warnings: string[];
  providerErrors: number;
  extractMethod: "deterministic" | "ai" | "hybrid";
}

export async function researchPartCompatibility(options: ResearchOptions): Promise<ResearchReport> {
  const log = options.logger ?? createLogger("research");
  const tracker = new UsageTracker();
  const state: PipelineState = {
    results: [],
    sources: [],
    evaluated: [],
    claims: [],
    warnings: [],
    providerErrors: 0,
    extractMethod: "deterministic",
  };

  const emit = (stage: string, label: string, status: ResearchStageEvent["status"], detail?: string) => {
    try {
      options.onStage?.({ stage, label, status, detail, at: new Date().toISOString() });
    } catch {
      // Streaming callbacks must never break research.
    }
  };

  const question = options.question.trim();
  const requestedIntent: SearchIntent | undefined = deriveRequestedIntent(options.mode);

  // ----------------------------------------------------------------- config
  const providers = options.providersOverride ?? (isSearchProviderReady() ? safeProviders(log) : []);
  if (providers.length === 0) {
    emit("config", "Checking research configuration", "error", "No search provider configured");
    return buildNotConfiguredReport(question, requestedIntent, log);
  }
  const providerIds = providers.map((provider) => provider.id);

  const ai = options.aiOverride !== undefined ? options.aiOverride : getAIProvider({ usageSink: tracker.aiSink });

  // ------------------------------------------------------------------ cache
  const understanding = await runStage(
    async () => {
      emit("understanding", "Understanding your question", "active");
      const result = await understandQuery(question, {
        ai,
        requestedIntent,
        logger: log,
      });
      state.understanding = result;
      emit(
        "understanding",
        "Understanding your question",
        "done",
        `Intent: ${result.intent.replace(/_/g, " ")}`,
      );
      return result;
    },
    log,
  );

  const normalizedQuery = normalizeQuestion(question) || question.toLowerCase();
  const cacheKey = researchCacheKey({
    normalizedQuestion: normalizedQuery,
    intent: understanding.intent,
    pipelineVersion: cacheConfig.pipelineVersion,
    providerIds,
    mode: options.mode ?? "default",
  });

  if (!options.forceRefresh) {
    const cached = await getCachedResearch(cacheKey);
    if (cached) {
      emit("cache", "Found a recent identical research run", "done", "Serving cached report");
      log.info("research cache hit", { cacheKey, age: Date.now() - cached.createdAt.getTime() });
      return {
        ...cached.report,
        cached: true,
        createdAt: cached.createdAt.toISOString(),
        cacheKey,
      };
    }
  }

  // ------------------------------------------------------------------ plan
  const plan = await runStage(
    async () => {
      emit("planning", "Identifying device and part", "active");
      const queries = await generateSearchQueries(understanding, { ai, logger: log });
      const built: ResearchPlan = { ...understanding, queries };
      state.plan = built;
      emit(
        "planning",
        "Generating research queries",
        "done",
        `${queries.length} targeted search ${queries.length === 1 ? "query" : "queries"}`,
      );
      return built;
    },
    log,
  );

  log.debug("research plan", {
    intent: plan.intent,
    device: plan.device,
    partCategory: plan.partCategory,
    queries: plan.queries.map((entry) => entry.query),
  });

  // ---------------------------------------------------------------- search
  const searchOutcome = await runStage(
    async () => {
      emit("searching", "Searching the web", "active", `${plan.queries.length} queries`);
      const outcome = await searchMultipleQueries(plan.queries, {
        providers,
        limitPerQuery: limits.maxResultsPerQuery,
        signal: options.signal,
        tracker,
        logger: log,
      });
      state.results = outcome.results;
      state.providerErrors = outcome.failureCount;
      emit(
        "searching",
        "Searching the web",
        "done",
        `${outcome.results.length} unique ${outcome.results.length === 1 ? "result" : "results"} from ${plan.queries.length} queries`,
      );
      return outcome;
    },
    log,
  );

  if (searchOutcome.results.length === 0) {
    const allFailed = searchOutcome.failureCount >= plan.queries.length;
    emit("searching", "Searching the web", "error", allFailed ? "All search queries failed" : "No results returned");
    return finalise(
      buildEmptyReport({
        question,
        plan,
        cacheKey,
        providerIds,
        verdict: allFailed ? "research_failed" : "insufficient_evidence",
        failure: allFailed
          ? {
              code: "search_failed",
              message: "Every search query failed. The search provider may be rate limited or unreachable.",
              remediation: [
                "Retry in a moment — provider rate limits reset quickly.",
                "Check the admin dashboard for provider errors.",
                "Verify the provider API key and quota.",
              ],
            }
          : {
              code: "no_sources",
              message: "The search provider returned no results for any of the generated queries.",
              remediation: [
                "Add the exact model number (for example SM-A155F) to the question.",
                "Include a part number or the wording printed on the part.",
                "Try a broader device name (for example “Samsung Galaxy A15”).",
              ],
            },
        tracker,
        warn: state.warnings,
      }),
      options,
      log,
      tracker,
    );
  }

  // ------------------------------------------------------------- extraction
  const sources = await runStage(
    async () => {
      emit("extracting", "Reading sources", "active", `${state.results.length} candidate pages`);
      const extracted = await extractSourcesWithCache(state.results, options, tracker, log);
      state.sources = extracted;
      emit(
        "extracting",
        "Reading sources",
        "done",
        `${extracted.filter((source) => source.fetched || source.usedProviderContent).length} of ${extracted.length} sources read`,
      );
      return extracted;
    },
    log,
  );

  // ------------------------------------------------------------ evaluation
  const evaluated = await runStage(
    async () => {
      emit("evaluating", "Scoring source quality", "active");
      // Map canonical URL → the queries that surfaced it (shown in the UI so the
      // user can see which research angle found each source).
      const queriesByUrl = new Map<string, string[]>();
      for (const result of state.results) {
        const key = candidatesCanonical(result.url);
        const list = queriesByUrl.get(key) ?? [];
        for (const query of extractQueries(result)) if (!list.includes(query)) list.push(query);
        queriesByUrl.set(key, list);
      }

      const scored = evaluateSources(sources, { understanding, queriesByUrl }, providerIds);
      state.evaluated = scored;
      const tier1or2 = scored.filter((source) => source.quality.tier <= 2).length;
      emit(
        "evaluating",
        "Scoring source quality",
        "done",
        `${tier1or2} high-authority source(s); average quality ${(
          (scored.reduce((total, source) => total + source.quality.total, 0) / Math.max(1, scored.length)) * 100
        ).toFixed(0)}%`,
      );
      return scored;
    },
    log,
  );

  // ---------------------------------------------------------------- evidence
  const evidence = await runStage(
    async () => {
      emit("evidence", "Extracting compatibility claims", "active");
      const result = await extractCompatibilityClaims(evaluated, understanding, {
        ai,
        logger: log,
        signal: options.signal,
      });
      state.claims = result.claims;
      state.extractMethod = result.method;
      state.warnings.push(...result.warnings);
      emit(
        "evidence",
        "Extracting compatibility claims",
        "done",
        `${result.claims.length} claim(s) extracted via ${result.method} extraction`,
      );
      return result;
    },
    log,
  );

  if (evidence.claims.length === 0) {
    emit("evidence", "Extracting compatibility claims", "error", "No compatibility statements found");
    return finalise(
      buildEmptyReport({
        question,
        plan,
        cacheKey,
        providerIds,
        sources: evaluated,
        verdict: "insufficient_evidence",
        failure: {
          code: "no_evidence",
          message:
            "Pages were retrieved, but none of them contained a statement about which devices this part fits.",
          remediation: [
            "Provide the exact model number (for example SM-A155F or A2890).",
            "Provide the part number printed on the part.",
            "Search the part number alone to find which devices reference it.",
            "Upload a photo of the part so PartScout can read the printed identifier.",
          ],
        },
        tracker,
        warn: state.warnings,
      }),
      options,
      log,
      tracker,
    );
  }

  // ------------------------------------------------------- normalise + judge
  const normalized = await runStage(
    async () => {
      emit("comparing", "Comparing sources", "active");
      const result = normalizeClaims(evidence.claims, evaluated, understanding);
      state.normalized = result;
      emit(
        "comparing",
        "Comparing sources",
        "done",
        `${result.clusters.length} device/part group(s), ${result.conflicts.length} conflict group(s)`,
      );
      return result;
    },
    log,
  );

  const analysis = await runStage(
    async () => {
      emit("compatibility", "Checking compatibility", "active");
      const result = analyzeCompatibility({
        understanding,
        sources: evaluated,
        claims: normalized.claims as NormalizedClaim[],
        clusters: normalized.clusters,
        conflicts: normalized.conflicts,
        variantRisks: normalized.variantRisks,
      });
      state.analysis = result;
      state.warnings.push(...result.warnings);

      // Optional AI reasoning pass: it may add checklist detail and caveats, but
      // it cannot change the deterministic verdict.
      if (ai && result.supportingClaims.length + result.opposingClaims.length > 0) {
        try {
          const reasoning = await ai.analyzeCompatibility({
            device: understanding.device,
            partCategory: understanding.partCategory,
            partNumber: understanding.partNumber,
            claimSummary: summariseClaimsForAI(result.supportingClaims, result.opposingClaims),
            checksSummary: result.checks.map((check) => `- ${check.label}: ${check.status} (${check.detail.slice(0, 140)})`).join("\n"),
            conflictsSummary: normalized.conflicts
              .map((conflict) => `- ${conflict.topic}: ${conflict.explanation}`)
              .join("\n"),
            allowedRefs: [],
          });
          for (const caveat of reasoning.caveats) {
            if (!state.warnings.includes(caveat)) state.warnings.push(caveat);
          }
        } catch (error) {
          log.warn("AI compatibility reasoning failed (deterministic engine already produced a verdict)", {
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      emit("compatibility", "Checking compatibility", "done", `Verdict: ${result.verdict.replace(/_/g, " ")}`);
      return result;
    },
    log,
  );

  const confidence = await runStage(
    async () => {
      emit("confidence", "Calculating confidence", "active");
      const result = calculateConfidence({
        verdict: analysis.verdict,
        sources: evaluated,
        claims: normalized.claims as NormalizedClaim[],
        supporting: analysis.supportingClaims,
        opposing: analysis.opposingClaims,
        compatibleModels: analysis.compatibleModels,
        checklist: analysis.checks,
        conflicts: normalized.conflicts.length,
        variantRisks: normalized.variantRisks.length,
        partNumberMatched: analysis.compatibleParts.some((part) => Boolean(part.partNumber)),
        exactTargetEvidence: analysis.exactTargetEvidence,
      });
      state.confidence = result;
      emit("confidence", "Calculating confidence", "done", `Evidence confidence ${result.score}%`);
      return result;
    },
    log,
  );

  // ----------------------------------------------------------------- answer
  const answer = await runStage(
    async () => {
      emit("answer", "Preparing result", "active");
      const generated = await generateFinalAnswer(
        {
          understanding,
          verdict: analysis.verdict,
          confidenceScore: confidence.score,
          confidenceLevel: confidence.label,
          confidenceSummary: confidence.summary,
          supporting: analysis.supportingClaims,
          opposing: analysis.opposingClaims,
          compatibleModels: analysis.compatibleModels,
          incompatibleModels: analysis.incompatibleModels,
          compatibleParts: analysis.compatibleParts,
          checks: analysis.checks,
          conflicts: normalized.conflicts,
          variantRisks: normalized.variantRisks,
          sourcesCount: evaluated.length,
        },
        { ai, logger: log },
      );
      emit("answer", "Preparing result", "done", generated.answerMethod === "ai_synthesis" ? "AI synthesis over evidence" : "Deterministic synthesis over evidence");
      return generated;
    },
    log,
  );

  const report: ResearchReport = {
    id: makeId("rs"),
    cacheKey,
    createdAt: new Date().toISOString(),
    intent: plan.intent,
    question,
    plan,
    verdict: analysis.verdict,
    headline: answer.headline,
    answer: answer.answer,
    answerMethod: answer.answerMethod,
    summaryBullets: answer.summaryBullets,
    compatibleModels: analysis.compatibleModels,
    incompatibleModels: analysis.incompatibleModels,
    compatibleParts: analysis.compatibleParts,
    checks: analysis.checks,
    conflicts: normalized.conflicts,
    variantRisks: normalized.variantRisks,
    verifyBeforeInstall: answer.verifyBeforeInstall,
    warnings: dedupe([
      ...state.warnings,
      ...(state.providerErrors > 0
        ? [`${state.providerErrors} search query/queries failed during this run; results may be incomplete.`]
        : []),
    ]),
    sources: evaluated.slice(0, 40),
    claims: (normalized.claims as NormalizedClaim[]).slice(0, 60),
    confidence,
    usage: tracker.toSummary({ cached: false }),
    fixtureData: providerIds.includes("fixture"),
    cached: false,
  };

  return finalise(report, options, log, tracker);
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

async function runStage<T>(fn: () => Promise<T>, log: Logger): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (isAbortError(error)) throw error;
    log.warn("pipeline stage failed", { error: error instanceof Error ? error.message.slice(0, 300) : String(error) });
    throw error;
  }
}

function safeProviders(log: Logger): SearchProvider[] {
  try {
    return getSearchProviders();
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      log.warn("no search provider available", { message: error.message });
      return [];
    }
    throw error;
  }
}

function extractQueries(result: SearchResult): string[] {
  const withQueries = result as SearchResult & { queries?: string[] };
  return withQueries.queries && withQueries.queries.length > 0 ? withQueries.queries : [result.query];
}

function candidatesCanonical(url: string): string {
  return canonicalize(url);
}

async function extractSourcesWithCache(
  results: SearchResult[],
  options: ResearchOptions,
  tracker: UsageTracker,
  log: Logger,
): Promise<ExtractedSource[]> {
  // Reuse cached page content first (cheap and avoids hammering publishers).
  const prefetched: ExtractedSource[] = [];
  const remaining: SearchResult[] = [];

  for (const result of results) {
    if (result.rawContent) {
      remaining.push(result);
      continue;
    }
    const cached = await getCachedSource(result.url);
    if (cached) {
      prefetched.push({
        id: shortHash(cached.url, 16),
        url: cached.url,
        canonicalUrl: candidatesCanonical(cached.url),
        domain: cached.domain,
        siteName: cached.domain,
        title: cached.title || cached.domain,
        snippet: result.snippet,
        publishedAt: result.publishedAt,
        text: cached.text,
        fetched: cached.fetched,
        usedProviderContent: false,
        wordCount: cached.wordCount,
      });
      continue;
    }
    remaining.push(result);
  }

  const extracted = await extractSources(remaining, { tracker, signal: options.signal, logger: log });

  for (const source of extracted) {
    if (source.fetched && source.wordCount > 80) {
      void putCachedSource({
        url: source.canonicalUrl,
        title: source.title,
        domain: source.domain,
        text: source.text,
        fetched: source.fetched,
        wordCount: source.wordCount,
      });
    }
  }

  return [...prefetched, ...extracted];
}

function summariseClaimsForAI(supporting: NormalizedClaim[], opposing: NormalizedClaim[]): string {
  const lines: string[] = [];
  supporting.slice(0, 10).forEach((claim) => {
    lines.push(
      `- COMPATIBLE: device="${claim.deviceCanonical ?? "?"}" models=[${claim.modelNumbers.join(", ")}] part="${claim.partRaw ?? "?"}" quote="${claim.evidenceText.slice(0, 140)}" (${claim.sourceDomain})`,
    );
  });
  opposing.slice(0, 10).forEach((claim) => {
    lines.push(
      `- NOT COMPATIBLE: device="${claim.deviceCanonical ?? "?"}" models=[${claim.modelNumbers.join(", ")}] part="${claim.partRaw ?? "?"}" quote="${claim.evidenceText.slice(0, 140)}" (${claim.sourceDomain})`,
    );
  });
  return lines.join("\n") || "(no claims)";
}

function buildNotConfiguredReport(question: string, intent: SearchIntent | undefined, log: Logger): ResearchReport {
  const capabilities = getCapabilities();
  const placeholderPlan: ResearchPlan = {
    intent: intent ?? "unknown",
    device: null,
    deviceBrand: null,
    modelNumbers: [],
    variantMarkers: [],
    part: null,
    partCategory: "other",
    partNumber: null,
    manufacturer: null,
    region: null,
    rawQuery: question,
    queries: [],
    understandingNotes: [],
    understandingMethod: "deterministic",
  };
  log.warn("research requested but no search provider is configured", {
    configured: searchConfig.configuredRawValue,
  });

  return {
    id: makeId("rs"),
    cacheKey: shortHash({ question, configured: false }),
    createdAt: new Date().toISOString(),
    intent: placeholderPlan.intent,
    question,
    plan: placeholderPlan,
    verdict: "not_configured",
    headline: "Web research is not configured",
    answer:
      "PartScout requires a licensed web-search API to research compatibility — it never scrapes search-engine result pages. This deployment has no search provider configured, so no research could be performed and no compatibility conclusion is shown.",
    answerMethod: "deterministic",
    summaryBullets: [
      "Set SEARCH_PROVIDER and the matching API key (Tavily, Exa, Serper or Brave).",
      ...capabilities.setupIssues,
    ],
    compatibleModels: [],
    incompatibleModels: [],
    compatibleParts: [],
    checks: [],
    conflicts: [],
    variantRisks: [],
    verifyBeforeInstall: [],
    warnings: capabilities.setupIssues,
    sources: [],
    claims: [],
    confidence: {
      score: 0,
      level: "UNKNOWN",
      label: "Unknown",
      summary: "No research was performed because no search provider is configured.",
      rationale: capabilities.setupIssues,
      breakdown: {
        sourceQuality: 0,
        independentSources: 0,
        claimAgreement: 0,
        technicalSpecificity: 0,
        conflictsPenalty: 0,
        evidenceVolumePenalty: 0,
      },
      disclaimer: CONFIDENCE_DISCLAIMER,
    },
    usage: emptyUsageSummary(false),
    failure: {
      code: "provider_not_configured",
      message: "No web-search provider is configured on this deployment.",
      remediation: [
        "Set SEARCH_PROVIDER=tavily|exa|serper|brave in the environment.",
        "Set the matching API key (for example TAVILY_API_KEY).",
        "Restart the app after updating the environment.",
      ],
    },
    fixtureData: false,
    cached: false,
  };
}

function buildEmptyReport(input: {
  question: string;
  plan: ResearchPlan;
  cacheKey: string;
  providerIds: string[];
  sources?: EvaluatedSource[];
  verdict: Verdict;
  failure: ResearchReport["failure"];
  tracker: UsageTracker;
  warn: string[];
}): ResearchReport {
  const hasSources = (input.sources?.length ?? 0) > 0;
  return {
    id: makeId("rs"),
    cacheKey: input.cacheKey,
    createdAt: new Date().toISOString(),
    intent: input.plan.intent,
    question: input.question,
    plan: input.plan,
    verdict: input.verdict,
    headline: input.verdict === "research_failed" ? "Research could not be completed" : "Not enough evidence",
    answer: hasSources
      ? `PartScout retrieved ${input.sources!.length} pages but could not find a reliable statement about which devices this part fits. It will not guess a compatibility result.`
      : "PartScout could not retrieve usable sources for this question, so no compatibility conclusion is shown.",
    answerMethod: "deterministic",
    summaryBullets: input.failure?.remediation.slice(0, 3) ?? [],
    compatibleModels: [],
    incompatibleModels: [],
    compatibleParts: [],
    checks: [],
    conflicts: [],
    variantRisks: [],
    verifyBeforeInstall: input.failure?.remediation ?? [],
    warnings: dedupe(input.warn),
    sources: input.sources ?? [],
    claims: [],
    confidence: {
      score: 0,
      level: "UNKNOWN",
      label: "Unknown",
      summary: input.failure?.message ?? "No usable evidence was found.",
      rationale: [
        `Searched with ${input.plan.queries.length} query/queries using ${input.providerIds.join(", ")}.`,
        hasSources ? `${input.sources!.length} page(s) were retrieved but none contained compatibility statements.` : "No pages could be retrieved.",
      ],
      breakdown: {
        sourceQuality: 0,
        independentSources: 0,
        claimAgreement: 0,
        technicalSpecificity: 0,
        conflictsPenalty: 0,
        evidenceVolumePenalty: 1,
      },
      disclaimer: CONFIDENCE_DISCLAIMER,
    },
    usage: input.tracker.toSummary({ cached: false }),
    failure: input.failure ?? undefined,
    fixtureData: input.providerIds.includes("fixture"),
    cached: false,
  };
}

async function finalise(
  report: ResearchReport,
  options: ResearchOptions,
  log: Logger,
  tracker: UsageTracker,
): Promise<ResearchReport> {
  const reportWithUsage: ResearchReport = {
    ...report,
    usage: tracker.toSummary({ cached: report.cached, durationMs: Date.now() - tracker.startedAt }),
  };

  // Persist before caching so history/analytics never point at a missing report.
  if (options.persist !== false) {
    try {
      const persisted = await persistResearch({
        report: reportWithUsage,
        userId: options.userId ?? null,
        ipHash: options.ipHash ?? null,
        cacheKey: reportWithUsage.cacheKey,
        normalizedQuery: normalizeQuestion(reportWithUsage.question) || reportWithUsage.question.toLowerCase(),
        searchProvider: searchConfig.providerId,
        aiProvider: options.aiOverride === null ? "none" : undefined,
        tracker,
      });
      if (persisted?.sessionId) reportWithUsage.id = persisted.sessionId;
    } catch (error) {
      log.warn("could not persist research session (continuing)", {
        error: error instanceof Error ? error.message.slice(0, 200) : String(error),
      });
    }
  }

  await putCachedResearch({
    cacheKey: reportWithUsage.cacheKey,
    normalisedQuery: normalizeQuestion(reportWithUsage.question) || reportWithUsage.question.toLowerCase(),
    intent: reportWithUsage.intent,
    report: reportWithUsage,
    verdict: reportWithUsage.verdict,
    confidenceScore: reportWithUsage.confidence.score,
  }).catch(() => undefined);

  log.info("research completed", {
    verdict: reportWithUsage.verdict,
    confidence: reportWithUsage.confidence.score,
    sources: reportWithUsage.sources.length,
    claims: reportWithUsage.claims.length,
    durationMs: reportWithUsage.usage.durationMs,
    costUsd: reportWithUsage.usage.estimatedCostUsd,
    fixture: reportWithUsage.fixtureData,
    appUrl: appConfig.appUrl,
  });

  return reportWithUsage;
}

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
