import { ConnectorPlugin } from "@shared/connector-sdk";
import { PostgresConnector, PostgresConnectorConfig } from "../connectors/postgresql";
import { RestApiConnector, RestConnectorConfig } from "../connectors/rest-api";
import { MysqlConnector, MysqlConnectorConfig } from "../connectors/mysql";
import { MssqlConnector, MssqlConnectorConfig } from "../connectors/mssql";
import { MongodbConnector, MongodbConnectorConfig } from "../connectors/mongodb";
import { OracleConnector, OracleConnectorConfig } from "../connectors/oracle";

export interface ConnectorDefinition {
  type: string;
  name: string;
  description: string;
  configSchema: {
    fields: Array<{
      name: string;
      type: "string" | "number" | "boolean" | "password";
      label: string;
      required: boolean;
      default?: any;
      options?: Array<{ label: string; value: string }>;
    }>;
  };
  credentialFields: Array<{
    name: string;
    type: "string" | "password";
    label: string;
    required: boolean;
  }>;
}

export class ConnectorRegistry {
  private connectorFactories: Map<
    string,
    (config: any, credentials: any, logger: any) => ConnectorPlugin
  > = new Map();

  private connectorDefinitions: Map<string, ConnectorDefinition> = new Map();

  constructor(logger: any = console) {
    this.registerDefaultConnectors(logger);
  }

  private registerDefaultConnectors(logger: any) {
    // PostgreSQL
    this.register(
      "postgres",
      (config: PostgresConnectorConfig, credentials: any) =>
        new PostgresConnector(config, credentials, logger),
      {
        type: "postgres",
        name: "PostgreSQL",
        description: "Connect to PostgreSQL databases",
        configSchema: {
          fields: [
            { name: "host", type: "string", label: "Host", required: true },
            { name: "port", type: "number", label: "Port", required: true, default: 5432 },
            { name: "database", type: "string", label: "Database", required: true },
            { name: "schema", type: "string", label: "Schema", required: false, default: "public" },
            { name: "ssl", type: "boolean", label: "Use SSL", required: false, default: false },
          ],
        },
        credentialFields: [
          { name: "username", type: "string", label: "Username", required: true },
          { name: "password", type: "password", label: "Password", required: true },
        ],
      }
    );

    // MySQL
    this.register(
      "mysql",
      (config: MysqlConnectorConfig, credentials: any) =>
        new MysqlConnector(config, credentials, logger),
      {
        type: "mysql",
        name: "MySQL",
        description: "Connect to MySQL databases",
        configSchema: {
          fields: [
            { name: "host", type: "string", label: "Host", required: true },
            { name: "port", type: "number", label: "Port", required: true, default: 3306 },
            { name: "database", type: "string", label: "Database", required: true },
            { name: "charset", type: "string", label: "Charset", required: false, default: "utf8mb4" },
            { name: "ssl", type: "boolean", label: "Use SSL", required: false, default: false },
          ],
        },
        credentialFields: [
          { name: "username", type: "string", label: "Username", required: true },
          { name: "password", type: "password", label: "Password", required: true },
        ],
      }
    );

    // SQL Server
    this.register(
      "mssql",
      (config: MssqlConnectorConfig, credentials: any) =>
        new MssqlConnector(config, credentials, logger),
      {
        type: "mssql",
        name: "SQL Server",
        description: "Connect to Microsoft SQL Server databases",
        configSchema: {
          fields: [
            { name: "host", type: "string", label: "Host", required: true },
            { name: "port", type: "number", label: "Port", required: true, default: 1433 },
            { name: "database", type: "string", label: "Database", required: true },
            { name: "encrypt", type: "boolean", label: "Encrypt Connection", required: false, default: true },
            { name: "trustServerCertificate", type: "boolean", label: "Trust Server Certificate", required: false, default: false },
          ],
        },
        credentialFields: [
          { name: "username", type: "string", label: "Username", required: true },
          { name: "password", type: "password", label: "Password", required: true },
        ],
      }
    );

    // MongoDB
    this.register(
      "mongodb",
      (config: MongodbConnectorConfig, credentials: any) =>
        new MongodbConnector(config, credentials, logger),
      {
        type: "mongodb",
        name: "MongoDB",
        description: "Connect to MongoDB databases",
        configSchema: {
          fields: [
            { name: "host", type: "string", label: "Host", required: true },
            { name: "port", type: "number", label: "Port", required: true, default: 27017 },
            { name: "database", type: "string", label: "Database", required: true },
            { name: "replicaSet", type: "string", label: "Replica Set", required: false },
            { name: "ssl", type: "boolean", label: "Use SSL/TLS", required: false, default: false },
          ],
        },
        credentialFields: [
          { name: "username", type: "string", label: "Username", required: false },
          { name: "password", type: "password", label: "Password", required: false },
        ],
      }
    );

    // Oracle
    this.register(
      "oracle",
      (config: OracleConnectorConfig, credentials: any) =>
        new OracleConnector(config, credentials, logger),
      {
        type: "oracle",
        name: "Oracle Database",
        description: "Connect to Oracle databases",
        configSchema: {
          fields: [
            { name: "host", type: "string", label: "Host", required: true },
            { name: "port", type: "number", label: "Port", required: true, default: 1521 },
            { name: "database", type: "string", label: "Database SID", required: true },
            { name: "serviceName", type: "string", label: "Service Name", required: false },
          ],
        },
        credentialFields: [
          { name: "username", type: "string", label: "Username", required: true },
          { name: "password", type: "password", label: "Password", required: true },
        ],
      }
    );

    // REST API
    this.register(
      "rest_api",
      (config: RestConnectorConfig, credentials: any) =>
        new RestApiConnector(config, credentials, logger),
      {
        type: "rest_api",
        name: "REST API",
        description: "Connect to REST API endpoints",
        configSchema: {
          fields: [
            { name: "baseUrl", type: "string", label: "Base URL", required: true },
            { name: "headers", type: "string", label: "Custom Headers (JSON)", required: false },
            { name: "timeout", type: "number", label: "Timeout (ms)", required: false, default: 30000 },
          ],
        },
        credentialFields: [
          { name: "apiKey", type: "password", label: "API Key", required: false },
          { name: "username", type: "string", label: "Username", required: false },
          { name: "password", type: "password", label: "Password", required: false },
        ],
      }
    );
  }

  register(
    type: string,
    factory: (config: any, credentials: any, logger: any) => ConnectorPlugin,
    definition: ConnectorDefinition
  ): void {
    this.connectorFactories.set(type.toLowerCase(), factory);
    this.connectorDefinitions.set(type.toLowerCase(), definition);
  }

  createConnector(
    type: string,
    config: any,
    credentials: any,
    logger: any = console
  ): ConnectorPlugin {
    const factory = this.connectorFactories.get(type.toLowerCase());
    if (!factory) {
      throw new Error(
        `Connector type not supported: ${type}. Available types: ${Array.from(this.connectorFactories.keys()).join(", ")}`
      );
    }
    return factory(config, credentials, logger);
  }

  getDefinition(type: string): ConnectorDefinition | undefined {
    return this.connectorDefinitions.get(type.toLowerCase());
  }

  getAllDefinitions(): ConnectorDefinition[] {
    return Array.from(this.connectorDefinitions.values());
  }

  getSupportedTypes(): string[] {
    return Array.from(this.connectorFactories.keys());
  }
}
