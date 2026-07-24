import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import connectPg from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { Pool } from "pg";
import { storage } from "./storage";
import { waitForDatabaseConnection } from "./db";
import type { User } from "@shared/schema";
import type { Express, Request, Response, NextFunction } from "express";

declare global {
  namespace Express {
    interface User extends Omit<import("@shared/schema").User, "password"> {}
  }
}

const BCRYPT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ─── Passport local strategy ───────────────────────────────────────────────
passport.use(
  new LocalStrategy({ usernameField: "username" }, async (username, password, done) => {
    try {
      const user = await storage.getUserByUsername(username.toLowerCase().trim());
      if (!user) return done(null, false, { message: "Invalid credentials" });
      if (!user.isActive) return done(null, false, { message: "Account is disabled. Contact your administrator." });

      const valid = await verifyPassword(password, user.password);
      if (!valid) return done(null, false, { message: "Invalid credentials" });

      const { password: _, ...safeUser } = user;
      await storage.updateUserLastLogin(user.id);
      return done(null, safeUser as Express.User);
    } catch (err) {
      return done(err);
    }
  })
);

passport.serializeUser((user: Express.User, done) => {
  done(null, (user as any).id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    const user = await storage.getUser(id);
    if (!user || !user.isActive) return done(null, false);
    const { password: _, ...safeUser } = user;
    done(null, safeUser as Express.User);
  } catch (err) {
    done(err);
  }
});

// ─── Session setup ─────────────────────────────────────────────────────────
const SESSION_TABLE_NAME = process.env.SESSION_TABLE_NAME || "adrs_sessions";

/**
 * The session handler instance — exported so the WebSocket server can
 * authenticate upgrade requests against the same session store.
 * Populated after setupSession() is called during app initialisation.
 */
export let sessionMiddleware: any = null;

export async function setupSession(app: Express) {
  const PgStore = connectPg(session);
  let sessionStore: session.Store;

  const sessionConnectionString = process.env.SESSION_DATABASE_URL || process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5444/storage_db";

  if (!process.env.SESSION_DATABASE_URL && !process.env.DATABASE_URL) {
    console.warn("[AUTH] SESSION_DATABASE_URL not set — falling back to the main database connection for local development.");
  }

  try {
    const sessionPool = new Pool({ connectionString: sessionConnectionString });
    try {
      await sessionPool.query("SELECT 1");
    } finally {
      await sessionPool.end();
    }

    sessionStore = new PgStore({
      conString: sessionConnectionString,
      tableName: SESSION_TABLE_NAME,
      createTableIfMissing: true,
      ttl: 60 * 60 * 24 * 7, // 7 days
      pruneSessionInterval: 60 * 60, // Prune every hour
    });
    console.log("[AUTH] Session store initialized with dedicated SESSION_DATABASE_URL — sessions are portal-isolated.");
  } catch (error) {
    console.error("[AUTH] Failed to initialize session store:", error);
    throw error;
  }


  const sessionSecret = process.env.SESSION_SECRET || (process.env.NODE_ENV === "production" ? undefined : "development-only-session-secret-change-me");
  if (!process.env.SESSION_SECRET && process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET must be configured in production");
  }

  const sessionHandler = session({
      store: sessionStore,
      secret: sessionSecret as string,
      resave: false,
      saveUninitialized: false,
      name: "adrs.sid",
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production" || process.env.FORCE_SECURE_COOKIES === "true",
        sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      },
    });

  // Capture the middleware instance for use by the WebSocket server
  sessionMiddleware = sessionHandler;

  app.use(sessionHandler);
  app.use(passport.initialize());
  app.use(passport.session());
}

// ─── RBAC Middleware ────────────────────────────────────────────────────────
export type UserRole = "SUPER_ADMIN" | "ADMIN" | "DATA_CONTROLLER" | "DATA_PROTECTION_OFFICER" | "ANALYST" | "REVIEWER" | "VIEWER" | "REGULATOR";

const ROLE_HIERARCHY: Record<UserRole, number> = {
  SUPER_ADMIN: 6,
  ADMIN: 5,
  DATA_CONTROLLER: 4,
  DATA_PROTECTION_OFFICER: 4,
  REGULATOR: 4,
  ANALYST: 3,
  REVIEWER: 2,
  VIEWER: 1,
};

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Authentication required", code: "UNAUTHENTICATED" });
  }
  next();
}

export function requireMfa(req: Request, res: Response, next: NextFunction) {
  if (!req.isAuthenticated()) {
    return res.status(401).json({ error: "Authentication required", code: "UNAUTHENTICATED" });
  }

  // Exclude MFA setup/verify endpoints from block
  if (req.path.startsWith("/mfa/") || req.path.startsWith("/api/mfa/")) {
    return next();
  }

  const user = req.user as any;
  const isRequired = user.role === "SUPER_ADMIN" || user.role === "REGULATOR";

  if ((isRequired || user.mfaEnabled) && !(req.session as any).mfaVerified) {
    return res.status(403).json({
      error: "MFA verification required",
      code: "MFA_REQUIRED",
      message: "You must complete Multi-Factor Authentication to access this resource."
    });
  }
  next();
}

export function requireRecentAuth(maxAgeMs = 15 * 60 * 1000) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required", code: "UNAUTHENTICATED" });
    }

    const sessionTimestamp = (req.session as any)?.recentAuthAt;
    const userTimestamp = (req.user as any)?.lastLoginAt;
    const recentAuthAt = typeof sessionTimestamp === "number"
      ? sessionTimestamp
      : typeof userTimestamp === "string" || userTimestamp instanceof Date
        ? new Date(userTimestamp).getTime()
        : undefined;

    if (typeof recentAuthAt === "number" && !Number.isNaN(recentAuthAt) && Date.now() - recentAuthAt <= maxAgeMs) {
      return next();
    }

    return res.status(401).json({
      error: "Re-authentication required to perform this action",
      code: "RECENT_AUTH_REQUIRED",
    });
  };
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required", code: "UNAUTHENTICATED" });
    }
    const userRole = (req.user as any)?.role as UserRole;

    const isPortalRole = userRole === "DATA_CONTROLLER" || userRole === "DATA_PROTECTION_OFFICER";
    const isRegulatorRole = userRole === "REGULATOR";
    const isPipelineRole = ["SUPER_ADMIN", "ADMIN", "ANALYST", "REVIEWER", "VIEWER"].includes(userRole);

    for (const allowedRole of roles) {
      if (allowedRole === "DATA_CONTROLLER" || allowedRole === "DATA_PROTECTION_OFFICER") {
        if (isPortalRole) return next();
      } else if (allowedRole === "REGULATOR") {
        if (isRegulatorRole) return next();
      } else {
        // Pipeline roles
        if (isPipelineRole && (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[allowedRole] ?? 0)) {
          return next();
        }
      }
    }

    return res.status(403).json({
      error: "Insufficient permissions",
      code: "FORBIDDEN",
      required: roles,
      current: userRole,
    });
  };
}

export { passport };

