/**
 * csrf.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Stateless CSRF protection using HMAC-SHA256.
 *
 * Automatically validates state-changing requests (POST, PUT, PATCH, DELETE)
 * against the user's unique session identifier.
 *
 * No external npm packages required.
 */

import { createHmac, timingSafeEqual } from "crypto";
import type { Request, Response, NextFunction } from "express";
import { getSecret } from "./secrets-manager";

// Excluded pre-auth / public endpoints
const EXCLUDED_PATHS = new Set([
  "/api/auth/login",
  "/api/auth/register",
  "/api/access-requests",
  "/api/csrf-token",
]);

function getCsrfSecret(): string {
  // Fall back to a default secret in dev if SESSION_SECRET is not set
  return getSecret("SESSION_SECRET") || "csrf-fallback-development-secret";
}

/**
 * Generate a cryptographically secure CSRF token tied to the user's session ID.
 */
export function generateCsrfToken(sessionId: string): string {
  const secret = getCsrfSecret();
  return createHmac("sha256", secret).update(sessionId).digest("hex");
}

/**
 * Verify if the provided CSRF token matches the session ID.
 */
export function verifyCsrfToken(token: string, sessionId: string): boolean {
  if (!token || !sessionId) return false;
  const expected = generateCsrfToken(sessionId);
  try {
    return timingSafeEqual(Buffer.from(token, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

/**
 * CSRF Protection middleware.
 * Verifies CSRF token for all state-changing HTTP requests.
 */
export function csrfMiddleware(req: Request, res: Response, next: NextFunction) {
  // 1. Skip safe HTTP methods
  const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);
  if (safeMethods.has(req.method)) {
    return next();
  }

  // 2. Skip explicitly excluded pre-auth or public endpoints
  if (EXCLUDED_PATHS.has(req.path)) {
    return next();
  }

  // 3. Extract token from header or body
  const token = req.headers["x-csrf-token"] as string || req.body?._csrf;
  const sessionId = req.sessionID;

  if (!token || !sessionId || !verifyCsrfToken(token, sessionId)) {
    req.log?.warn?.("CSRF validation failed", {
      path: req.path,
      method: req.method,
      hasToken: !!token,
      hasSession: !!sessionId,
    });
    return res.status(403).json({
      error: "CSRF token validation failed. State-changing request rejected.",
      code: "CSRF_ERROR"
    });
  }

  next();
}
