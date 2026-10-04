import { z } from "zod";
import { createHash } from "node:crypto";
import { limits } from "@/lib/config";
import { jsonError, jsonOk, noStoreHeaders, parseJsonBody } from "@/lib/api/respond";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { getSessionFromRequest } from "@/lib/auth/session";
import { researchPartCompatibility } from "@/lib/research/research-pipeline";
import { ValidationError } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const schema = z.object({
  identifier: z.string().trim().min(2).max(80),
  hint: z.string().trim().max(200).optional().nullable(),
});

/**
 * POST /api/identify/manual
 *
 * The "I already know the number" path: skips vision entirely (and therefore
 * works even when no vision provider is configured) and researches the typed
 * identifier on the live web.
 */
export async function POST(request: Request) {
  try {
    checkRateLimit({
      key: `research:${clientIp(request)}`,
      limit: limits.maxResearchesPerHourPerIp,
      windowMs: 60 * 60 * 1000,
      throwOnLimit: true,
    });

    const body = await parseJsonBody(request, schema);
    const identifier = body.identifier.trim();
    if (!/[\p{L}\d]/u.test(identifier)) {
      throw new ValidationError("Enter a part number or model number to research");
    }

    const question = `Which phones are compatible with ${body.hint ? `${body.hint.trim()} ` : ""}${identifier}?`;
    const session = await getSessionFromRequest(request);

    const report = await researchPartCompatibility({
      question,
      mode: "part",
      userId: session?.id ?? null,
      ipHash: createHash("sha256").update(clientIp(request)).digest("hex").slice(0, 32),
      signal: request.signal,
    });

    return jsonOk({ question, report }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(error);
  }
}
