import type { Express } from "express";
import { storage } from "./storage";
import { isBootstrapSeedingEnabled } from "./security";
import { hashPassword } from "./auth";
import { registerRegistryRoutes } from "./routes_registry";

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

  return httpServer;
}
