import { Router } from "express";
import { passport, hashPassword, requireAuth, requireRecentAuth, requireRole } from "../auth";
import { verifyTotp, consumeBackupCode } from "../services/mfa";
import { generateCsrfToken } from "../csrf";
import { storage } from "../storage";
import { registerSchema, loginSchema } from "@shared/schema";
import { tenantIdFromReq, generateCode } from "./utils";
import { checkLoginLockout, recordLoginFailure, resetLoginFailures } from "../security";
import { sendAccessApprovedEmail, sendAccessRejectedEmail, sendPasswordChangedEmail, sendRolePromotionEmail } from "../services/email";

const router = Router();

// ─── Login route with Account Lockout & Audit Log wiring ─────────────────────
router.post("/auth/login", (req: any, res: any, next: any) => {
  const parse = loginSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Invalid input", issues: parse.error.issues });

  const { username } = parse.data;
  const ip = req.ip || "unknown";

  // Check brute force account lockout
  const lockout = checkLoginLockout(username, ip);
  if (lockout.locked) {
    res.setHeader("Retry-After", String(lockout.retryAfterSeconds));
    return res.status(429).json({
      error: `Too many failed attempts. Locked out for ${lockout.retryAfterSeconds} seconds.`,
      code: "ACCOUNT_LOCKED",
      retryAfter: lockout.retryAfterSeconds,
    });
  }

  passport.authenticate("local", (err: any, user: any, info: any) => {
    if (err) return next(err);
    if (!user) {
      // Record login failure
      recordLoginFailure(username, ip);

      // Audit log failed login
      storage.createAuditLog({
        action: "LOGIN_FAILED",
        resourceType: "USER",
        resourceId: "anonymous",
        userId: "anonymous",
        details: { username, reason: info?.message ?? "Invalid credentials" },
        tenantId: "TENANT-001",
      }).catch(logErr => console.error("Audit log failed for failed login:", logErr));

      return res.status(401).json({ error: info?.message ?? "Invalid credentials" });
    }

    // Check if user has MFA setup
    if (user.mfaEnabled) {
      req.session.mfaPendingUserId = user.id;
      return res.json({
        mfaRequired: true,
        username: user.username,
        message: "MFA code verification required to complete login."
      });
    }

    req.logIn(user, (loginErr: any) => {
      if (loginErr) return next(loginErr);

      // Reset login failures on success
      resetLoginFailures(username, ip);

      if (req.session) {
        req.session.recentAuthAt = Date.now();
        req.session.mfaVerified = false; // User has no MFA enabled
      }

      // Audit log successful login
      storage.createAuditLog({
        action: "USER_LOGGED_IN",
        resourceType: "USER",
        resourceId: user.id,
        userId: user.id,
        details: { username: user.username, role: user.role },
        tenantId: user.tenantId,
      }).catch(logErr => console.error("Audit log failed for login:", logErr));

      const { password: _, ...safeUser } = user;
      return res.json({ user: safeUser, message: "Login successful" });
    });
  })(req, res, next);
});

// ─── MFA Login Challenge ──────────────────────────────────────────────────────
router.post("/auth/mfa-challenge", async (req: any, res: any, next: any) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: "Code is required" });

  const userId = req.session.mfaPendingUserId;
  if (!userId) {
    return res.status(400).json({ error: "MFA challenge not initiated or session expired" });
  }

  const user = await storage.getUser(userId);
  if (!user || !user.isActive) {
    return res.status(401).json({ error: "User is disabled or not found" });
  }

  let verified = false;
  if (user.mfaSecret && verifyTotp(code, user.mfaSecret)) {
    verified = true;
  } else {
    // Try backup code
    const backupCodes = (user.mfaBackupCodes as string[]) || [];
    const matchedIdx = await consumeBackupCode(code, backupCodes);
    if (matchedIdx !== -1) {
      verified = true;
      const updatedBackupCodes = [...backupCodes];
      updatedBackupCodes.splice(matchedIdx, 1);
      await storage.updateUser(user.id, { mfaBackupCodes: updatedBackupCodes });
    }
  }

  if (!verified) {
    // Record login failure or handle lockout
    recordLoginFailure(user.username, req.ip || "unknown");
    return res.status(400).json({ error: "Invalid verification code" });
  }

  req.logIn(user, (loginErr: any) => {
    if (loginErr) return next(loginErr);

    resetLoginFailures(user.username, req.ip || "unknown");
    delete req.session.mfaPendingUserId;
    req.session.mfaVerified = true;
    req.session.recentAuthAt = Date.now();

    // Audit log successful login
    storage.createAuditLog({
      action: "USER_LOGGED_IN",
      resourceType: "USER",
      resourceId: user.id,
      userId: user.id,
      details: { username: user.username, role: user.role, mfa: true },
      tenantId: user.tenantId,
    }).catch(logErr => console.error("Audit log failed for login:", logErr));

    const { password: _, ...safeUser } = user;
    return res.json({ user: safeUser, message: "Login successful" });
  });
});

