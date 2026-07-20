/**
 * Connector Vault: Secure credential storage and retrieval
 * 
 * Abstracts credential storage to enable swapping implementations:
 * - Development: In-memory storage
 * - Production: HashiCorp Vault, AWS Secrets Manager, Azure Key Vault
 * 
 * NEVER log credentials; always use descriptors like [credential_***_redacted]
 */

export interface VaultCredential {
  /**
   * Unique credential identifier
   */
  id: string;

  /**
   * Type of credential (OAUTH2, BEARER, API_KEY, BASIC_AUTH, etc.)
   */
  type: "OAUTH2" | "BEARER" | "API_KEY" | "BASIC_AUTH" | "CUSTOM";

  /**
   * Secrets (varies by type):
   * - OAUTH2: { clientId, clientSecret, refreshToken, accessToken, expiresAt }
   * - BEARER: { token }
   * - API_KEY: { key }
   * - BASIC_AUTH: { username, password }
   */
  secrets: Record<string, string | number | boolean>;

  /**
   * When credential was created
   */
  createdAt: Date;

  /**
   * When credential was last rotated/updated
   */
  updatedAt: Date;

  /**
   * When credential expires (if applicable)
   */
  expiresAt?: Date;

  /**
   * Whether credential is still valid
   */
  isActive: boolean;

  /**
   * Metadata (tags, labels, etc.)
   */
  metadata?: Record<string, string>;
}

/**
 * Interface for credential vault implementations
 */
export interface IConnectorVault {
  /**
   * Store a new credential
   */
  storeCredential(
    tenantId: string,
    connectorInstanceId: string,
    credential: VaultCredential
  ): Promise<void>;

  /**
   * Retrieve a stored credential
   */
  getCredential(
    tenantId: string,
    connectorInstanceId: string
  ): Promise<VaultCredential | null>;

  /**
   * Rotate a credential (store new version, retire old)
   */
  rotateCredential(
    tenantId: string,
    connectorInstanceId: string,
    newCredential: VaultCredential
  ): Promise<void>;

  /**
   * Revoke a credential (mark inactive, prevent retrieval)
   */
  revokeCredential(
    tenantId: string,
    connectorInstanceId: string
  ): Promise<void>;

  /**
   * Check if credential exists and is active
   */
  hasActiveCredential(
    tenantId: string,
    connectorInstanceId: string
  ): Promise<boolean>;

  /**
   * Delete a credential (use with caution; data recovery may not be possible)
   */
  deleteCredential(
    tenantId: string,
    connectorInstanceId: string
  ): Promise<void>;
}

/**
 * In-memory vault for development (NOT for production)
 * 
 * Store credentials in memory keyed by [tenantId:connectorInstanceId]
 */
export class InMemoryVault implements IConnectorVault {
  private credentials = new Map<string, VaultCredential>();

  private getKey(tenantId: string, connectorInstanceId: string): string {
    return `${tenantId}:${connectorInstanceId}`;
  }

  async storeCredential(
    tenantId: string,
    connectorInstanceId: string,
    credential: VaultCredential
  ): Promise<void> {
    const key = this.getKey(tenantId, connectorInstanceId);
    this.credentials.set(key, {
      ...credential,
      createdAt: credential.createdAt || new Date(),
      updatedAt: new Date(),
      isActive: true,
    });
  }

  async getCredential(
    tenantId: string,
    connectorInstanceId: string
  ): Promise<VaultCredential | null> {
    const key = this.getKey(tenantId, connectorInstanceId);
    const cred = this.credentials.get(key);
    return cred && cred.isActive ? cred : null;
  }

  async rotateCredential(
    tenantId: string,
    connectorInstanceId: string,
    newCredential: VaultCredential
  ): Promise<void> {
    const key = this.getKey(tenantId, connectorInstanceId);
    // Mark old as inactive
    const old = this.credentials.get(key);
    if (old) {
      old.isActive = false;
    }
    // Store new with rotation metadata
    this.credentials.set(key, {
      ...newCredential,
      createdAt: newCredential.createdAt || new Date(),
      updatedAt: new Date(),
      isActive: true,
      metadata: {
        ...newCredential.metadata,
        rotatedFrom: old?.id || "initial",
        rotatedAt: new Date().toISOString(),
      },
    });
  }

  async revokeCredential(
    tenantId: string,
    connectorInstanceId: string
  ): Promise<void> {
    const key = this.getKey(tenantId, connectorInstanceId);
    const cred = this.credentials.get(key);
    if (cred) {
      cred.isActive = false;
    }
  }

  async hasActiveCredential(
    tenantId: string,
    connectorInstanceId: string
  ): Promise<boolean> {
    const key = this.getKey(tenantId, connectorInstanceId);
    const cred = this.credentials.get(key);
    return cred?.isActive || false;
  }

  async deleteCredential(
    tenantId: string,
    connectorInstanceId: string
  ): Promise<void> {
    const key = this.getKey(tenantId, connectorInstanceId);
    this.credentials.delete(key);
  }
}

/**
 * Global vault instance (singleton)
 * 
 * In production, replace with vault client initialization
 */
