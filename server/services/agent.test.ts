import test from "node:test";
import assert from "node:assert/strict";
import { buildDeterministicOrchestrationPlan } from "./agent";

test("buildDeterministicOrchestrationPlan creates a validation action for recent extraction activity", () => {
  const plan = buildDeterministicOrchestrationPlan({
    taskId: "valid.prioritize_queue",
    layer: "validation",
    mode: "DRY_RUN",
    stats: {
      evidenceFiles: 4,
      extractionRuns: 3,
      validationTasks: 2,
      cdmEntities: 7,
      chunkEmbeddings: 6,
      kgNodes: 11,
      kgEdges: 9,
      publishedDatasets: 1,
    },
    candidateExtractionRun: { id: "run-42", evidenceId: "ev-42" },
  });

  assert.equal(plan.actions.length, 2);
  assert.equal(plan.actions[0].type, "CREATE_VALIDATION_TASK");
  assert.equal(plan.actions[0].payload.extractionRunId, "run-42");
  assert.equal(plan.actions[0].payload.evidenceId, "ev-42");
  assert.equal(plan.actions[1].type, "TRIGGER_KG_SYNC");
});
