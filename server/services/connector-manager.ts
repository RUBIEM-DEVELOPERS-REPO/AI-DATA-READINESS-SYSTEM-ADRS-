/**
 * Connector Manager: Lifecycle management for external system connectors
 * 
 * Responsibilities:
 * - Register connectors (validate, store configuration, test connection)
 * - Authenticate connectors (credentials, token refresh)
 * - Manage connector state (REGISTERED → TESTING → CONNECTED/DEGRADED/PAUSED/REVOKED)
 * - Monitor connector health (run periodic checks)
 * - Coordinate sync operations (discovery, change-data-capture, remediation)
 * - Handle retries with exponential backoff
 * - Emit events for external listeners (UI, audit, notification)
 * 
 * Patterns:
 * - Plugin architecture: All connectors implement ConnectorPlugin interface
 * - Multi-tenant: All operations scoped to tenantId
 * - Event-driven: Emits events for state changes
 * - Async-first: All operations are async
 */

import { EventEmitter } from "events";
import { db } from "../db";
import { connectorInstances, connectorDefinitions, externalSystems, auditEvents, dataAssets, dataFields } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { getVault, VaultCredential } from "../connector-vault";
import { ConnectorConfig, ConnectorPlugin, Credentials, ExecutionContext, TimeoutError, isRetryable } from "@shared/connector-sdk";
import { ConnectorRegistry } from "./connector-registry";

// ─── Type Definitions ─────────────────────────────────────────────────────────

export interface ConnectorRegistration {
  connectorDefinitionId: string;
  externalSystemId: string;
  config: Record<string, any>;
  credential: VaultCredential;
  metadata?: Record<string, string>;
}

export interface RetryPolicy {
  maxAttempts: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export interface SyncOptions {
  full?: boolean;
  force?: boolean;
  timeout?: number;
}

// ─── Events ───────────────────────────────────────────────────────────────────

export type ConnectorEventType =
  | "connector.registered"
  | "connector.testing"
  | "connector.connected"
  | "connector.degraded"
  | "connector.paused"
  | "connector.revoked"
  | "connector.failed"
  | "connector.health_check"
  | "sync.started"
  | "sync.progress"
  | "sync.completed"
  | "sync.failed"
  | "credential.rotated"
  | "credential.expired";

export interface ConnectorEvent {
  type: ConnectorEventType;
  tenantId: string;
  connectorInstanceId: string;
  timestamp: Date;
  actor?: string; // User ID who triggered this
  payload?: Record<string, any>;
  error?: string;
}

// ─── Connector Manager ────────────────────────────────────────────────────────

export class ConnectorManager extends EventEmitter {
  private connectorInstances = new Map<string, ConnectorPlugin>();
  private retryPolicy: RetryPolicy = {
    maxAttempts: 5,
    initialDelayMs: 1000,
    maxDelayMs: 60000,
    backoffMultiplier: 2,
  };

  private connectorRegistry = new ConnectorRegistry();
  private vault = getVault();

  getSupportedConnectorDefinitions() {
    return this.connectorRegistry.getAllDefinitions();
  }

