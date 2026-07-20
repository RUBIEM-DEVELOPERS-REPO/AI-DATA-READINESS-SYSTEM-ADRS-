import { waitForDatabaseConnection } from "../server/db";

async function main() {
  try {
    await waitForDatabaseConnection(60, 2000);
    console.log("Database ready");
    process.exit(0);
  } catch (error) {
    console.error("Database not ready", error);
    process.exit(1);
  }
}

void main();
