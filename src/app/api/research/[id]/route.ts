import { jsonError, jsonOk, noStoreHeaders } from "@/lib/api/respond";
import { NotFoundError } from "@/lib/errors";
import { getResearchById } from "@/lib/db/research-repository";
import { getCachedResearch } from "@/lib/research/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/research/:id
 *
 * Report ids come from the database (persisted session) or, when no database is
 * configured, from the in-process research cache keyed by `rk_<cacheKey>`.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;

    if (id.startsWith("rk_")) {
      const cached = await getCachedResearch(id.slice(3));
      if (!cached) throw new NotFoundError("That research report is no longer cached");
      return jsonOk({ report: cached.report, createdAt: cached.createdAt, source: "cache" }, { headers: noStoreHeaders() });
    }

    const stored = await getResearchById(id);
    if (!stored) throw new NotFoundError("Research report not found");
    return jsonOk({ report: stored.report, createdAt: stored.createdAt, source: "database" }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}
