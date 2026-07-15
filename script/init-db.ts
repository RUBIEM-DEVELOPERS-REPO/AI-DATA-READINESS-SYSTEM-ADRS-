import pg from "pg";
import { execSync } from "child_process";
import * as dotenv from "dotenv";
dotenv.config();

async function init() {
  // Ensure portal databases exist: DPO and Regulator
  const targets = [
    { env: 'DPO_DATABASE_URL', defaultName: 'dpo_db' },
    { env: 'REGULATOR_DATABASE_URL', defaultName: 'regulator_db' }
  ];

  for (const t of targets) {
    const url = (process.env as any)[t.env] || process.env.DATABASE_URL;
    if (!url) {
      console.warn(`No URL configured for ${t.env} and no fallback DATABASE_URL; skipping creation.`);
      continue;
    }

    let dbName = t.defaultName;
    try {
      const urlObj = new URL(url);
      dbName = urlObj.pathname.substring(1) || t.defaultName;
      urlObj.pathname = "/postgres";
      const pgUrl = urlObj.toString();

      console.log(`Checking if database '${dbName}' exists for ${t.env}...`);
      const pool = new pg.Pool({ connectionString: pgUrl });
      const client = await pool.connect();
      try {
        const res = await client.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
        if (res.rowCount === 0) {
          console.log(`Database '${dbName}' does not exist. Creating...`);
          await client.query(`CREATE DATABASE ${dbName}`);
          console.log(`Database '${dbName}' created successfully.`);
        } else {
          console.log(`Database '${dbName}' already exists.`);
        }
      } finally {
        client.release();
        await pool.end();
      }
    } catch (err: any) {
      console.error(`Error checking/creating database '${dbName}':`, err.message || err);
    }
  }

  // Run DPO compliance migrations then regulator migrations
  console.log("Running DPO compliance migrations...");
  const dpoMigrationScripts = [
    "script/migrate-compliance.ts",
    "script/migrate-compliance-v2.ts",
    "script/migrate-compliance-v3.ts",
    "script/migrate-compliance-v4.ts"
  ];

  for (const script of dpoMigrationScripts) {
    console.log(`Executing: npx tsx ${script}`);
    try {
      execSync(`npx tsx ${script}`, { stdio: "inherit" });
      console.log(`✓ Completed: ${script}`);
    } catch (err: any) {
      console.error(`Error running migration ${script}:`, err.message || err);
      process.exit(1);
    }
  }

  console.log("Running Regulator-specific migrations...");
  try {
    execSync(`npx tsx script/migrate-regulator.ts`, { stdio: "inherit" });
    console.log("✓ Completed: script/migrate-regulator.ts");
  } catch (err: any) {
    console.error("Error running regulator migration:", err.message || err);
    process.exit(1);
  }
  
  console.log("All DPO and Data Regulator Portal migrations completed successfully!");
}

init().catch(err => {
  console.error("Initialization failed:", err);
  process.exit(1);
});
