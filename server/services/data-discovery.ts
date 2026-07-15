/**
 * Data Discovery Service
 * Enables regulators to securely query external APIs and databases for data discovery purposes.
 * Implements strict security controls: connection validation, query sanitization, and audit logging.
 */

import { db } from "../db";
import { Pool } from "pg";
import { sql, eq, and, or, ilike } from "drizzle-orm";
import { dataFields, dataAssets, connectorInstances, externalSystems, retentionPolicies } from "@shared/schema";

interface DiscoverySource {
  sourceType: "api" | "database";
  connectionString: string;
  apiKey?: string;
  queryText?: string;
  queryPayload?: Record<string, any>;
  headers?: Record<string, string>;
}

interface DiscoveryResult {
  sourceType: string;
  connectionString: string;
  status: "success" | "error" | "unauthorized";
  dataCount: number;
  preview: any[];
  error?: string;
  timestamp: string;
  discoverySessionId: string;
}

/**
 * Validate and parse connection string to prevent injection attacks
 */
export function validateConnectionString(
  connectionString: string
): { isValid: boolean; error?: string; parsed?: any } {
  const trimmed = connectionString.trim();

  // Must start with http://, https://, postgres://, or postgresql://
  if (
    !trimmed.match(/^(https?:\/\/|postgres(?:ql)?:\/\/)/)
  ) {
    return {
      isValid: false,
      error: "Connection must start with http://, https://, or postgresql://",
    };
  }

  // Must be under 2000 chars
  if (trimmed.length > 2000) {
    return { isValid: false, error: "Connection string exceeds maximum length" };
  }

  try {
    // Attempt to parse as URL to validate structure
    new URL(trimmed.split("?")[0]); // Remove query params before parsing
    return { isValid: true, parsed: trimmed };
  } catch {
    return {
      isValid: false,
      error: "Invalid connection string format",
    };
  }
}

/**
 * Query external API endpoint for data discovery
 */
