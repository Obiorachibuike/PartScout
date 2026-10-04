import type { PublicError } from "@/lib/errors";

/**
 * Browser-side API helper.
 *
 * Adds the CSRF double-submit header (readable cookie → request header) for
 * state-changing calls and unwraps PartScout's `{ ok, data | error }` envelope so
 * components can render real provider/database errors instead of guessing.
 */

export const CSRF_COOKIE = "ps_csrf";
export const CSRF_HEADER = "x-partscout-csrf";

export class ApiError extends Error {
  readonly publicError: PublicError;

  constructor(publicError: PublicError) {
    super(publicError.message);
    this.name = "ApiError";
    this.publicError = publicError;
  }
}

export function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}=([^;]*)`));
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  error: PublicError | null;
}

export async function apiFetch<T>(
  path: string,
  options: { method?: string; body?: unknown; formData?: FormData; signal?: AbortSignal } = {},
): Promise<ApiResult<T>> {
  const method = options.method ?? (options.body || options.formData ? "POST" : "GET");
  const headers: Record<string, string> = { accept: "application/json" };
  const csrf = readCookie(CSRF_COOKIE);

  let body: BodyInit | undefined;
  if (options.formData) {
    body = options.formData;
  } else if (options.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  if (csrf && method !== "GET" && method !== "HEAD") headers[CSRF_HEADER] = csrf;

  try {
    const response = await fetch(path, { method, headers, body, signal: options.signal, credentials: "same-origin" });
    let payload: { ok?: boolean; data?: T; error?: PublicError } | null = null;
    try {
      payload = (await response.json()) as { ok?: boolean; data?: T; error?: PublicError };
    } catch {
      payload = null;
    }
    if (!response.ok || payload?.ok === false) {
      return {
        ok: false,
        status: response.status,
        data: null,
        error:
          payload?.error ?? {
            code: response.status === 429 ? "rate_limited" : "internal_error",
            message: `Request failed (HTTP ${response.status}).`,
            remediation: ["Try again in a moment."],
            retryable: response.status >= 500 || response.status === 429,
          },
      };
    }
    return { ok: true, status: response.status, data: (payload?.data ?? null) as T | null, error: null };
  } catch (error) {
    const aborted = error instanceof Error && error.name === "AbortError";
    return {
      ok: false,
      status: 0,
      data: null,
      error: {
        code: aborted ? "timeout" : "network_error",
        message: aborted
          ? "The research request was cancelled."
          : "Could not reach PartScout. Check your connection and try again.",
        remediation: aborted ? [] : ["Check your network connection.", "Retry the request."],
        retryable: true,
      },
    };
  }
}
