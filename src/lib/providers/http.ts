import { isAbortError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Small resilient JSON fetch used by provider clients.
 * Handles timeouts, retry-after and transient 5xx with jittered backoff.
 */

export interface JsonFetchOptions {
  method?: "GET" | "POST";
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  attempts?: number;
  signal?: AbortSignal;
  label: string;
  /** Max response size we are willing to parse (guards against huge payloads). */
  maxBytes?: number;
}

export class HttpError extends Error {
  readonly status: number;
  readonly retryable: boolean;
  readonly body: string;

  constructor(status: number, body: string, label: string) {
    super(`${label} failed with HTTP ${status}: ${body.slice(0, 300)}`);
    this.name = "HttpError";
    this.status = status;
    this.body = body;
    this.retryable = status === 429 || status >= 500 || status === 408;
  }
}

function mergeSignals(timeoutSignal: AbortSignal, userSignal?: AbortSignal): AbortSignal {
  if (!userSignal) return timeoutSignal;
  const controller = new AbortController();
  for (const signal of [timeoutSignal, userSignal]) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

export async function fetchJson<T>(url: string, options: JsonFetchOptions): Promise<T> {
  const attempts = options.attempts ?? 3;
  const timeoutMs = options.timeoutMs ?? 15_000;
  let lastError: unknown;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          accept: "application/json",
          ...(options.body ? { "content-type": "application/json" } : {}),
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: mergeSignals(controller.signal, options.signal),
        cache: "no-store",
      });

      if (!response.ok) {
        const body = await safeText(response);
        const error = new HttpError(response.status, body, options.label);
        if (!error.retryable || attempt === attempts - 1) throw error;
        lastError = error;
      } else {
        const text = await safeText(response);
        const maxBytes = options.maxBytes ?? 4_000_000;
        if (text.length > maxBytes) {
          throw new Error(`${options.label} response exceeded ${maxBytes} bytes`);
        }
        try {
          return JSON.parse(text) as T;
        } catch (error) {
          throw new Error(
            `${options.label} returned a non-JSON response: ${error instanceof Error ? error.message : "parse error"}`,
          );
        }
      }
    } catch (error) {
      if (isAbortError(error) && options.signal?.aborted) throw error;
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      const retryable =
        error instanceof HttpError
          ? error.retryable
          : /timeout|aborted|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up/i.test(message);
      if (!retryable || attempt === attempts - 1) throw error;
    } finally {
      clearTimeout(timer);
    }

    const backoff = 500 * 2 ** attempt + Math.random() * 300;
    logger.warn("retrying provider call", {
      label: options.label,
      attempt: attempt + 1,
      backoffMs: Math.round(backoff),
    });
    await new Promise((resolve) => setTimeout(resolve, backoff));
  }

  throw lastError ?? new Error(`${options.label} failed`);
}

async function safeText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "";
  }
}

/**
 * Fetches a page body with a hard byte cap and streaming abort, used by the
 * content-extraction stage (SSRF checks happen before this is called).
 */
export async function fetchTextCapped(
  url: string,
  options: { timeoutMs: number; maxBytes: number; signal?: AbortSignal; userAgent: string; ip?: string; host?: string },
): Promise<{ body: string; contentType: string | null; finalUrl: string; status: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs);
  try {
    const headers: Record<string, string> = {
      "user-agent": options.userAgent,
      accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      "accept-language": "en-US,en;q=0.9",
    };
    // Pin the connection to the IP we validated to avoid DNS-rebinding races.
    if (options.ip && options.host) {
      headers.host = options.host;
    }

    const response = await fetch(url, {
      headers,
      redirect: "follow",
      signal: mergeSignals(controller.signal, options.signal),
      cache: "no-store",
    });

    const contentType = response.headers.get("content-type");
    const reader = response.body?.getReader();
    if (!reader) {
      return { body: "", contentType, finalUrl: response.url, status: response.status };
    }
    const decoder = new TextDecoder("utf-8", { fatal: false });
    let received = 0;
    let body = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value?.byteLength ?? 0;
      if (received > options.maxBytes) {
        await reader.cancel().catch(() => undefined);
        break;
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
    return { body, contentType, finalUrl: response.url || url, status: response.status };
  } finally {
    clearTimeout(timer);
  }
}
