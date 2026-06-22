import { sql, relations } from "drizzle-orm";
import { pgTable, text, varchar, integer, real, boolean, jsonb, timestamp, pgEnum, customType } from "drizzle-orm/pg-core";
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
  "SCAN", "SHAREPOINT", "GOOGLE_DRIVE", "EMAIL", "FTP", "ERP", "DATABASE", "RECORDING", "DEVICE"
]);

export const docTypeEnum = pgEnum("doc_type", [
  "INVOICE", "QUOTATION", "PURCHASE_ORDER", "RECEIPT",
  "CONTRACT", "AGREEMENT", "LEASE", "DEED",
  "REPORT", "FINANCIAL", "BANK_STATEMENT", "PAYSLIP",
  "PERMIT", "CERTIFICATE", "LICENSE",
  "IDENTITY", "CV", "FORM", "POLICY",
  "CORRESPONDENCE", "MEMORANDUM",
  "OTHER",
  "AUDIO_RECORDING", "VIDEO_RECORDING", "INTERVIEW", "MEETING_RECORDING"
]);

// Media type for A/V evidence
export const mediaTypeEnum = pgEnum("media_type", [
  "DOCUMENT", "IMAGE", "AUDIO", "VIDEO"
]);

// ─── Vector Type Definition ──────────────────────────────────────────────────
export const vector = customType<{ data: number[]; driverData: string }>({
  dataType() {
    return 'vector(1536)'; // Standard for OpenAI text-embedding-3-small
  },
  toDriver(value: number[]): string {
    return JSON.stringify(value);
  },
});

