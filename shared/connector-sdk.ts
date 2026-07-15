/**
 * Connector SDK: Core types, interfaces, and base classes for external system integration
 * 
 * This file defines the plugin interface that all connectors must implement,
 * enabling IntelliNexus to discover, monitor, and manage arbitrary external systems.
 */

// AbortSignal is a native global in Node.js 15+ and modern browsers

// ─────────────────────────────────────────────────────────────────────────────
// Error Hierarchy
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Base error class for all connector-related errors
 */
export class ConnectorError extends Error {
  constructor(
    message: string,
    public code: string,
    public isRetryable: boolean = false,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'ConnectorError';
  }
}

/**
 * Error thrown when credential validation fails
 */
export class CredentialError extends ConnectorError {
  constructor(message: string, originalError?: Error) {
    super(message, 'CREDENTIAL_ERROR', false, originalError);
    this.name = 'CredentialError';
  }
}

/**
 * Error thrown when connection fails
 */
export class ConnectionError extends ConnectorError {
  constructor(message: string, isRetryable = true, originalError?: Error) {
    super(message, 'CONNECTION_ERROR', isRetryable, originalError);
    this.name = 'ConnectionError';
  }
}

/**
 * Error thrown when operation times out
 */
export class TimeoutError extends ConnectorError {
  constructor(message: string, originalError?: Error) {
    super(message, 'TIMEOUT_ERROR', true, originalError);
    this.name = 'TimeoutError';
  }
}

/**
 * Error thrown when operation is not supported by this connector
 */
export class CapabilityError extends ConnectorError {
  constructor(message: string, originalError?: Error) {
    super(message, 'CAPABILITY_ERROR', false, originalError);
    this.name = 'CapabilityError';
  }
}

/**
 * Error thrown when rate limit is exceeded
 */
