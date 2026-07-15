import { Pool, PoolClient } from "pg";
import {
  ConnectorPlugin,
  ConnectorCapability,
  ConnectorConfig,
  Credentials,
  ExecutionContext,
  HealthStatus,
  Schema,
  Field,
  DataAsset,
  SyncCheckpoint,
  ChangeEvent,
  DeletionCapability,
  RemediationAction,
  RemediationResult,
  ConnectionError,
  TimeoutError,
} from "@shared/connector-sdk";

export interface PostgresConnectorConfig extends ConnectorConfig {
  host: string;
  port: number;
  database: string;
  ssl?: boolean;
  schema?: string;
}

export class PostgresConnector implements ConnectorPlugin {
  private config: PostgresConnectorConfig;
  private credentials: Credentials;
  private pool?: Pool;
  private client?: PoolClient;

  constructor(config: PostgresConnectorConfig, credentials: Credentials, private logger: any) {
    this.config = config;
    this.credentials = credentials;
  }

  getId(): string {
    return "postgres";
  }

  getName(): string {
    return "PostgreSQL Connector";
  }

  getVersion(): string {
    return "1.0.0";
  }

  capabilities(): ConnectorCapability[] {
    return [
      {
        name: "schema_discovery",
        supported: true,
        description: "Discover Postgres schemas and tables",
      },
      {
        name: "asset_discovery",
        supported: true,
        description: "Discover tables and views as assets",
      },
      {
        name: "field_discovery",
        supported: true,
        description: "Discover field definitions from Postgres catalogs",
      },
      {
        name: "data_sampling",
        supported: true,
        description: "Sample rows from database tables",
      },
      {
        name: "incremental_sync",
        supported: true,
        description: "Read changes via timestamp or incremental queries",
      },
      {
        name: "remediation",
        supported: false,
        description: "SQL-based remediation is not implemented yet",
      },
    ];
  }

  async authenticate(credentials: Credentials): Promise<void> {
    if (!credentials.username || !credentials.password) {
      throw new ConnectionError("Postgres credentials must include username and password", false);
    }
    this.credentials = credentials;
    this.pool = new Pool({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: credentials.username,
      password: credentials.password,
      ssl: this.config.ssl,
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 15000,
    });
    this.logger.info("PostgresConnector authentication completed");
  }

  async refreshCredentials(currentCredentials: Credentials): Promise<Credentials> {
    return currentCredentials;
  }

