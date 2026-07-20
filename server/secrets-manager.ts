/**
 * secrets-manager.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Thin abstraction layer for secret retrieval.
 *
 * TODAY: reads from process.env (environment variables / .env file).
 * FUTURE: swap getSecret() to call AWS SSM, HashiCorp Vault, or Azure Key Vault
 *         by changing only this file — no call-sites need updating.
 *
 * In production, the following known-insecure values are rejected:
 *   - "dev-secret-change-me"
 *   - "production-secret-override-this"
 *   - "change-me"
 *   - Passwords containing "postgres:postgres" in DB URLs
 *   - Empty strings
 */

// ─── Known-weak placeholder values ───────────────────────────────────────────

const KNOWN_WEAK_VALUES = new Set([
  "dev-secret-change-me",
  "production-secret-override-this",
  "change-me",
  "secret",
  "password",
  "12345678",
  "qwerty",
  "admin",
  "ci-session-secret",
  "sk-placeholder",
]);

function containsWeakDbCredentials(value: string): boolean {
  // Detect default postgres:postgres in connection strings
  try {
    const u = new URL(value);
    return u.username === "postgres" && u.password === "postgres";
  } catch {
    return false;
  }
}

function isWeakSecret(key: string, value: string): boolean {
  if (!value || value.trim() === "") return true;
  if (KNOWN_WEAK_VALUES.has(value.trim())) return true;
  // Check DB URL keys for weak default credentials
  if (key.includes("DATABASE_URL") && containsWeakDbCredentials(value)) return true;
  return false;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Retrieve a secret value.
 *
 * Returns the value from process.env[key].
 * Returns undefined if the key is not set.
 *
 * NOTE: Replace the body of this function to integrate with a secrets manager.
 * The interface (key → string | undefined) must remain unchanged.
 */
export function getSecret(key: string): string | undefined {
  return process.env[key];
}

/**
 * Retrieve a required secret value.
 *
 * @throws Error if the secret is missing.
 * @throws Error in production if the value matches a known-weak placeholder.
 */
export function requireSecret(key: string): string {
  const value = getSecret(key);

  if (value === undefined || value.trim() === "") {
    throw new Error(
      `[SecretsManager] Required secret "${key}" is not set. ` +
      `Configure it in your environment or secrets manager before starting the application.`
    );
  }

  if (process.env.NODE_ENV === "production" && isWeakSecret(key, value)) {
    throw new Error(
      `[SecretsManager] Secret "${key}" is set to a known-insecure placeholder value. ` +
      `This is not permitted in production. Set a strong, unique value before deploying.`
    );
  }

  return value;
}

/**
 * Validate all mandatory secrets at startup.
 * Call this early in your server bootstrap (before routes are registered).
 *
 * @throws Error with a combined list of all violations.
 */
export function validateProductionSecrets(): void {
  if (process.env.NODE_ENV !== "production") return;

  const required = [
    "DATABASE_URL",
    "SESSION_SECRET",
    "DEFAULT_TENANT",
  ];

  const errors: string[] = [];

  for (const key of required) {
    try {
      requireSecret(key);
    } catch (err: any) {
      errors.push(err.message);
    }
  }

  if (errors.length > 0) {
    throw new Error(
      `[SecretsManager] Production secret validation failed:\n` +
      errors.map(e => `  • ${e}`).join("\n")
    );
  }
}

/**
 * Safely redact a secret value for log output.
 * Shows only the first 4 characters followed by asterisks.
 */
export function redactSecret(value: string | undefined): string {
  if (!value || value.length <= 4) return "****";
  return value.slice(0, 4) + "*".repeat(Math.min(value.length - 4, 12));
}
