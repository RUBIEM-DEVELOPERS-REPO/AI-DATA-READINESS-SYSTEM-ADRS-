import test from "node:test";
import assert from "node:assert/strict";
import { validateRuntimeConfig } from "../server/config";

test("validateRuntimeConfig rejects wildcard origins in production", () => {
  const original = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    SESSION_SECRET: process.env.SESSION_SECRET,
    DEFAULT_TENANT: process.env.DEFAULT_TENANT,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  };

  process.env.NODE_ENV = "production";
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5444/storage_db";
  process.env.SESSION_SECRET = "secret";
  process.env.DEFAULT_TENANT = "TENANT-001";
  process.env.ALLOWED_ORIGINS = "https://app.example.com, *";

  let threw = false;
  try {
    validateRuntimeConfig();
  } catch (err: any) {
    threw = true;
    assert.match(err.message, /ALLOWED_ORIGINS must not include wildcard '\*' in production/);
  }

  assert.equal(threw, true);

  process.env.NODE_ENV = original.NODE_ENV;
  process.env.DATABASE_URL = original.DATABASE_URL;
  process.env.SESSION_SECRET = original.SESSION_SECRET;
  process.env.DEFAULT_TENANT = original.DEFAULT_TENANT;
  process.env.ALLOWED_ORIGINS = original.ALLOWED_ORIGINS;
});

test("validateRuntimeConfig normalizes HTTPS origins", () => {
  const original = {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    SESSION_SECRET: process.env.SESSION_SECRET,
    DEFAULT_TENANT: process.env.DEFAULT_TENANT,
    ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  };

  process.env.NODE_ENV = "production";
  process.env.DATABASE_URL = "postgresql://postgres:postgres@localhost:5444/storage_db";
  process.env.SESSION_SECRET = "secret";
  process.env.DEFAULT_TENANT = "TENANT-001";
  process.env.ALLOWED_ORIGINS = "https://app.example.com:5000 , https://api.example.com";

  const config = validateRuntimeConfig();
  assert.deepEqual(config.allowedOrigins, ["https://app.example.com:5000", "https://api.example.com"]);

  process.env.NODE_ENV = original.NODE_ENV;
  process.env.DATABASE_URL = original.DATABASE_URL;
  process.env.SESSION_SECRET = original.SESSION_SECRET;
  process.env.DEFAULT_TENANT = original.DEFAULT_TENANT;
  process.env.ALLOWED_ORIGINS = original.ALLOWED_ORIGINS;
});
