import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import session from "express-session";
import connectPg from "connect-pg-simple";
import bcrypt from "bcryptjs";
import { storage } from "./storage";
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
export function setupSession(app: Express) {
  const PgStore = connectPg(session);

  app.use(
    session({
      store: new PgStore({
        conString: process.env.DATABASE_URL!,
        tableName: "user_sessions",
        createTableIfMissing: true,
        ttl: 60 * 60 * 24 * 7, // 7 days
        pruneSessionInterval: 60 * 60, // Prune every hour
      }),
      secret: process.env.SESSION_SECRET!,
      resave: false,
      saveUninitialized: false,
      name: "adrs.sid",
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
      },
    })
  );

  app.use(passport.initialize());
  app.use(passport.session());
}

// ─── RBAC Middleware ────────────────────────────────────────────────────────
export type UserRole = "SUPER_ADMIN" | "ADMIN" | "ANALYST" | "REVIEWER" | "VIEWER";

const ROLE_HIERARCHY: Record<UserRole, number> = {
  SUPER_ADMIN: 5,
  ADMIN: 4,
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

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: "Authentication required", code: "UNAUTHENTICATED" });
    }
    const userRole = (req.user as any)?.role as UserRole;
    const userLevel = ROLE_HIERARCHY[userRole] ?? 0;
    const requiredLevel = Math.min(...roles.map(r => ROLE_HIERARCHY[r] ?? 0));
    if (userLevel < requiredLevel) {
      return res.status(403).json({
        error: "Insufficient permissions",
        code: "FORBIDDEN",
        required: roles,
        current: userRole,
      });
    }
    next();
  };
}

export { passport };
