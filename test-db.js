import pkg from 'pg';
const { Client } = pkg;

const urls = [
  "postgresql://postgres:password@localhost:5432/postgres",
  "postgresql://postgres@localhost:5432/postgres",
  "postgresql://postgres:Admin@12345!@localhost:5432/postgres",
];

async function test() {
  for (const url of urls) {
    console.log(`Testing: ${url}`);
    const client = new Client({ connectionString: url });
    try {
      await client.connect();
      console.log(`SUCCESS: Connected to ${url}`);
      await client.end();
      process.exit(0);
    } catch (e) {
      console.log(`FAILED: ${e.message}`);
    }
  }
  process.exit(1);
}

test();
