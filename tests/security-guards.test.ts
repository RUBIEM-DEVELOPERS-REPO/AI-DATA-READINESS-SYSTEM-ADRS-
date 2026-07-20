import test from "node:test";
import assert from "node:assert/strict";
import { isSafeRemoteUrl, getBootstrapCredentialConfig, isBootstrapSeedingEnabled, isRegulatorDiscoveryEnabled, applySecurityHeaders, createCorsMiddleware } from "../server/security";
import { validateUploadFile } from "../server/upload";
import { setupGracefulShutdown } from "../server/index";

test("rejects localhost and private-network URLs", () => {
  assert.equal(isSafeRemoteUrl("http://127.0.0.1:8080/health"), false);
  assert.equal(isSafeRemoteUrl("https://localhost/admin"), false);
  assert.equal(isSafeRemoteUrl("http://10.0.0.5/secret"), false);
});

test("allows public HTTPS URLs", () => {
  assert.equal(isSafeRemoteUrl("https://api.example.com/data"), true);
  assert.equal(isSafeRemoteUrl("https://example.com/path?q=1"), true);
});

test("rejects insecure HTTP URLs in production", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  assert.equal(isSafeRemoteUrl("http://example.com"), false);
  assert.equal(isSafeRemoteUrl("http://subdomain.example.com/path"), false);

  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

test("uses env-driven bootstrap credentials only when provided", () => {
  const originalUsername = process.env.BOOTSTRAP_ADMIN_USERNAME;
  const originalPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  delete process.env.BOOTSTRAP_ADMIN_USERNAME;
  delete process.env.BOOTSTRAP_ADMIN_PASSWORD;

  const config = getBootstrapCredentialConfig();
  assert.equal(config.username, undefined);
  assert.equal(config.password, undefined);

  process.env.BOOTSTRAP_ADMIN_USERNAME = "ops";
  process.env.BOOTSTRAP_ADMIN_PASSWORD = "S3curePass!";
  const configured = getBootstrapCredentialConfig();
  assert.equal(configured.username, "ops");
  assert.equal(configured.password, "S3curePass!");

  if (originalUsername === undefined) delete process.env.BOOTSTRAP_ADMIN_USERNAME;
  else process.env.BOOTSTRAP_ADMIN_USERNAME = originalUsername;

  if (originalPassword === undefined) delete process.env.BOOTSTRAP_ADMIN_PASSWORD;
  else process.env.BOOTSTRAP_ADMIN_PASSWORD = originalPassword;
});

test("disables bootstrap seeding by default in production and allows explicit opt-in", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalSeed = process.env.SEED_DEMO_USERS;
  const originalExplicit = process.env.ENABLE_BOOTSTRAP_SEEDING;

  process.env.NODE_ENV = "production";
  delete process.env.SEED_DEMO_USERS;
  delete process.env.ENABLE_BOOTSTRAP_SEEDING;
  assert.equal(isBootstrapSeedingEnabled(), false);

  process.env.ENABLE_BOOTSTRAP_SEEDING = "true";
  assert.equal(isBootstrapSeedingEnabled(), true);

  process.env.NODE_ENV = "development";
  delete process.env.ENABLE_BOOTSTRAP_SEEDING;
  assert.equal(isBootstrapSeedingEnabled(), true);

  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  if (originalSeed === undefined) delete process.env.SEED_DEMO_USERS;
  else process.env.SEED_DEMO_USERS = originalSeed;

  if (originalExplicit === undefined) delete process.env.ENABLE_BOOTSTRAP_SEEDING;
  else process.env.ENABLE_BOOTSTRAP_SEEDING = originalExplicit;
});

test("disables regulator discovery by default in production and allows explicit opt-in", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalExplicit = process.env.ALLOW_REGULATOR_DISCOVERY;

  process.env.NODE_ENV = "production";
  delete process.env.ALLOW_REGULATOR_DISCOVERY;
  assert.equal(isRegulatorDiscoveryEnabled(), false);

  process.env.ALLOW_REGULATOR_DISCOVERY = "true";
  assert.equal(isRegulatorDiscoveryEnabled(), true);

  process.env.NODE_ENV = "development";
  assert.equal(isRegulatorDiscoveryEnabled(), true);

  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  if (originalExplicit === undefined) delete process.env.ALLOW_REGULATOR_DISCOVERY;
  else process.env.ALLOW_REGULATOR_DISCOVERY = originalExplicit;
});

test("rejects suspicious upload filenames before they hit storage", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  const invalid = validateUploadFile({ originalname: "../evil.pdf" } as Express.Multer.File);
  assert.equal(invalid.ok, true);

  const unsupported = validateUploadFile({ originalname: "payload.exe" } as Express.Multer.File);
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.error, "Unsupported file type: .exe");

  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

test("adds production-grade security headers in production", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  const headers: Record<string, string> = {};
  const res = {
    setHeader(name: string, value: string) {
      headers[name] = value;
    },
  };
  const calls: string[] = [];
  const next = () => calls.push("next");

  applySecurityHeaders({} as any, res as any, next as any);

  assert.equal(headers["Strict-Transport-Security"], "max-age=31536000; includeSubDomains");
  assert.equal(headers["X-Frame-Options"], "DENY");
  assert.equal(headers["Content-Security-Policy"], "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; upgrade-insecure-requests");
  assert.equal(calls.length, 1);

  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;
});

test("registers graceful shutdown handlers", () => {
  const events: string[] = [];
  const server = {
    close(cb: (err?: Error) => void) {
      events.push("close");
      cb();
      return this;
    },
  } as any;

  const originalOn = process.on;
  const originalExit = process.exit;
  process.on = ((name: string, handler: (...args: any[]) => void) => {
    events.push(name);
    return process;
  }) as typeof process.on;
  process.exit = ((() => undefined) as unknown as typeof process.exit);

  setupGracefulShutdown(server);
  process.on = originalOn;
  process.exit = originalExit;

  assert.deepEqual(events, ["SIGTERM", "SIGINT", "unhandledRejection", "uncaughtException"]);
});

test("allows only configured origins with CORS middleware", () => {
  const middleware = createCorsMiddleware(["https://app.example.com"]);

  const res: any = { headers: {} };
  res.setHeader = (name: string, value: string) => {
    res.headers[name] = value;
  };
  res.sendStatus = (code: number) => {
    res.status = code;
  };

  let nextCalled = false;
  middleware({ headers: { origin: "https://app.example.com" }, method: "GET" } as any, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, true);
  assert.equal(res.headers["Access-Control-Allow-Origin"], "https://app.example.com");

  const res2: any = { headers: {} };
  res2.setHeader = (name: string, value: string) => {
    res2.headers[name] = value;
  };
  const response = { statusCode: 0, body: undefined } as any;
  res2.status = (code: number) => {
    response.statusCode = code;
    return res2;
  };
  res2.json = (body: any) => {
    response.body = body;
    return res2;
  };

  middleware({ headers: { origin: "https://evil.com" }, method: "GET" } as any, res2, () => {
    response.statusCode = 999;
  });
  assert.equal(response.statusCode, 403);
  assert.equal(response.body.code, "CORS_DENIED");
});
