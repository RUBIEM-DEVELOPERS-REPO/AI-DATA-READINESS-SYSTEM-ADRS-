/**
 * logger.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Structured JSON logger with per-request correlation IDs.
 *
 * Usage:
 *   import { logger, createRequestLogger } from "./logger";
 *
 *   // Mount once in index.ts BEFORE all routes:
 *   app.use(createRequestLogger());
 *
 *   // Then anywhere:
 *   logger.info("something happened", { key: "value" });
 *   // or inside a route handler with correlation:
 *   req.log.info("request-scoped message", { userId: req.user?.id });
 */

import { randomUUID } from "crypto";
import type { Request, Response, NextFunction } from "express";

// ─── Types ────────────────────────────────────────────────────────────────────

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level: LogLevel;
  timestamp: string;
  correlationId: string | null;
  source: string;
  message: string;
  [key: string]: unknown;
}

// Augment Express Request so handlers can call req.log.*
declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      log: RequestLogger;
    }
  }
}

// ─── Core Logger ──────────────────────────────────────────────────────────────

class Logger {
  private source: string;
  private correlationId: string | null;

  constructor(source = "app", correlationId: string | null = null) {
    this.source = source;
    this.correlationId = correlationId;
  }

  private emit(level: LogLevel, message: string, meta: Record<string, unknown> = {}) {
    const entry: LogEntry = {
      level,
      timestamp: new Date().toISOString(),
      correlationId: this.correlationId,
      source: this.source,
      message,
      ...meta,
    };

    // Redact known-sensitive keys from meta before logging
    const redacted = redactSensitiveFields(entry);

    const line = JSON.stringify(redacted);
    if (level === "error") {
      process.stderr.write(line + "\n");
    } else {
      process.stdout.write(line + "\n");
    }
  }

  debug(message: string, meta?: Record<string, unknown>) {
    if (process.env.LOG_LEVEL === "debug") this.emit("debug", message, meta);
  }
  info(message: string, meta?: Record<string, unknown>) { this.emit("info", message, meta); }
  warn(message: string, meta?: Record<string, unknown>) { this.emit("warn", message, meta); }
  error(message: string, meta?: Record<string, unknown>) { this.emit("error", message, meta); }

  /** Create a child logger bound to a specific correlation ID. */
  child(correlationId: string, source?: string): Logger {
    return new Logger(source ?? this.source, correlationId);
  }
}

// Singleton for global use (no correlationId bound).
export const logger = new Logger("app");

// ─── Sensitive-Field Redaction ────────────────────────────────────────────────

const REDACT_KEYS = new Set([
  "password", "secret", "token", "apiKey", "api_key",
  "sessionSecret", "authorization", "cookie",
  "smtpPass", "smtp_pass", "connectionString",
  "DATABASE_URL", "SESSION_SECRET",
]);

function redactSensitiveFields(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (REDACT_KEYS.has(k)) {
      out[k] = "[REDACTED]";
    } else if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      out[k] = redactSensitiveFields(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

// ─── Request Logger Middleware ─────────────────────────────────────────────────

/** Per-request logger — bound to the request's correlationId. */
type RequestLogger = Pick<Logger, "debug" | "info" | "warn" | "error">;

export function createRequestLogger() {
  return (req: Request, res: Response, next: NextFunction) => {
    // Honour existing correlation ID from upstream proxy, or generate one.
    const correlationId =
      (typeof req.headers["x-correlation-id"] === "string" && req.headers["x-correlation-id"])
      || randomUUID();

    req.correlationId = correlationId;
    res.setHeader("X-Correlation-ID", correlationId);

    // Bind a child logger to this correlationId.
    const reqLogger = logger.child(correlationId, "http");
    req.log = reqLogger;

    const start = Date.now();

    reqLogger.info("request started", {
      method: req.method,
      path: req.path,
      ip: req.ip,
    });

    res.on("finish", () => {
      const duration = Date.now() - start;
      const level: LogLevel = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
      reqLogger[level]("request completed", {
        method: req.method,
        path: req.path,
        statusCode: res.statusCode,
        durationMs: duration,
      });
    });

    next();
  };
}
