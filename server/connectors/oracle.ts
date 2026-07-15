import oracledb from "oracledb";
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

export interface OracleConnectorConfig extends ConnectorConfig {
  host: string;
  port: number;
  database: string;
  serviceName?: string;
}

export class OracleConnector implements ConnectorPlugin {
  private config: OracleConnectorConfig;
  private credentials: Credentials;
  private connection?: oracledb.Connection;

  constructor(config: OracleConnectorConfig, credentials: Credentials, private logger: any) {
    this.config = config;
    this.credentials = credentials;
  }

  getId(): string {
    return "oracle";
  }

  getName(): string {
    return "Oracle Database Connector";
  }

  getVersion(): string {
    return "1.0.0";
  }

  capabilities(): ConnectorCapability[] {
    return [
      { name: "schema_discovery", supported: true, description: "Discover Oracle schemas" },
      { name: "asset_discovery", supported: true, description: "Discover Oracle tables" },
      { name: "field_discovery", supported: true, description: "Discover Oracle columns" },
      { name: "data_sampling", supported: true, description: "Sample rows from Oracle tables" },
      { name: "incremental_sync", supported: false, description: "Incremental sync not implemented" },
    ];
  }

  async authenticate(credentials: Credentials): Promise<void> {
    if (!credentials.username || !credentials.password) {
      throw new ConnectionError("Oracle credentials must include username and password", false);
    }
    this.credentials = credentials;
    this.connection = await oracledb.getConnection({
      user: credentials.username,
      password: credentials.password,
      connectionString: `${this.config.host}:${this.config.port}/${this.config.serviceName || this.config.database}`,
    });
    this.logger.info("Oracle authentication successful");
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
      await this.connection!.execute("SELECT 1 FROM DUAL");
      return { status: "healthy", message: "Oracle connection is healthy", lastCheck: new Date() };
    } catch (error) {
      return {
        status: "unhealthy",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.close();
      this.connection = undefined;
    }
  }

  async *discoverSchemas(_context: ExecutionContext): AsyncIterator<Schema> {
    const result = await this.connect().then(() =>
      this.connection!.execute(
        `SELECT DISTINCT OWNER FROM ALL_TABLES WHERE OWNER NOT IN ('SYS', 'SYSTEM', 'OUTLN', 'DBSNMP') ORDER BY OWNER`
      )
    );

    const rows = (result.rows ?? []) as Array<[string]>;
    for (const row of rows) {
      yield { name: row[0], type: "schema", description: `Schema ${row[0]}` };
    }
  }

  async *discoverAssets(_context: ExecutionContext, schema?: Schema): AsyncIterator<DataAsset> {
    const owner = schema?.name || this.config.database;
    const result = await this.connect().then(() =>
      this.connection!.execute(
        `SELECT TABLE_NAME FROM ALL_TABLES WHERE OWNER = :owner ORDER BY TABLE_NAME`,
        [owner]
      )
    );

    const rows = (result.rows ?? []) as Array<[string]>;
    for (const row of rows) {
      yield {
        id: row[0],
        name: row[0],
        type: "table",
        qualifiedName: `${owner}.${row[0]}`,
        schema: owner,
        description: `Oracle table ${row[0]}`,
      };
    }
  }

  async *discoverFields(_context: ExecutionContext, asset: DataAsset): AsyncIterator<Field> {
    const result = await this.connect().then(() =>
      this.connection!.execute(
        `SELECT COLUMN_NAME, DATA_TYPE, NULLABLE FROM ALL_TAB_COLUMNS WHERE OWNER = :owner AND TABLE_NAME = :table ORDER BY COLUMN_ID`,
        [asset.schema, asset.name]
      )
    );

    const rows = (result.rows ?? []) as Array<[string, string, string]>;
    for (const row of rows) {
      yield {
        name: row[0],
        dataType: row[1],
        isNullable: row[2] === "Y",
        isPrimaryKey: false,
        isForeignKey: false,
        description: `Column ${row[0]}`,
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
      connectorType: "oracle",
      database: this.config.database,
      schema: asset.schema,
      asset: asset.name,
    };
  }

  async sampleApprovedData(_context: ExecutionContext, asset: DataAsset, limit: number): Promise<{ records: Record<string, any>[]; totalAvailable: number; samplingMethod: "random" | "sequential" | "filtered"; appliedFilters?: Record<string, any> }> {
    const query = `SELECT * FROM "${asset.schema}"."${asset.name}" FETCH FIRST ${limit} ROWS ONLY`;
    const result = await this.connect().then(() => this.connection!.execute(query));
    const rows = (result.rows ?? []) as Record<string, any>[];

    return {
      records: rows,
      totalAvailable: rows.length,
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
      details: { message: "Oracle remediation is not implemented" },
    };
  }

  async verifyRemediation(_context: ExecutionContext, _action: RemediationAction): Promise<boolean> {
    return false;
  }

  private async connect(): Promise<oracledb.Connection> {
    if (!this.connection) {
      if (!this.credentials.username || !this.credentials.password) {
        throw new ConnectionError("Missing Oracle credentials", false);
      }
      await this.authenticate(this.credentials);
    }
    return this.connection!;
  }
}