// ─── CSRF Token ───────────────────────────────────────────────────────────────
router.get("/csrf-token", (req: any, res: any) => {
  const token = generateCsrfToken(req.sessionID || "default-session-id");
  // CSRF tokens are bound to the session ID, so the response must never be
  // cached (reverse proxies / browsers would serve a stale token for another
  // session and cause every state-changing request to be rejected).
  res.setHeader("Cache-Control", "no-store, private, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Vary", "Origin, Cookie");
  // Return both keys for compatibility: `token` is what the client reads,
  // `csrfToken` kept for any legacy/external consumers.
  res.json({ token, csrfToken: token });
});

router.post("/auth/register", async (req: any, res: any) => {
  const parse = registerSchema.safeParse(req.body);
  if (!parse.success) return res.status(400).json({ error: "Validation failed", issues: parse.error.issues });

  const { confirmPassword, ...data } = parse.data;

  const [existingUsername, existingEmail] = await Promise.all([
    storage.getUserByUsername(data.username),
    storage.getUserByEmail(data.email),
  ]);
  if (existingUsername) return res.status(409).json({ error: "Username already taken", field: "username" });
  if (existingEmail) return res.status(409).json({ error: "Email already registered", field: "email" });

  const hashed = await hashPassword(data.password);
  const user = await storage.createUser({ ...data, password: hashed, tenantId: tenantIdFromReq(req) });

  await storage.createAuditLog({
    action: "USER_REGISTERED",
    resourceType: "USER",
    resourceId: user.id,
    userId: user.id,
    details: { username: user.username, role: user.role },
    tenantId: tenantIdFromReq(req),
  });

  const { password: _, ...safeUser } = user;
  return res.status(201).json({ user: safeUser, message: "Account created successfully" });
});

router.post("/auth/logout", (req: any, res: any, next: any) => {
  req.logout((err: any) => {
    if (err) return next(err);
    req.session.destroy((destroyErr: any) => {
      if (destroyErr) console.error("Session destroy error:", destroyErr);
      res.clearCookie("adrs.sid");
      res.json({ message: "Logged out successfully" });
    });
  });
});

router.get("/auth/me", (req: any, res: any) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Not authenticated", code: "UNAUTHENTICATED" });
  res.json({ user: req.user });
});

router.get("/auth/users", requireAuth, requireRole("ADMIN"), async (_req: any, res: any) => {
  const users = await storage.listUsers();
  res.json(users.map(({ password: _, ...u }) => u));
});

// Lightweight user list for dropdowns (any authenticated user)
router.get("/users", async (req: any, res: any) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: "Not authenticated" });
  const users = await storage.listUsers();
  res.json(
    users
      .filter(u => u.isActive)
      .map(({ password: _, ...u }) => ({ id: u.id, username: u.username, firstName: u.firstName, lastName: u.lastName, role: u.role }))
  );
});

// Change password
router.post("/auth/change-password", requireAuth, async (req: any, res: any) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: "Current password and new password are required" });
  }
  if (newPassword.length < 8) {
    return res.status(400).json({ error: "New password must be at least 8 characters" });
  }
  const authUser = req.user as any;
  const user = await storage.getUser(authUser.id);
  if (!user) return res.status(404).json({ error: "User not found" });

  const { verifyPassword } = await import("../auth");
  const valid = await verifyPassword(currentPassword, user.password);
  if (!valid) return res.status(401).json({ error: "Current password is incorrect" });

  const hashed = await hashPassword(newPassword);
  await storage.updateUser(user.id, { password: hashed, mustChangePassword: false } as any);

  await storage.createAuditLog({
    action: "PASSWORD_CHANGED",
    resourceType: "USER",
    resourceId: user.id,
    userId: user.id,
    details: { username: user.username, selfService: true },
    tenantId: tenantIdFromReq(req),
  });

  sendPasswordChangedEmail({ to: user.email, firstName: user.firstName })
    .catch(err => console.error("[EMAIL] Password changed email failed:", err));

  req.login({ ...req.user, mustChangePassword: false }, (err: any) => {
    if (err) console.error("Session refresh error:", err);
  });

  res.json({ message: "Password changed successfully" });
});

