import type { ResearchReport, ResearchStageEvent } from "@/types/research";
import type { PublicError } from "@/lib/errors";

/**
 * Client helper for the SSE research stream. Works in the browser and in Node
 * (used by tests) — it parses `event:`/`data:` frames from a fetch response body.
 */

export interface ResearchStreamHandlers {
  onOpen?: (payload: { capabilities: unknown; question: string }) => void;
  onStage?: (event: ResearchStageEvent) => void;
  onReport?: (report: ResearchReport) => void;
  onError?: (error: PublicError) => void;
}

export interface ResearchStreamOptions {
  question: string;
  mode?: string;
  /** Structured fields (device / part / part number) sent as the request body. */
  payloadOverride?: Record<string, unknown>;
  forceRefresh?: boolean;
  csrfToken?: string | null;
  signal?: AbortSignal;
  handlers?: ResearchStreamHandlers;
}

export async function streamResearch(options: ResearchStreamOptions): Promise<ResearchReport | null> {
  const response = await fetch("/api/research/stream", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(options.csrfToken ? { "x-partscout-csrf": options.csrfToken } : {}),
    },
    body: JSON.stringify(
      options.payloadOverride
        ? { ...options.payloadOverride, forceRefresh: options.forceRefresh ?? false, mode: options.mode ?? "auto" }
        : {
            question: options.question,
            mode: options.mode ?? "auto",
            forceRefresh: options.forceRefresh ?? false,
          },
    ),
    signal: options.signal,
  });

  if (!response.ok || !response.body) {
    let error: PublicError = {
      code: "internal_error",
      message: `Research request failed (HTTP ${response.status}).`,
      remediation: ["Try again in a moment."],
      retryable: true,
    };
    try {
      const payload = (await response.json()) as { error?: PublicError };
      if (payload.error) error = payload.error;
    } catch {
      // keep the generic error
    }
    options.handlers?.onError?.(error);
    return null;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let report: ResearchReport | null = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let separatorIndex = buffer.indexOf("\n\n");
    while (separatorIndex !== -1) {
      const frame = buffer.slice(0, separatorIndex);
      buffer = buffer.slice(separatorIndex + 2);
      separatorIndex = buffer.indexOf("\n\n");

      let eventName = "message";
      let data = "";
      for (const line of frame.split("\n")) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) data += line.slice(5).trim();
      }
      if (!data) continue;

      try {
        const parsed = JSON.parse(data) as unknown;
        if (eventName === "stage") options.handlers?.onStage?.(parsed as ResearchStageEvent);
        else if (eventName === "report") {
          report = parsed as ResearchReport;
          options.handlers?.onReport?.(report);
        } else if (eventName === "open") options.handlers?.onOpen?.(parsed as { capabilities: unknown; question: string });
        else if (eventName === "error") options.handlers?.onError?.(parsed as PublicError);
      } catch {
        // Ignore malformed frames rather than failing the whole stream.
      }
    }
  }

  return report;
}