export class RateLimitError extends ConnectorError {
  constructor(
    message: string,
    public retryAfterSeconds: number = 60,
    originalError?: Error
  ) {
    super(message, 'RATE_LIMIT_ERROR', true, originalError);
    this.name = 'RateLimitError';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Logger Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface Logger {
  debug(message: string, metadata?: Record<string, any>): void;
  info(message: string, metadata?: Record<string, any>): void;
  warn(message: string, metadata?: Record<string, any>): void;
  error(message: string, error?: Error, metadata?: Record<string, any>): void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Metrics Collector Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface MetricsCollector {
  incrementCounter(name: string, value?: number, labels?: Record<string, string>): void;
  recordGauge(name: string, value: number, labels?: Record<string, string>): void;
  recordHistogram(name: string, value: number, labels?: Record<string, string>): void;
  startTimer(name: string, labels?: Record<string, string>): () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Connector Capability
// ─────────────────────────────────────────────────────────────────────────────

export interface ConnectorCapability {
  name: string;
  supported: boolean;
  description?: string;
  minimumConnectorVersion?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Configuration Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ConnectorConfig {
  /** Connector type identifier: "pg", "mysql", "salesforce_rest", etc. */
  type: string;
  
  /** Endpoint URL for REST-based connectors */
  endpointUrl?: string;
  
  /** Database name */
  database?: string;
  
  /** Hostname or IP */
  host?: string;
  
  /** Port number */
  port?: number;
  
  /** Reference to credentials in secrets vault (never store plaintext) */
  credentialVaultKey: string;
  
  /** Additional connector-specific config */
  [key: string]: any;
}

export interface Credentials {
  username?: string;
  password?: string;
  apiKey?: string;
  bearerToken?: string;
  oauth2Token?: string;
  oauth2RefreshToken?: string;
  [key: string]: any;
}

// ─────────────────────────────────────────────────────────────────────────────
// Execution Context
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Provides context and utilities for connector execution
 */
export interface ExecutionContext {
  /** Tenant ID for multi-tenant isolation */
  tenantId: string;
  
  /** Connector instance ID */
  connectorId: string;
  
  /** Unique execution ID for correlation */
  executionId: string;
  
  /** Signal for operation cancellation */
  cancellationToken: AbortSignal;
  
  /** Logger for this execution */
  logger: Logger;
  
  /** Metrics collector for monitoring */
  metrics: MetricsCollector;
}

// ─────────────────────────────────────────────────────────────────────────────
// Health Check
// ─────────────────────────────────────────────────────────────────────────────

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  lastCheck?: Date;
  metrics?: {
    latency?: number;
    uptime?: number;
    errorRate?: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Data Discovery
// ─────────────────────────────────────────────────────────────────────────────

export interface Schema {
  name: string;
  type: 'schema' | 'database' | 'container';
  description?: string;
  metadata?: Record<string, any>;
}

export interface Field {
  name: string;
  dataType: string;
  isNullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  description?: string;
  sampleValues?: any[];
  metadata?: Record<string, any>;
}

export interface DataAsset {
  id: string;
  name: string;
  type: 'table' | 'view' | 'file' | 'api_endpoint' | 'report' | 'dataset';
  qualifiedName: string; // Globally unique identifier within connector
  schema?: string;
  description?: string;
  owner?: string;
  recordCount?: number;
  fieldCount?: number;
  metadata?: Record<string, any>;
}

export interface Relationship {
  sourceAssetId: string;
  targetAssetId: string;
  relationshipType: 'foreign_key' | 'join' | 'reference' | 'lineage';
  metadata?: Record<string, any>;
}

export interface UserRole {
  name: string;
  permissions: string[];
  canAccess: (assetType: string) => boolean;
}

export interface ProcessingActivity {
  id: string;
  name: string;
  purpose: string;
  lawfulBasis: 'consent' | 'contract' | 'legal_obligation' | 'vital_interest' | 'public_task' | 'legitimate_interest';
  dataCategories: string[];
  metadata?: Record<string, any>;
}

export interface RetentionConfig {
  recordCategory: string;
  retentionDurationDays: number;
  dispositionAction: 'delete' | 'anonymise' | 'pseudonymise' | 'archive';
  metadata?: Record<string, any>;
}

export interface AuditEvent {
  id: string;
  timestamp: Date;
  action: string;
  actor?: string;
  resource: string;
  details?: Record<string, any>;
}

export interface SecurityEvent {
  id: string;
  timestamp: Date;
  eventType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  details?: Record<string, any>;
}

export interface DataTransfer {
  id: string;
  sourceSystem: string;
  targetSystem: string;
  dataCategories: string[];
  frequency: 'real_time' | 'daily' | 'weekly' | 'manual';
  timestamp: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Change Data Capture
// ─────────────────────────────────────────────────────────────────────────────

export interface SyncCheckpoint {
  cursor: string; // Connector-specific bookmark (timestamp, offset, token, etc.)
  lastSourceEventTime?: Date;
  lastIngestionTime: Date;
  schemaVersion?: string;
  metadata?: Record<string, any>;
}

export interface ChangeEvent {
  id: string;
  timestamp: Date;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  assetId: string;
  recordId: string | number;
  previousValues?: Record<string, any>;
  newValues: Record<string, any>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Remediation
// ─────────────────────────────────────────────────────────────────────────────

export interface DeletionCapability {
  name: string;
  description: string;
  scopeLevel: 'row' | 'field' | 'table' | 'schema';
  supportsConditional: boolean;
  supportsAuditing: boolean;
}

export interface RemediationAction {
  id: string;
  type: 'delete' | 'anonymise' | 'mask' | 'archive' | 'export';
  targetAsset: string;
  targetRecords?: string | number | (string | number)[]; // Row IDs or SQL WHERE clause
  targetFields?: string[];
  parameters?: Record<string, any>;
  approvalRequired: boolean;
}

export interface RemediationResult {
  actionId: string;
  success: boolean;
  recordsAffected: number;
  timestamp: Date;
  details?: Record<string, any>;
  error?: Error;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sample Data
// ─────────────────────────────────────────────────────────────────────────────

export interface DataSample {
  records: Record<string, any>[];
  totalAvailable: number;
  samplingMethod: 'random' | 'sequential' | 'filtered';
  appliedFilters?: Record<string, any>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Core Connector Plugin Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Main interface that all connector implementations must satisfy
 */
export interface ConnectorPlugin {
  // ─────────────────────────────────────────────────────────────────────────
  // Metadata
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Get connector identifier: "pg", "mysql", "salesforce_rest", etc.
   */
  getId(): string;
  
  /**
   * Get human-readable connector name
   */
  getName(): string;
  
  /**
   * Get semantic version
   */
  getVersion(): string;
  
  /**
   * List all capabilities supported by this connector
   */
  capabilities(): ConnectorCapability[];
  
  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Test connection with provided credentials
   * @throws CredentialError, ConnectionError
   */
  testConnection(config: ConnectorConfig): Promise<{ success: boolean; error?: string }>;
  
  /**
   * Authenticate using provided credentials
   * @throws CredentialError
   */
  authenticate(credentials: Credentials): Promise<void>;
  
  /**
   * Refresh OAuth2 or other time-limited credentials
   */
  refreshCredentials(currentCredentials: Credentials): Promise<Credentials>;
  
  /**
   * Check connector health and connectivity
   */
  healthCheck(context: ExecutionContext): Promise<HealthStatus>;
  
  /**
   * Clean up resources and disconnect
   */
  disconnect(): Promise<void>;
  
  // ─────────────────────────────────────────────────────────────────────────
  // Discovery: Schemas and Assets
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Discover available schemas or containers
   */
  discoverSchemas(context: ExecutionContext): AsyncIterator<Schema>;
  
  /**
   * Discover data assets (tables, views, files, etc.)
   */
  discoverAssets(context: ExecutionContext, schema?: Schema): AsyncIterator<DataAsset>;
  
  /**
   * Discover fields within an asset
   */
  discoverFields(context: ExecutionContext, asset: DataAsset): AsyncIterator<Field>;
  
  /**
   * Discover relationships between assets
   */
  discoverRelationships(context: ExecutionContext): AsyncIterator<Relationship>;
  
  /**
   * Discover users and their roles
   */
  discoverUsersAndRoles(context: ExecutionContext): AsyncIterator<UserRole>;
  
  // ─────────────────────────────────────────────────────────────────────────
  // Discovery: Compliance Metadata
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Discover processing activities and data purposes
   */
  discoverProcessingActivities(context: ExecutionContext): AsyncIterator<ProcessingActivity>;
  
  /**
   * Discover retention configurations
   */
  discoverRetentionConfigurations(context: ExecutionContext): AsyncIterator<RetentionConfig>;
  
  /**
   * Discover audit events from source system
   */
  discoverAuditEvents(context: ExecutionContext, since: Date): AsyncIterator<AuditEvent>;
  
  /**
   * Discover security events (access attempts, anomalies, etc.)
   */
  discoverSecurityEvents(context: ExecutionContext, since: Date): AsyncIterator<SecurityEvent>;
  
  /**
   * Discover data transfers to external systems
   */
  discoverDataTransfers(context: ExecutionContext): AsyncIterator<DataTransfer>;
  
  // ─────────────────────────────────────────────────────────────────────────
  // Data Access
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Read full metadata for an asset
   */
  readMetadata(context: ExecutionContext, asset: DataAsset): Promise<Record<string, any>>;
  
  /**
   * Sample approved data from an asset (respecting scope and masking by default)
   */
  sampleApprovedData(context: ExecutionContext, asset: DataAsset, limit: number): Promise<DataSample>;
  
  /**
   * Read incremental changes since checkpoint
   */
  readChanges(context: ExecutionContext, checkpoint: SyncCheckpoint): AsyncIterator<ChangeEvent>;
  
  // ─────────────────────────────────────────────────────────────────────────
  // Remediation
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Get available deletion/remediation capabilities
   */
  discoverDeletionCapabilities(context: ExecutionContext): Promise<DeletionCapability[]>;
  
  /**
   * Execute an approved remediation action (deletion, anonymisation, etc.)
   */
  executeApprovedRemediation(context: ExecutionContext, action: RemediationAction): Promise<RemediationResult>;
  
  /**
   * Verify that remediation was successful in source system
   */
  verifyRemediation(context: ExecutionContext, action: RemediationAction): Promise<boolean>;
  
  // ─────────────────────────────────────────────────────────────────────────
  // Checkpointing
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Get current sync checkpoint (for resuming incremental sync)
   */
  getCheckpoint(context: ExecutionContext): Promise<SyncCheckpoint>;
  
  /**
   * Save sync checkpoint after successful processing
   */
  saveCheckpoint(context: ExecutionContext, checkpoint: SyncCheckpoint): Promise<void>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Type Guards and Utility Functions
// ─────────────────────────────────────────────────────────────────────────────

export function isConnectorError(error: unknown): error is ConnectorError {
  return error instanceof ConnectorError;
}

export function isRetryable(error: unknown): boolean {
  if (isConnectorError(error)) {
    return error.isRetryable;
  }
  return false;
}

export function createTestConnectionResult(success: boolean, error?: string) {
  return { success, error };
}