// Admin modify user
router.patch("/auth/users/:id", requireAuth, requireRole("ADMIN"), async (req: any, res: any) => {
  const ROLE_LEVEL: Record<string, number> = {
    SUPER_ADMIN: 5,
    ADMIN: 5,
    DATA_CONTROLLER: 4,
    DATA_PROTECTION_OFFICER: 4,
    REGULATOR: 4,
    ANALYST: 3,
    REVIEWER: 2,
    VIEWER: 1,
  };
  const adminUser = req.user as any;
  const existing = await storage.getUser(req.params.id);
  if (!existing) return res.status(404).json({ error: "User not found" });

  const allowed = ["isActive", "role", "firstName", "lastName"];
  const updates = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));
  const user = await storage.updateUser(req.params.id, updates as any);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (updates.role && updates.role !== existing.role) {
    const oldLevel = ROLE_LEVEL[existing.role] ?? 0;
    const newLevel = ROLE_LEVEL[updates.role as string] ?? 0;
    const isPromotion = newLevel > oldLevel;

    await storage.createAuditLog({
      action: isPromotion ? "USER_ROLE_PROMOTED" : "USER_ROLE_CHANGED",
      resourceType: "USER",
      resourceId: user.id,
      userId: adminUser?.id ?? "system",
      details: { username: user.username, oldRole: existing.role, newRole: updates.role, isPromotion },
      tenantId: tenantIdFromReq(req),
    });

    if (isPromotion && user.email) {
      const adminName = adminUser ? `${adminUser.firstName} ${adminUser.lastName}`.trim() || adminUser.username : "System Administrator";
      sendRolePromotionEmail({
        to: user.email,
        firstName: user.firstName,
        oldRole: existing.role,
        newRole: updates.role as string,
        promotedBy: adminName,
      }).catch((err: any) => console.error("[EMAIL] Role promotion email failed:", err));
    }
  }

  if (typeof updates.isActive !== "undefined" && updates.isActive !== existing.isActive) {
    await storage.createAuditLog({
      action: updates.isActive ? "USER_ACTIVATED" : "USER_DEACTIVATED",
      resourceType: "USER",
      resourceId: user.id,
      userId: adminUser?.id ?? "system",
      details: { username: user.username, isActive: updates.isActive },
      tenantId: tenantIdFromReq(req),
    });
  }

  const { password: _, ...safeUser } = user;
  res.json(safeUser);
});

// ─── Access Requests ────────────────────────────────────────────────────────
router.post("/access-requests", async (req: any, res: any) => {
  const { firstName, lastName, email, organisation, requestedRole, reason } = req.body;
  if (!firstName || !lastName || !email || !organisation || !requestedRole || !reason) {
    return res.status(400).json({ error: "All fields are required" });
  }
  const validRoles = ["SUPER_ADMIN", "ADMIN", "DATA_CONTROLLER", "DATA_PROTECTION_OFFICER", "ANALYST", "REVIEWER", "VIEWER", "REGULATOR"];
  if (!validRoles.includes(requestedRole)) {
    return res.status(400).json({ error: "Invalid role" });
  }
  const existingUser = await storage.getUserByEmail(email);
  if (existingUser) {
    return res.status(409).json({ error: "An account with this email already exists. Please sign in instead." });
  }
  const existingRequest = await storage.getAccessRequestByEmail(email);
  if (existingRequest) {
    if (existingRequest.status === "PENDING") {
      return res.status(409).json({ error: "An access request for this email is already pending review. Please wait for the administrator to respond." });
    }
    if (existingRequest.status === "APPROVED") {
      return res.status(409).json({ error: "An access request for this email was already approved. Please check your email for your login credentials." });
    }
  }
  const accessReq = await storage.createAccessRequest({
    firstName, lastName, email, organisation,
    requestedRole, reason, tenantId: "TENANT-001",
  });
  await storage.createAuditLog({
    action: "ACCESS_REQUEST_SUBMITTED",
    resourceType: "ACCESS_REQUEST",
    resourceId: accessReq.id,
    userId: "anonymous",
    details: { firstName, lastName, email, organisation, requestedRole },
    tenantId: "TENANT-001",
  });
  res.status(201).json({ id: accessReq.id, message: "Access request submitted successfully" });
});

