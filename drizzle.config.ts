import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5444/storage_db";

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  strict: false,
  dbCredentials: {
    url: databaseUrl,
  },
});
