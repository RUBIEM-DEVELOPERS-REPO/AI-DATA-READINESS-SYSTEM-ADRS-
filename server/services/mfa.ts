/**
 * mfa.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * TOTP-based Multi-Factor Authentication (RFC 6238).
 *
 * Uses Node.js built-in `crypto` — no additional npm packages required.
 * Compatible with Google Authenticator, Authy, and any TOTP app.
 *
 * MFA enforcement rules:
 *   - SUPER_ADMIN and REGULATOR roles MUST enroll and complete MFA.
 *   - Other roles may optionally enroll.
 *   - Once enrolled, every login requires a valid TOTP code.
 */

import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";
import bcrypt from "bcryptjs";

// ─── Constants ────────────────────────────────────────────────────────────────

/** Roles that MUST enroll in MFA before accessing protected resources. */
export const MFA_REQUIRED_ROLES = new Set(["SUPER_ADMIN", "REGULATOR"]);

const TOTP_PERIOD = 30;       // seconds per TOTP window
const TOTP_DIGITS = 6;        // code length
const TOTP_ALGORITHM = "sha1"; // RFC 6238 default
const TOTP_WINDOW = 1;        // allow ±1 window for clock skew
const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const BACKUP_CODE_COUNT = 8;
const BACKUP_CODE_LENGTH = 10;

// ─── Base32 helpers ───────────────────────────────────────────────────────────

function base32Encode(buf: Buffer): string {
  let result = "";
  let bits = 0;
  let value = 0;

  for (let i = 0; i < buf.length; i++) {
    value = (value << 8) | buf[i];
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      result += BASE32_ALPHABET[(value >> bits) & 0x1f];
    }
  }
  if (bits > 0) result += BASE32_ALPHABET[(value << (5 - bits)) & 0x1f];
  return result;
}

function base32Decode(str: string): Buffer {
  const clean = str.toUpperCase().replace(/=+$/, "").replace(/[^A-Z2-7]/g, "");
  let value = 0;
  let bits = 0;
  const output: number[] = [];

  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((value >> bits) & 0xff);
    }
  }
  return Buffer.from(output);
}

// ─── TOTP core ────────────────────────────────────────────────────────────────

function generateHotp(secretBase32: string, counter: number): string {
  const key = base32Decode(secretBase32);
  const counterBuf = Buffer.alloc(8);
  // Write counter as big-endian 64-bit
  counterBuf.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac(TOTP_ALGORITHM, key).update(counterBuf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  return String(code % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, "0");
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface MfaSecret {
  secret: string; // base32-encoded secret
}

/**
 * Generate a new random TOTP secret.
 */
export function generateMfaSecret(): MfaSecret {
  const secret = base32Encode(randomBytes(20));
  return { secret };
}

/**
 * Build an otpauth:// URI for QR-code provisioning.
 * Users scan this with Google Authenticator / Authy.
 */
export function generateTotpUri(secret: string, username: string, issuer = "ADRS"): string {
  const encoded = encodeURIComponent;
  return `otpauth://totp/${encoded(issuer)}:${encoded(username)}?secret=${secret}&issuer=${encoded(issuer)}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_PERIOD}`;
}

/**
 * Verify a 6-digit TOTP code against a base32 secret.
 * Allows ±TOTP_WINDOW windows for clock skew.
 */
export function verifyTotp(code: string, secretBase32: string): boolean {
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(Date.now() / 1000 / TOTP_PERIOD);
  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta++) {
    const expected = generateHotp(secretBase32, counter + delta);
    // Constant-time comparison
    try {
      if (timingSafeEqual(Buffer.from(code), Buffer.from(expected))) return true;
    } catch {
      // length mismatch — not equal
    }
  }
  return false;
}

/**
 * Generate an array of one-time backup codes.
 * Returns plaintext codes (show to user once) + their bcrypt hashes (store in DB).
 */
export async function generateBackupCodes(): Promise<{ plain: string[]; hashed: string[] }> {
  const plain: string[] = [];
  const hashed: string[] = [];
  for (let i = 0; i < BACKUP_CODE_COUNT; i++) {
    const code = randomBytes(Math.ceil(BACKUP_CODE_LENGTH / 2))
      .toString("hex")
      .slice(0, BACKUP_CODE_LENGTH)
      .toUpperCase();
    plain.push(code);
    hashed.push(await bcrypt.hash(code, 10));
  }
  return { plain, hashed };
}

/**
 * Attempt to consume a backup code.
 * Returns the index of the matched code (for removal), or -1 if none match.
 */
export async function consumeBackupCode(
  inputCode: string,
  hashedCodes: string[]
): Promise<number> {
  const normalized = inputCode.trim().toUpperCase().replace(/\s+/g, "");
  for (let i = 0; i < hashedCodes.length; i++) {
    const match = await bcrypt.compare(normalized, hashedCodes[i]);
    if (match) return i;
  }
  return -1;
}

/**
 * Check whether a role requires MFA enrollment.
 */
export function isMfaRequiredForRole(role: string): boolean {
  return MFA_REQUIRED_ROLES.has(role);
}
