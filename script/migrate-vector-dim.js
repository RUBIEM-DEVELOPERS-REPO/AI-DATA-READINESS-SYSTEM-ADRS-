/**
 * Migration: Change embedding vector dimensions from 1536 → 384
 * Needed when switching from OpenAI text-embedding-3-small to local all-MiniLM-L6-v2
 *
 * Safe to run: existing embeddings were all zero-vectors (API was failing),
 * so dropping and recreating is lossless.
 */

import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const client = await pool.connect();
  try {
    console.log('Starting vector dimension migration (1536 → 384)...\n');

    await client.query('BEGIN');

    // ── chunk_embeddings ──────────────────────────────────────────────────────
    console.log('Dropping old chunk_embeddings.embedding column (vector 1536)...');
    await client.query(`ALTER TABLE chunk_embeddings DROP COLUMN IF EXISTS embedding`);

    console.log('Adding new chunk_embeddings.embedding column (vector 384)...');
    await client.query(`ALTER TABLE chunk_embeddings ADD COLUMN embedding vector(384) NOT NULL DEFAULT array_fill(0, ARRAY[384])::vector`);

    console.log('Removing default constraint (runtime inserts will supply the value)...');
    await client.query(`ALTER TABLE chunk_embeddings ALTER COLUMN embedding DROP DEFAULT`);

    // ── entity_embeddings ─────────────────────────────────────────────────────
    console.log('\nDropping old entity_embeddings.embedding column (vector 1536)...');
    await client.query(`ALTER TABLE entity_embeddings DROP COLUMN IF EXISTS embedding`);

    console.log('Adding new entity_embeddings.embedding column (vector 384)...');
    await client.query(`ALTER TABLE entity_embeddings ADD COLUMN embedding vector(384) NOT NULL DEFAULT array_fill(0, ARRAY[384])::vector`);

    console.log('Removing default constraint...');
    await client.query(`ALTER TABLE entity_embeddings ALTER COLUMN embedding DROP DEFAULT`);

    // ── Update model_version labels ───────────────────────────────────────────
    console.log('\nUpdating model_version labels...');
    await client.query(`UPDATE chunk_embeddings SET model_version = 'all-MiniLM-L6-v2' WHERE model_version = 'text-embedding-3-small'`);
    await client.query(`UPDATE entity_embeddings SET model_version = 'all-MiniLM-L6-v2' WHERE model_version = 'text-embedding-3-small'`);

    await client.query('COMMIT');

    // Verify
    const { rows } = await client.query(`
      SELECT column_name, udt_name, character_maximum_length
      FROM information_schema.columns
      WHERE table_name IN ('chunk_embeddings', 'entity_embeddings')
        AND column_name = 'embedding'
    `);
    console.log('\nVerification — embedding columns after migration:');
    console.table(rows);

    console.log('\n✅ Migration complete! Vector dimension is now 384 (all-MiniLM-L6-v2).');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ Migration failed — rolled back:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
