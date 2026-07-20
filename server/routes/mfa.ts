import { Router } from "express";
import { requireAuth, requireRecentAuth } from "../auth";
import { storage } from "../storage";
import {
  generateMfaSecret,
  generateTotpUri,
  verifyTotp,
  generateBackupCodes,
  consumeBackupCode,
  isMfaRequiredForRole,
} from "../services/mfa";

const router = Router();

// ─── MFA Status ─────────────────────────────────────────────────────────────
router.get("/mfa/status", requireAuth, async (req: any, res: any) => {
  const user = await storage.getUser(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });

  res.json({
    enabled: user.mfaEnabled,
    required: isMfaRequiredForRole(user.role),
  });
});

// ─── MFA Setup ──────────────────────────────────────────────────────────────
router.post("/mfa/setup", requireAuth, async (req: any, res: any) => {
  const user = await storage.getUser(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.mfaEnabled) {
    return res.status(400).json({ error: "MFA is already enabled" });
  }

  const { secret } = generateMfaSecret();
  const qrUri = generateTotpUri(secret, user.username);

  // Store in session temporarily until verified
  req.session.tempMfaSecret = secret;

  res.json({
    secret,
    qrUri,
    message: "Scan the QR code URI or enter the manual key in your authenticator app, then call /verify-setup to complete registration.",
  });
});

// ─── MFA Verify Setup ───────────────────────────────────────────────────────
router.post("/mfa/verify-setup", requireAuth, async (req: any, res: any) => {
  const user = await storage.getUser(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.mfaEnabled) {
    return res.status(400).json({ error: "MFA is already enabled" });
  }

  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: "Verification code is required" });
  }

  const tempSecret = req.session.tempMfaSecret;
  if (!tempSecret) {
    return res.status(400).json({ error: "MFA setup has not been initiated. Call /setup first." });
  }

  const isValid = verifyTotp(code, tempSecret);
  if (!isValid) {
    return res.status(400).json({ error: "Invalid verification code. Please try again." });
  }

  // Generate backup codes
  const { plain, hashed } = await generateBackupCodes();

  // Save to DB
  await storage.updateUser(user.id, {
    mfaSecret: tempSecret,
    mfaEnabled: true,
    mfaBackupCodes: hashed,
  });

  // Clear temp secret
  delete req.session.tempMfaSecret;
  req.session.mfaVerified = true;

  // Log audit trail
  await storage.createAuditLog({
    action: "MFA_ENABLED",
    resourceType: "USER",
    resourceId: user.id,
    userId: user.id,
    details: { username: user.username },
    tenantId: user.tenantId,
  });

  res.json({
    success: true,
    backupCodes: plain,
    message: "MFA successfully enabled. Save these backup codes in a secure location.",
  });
});

// ─── MFA Disable ────────────────────────────────────────────────────────────
router.post("/mfa/disable", requireAuth, requireRecentAuth(15 * 60 * 1000), async (req: any, res: any) => {
  const user = await storage.getUser(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (!user.mfaEnabled) {
    return res.status(400).json({ error: "MFA is not enabled" });
  }

  const { code } = req.body;
  if (!code) {
    return res.status(400).json({ error: "Verification code or backup code is required" });
  }

  let verified = false;

  // Try verifying as TOTP code first
  if (user.mfaSecret && verifyTotp(code, user.mfaSecret)) {
    verified = true;
  } else {
    // Try verifying as backup code
    const backupCodes = (user.mfaBackupCodes as string[]) || [];
    const matchedIdx = await consumeBackupCode(code, backupCodes);
    if (matchedIdx !== -1) {
      verified = true;
      // Remove backup code
      const updatedBackupCodes = [...backupCodes];
      updatedBackupCodes.splice(matchedIdx, 1);
      await storage.updateUser(user.id, { mfaBackupCodes: updatedBackupCodes });
    }
  }

  if (!verified) {
    return res.status(400).json({ error: "Invalid verification code or backup code" });
  }

  // Update user in DB
  await storage.updateUser(user.id, {
    mfaSecret: null,
    mfaEnabled: false,
    mfaBackupCodes: [],
  });

  delete req.session.mfaVerified;

  // Log audit trail
  await storage.createAuditLog({
    action: "MFA_DISABLED",
    resourceType: "USER",
    resourceId: user.id,
    userId: user.id,
    details: { username: user.username },
    tenantId: user.tenantId,
  });

  res.json({ success: true, message: "MFA successfully disabled." });
});

export default router;
