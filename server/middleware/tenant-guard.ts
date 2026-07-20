/**
 * tenant-guard.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IntelliNexus Multi-Tenant Isolation Middleware
 *
 * Architectural Principle: MULTI-TENANCY — Every request MUST carry Tenant
 * Context. This middleware extracts the tenantId from the authenticated
 * session and attaches a TenantContext object to `req.tenantContext`.
 *
 * Apply this middleware after `requireAuth` on any router that accesses
 * tenant-scoped data. It enforces that:
 *   1. A tenantId is present on the authenticated session.
 *   2. The tenantId cannot be overridden by the client body/query params.
 *   3. All downstream handlers receive a strongly-typed TenantContext.
 *
 * Architecture Compliance:
 *   ✅ Multi-tenant: isolates by tenantId from session
 *   ✅ Stateless: no in-memory state, reads from session per-request
 *   ✅ Zero Trust: fails closed — denies if tenantId is missing
 *   ✅ Observable: attaches tenantId to res.locals for logging
 */

import type { Request, Response, NextFunction } from "express";

// ─── TenantContext ─────────────────────────────────────────────────────────

export interface TenantContext {
  /** The primary tenant identifier — scopes all database queries */
  tenantId: string;
  /** The authenticated user's role */
  role: string;
  /** The authenticated user's ID */
  userId: string;
  /** Optional workspace sub-scope within a tenant */
  workspaceId?: string;
  /** Subscription tier for feature-flag evaluation */
  subscriptionTier?: string;
  /** Data jurisdiction / region for compliance routing */
  jurisdiction?: string;
}

// ─── Module augmentation — attach to Express Request ──────────────────────

declare global {
  namespace Express {
    interface Request {
      tenantContext: TenantContext;
    }
  }
}

// ─── Middleware ────────────────────────────────────────────────────────────

/**
 * requireTenantContext
 *
 * Must be applied after `requireAuth`. Extracts the TenantContext from the
 * authenticated session user and attaches it to req.tenantContext.
 *
 * Fails with 401 if authentication is missing.
 * Fails with 403 if the session has no tenantId (configuration error).
 */
export function requireTenantContext(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const user = req.user as any;

  if (!user) {
    res.status(401).json({
      error: "Authentication required",
      code: "UNAUTHENTICATED",
    });
    return;
  }

  const tenantId = user.tenantId as string | undefined;

  if (!tenantId) {
    // This indicates a misconfigured user account — fail closed.
    res.status(403).json({
      error: "Tenant context missing from session. Contact your administrator.",
      code: "TENANT_CONTEXT_MISSING",
    });
    return;
  }

  const context: TenantContext = {
    tenantId,
    role: user.role ?? "VIEWER",
    userId: user.id,
    workspaceId: user.workspaceId ?? undefined,
    subscriptionTier: user.subscriptionTier ?? "standard",
    jurisdiction: user.jurisdiction ?? undefined,
  };

  // Attach to request for downstream handlers
  req.tenantContext = context;

  // Expose to response locals for logging middleware
  res.locals["tenantId"] = tenantId;
  res.locals["userId"] = user.id;

  next();
}

/**
 * extractTenantContext
 *
 * Non-failing variant: extracts TenantContext if available, otherwise sets a
 * safe default. Use only on routes where tenant isolation is optional (e.g.,
 * public routes that still benefit from tenant-scoped logging).
 */
export function extractTenantContext(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const user = req.user as any;

  if (user?.tenantId) {
    req.tenantContext = {
      tenantId: user.tenantId,
      role: user.role ?? "VIEWER",
      userId: user.id,
      subscriptionTier: user.subscriptionTier ?? "standard",
    };
  }

  next();
}