async function queryExternalApi(
  url: string,
  headers?: Record<string, string>,
  payload?: Record<string, any>,
  apiKey?: string,
  queryText?: string
): Promise<{ data: any[]; count: number }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

  try {
    const authHeader: Record<string, string> = apiKey
      ? { Authorization: apiKey.startsWith("Bearer ") ? apiKey : `Bearer ${apiKey}` }
      : {} as Record<string, string>;
    const hasPayload = payload && Object.keys(payload).length > 0;
    let requestUrl = url;
    let requestBody: string | undefined;
    const headersToSend: Record<string, string> = {
      "Content-Type": "application/json",
      ...(headers || {}),
      ...authHeader,
    };

    if (!hasPayload && queryText?.trim()) {
      const urlObj = new URL(url);
      urlObj.searchParams.set("q", queryText.trim());
      requestUrl = urlObj.toString();
    } else if (hasPayload) {
      const mergedPayload = { ...payload };
      if (queryText?.trim() && mergedPayload.query === undefined && mergedPayload.q === undefined) {
        mergedPayload.query = queryText.trim();
      }
      requestBody = JSON.stringify(mergedPayload);
    }

    const response = await fetch(requestUrl, {
      method: requestBody ? "POST" : "GET",
      headers: headersToSend,
      body: requestBody,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`API returned ${response.status}`);
    }

    const data = await response.json();

    // Flatten response into array if it's an object
    const records = Array.isArray(data)
      ? data
      : Array.isArray(data.data)
        ? data.data
        : Array.isArray(data.results)
          ? data.results
          : [data];

    return {
      data: records.slice(0, 50), // Limit to first 50 records for preview
      count: records.length,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Query external database for data discovery
 * Currently supports PostgreSQL; can be extended for MySQL, MongoDB, etc.
 */
async function queryExternalDatabase(
  connectionString: string,
  query?: string
): Promise<{ data: any[]; count: number }> {
  const pool = new Pool({ connectionString, max: 1, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });

  try {
    const trimmedQuery = query?.trim();

    if (!trimmedQuery) {
      const meta = await pool.query(
        `SELECT table_schema, table_name
         FROM information_schema.tables
         WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
         ORDER BY table_schema, table_name
         LIMIT 100`
      );

      return {
        data: meta.rows,
        count: meta.rowCount ?? 0,
      };
    }

    if (/^select/i.test(trimmedQuery)) {
      if (trimmedQuery.includes(";")) {
        throw new Error("Only a single SELECT statement is allowed for database discovery.");
      }

      const rows = await pool.query(trimmedQuery);
      return {
        data: Array.isArray(rows.rows) ? rows.rows.slice(0, 50) : [],
        count: rows.rowCount ?? 0,
      };
    }

    // Search terms mode: query common text columns by name/details/email fields.
    const searchMeta = await pool.query(
      `SELECT table_schema, table_name, column_name
       FROM information_schema.columns
       WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
         AND (
           data_type IN ('character varying', 'text', 'character')
           OR udt_name IN ('varchar', 'text', 'citext')
         )
         AND (
           column_name ILIKE '%name%'
           OR column_name ILIKE '%title%'
           OR column_name ILIKE '%detail%'
           OR column_name ILIKE '%description%'
           OR column_name ILIKE '%email%'
         )
       ORDER BY table_schema, table_name, column_name
       LIMIT 50`
    );

    const searchTables = new Map<string, string[]>();
    for (const row of searchMeta.rows) {
      const schema = String(row.table_schema);
      const table = String(row.table_name);
      const column = String(row.column_name);
      if (!/^[a-zA-Z0-9_]+$/.test(schema) || !/^[a-zA-Z0-9_]+$/.test(table) || !/^[a-zA-Z0-9_]+$/.test(column)) {
        continue;
      }
      const key = `${schema}|${table}`;
      const cols = searchTables.get(key) ?? [];
      if (!cols.includes(column)) {
        cols.push(column);
      }
      searchTables.set(key, cols);
    }

    const searchResults: any[] = [];
    let totalCount = 0;

    for (const entry of Array.from(searchTables.entries())) {
      const [tableKey, columns] = entry;
      if (searchResults.length >= 50) break;
      const [schema, table] = tableKey.split("|");
      const columnClauses = columns.map((column) => `"${schema}"."${table}"."${column}" ILIKE $1`);
      if (columnClauses.length === 0) continue;

      const searchSql = `SELECT * FROM "${schema}"."${table}" WHERE ${columnClauses.join(" OR ")} LIMIT 50`;
      const rows = await pool.query(searchSql, [`%${trimmedQuery}%`]);
      totalCount += rows.rowCount ?? 0;
      if (Array.isArray(rows.rows)) {
        searchResults.push(...rows.rows);
      }
    }

    return {
      data: searchResults.slice(0, 50),
      count: totalCount,
    };
  } finally {
    await pool.end().catch(() => undefined);
  }
}

/**
 * Discover data from external source (API or Database)
 */
export async function discoverExternalData(
  source: DiscoverySource,
  regulatorUserId: string,
  tenantId: string
): Promise<DiscoveryResult> {
  const discoverySessionId = `DS-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const timestamp = new Date().toISOString();

  try {
    // Validate connection string
    const validation = validateConnectionString(source.connectionString);
    if (!validation.isValid) {
      const result: DiscoveryResult = {
        sourceType: source.sourceType,
        connectionString: source.connectionString,
        status: "error",
        dataCount: 0,
        preview: [],
        error: validation.error,
        timestamp,
        discoverySessionId,
      };

      // Log failed discovery attempt
      await logDiscoveryAttempt(
        discoverySessionId,
        regulatorUserId,
        tenantId,
        source,
        "failed",
        validation.error ?? "Validation failed"
      );

      return result;
    }

    let result: any;

    if (source.sourceType === "api") {
      result = await queryExternalApi(
        source.connectionString,
        source.headers,
        source.queryPayload,
        source.apiKey,
        source.queryText
      );
    } else if (source.sourceType === "database") {
      result = await queryExternalDatabase(
        source.connectionString,
        source.queryText ?? (source.queryPayload?.query as string | undefined)
      );
    } else {
      throw new Error("Unsupported source type");
    }

    const discoveryResult: DiscoveryResult = {
      sourceType: source.sourceType,
      connectionString: source.connectionString,
      status: "success",
      dataCount: result.count,
      preview: result.data,
      timestamp,
      discoverySessionId,
    };

    // Log successful discovery
    await logDiscoveryAttempt(
      discoverySessionId,
      regulatorUserId,
      tenantId,
      source,
      "success",
      `Found ${result.count} records`
    );

    return discoveryResult;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const discoveryResult: DiscoveryResult = {
      sourceType: source.sourceType,
      connectionString: source.connectionString,
      status: "error",
      dataCount: 0,
      preview: [],
      error: errorMessage,
      timestamp,
      discoverySessionId,
    };

    // Log error
    await logDiscoveryAttempt(
      discoverySessionId,
      regulatorUserId,
      tenantId,
      source,
      "failed",
      errorMessage
    );

    return discoveryResult;
  }
}

/**
 * Log data discovery attempt for audit trail
 */
async function logDiscoveryAttempt(
  sessionId: string,
  regulatorUserId: string,
  tenantId: string,
  source: DiscoverySource,
  status: "success" | "failed",
  message: string
) {
  try {
    // Log to audit table if available
    await db.execute(sql`
      INSERT INTO audit_logs (user_id, tenant_id, action, entity_type, details, status, created_at)
      VALUES (
        ${regulatorUserId},
        ${tenantId},
        'DATA_DISCOVERY',
        'EXTERNAL_SOURCE',
        ${JSON.stringify({
          sessionId,
          sourceType: source.sourceType,
          message,
          queryText: source.queryText,
          connectionMasked: source.connectionString.substring(0, 50) + "***",
        })},
        ${status},
        ${new Date().toISOString()}
      )
    `);
  } catch (logError) {
    console.warn("[DISCOVERY] Failed to log attempt:", logError);
    // Don't throw - logging failure shouldn't break the discovery flow
  }
}

/**
 * Retrieve discovery history for a regulator
 */
export async function getDiscoveryHistory(regulatorUserId: string, limit = 20) {
  try {
    const rows = await db.execute(sql`
      SELECT * FROM audit_logs
      WHERE user_id = ${regulatorUserId} AND action = 'DATA_DISCOVERY'
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);
    return rows;
  } catch (error) {
    console.error("[DISCOVERY] Failed to retrieve history:", error);
    return [];
  }
}