  async testConnection(config: ConnectorConfig): Promise<{ success: boolean; error?: string }> {
    try {
      await this.connect();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  async healthCheck(context: ExecutionContext): Promise<HealthStatus> {
    try {
      const start = Date.now();
      await this.connect();
      const latency = Date.now() - start;
      return {
        status: "healthy",
        message: "PostgreSQL connection is healthy",
        lastCheck: new Date(),
        metrics: {
          latency,
        },
      };
    } catch (error) {
      return {
        status: "unhealthy",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.release();
      } catch {
        // ignore
      }
      this.client = undefined;
    }
    if (this.pool) {
      await this.pool.end();
      this.pool = undefined;
    }
    this.logger.info("PostgresConnector disconnected");
  }

  async *discoverSchemas(context: ExecutionContext): AsyncIterator<Schema> {
    const client = await this.connect();
    const schemaName = this.config.schema || "public";
    const result = await client.query(
      `SELECT schema_name FROM information_schema.schemata WHERE schema_name = $1`,
      [schemaName]
    );
    for (const row of result.rows) {
      yield {
        name: row.schema_name,
        type: "schema",
        description: `PostgreSQL schema ${row.schema_name}`,
      };
    }
  }

  async *discoverAssets(context: ExecutionContext, schema?: Schema): AsyncIterator<DataAsset> {
    const client = await this.connect();
    const schemaName = schema?.name || this.config.schema || "public";
    const result = await client.query(
      `SELECT table_name, table_type FROM information_schema.tables WHERE table_schema = $1`,
      [schemaName]
    );
    for (const row of result.rows) {
      yield {
        id: `${schemaName}.${row.table_name}`,
        name: row.table_name,
        type: row.table_type === "VIEW" ? "view" : "table",
        qualifiedName: `${this.config.database}.${schemaName}.${row.table_name}`,
        schema: schemaName,
        description: `PostgreSQL ${row.table_type.toLowerCase()} ${row.table_name}`,
        metadata: {
          tableType: row.table_type,
        },
      };
    }
  }

  async *discoverFields(context: ExecutionContext, asset: DataAsset): AsyncIterator<Field> {
    const client = await this.connect();
    const [schemaName, tableName] = asset.id.split(".");
    if (!schemaName || !tableName) {
      return;
    }
    const result = await client.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = $1 AND table_name = $2`,
      [schemaName, tableName]
    );
    for (const row of result.rows) {
      yield {
        name: row.column_name,
        dataType: row.data_type,
        isNullable: row.is_nullable === "YES",
        isPrimaryKey: false,
        isForeignKey: false,
        description: `Column ${row.column_name}`,
        metadata: {
          schema: schemaName,
          table: tableName,
        },
      };
    }
  }

  async *discoverRelationships(_context: ExecutionContext): AsyncIterator<any> {
    return;
  }

  async *discoverUsersAndRoles(_context: ExecutionContext): AsyncIterator<any> {
    return;
  }

  async *discoverProcessingActivities(_context: ExecutionContext): AsyncIterator<any> {
    return;
  }

  async *discoverRetentionConfigurations(_context: ExecutionContext): AsyncIterator<any> {
    return;
  }

  async *discoverAuditEvents(_context: ExecutionContext, _since: Date): AsyncIterator<any> {
    return;
  }

  async *discoverSecurityEvents(_context: ExecutionContext, _since: Date): AsyncIterator<any> {
    return;
  }

  async *discoverDataTransfers(_context: ExecutionContext): AsyncIterator<any> {
    return;
  }

  async readMetadata(_context: ExecutionContext, asset: DataAsset): Promise<Record<string, any>> {
    return {
      connectorType: "postgres",
      database: this.config.database,
      schema: this.config.schema || "public",
      asset: asset.id,
    };
  }

  async sampleApprovedData(
    _context: ExecutionContext,
    asset: DataAsset,
    limit: number
  ): Promise<{ records: Record<string, any>[]; totalAvailable: number; samplingMethod: "random" | "sequential" | "filtered"; appliedFilters?: Record<string, any> }> {
    const client = await this.connect();
    const [schemaName, tableName] = asset.id.split(".");
    const query = `SELECT * FROM ${this.quoteIdentifier(schemaName)}.${this.quoteIdentifier(tableName)} LIMIT $1`;
    const result = await client.query(query, [limit]);
    return {
      records: result.rows,
      totalAvailable: result.rowCount ?? 0,
      samplingMethod: "sequential",
    };
  }

  async *readChanges(
    _context: ExecutionContext,
    checkpoint: SyncCheckpoint
  ): AsyncIterator<ChangeEvent> {
    // Best-effort incremental sync using timestamp columns (updated_at / modified_at)
    const client = await this.connect();
    const since = checkpoint?.cursor ? new Date(checkpoint.cursor) : new Date(0);
    const schemaName = this.config.schema || "public";

    // Fetch tables in schema
    const tablesRes = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1`,
      [schemaName]
    );

    for (const trow of tablesRes.rows) {
      const tableName = trow.table_name;

      // Check for common timestamp columns
      const colRes = await client.query(
        `SELECT column_name FROM information_schema.columns WHERE table_schema = $1 AND table_name = $2 AND column_name IN ('updated_at','modified_at','last_modified')`,
        [schemaName, tableName]
      );

      if (!colRes.rows.length) {
        // No timestamp column; skip incremental for this table
        continue;
      }

      const tsCol = colRes.rows[0].column_name;

      // Determine primary key column(s)
      const pkRes = await client.query(
        `SELECT kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
         WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1 AND tc.table_name = $2
         ORDER BY kcu.ordinal_position`,
        [schemaName, tableName]
      );

      const pkCols = pkRes.rows.map((r: any) => r.column_name);

      // Query changed rows
      const query = `SELECT * FROM ${this.quoteIdentifier(schemaName)}.${this.quoteIdentifier(tableName)} WHERE ${this.quoteIdentifier(tsCol)} > $1 ORDER BY ${this.quoteIdentifier(tsCol)} ASC LIMIT 1000`;
      const rows = await client.query(query, [since.toISOString()]);

      for (const row of rows.rows) {
        // Build recordId from PK if available, else fallback to ctid
        let recordId: string | number = row[pkCols[0]] ?? null;
        if (pkCols.length > 1) {
          recordId = pkCols.map(c => row[c]).join("::");
        }
        if (!recordId) {
          // use ctid as fallback (Postgres physical location)
          recordId = row.ctid || JSON.stringify(row);
        }

        const evt: ChangeEvent = {
          id: `${schemaName}.${tableName}:${recordId}`,
          timestamp: new Date(row[tsCol] || new Date()),
          operation: 'UPDATE',
          assetId: `${schemaName}.${tableName}`,
          recordId,
          previousValues: undefined,
          newValues: row,
        };

        yield evt;
      }
    }
  }

  async getCheckpoint(_context: ExecutionContext): Promise<SyncCheckpoint> {
    const client = await this.connect();
    try {
      const tenantId = _context.tenantId;
      const connectorInstanceId = _context.connectorId;
      const res = await client.query(
        `SELECT cursor, last_source_event_time, last_ingestion_time, schema_version, metadata FROM sync_checkpoints WHERE tenant_id = $1 AND connector_instance_id = $2 ORDER BY updated_at DESC LIMIT 1`,
        [tenantId, connectorInstanceId]
      );

      if (res.rows.length) {
        const row = res.rows[0];
        return {
          cursor: row.cursor || "",
          lastSourceEventTime: row.last_source_event_time ? new Date(row.last_source_event_time) : undefined,
          lastIngestionTime: row.last_ingestion_time ? new Date(row.last_ingestion_time) : new Date(),
          schemaVersion: row.schema_version || undefined,
          metadata: row.metadata || {},
        };
      }
      return {
        cursor: "",
        lastIngestionTime: new Date(),
        metadata: {},
      };
    } catch (err) {
      this.logger.warn("Failed to read checkpoint from DB, returning empty checkpoint", { error: err });
      return {
        cursor: "",
        lastIngestionTime: new Date(),
        metadata: {},
      };
    }
  }

  async saveCheckpoint(_context: ExecutionContext, checkpoint: SyncCheckpoint): Promise<void> {
    const client = await this.connect();
    try {
      const tenantId = _context.tenantId;
      const connectorInstanceId = _context.connectorId;

      const updateRes = await client.query(
        `UPDATE sync_checkpoints SET cursor = $1, last_source_event_time = $2, last_ingestion_time = $3, schema_version = $4, metadata = $5, updated_at = now() WHERE tenant_id = $6 AND connector_instance_id = $7 RETURNING id`,
        [
          checkpoint.cursor || "",
          checkpoint.lastSourceEventTime ? checkpoint.lastSourceEventTime.toISOString() : null,
          checkpoint.lastIngestionTime ? checkpoint.lastIngestionTime.toISOString() : new Date().toISOString(),
          checkpoint.schemaVersion || null,
          checkpoint.metadata || {},
          tenantId,
          connectorInstanceId,
        ]
      );

      if (!updateRes.rows.length) {
        await client.query(
          `INSERT INTO sync_checkpoints (tenant_id, connector_instance_id, cursor, last_source_event_time, last_ingestion_time, schema_version, metadata, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7, now())`,
          [
            tenantId,
            connectorInstanceId,
            checkpoint.cursor || "",
            checkpoint.lastSourceEventTime ? checkpoint.lastSourceEventTime.toISOString() : null,
            checkpoint.lastIngestionTime ? checkpoint.lastIngestionTime.toISOString() : new Date().toISOString(),
            checkpoint.schemaVersion || null,
            checkpoint.metadata || {},
          ]
        );
      }
      this.logger.debug("Checkpoint persisted", { tenantId, connectorInstanceId });
    } catch (err) {
      this.logger.error("Failed to persist checkpoint", err as Error, { checkpoint });
      // don't throw to avoid breaking ongoing sync; manager can decide retry semantics
    }
  }

  async discoverDeletionCapabilities(_context: ExecutionContext): Promise<DeletionCapability[]> {
    return [
      {
        name: "sql_deletion",
        description: "Delete rows via SQL DELETE operations",
        scopeLevel: "row",
        supportsConditional: true,
        supportsAuditing: true,
      },
    ];
  }

  async executeApprovedRemediation(
    _context: ExecutionContext,
    action: RemediationAction
  ): Promise<RemediationResult> {
    return {
      actionId: action.id,
      success: false,
      recordsAffected: 0,
      timestamp: new Date(),
      details: {
        message: "Remediation actions are not implemented for Postgres connector",
      },
    };
  }

  async verifyRemediation(_context: ExecutionContext, _action: RemediationAction): Promise<boolean> {
    return false;
  }

  private async connect(): Promise<PoolClient> {
    if (!this.pool) {
      if (!this.credentials.username || !this.credentials.password) {
        throw new ConnectionError("Missing Postgres credentials", false);
      }
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.credentials.username,
        password: this.credentials.password,
        ssl: this.config.ssl,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 15000,
      });
    }
    if (!this.client) {
      this.client = await this.pool.connect();
    }
    return this.client;
  }

  private quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }
}
