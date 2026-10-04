import type { PartScoutClient } from "@/lib/db/types";
import { setDatabaseClientForTesting } from "@/lib/db/client";

/**
 * In-memory Prisma double for tests.
 *
 * The production code talks to a narrow `PartScoutClient` interface (see
 * src/lib/db/types.ts), so a small fake implementing the operations PartScout
 * actually uses is enough to exercise persistence, caching, saved searches,
 * feedback and the admin metrics without a Postgres instance.
 *
 * It is intentionally forgiving: unknown operators are ignored rather than
 * throwing, and uniqueness is best-effort — the goal is to test PartScout's
 * behaviour, not to re-implement Prisma.
 */

type Row = Record<string, unknown>;

const OPERATORS = new Set(["contains", "mode", "gte", "lte", "gt", "lt", "not", "in", "startsWith", "endsWith"]);

function isOperatorObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value) || value instanceof Date) return false;
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => OPERATORS.has(key));
}

function compare(a: unknown, b: unknown): number {
  if (a instanceof Date && b instanceof Date) return a.getTime() - b.getTime();
  const left = typeof a === "number" ? a : String(a ?? "");
  const right = typeof b === "number" ? b : String(b ?? "");
  return left < right ? -1 : left > right ? 1 : 0;
}

function matchField(rowValue: unknown, condition: unknown): boolean {
  if (isOperatorObject(condition)) {
    if (condition.equals !== undefined && !matchField(rowValue, condition.equals)) return false;
    if (condition.in !== undefined && !(condition.in as unknown[]).some((entry) => matchField(rowValue, entry))) {
      return false;
    }
    if (condition.not !== undefined && matchField(rowValue, condition.not)) return false;
    if (condition.gte !== undefined && compare(rowValue, condition.gte) < 0) return false;
    if (condition.lte !== undefined && compare(rowValue, condition.lte) > 0) return false;
    if (condition.gt !== undefined && compare(rowValue, condition.gt) <= 0) return false;
    if (condition.lt !== undefined && compare(rowValue, condition.lt) >= 0) return false;
    if (typeof condition.contains === "string") {
      const haystack = String(rowValue ?? "");
      const needle = condition.contains;
      const found = condition.mode === "insensitive" ? haystack.toLowerCase().includes(needle.toLowerCase()) : haystack.includes(needle);
      if (!found) return false;
    }
    if (typeof condition.startsWith === "string" && !String(rowValue ?? "").startsWith(condition.startsWith)) return false;
    if (typeof condition.endsWith === "string" && !String(rowValue ?? "").endsWith(condition.endsWith)) return false;
    return true;
  }

  if (condition instanceof Date) {
    const value = rowValue instanceof Date ? rowValue : new Date(String(rowValue));
    return value.getTime() === condition.getTime();
  }
  if (typeof condition === "object" && condition !== null && !Array.isArray(condition)) {
    // Prisma compound-unique shorthand, e.g. { researchId_url: { researchId, url } }
    return matchesRow({ ...(rowValue as Row) }, condition as Row);
  }
  return rowValue === condition;
}

function matchesRow(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  return Object.entries(where).every(([key, condition]) => {
    if (key === "OR") {
      const clauses = condition as Row[];
      return clauses.some((clause) => matchesRow(row, clause));
    }
    if (key === "AND") {
      const clauses = condition as Row[];
      return clauses.every((clause) => matchesRow(row, clause));
    }
    if (key === "NOT") return !matchesRow(row, condition as Row);
    return matchField(row[key], condition);
  });
}

function sortRows(rows: Row[], orderBy: unknown): Row[] {
  if (!orderBy) return rows;
  const entries = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((a, b) => {
    for (const entry of entries) {
      const [field, direction] = Object.entries(entry as Row)[0] ?? [];
      if (!field) continue;
      const nested = direction && typeof direction === "object" ? (direction as Row).sort : direction;
      const result = compare(a[field], b[field]);
      if (result !== 0) return nested === "desc" ? -result : result;
    }
    return 0;
  });
}

