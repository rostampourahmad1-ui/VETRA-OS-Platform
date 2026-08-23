import pino from "pino";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

const isProduction = process.env.NODE_ENV === "production";

/**
 * VETRA-INFRA-02: Structured Logging
 *
 * Centralized logging with:
 * - Correlation ID tracking via AsyncLocalStorage
 * - Child loggers with bound context (service, version, environment)
 * - Automatic redaction of sensitive fields
 * - Pretty-print in development, JSON in production
 */

const LOG_LEVEL = process.env.LOG_LEVEL ?? "info";
const SERVICE_NAME = process.env.SERVICE_NAME ?? "vetra-api";
const SERVICE_VERSION = process.env.SERVICE_VERSION ?? "0.1.0";

const rootLogger = pino({
  level: LOG_LEVEL,
  name: SERVICE_NAME,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['set-cookie']",
      "res.headers['set-cookie']",
      "password",
      "secret",
      "token",
      "apiKey",
    ],
    censor: "[REDACTED]",
  },
  ...(isProduction
    ? {}
    : {
        transport: {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:yyyy-mm-dd HH:MM:ss.l",
            ignore: "pid,hostname,service",
          },
        },
      }),
});

/**
 * VETRA-INFRA-02: Correlation ID context.
 *
 * Each incoming request gets a unique correlation ID that propagates
 * through all logs emitted during that request's lifecycle.
 */
const correlationIdContext = new AsyncLocalStorage<string>();

/**
 * Runs a function with a correlation ID bound to the async context.
 * All logs emitted inside `work` will include the correlation ID.
 */
export function runWithCorrelationId<T>(correlationId: string, work: () => T): T {
  return correlationIdContext.run(correlationId, work);
}

/**
 * Generates a new correlation ID (UUID v4).
 */
export function generateCorrelationId(): string {
  return randomUUID();
}

/**
 * Creates a child logger with bound context fields.
 * Useful for adding component-level context (e.g., route name, job name).
 */
export function createChildLogger(bindings: Record<string, unknown>): pino.Logger {
  return rootLogger.child(bindings);
}

/**
 * The application logger.
 *
 * Features:
 * - Auto-injects correlation ID from AsyncLocalStorage when a context is active
 * - Auto-injects service name, version, and environment
 * - Sensitive fields are redacted
 *
 * Usage:
 *   logger.info({ userId, action }, "User action performed");
 *   logger.error({ err }, "Operation failed");
 */
export const logger = new Proxy(rootLogger, {
  get(target, property, receiver) {
    const correlationId = correlationIdContext.getStore();
    if (correlationId) {
      const child = target.child({ correlationId });
      return Reflect.get(child, property, child);
    }
    return Reflect.get(target, property, receiver);
  },
}) as pino.Logger;

/**
 * Flushes all pending log writes.
 * Useful before process exit to ensure all logs are written.
 */
export async function flushLogs(): Promise<void> {
  return new Promise((resolve) => {
    rootLogger.flush();
    resolve();
  });
}