router.get("/access-requests", requireAuth, requireRole("ADMIN"), async (_req: any, res: any) => {
  const reqs = await storage.getAccessRequests();
  res.json(reqs);
});

router.post("/access-requests/:id/approve", requireAuth, requireRole("ADMIN"), requireRecentAuth(15 * 60 * 1000), async (req: any, res: any) => {
  const accessReq = await storage.getAccessRequest(req.params.id);
  if (!accessReq) return res.status(404).json({ error: "Request not found" });
  if (accessReq.status !== "PENDING") return res.status(409).json({ error: "Request already reviewed" });

  const existing = await storage.getUserByEmail(accessReq.email);
  if (existing) return res.status(409).json({ error: "User with this email already exists" });

  const baseUsername = `${accessReq.firstName.toLowerCase().replace(/\s+/g, "")}.${accessReq.lastName.toLowerCase().replace(/\s+/g, "")}`;
  let username = baseUsername;
  let suffix = 1;
  while (await storage.getUserByUsername(username)) {
    username = `${baseUsername}${suffix++}`;
  }

  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  let tempPassword = "";
  const crypto = await import("crypto");
  for (let i = 0; i < 12; i++) {
    tempPassword += chars[crypto.randomInt(0, chars.length)];
  }
  tempPassword = `Adrs${tempPassword.slice(4)}!2`;

  const hashed = await hashPassword(tempPassword);
  const user = await storage.createUser({
    username,
    email: accessReq.email,
    password: hashed,
    firstName: accessReq.firstName,
    lastName: accessReq.lastName,
    role: accessReq.requestedRole,
    tenantId: accessReq.tenantId,
    isActive: true,
    mustChangePassword: true,
  } as any);

  await storage.updateAccessRequest(req.params.id, {
    status: "APPROVED",
    reviewedBy: (req.user as any)?.id,
    reviewedAt: new Date(),
    tempPassword,
    createdUserId: user.id,
  });

  await storage.createAuditLog({
    action: "ACCESS_REQUEST_APPROVED",
    resourceType: "ACCESS_REQUEST",
    resourceId: accessReq.id,
    userId: (req.user as any)?.id ?? "system",
    details: { email: accessReq.email, username, role: accessReq.requestedRole, newUserId: user.id },
    tenantId: tenantIdFromReq(req),
  });

  const { previewUrl: approvePreviewUrl } = await sendAccessApprovedEmail({
    to: accessReq.email,
    firstName: accessReq.firstName,
    username,
    tempPassword,
    role: accessReq.requestedRole,
  });

  const { password: _, ...safeUser } = user;
  res.json({ user: safeUser, username, tempPassword, emailPreviewUrl: approvePreviewUrl ?? null, message: "Request approved and account created" });
});

router.post("/access-requests/:id/reject", requireAuth, requireRole("ADMIN"), async (req: any, res: any) => {
  const accessReq = await storage.getAccessRequest(req.params.id);
  if (!accessReq) return res.status(404).json({ error: "Request not found" });
  if (accessReq.status !== "PENDING") return res.status(409).json({ error: "Request already reviewed" });

  const { rejectionReason } = req.body;
  await storage.updateAccessRequest(req.params.id, {
    status: "REJECTED",
    rejectionReason: rejectionReason ?? null,
    reviewedBy: (req.user as any)?.id,
    reviewedAt: new Date(),
  });

  await storage.createAuditLog({
    action: "ACCESS_REQUEST_REJECTED",
    resourceType: "ACCESS_REQUEST",
    resourceId: accessReq.id,
    userId: (req.user as any)?.id ?? "system",
    details: { email: accessReq.email, rejectionReason: rejectionReason ?? null },
    tenantId: tenantIdFromReq(req),
  });

  const { previewUrl: rejectPreviewUrl } = await sendAccessRejectedEmail({
    to: accessReq.email,
    firstName: accessReq.firstName,
    rejectionReason,
  });

  res.json({ message: "Request rejected", emailPreviewUrl: rejectPreviewUrl ?? null });
});

export default router;
