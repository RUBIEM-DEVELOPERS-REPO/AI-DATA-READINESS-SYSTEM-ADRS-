import net from "net";
import type { Request, Response, NextFunction } from "express";

function isPrivateIp(hostname: string): boolean {
  if (!hostname) return false;

  const normalized = hostname.toLowerCase();
  if (normalized === "localhost" || normalized === "::1" || normalized === "[::1]") return true;

  if (normalized.includes(".")) {
    const parts = normalized.split(".").map(part => Number.parseInt(part, 10));
    if (parts.some(part => Number.isNaN(part))) return false;
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 0) return true;
  }

  return false;
}

export function isSafeRemoteUrl(value: string | undefined): boolean {
  if (!value) return false;

  try {
    const parsed = new URL(value);
    if (!["http:", "https:"].includes(parsed.protocol)) return false;
    if (parsed.protocol === "http:" && process.env.NODE_ENV === "production") return false;
    if (isPrivateIp(parsed.hostname)) return false;

    return true;
  } catch {
    return false;
  }
}

export function getBootstrapCredentialConfig() {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();
  return {
    username: username || undefined,
    password: password || undefined,
  };
}

export function isBootstrapSeedingEnabled(): boolean {
  if (process.env.NODE_ENV === "production") {
    return process.env.ENABLE_BOOTSTRAP_SEEDING === "true" || process.env.SEED_DEMO_USERS === "true";
  }

  return true;
}

export function isRegulatorDiscoveryEnabled(): boolean {
  if (process.env.NODE_ENV === "production") {
    return process.env.ALLOW_REGULATOR_DISCOVERY === "true";
  }

  return true;
}

export function isAllowedHostname(hostname: string): boolean {
  return !isPrivateIp(hostname);
}

export function isIpAddress(value: string): boolean {
  return net.isIP(value) !== 0;
}

export function createCorsMiddleware(allowedOrigins: string[]) {
  const safeOrigins = new Set(allowedOrigins.map((origin) => origin.trim()).filter(Boolean));

  return (req: Request, res: Response, next: NextFunction) => {
    const origin = req.headers.origin;
    if (!origin) return next();

    if (!safeOrigins.has(origin)) {
      return res.status(403).json({ error: "CORS origin denied", code: "CORS_DENIED", origin });
    }

    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    res.setHeader("Vary", "Origin");

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }

    next();
  };
}

export function applySecurityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  res.setHeader("X-XSS-Protection", "0");
  if (process.env.NODE_ENV === "production") {
    res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    // Use a tighter CSP that avoids 'unsafe-inline' and 'unsafe-eval'. If inline scripts/styles are required,
    // prefer a nonce-based approach and add nonces at render time. This policy permits secure external connections
    // only to HTTPS origins and allows images from data/blob when necessary.
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests"
    );
  }
  next();
}

export function createRateLimiter(options: { windowMs: number; maxRequests: number }) {
  const requests = new Map<string, number[]>();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || "unknown";
    const now = Date.now();
    const windowStart = now - options.windowMs;
    const timestamps = requests.get(key) || [];
    const filtered = timestamps.filter(timestamp => timestamp > windowStart);

    if (filtered.length >= options.maxRequests) {
      res.status(429).json({ error: "Too many requests", code: "RATE_LIMITED" });
      return;
    }

    filtered.push(now);
    requests.set(key, filtered);
    next();
  };
}

interface LockoutEntry {
  attempts: number[];
  lockedUntil: number;
}
const loginFailures = new Map<string, LockoutEntry>();

export function checkLoginLockout(username: string, ip: string): { locked: boolean; retryAfterSeconds: number } {
  const key = `${username.toLowerCase().trim()}:${ip}`;
  const entry = loginFailures.get(key);
  if (!entry) return { locked: false, retryAfterSeconds: 0 };

  const now = Date.now();
  if (entry.lockedUntil > now) {
    return { locked: true, retryAfterSeconds: Math.ceil((entry.lockedUntil - now) / 1000) };
  }

  // Clean up old attempts
  const windowStart = now - 15 * 60 * 1000;
  entry.attempts = entry.attempts.filter(t => t > windowStart);
  loginFailures.set(key, entry);

  return { locked: false, retryAfterSeconds: 0 };
}

export function recordLoginFailure(username: string, ip: string): void {
  const key = `${username.toLowerCase().trim()}:${ip}`;
  const now = Date.now();
  const entry = loginFailures.get(key) || { attempts: [], lockedUntil: 0 };

  entry.attempts.push(now);
  const windowStart = now - 15 * 60 * 1000;
  const activeAttempts = entry.attempts.filter(t => t > windowStart);
  entry.attempts = activeAttempts;

  if (activeAttempts.length >= 5) {
    entry.lockedUntil = now + 15 * 60 * 1000; // 15 minutes lockout
  }

  loginFailures.set(key, entry);
}

export function resetLoginFailures(username: string, ip: string): void {
  const key = `${username.toLowerCase().trim()}:${ip}`;
  loginFailures.delete(key);
}

