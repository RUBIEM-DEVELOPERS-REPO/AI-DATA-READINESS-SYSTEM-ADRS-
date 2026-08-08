import { defineConfig } from "drizzle-kit";
export default defineConfig({
  out: ".local/drizzle-full/migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  strict: false,
  dbCredentials: { url: "postgresql://postgres:postgres@localhost:5444/storage_db" },
});
