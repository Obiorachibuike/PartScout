import type { ResearchReport } from "@/types/research";
import { withDb } from "@/lib/db/client";
import type { UsageTracker } from "@/lib/research/usage";
import { logger } from "@/lib/logger";

/**
 * Persistence for research runs, history, saved searches, feedback, part
 * identifications and usage. Every function is safe to call with no database:
 * it returns null and the caller keeps working.
 *
 * What is stored is application data (what was asked, what the web said, which
 * sources were used, how much it cost) — never a curated compatibility database.
 */

export interface PersistResearchInput {
  report: ResearchReport;
  userId: string | null;
  ipHash: string | null;
  cacheKey: string;
  normalizedQuery: string;
  searchProvider: string | null;
  aiProvider?: string | null;
  tracker?: UsageTracker;
}

export async function persistResearch(input: PersistResearchInput): Promise<{ sessionId: string } | null> {
  const { report } = input;

  return withDb(async (client) => {
    const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 90);

    const session = await client.researchSession.upsert({
      where: { cacheKey: input.cacheKey },
      create: {
        userId: input.userId,
        cacheKey: input.cacheKey,
        question: report.question.slice(0, 1_000),
        normalizedQuery: input.normalizedQuery.slice(0, 1_000),
        intent: report.intent,
        device: report.plan.device,
        deviceBrand: report.plan.deviceBrand,
        partCategory: report.plan.partCategory,
        partNumber: report.plan.partNumber,
        verdict: report.verdict,
        confidenceScore: report.confidence.score,
        confidenceLevel: report.confidence.level,
        fixtureData: report.fixtureData,
        answerMethod: report.answerMethod,
        searchProvider: input.searchProvider,
        aiProvider: input.aiProvider ?? null,
        durationMs: report.usage.durationMs,
        estimatedCostUsd: report.usage.estimatedCostUsd,
        report: report as unknown as Record<string, unknown>,
        expiresAt,
      },
      update: {
        verdict: report.verdict,
        confidenceScore: report.confidence.score,
        confidenceLevel: report.confidence.level,
        report: report as unknown as Record<string, unknown>,
        durationMs: report.usage.durationMs,
        estimatedCostUsd: report.usage.estimatedCostUsd,
        userId: input.userId,
      },
    });

    // Sources (cap: keep the report readable and the row count sane).
    const sources = report.sources.slice(0, 25);
    for (const source of sources) {
      try {
        await client.researchSource.upsert({
          where: { researchId_url: { researchId: session.id, url: source.canonicalUrl } },
          create: {
            researchId: session.id,
            url: source.canonicalUrl,
            domain: source.domain,
            title: source.title.slice(0, 400),
            siteName: source.siteName,
            sourceType: source.quality.tierLabel,
            tier: source.quality.tier,
            quality: source.quality.total,
            fetched: source.fetched || source.usedProviderContent,
            evidenceSnippet: source.snippet.slice(0, 500),
          },
          update: { quality: source.quality.total },
        });
      } catch {
        // A duplicate or constraint issue must never break persistence.
      }
    }

    // Claims (the audit trail that proves the verdict is evidence-derived).
    const existingClaims = await client.researchClaim.findMany({ where: { researchId: session.id }, take: 1 });
    if (existingClaims.length === 0) {
      for (const claim of report.claims.slice(0, 60)) {
        try {
          await client.researchClaim.create({
            data: {
              researchId: session.id,
              sourceUrl: claim.sourceUrl,
              sourceDomain: claim.sourceDomain,
              device: claim.deviceCanonical,
              modelNumbers: claim.modelNumbers,
              partNumber: claim.partNumber,
              partCategory: claim.partCategory,
              claim: claim.claim,
              evidenceText: claim.evidenceText.slice(0, 600),
              strength: claim.strength,
              extractionMethod: claim.extractionMethod,
            },
          });
        } catch {
          // ignore
        }
      }
    }

    // Search history entry.
    await client.search.create({
      data: {
        userId: input.userId,
        researchId: session.id,
        query: report.question.slice(0, 1_000),
        normalizedQuery: input.normalizedQuery.slice(0, 1_000),
        intent: report.intent,
        device: report.plan.device,
        partCategory: report.plan.partCategory,
        partNumber: report.plan.partNumber,
        ipHash: input.ipHash,
      },
    });

    // Usage accounting.
    if (input.tracker) {
      await recordUsage(input.tracker, { researchId: session.id, userId: input.userId, searchProvider: input.searchProvider });
    }

    return { sessionId: session.id };
  });
}

