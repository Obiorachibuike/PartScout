import { createHash } from "node:crypto";
import { limits } from "@/lib/config";
import { jsonError, jsonOk, noStoreHeaders } from "@/lib/api/respond";
import { ValidationError } from "@/lib/errors";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";
import { getSessionFromRequest } from "@/lib/auth/session";
import { detectImageMimeType, validateUpload } from "@/lib/validation/schemas";
import { getAIProvider } from "@/lib/providers/ai";
import { identifyPartFromImage, buildOverrideQuestion } from "@/lib/research/identify";
import { researchPartCompatibility } from "@/lib/research/research-pipeline";
import { UsageTracker } from "@/lib/research/usage";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * POST /api/identify  (multipart/form-data)
 *
 * fields: image (file, required), hint (string), runResearch (boolean),
 *         identifierOverride (string)
 *
 * Reads the printed identifier from a photo with a vision model, then (unless
 * disabled) runs the normal live-web research pipeline on that identifier.
 * Uploads are validated by magic bytes as well as declared type and size.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);

  try {
    checkRateLimit({
      key: `identify:${ip}`,
      limit: limits.maxIdentificationsPerHourPerIp,
      windowMs: 60 * 60 * 1000,
      throwOnLimit: true,
      message: `Identification limit reached (${limits.maxIdentificationsPerHourPerIp} per hour).`,
    });

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      throw new ValidationError("Upload the photo as multipart/form-data with an `image` field");
    }

    const form = await request.formData();
    const file = form.get("image");
    if (!(file instanceof File)) {
      throw new ValidationError("No image was uploaded (expected field `image`)");
    }

    const declaredType = file.type || "application/octet-stream";
    const buffer = Buffer.from(await file.arrayBuffer());

    const sizeCheck = validateUpload({
      mimeType: declaredType,
      byteLength: buffer.byteLength,
      maxBytes: limits.maxUploadBytes,
    });
    if (!sizeCheck.ok) throw new ValidationError(sizeCheck.message);

    const sniffed = detectImageMimeType(buffer);
    if (!sniffed) {
      throw new ValidationError("The uploaded file is not a readable JPEG, PNG, WebP or HEIC image");
    }

    const hint = typeof form.get("hint") === "string" ? String(form.get("hint")).slice(0, 200) : null;
    const runResearch = String(form.get("runResearch") ?? "true") !== "false";
    const identifierOverride =
      typeof form.get("identifierOverride") === "string" ? String(form.get("identifierOverride")).trim().slice(0, 80) : null;

    const session = await getSessionFromRequest(request);
    const tracker = new UsageTracker();
    const ai = getAIProvider({ usageSink: tracker.aiSink });

    const { identification, imageHash, researchQuestion, identificationId } = await identifyPartFromImage({
      buffer,
      mimeType: sniffed,
      hint,
      userId: session?.id ?? null,
      ai,
      tracker,
    });

    let report = null;
    if (runResearch) {
      const question = identifierOverride
        ? buildOverrideQuestion(identifierOverride, hint ?? identification.partCategory)
        : researchQuestion;
      if (question) {
        report = await researchPartCompatibility({
          question,
          mode: "part",
          userId: session?.id ?? null,
          ipHash: createHash("sha256").update(ip).digest("hex").slice(0, 32),
          signal: request.signal,
          aiOverride: ai,
        });
      }
    }

    return jsonOk(
      {
        identification,
        identificationId,
        imageHash,
        researchQuestion: identifierOverride ? buildOverrideQuestion(identifierOverride, hint ?? null) : researchQuestion,
        report,
        usage: tracker.toSummary({ cached: false }),
      },
      { headers: noStoreHeaders() },
    );
  } catch (error) {
    logger.warn("identification failed", {
      error: error instanceof Error ? error.message.slice(0, 300) : String(error),
    });
    return jsonError(error);
  }
}

export async function GET() {
  return jsonOk(
    {
      maxUploadBytes: limits.maxUploadBytes,
      acceptedTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"],
      visionAvailable: Boolean(getAIProvider()?.supportsVision),
    },
    { headers: noStoreHeaders() },
  );
}
