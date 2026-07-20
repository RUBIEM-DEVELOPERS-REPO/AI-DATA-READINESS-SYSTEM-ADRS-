/**
 * queue.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IntelliNexus Job Queue — Re-export Shim
 *
 * GAP-002 FIX: The authoritative implementation has moved to
 * server/services/persistent-queue.ts which selects the backend
 * (in-memory vs PostgreSQL) via JOB_QUEUE_BACKEND environment variable.
 *
 * This file is preserved as a backward-compatible re-export so that existing
 * imports throughout the codebase continue to work without modification.
 */

export {
  jobQueue,
  JobQueue,
  InMemoryJobQueue,
  PgJobQueue,
  type JobRecord,
  type JobStatus,
  type JobQueueMetrics,
  type JobQueueRetryOptions,
  type IJobQueue,
} from "./services/persistent-queue";
