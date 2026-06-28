import pkg from 'pg';
const { Client } = pkg;
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5444/storage_db';
const client = new Client({ connectionString });

try {
  await client.connect();

  const queries = [
    "SELECT relname, relkind, oid, relnamespace::regnamespace::text AS schema FROM pg_class WHERE relname = 'session_pkey' OR relname = 'session' OR relname LIKE 'session_%' ORDER BY relname;",
    "SELECT conname, contype, conrelid::regclass AS rel, pg_get_constraintdef(oid) AS def, connamespace::regnamespace::text AS schema FROM pg_constraint WHERE conname = 'session_pkey' OR conname LIKE 'session_%' ORDER BY conname;",
    "SELECT table_schema, table_name FROM information_schema.tables WHERE table_name = 'session' OR table_name LIKE 'session_%' ORDER BY table_schema, table_name;",
    "SELECT table_schema, table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'session' OR table_name LIKE 'session_%' ORDER BY table_schema, table_name, ordinal_position;",
    "SELECT con.oid, con.conname, con.contype, con.conrelid::regclass AS relname, con.connamespace::regnamespace::text AS schema, pg_get_constraintdef(con.oid) AS def FROM pg_constraint con WHERE conname = 'session_pkey';",
    "SELECT c.oid, c.relname, c.relkind, c.relnamespace::regnamespace::text AS schema FROM pg_class c WHERE c.relname = 'data_controllers';",
    "SELECT table_schema, table_name, column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'data_controllers' ORDER BY ordinal_position;"
  ];

  for (const sql of queries) {
    const res = await client.query(sql);
    console.log('SQL:', sql);
    console.log(JSON.stringify(res.rows, null, 2));
  }
} catch (err) {
  console.error('ERROR', err);
} finally {
  await client.end();
}