  /**
   * Register a new connector instance
   */
  async registerConnector(
    tenantId: string,
    registration: ConnectorRegistration,
    actorId?: string
  ): Promise<string> {
    try {
      // Validate connector definition exists
      const definitions = await db
        .select()
        .from(connectorDefinitions)
        .where(eq(connectorDefinitions.id, registration.connectorDefinitionId));

      if (!definitions.length) {
        throw new Error(`Connector definition not found: ${registration.connectorDefinitionId}`);
      }

      // Validate external system exists
      const systems = await db
        .select()
        .from(externalSystems)
        .where(
          and(
            eq(externalSystems.id, registration.externalSystemId),
            eq(externalSystems.tenantId, tenantId)
          )
        );

      if (!systems.length) {
        throw new Error(`External system not found: ${registration.externalSystemId}`);
      }

      // Generate instance ID
      const instanceId = `conn_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      // Store credential in vault
      await this.vault.storeCredential(tenantId, instanceId, registration.credential);

      // Persist connector instance
      await db.insert(connectorInstances).values({
        id: instanceId,
        tenantId,
        externalSystemId: registration.externalSystemId,
        connectorDefinitionId: registration.connectorDefinitionId,
        name: registration.metadata?.name || `Connector ${instanceId}`,
        config: registration.config,
        credentialVaultKey: instanceId,
        syncMode: "MANUAL",
        scanSchedule: null,
        scopeApproved: {},
        createdBy: actorId || "system",
        updatedAt: new Date(),
        createdAt: new Date(),
      });

      // Emit registration event
      this.emit("connector.registered", {
        type: "connector.registered" as const,
        tenantId,
        connectorInstanceId: instanceId,
        timestamp: new Date(),
        actor: actorId,
        payload: {
          definitionId: registration.connectorDefinitionId,
          systemId: registration.externalSystemId,
        },
      } as ConnectorEvent);

      // Audit registration
      await this.auditLog(tenantId, "CONNECTOR_REGISTERED", instanceId, "success", actorId);

      return instanceId;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emit("connector.failed", {
        type: "connector.failed" as const,
        tenantId,
        connectorInstanceId: "",
        timestamp: new Date(),
        actor: actorId,
        error: errorMsg,
      } as ConnectorEvent);
      throw error;
    }
  }

  /**
   * Test connection to a connector
   */
  async testConnection(
    tenantId: string,
    connectorInstanceId: string,
    actorId?: string
  ): Promise<boolean> {
    try {
      this.emit("connector.testing", {
        type: "connector.testing" as const,
        tenantId,
        connectorInstanceId,
        timestamp: new Date(),
        actor: actorId,
      } as ConnectorEvent);

      // Get connector instance
      const instances = await db
        .select()
        .from(connectorInstances)
        .where(
          and(
            eq(connectorInstances.id, connectorInstanceId),
            eq(connectorInstances.tenantId, tenantId)
          )
        );

      if (!instances.length) {
        throw new Error(`Connector instance not found: ${connectorInstanceId}`);
      }

      // Load plugin (create or retrieve from cache)
      const plugin = await this.loadPlugin(tenantId, instances[0]);

      // Test connection with retry
      const result = await this.executeWithRetry(() => plugin.testConnection(instances[0].config as unknown as ConnectorConfig));

      const status = result.success ? "connected" : "degraded";
      this.emit(`connector.${status}`, {
        type: `connector.${status}` as ConnectorEventType,
        tenantId,
        connectorInstanceId,
        timestamp: new Date(),
        actor: actorId,
        payload: result,
      } as ConnectorEvent);

      await this.auditLog(
        tenantId,
        "CONNECTION_TEST",
        connectorInstanceId,
        result.success ? "success" : "degraded",
        actorId
      );

      return result.success;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      this.emit("connector.failed", {
        type: "connector.failed" as const,
        tenantId,
        connectorInstanceId,
        timestamp: new Date(),
        actor: actorId,
        error: errorMsg,
      } as ConnectorEvent);

      await this.auditLog(
        tenantId,
        "CONNECTION_TEST",
        connectorInstanceId,
        "failure",
        actorId,
        errorMsg
      );

      throw error;
    }
  }

  /**
   * Pause a connector (stop sync operations, maintain configuration)
   */
  async pauseConnector(
    tenantId: string,
    connectorInstanceId: string,
    actorId?: string
  ): Promise<void> {
    await db
      .update(connectorInstances)
      .set({ status: "PAUSED" })
      .where(
        and(
          eq(connectorInstances.id, connectorInstanceId),
          eq(connectorInstances.tenantId, tenantId)
        )
      );

    this.emit("connector.paused", {
      type: "connector.paused" as const,
      tenantId,
      connectorInstanceId,
      timestamp: new Date(),
      actor: actorId,
    } as ConnectorEvent);

    await this.auditLog(tenantId, "CONNECTOR_PAUSED", connectorInstanceId, "success", actorId);
  }

  /**
   * Resume a paused connector
   */
  async resumeConnector(
    tenantId: string,
    connectorInstanceId: string,
    actorId?: string
  ): Promise<void> {
    await db
      .update(connectorInstances)
      .set({ status: "CONNECTED" })
      .where(
        and(
          eq(connectorInstances.id, connectorInstanceId),
          eq(connectorInstances.tenantId, tenantId)
        )
      );

    this.emit("connector.connected", {
      type: "connector.connected" as const,
      tenantId,
      connectorInstanceId,
      timestamp: new Date(),
      actor: actorId,
    } as ConnectorEvent);

    await this.auditLog(tenantId, "CONNECTOR_RESUMED", connectorInstanceId, "success", actorId);
  }

  /**
   * Revoke a connector (disable permanently)
   */
  async revokeConnector(
    tenantId: string,
    connectorInstanceId: string,
    actorId?: string
  ): Promise<void> {
    // Revoke credentials in vault
    await this.vault.revokeCredential(tenantId, connectorInstanceId);

    await db
      .update(connectorInstances)
      .set({ status: "REVOKED" })
      .where(
        and(
          eq(connectorInstances.id, connectorInstanceId),
          eq(connectorInstances.tenantId, tenantId)
        )
      );

    // Remove from instance cache
    this.connectorInstances.delete(`${tenantId}:${connectorInstanceId}`);

    this.emit("connector.revoked", {
      type: "connector.revoked" as const,
      tenantId,
      connectorInstanceId,
      timestamp: new Date(),
      actor: actorId,
    } as ConnectorEvent);

    await this.auditLog(tenantId, "CONNECTOR_REVOKED", connectorInstanceId, "success", actorId);
  }

  /**
   * Rotate connector credentials
   */
  async rotateCredentials(
    tenantId: string,
    connectorInstanceId: string,
    newCredential: VaultCredential,
    actorId?: string
  ): Promise<void> {
    await this.vault.rotateCredential(tenantId, connectorInstanceId, newCredential);

    // Invalidate cached plugin instance so new credentials are loaded
    this.connectorInstances.delete(`${tenantId}:${connectorInstanceId}`);

    this.emit("credential.rotated", {
      type: "credential.rotated" as const,
      tenantId,
      connectorInstanceId,
      timestamp: new Date(),
      actor: actorId,
    } as ConnectorEvent);

    await this.auditLog(
      tenantId,
      "CREDENTIAL_ROTATED",
      connectorInstanceId,
      "success",
      actorId
    );
  }

  /**
   * Execute a sync operation (discovery, change-data-capture, etc.)
   */
  async executeSync(
    tenantId: string,
    connectorInstanceId: string,
    operation: "discover" | "sync" | "remediate",
    options?: SyncOptions,
    actorId?: string
  ): Promise<string> {
    try {
      const jobId = `sync_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

      this.emit("sync.started", {
        type: "sync.started" as const,
        tenantId,
        connectorInstanceId,
        timestamp: new Date(),
        actor: actorId,
        payload: { jobId, operation },
      } as ConnectorEvent);

      // Get connector instance
      const instances = await db
        .select()
        .from(connectorInstances)
        .where(
          and(
            eq(connectorInstances.id, connectorInstanceId),
            eq(connectorInstances.tenantId, tenantId)
          )
        );

      if (!instances.length) {
        throw new Error(`Connector instance not found: ${connectorInstanceId}`);
      }

      const instance = instances[0];

      // Load plugin and execute sync
      const plugin = await this.loadPlugin(tenantId, instance);

      // Execute with retry and timeout
      const timeout = options?.timeout || 3600000; // 1 hour default
      const result = await Promise.race([
        this.executeWithRetry(async () => {
          switch (operation) {
            case "discover":
              return await this.executeDiscovery(plugin, jobId, tenantId, instance.id);
            case "sync":
              return await this.executeDataSync(plugin, jobId, tenantId, instance.id, options?.full);
            case "remediate":
              return await this.executeRemediation(plugin, jobId, tenantId, instance.id);
            default:
              throw new Error(`Unknown operation: ${operation}`);
          }
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new TimeoutError("Sync operation timed out")), timeout)
        ),
      ]);

      this.emit("sync.completed", {
        type: "sync.completed" as const,
        tenantId,
        connectorInstanceId,
        timestamp: new Date(),
        actor: actorId,
        payload: { jobId, result },
      } as ConnectorEvent);

      await this.auditLog(tenantId, `SYNC_${operation.toUpperCase()}`, jobId, "success", actorId);

      return jobId;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);

