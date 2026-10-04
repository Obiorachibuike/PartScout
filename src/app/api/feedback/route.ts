import { jsonError, jsonOk, noStoreHeaders, parseJsonBody } from "@/lib/api/respond";
import { ValidationError } from "@/lib/errors";
import { getSessionFromRequest, verifyCsrf } from "@/lib/auth/session";
import { feedbackSchema } from "@/lib/validation/schemas";
import { recordFeedback } from "@/lib/db/research-repository";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/feedback — "Was this result helpful?" plus a reason when it was not. */
export async function POST(request: Request) {
  try {
    checkRateLimit({
      key: `feedback:${clientIp(request)}`,
      limit: 60,
      windowMs: 60 * 60 * 1000,
      throwOnLimit: true,
    });

    if (!verifyCsrf(request)) throw new ValidationError("Missing or invalid CSRF token");

    const body = await parseJsonBody(request, feedbackSchema);
    const session = await getSessionFromRequest(request);
    const stored = await recordFeedback({
      researchId: body.researchId ?? null,
      userId: session?.id ?? null,
      helpful: body.helpful,
      reason: body.reason ?? null,
      comment: body.comment ?? null,
    });

    return jsonOk({ recorded: stored, persistenceEnabled: stored }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}
