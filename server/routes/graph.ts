import { Router } from "express";
import { requireAuth, requireRole } from "../auth";
import { db } from "../db";
import { kgNodes, kgEdges } from "@shared/schema";
import { syncLiveKnowledgeGraph, getRegulatorActivities, getRegulatorAuditLogs, getRegulatorComplianceStatus, getRegulatorProcessingRecords, getRegulatorZkpProofs, getRegulatorTeeAttestations, getRegulatorLedgerEvents, getRegulatorFederatedSessions } from "../compliance";
import { isRegulatorDiscoveryEnabled, isSafeRemoteUrl } from "../security";
import { Pool } from "pg";

const router = Router();

// ─── Live Knowledge Graph ───────────────────────────────────────────────────
router.get("/graph/live", requireAuth, async (req: any, res: any) => {
  try {
    const nodes = await db.select().from(kgNodes).limit(1000);
    const edges = await db.select().from(kgEdges);

    const nodeIds = new Set(nodes.map(n => n.id));
    const validEdges = edges.filter(e => nodeIds.has(e.sourceId) && nodeIds.has(e.targetId));

    const graphData = {
      nodes: nodes.map(n => ({
        id: n.id,
        name: n.displayName,
        val: n.confidenceScore * 10,
        group: n.label,
        properties: n.properties,
      })),
      links: validEdges.map(e => ({
        source: e.sourceId,
        target: e.targetId,
        name: e.relationshipType,
        properties: e.properties,
      }))
    };

    res.json(graphData);
  } catch (err) {
    console.error("Live graph error:", err);
    res.status(500).json({ error: "Failed to fetch live graph" });
  }
});

router.post("/graph/sync", requireAuth, requireRole("ADMIN"), async (req: any, res: any) => {
  try {
    syncLiveKnowledgeGraph()
      .then(() => console.log("[GRAPH SYNC] background sync complete"))
      .catch((err) => console.error("[GRAPH SYNC] background error", err));
    res.json({ message: "Live Graph Synchronisation triggered." });
  } catch (err) {
    res.status(500).json({ error: "Failed to trigger sync" });
  }
});

// ─── Regulator Portal Supervisor Endpoints ─────────────────────────────────
router.get('/regulator/activities', requireAuth, requireRole('REGULATOR'), async (_req: any, res: any) => {
  try { res.json(await getRegulatorActivities()); } catch (e) { console.error(e); res.status(500).json({ error: 'Failed' }); }
});

router.get('/regulator/audit-logs', requireAuth, requireRole('REGULATOR'), async (_req: any, res: any) => {
  try { res.json(await getRegulatorAuditLogs()); } catch (e) { console.error(e); res.status(500).json({ error: 'Failed' }); }
});

router.get('/regulator/compliance-status', requireAuth, requireRole('REGULATOR'), async (_req: any, res: any) => {
  try { res.json(await getRegulatorComplianceStatus()); } catch (e) { console.error(e); res.status(500).json({ error: 'Failed' }); }
});

router.get('/regulator/processing-records', requireAuth, requireRole('REGULATOR'), async (_req: any, res: any) => {
  try { res.json(await getRegulatorProcessingRecords()); } catch (e) { console.error(e); res.status(500).json({ error: 'Failed' }); }
});

router.get('/regulator/zkp-proofs', requireAuth, requireRole('REGULATOR'), async (_req: any, res: any) => {
  try { res.json(await getRegulatorZkpProofs()); } catch (e) { console.error(e); res.status(500).json({ error: 'Failed' }); }
});

router.get('/regulator/tee-attestations', requireAuth, requireRole('REGULATOR'), async (_req: any, res: any) => {
  try { res.json(await getRegulatorTeeAttestations()); } catch (e) { console.error(e); res.status(500).json({ error: 'Failed' }); }
});

router.get('/regulator/ledger-events', requireAuth, requireRole('REGULATOR'), async (_req: any, res: any) => {
  try { res.json(await getRegulatorLedgerEvents()); } catch (e) { console.error(e); res.status(500).json({ error: 'Failed' }); }
});

router.get('/regulator/federated-sessions', requireAuth, requireRole('REGULATOR'), async (_req: any, res: any) => {
  try { res.json(await getRegulatorFederatedSessions()); } catch (e) { console.error(e); res.status(500).json({ error: 'Failed' }); }
});

router.post('/regulator/discovery', requireAuth, requireRole('REGULATOR'), async (req: any, res: any) => {
  if (!isRegulatorDiscoveryEnabled()) {
    return res.status(403).json({ error: 'Regulator discovery is disabled in this environment.' });
  }

  try {
    const { sourceUrl, query } = req.body || {};
    if (!sourceUrl || typeof sourceUrl !== 'string') {
      return res.status(400).json({ error: 'sourceUrl is required and must be a string' });
    }
    const trimmedUrl = sourceUrl.trim();

    if (/^https?:\/\//i.test(trimmedUrl)) {
      if (!isSafeRemoteUrl(trimmedUrl)) {
        return res.status(400).json({ error: 'Only public HTTPS URLs are allowed for remote discovery.' });
      }

      const fetchOptions: any = { method: query ? 'POST' : 'GET', headers: { Accept: 'application/json' } };
      if (query) {
        fetchOptions.headers['Content-Type'] = 'application/json';
        fetchOptions.body = JSON.stringify({ query });
      }

      const upstream = await fetch(trimmedUrl, fetchOptions);
      if (!upstream.ok) {
        const upstreamText = await upstream.text().catch(() => upstream.statusText);
        return res.status(502).json({ error: `Remote API returned ${upstream.status}: ${upstreamText}` });
      }

      const contentType = upstream.headers.get('content-type') || '';
      const payload = contentType.includes('application/json') ? await upstream.json() : await upstream.text();
      return res.json({ source: 'api', url: trimmedUrl, status: upstream.status, contentType, payload });
    }

    if (/^postgres(?:ql)?:\/\//i.test(trimmedUrl)) {
      try {
        const parsed = new URL(trimmedUrl);
        if (!parsed.hostname || !isSafeRemoteUrl(trimmedUrl)) {
          return res.status(400).json({ error: 'Database source URLs must target a public host.' });
        }
      } catch {
        return res.status(400).json({ error: 'Invalid database URL.' });
      }

      if (query && typeof query !== 'string') {
        return res.status(400).json({ error: 'query must be a string when provided' });
      }

      const pool = new Pool({ connectionString: trimmedUrl, max: 1, idleTimeoutMillis: 10000, connectionTimeoutMillis: 10000 });
      try {
        if (!query || !query.trim()) {
          const meta = await pool.query(
            `SELECT table_schema, table_name FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY table_schema, table_name;`
          );
          return res.json({ source: 'database', dbType: 'postgresql', metadata: { tables: meta.rows } });
        }

        const safeQuery = query.trim();
        if (!safeQuery.toLowerCase().startsWith('select')) {
          return res.status(400).json({ error: 'Only SELECT queries are allowed against database sources' });
        }
        const rows = await pool.query(safeQuery);
        return res.json({ source: 'database', dbType: 'postgresql', rowCount: rows.rowCount, rows: Array.isArray(rows.rows) ? rows.rows.slice(0, 100) : rows.rows });
      } finally {
        await pool.end().catch(() => undefined);
      }
    }

    return res.status(400).json({ error: 'Unsupported source. Paste a valid HTTP(s) API URL or PostgreSQL connection string.' });
  } catch (err: any) {
    console.error('Regulator discovery error:', err);
    res.status(500).json({ error: err?.message || 'Failed to perform discovery' });
  }
});

export default router;
