import test from "node:test";
import assert from "node:assert/strict";
import { requireRecentAuth } from "../server/auth";

test("allows recent authentication within the configured window", () => {
  const req: any = {
    session: { recentAuthAt: Date.now() },
    isAuthenticated() { return true; },
  };
  const res: any = {
    statusCode: 200,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.payload = payload; return this; },
  };

  let nextCalled = false;
  requireRecentAuth(15 * 60 * 1000)(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});

test("rejects stale authentication and returns a clear error", () => {
  const req: any = {
    session: { recentAuthAt: Date.now() - (16 * 60 * 1000) },
    isAuthenticated() { return true; },
  };
  const res: any = {
    statusCode: 200,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.payload = payload; return this; },
  };

  let nextCalled = false;
  requireRecentAuth(15 * 60 * 1000)(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.payload.code, "RECENT_AUTH_REQUIRED");
});
