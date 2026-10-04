import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getCapabilities, limits } from "@/lib/config";
import { jsonError, jsonOk, parseJsonBody, noStoreHeaders } from "@/lib/api/respond";
import { ValidationError } from "@/lib/errors";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { getSessionFromRequest } from "@/lib/auth/session";
import { researchRequestSchema } from "@/lib/validation/schemas";
import { composeQueryFromFields } from "@/lib/research/query-understanding";
import { researchPartCompatibility } from "@/lib/research/research-pipeline";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/research
 *
 * Runs the live-web compatibility research pipeline and returns the full report
 * (verdict, confidence, evidence, sources). Streaming is available at
 * /api/research/stream for the live stage UI.
 */
export async function POST(request: Request) {
  const startedAt = Date.now();
  const ip = clientIp(request);

  try {
    checkRateLimit({
      key: `research:${ip}`,
      limit: limits.maxResearchesPerHourPerIp,
      windowMs: 60 * 60 * 1000,
      throwOnLimit: true,
      message: `Research limit reached (${limits.maxResearchesPerHourPerIp} per hour). Try again shortly.`,
    });

    const body = await parseJsonBody(request, researchRequestSchema);
    const question =
      body.question && body.question.length > 0
        ? body.question
        : composeQueryFromFields({
            device: body.device,
            modelNumber: body.modelNumber,
            part: body.part,
            partNumber: body.partNumber,
          });

    if (!question || question.length < 3) {
      throw new ValidationError("Could not build a research question from the provided fields");
    }

    const session = await getSessionFromRequest(request);
    const ipHash = createHash("sha256").update(ip).digest("hex").slice(0, 32);

    const report = await researchPartCompatibility({
      question,
      mode: body.mode,
      userId: session?.id ?? null,
      ipHash,
      forceRefresh: body.forceRefresh,
    });

    return NextResponse.json(
      { ok: true, data: report },
      { headers: { ...noStoreHeaders(), "x-research-duration-ms": String(Date.now() - startedAt) } },
    );
  } catch (error) {
    logger.warn("research request failed", {
      error: error instanceof Error ? error.message.slice(0, 300) : String(error),
    });
    return jsonError(error);
  }
}

/** GET /api/research → capability check so clients can explain setup problems. */
export async function GET(request: Request) {
  const session = await getSessionFromRequest(request);
  const capabilities = getCapabilities();
  return jsonOk(
    {
      capabilities,
      authenticated: Boolean(session),
      rateLimit: { perHour: limits.maxResearchesPerHourPerIp },
    },
    { headers: noStoreHeaders() },
  );
}