// ─── ExtractionText — deduplicated text store, one row per extraction run ─────
export const extractionTexts = pgTable("extraction_texts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  evidenceId: varchar("evidence_id").notNull(),
  extractionRunId: varchar("extraction_run_id").notNull(),
  pageNumber: integer("page_number"),
  text: text("text").notNull(),
  charCount: integer("char_count").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── RBAC Role Enum ────────────────────────────────────────────────────────
export const userRoleEnum = pgEnum("user_role", [
  "SUPER_ADMIN",    // Full system access + user management
  "ADMIN",          // Tenant-level admin, manage users/batches
  "ANALYST",        // Upload evidence, run extraction, publish datasets
  "REVIEWER",       // HITL validation only
  "VIEWER",         // Read-only access to published datasets
]);

export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  email: text("email").notNull().unique(),
  password: text("password").notNull(),
  firstName: text("first_name").notNull().default(""),
  lastName: text("last_name").notNull().default(""),
  role: userRoleEnum("role").notNull().default("VIEWER"),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  isActive: boolean("is_active").notNull().default(true),
  mustChangePassword: boolean("must_change_password").notNull().default(false),
  lastLoginAt: timestamp("last_login_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
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
  // A/V support
  mediaType: mediaTypeEnum("media_type").default("DOCUMENT"),
  durationSeconds: integer("duration_seconds"),
  mediaMetadata: jsonb("media_metadata"),
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
  // Reference to deduplicated text store — use ?include_text=true to hydrate rawText
  extractionTextId: varchar("extraction_text_id"),
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
  conflictDetails: jsonb("conflict_details"),
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
  identifiers: jsonb("identifiers"),
  relationships: jsonb("relationships"),
  sourceEvidenceIds: text("source_evidence_ids").array(),
  goldenRecordId: varchar("golden_record_id"),
  mergedFromIds: text("merged_from_ids").array(),
  isGoldenRecord: boolean("is_golden_record").notNull().default(false),
  confidenceScore: real("confidence_score").notNull().default(0),
  schemaVersion: text("schema_version").notNull().default("1.0"),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  // ── Lifecycle & quality (v2) ────────────────────────────────────────────────
  // DRAFT → CANDIDATE → GOLDEN | QUARANTINED → REJECTED | MERGED | RETIRED
  entityLifecycle: text("entity_lifecycle").notNull().default("DRAFT"),
  lifecycleReason: text("lifecycle_reason"),
  // Deterministic fingerprint: SHA-256(tenantId:entityType:evidenceId:roleKey)
  // Prevents duplicate entities on re-extractions of the same file
  entityFingerprint: text("entity_fingerprint"),
  // Contact binding audit trail — who owns which contact and why
  contactBindingAudit: jsonb("contact_binding_audit"),
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
  // Batch scope: SINGLE_BATCH (one or more specific batches) | CROSS_BATCH (all batches)
  scope: text("scope").notNull().default("CROSS_BATCH"),
  sourceBatchIds: text("source_batch_ids").array(),
  publishedBy: text("published_by"),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  publishedAt: timestamp("published_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Layer 4: AI Feature & Representation (Embeddings) ──────────────────────
export const chunkEmbeddings = pgTable("chunk_embeddings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  extractionTextId: varchar("extraction_text_id").references(() => extractionTexts.id).notNull(),
  evidenceId: varchar("evidence_id").references(() => evidenceFiles.id).notNull(),
  embedding: vector("embedding").notNull(),
  modelVersion: text("model_version").notNull().default("text-embedding-3-small"),
  tokenCount: integer("token_count").notNull().default(0),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const entityEmbeddings = pgTable("entity_embeddings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityId: varchar("entity_id").references(() => cdmEntities.id).notNull(),
  embedding: vector("embedding").notNull(),
  modelVersion: text("model_version").notNull().default("text-embedding-3-small"),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Access Request Status Enum ───────────────────────────────────────────
export const accessRequestStatusEnum = pgEnum("access_request_status", [
  "PENDING", "APPROVED", "REJECTED"
]);

export const accessRequests = pgTable("access_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  organisation: text("organisation").notNull(),
  requestedRole: userRoleEnum("requested_role").notNull(),
  reason: text("reason").notNull(),
  status: accessRequestStatusEnum("status").notNull().default("PENDING"),
  rejectionReason: text("rejection_reason"),
  reviewedBy: varchar("reviewed_by"),
  reviewedAt: timestamp("reviewed_at"),
  tempPassword: text("temp_password"),
  createdUserId: varchar("created_user_id"),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const systemConfig = pgTable("system_config", {
  key: text("key").primaryKey(),
  value: text("value"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  updatedBy: varchar("updated_by"),
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

// ─── Layer 7: Knowledge Graph (Live Graph) ──────────────────────────────────

export const kgNodes = pgTable("kg_nodes", {
  id: varchar("id").primaryKey(), // Using entityCode as the node ID
  label: varchar("label").notNull(), // e.g. "PARTY", "DOCUMENT", "TRANSACTION"
  displayName: text("display_name").notNull(),
  properties: jsonb("properties").default({}),
  confidenceScore: real("confidence_score").notNull().default(0),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const kgEdges = pgTable("kg_edges", {
  id: varchar("id").primaryKey(), // Deterministic ID based on source+target+type
  sourceId: varchar("source_id").notNull().references(() => kgNodes.id, { onDelete: "cascade" }),
  targetId: varchar("target_id").notNull().references(() => kgNodes.id, { onDelete: "cascade" }),
  relationshipType: text("relationship_type").notNull(),
  confidence: real("confidence").notNull().default(0),
  properties: jsonb("properties").default({}),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const kgNodesRelations = relations(kgNodes, ({ many }) => ({
  outgoingEdges: many(kgEdges, { relationName: "sourceNode" }),
  incomingEdges: many(kgEdges, { relationName: "targetNode" }),
}));

export const kgEdgesRelations = relations(kgEdges, ({ one }) => ({
  source: one(kgNodes, { fields: [kgEdges.sourceId], references: [kgNodes.id], relationName: "sourceNode" }),
  target: one(kgNodes, { fields: [kgEdges.targetId], references: [kgNodes.id], relationName: "targetNode" }),
}));

export const insertAccessRequestSchema = createInsertSchema(accessRequests).omit({ id: true, createdAt: true, updatedAt: true });

export const insertExtractionTextSchema = createInsertSchema(extractionTexts).omit({ id: true, createdAt: true });
export const insertBatchSchema = createInsertSchema(batches).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEvidenceSchema = createInsertSchema(evidenceFiles).omit({ id: true, createdAt: true, updatedAt: true });
export const insertExtractionRunSchema = createInsertSchema(extractionRuns).omit({ id: true, createdAt: true });
export const insertValidationTaskSchema = createInsertSchema(validationTasks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCdmEntitySchema = createInsertSchema(cdmEntities).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDatasetSchema = createInsertSchema(publishedDatasets).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true, lastLoginAt: true });
export const insertChunkEmbeddingSchema = createInsertSchema(chunkEmbeddings).omit({ id: true, createdAt: true });
export const insertEntityEmbeddingSchema = createInsertSchema(entityEmbeddings).omit({ id: true, createdAt: true });

// Zod schema for registration form (client-side validation)
export const registerSchema = z.object({
  username: z.string().min(3, "Username must be at least 3 characters").max(50).regex(/^[a-z0-9_]+$/, "Lowercase letters, numbers, underscores only"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Must contain an uppercase letter")
    .regex(/[0-9]/, "Must contain a number")
    .regex(/[^a-zA-Z0-9]/, "Must contain a special character"),
  confirmPassword: z.string(),
  firstName: z.string().min(1, "First name is required").max(100),
  lastName: z.string().min(1, "Last name is required").max(100),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "ANALYST", "REVIEWER", "VIEWER"]).default("ANALYST"),
}).refine(d => d.password === d.confirmPassword, { message: "Passwords do not match", path: ["confirmPassword"] });

export const loginSchema = z.object({
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});

export type AccessRequest = typeof accessRequests.$inferSelect;
export type InsertAccessRequest = z.infer<typeof insertAccessRequestSchema>;
export type ExtractionText = typeof extractionTexts.$inferSelect;
export type InsertExtractionText = z.infer<typeof insertExtractionTextSchema>;
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
export type ChunkEmbedding = typeof chunkEmbeddings.$inferSelect;
export type InsertChunkEmbedding = z.infer<typeof insertChunkEmbeddingSchema>;
export type EntityEmbedding = typeof entityEmbeddings.$inferSelect;
export type InsertEntityEmbedding = z.infer<typeof insertEntityEmbeddingSchema>;
export type KgNode = typeof kgNodes.$inferSelect;
export type KgEdge = typeof kgEdges.$inferSelect;

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
  kg_graph?: string;
  kg_entities?: string;
  kg_identifiers?: string;
  kg_edges?: string;
  rag_chunks?: string;
  bundle_zip?: string;
}

export interface MlFeatureRow {
  entity_id: string;
  entity_type: string;
  confidence_score: number;
  is_golden_record: number;
  schema_version: string;
  source_evidence_count: number;
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

export interface KgGraphRecord {
  record_type: "NODE" | "EDGE";
  id: string;
  label?: string;
  type_label?: string;
  from?: string;
  to?: string;
  properties: Record<string, any>;
  provenance: {
    evidence_ids: string[];
    confidence: number;
    provenance_quality: "HIGH" | "MEDIUM" | "LOW";
    dataset_version_id?: string;
  };
}

export interface RagChunkRow {
  chunk_id: string;
  text: string;
  evidence_id: string;
  page_number?: number;
  document_title?: string;
  linked_entity_ids: string[];
  trust_score: number;
  validation_state: "VALIDATED" | "PARTIALLY_VALIDATED" | "UNVALIDATED";
  chunk_type?: string;
  language?: string;
  span_start?: number;
  span_end?: number;
  contains_pii?: boolean;
  redaction_status?: "REDACTED" | "INTERNAL_RAW" | "INTERNAL_STRUCTURED";
  provenance_quality?: "HIGH" | "MEDIUM" | "LOW";
  is_boilerplate?: boolean;
}

export interface ArtifactQualityGates {
  ml: { passed: boolean; row_count: number; issues: string[] };
  kg: { passed: boolean; node_count: number; edge_count: number; issues: string[] };
  rag: { passed: boolean; chunk_count: number; issues: string[] };
  overall_passed: boolean;
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
    ml_features?: { rows: number; columns: string[]; feature_count: number };
    kg_graph?: { node_count: number; edge_count: number };
    kg_entities?: { count: number };
    kg_edges?: { count: number };
    rag_chunks?: { count: number; avg_chunk_length: number; validated_pct: number };
  };
  quality_gates?: ArtifactQualityGates;
  approvals?: Array<{ role: string; user: string; timestamp: string }>;
}

// ─── Conflict detail structures (shared between server and client) ────────────
export interface ConflictOption {
  value: string;
  confidence: number;
  source_field: string;
}

export interface ConflictDetail {
  field_key: string;
  options: ConflictOption[];
  chosen_value: string;       // auto-selected (highest confidence)
  resolved?: boolean;
  resolved_value?: string;
  resolved_source?: "option_a" | "option_b" | "custom";
  resolved_by?: string;
  resolved_at?: string;
}

export interface ConflictResolution {
  field_key: string;
  chosen_value: string;
  source: "option_a" | "option_b" | "custom";
}
