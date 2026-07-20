import { createConnection, Connection } from "mysql2/promise";
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

export interface MysqlConnectorConfig extends ConnectorConfig {
  host: string;
  port: number;
  database: string;
  ssl?: boolean;
  charset?: string;
}

export class MysqlConnector implements ConnectorPlugin {
  private config: MysqlConnectorConfig;
  private credentials: Credentials;
  private connection?: Connection;

  constructor(config: MysqlConnectorConfig, credentials: Credentials, private logger: any) {
    this.config = config;
    this.credentials = credentials;
  }

  getId(): string {
    return "mysql";
  }

  getName(): string {
    return "MySQL Connector";
  }

  getVersion(): string {
    return "1.0.0";
  }

  capabilities(): ConnectorCapability[] {
    return [
      { name: "schema_discovery", supported: true, description: "Discover MySQL schemas" },
      { name: "asset_discovery", supported: true, description: "Discover MySQL tables" },
      { name: "field_discovery", supported: true, description: "Discover MySQL columns" },
      { name: "data_sampling", supported: true, description: "Sample table rows" },
      { name: "incremental_sync", supported: false, description: "Incremental sync not implemented" },
    ];
  }

  async authenticate(credentials: Credentials): Promise<void> {
    if (!credentials.username || !credentials.password) {
      throw new ConnectionError("MySQL credentials must include username and password", false);
    }
    this.credentials = credentials;
    this.connection = await createConnection({
      host: this.config.host,
      port: this.config.port,
      user: credentials.username,
      password: credentials.password,
      database: this.config.database,
      // Enforce certificate verification by default when SSL is enabled.
      ssl: this.config.ssl ? { rejectUnauthorized: true } : undefined,
    });
    this.logger.info("MySQL authentication successful");
  }

  async refreshCredentials(currentCredentials: Credentials): Promise<Credentials> {
    return currentCredentials;
  }

  async testConnection(_config: ConnectorConfig): Promise<{ success: boolean; error?: string }> {
    try {
      if (!this.connection) {
        await this.authenticate(this.credentials);
      }
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  async healthCheck(_context: ExecutionContext): Promise<HealthStatus> {
    try {
      await this.connect();
      await this.connection!.query("SELECT 1");
      return { status: "healthy", message: "MySQL connection is healthy", lastCheck: new Date() };
    } catch (error) {
      return {
        status: "unhealthy",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = undefined;
    }
  }

  async *discoverSchemas(_context: ExecutionContext): AsyncIterator<Schema> {
    const [databases]: any = await this.connect().then(conn => conn.query(
      "SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys')"
    ));

    for (const row of databases) {
      yield {
        name: row.SCHEMA_NAME,
        type: "schema",
        description: `MySQL schema ${row.SCHEMA_NAME}`,
      };
    }
  }

  async *discoverAssets(_context: ExecutionContext, schema?: Schema): AsyncIterator<DataAsset> {
    const schemaName = schema?.name || this.config.database;
    const [tables]: any = await this.connect().then(conn => conn.query(
      "SELECT TABLE_NAME, TABLE_TYPE FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = ?",
      [schemaName]
    ));

    for (const row of tables) {
      yield {
        id: row.TABLE_NAME,
        name: row.TABLE_NAME,
        type: row.TABLE_TYPE === "VIEW" ? "view" : "table",
        qualifiedName: `${this.config.database}.${schemaName}.${row.TABLE_NAME}`,
        schema: schemaName,
        description: `MySQL ${row.TABLE_TYPE.toLowerCase()} ${row.TABLE_NAME}`,
      };
    }
  }

  async *discoverFields(_context: ExecutionContext, asset: DataAsset): AsyncIterator<Field> {
    const [columns]: any = await this.connect().then(conn => conn.query(
      "SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?",
      [asset.schema, asset.name]
    ));

    for (const col of columns) {
      yield {
        name: col.COLUMN_NAME,
        dataType: col.DATA_TYPE,
        isNullable: col.IS_NULLABLE === "YES",
        isPrimaryKey: false,
        isForeignKey: false,
        description: `Column ${col.COLUMN_NAME}`,
        metadata: { schema: asset.schema, table: asset.name },
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
      connectorType: "mysql",
      database: this.config.database,
      schema: asset.schema,
      asset: asset.id,
    };
  }

  async sampleApprovedData(
    _context: ExecutionContext,
    asset: DataAsset,
    limit: number
  ): Promise<{ records: Record<string, any>[]; totalAvailable: number; samplingMethod: "random" | "sequential" | "filtered"; appliedFilters?: Record<string, any> }> {
    const [rows]: any = await this.connect().then(conn => conn.query(
      `SELECT * FROM \`${asset.schema}\`.\`${asset.name}\` LIMIT ?`,
      [limit]
    ));

    return {
      records: rows || [],
      totalAvailable: (rows || []).length,
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
      details: { message: "MySQL remediation is not implemented" },
    };
  }

  async verifyRemediation(_context: ExecutionContext, _action: RemediationAction): Promise<boolean> {
    return false;
  }

  private async connect(): Promise<Connection> {
    if (!this.connection) {
      if (!this.credentials.username || !this.credentials.password) {
        throw new ConnectionError("Missing MySQL credentials", false);
      }
      this.connection = await createConnection({
        host: this.config.host,
        port: this.config.port,
        user: this.credentials.username,
        password: this.credentials.password,
        database: this.config.database,
        // Enforce certificate verification by default when SSL is enabled.
        ssl: this.config.ssl ? { rejectUnauthorized: true } : undefined,
      });
    }
    return this.connection;
  }
}