let vaultInstance: IConnectorVault | null = null;

export function getVault(): IConnectorVault {
  if (!vaultInstance) {
    // If HashiCorp Vault is configured, use it as the backing implementation.
    const addr = process.env.VAULT_ADDR?.trim();
    const token = process.env.VAULT_TOKEN?.trim();
    const kvMount = process.env.VAULT_KV_MOUNT || "secret";

    if (addr) {
      if (!token && process.env.NODE_ENV === "production") {
        throw new Error("VAULT_TOKEN is required when VAULT_ADDR is set in production");
      }
      try {
        vaultInstance = new HashiCorpVault(addr, token || "", kvMount);
        console.log("[VAULT] Using HashiCorp Vault for credential storage");
      } catch (err) {
        console.error("[VAULT] Failed to initialize HashiCorp Vault client, falling back to in-memory vault:", err);
        vaultInstance = new InMemoryVault();
      }
    } else {
      // Default implementation uses an in-memory vault for development and test.
      vaultInstance = new InMemoryVault();
    }
  }
  return vaultInstance;
}

/**
 * Override vault for testing or specific deployments
 */
export function setVault(vault: IConnectorVault): void {
  vaultInstance = vault;
}

/**
 * Minimal HashiCorp Vault KV v2 client implementation.
 * Uses the Vault HTTP API and the global `fetch` available in Node 18+.
 * This keeps the dependency surface small and avoids forcing external SDKs.
 */
class HashiCorpVault implements IConnectorVault {
  private addr: string;
  private token: string;
  private kvMount: string;

  constructor(addr: string, token: string, kvMount = "secret") {
    this.addr = addr.replace(/\/$/, "");
    this.token = token;
    this.kvMount = kvMount.replace(/^\//, "").replace(/\/$/, "");
  }

  private async req(path: string, opts: any = {}) {
    const url = `${this.addr}/v1/${path.replace(/^\//, "")}`;
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) headers["X-Vault-Token"] = this.token;
    const res = await fetch(url, { headers, ...opts });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Vault API ${res.status} ${res.statusText}: ${txt}`);
    }
    return res.json().catch(() => ({}));
  }

  private keyPath(tenantId: string, connectorInstanceId: string) {
    const safeTenant = encodeURIComponent(tenantId);
    const safeInstance = encodeURIComponent(connectorInstanceId);
    return `${this.kvMount}/data/adrs/${safeTenant}/${safeInstance}`;
  }

  async storeCredential(tenantId: string, connectorInstanceId: string, credential: VaultCredential): Promise<void> {
    const path = this.keyPath(tenantId, connectorInstanceId);
    const payload = { data: { credential } };
    await this.req(path, { method: "POST", body: JSON.stringify(payload) });
  }

  async getCredential(tenantId: string, connectorInstanceId: string): Promise<VaultCredential | null> {
    const path = this.keyPath(tenantId, connectorInstanceId);
    try {
      const body = await this.req(path, { method: "GET" });
      // KV v2 returns { data: { data: {...}, metadata: {...} } }
      const data = body?.data?.data?.credential as VaultCredential | undefined;
      return data && data.isActive !== false ? data : null;
    } catch (err) {
      if ((err as any).message?.includes("404")) return null;
      throw err;
    }
  }

  async rotateCredential(tenantId: string, connectorInstanceId: string, newCredential: VaultCredential): Promise<void> {
    // Store new credential and mark rotatedFrom in metadata
    const prev = await this.getCredential(tenantId, connectorInstanceId).catch(() => null);
    if (prev) {
      // Optionally mark previous credential inactive by writing a copy with isActive=false
      const prevPath = this.keyPath(tenantId, `${connectorInstanceId}_history_${Date.now()}`);
      await this.req(prevPath, { method: "POST", body: JSON.stringify({ data: { credential: { ...prev, isActive: false } } }) });
    }
    const payload = { data: { credential: { ...newCredential, metadata: { ...(newCredential.metadata || {}), rotatedFrom: prev?.id || null } } } };
    const path = this.keyPath(tenantId, connectorInstanceId);
    await this.req(path, { method: "POST", body: JSON.stringify(payload) });
  }

  async revokeCredential(tenantId: string, connectorInstanceId: string): Promise<void> {
    const cred = await this.getCredential(tenantId, connectorInstanceId);
    if (!cred) return;
    cred.isActive = false;
    const path = this.keyPath(tenantId, connectorInstanceId);
    await this.req(path, { method: "POST", body: JSON.stringify({ data: { credential: cred } }) });
  }

  async hasActiveCredential(tenantId: string, connectorInstanceId: string): Promise<boolean> {
    const cred = await this.getCredential(tenantId, connectorInstanceId);
    return !!cred;
  }

  async deleteCredential(tenantId: string, connectorInstanceId: string): Promise<void> {
    // KV v2 delete (metadata) endpoint
    const metaPath = `${this.kvMount}/metadata/adrs/${encodeURIComponent(tenantId)}/${encodeURIComponent(connectorInstanceId)}`;
    await this.req(metaPath, { method: "DELETE" });
  }
}
