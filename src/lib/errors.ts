/** Typed application errors used across the research pipeline and API layer. */

export class PartScoutError extends Error {
  readonly code: string;
  readonly status: number;
  readonly retryable: boolean;
  readonly remediation: string[];

  constructor(options: {
    code: string;
    message: string;
    status?: number;
    retryable?: boolean;
    remediation?: string[];
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "PartScoutError";
    this.code = options.code;
    this.status = options.status ?? 500;
    this.retryable = options.retryable ?? false;
    this.remediation = options.remediation ?? [];
  }
}

export class ValidationError extends PartScoutError {
  constructor(message: string, remediation: string[] = []) {
    super({ code: "invalid_input", message, status: 422, remediation });
    this.name = "ValidationError";
  }
}

export class ProviderNotConfiguredError extends PartScoutError {
  constructor(message: string, remediation: string[] = []) {
    super({ code: "provider_not_configured", message, status: 503, remediation });
    this.name = "ProviderNotConfiguredError";
  }
}

export class SearchFailedError extends PartScoutError {
  constructor(message: string, options: { retryable?: boolean; cause?: unknown } = {}) {
    super({
      code: "search_failed",
      message,
      status: 502,
      retryable: options.retryable ?? true,
      cause: options.cause,
    });
    this.name = "SearchFailedError";
  }
}

export class RateLimitError extends PartScoutError {
  constructor(message = "Too many requests. Please slow down.") {
    super({ code: "rate_limited", message, status: 429, retryable: true });
    this.name = "RateLimitError";
  }
}

export class BlockedUrlError extends PartScoutError {
  constructor(message: string) {
    super({ code: "blocked_url", message, status: 400 });
    this.name = "BlockedUrlError";
  }
}

export class ResearchTimeoutError extends PartScoutError {
  constructor(message = "Research exceeded its time budget.") {
    super({ code: "timeout", message, status: 504, retryable: true });
    this.name = "ResearchTimeoutError";
  }
}

export class UnauthorizedError extends PartScoutError {
  constructor(message = "You must be signed in.") {
    super({ code: "unauthorized", message, status: 401 });
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends PartScoutError {
  constructor(message = "You do not have access to this resource.") {
    super({ code: "forbidden", message, status: 403 });
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends PartScoutError {
  constructor(message = "Not found.") {
    super({ code: "not_found", message, status: 404 });
    this.name = "NotFoundError";
  }
}

export interface PublicError {
  code: string;
  message: string;
  remediation: string[];
  retryable: boolean;
}

/** Converts unknown throwables into a safe, user-facing error payload. */
export function toPublicError(error: unknown): PublicError {
  if (error instanceof PartScoutError) {
    return {
      code: error.code,
      message: error.message,
      remediation: error.remediation,
      retryable: error.retryable,
    };
  }
  if (error instanceof Error && error.name === "AbortError") {
    return {
      code: "timeout",
      message: "The request took too long and was cancelled.",
      remediation: ["Try again — live web research occasionally runs slow."],
      retryable: true,
    };
  }
  return {
    code: "internal_error",
    message: "Something went wrong while running this request.",
    remediation: ["Retry the research. If it keeps failing, check the admin dashboard for provider errors."],
    retryable: true,
  };
}

export function isAbortError(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { name?: string }).name === "AbortError");
}
