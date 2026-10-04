/**
 * Database row types + a narrow client interface.
 *
 * PartScout talks to Postgres through Prisma, but the ORM is isolated behind this
 * interface for three reasons:
 *
 *  1. The research pipeline must keep working when no database is reachable
 *     (degraded mode) — losing history is acceptable, losing research is not.
 *  2. Business logic depends on a small, explicit contract instead of the whole
 *     generated client surface, which keeps the pipeline unit-testable with an
 *     in-memory implementation (see tests/helpers/memory-db.ts).
 *  3. Type-checking and builds work even before `prisma generate` has run.
 *
 * Run `npm run db:generate` after installing dependencies to create the Prisma
 * client; the adapter in `client.ts` loads it lazily at runtime.
 */

export interface UserRow {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string | null;
  image: string | null;
  role: "USER" | "ADMIN";
  plan: "FREE" | "PRO" | "TECHNICIAN";
  emailVerified: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountRow {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  createdAt: Date;
}

export interface SessionRow {
  id: string;
  userId: string;
  sessionToken: string;
  expires: Date;
  createdAt: Date;
}

export interface SearchRow {
  id: string;
  userId: string | null;
  researchId: string | null;
  query: string;
  normalizedQuery: string;
  intent: string;
  device: string | null;
  partCategory: string | null;
  partNumber: string | null;
  ipHash: string | null;
  createdAt: Date;
}

export interface ResearchSessionRow {
  id: string;
  userId: string | null;
  cacheKey: string;
  question: string;
  normalizedQuery: string;
  intent: string;
  device: string | null;
  deviceBrand: string | null;
  partCategory: string | null;
  partNumber: string | null;
  verdict: string;
  confidenceScore: number;
  confidenceLevel: string;
  fixtureData: boolean;
  answerMethod: string | null;
  searchProvider: string | null;
  aiProvider: string | null;
  durationMs: number;
  estimatedCostUsd: number;
  report: unknown;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date | null;
}

export interface ResearchSourceRow {
  id: string;
  researchId: string;
  url: string;
  domain: string;
  title: string;
  siteName: string | null;
  sourceType: string | null;
  tier: number;
  quality: number;
  fetched: boolean;
  evidenceSnippet: string | null;
  createdAt: Date;
}

export interface ResearchClaimRow {
  id: string;
  researchId: string;
  sourceUrl: string | null;
  sourceDomain: string | null;
  device: string | null;
  modelNumbers: string[];
  partNumber: string | null;
  partCategory: string | null;
  claim: string;
  evidenceText: string;
  strength: number;
  extractionMethod: string | null;
  createdAt: Date;
}

export interface SavedSearchRow {
  id: string;
  userId: string;
  label: string;
  query: string;
  mode: string;
  researchId: string | null;
  createdAt: Date;
}

export interface FeedbackRow {
  id: string;
  researchId: string | null;
  userId: string | null;
  helpful: boolean;
  reason: string | null;
  comment: string | null;
  createdAt: Date;
}

export interface UsageRecordRow {
  id: string;
  userId: string | null;
  researchId: string | null;
  area: string;
  provider: string;
  model: string | null;
  label: string | null;
  promptTokens: number;
  completionTokens: number;
  costUsd: number;
  durationMs: number;
  createdAt: Date;
}

export interface PartIdentificationRow {
  id: string;
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
  researchId: string | null;
  createdAt: Date;
}

export interface SearchCacheRow {
  id: string;
  key: string;
  provider: string;
  query: string;
  payload: unknown;
  hits: number;
  createdAt: Date;
  expiresAt: Date;
}

export interface SourceCacheRow {
  id: string;
  key: string;
  url: string;
  title: string | null;
  domain: string | null;
  text: string;
  wordCount: number;
  fetched: boolean;
  createdAt: Date;
  expiresAt: Date;
}

export interface ResearchCacheRow {
  id: string;
  key: string;
  normalisedQuery: string;
  intent: string;
  report: unknown;
  verdict: string;
  confidenceScore: number;
  hits: number;
  createdAt: Date;
  expiresAt: Date;
}

export interface ApiErrorLogRow {
  id: string;
  area: string;
  provider: string | null;
  message: string;
  detail: string | null;
  retryable: boolean;
  context: string | null;
  createdAt: Date;
}

/** Subset of the Prisma delegate surface that PartScout actually uses. */
export interface Delegate<T> {
  create(args: { data: Record<string, unknown> }): Promise<T>;
  findUnique(args: { where: Record<string, unknown> }): Promise<T | null>;
  findFirst(args?: { where?: Record<string, unknown>; orderBy?: unknown }): Promise<T | null>;
  findMany(args?: {
    where?: Record<string, unknown>;
    orderBy?: unknown;
    take?: number;
    skip?: number;
    select?: Record<string, boolean>;
    distinct?: string[];
  }): Promise<T[]>;
  update(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<T>;
  updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }>;
  upsert(args: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }): Promise<T>;
  deleteMany(args?: { where?: Record<string, unknown> }): Promise<{ count: number }>;
  count(args?: { where?: Record<string, unknown> }): Promise<number>;
  groupBy?(args: {
    by: string[];
    where?: Record<string, unknown>;
    _count?: Record<string, boolean>;
    _sum?: Record<string, boolean>;
    _avg?: Record<string, boolean>;
    orderBy?: unknown;
    take?: number;
  }): Promise<Array<Record<string, unknown>>>;
  aggregate?(args: {
    where?: Record<string, unknown>;
    _avg?: Record<string, boolean>;
    _sum?: Record<string, boolean>;
    _count?: boolean;
  }): Promise<Record<string, unknown>>;
}

export interface PartScoutClient {
  user: Delegate<UserRow>;
  account: Delegate<AccountRow>;
  session: Delegate<SessionRow>;
  search: Delegate<SearchRow>;
  researchSession: Delegate<ResearchSessionRow>;
  researchSource: Delegate<ResearchSourceRow>;
  researchClaim: Delegate<ResearchClaimRow>;
  savedSearch: Delegate<SavedSearchRow>;
  feedback: Delegate<FeedbackRow>;
  usageRecord: Delegate<UsageRecordRow>;
  partIdentification: Delegate<PartIdentificationRow>;
  searchCache: Delegate<SearchCacheRow>;
  sourceCache: Delegate<SourceCacheRow>;
  researchCache: Delegate<ResearchCacheRow>;
  apiErrorLog: Delegate<ApiErrorLogRow>;
  $queryRawUnsafe?(query: string): Promise<unknown>;
  $disconnect?(): Promise<void>;
}
