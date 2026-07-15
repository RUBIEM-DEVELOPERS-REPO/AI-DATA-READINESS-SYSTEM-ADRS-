import sql from "mssql";
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
} from "@shared/connector-sdk";

export interface MssqlConnectorConfig extends ConnectorConfig {
  host: string;
  port: number;
  database: string;
  encrypt?: boolean;
  trustServerCertificate?: boolean;
}

export class MssqlConnector implements ConnectorPlugin {
  private config: MssqlConnectorConfig;
  private credentials: Credentials;
  private pool?: sql.ConnectionPool;

  constructor(config: MssqlConnectorConfig, credentials: Credentials, private logger: any) {
    this.config = config;
    this.credentials = credentials;
  }

  getId(): string {
    return "mssql";
  }

  getName(): string {
    return "SQL Server Connector";
  }

  getVersion(): string {
    return "1.0.0";
  }

  capabilities(): ConnectorCapability[] {
    return [
      { name: "schema_discovery", supported: true, description: "Discover SQL Server schemas" },
      { name: "asset_discovery", supported: true, description: "Discover tables and views" },
      { name: "field_discovery", supported: true, description: "Discover column metadata" },
      { name: "data_sampling", supported: true, description: "Sample rows from tables" },
      { name: "incremental_sync", supported: false, description: "Incremental sync not implemented" },
    ];
  }

  async authenticate(credentials: Credentials): Promise<void> {
    if (!credentials.username || !credentials.password) {
      throw new ConnectionError("SQL Server credentials must include username and password", false);
    }
    this.credentials = credentials;

    this.pool = new sql.ConnectionPool({
      server: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: credentials.username,
      password: credentials.password,
      options: {
        encrypt: this.config.encrypt ?? true,
        trustServerCertificate: this.config.trustServerCertificate ?? false,
      },
      connectionTimeout: 30000,
      requestTimeout: 30000,
    });

    await this.pool.connect();
    this.logger.info("SQL Server authentication successful");
  }

  async refreshCredentials(currentCredentials: Credentials): Promise<Credentials> {
    return currentCredentials;
  }

  async testConnection(_config: ConnectorConfig): Promise<{ success: boolean; error?: string }> {
    try {
      await this.connect();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  async healthCheck(_context: ExecutionContext): Promise<HealthStatus> {
    try {
      await this.connect();
      const request = this.pool!.request();
      await request.query("SELECT 1");
      return { status: "healthy", message: "SQL Server connection is healthy", lastCheck: new Date() };
    } catch (error) {
      return {
        status: "unhealthy",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = undefined;
    }
  }

  async *discoverSchemas(_context: ExecutionContext): AsyncIterator<Schema> {
    const result = await this.connect().then(() =>
      this.pool!.request().query("SELECT name FROM sys.schemas WHERE name NOT IN ('dbo', 'guest', 'sys', 'information_schema')")
    );

    for (const row of result.recordset) {
      yield { name: row.name, type: "schema", description: `Schema ${row.name}` };
    }
  }

  async *discoverAssets(_context: ExecutionContext, schema?: Schema): AsyncIterator<DataAsset> {
    const schemaName = schema?.name || this.config.database;
    const result = await this.connect().then(() =>
      this.pool!
        .request()
        .input("schema", sql.VarChar, schemaName)
        .query("SELECT name, type_desc FROM sys.objects WHERE schema_id = SCHEMA_ID(@schema) AND type IN ('U', 'V')")
    );

    for (const row of result.recordset) {
      yield {
        id: row.name,
        name: row.name,
        type: row.type_desc === "VIEW" ? "view" : "table",
        qualifiedName: `${this.config.database}.${schemaName}.${row.name}`,
        schema: schemaName,
        description: `${row.type_desc.toLowerCase()} ${row.name}`,
      };
    }
  }

  async *discoverFields(_context: ExecutionContext, asset: DataAsset): AsyncIterator<Field> {
    const result = await this.connect().then(() =>
      this.pool!
        .request()
        .input("schema", sql.VarChar, asset.schema)
        .input("table", sql.VarChar, asset.name)
        .query(`
          SELECT c.name, t.name as type_name
          FROM sys.columns c
          JOIN sys.types t ON c.user_type_id = t.user_type_id
          JOIN sys.tables tb ON c.object_id = tb.object_id
          WHERE tb.name = @table AND SCHEMA_NAME(tb.schema_id) = @schema
        `)
    );

    for (const row of result.recordset) {
      yield {
        name: row.name,
        dataType: row.type_name,
        isNullable: false,
        isPrimaryKey: false,
        isForeignKey: false,
        description: `Column ${row.name}`,
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
      connectorType: "mssql",
      database: this.config.database,
      schema: asset.schema,
      asset: asset.name,
    };
  }

  async sampleApprovedData(_context: ExecutionContext, asset: DataAsset, limit: number): Promise<{ records: Record<string, any>[]; totalAvailable: number; samplingMethod: "random" | "sequential" | "filtered"; appliedFilters?: Record<string, any> }> {
    const query = `SELECT TOP ${limit} * FROM [${asset.schema}].[${asset.name}]`;
    const result = await this.connect().then(() => this.pool!.request().query(query));
    return {
      records: result.recordset || [],
      totalAvailable: result.recordset?.length || 0,
      samplingMethod: "sequential",
    };
  }

  async *readChanges(_context: ExecutionContext, _checkpoint: SyncCheckpoint): AsyncIterator<ChangeEvent> {
    return;
  }

  async getCheckpoint(_context: ExecutionContext): Promise<SyncCheckpoint> {
    return {
      cursor: "",
      lastIngestionTime: new Date(),
      metadata: {},
    };
  }

  async saveCheckpoint(_context: ExecutionContext, _checkpoint: SyncCheckpoint): Promise<void> {
    return;
  }

  async discoverDeletionCapabilities(_context: ExecutionContext): Promise<DeletionCapability[]> {
    return [
      {
        name: "row_deletion",
        description: "Delete rows by condition",
        scopeLevel: "row",
        supportsConditional: true,
        supportsAuditing: true,
      },
    ];
  }

  async executeApprovedRemediation(_context: ExecutionContext, action: RemediationAction): Promise<RemediationResult> {
    return {
      actionId: action.id,
      success: false,
      recordsAffected: 0,
      timestamp: new Date(),
      details: { message: "SQL Server remediation is not implemented" },
    };
  }

  async verifyRemediation(_context: ExecutionContext, _action: RemediationAction): Promise<boolean> {
    return false;
  }

  private async connect(): Promise<sql.ConnectionPool> {
    if (!this.pool) {
      if (!this.credentials.username || !this.credentials.password) {
        throw new ConnectionError("Missing SQL Server credentials", false);
      }
      await this.authenticate(this.credentials);
    }
    return this.pool!;
  }
}