      this.emit("sync.failed", {
        type: "sync.failed" as const,
        tenantId,
        connectorInstanceId,
        timestamp: new Date(),
        actor: actorId,
        error: errorMsg,
      } as ConnectorEvent);

      throw error;
    }
  }

  /**
   * Run health check on a connector
   */
  async healthCheck(
    tenantId: string,
    connectorInstanceId: string
  ): Promise<{ healthy: boolean; latency: number; message?: string }> {
    try {
      const instances = await db
        .select()
        .from(connectorInstances)
        .where(
          and(
            eq(connectorInstances.id, connectorInstanceId),
            eq(connectorInstances.tenantId, tenantId)
          )
        );

      if (!instances.length) {
        return {
          healthy: false,
          latency: -1,
          message: `Connector instance not found: ${connectorInstanceId}`,
        };
      }

      const plugin = await this.loadPlugin(tenantId, instances[0]);
      const context = {
        tenantId,
        connectorId: connectorInstanceId,
        executionId: `health_${Date.now()}`,
        cancellationToken: AbortSignal.timeout(30000),
        logger: console,
        metrics: {
          incrementCounter: () => {},
          recordGauge: () => {},
          recordHistogram: () => {},
          startTimer: () => () => {},
        },
      } as any;

      const startTime = Date.now();
      const health = await plugin.healthCheck(context);
      const latency = Date.now() - startTime;

      this.emit("connector.health_check", {
        type: "connector.health_check" as const,
        tenantId,
        connectorInstanceId,
        timestamp: new Date(),
        payload: { health, latency },
      } as ConnectorEvent);

      return {
        healthy: health.status === "healthy",
        latency,
        message: health.message,
      };
    } catch (error) {
      return {
        healthy: false,
        latency: -1,
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────────

  private async loadPlugin(
    tenantId: string,
    instance: (typeof connectorInstances.$inferSelect)
  ): Promise<ConnectorPlugin> {
    const cacheKey = `${tenantId}:${instance.id}`;

    if (this.connectorInstances.has(cacheKey)) {
      return this.connectorInstances.get(cacheKey)!;
    }

    const definitions = await db
      .select()
      .from(connectorDefinitions)
      .where(eq(connectorDefinitions.id, instance.connectorDefinitionId));

    if (!definitions.length) {
      throw new Error(`Connector definition not found: ${instance.connectorDefinitionId}`);
    }

    const definition = definitions[0];
    const credential = await this.vault.getCredential(tenantId, instance.id);
    if (!credential) {
      throw new Error(`Credentials not found for connector instance: ${instance.id}`);
    }

    const credentials: Credentials = credential.secrets as Credentials;

    let plugin: ConnectorPlugin;
    plugin = this.connectorRegistry.createConnector(definition.connectorType, instance.config, credentials, console);

    await plugin.authenticate(credentials);
    this.connectorInstances.set(cacheKey, plugin);
    return plugin;
  }

  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    attempt: number = 1
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (
        attempt >= this.retryPolicy.maxAttempts ||
        !isRetryable(error)
      ) {
        throw error;
      }

      const delay = Math.min(
        this.retryPolicy.initialDelayMs *
          Math.pow(this.retryPolicy.backoffMultiplier, attempt - 1),
        this.retryPolicy.maxDelayMs
      );

      await new Promise(resolve => setTimeout(resolve, delay));
      return this.executeWithRetry(fn, attempt + 1);
    }
  }

  private createExecutionContext(tenantId: string, connectorId: string): ExecutionContext {
    return {
      tenantId,
      connectorId,
      executionId: `exec_${connectorId}_${Date.now()}`,
      cancellationToken: AbortSignal.timeout(30000),
      logger: console,
      metrics: {
        incrementCounter: () => {},
        recordGauge: () => {},
        recordHistogram: () => {},
        startTimer: () => () => {},
      },
    } as ExecutionContext;
  }

  private async executeDiscovery(
    plugin: ConnectorPlugin,
    jobId: string,
    tenantId: string,
    connectorInstanceId: string
  ): Promise<{ discovered: number; processed: number; skipped: number }> {
    const context = this.createExecutionContext(tenantId, jobId);
    let discovered = 0;
    let processed = 0;
    let skipped = 0;

    const schemaIterator = plugin.discoverSchemas(context);
    let schemaResult = await schemaIterator.next();
    while (!schemaResult.done) {
      const schema = schemaResult.value;
      discovered += 1;

        const assetIterator = plugin.discoverAssets(context, schema);
        let assetResult = await assetIterator.next();
        while (!assetResult.done) {
          const asset = assetResult.value;
          processed += 1;

          this.emit("sync.progress", {
            type: "sync.progress" as const,
            tenantId,
            connectorInstanceId: jobId,
            timestamp: new Date(),
            payload: { phase: "discover", schema: schema.name, asset: asset.id },
          } as ConnectorEvent);

          // Upsert data asset
          try {
            const [existing] = await db
              .select()
              .from(dataAssets)
              .where(and(eq(dataAssets.tenantId, tenantId), eq(dataAssets.qualifiedName, asset.qualifiedName)));

            let assetId: string;
            if (existing) {
              assetId = existing.id;
              await db.update(dataAssets).set({
                name: asset.name,
                assetType: asset.type,
                description: asset.description || null,
                owner: asset.owner || null,
                recordCount: asset.recordCount ?? null,
                fieldCount: asset.fieldCount ?? null,
                containsPersonalData: asset.metadata?.containsPersonalData ?? false,
                containsSensitiveData: asset.metadata?.containsSensitiveData ?? false,
                dataCategory: asset.metadata?.dataCategory ?? null,
                lastDiscovered: new Date(),
                updatedAt: new Date(),
              }).where(eq(dataAssets.id, assetId));
            } else {
              const inserted = await db.insert(dataAssets).values({
                tenantId,
                connectorInstanceId,
                assetType: asset.type,
                name: asset.name,
                qualifiedName: asset.qualifiedName,
                owner: asset.owner || null,
                description: asset.description || null,
                recordCount: asset.recordCount ?? null,
                fieldCount: asset.fieldCount ?? null,
                containsPersonalData: asset.metadata?.containsPersonalData ?? false,
                containsSensitiveData: asset.metadata?.containsSensitiveData ?? false,
                dataCategory: asset.metadata?.dataCategory ?? null,
                lastDiscovered: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
              }).returning();
              assetId = inserted[0].id;
            }

            // Discover and upsert fields for the asset
            try {
              const fieldIterator = plugin.discoverFields(context, asset);
              let fieldResult = await fieldIterator.next();
              while (!fieldResult.done) {
                const field = fieldResult.value;
                // upsert field by name
                const [existingField] = await db.select().from(dataFields).where(and(eq(dataFields.tenantId, tenantId), eq(dataFields.dataAssetId, assetId), eq(dataFields.name, field.name)));
                if (existingField) {
                  await db.update(dataFields).set({
                    dataType: field.dataType,
                    isNullable: field.isNullable,
                    isPrimaryKey: field.isPrimaryKey,
                    isForeignKey: field.isForeignKey,
                    description: field.description || null,
                    classificationCategory: field.metadata?.classificationCategory || null,
                    classificationMethod: field.metadata?.classificationMethod || null,
                    classificationConfidence: field.metadata?.classificationConfidence ?? null,
                    lastDiscovered: new Date(),
                    updatedAt: new Date(),
                  }).where(eq(dataFields.id, existingField.id));
                } else {
                  await db.insert(dataFields).values({
                    tenantId,
                    dataAssetId: assetId,
                    name: field.name,
                    dataType: field.dataType,
                    isNullable: field.isNullable,
                    isPrimaryKey: field.isPrimaryKey,
                    isForeignKey: field.isForeignKey,
                    description: field.description || null,
                    classificationCategory: field.metadata?.classificationCategory || null,
                    classificationMethod: field.metadata?.classificationMethod || null,
                    classificationConfidence: field.metadata?.classificationConfidence ?? null,
                    lastDiscovered: new Date(),
                    createdAt: new Date(),
                    updatedAt: new Date(),
                  });
                }

                fieldResult = await fieldIterator.next();
              }
            } catch (err) {
              // Non-fatal: log and continue
              console.warn("Field discovery failed for asset", asset.qualifiedName, err);
            }
          } catch (err) {
            console.warn("Asset persistence failed", asset.qualifiedName, err);
            skipped += 1;
          }

          assetResult = await assetIterator.next();
        }

      schemaResult = await schemaIterator.next();
    }

    return { discovered, processed, skipped };
  }

  private async executeDataSync(
    plugin: ConnectorPlugin,
    jobId: string,
    tenantId: string,
    connectorInstanceId: string,
    fullSync?: boolean
  ): Promise<{ discovered: number; processed: number; skipped: number }> {
    const context = this.createExecutionContext(tenantId, connectorInstanceId);
    const checkpoint = await plugin.getCheckpoint(context);
    let discovered = 0;
    let processed = 0;
    let skipped = 0;

    const changeIterator = plugin.readChanges(context, checkpoint);
    let changeResult = await changeIterator.next();
    while (!changeResult.done) {
      const change = changeResult.value;
      discovered += 1;
      processed += 1;
      this.emit("sync.progress", {
        type: "sync.progress" as const,
        tenantId,
        connectorInstanceId,
        timestamp: new Date(),
        payload: { phase: "sync", changeId: change.id },
      } as ConnectorEvent);
      changeResult = await changeIterator.next();
    }

    await plugin.saveCheckpoint(context, {
      ...checkpoint,
      lastIngestionTime: new Date(),
      metadata: { ...(checkpoint.metadata || {}), fullSync: Boolean(fullSync) },
    });

    return { discovered, processed, skipped };
  }

  private async executeRemediation(
    plugin: ConnectorPlugin,
    jobId: string,
    tenantId: string,
    connectorInstanceId: string
  ): Promise<{ discovered: number; processed: number; skipped: number }> {
    const context = this.createExecutionContext(tenantId, connectorInstanceId);
    let discovered = 0;
    let processed = 0;
    let skipped = 0;

    const capabilities = await plugin.discoverDeletionCapabilities(context);
    discovered = capabilities.length;
    this.emit("sync.progress", {
      type: "sync.progress" as const,
      tenantId,
      connectorInstanceId,
      timestamp: new Date(),
      payload: { phase: "remediation", capabilities },
    } as ConnectorEvent);

    return { discovered, processed, skipped };
  }

  private async auditLog(
    tenantId: string,
    action: string,
    targetId: string,
    outcome: "success" | "failure" | "degraded",
    actorId?: string,
    details?: string
  ): Promise<void> {
    try {
      await db.insert(auditEvents).values({
        id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
        tenantId,
        actor: actorId || "system",
        action,
        targetType: "connector",
        targetId,
        targetName: targetId,
        outcome,
        reason: details,
        createdAt: new Date(),
      });
    } catch (error) {
      console.warn("Failed to write audit log:", error);
      // Don't throw; audit failure shouldn't block operations
    }
  }
}

// ─── Singleton Instance ───────────────────────────────────────────────────────

let managerInstance: ConnectorManager | null = null;

export function getConnectorManager(): ConnectorManager {
  if (!managerInstance) {
    managerInstance = new ConnectorManager();
  }
  return managerInstance;
}
