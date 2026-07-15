#!/usr/bin/env node
/*
 Generic orphan-detection script for Postgres.
 Usage: set DATABASE_URL (or PGHOST/PGUSER/etc.) and run:
   node scripts/find_orphans.js

 Output: prints JSON summary of foreign-key orphans and soft-delete anomalies.
*/

const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function getForeignKeys(client) {
  const q = `
    SELECT
      tc.table_schema,
      tc.table_name,
      kcu.column_name AS fk_column,
      ccu.table_schema AS foreign_table_schema,
      ccu.table_name AS foreign_table_name,
      ccu.column_name AS foreign_column_name
    FROM information_schema.table_constraints AS tc
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
    WHERE constraint_type = 'FOREIGN KEY' AND tc.table_schema NOT IN ('pg_catalog','information_schema');
  `;
  const res = await client.query(q);
  return res.rows;
}

async function findOrphans(client, fk) {
  const childSchema = fk.table_schema;
  const childTable = fk.table_name;
  const childCol = fk.fk_column;
  const parentSchema = fk.foreign_table_schema;
  const parentTable = fk.foreign_table_name;
  const parentCol = fk.foreign_column_name;
  const sql = `SELECT count(*)::int AS orphan_count FROM "${childSchema}"."${childTable}" c LEFT JOIN "${parentSchema}"."${parentTable}" p ON c."${childCol}" = p."${parentCol}" WHERE p."${parentCol}" IS NULL`;
  const r = await client.query(sql);
  const count = r.rows[0].orphan_count;
  const sample = [];
  if (count > 0) {
    const sampleSql = `SELECT c.* FROM "${childSchema}"."${childTable}" c LEFT JOIN "${parentSchema}"."${parentTable}" p ON c."${childCol}" = p."${parentCol}" WHERE p."${parentCol}" IS NULL LIMIT 10`;
    const s = await client.query(sampleSql);
    sample.push(...s.rows);
  }
  return { count, sample };
}

async function findSoftDeleteAnomalies(client) {
  // find columns that look like soft-delete flags
  const q = `
    SELECT table_schema, table_name, column_name
    FROM information_schema.columns
    WHERE (column_name ILIKE 'is_deleted' OR column_name ILIKE 'deleted_at' OR column_name ILIKE 'is_active')
      AND table_schema NOT IN ('pg_catalog','information_schema')
  `;
  const res = await client.query(q);
  const groups = {};
  for (const row of res.rows) {
    const key = `${row.table_schema}.${row.table_name}`;
    groups[key] = groups[key] || [];
    groups[key].push(row.column_name);
  }

  const anomalies = [];
  for (const key of Object.keys(groups)) {
    const [schema, table] = key.split('.');
    for (const col of groups[key]) {
      let count = 0;
      try {
        if (col.toLowerCase().includes('deleted_at')) {
          const r = await client.query(`SELECT count(*)::int AS n FROM "${schema}"."${table}" WHERE "${col}" IS NOT NULL`);
          count = r.rows[0].n;
        } else {
          // assume boolean
          const r = await client.query(`SELECT count(*)::int AS n FROM "${schema}"."${table}" WHERE "${col}" = true`);
          count = r.rows[0].n;
        }
      } catch (e) {
        // ignore per-table errors
        continue;
      }
      anomalies.push({ schema, table, column: col, count });
    }
  }
  return anomalies;
}

async function main() {
  const client = await pool.connect();
  try {
    console.log('Connected to DB, scanning foreign keys...');
    const fks = await getForeignKeys(client);
    const fkReports = [];
    for (const fk of fks) {
      const report = await findOrphans(client, fk);
      if (report.count > 0) {
        fkReports.push({ fk, orphan_count: report.count, sample: report.sample });
      }
    }

    console.log(`Found ${fkReports.length} foreign-key relationships with orphaned child rows.`);
    if (fkReports.length > 0) console.log(JSON.stringify(fkReports, null, 2));

    console.log('Scanning for soft-delete columns and anomalies...');
    const soft = await findSoftDeleteAnomalies(client);
    console.log(`Found ${soft.length} tables with soft-delete-like columns.`);
    if (soft.length > 0) console.log(JSON.stringify(soft, null, 2));

    console.log('\nSummary:');
    console.log(`FK-orphaned relationships: ${fkReports.length}`);
    console.log(`Tables with soft-delete columns: ${soft.length}`);

    if (fkReports.length === 0 && soft.length === 0) console.log('No immediate issues detected (DB scan).');
  } catch (err) {
    console.error('Error during DB scan:', err.message || err);
    process.exitCode = 2;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
