import "./env";
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import { pathToFileURL } from "url";
import { setupSession } from "./auth";
import { validateRuntimeConfig } from "./config";
import { waitForDatabaseConnection } from "./db";
import { getHealthSnapshot, getMetricsSummary, metrics } from "./observability";
import { validateProductionSecrets } from "./secrets-manager";
import { csrfMiddleware } from "./csrf";
import { initAiProviderConfig } from "./services/ai-provider";
import { initTelemetry, correlationIdMiddleware } from "./telemetry";

export function setupGracefulShutdown(server: ReturnType<typeof createServer>) {
  let shuttingDown = false;

  const shutdown = (signal: NodeJS.Signals) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log(`received ${signal}; shutting down gracefully`, "shutdown");

    server.close((err) => {
      if (err) {
        console.error("Graceful shutdown failed", err);
        process.exitCode = 1;
      } else {
        log("server closed gracefully", "shutdown");
      }
      process.exit();
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("unhandledRejection", (reason) => {
    console.error("Unhandled Rejection:", reason);
    shutdown("SIGTERM");
  });
  process.on("uncaughtException", (error) => {
    console.error("Uncaught Exception:", error);
    shutdown("SIGTERM");
  });
}

import { createRequestLogger } from "./logger";

export const app = express();
export const httpServer = createServer(app);
app.disable("x-powered-by");
app.use(createRequestLogger());

// Public host used to rewrite outgoing Location headers when the hosting proxy
// rewrites or exposes internal backend addresses. Configure via
// `PUBLIC_HOST=https://your-public-host.example` or it will fallback to
// the first entry in ALLOWED_ORIGINS from the environment.
const publicHost =
  process.env.PUBLIC_HOST || (process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean)[0] || "";

// Middleware to rewrite outgoing Location headers and `res.redirect()` targets
// so they reference the external public host instead of internal addresses
// like https://127.0.0.1:5001 which cPanel's proxy may inject.
app.use((req, res, next) => {
  const origSetHeader = res.setHeader.bind(res);
  res.setHeader = (name: string, value: any) => {
    if (typeof name === "string" && name.toLowerCase() === "location" && typeof value === "string" && publicHost) {
      let v = value as string;
      // replace common internal forms with the public host
      v = v.replace(/https?:\/\/(?:127\.0\.0\.1|localhost)(:\d+)?/gi, publicHost.replace(/\/$/, ""));
      v = v.replace(/https?:\/\/127\.0\.0\.1:\d+/gi, publicHost.replace(/\/$/, ""));
      return origSetHeader(name, v);
    }
    return origSetHeader(name, value);
  };

  const origRedirect = res.redirect.bind(res);
  res.redirect = (...args: any[]) => {
    if (typeof args[0] === "string" && publicHost) {
      let target = args[0] as string;
      target = target.replace(/https?:\/\/(?:127\.0\.0\.1|localhost)(:\d+)?/gi, publicHost.replace(/\/$/, ""));
      args[0] = target;
    }
    // @ts-ignore - keep original signature
    return origRedirect(...args);
  };

  next();
});

const runtimeConfig = validateRuntimeConfig();

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

const allowHttpOrigins = process.env.ALLOW_HTTP_ORIGINS === "true";

if (runtimeConfig.isProduction && !allowHttpOrigins) {
  app.set("trust proxy", 1);
  app.use((req, res, next) => {
    const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim().toLowerCase();
    const isSecure = Boolean(req.secure || forwardedProto === "https");
    if (!isSecure) {
      const host = req.headers.host;
      if (!host) {
        return res.status(400).json({ error: "HTTPS required", code: "HTTPS_REQUIRED" });
      }
      return res.redirect(301, `https://${host}${req.url}`);
    }
    next();
  });
}

import { applySecurityHeaders, createRateLimiter, createCorsMiddleware } from "./security";

app.use(createCorsMiddleware(runtimeConfig.allowedOrigins));
app.use(applySecurityHeaders);
// In development Vite HMR fires 20+ requests on each hot-reload; use a higher
// limit so those bursts don't exhaust the rate-limiter window.
const rateLimitMax = runtimeConfig.isProduction ? 150 : 2000;
app.use(createRateLimiter({ windowMs: 15 * 60 * 1000, maxRequests: rateLimitMax }));

app.use(
  express.json({
    limit: "10mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false, limit: "10mb" }));

import { logger } from "./logger";

export function log(message: string, source = "express") {
  logger.info(message, { source });
}

app.get("/healthz", async (_req, res) => {
  const snapshot = await getHealthSnapshot();
  res.status(snapshot.ready ? 200 : 503).json(snapshot);
});

app.get("/readyz", async (_req, res) => {
  const snapshot = await getHealthSnapshot();
  res.status(snapshot.ready ? 200 : 503).json(snapshot);
});

// GAP-008 FIX: /metrics now returns Prometheus exposition format
app.get("/metrics", async (_req, res) => {
  const { contentType, metrics: metricsText } = await metrics.getPrometheusMetrics();
  res.setHeader("Content-Type", contentType);
  res.send(metricsText);
});

// Legacy JSON metrics summary (for internal dashboards)
app.get("/metrics/json", async (_req, res) => {
  const summary = await getMetricsSummary();
  res.json(summary);
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

export interface StartServerOptions {
  /**
   * When true, the server is fully initialised (DB, middleware, routes) but
   * does NOT bind a TCP port. Used by the Vercel serverless entry point
   * (api/index.ts) where Vercel manages the HTTP layer.
   */
  skipListen?: boolean;
}

export async function startServer(opts: StartServerOptions = {}) {
  // GAP-007: Initialize OpenTelemetry before anything else
  await initTelemetry();

  // Validate secrets at start to fail-fast in production if weak credentials exist
  validateProductionSecrets();

  // GAP-007: Attach correlation ID middleware early in the chain
  app.use(correlationIdMiddleware);

  await waitForDatabaseConnection();
  await initAiProviderConfig();
  await setupSession(app);

  // CSRF middleware must be loaded after session setup
  app.use(csrfMiddleware);

  await registerRoutes(httpServer, app);

  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    const logFn = req.log ? req.log.error.bind(req.log) : logger.error.bind(logger);
    logFn("Internal Server Error", { error: err.message || err, stack: err.stack, status });

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // Importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes.
  // On Vercel (skipListen=true), static files are served by the CDN layer —
  // serveStatic() is not needed and would interfere with the serverless handler.
  if (!opts.skipListen) {
    if (process.env.NODE_ENV === "production") {
      serveStatic(app);
    } else {
      const { setupVite } = await import("./vite");
      await setupVite(httpServer, app);
    }
  }

  // Skip port binding when running inside a Vercel serverless function.
  // Vercel manages the HTTP layer; we only need the initialised Express app.
  if (opts.skipListen) {
    log("running in serverless mode — skipping port binding");
    return;
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = runtimeConfig.port;
  const host = runtimeConfig.host;
  httpServer.listen(
    {
      port,
      host,
    },
    () => {
      log(`serving on port ${port}`);
      setupGracefulShutdown(httpServer);
    },
  );
}

function isDirectInvocation(): boolean {
  if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
    return true;
  }
  if (process.argv[1]) {
    try {
      return pathToFileURL(process.argv[1]).href === import.meta.url;
    } catch {
      return false;
    }
  }
  return false;
}

if (isDirectInvocation()) {
  startServer({ skipListen: false }).catch((err) => {
    console.error("Failed to start server:", err);
    process.exit(1);
  });
}

