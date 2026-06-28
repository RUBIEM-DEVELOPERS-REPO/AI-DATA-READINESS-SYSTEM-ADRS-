import type { Express } from "express";
import { requireAuth, requireRole } from "./auth";
import { listDataControllers, createDataController, listProcessingRecords, createProcessingRecord } from "./services/registry";

function handleRouteError(res: any, error: any) {
  console.error(error);
  const status = error?.status || 500;
  const message = error?.message || "Failed";
  res.status(status).json({ error: message, code: status === 400 ? "BAD_REQUEST" : status === 401 ? "UNAUTHENTICATED" : status === 403 ? "FORBIDDEN" : status === 404 ? "NOT_FOUND" : "INTERNAL_ERROR" });
}

export function registerRegistryRoutes(app: Express) {
  app.get('/api/registry/controllers', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try {
      const tenantId = (req.user as any)?.tenantId || "TENANT-001";
      res.json(await listDataControllers(tenantId));
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  app.post('/api/registry/controllers', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try {
      const tenantId = (req.user as any)?.tenantId || "TENANT-001";
      const created = await createDataController(req.body, tenantId);
      res.status(201).json(created);
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  app.get('/api/registry/processing-records', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try {
      const tenantId = (req.user as any)?.tenantId || "TENANT-001";
      res.json(await listProcessingRecords(tenantId));
    } catch (e) {
      handleRouteError(res, e);
    }
  });

  app.post('/api/registry/processing-records', requireAuth, requireRole('DATA_CONTROLLER'), async (req: any, res: any) => {
    try {
      const tenantId = (req.user as any)?.tenantId || "TENANT-001";
      const created = await createProcessingRecord(req.body, tenantId);
      res.status(201).json(created);
    } catch (e) {
      handleRouteError(res, e);
    }
  });
}
