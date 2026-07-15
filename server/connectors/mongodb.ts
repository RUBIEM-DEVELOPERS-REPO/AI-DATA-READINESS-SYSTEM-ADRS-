import { MongoClient, Db } from "mongodb";
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

export interface MongodbConnectorConfig extends ConnectorConfig {
  host: string;
  port: number;
  database: string;
  replicaSet?: string;
  ssl?: boolean;
}

export class MongodbConnector implements ConnectorPlugin {
  private config: MongodbConnectorConfig;
  private credentials: Credentials;
  private client?: MongoClient;
  private db?: Db;

  constructor(config: MongodbConnectorConfig, credentials: Credentials, private logger: any) {
    this.config = config;
    this.credentials = credentials;
  }

  getId(): string {
    return "mongodb";
  }

  getName(): string {
    return "MongoDB Connector";
  }

  getVersion(): string {
    return "1.0.0";
  }

  capabilities(): ConnectorCapability[] {
    return [
      { name: "schema_discovery", supported: true, description: "Discover MongoDB databases" },
      { name: "asset_discovery", supported: true, description: "Discover MongoDB collections" },
      { name: "field_discovery", supported: true, description: "Discover document fields" },
      { name: "data_sampling", supported: true, description: "Sample documents from collections" },
      { name: "incremental_sync", supported: false, description: "Incremental sync not implemented" },
    ];
  }

  async authenticate(credentials: Credentials): Promise<void> {
    if (!credentials.username || !credentials.password) {
      throw new ConnectionError("MongoDB credentials must include username and password", false);
    }

    this.credentials = credentials;

    const auth = `${credentials.username}:${credentials.password}@`;
    const replicaSet = this.config.replicaSet ? `?replicaSet=${this.config.replicaSet}` : "";
    const protocol = this.config.ssl ? "mongodb+srv" : "mongodb";
    const uri = `${protocol}://${auth}${this.config.host}:${this.config.port}/${this.config.database}${replicaSet}`;

    this.client = new MongoClient(uri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 10000,
    });

    await this.client.connect();
    this.db = this.client.db(this.config.database);
    this.logger.info("MongoDB authentication successful");
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
      await this.client!.db("admin").command({ ping: 1 });
      return { status: "healthy", message: "MongoDB connection is healthy", lastCheck: new Date() };
    } catch (error) {
      return {
        status: "unhealthy",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = undefined;
      this.db = undefined;
    }
  }

  async *discoverSchemas(_context: ExecutionContext): AsyncIterator<Schema> {
    const adminDb = this.client!.db("admin");
    const databases = await adminDb.admin().listDatabases();

    for (const db of databases.databases.filter((entry: any) => !["admin", "config", "local"].includes(entry.name))) {
      yield { name: db.name, type: "schema", description: `MongoDB database ${db.name}` };
    }
  }

  async *discoverAssets(_context: ExecutionContext, schema?: Schema): AsyncIterator<DataAsset> {
    const dbName = schema?.name || this.config.database;
    const db = this.client!.db(dbName);
    const collections = await db.listCollections().toArray();

    for (const col of collections) {
      yield {
        id: col.name,
        name: col.name,
        type: "table",
        qualifiedName: `${dbName}.${col.name}`,
        schema: dbName,
        description: `Collection ${col.name}`,
      };
    }
  }

  async *discoverFields(_context: ExecutionContext, asset: DataAsset): AsyncIterator<Field> {
    const db = this.client!.db(asset.schema || this.config.database);
    const collection = db.collection(asset.name);
    const sample = await collection.findOne({});

    if (!sample) {
      return;
    }

    for (const key of Object.keys(sample)) {
      yield {
        name: key,
        dataType: typeof sample[key],
        isNullable: sample[key] === null,
        isPrimaryKey: key === "_id",
        isForeignKey: false,
        description: `Field ${key}`,
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
      connectorType: "mongodb",
      database: asset.schema || this.config.database,
      asset: asset.name,
    };
  }

  async sampleApprovedData(_context: ExecutionContext, asset: DataAsset, limit: number): Promise<{ records: Record<string, any>[]; totalAvailable: number; samplingMethod: "random" | "sequential" | "filtered"; appliedFilters?: Record<string, any> }> {
    const db = this.client!.db(asset.schema || this.config.database);
    const collection = db.collection(asset.name);
    const records = await collection.find({}).limit(limit).toArray();
    return {
      records,
      totalAvailable: records.length,
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
        description: "Delete documents by condition",
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
      details: { message: "MongoDB remediation is not implemented" },
    };
  }

  async verifyRemediation(_context: ExecutionContext, _action: RemediationAction): Promise<boolean> {
    return false;
  }

  private async connect(): Promise<MongoClient> {
    if (!this.client) {
      await this.authenticate(this.credentials);
    }
    return this.client!;
  }
}
