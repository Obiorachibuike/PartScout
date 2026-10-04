import { jsonError, jsonOk, noStoreHeaders } from "@/lib/api/respond";
import { ForbiddenError } from "@/lib/errors";
import { getSessionFromRequest, isAdmin } from "@/lib/auth/session";
import { getAdminMetrics } from "@/lib/db/research-repository";
import { isDatabaseConfigured } from "@/lib/db/client";
import { researchCacheStats } from "@/lib/research/cache";
import { describeSearchSetup } from "@/lib/providers/search";
import { describeAIProvider } from "@/lib/providers/ai";
import { limits } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/metrics — operational dashboard data.
 *
 * Deliberately read-only: PartScout has no interface for entering compatibility
 * mappings, because its knowledge comes from live web research.
 */
export async function GET(request: Request) {
  try {
    const session = await getSessionFromRequest(request);
    if (!isAdmin(session)) {
      throw new ForbiddenError(
        "Admin access required. Add your email to ADMIN_EMAILS and sign in again.",
      );
    }

    const [metrics, cache, searchSetup, ai] = await Promise.all([
      getAdminMetrics(),
      researchCacheStats(),
      Promise.resolve(describeSearchSetup()),
      Promise.resolve(describeAIProvider()),
    ]);

    return jsonOk(
      {
        metrics,
        cache,
        providers: { search: searchSetup, ai },
        limits,
        databaseConfigured: isDatabaseConfigured(),
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    return jsonError(error);
  }
}
