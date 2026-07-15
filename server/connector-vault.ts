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
    // Default implementation uses an in-memory vault for development and test.
    // In production, inject a secure vault client via setVault().
    vaultInstance = new InMemoryVault();
  }
  return vaultInstance;
}

/**
 * Override vault for testing or specific deployments
 */
export function setVault(vault: IConnectorVault): void {
  vaultInstance = vault;
}
