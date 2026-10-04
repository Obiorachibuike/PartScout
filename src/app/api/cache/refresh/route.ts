import { createHash } from "node:crypto";
import { limits } from "@/lib/config";
import { jsonError, jsonOk, noStoreHeaders, parseJsonBody } from "@/lib/api/respond";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { getSessionFromRequest } from "@/lib/auth/session";
import { refreshRequestSchema } from "@/lib/validation/schemas";
import { invalidateCachedResearch } from "@/lib/research/cache";
import { researchPartCompatibility } from "@/lib/research/research-pipeline";
import { ValidationError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/cache/refresh
 *
 * "Refresh research": drops the cached report for this question and re-runs the
 * pipeline against the live web (used by the "PartScout researched this
 * recently / Refresh research" prompt).
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  try {
    checkRateLimit({
      key: `research:${ip}`,
      limit: limits.maxResearchesPerHourPerIp,
      windowMs: 60 * 60 * 1000,
      throwOnLimit: true,
    });

    const body = await parseJsonBody(request, refreshRequestSchema);
    if (!body.cacheKey) throw new ValidationError("cacheKey is required");

    await invalidateCachedResearch(body.cacheKey);

    const session = await getSessionFromRequest(request);
    const question = request.headers.get("x-partscout-question")?.slice(0, 500);
    const report = question
      ? await researchPartCompatibility({
          question,
          userId: session?.id ?? null,
          ipHash: createHash("sha256").update(ip).digest("hex").slice(0, 32),
          forceRefresh: true,
        })
      : null;

    return jsonOk({ invalidated: true, report }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}
