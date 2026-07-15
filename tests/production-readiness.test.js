import test from "node:test";
import assert from "node:assert/strict";
import { summarizeDiscoveryScan } from "../server/services/data-discovery.ts";
import { deriveComplianceSummary } from "../server/services/federated-audit.ts";

test("summarizeDiscoveryScan produces a completed summary with the discovered counts", () => {
  const result = summarizeDiscoveryScan({
    tenantId: "tenant-001",
    assetCount: 3,
    fieldCount: 12,
    connectorCount: 2,
  });

  assert.equal(result.success, true);
  assert.equal(result.status, "completed");
  assert.equal(result.assetCount, 3);
  assert.equal(result.fieldCount, 12);
  assert.equal(result.connectorCount, 2);
  assert.match(result.message, /completed/i);
});

test("deriveComplianceSummary returns all conditions satisfied when no failures are reported", () => {
  const summary = deriveComplianceSummary(["data_minimisation", "retention_control"], []);

  assert.equal(summary.allConditionsSatisfied, true);
  assert.deepEqual(summary.failedConditions, []);
});

test("deriveComplianceSummary reports unmet conditions when failures are provided", () => {
  const summary = deriveComplianceSummary(["data_minimisation", "retention_control"], ["retention_control"]);

  assert.equal(summary.allConditionsSatisfied, false);
  assert.deepEqual(summary.failedConditions, ["retention_control"]);
});