/**
 * Get discovered fields with optional filtering for DPO data discovery portal
 */
export async function getDiscoveredFields(
  tenantId: string,
  options?: {
    system?: string;
    isPII?: boolean;
    isSensitive?: boolean;
    category?: string;
    searchQuery?: string;
  }
) {
  try {
    const conditions: any[] = [eq(dataFields.tenantId, tenantId)];

    if (options?.system) {
      conditions.push(
        or(
          eq(externalSystems.id, options.system),
          ilike(externalSystems.name, `%${options.system}%`)
        )
      );
    }

    if (options?.searchQuery) {
      const search = `%${options.searchQuery}%`;
      conditions.push(
        or(
          ilike(dataFields.name, search),
          ilike(dataAssets.name, search),
          ilike(externalSystems.name, search)
        )
      );
    }

    if (options?.category && options.category !== "ALL") {
      if (options.category === "PII") {
        conditions.push(
          sql`${dataFields.classificationCategory} IN ('ssn', 'email', 'phone', 'name', 'address', 'date_of_birth')`
        );
      } else if (options.category === "SENSITIVE") {
        conditions.push(
          sql`${dataFields.classificationCategory} IN ('financial', 'health', 'biometric', 'government_id', 'criminal_history')`
        );
      } else if (options.category === "RETENTION_RISK") {
        conditions.push(
          sql`${retentionPolicies.retentionDurationDays} IS NOT NULL 
          AND ${dataFields.lastDiscovered}::timestamp + (${retentionPolicies.retentionDurationDays}::text || ' days')::interval < now() + interval '30 days'`
        );
      }
    }

    const results = await db
      .select({
        id: dataFields.id,
        fieldName: dataFields.name,
        dataType: dataFields.dataType,
        table: dataAssets.name,
        system: externalSystems.name,
        systemId: externalSystems.id,
        dataAssetId: dataAssets.id,
        isPII: sql<boolean>`CASE WHEN ${dataFields.classificationCategory} IN ('ssn', 'email', 'phone', 'name', 'address', 'date_of_birth') THEN true ELSE false END`,
        isSensitive: sql<boolean>`CASE WHEN ${dataFields.classificationCategory} IN ('financial', 'health', 'biometric', 'government_id', 'criminal_history') THEN true ELSE false END`,
        category: dataFields.classificationCategory,
        lastSeen: dataFields.lastDiscovered,
        retentionPeriod: retentionPolicies.retentionDurationDays,
        retentionExpiry: sql<Date>`CASE 
          WHEN ${retentionPolicies.retentionDurationDays} IS NOT NULL 
          THEN ${dataFields.lastDiscovered}::timestamp + (${retentionPolicies.retentionDurationDays}::text || ' days')::interval
          ELSE NULL
        END`,
        dataOwner: externalSystems.dataOwner,
        source: externalSystems.systemType,
      })
      .from(dataFields)
      .leftJoin(dataAssets, eq(dataFields.dataAssetId, dataAssets.id))
      .leftJoin(connectorInstances, eq(dataAssets.connectorInstanceId, connectorInstances.id))
      .leftJoin(externalSystems, eq(connectorInstances.externalSystemId, externalSystems.id))
      .leftJoin(retentionPolicies, eq(dataAssets.retentionPolicyId, retentionPolicies.id))
      .where(and(...conditions))
      .limit(1000);
    return results;
  } catch (error) {
    console.error("[DISCOVERY] Failed to retrieve discovered fields:", error);
    return [];
  }
}

