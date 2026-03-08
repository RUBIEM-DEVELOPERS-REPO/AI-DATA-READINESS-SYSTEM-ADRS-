import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, boolean, jsonb, timestamp, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const batchStatusEnum = pgEnum("batch_status", [
  "PENDING", "IN_PROGRESS", "COMPLETED", "FAILED"
]);

export const evidenceStatusEnum = pgEnum("evidence_status", [
  "INGESTED", "PROCESSING", "PROCESSED", "FAILED"
]);

export const validationStatusEnum = pgEnum("validation_status", [
  "PENDING_EXTRACTION", "PENDING_VALIDATION", "APPROVED", "REJECTED", "NEEDS_RESCAN", "ESCALATED"
]);

export const entityTypeEnum = pgEnum("entity_type", [
  "PERSON", "ORGANIZATION", "DOCUMENT", "TRANSACTION", "ASSET"
]);

export const datasetStatusEnum = pgEnum("dataset_status", [
  "DRAFT", "PUBLISHED", "ARCHIVED"
]);

export const sourceTypeEnum = pgEnum("source_type", [
  "SCAN", "SHAREPOINT", "GOOGLE_DRIVE", "EMAIL", "FTP", "ERP", "DATABASE"
]);

export const docTypeEnum = pgEnum("doc_type", [
  "INVOICE", "CONTRACT", "REPORT", "PERMIT", "IDENTITY", "FINANCIAL", "CORRESPONDENCE", "OTHER"
]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
});

