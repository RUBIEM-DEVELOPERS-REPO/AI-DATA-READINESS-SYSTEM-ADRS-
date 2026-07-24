/**
 * api/index.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Vercel Serverless Function Entry Point
 *
 * This file is the single Vercel serverless handler that wraps the entire
 * Express application. Vercel routes all /api/*, /healthz, /readyz, and
 * /metrics requests here via vercel.json rewrites.
 *
 * How it works:
 *  - On first invocation, `startServer({ skipListen: true })` initialises the
 *    app (DB connection, session, middleware, routes) without binding a port.
 *  - Subsequent invocations reuse the warm instance — Vercel keeps the
 *    function process alive between requests in the same region.
 *  - The Express `app` is handed the raw req/res from Vercel's Node.js runtime,
 *    so all existing middleware, CORS, rate-limiting, and CSRF work unchanged.
 *
 * Vercel constraints addressed:
 *  - No `httpServer.listen()` call (handled by skipListen flag)
 *  - No persistent WebSocket connections (handled by Ably adapter in websocket.ts)
 *  - File uploads streamed to Cloudflare R2 (handled by OBJECT_STORE_BACKEND=s3)
 *  - Long-running AI jobs use QStash / persistent PG queue (no timeout risk)
 */

import type { IncomingMessage, ServerResponse } from "http";

// The Express app and startServer are exported from server/index.ts
import { app, startServer } from "../server/index";

// ─── One-time initialisation ─────────────────────────────────────────────────

let initialised = false;
let initialisationError: Error | null = null;

/**
 * Lazily initialise the Express app on the first request.
 * Subsequent calls in a warm instance are instant no-ops.
 */
async function ensureInitialised(): Promise<void> {
  if (initialised) {
    if (initialisationError) throw initialisationError;
    return;
  }

  try {
    await startServer({ skipListen: true });
    initialised = true;
  } catch (err) {
    initialisationError = err instanceof Error ? err : new Error(String(err));
    throw initialisationError;
  }
}

// ─── Vercel Handler ───────────────────────────────────────────────────────────

export default async function handler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    await ensureInitialised();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Initialisation failed";
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: message, code: "INIT_FAILED" }));
    return;
  }

  // Delegate to Express — it handles routing, middleware, and response writing
  (app as any)(req, res);
}