let idCounter = 0;
function nextId(prefix = "mem"): string {
  idCounter += 1;
  return `${prefix}_${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function createDelegate(rows: Row[], tableName: string) {
  const withDefaults = (data: Row): Row => ({
    id: (data.id as string | undefined) ?? nextId(tableName.slice(0, 3)),
    createdAt: (data.createdAt as Date | undefined) ?? new Date(),
    ...data,
  });

  return {
    async create(args: { data: Row }): Promise<Row> {
      const row = withDefaults(args.data);
      rows.push(row);
      return row;
    },
    async createMany(args: { data: Row[] | Row }): Promise<{ count: number }> {
      const list = Array.isArray(args.data) ? args.data : [args.data];
      for (const entry of list) rows.push(withDefaults(entry));
      return { count: list.length };
    },
    async findUnique(args: { where: Row }): Promise<Row | null> {
      return rows.find((row) => matchesRow(row, args.where)) ?? null;
    },
    async findFirst(args: { where?: Row; orderBy?: unknown } = {}): Promise<Row | null> {
      const filtered = rows.filter((row) => matchesRow(row, args.where));
      return sortRows(filtered, args.orderBy)[0] ?? null;
    },
    async findMany(args: { where?: Row; orderBy?: unknown; take?: number; skip?: number } = {}): Promise<Row[]> {
      let result = rows.filter((row) => matchesRow(row, args.where));
      result = sortRows(result, args.orderBy);
      if (args.skip) result = result.slice(args.skip);
      if (args.take !== undefined) result = result.slice(0, args.take);
      return result;
    },
    async update(args: { where: Row; data: Row }): Promise<Row> {
      const row = rows.find((entry) => matchesRow(entry, args.where));
      if (!row) throw new Error(`${tableName}: record to update not found`);
      Object.assign(row, args.data);
      return row;
    },
    async updateMany(args: { where?: Row; data: Row }): Promise<{ count: number }> {
      const matched = rows.filter((row) => matchesRow(row, args.where));
      for (const row of matched) Object.assign(row, args.data);
      return { count: matched.length };
    },
    async upsert(args: { where: Row; create: Row; update: Row }): Promise<Row> {
      const existing = rows.find((row) => matchesRow(row, args.where));
      if (existing) {
        Object.assign(existing, args.update);
        return existing;
      }
      const row = withDefaults(args.create);
      rows.push(row);
      return row;
    },
    async deleteMany(args: { where?: Row } = {}): Promise<{ count: number }> {
      const keep: Row[] = [];
      let removed = 0;
      for (const row of rows) {
        if (matchesRow(row, args.where)) removed += 1;
        else keep.push(row);
      }
      rows.length = 0;
      rows.push(...keep);
      return { count: removed };
    },
    async count(args: { where?: Row } = {}): Promise<number> {
      return rows.filter((row) => matchesRow(row, args.where)).length;
    },
    async groupBy(args: {
      by: string[];
      where?: Row;
      _count?: Record<string, boolean>;
      _sum?: Record<string, boolean>;
      _avg?: Record<string, boolean>;
      orderBy?: unknown;
      take?: number;
    }): Promise<Row[]> {
      const filtered = rows.filter((row) => matchesRow(row, args.where));
      const groups = new Map<string, Row[]>();
      for (const row of filtered) {
        const key = args.by.map((field) => String(row[field] ?? "")).join("::");
        const bucket = groups.get(key) ?? [];
        bucket.push(row);
        groups.set(key, bucket);
      }

      const result: Row[] = [...groups.entries()].map(([key, bucket]) => {
        const entry: Row = {};
        args.by.forEach((field, index) => {
          const value = key.split("::")[index] ?? "";
          entry[field] = value;
        });
        if (args._count) entry._count = Object.fromEntries(Object.keys(args._count).map((field) => [field, bucket.length]));
        if (args._sum) {
          entry._sum = Object.fromEntries(
            Object.keys(args._sum).map((field) => [
              field,
              bucket.reduce((sum, row) => sum + (typeof row[field] === "number" ? (row[field] as number) : 0), 0),
            ]),
          );
        }
        if (args._avg) {
          entry._avg = Object.fromEntries(
            Object.keys(args._avg).map((field) => [
              field,
              bucket.reduce((sum, row) => sum + (typeof row[field] === "number" ? (row[field] as number) : 0), 0) /
                Math.max(1, bucket.length),
            ]),
          );
        }
        return entry;
      });

      const orderKey = args.orderBy ? Object.keys(args.orderBy as Row)[0] : undefined;
      if (orderKey === "_count") {
        const inner = Object.keys((args.orderBy as Row)[orderKey as string] as Row)[0] as string;
        result.sort((a, b) => {
          const left = ((a._count as Row)?.[inner] as number) ?? 0;
          const right = ((b._count as Row)?.[inner] as number) ?? 0;
          return right - left;
        });
      }
      return args.take ? result.slice(0, args.take) : result;
    },
    async aggregate(args: { where?: Row; _avg?: Record<string, boolean>; _sum?: Record<string, boolean>; _count?: boolean } = {}): Promise<Row> {
      const filtered = rows.filter((row) => matchesRow(row, args.where));
      const entry: Row = {};
      if (args._count) entry._count = filtered.length;
      if (args._sum) {
        entry._sum = Object.fromEntries(
          Object.keys(args._sum).map((field) => [
            field,
            filtered.reduce((sum, row) => sum + (typeof row[field] === "number" ? (row[field] as number) : 0), 0),
          ]),
        );
      }
      if (args._avg) {
        entry._avg = Object.fromEntries(
          Object.keys(args._avg).map((field) => [
            field,
            filtered.length === 0
              ? null
              : filtered.reduce((sum, row) => sum + (typeof row[field] === "number" ? (row[field] as number) : 0), 0) /
                filtered.length,
          ]),
        );
      }
      return entry;
    },
  };
}

export interface MemoryDb {
  client: PartScoutClient;
  reset(): void;
  tables: Record<string, Row[]>;
}

export function createMemoryDb(): MemoryDb {
  const tables: Record<string, Row[]> = {
    user: [],
    account: [],
    session: [],
    search: [],
    researchSession: [],
    researchSource: [],
    researchClaim: [],
    savedSearch: [],
    feedback: [],
    usageRecord: [],
    partIdentification: [],
    searchCache: [],
    sourceCache: [],
    researchCache: [],
    apiErrorLog: [],
  };

  const client = {
    ...Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, createDelegate(rows, name)])),
    async $queryRawUnsafe(): Promise<unknown> {
      return [{ "?column?": 1 }];
    },
    async $disconnect(): Promise<void> {
      // no-op
    },
  } as unknown as PartScoutClient;

  return {
    client,
    tables,
    reset() {
      for (const rows of Object.values(tables)) rows.length = 0;
    },
  };
}

/** Installs the in-memory client for the duration of a test-suite. */
export function useMemoryDb(): MemoryDb {
  const db = createMemoryDb();
  setDatabaseClientForTesting(db.client);
  return db;
}

/** Restores "no database configured" behaviour. */
export function disableDatabase(): void {
  setDatabaseClientForTesting(null);
}