export const batches = pgTable("batches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  batchCode: varchar("batch_code").notNull().unique(),
  sourceLocation: text("source_location").notNull(),
  status: batchStatusEnum("status").notNull().default("PENDING"),
  expectedDocuments: integer("expected_documents").notNull().default(0),
  scannedDocuments: integer("scanned_documents").notNull().default(0),
  createdBy: text("created_by").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const evidenceFiles = pgTable("evidence_files", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  evidenceCode: varchar("evidence_code").notNull().unique(),
  batchId: varchar("batch_id").references(() => batches.id),
  fileName: text("file_name").notNull(),
  fileFormat: text("file_format").notNull(),
  fileSizeBytes: integer("file_size_bytes").notNull().default(0),
  fileHash: text("file_hash").notNull(),
  sourceType: sourceTypeEnum("source_type").notNull(),
  sourceReference: text("source_reference"),
  status: evidenceStatusEnum("status").notNull().default("INGESTED"),
  immutabilityStatus: text("immutability_status").notNull().default("LOCKED"),
  storedUri: text("stored_uri").notNull(),
  pageCount: integer("page_count").notNull().default(1),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  uploadedBy: text("uploaded_by").notNull(),
  tags: text("tags").array(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const extractionRuns = pgTable("extraction_runs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  evidenceId: varchar("evidence_id").references(() => evidenceFiles.id).notNull(),
  docType: docTypeEnum("doc_type").notNull(),
  docTypeConfidence: real("doc_type_confidence").notNull().default(0),
  ocrConfidence: real("ocr_confidence").notNull().default(0),
  extractionConfidence: real("extraction_confidence").notNull().default(0),
  completenessScore: real("completeness_score").notNull().default(0),
  consistencyScore: real("consistency_score").notNull().default(0),
  docQualityScore: real("doc_quality_score").notNull().default(0),
  trustScore: real("trust_score").notNull().default(0),
  trustScoreBreakdown: jsonb("trust_score_breakdown"),
  extractedFields: jsonb("extracted_fields"),
  extractedEntities: jsonb("extracted_entities"),
  extractedTables: jsonb("extracted_tables"),
  // NEW: normalized attributes with per-field metadata
  extractedAttributes: jsonb("extracted_attributes"),
  rawText: text("raw_text"),
  modelVersion: text("model_version").notNull().default("v1.0"),
  processingTimeMs: integer("processing_time_ms").notNull().default(0),
  // NEW: quality gate results
  qualityGatesPassed: boolean("quality_gates_passed").notNull().default(true),
  qualityGatesReport: jsonb("quality_gates_report"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const validationTasks = pgTable("validation_tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  taskCode: varchar("task_code").notNull().unique(),
  extractionRunId: varchar("extraction_run_id").references(() => extractionRuns.id).notNull(),
  evidenceId: varchar("evidence_id").references(() => evidenceFiles.id).notNull(),
  status: validationStatusEnum("status").notNull().default("PENDING_VALIDATION"),
  assignedTo: text("assigned_to"),
  fieldsToValidate: text("fields_to_validate").array(),
  validatorNotes: text("validator_notes"),
  approvalStage: integer("approval_stage").notNull().default(1),
  maxApprovalStages: integer("max_approval_stages").notNull().default(1),
  trustScore: real("trust_score").notNull().default(0),
  // NEW: policy-based gating metadata
  approvalPolicyRule: text("approval_policy_rule"),
  approvalPolicyReason: text("approval_policy_reason"),
  weakFields: jsonb("weak_fields"),
  validatedAt: timestamp("validated_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const cdmEntities = pgTable("cdm_entities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityCode: varchar("entity_code").notNull().unique(),
  entityType: entityTypeEnum("entity_type").notNull(),
  displayName: text("display_name").notNull(),
  canonicalFields: jsonb("canonical_fields").notNull(),
  // NEW: identifiers linked to this entity (emails, phones, IDs)
  identifiers: jsonb("identifiers"),
  // NEW: relationships to other entities
  relationships: jsonb("relationships"),
  sourceEvidenceIds: text("source_evidence_ids").array(),
  goldenRecordId: varchar("golden_record_id"),
  mergedFromIds: text("merged_from_ids").array(),
  isGoldenRecord: boolean("is_golden_record").notNull().default(false),
  confidenceScore: real("confidence_score").notNull().default(0),
  schemaVersion: text("schema_version").notNull().default("1.0"),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const publishedDatasets = pgTable("published_datasets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  datasetCode: varchar("dataset_code").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  version: text("version").notNull().default("1.0.0"),
  status: datasetStatusEnum("status").notNull().default("DRAFT"),
  recordCount: integer("record_count").notNull().default(0),
  entityTypes: text("entity_types").array(),
  formats: text("formats").array(),
  qualityScore: real("quality_score").notNull().default(0),
  lineageInfo: jsonb("lineage_info"),
  datasetCard: jsonb("dataset_card"),
  // NEW: multi-artifact URIs (ML, KG, RAG, bundle)
  artifactUris: jsonb("artifact_uris"),
  // NEW: actual artifact content for demonstration
  artifactContents: jsonb("artifact_contents"),
  // NEW: quality gates applied before publishing
  qualityGates: jsonb("quality_gates"),
  publishedBy: text("published_by"),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const auditLogs = pgTable("audit_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  userId: text("user_id").notNull(),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertBatchSchema = createInsertSchema(batches).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEvidenceSchema = createInsertSchema(evidenceFiles).omit({ id: true, createdAt: true, updatedAt: true });
export const insertExtractionRunSchema = createInsertSchema(extractionRuns).omit({ id: true, createdAt: true });
export const insertValidationTaskSchema = createInsertSchema(validationTasks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCdmEntitySchema = createInsertSchema(cdmEntities).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDatasetSchema = createInsertSchema(publishedDatasets).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export const insertUserSchema = createInsertSchema(users).pick({ username: true, password: true });

export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;
export type Batch = typeof batches.$inferSelect;
export type InsertBatch = z.infer<typeof insertBatchSchema>;
export type EvidenceFile = typeof evidenceFiles.$inferSelect;
export type InsertEvidenceFile = z.infer<typeof insertEvidenceSchema>;
export type ExtractionRun = typeof extractionRuns.$inferSelect;
export type InsertExtractionRun = z.infer<typeof insertExtractionRunSchema>;
export type ValidationTask = typeof validationTasks.$inferSelect;
export type InsertValidationTask = z.infer<typeof insertValidationTaskSchema>;
export type CdmEntity = typeof cdmEntities.$inferSelect;
export type InsertCdmEntity = z.infer<typeof insertCdmEntitySchema>;
export type PublishedDataset = typeof publishedDatasets.$inferSelect;
export type InsertDataset = z.infer<typeof insertDatasetSchema>;
export type AuditLog = typeof auditLogs.$inferSelect;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

// ─── Normalized Attribute type used in extractedAttributes ───────────────────
export interface NormalizedAttribute {
  field_key: string;
  subject_type: "DOCUMENT" | "PARTY" | "OBJECT" | "EVENT";
  value_raw: string;
  value_normalized: string;
  normalized_value_type: "string" | "number" | "date" | "datetime" | "phone" | "email" | "currency" | "boolean";
  normalization_status: "SUCCESS" | "FAILED" | "SKIPPED";
  normalization_error?: string;
  confidence_score: number;
  validation_state: "AUTO_APPROVED" | "PENDING" | "APPROVED" | "REJECTED";
  approval_policy_rule?: string;
  approval_policy_reason?: string;
  evidence_pointer?: string;
}

// ─── Multi-artifact dataset types ────────────────────────────────────────────
export interface DatasetArtifactUris {
  ml?: string;
  kg_entities?: string;
  kg_identifiers?: string;
  kg_edges?: string;
  rag_chunks?: string;
  bundle_zip?: string;
}

export interface MlFeatureRow {
  entity_id: string;
  entity_type: string;
  display_name: string;
  confidence_score: number;
  [key: string]: any;
}

export interface KgEntityRow {
  entity_id: string;
  entity_type: string;
  display_name: string;
  golden_record_id?: string;
  is_golden_record: boolean;
  fields: Record<string, any>;
  identifiers: any[];
  evidence_ids: string[];
}

export interface KgEdgeRow {
  edge_id: string;
  source_entity_id: string;
  target_entity_id: string;
  relationship_type: string;
  confidence: number;
  evidence_id?: string;
}

export interface RagChunkRow {
  chunk_id: string;
  text: string;
  evidence_id: string;
  page_number?: number;
  document_title?: string;
  linked_entity_ids: string[];
  trust_score: number;
  validation_state: string;
}

export interface DatasetCard {
  schema_version: string;
  dataset_version: string;
  dataset_code: string;
  name: string;
  description?: string;
  generated_at: string;
  lineage: {
    source_batches: string[];
    source_evidence_ids: string[];
    pipeline_version: string;
    extraction_model_version: string;
  };
  quality_metrics: {
    total_records: number;
    avg_confidence: number;
    avg_trust_score: number;
    approved_pct: number;
    pending_pct: number;
    normalization_success_pct: number;
  };
  validation_summary: {
    total_attributes: number;
    auto_approved: number;
    human_approved: number;
    pending: number;
    rejected: number;
  };
  artifacts: {
    ml_features?: { rows: number; columns: string[] };
    kg_entities?: { count: number };
    kg_edges?: { count: number };
    rag_chunks?: { count: number; avg_chunk_length: number };
  };
  approvals?: Array<{ role: string; user: string; timestamp: string }>;
}
