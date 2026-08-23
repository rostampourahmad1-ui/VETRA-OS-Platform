import type { Request, Response, NextFunction } from "express";
import { logger } from "../lib/logger";
import { metrics } from "../lib/metrics";

/**
 * VETRA-INFRA-05: Global Error Handler Middleware
 *
 * Catches all errors passed via 
ext(error) and returns a structured
 * JSON error response.  Every error is logged with the correlation ID
 * and the route's error counter is incremented for observability.
 *
 * Error response format:
 *   { error: string, code?: string, details?: unknown, correlationId?: string }
 *
 * This middleware must be registered AFTER all routes so it acts as the
 * final handler in the Express middleware chain.
 */

// ─── AppError class ─────────────────────────────────────────────────────────
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code?: string;
  public readonly details?: unknown;

  constructor(statusCode: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, code?: string, details?: unknown): AppError {
  return new AppError(400, message, code ?? "BAD_REQUEST", details);
}

export function unauthorized(message = "Unauthorized"): AppError {
  return new AppError(401, message, "UNAUTHORIZED");
}

export function forbidden(message = "Forbidden"): AppError {
  return new AppError(403, message, "FORBIDDEN");
}

export function notFound(message = "Resource not found"): AppError {
  return new AppError(404, message, "NOT_FOUND");
}

export function conflict(message: string): AppError {
  return new AppError(409, message, "CONFLICT");
}

export function unprocessable(message: string, details?: unknown): AppError {
  return new AppError(422, message, "UNPROCESSABLE", details);
}

export function tooMany(message = "Too many requests"): AppError {
  return new AppError(429, message, "TOO_MANY_REQUESTS");
}

export function internal(message = "Internal server error"): AppError {
  return new AppError(500, message, "INTERNAL_ERROR");
}

// ─── Zod validation error formatter ─────────────────────────────────────────
function formatZodError(err: { issues: Array<{ path: (string | number)[]; message: string; code: string }> }): {
  message: string;
  details: Array<{ field: string; message: string; code: string }>;
} {
  const details = err.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
    code: issue.code,
  }));
  return { message: "Validation failed", details };
}

// ─── Error counter helper ───────────────────────────────────────────────────
function incrementErrorCount(route: string, statusCode: number): void {
  const labelRoute = route || "/unknown";
  const labelStatus = String(statusCode);
  const c = metrics.counter("http_errors_total", "Total number of HTTP errors by route and status code", {
    route: labelRoute,
    status: labelStatus,
  });
  metrics.incCounter(c);
}

// ─── Global Error Handler ───────────────────────────────────────────────────
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const correlationId = (req as any).correlationId as string | undefined;
  const route = (req.route?.path as string) ?? req.path ?? "/unknown";
  const method = req.method;

  // ── Zod validation errors ───────────────────────────────────────────────
  if (err && typeof err === "object" && "issues" in err && Array.isArray((err as any).issues)) {
    const formatted = formatZodError(err as any);
    logger.warn(
      { err, correlationId, route, method },
      "Validation error: %s",
      formatted.message,
    );
    incrementErrorCount(route, 400);
    res.status(400).json({
      error: formatted.message,
      code: "VALIDATION_ERROR",
      details: formatted.details,
      correlationId,
    });
    return;
  }

  // ── AppError (known application errors) ─────────────────────────────────
  if (err instanceof AppError) {
    const level = err.statusCode >= 500 ? "error" : "warn";
    logger[level](
      { err, correlationId, route, method },
      "AppError: %s [%d]",
      err.message,
      err.statusCode,
    );
    incrementErrorCount(route, err.statusCode);
    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      details: err.details,
      correlationId,
    });
    return;
  }

  // ── Generic Error (unexpected) ──────────────────────────────────────────
  const message = err instanceof Error ? err.message : "Unknown error";
  logger.error(
    { err, correlationId, route, method },
    "Unhandled error: %s",
    message,
  );
  incrementErrorCount(route, 500);

  const clientMessage =
    process.env.NODE_ENV === "production"
      ? "Internal server error"
      : message;

  res.status(500).json({
    error: clientMessage,
    code: "INTERNAL_ERROR",
    correlationId,
  });
}