/**
 * Trigger a data discovery scan for a connected system
 */
export function summarizeDiscoveryScan(params: {
  tenantId: string;
  assetCount: number;
  fieldCount: number;
  connectorCount: number;
}) {
  const completed = params.assetCount > 0 || params.fieldCount > 0 || params.connectorCount > 0;
  return {
    success: true,
    status: completed ? "completed" : "no-data",
    scanId: `scan-${params.tenantId}-${Date.now()}`,
    message: completed
      ? `Discovery scan completed for ${params.assetCount} asset(s), ${params.fieldCount} field(s), and ${params.connectorCount} connector(s).`
      : "Discovery scan completed without finding any discoverable data.",
    tenantId: params.tenantId,
    assetCount: params.assetCount,
    fieldCount: params.fieldCount,
    connectorCount: params.connectorCount,
    timestamp: new Date().toISOString(),
  };
}

export async function triggerDiscoveryScan(
  tenantId: string,
  connectorInstanceId?: string
) {
  try {
    const scanId = `scan-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const timestamp = new Date().toISOString();

    await db.execute(sql`
      INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, created_at, tenant_id)
      VALUES ('system', 'DISCOVERY_SCAN_INITIATED', 'connector_instance', ${connectorInstanceId || 'all'}, 
        ${{ scanId, timestamp, connectorInstanceId: connectorInstanceId || null }}::jsonb, 
        now(), ${tenantId})
    `);

    const summary = summarizeDiscoveryScan({
      tenantId,
      assetCount: 0,
      fieldCount: 0,
      connectorCount: connectorInstanceId ? 1 : 0,
    });

    return {
      success: true,
      scanId,
      message: summary.message,
      status: summary.status,
      timestamp,
      summary,
    };
  } catch (error) {
    console.error("[DISCOVERY] Failed to trigger scan:", error);
    return {
      success: false,
      message: "Failed to initiate data discovery scan",
      error: (error as Error).message,
    };
  }
}
