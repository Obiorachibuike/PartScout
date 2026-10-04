import { createHash } from "node:crypto";
import { getCapabilities, limits } from "@/lib/config";
import { jsonError, parseJsonBody } from "@/lib/api/respond";
import { toPublicError, ValidationError } from "@/lib/errors";
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
 * POST /api/research/stream
 *
 * Server-sent events: emits one `stage` event per research step (so the UI can
 * show live progress) and a final `report` event with the full report. When the
 * client disconnects, the abort signal cancels outstanding provider calls.
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
  } catch (error) {
    return jsonError(error);
  }

  let body;
  try {
    body = await parseJsonBody(request, researchRequestSchema);
  } catch (error) {
    return jsonError(error);
  }

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
    return jsonError(new ValidationError("Could not build a research question from the provided fields"));
  }

  const session = await getSessionFromRequest(request);
  const ipHash = createHash("sha256").update(ip).digest("hex").slice(0, 32);
  const capabilities = getCapabilities();
  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: string, data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      send("open", { capabilities, question: question.slice(0, 500) });

      try {
        const report = await researchPartCompatibility({
          question,
          mode: body.mode,
          userId: session?.id ?? null,
          ipHash,
          forceRefresh: body.forceRefresh,
          signal: request.signal,
          onStage: (stage) => send("stage", stage),
        });
        send("report", report);
      } catch (error) {
        logger.warn("streaming research failed", {
          error: error instanceof Error ? error.message.slice(0, 300) : String(error),
        });
        send("error", toPublicError(error));
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed by client disconnect
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      connection: "keep-alive",
      // Prevents reverse proxies (nginx/vercel) from buffering the stream.
      "x-accel-buffering": "no",
    },
  });
}
