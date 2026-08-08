import type { Express } from "express";
import { storage } from "./storage";
import { isBootstrapSeedingEnabled } from "./security";
import { hashPassword } from "./auth";
import { registerRegistryRoutes } from "./routes_registry";
import { setupWebSocket } from "./websocket";
import { isAblyEnabled, issueClientToken } from "./services/ably-realtime";

// Import domain sub-routers
import authRouter from "./routes/auth";
import evidenceRouter from "./routes/evidence";
import extractionRouter from "./routes/extraction";
import datasetsRouter from "./routes/datasets";
import aiRouter from "./routes/ai";
import adminRouter from "./routes/admin";
import graphRouter from "./routes/graph";
import mfaRouter from "./routes/mfa";

// ─── Seed bootstrap users from environment variables ───────────────────────
async function seedAdminUser() {
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();
  if (!username || !password) {
    console.warn("[ADRS] BOOTSTRAP_ADMIN_USERNAME/BOOTSTRAP_ADMIN_PASSWORD not set; skipping admin bootstrap user.");
    return false;
  }

  const existing = await storage.getUserByUsername(username);
  if (existing) return false;

  const hashed = await hashPassword(password);
  const defaultTenant = process.env.DEFAULT_TENANT;
  if (!defaultTenant) {
    throw new Error("DEFAULT_TENANT environment variable is required to seed the bootstrap admin user.");
  }

  await storage.createUser({
    username,
    email: `${username}@local.example`,
    password: hashed,
    firstName: "System",
    lastName: "Admin",
    role: "SUPER_ADMIN",
    tenantId: defaultTenant,
    isActive: true,
  });
  console.log(`[ADRS] Bootstrap admin user created — username: ${username}`);
  return true;
}

async function seedPortalUsers() {
  const defaultTenant = process.env.DEFAULT_TENANT || "TENANT-001";
  const portalUsers = [
    {
      username: process.env.BOOTSTRAP_DPO_USERNAME?.trim(),
      password: process.env.BOOTSTRAP_DPO_PASSWORD?.trim(),
      email: process.env.BOOTSTRAP_DPO_EMAIL?.trim() || "dpo@local.example",
      firstName: "Default",
      lastName: "DPO",
      role: "DATA_PROTECTION_OFFICER" as const,
    },
    {
      username: process.env.BOOTSTRAP_REGULATOR_USERNAME?.trim(),
      password: process.env.BOOTSTRAP_REGULATOR_PASSWORD?.trim(),
      email: process.env.BOOTSTRAP_REGULATOR_EMAIL?.trim() || "regulator@local.example",
      firstName: "Default",
      lastName: "Regulator",
      role: "REGULATOR" as const,
    },
  ];

  for (const portalUser of portalUsers) {
    if (!portalUser.username || !portalUser.password) continue;

    const existing = await storage.getUserByUsername(portalUser.username);
    if (existing) continue;

    const hashed = await hashPassword(portalUser.password);
    await storage.createUser({
      username: portalUser.username,
      email: portalUser.email,
      password: hashed,
      firstName: portalUser.firstName,
      lastName: portalUser.lastName,
      role: portalUser.role,
      tenantId: defaultTenant,
      isActive: true,
    });
    console.log(`[ADRS] Bootstrap ${portalUser.role.toLowerCase()} user created — username: ${portalUser.username}`);
  }
}

// ─── Register routes ─────────────────────────────────────────────────────────
export async function registerRoutes(httpServer: any, app: Express): Promise<any> {
  const shouldSeedDemoUsers = isBootstrapSeedingEnabled();

  if (shouldSeedDemoUsers) {
    await seedAdminUser();
    await seedPortalUsers();
  } else {
    console.warn("[ADRS] Skipping bootstrap user seeding in production. Set BOOTSTRAP_ADMIN_USERNAME/BOOTSTRAP_ADMIN_PASSWORD to create initial accounts.");
  }

  // ─── API anti-caching header ────────────────────────────────────────────
  // Ensures no intermediate proxy/CDN/nginx cache ever stores dynamic API
  // responses (e.g. /api/auth/me). Without this, a cached 200 containing an
  // old session's user object is served to every visitor — including after
  // signout — which causes the app to appear permanently logged in.
  app.use("/api", (_req: any, res: any, next: any) => {
    res.setHeader("Cache-Control", "no-store, private, max-age=0");
    res.setHeader("Pragma", "no-cache");
    next();
  });

  // Mount decomposed domain routers under /api prefix
  app.use("/api", authRouter);
  app.use("/api", mfaRouter);
  app.use("/api", evidenceRouter);
  app.use("/api", extractionRouter);
  app.use("/api", datasetsRouter);
  app.use("/api", aiRouter);
  app.use("/api", adminRouter);
  app.use("/api", graphRouter);

  // Gate legacy Replit platform integrations (disabled by default)
  if (process.env.ENABLE_REPLIT_INTEGRATIONS === "true") {
    console.warn("[ADRS] ENABLE_REPLIT_INTEGRATIONS is true — mounting legacy platform endpoints. This is not recommended for production.");
    // In future if Replit routes are mounted, they would go here:
    // app.use("/api/replit/chat", replitChatRouter);
  }

  // Register compliance registry routes (Ropa / Data breaches)
  registerRegistryRoutes(app);

  // ─── Ably Token Endpoint ────────────────────────────────────────────────────
  // Authenticated clients call this to receive a short-lived Ably token request.
  // The browser then connects to Ably directly using this token.
  // Returns 404 when Ably is not configured (native ws mode).
  app.get("/api/ably/token", async (req: any, res: any) => {
    if (!isAblyEnabled()) {
      return res.status(404).json({
        error: "Ably not configured",
        message: "Set ABLY_API_KEY to enable Ably real-time mode.",
      });
    }

    if (!req.isAuthenticated() || !req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      const { id: userId, tenantId } = req.user as any;
      const tokenRequest = await issueClientToken(
        tenantId || "TENANT-001",
        String(userId),
      );
      res.json(tokenRequest);
    } catch (err: any) {
      res.status(500).json({ error: err.message || "Failed to issue Ably token" });
    }
  });

  // ─── WebSocket Setup ────────────────────────────────────────────────────────
  // In Ably mode this wires the event bus → Ably relay and returns early.
  // In native ws mode this attaches the WebSocket server to the http.Server.
  // Must be called after session middleware is set up (done in startServer()).
  const { sessionMiddleware } = await import("./auth");
  setupWebSocket(httpServer, sessionMiddleware);

  return httpServer;
}
