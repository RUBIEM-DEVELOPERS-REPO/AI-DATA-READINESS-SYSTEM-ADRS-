import pg from 'pg';

const client = new pg.Client({
  connectionString:
    process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5444/storage_db',
});

async function main() {
  try {
    await client.connect();
    await client.query(`
      CREATE TABLE IF NOT EXISTS adrs_sessions (
        sid varchar NOT NULL COLLATE "default",
        sess json NOT NULL,
        expire timestamp without time zone NOT NULL,
        CONSTRAINT adrs_sessions_pkey PRIMARY KEY (sid)
      );
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS IDX_adrs_sessions_expire ON adrs_sessions(expire);
    `);
    const res = await client.query(
      "SELECT table_schema, table_name FROM information_schema.tables WHERE table_name='adrs_sessions';"
    );
    console.log(JSON.stringify(res.rows, null, 2));
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
