import { NextResponse } from "next/server";
import type { ZodError, ZodType } from "zod";
import { toPublicError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/** Shared API plumbing: typed JSON parsing, safe errors, CSRF-aware responses. */

export function jsonOk<T>(data: T, init?: { status?: number; headers?: Record<string, string> }): NextResponse {
  return NextResponse.json(
    { ok: true, data },
    { status: init?.status ?? 200, headers: init?.headers },
  );
}

export function jsonError(error: unknown): NextResponse {
  const publicError = toPublicError(error);
  const status =
    publicError.code === "invalid_input"
      ? 422
      : publicError.code === "unauthorized"
        ? 401
        : publicError.code === "forbidden"
          ? 403
          : publicError.code === "not_found"
            ? 404
            : publicError.code === "rate_limited"
              ? 429
              : publicError.code === "provider_not_configured"
                ? 503
                : publicError.code === "timeout"
                  ? 504
                  : 500;

  if (status >= 500) {
    logger.error("api error", { code: publicError.code, message: publicError.message });
  }
  return NextResponse.json({ ok: false, error: publicError }, { status });
}

export async function parseJsonBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(describeZodError(parsed.error), parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".") || "body"}: ${issue.message}`));
  }
  return parsed.data;
}

export function describeZodError(error: ZodError): string {
  const first = error.issues[0];
  if (!first) return "Invalid input";
  const path = first.path.join(".");
  return path ? `${path}: ${first.message}` : first.message;
}

export function noStoreHeaders(): Record<string, string> {
  return { "cache-control": "no-store, max-age=0" };
}