export async function recordUsage(
  tracker: UsageTracker,
  context: { researchId?: string | null; userId?: string | null; searchProvider?: string | null },
): Promise<void> {
  await withDb(async (client) => {
    const rows: Array<Record<string, unknown>> = [];

    if (tracker.searchCalls > 0) {
      rows.push({
        userId: context.userId ?? null,
        researchId: context.researchId ?? null,
        area: "search",
        provider: context.searchProvider ?? ([...tracker.searchProviders].join(",") || "unknown"),
        label: "search_queries",
        promptTokens: 0,
        completionTokens: 0,
        costUsd: Number(tracker.estimatedCostUsd.toFixed(6)),
        durationMs: 0,
      });
    }
    if (tracker.pagesFetched > 0) {
      rows.push({
        userId: context.userId ?? null,
        researchId: context.researchId ?? null,
        area: "fetch",
        provider: "page-fetch",
        label: "page_fetches",
        promptTokens: 0,
        completionTokens: 0,
        costUsd: 0,
        durationMs: 0,
      });
    }
    for (const call of tracker.aiCalls_detail.slice(0, 20)) {
      rows.push({
        userId: context.userId ?? null,
        researchId: context.researchId ?? null,
        area: "ai",
        provider: call.provider,
        model: call.model,
        label: call.label,
        promptTokens: call.promptTokens,
        completionTokens: call.completionTokens,
        costUsd: 0,
        durationMs: call.latencyMs,
      });
    }

    for (const row of rows) {
      try {
        await client.usageRecord.create({ data: row });
      } catch {
        // ignore
      }
    }
  });
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export interface ResearchHistoryItem {
  id: string;
  question: string;
  intent: string;
  device: string | null;
  partCategory: string | null;
  verdict: string;
  confidenceScore: number;
  confidenceLevel: string;
  fixtureData: boolean;
  createdAt: Date;
}

export async function listResearchForUser(
  userId: string,
  options: { take?: number; skip?: number; search?: string } = {},
): Promise<ResearchHistoryItem[]> {
  const rows = await withDb(async (client) =>
    client.researchSession.findMany({
      where: {
        userId,
        ...(options.search
          ? {
              OR: [
                { question: { contains: options.search, mode: "insensitive" } },
                { device: { contains: options.search, mode: "insensitive" } },
                { partNumber: { contains: options.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: "desc" },
      take: options.take ?? 25,
      skip: options.skip ?? 0,
    }),
  );

  return (rows ?? []).map((row) => ({
    id: row.id,
    question: row.question,
    intent: row.intent,
    device: row.device,
    partCategory: row.partCategory,
    verdict: row.verdict,
    confidenceScore: row.confidenceScore,
    confidenceLevel: row.confidenceLevel,
    fixtureData: row.fixtureData,
    createdAt: new Date(row.createdAt),
  }));
}

export async function getResearchById(id: string): Promise<{ report: ResearchReport; createdAt: Date; userId: string | null } | null> {
  return withDb(async (client) => {
    const row = await client.researchSession.findUnique({ where: { id } });
    if (!row) return null;
    return { report: row.report as ResearchReport, createdAt: new Date(row.createdAt), userId: row.userId };
  });
}

export async function listIdentificationsForUser(userId: string, take = 20) {
  const rows = await withDb(async (client) =>
    client.partIdentification.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take }),
  );
  return rows ?? [];
}

/* Saved searches ----------------------------------------------------------- */

export async function listSavedSearches(userId: string) {
  const rows = await withDb(async (client) =>
    client.savedSearch.findMany({ where: { userId }, orderBy: { createdAt: "desc" }, take: 100 }),
  );
  return rows ?? [];
}

export async function saveSearch(input: {
  userId: string;
  label: string;
  query: string;
  mode: string;
  researchId?: string | null;
}): Promise<boolean> {
  const result = await withDb(async (client) => {
    await client.savedSearch.upsert({
      where: { userId_query_mode: { userId: input.userId, query: input.query.slice(0, 500), mode: input.mode } },
      create: {
        userId: input.userId,
        label: input.label.slice(0, 200),
        query: input.query.slice(0, 500),
        mode: input.mode,
        researchId: input.researchId ?? null,
      },
      update: { label: input.label.slice(0, 200), researchId: input.researchId ?? null },
    });
    return true;
  });
  return Boolean(result);
}

export async function deleteSavedSearch(userId: string, id: string): Promise<boolean> {
  const result = await withDb(async (client) => {
    const outcome = await client.savedSearch.deleteMany({ where: { id, userId } });
    return outcome.count > 0;
  });
  return Boolean(result);
}

/* Feedback ----------------------------------------------------------------- */

export async function recordFeedback(input: {
  researchId?: string | null;
  userId?: string | null;
  helpful: boolean;
  reason?: string | null;
  comment?: string | null;
}): Promise<boolean> {
  const result = await withDb(async (client) => {
    await client.feedback.create({
      data: {
        researchId: input.researchId ?? null,
        userId: input.userId ?? null,
        helpful: input.helpful,
        reason: input.reason?.slice(0, 120) ?? null,
        comment: input.comment?.slice(0, 1_000) ?? null,
      },
    });
    return true;
  });
  return Boolean(result);
}

/* Part identification ------------------------------------------------------ */

export async function persistIdentification(input: {
  userId: string | null;
  identifierType: string;
  identifier: string;
  device: string | null;
  manufacturer: string | null;
  partCategory: string;
  imageHash: string | null;
  imageMimeType: string | null;
  confidence: number;
  method: string;
  result: unknown;
  tracker?: UsageTracker;
}): Promise<string | null> {
  return withDb(async (client) => {
    const row = await client.partIdentification.create({
      data: {
        userId: input.userId,
        identifierType: input.identifierType,
        identifier: input.identifier.slice(0, 200),
        device: input.device,
        manufacturer: input.manufacturer,
        partCategory: input.partCategory,
        imageHash: input.imageHash,
        imageMimeType: input.imageMimeType,
        confidence: input.confidence,
        method: input.method,
        result: input.result as Record<string, unknown>,
      },
    });
    if (input.tracker) await recordUsage(input.tracker, { userId: input.userId });
    return row.id;
  });
}

/* -------------------------------------------------------------------------- */
/* Admin metrics                                                              */
/* -------------------------------------------------------------------------- */

export interface AdminMetrics {
  databaseAvailable: boolean;
  totals: {
    searches: number;
    researchSessions: number;
    cachedResearch: number;
    cacheHits: number;
    savedSearches: number;
    identifications: number;
    users: number;
    feedback: number;
  };
  popularQueries: Array<{ query: string; count: number }>;
  verdictDistribution: Array<{ verdict: string; count: number }>;
  noResultSearches: number;
  failedSearches: number;
  usage: {
    searchCalls: number;
    aiCalls: number;
    pagesFetched: number;
    promptTokens: number;
    completionTokens: number;
    estimatedCostUsd: number;
    averageResearchMs: number;
  };
  providerUsage: Array<{ provider: string; count: number; cost: number }>;
  sourceFailures: Array<{ provider: string; message: string; count: number; lastSeen: Date }>;
  aiErrors: Array<{ provider: string; message: string; count: number; lastSeen: Date }>;
  feedbackSummary: { helpful: number; notHelpful: number; topReasons: Array<{ reason: string; count: number }> };
  averageResearchTimeMs: number;
  cacheHitRate: number;
}

export async function getAdminMetrics(): Promise<AdminMetrics | null> {
  return withDb(async (client) => {
    const [searches, sessions, users, identifications, feedbackRows] = await Promise.all([
      client.search.count(),
      client.researchSession.count(),
      client.user.count(),
      client.partIdentification.count(),
      client.feedback.findMany({ take: 1_000 }),
    ]);

    const popularRows = client.search.groupBy
      ? await client.search
          .groupBy({ by: ["normalizedQuery"], _count: { normalizedQuery: true }, orderBy: { _count: { normalizedQuery: "desc" } }, take: 15 })
          .catch(() => [])
      : [];

    const verdictRows = client.researchSession.groupBy
      ? await client.researchSession
          .groupBy({ by: ["verdict"], _count: { verdict: true }, orderBy: { _count: { verdict: "desc" } } })
          .catch(() => [])
      : [];

    const providerRows = client.usageRecord.groupBy
      ? await client.usageRecord
          .groupBy({ by: ["provider"], _count: { provider: true }, _sum: { costUsd: true } })
          .catch(() => [])
      : [];

    const usageAggregate = (await client.usageRecord
      .aggregate?.({
        where: { area: "ai" },
        _sum: { promptTokens: true, completionTokens: true, costUsd: true },
        _count: true,
      })
      .catch(() => ({}))) ?? {};

    const searchAggregate = (await client.usageRecord
      .aggregate?.({ where: { area: "search" }, _sum: { costUsd: true }, _count: true })
      .catch(() => ({}))) ?? {};
    const fetchAggregate = (await client.usageRecord
      .aggregate?.({ where: { area: "fetch" }, _count: true })
      .catch(() => ({}))) ?? {};

    const sessionAggregate = (await client.researchSession
      .aggregate?.({ _avg: { durationMs: true }, _sum: { estimatedCostUsd: true }, _count: true })
      .catch(() => ({}))) ?? {};

    const cacheRows = await client.researchCache.findMany({ take: 5_000 });
    const errorRows = await client.apiErrorLog.findMany({ orderBy: { createdAt: "desc" }, take: 500 });

    const groupErrors = (area: string) => {
      const filtered = errorRows.filter((row) => row.area === area);
      const grouped = new Map<string, { provider: string; message: string; count: number; lastSeen: Date }>();
      for (const row of filtered) {
        const key = `${row.provider ?? "unknown"}|${row.message.slice(0, 140)}`;
        const existing = grouped.get(key);
        if (existing) existing.count += 1;
        else
          grouped.set(key, {
            provider: row.provider ?? "unknown",
            message: row.message.slice(0, 200),
            count: 1,
            lastSeen: new Date(row.createdAt),
          });
      }
      return [...grouped.values()].sort((a, b) => b.count - a.count).slice(0, 10);
    };

    const cacheHits = cacheRows.reduce((total, row) => total + row.hits, 0);
    const helpful = feedbackRows.filter((row) => row.helpful).length;
    const notHelpful = feedbackRows.length - helpful;
    const reasonCounts = new Map<string, number>();
    for (const row of feedbackRows) {
      if (!row.reason) continue;
      reasonCounts.set(row.reason, (reasonCounts.get(row.reason) ?? 0) + 1);
    }

    const readCount = (value: unknown): number => (typeof value === "number" ? value : 0);

    return {
      databaseAvailable: true,
      totals: {
        searches,
        researchSessions: sessions,
        cachedResearch: cacheRows.length,
        cacheHits,
        savedSearches: await client.savedSearch.count(),
        identifications,
        users,
        feedback: feedbackRows.length,
      },
      popularQueries: popularRows
        .map((row) => ({
          query: String(row.normalizedQuery ?? ""),
          count: readCount((row._count as Record<string, unknown> | undefined)?.normalizedQuery),
        }))
        .filter((row) => row.query.length > 0),
      verdictDistribution: verdictRows.map((row) => ({
        verdict: String(row.verdict ?? "unknown"),
        count: readCount((row._count as Record<string, unknown> | undefined)?.verdict),
      })),
      noResultSearches: verdictRows.find((row) => row.verdict === "insufficient_evidence")
        ? readCount((verdictRows.find((row) => row.verdict === "insufficient_evidence")!._count as Record<string, unknown>)?.verdict)
        : 0,
      failedSearches: errorRows.filter((row) => row.area === "search").length,
      usage: {
        searchCalls: readCount((searchAggregate as { _count?: number })._count),
        aiCalls: readCount((usageAggregate as { _count?: number })._count),
        pagesFetched: readCount((fetchAggregate as { _count?: number })._count),
        promptTokens: readCount((usageAggregate as { _sum?: { promptTokens?: number } })._sum?.promptTokens),
        completionTokens: readCount((usageAggregate as { _sum?: { completionTokens?: number } })._sum?.completionTokens),
        estimatedCostUsd: Number(
          (
            readCount((usageAggregate as { _sum?: { costUsd?: number } })._sum?.costUsd) +
            readCount((searchAggregate as { _sum?: { costUsd?: number } })._sum?.costUsd)
          ).toFixed(4),
        ),
        averageResearchMs: Math.round(readCount((sessionAggregate as { _avg?: { durationMs?: number } })._avg?.durationMs)),
      },
      providerUsage: providerRows.map((row) => ({
        provider: String(row.provider ?? "unknown"),
        count: readCount((row._count as Record<string, unknown> | undefined)?.provider),
        cost: Number(readCount((row._sum as Record<string, unknown> | undefined)?.costUsd).toFixed(4)),
      })),
      sourceFailures: groupErrors("search"),
      aiErrors: groupErrors("ai"),
      feedbackSummary: {
        helpful,
        notHelpful,
        topReasons: [...reasonCounts.entries()]
          .map(([reason, count]) => ({ reason, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 6),
      },
      averageResearchTimeMs: Math.round(readCount((sessionAggregate as { _avg?: { durationMs?: number } })._avg?.durationMs)),
      cacheHitRate: sessions + cacheHits === 0 ? 0 : cacheHits / (sessions + cacheHits),
    };
  });
}

/** Best-effort housekeeping used by the admin dashboard. */
export async function pruneExpiredResearch(olderThanDays = 90): Promise<number> {
  const result = await withDb(async (client) => {
    const cutoff = new Date(Date.now() - olderThanDays * 86_400_000);
    const outcome = await client.researchSession.deleteMany({ where: { expiresAt: { lt: cutoff } } });
    logger.info("pruned old research sessions", { count: outcome.count });
    return outcome.count;
  });
  return result ?? 0;
}
