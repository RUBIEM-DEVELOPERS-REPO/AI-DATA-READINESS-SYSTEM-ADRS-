
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
    return 'vector(384)'; // all-MiniLM-L6-v2 local transformer (384-dim)
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
  "DATA_CONTROLLER", // Oversees data controller responsibilities and inventory
  "DATA_PROTECTION_OFFICER", // Compliance and privacy governance
  "ANALYST",        // Upload evidence, run extraction, publish datasets
  "REVIEWER",       // HITL validation only
  "VIEWER",         // Read-only access to published datasets
  "REGULATOR",      // Read-only supervisor with regulator visibility
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
  // Compliance metadata
  processingPurpose: text("processing_purpose"),
  lawfulBasis: text("lawful_basis"),
  dataCategories: text("data_categories").array().default([]),
  sensitivityLabels: text("sensitivity_labels").array().default([]),
  retentionPolicy: jsonb("retention_policy"),
  controllerId: text("controller_id"),
  processorId: text("processor_id"),
  complianceFlags: jsonb("compliance_flags"),
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
  // Compliance metadata
  regulatoryPurpose: text("regulatory_purpose"),
  dataCategories: text("data_categories").array(),
  sensitivityRating: text("sensitivity_rating"),
  policyViolations: jsonb("policy_violations"),
  aiProvenance: jsonb("ai_provenance"),
  processingActivity: jsonb("processing_activity"),
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
  policyRule: text("policy_rule"),
  policyOutcome: text("policy_outcome"),
  regulatorEscalation: boolean("regulator_escalation").notNull().default(false),
  complianceNotes: text("compliance_notes"),
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
  // Compliance metadata
  dataControllerId: text("data_controller_id"),
  dataProcessorId: text("data_processor_id"),
  sensitiveDataCategories: text("sensitive_data_categories").array(),
  classification: text("classification"),
  processingActivities: jsonb("processing_activities"),
  complianceFlags: jsonb("compliance_flags"),
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
  // Compliance metadata
  complianceStatus: text("compliance_status").notNull().default("UNKNOWN"),
  retentionStatus: text("retention_status"),
  processingActivities: jsonb("processing_activities"),
  policyViolations: jsonb("policy_violations"),
  regulatorReviewRequired: boolean("regulator_review_required").notNull().default(false),
  complianceTags: text("compliance_tags").array().default([]),
  controllerId: text("controller_id"),
  datasetRiskRating: text("dataset_risk_rating"),
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
  modelVersion: text("model_version").notNull().default("all-MiniLM-L6-v2"),
  tokenCount: integer("token_count").notNull().default(0),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const entityEmbeddings = pgTable("entity_embeddings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  entityId: varchar("entity_id").references(() => cdmEntities.id).notNull(),
  embedding: vector("embedding").notNull(),
  modelVersion: text("model_version").notNull().default("all-MiniLM-L6-v2"),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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
  category: text("category").notNull().default("OPERATIONAL"),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id"),
  relatedResourceType: text("related_resource_type"),
  relatedResourceId: text("related_resource_id"),
  userId: text("user_id").notNull(),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Data Controller Registry ───────────────────────────────────────────────
export const dataControllers = pgTable("data_controllers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  controllerCode: varchar("controller_code").notNull().unique(),
  name: text("name").notNull(),
  contactName: text("contact_name"),
  contactEmail: text("contact_email"),
  organisation: text("organisation"),
  address: text("address"),
  type: text("type").notNull().default("CONTROLLER"), // 'CONTROLLER' | 'PROCESSOR'
  sector: text("sector"), // 'FINANCE' | 'HEALTHCARE' | 'TELECOM' | 'PUBLIC_SECTOR' | 'RETAIL' | 'OTHER'
  riskLevel: text("risk_level").notNull().default("LOW"), // 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  licenceStatus: text("licence_status").notNull().default("ACTIVE"), // 'ACTIVE' | 'EXPIRED' | 'PENDING_RENEWAL'
  licenceExpiryDate: timestamp("licence_expiry_date"),
  metadata: jsonb("metadata").default({}),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const processingRecords = pgTable("processing_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  recordCode: varchar("record_code").notNull().unique(),
  controllerId: varchar("controller_id").references(() => dataControllers.id),
  purpose: text("purpose"),
  lawfulBasis: text("lawful_basis"),
  dataCategories: text("data_categories").array(),
  retentionPolicy: jsonb("retention_policy"),
  thirdParties: jsonb("third_parties"),
  processingActivities: jsonb("processing_activities"),
  status: text("status").notNull().default("ACTIVE"),
  startedAt: timestamp("started_at"),
  stoppedAt: timestamp("stopped_at"),
  ropaTemplate: text("ropa_template"), // 'HR_RECORDS' | 'CUSTOMER_DATA' | 'MARKETING_METRICS' | 'FINANCIAL_LEDGER' | 'OTHER'
  completenessScore: real("completeness_score").notNull().default(0),
  lawfulBasisVerified: boolean("lawful_basis_verified").notNull().default(false),
  lawfulBasisVerificationNotes: text("lawful_basis_verification_notes"),
  retentionExpiryDate: timestamp("retention_expiry_date"),
  excessiveDataDetected: boolean("excessive_data_detected").notNull().default(false),
  excessiveDataNotes: text("excessive_data_notes"),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Data Breach Management ─────────────────────────────────────────────────
export const dataBreaches = pgTable("data_breaches", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  breachCode: varchar("breach_code").notNull().unique(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  incidentDate: timestamp("incident_date").notNull(),
  detectedDate: timestamp("detected_date").notNull(),
  severity: text("severity").notNull().default("LOW"), // 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
  status: text("status").notNull().default("REPORTED"), // 'REPORTED' | 'INVESTIGATING' | 'CONTAINED' | 'RESOLVED'
  impactAssessment: text("impact_assessment"),
  rootCause: text("root_cause"),
  remediationActions: text("remediation_actions"),
  evidenceFileUrls: text("evidence_file_urls").array().default([]),
  slaDeadline: timestamp("sla_deadline"),
  slaStatus: text("sla_status").notNull().default("ON_TRACK"), // 'ON_TRACK' | 'BREACHED'
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Data Subject Rights Oversight ──────────────────────────────────────────
export const dsrRequests = pgTable("dsr_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  requestCode: varchar("request_code").notNull().unique(),
  subjectName: text("subject_name").notNull(),
  subjectEmail: text("subject_email").notNull(),
  requestType: text("request_type").notNull().default("ACCESS"), // 'ACCESS' | 'ERASURE' | 'PORTABILITY' | 'RECTIFICATION' | 'RESTRICTION'
  details: text("details"),
  status: text("status").notNull().default("RECEIVED"), // 'RECEIVED' | 'IN_PROGRESS' | 'COMPLETED' | 'REJECTED' | 'ESCALATED'
  rejectionReason: text("rejection_reason"),
  escalationNotes: text("escalation_notes"),
  deadline: timestamp("deadline").notNull(),
  responseSentAt: timestamp("response_sent_at"),
  complaintsCount: integer("complaints_count").notNull().default(0),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const dsrComplaints = pgTable("dsr_complaints", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  complaintCode: varchar("complaint_code").notNull().unique(),
  requestId: varchar("request_id").references(() => dsrRequests.id),
  complainantName: text("complainant_name").notNull(),
  complainantEmail: text("complainant_email").notNull(),
  details: text("details").notNull(),
  status: text("status").notNull().default("OPEN"), // 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED'
  resolutionDetails: text("resolution_details"),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ─── Audit and Enforcement Module ────────────────────────────────────────────
export const complianceAudits = pgTable("compliance_audits", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  auditCode: varchar("audit_code").notNull().unique(),
  title: text("title").notNull(),
  description: text("description"),
  targetControllerId: varchar("target_controller_id").references(() => dataControllers.id),
  scheduledDate: timestamp("scheduled_date").notNull(),
  inspectionStatus: text("inspection_status").notNull().default("SCHEDULED"), // 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED'
  findings: text("findings"),
  score: real("score"),
  enforcementStatus: text("enforcement_status").notNull().default("NONE"), // 'NONE' | 'WARNING_ISSUED' | 'PENALTY_PROPOSED' | 'SANCTION_ENFORCED'
  fineAmount: real("fine_amount"),
  correctiveActions: text("corrective_actions"),
  evidenceRepositoryUrls: text("evidence_repository_urls").array().default([]),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Government and Cybersecurity Feeds ─────────────────────────────────────
export const externalIntegrations = pgTable("external_integrations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  systemName: text("system_name").notNull(), // 'GOV_REGULATOR' | 'CERT_CYBERSECURITY' | 'NATIVE_DB_CONNECTOR'
  displayName: text("display_name"),
  integrationType: text("integration_type").notNull(), // 'GOVERNMENT' | 'CYBERSECURITY' | 'GENERIC'
  connectorType: text("connector_type").notNull().default("API"), // 'API' | 'DATABASE' | 'SFTP' | 'FTP' | 'CUSTOM'
  status: text("status").notNull().default("DISCONNECTED"), // 'CONNECTED' | 'DISCONNECTED' | 'ERROR'
  enabled: boolean("enabled").notNull().default(true),
  healthStatus: text("health_status").notNull().default("UNKNOWN"), // 'UNKNOWN' | 'HEALTHY' | 'DEGRADED' | 'FAILED'
  lastError: text("last_error"),
  config: jsonb("config").notNull().default({}),
  metadata: jsonb("metadata").notNull().default({}),
  nextSyncAt: timestamp("next_sync_at"),
  lastSyncAt: timestamp("last_sync_at"),
  syncLog: text("sync_log"),
  createdBy: varchar("created_by"),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const externalIntegrationEvents = pgTable("external_integration_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  integrationId: varchar("integration_id").notNull().references(() => externalIntegrations.id, { onDelete: "cascade" }),
  eventType: text("event_type").notNull().default("SYNC"),
  severity: text("severity").notNull().default("INFO"),
  message: text("message").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
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

// ─────────────────────────────────────────────────────────────────────────────
// Sovereign Compliance / SupTech artefacts (TEE attestation, ZKP auditing, ledger)
// ─────────────────────────────────────────────────────────────────────────────
export const teeAttestations = pgTable("tee_attestations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  evidenceOrRunId: text("evidence_or_run_id").notNull(),
  scheme: text("scheme").notNull().default("TEEQ_STUB"),
  quoteId: text("quote_id").notNull(),
  inputCommitment: text("input_commitment").notNull(),
  outputCommitment: text("output_commitment").notNull(),
  transcriptHash: text("transcript_hash").notNull(),
  pcrs: jsonb("pcrs"),
  enclaveMrEnclaveHash: text("mr_enclave_hash"),
  enclaveMRSigHash: text("mr_signer_hash"),
  issuedAt: text("issued_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const zkpProofs = pgTable("zkp_proofs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  evidenceOrRunId: text("evidence_or_run_id").notNull(),
  regulatorRequestId: text("regulator_request_id").notNull(),
  scheme: text("scheme").notNull().default("ZKP_STUB"),
  proofId: text("proof_id").notNull(),
  statementsCommitment: text("statements_commitment").notNull(),
  statementCommitments: jsonb("statement_commitments"),
  complianceAllConditionsSatisfied: boolean("all_conditions_satisfied").notNull().default(false),
  failedConditions: text("failed_conditions").array().notNull().default([]),
  generatedAt: text("generated_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const zkpVerifications = pgTable("zkp_verifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  proofId: text("proof_id").notNull(),
  verified: boolean("verified").notNull().default(false),
  verifierNotes: text("verifier_notes"),
  verifiedAt: text("verified_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const auditLedgerEvents = pgTable("audit_ledger_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  ledgerChainId: text("ledger_chain_id").notNull(),
  ledgerEventId: text("ledger_event_id").notNull(),
  eventType: text("event_type").notNull(),
  occurredAt: text("occurred_at").notNull(),
  payloadCommitment: text("payload_commitment").notNull(),
  datasetCode: text("dataset_code"),
  datasetVersion: text("dataset_version"),
  statementHash: text("statement_hash"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const datasetStateSnapshots = pgTable("dataset_state_snapshots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  datasetCode: text("dataset_code").notNull(),
  datasetVersion: text("dataset_version").notNull(),
  snapshotId: text("snapshot_id").notNull(),
  stateCommitment: text("state_commitment").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  ledgerChainId: text("ledger_chain_id").notNull(),
});

export const federatedAuditSessions = pgTable("federated_audit_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  requestId: text("request_id").notNull().unique(),
  jurisdiction: text("jurisdiction").notNull(),
  crossBorder: boolean("cross_border").notNull().default(false),
  requiredComplianceConditions: jsonb("required_compliance_conditions"),
  scope: jsonb("scope"),
  createdAt: timestamp("created_at").notNull().defaultNow(),

  orgComputedAt: text("org_computed_at"),
  aggregatesCommitment: text("aggregates_commitment"),
  complianceAllConditionsSatisfied: boolean("all_conditions_satisfied").notNull().default(false),
  failedConditions: text("failed_conditions").array().notNull().default([]),
});

// ─── Access Request Status Enum ───────────────────────────────────────────
export const accessRequestStatusEnum = pgEnum("access_request_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);

// ─────────────────────────────────────────────────────────────────────────────
// External Systems Privacy Monitoring & Compliance Hub
// ─────────────────────────────────────────────────────────────────────────────

// ─── Connector Status Enums ──────────────────────────────────────────────────
export const connectorStatusEnum = pgEnum("connector_status", [
  "REGISTERED", "TESTING", "CONNECTED", "DEGRADED", "PAUSED", "REVOKED"
]);

export const connectorSyncModeEnum = pgEnum("connector_sync_mode", [
  "REAL_TIME", "INCREMENTAL", "SCHEDULED_FULL", "MANUAL"
]);

export const connectorIncidentTypeEnum = pgEnum("incident_type", [
  "UNAUTHORIZED_ACCESS", "DATA_LOSS", "MALWARE", "SYSTEM_COMPROMISE", "ACCIDENTAL_DISCLOSURE"
]);

export const incidentStatusEnum = pgEnum("incident_status", [
  "DETECTED", "TRIAGED", "INVESTIGATING", "CONFIRMED_BREACH", "REPORTABLE", 
  "NOTIFYING", "CONTAINED", "RESOLVED"
]);

export const complianceRuleStatusEnum = pgEnum("compliance_rule_status", [
  "DRAFT", "APPROVED", "ACTIVE", "DEPRECATED", "RETIRED"
]);

export const findingSeverityEnum = pgEnum("finding_severity", [
  "CRITICAL", "HIGH", "MEDIUM", "LOW"
]);

export const findingStatusEnum = pgEnum("finding_status", [
  "OPEN", "ASSIGNED", "IN_PROGRESS", "RESOLVED", "RISK_ACCEPTED", "FALSE_POSITIVE"
]);

export const approvalStatusEnum = pgEnum("approval_status", [
  "PENDING", "APPROVED", "REJECTED", "REVOKED"
]);

// ─── Connector Control Plane ────────────────────────────────────────────────
export const externalSystems = pgTable("external_systems", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  systemType: varchar("system_type", { length: 100 }).notNull(), // "crm", "erp", "hr", "database", etc.
  owner: varchar("owner", { length: 255 }),
  dataOwner: varchar("data_owner", { length: 255 }),
  dataProcessingBasis: varchar("data_processing_basis", { length: 100 }), // "contract", "consent", etc.
  riskRating: varchar("risk_rating", { length: 50 }), // "critical", "high", "medium", "low"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => ({
  tenantIdx: sql`CREATE INDEX IF NOT EXISTS external_systems_tenant_idx ON ${table} (${table.tenantId})`,
}));

export const connectorDefinitions = pgTable("connector_definitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  connectorType: varchar("connector_type", { length: 100 }).notNull(), // "postgres", "salesforce_rest", etc.
  name: varchar("name", { length: 255 }).notNull(),
  version: varchar("version", { length: 50 }).notNull(),
  capabilities: jsonb("capabilities").notNull(), // List of supported methods
  sdkVersion: varchar("sdk_version", { length: 50 }).notNull(),
  documentation: text("documentation"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => ({
  typeIdx: sql`CREATE INDEX IF NOT EXISTS connector_definitions_type_idx ON ${table} (${table.connectorType})`,
}));

export const connectorInstances = pgTable("connector_instances", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),
  externalSystemId: varchar("external_system_id").notNull().references(() => externalSystems.id),
  connectorDefinitionId: varchar("connector_definition_id").notNull().references(() => connectorDefinitions.id),
  name: varchar("name", { length: 255 }).notNull(),
  status: connectorStatusEnum("status").notNull().default("REGISTERED"),
  config: jsonb("config").notNull(), // Non-sensitive config; secrets in vault
  credentialVaultKey: varchar("credential_vault_key", { length: 255 }).notNull(),
  syncMode: connectorSyncModeEnum("sync_mode").notNull().default("SCHEDULED_FULL"),
  scanSchedule: varchar("scan_schedule", { length: 255 }), // Cron expression
  scopeApproved: jsonb("scope_approved").notNull(), // { databases: [...], tables: [...], fields: [...] }
  lastHealthCheck: timestamp("last_health_check"),
  lastSyncStart: timestamp("last_sync_start"),
  lastSyncEnd: timestamp("last_sync_end"),
  lastSyncStatus: varchar("last_sync_status", { length: 50 }), // "success", "partial", "failed"
  lastSyncError: text("last_sync_error"),
  totalErrorCount: integer("total_error_count").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: varchar("created_by").notNull(),
  approvedBy: varchar("approved_by"),
}, table => ({
  tenantIdx: sql`CREATE INDEX IF NOT EXISTS connector_instances_tenant_idx ON ${table} (${table.tenantId})`,
  systemIdx: sql`CREATE INDEX IF NOT EXISTS connector_instances_system_idx ON ${table} (${table.externalSystemId})`,
}));

// ─── Sync Jobs & Checkpoints ────────────────────────────────────────────────
export const syncJobs = pgTable("sync_jobs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),
  connectorInstanceId: varchar("connector_instance_id").notNull().references(() => connectorInstances.id),
  jobType: varchar("job_type", { length: 50 }).notNull(), // "full_rescan", "incremental", "webhook", "manual"
  status: varchar("status", { length: 50 }).notNull(), // "queued", "running", "completed", "failed", "partial"
  startTime: timestamp("start_time"),
  endTime: timestamp("end_time"),
  recordsProcessed: integer("records_processed").default(0),
  recordsNew: integer("records_new").default(0),
  recordsModified: integer("records_modified").default(0),
  recordsDeleted: integer("records_deleted").default(0),
  errorCount: integer("error_count").default(0),
  errorSample: jsonb("error_sample"), // First few errors for diagnostics
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => ({
  tenantIdx: sql`CREATE INDEX IF NOT EXISTS sync_jobs_tenant_idx ON ${table} (${table.tenantId})`,
  connectorIdx: sql`CREATE INDEX IF NOT EXISTS sync_jobs_connector_idx ON ${table} (${table.connectorInstanceId})`,
}));

export const syncCheckpoints = pgTable("sync_checkpoints", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),
  connectorInstanceId: varchar("connector_instance_id").notNull().references(() => connectorInstances.id),
  cursor: text("cursor").notNull(), // Connector-specific bookmark
  lastSourceEventTime: timestamp("last_source_event_time"),
  lastIngestionTime: timestamp("last_ingestion_time").defaultNow().notNull(),
  schemaVersion: varchar("schema_version", { length: 50 }),
  metadata: jsonb("metadata"), // Connector-specific checkpoint metadata
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => ({
  tenantConnectorIdx: sql`CREATE INDEX IF NOT EXISTS sync_checkpoints_tenant_connector_idx ON ${table} (${table.tenantId}, ${table.connectorInstanceId})`,
}));

// ─── Data Assets & Classification ───────────────────────────────────────────
export const dataAssets = pgTable("data_assets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),
  connectorInstanceId: varchar("connector_instance_id").notNull().references(() => connectorInstances.id),
  assetType: varchar("asset_type", { length: 50 }).notNull(), // "database", "table", "file", "api", "report", "dashboard"
  name: varchar("name", { length: 255 }).notNull(),
  qualifiedName: varchar("qualified_name", { length: 512 }).notNull(), // Globally unique identifier
  owner: varchar("owner", { length: 255 }),
  description: text("description"),
  recordCount: integer("record_count"),
  fieldCount: integer("field_count"),
  containsPersonalData: boolean("contains_personal_data"),
  containsSensitiveData: boolean("contains_sensitive_data"),
  dataCategory: varchar("data_category", { length: 100 }), // "customer", "employee", "transaction", etc.
  retentionPolicyId: varchar("retention_policy_id"),
  lastDiscovered: timestamp("last_discovered").notNull(),
  lastScanned: timestamp("last_scanned"),
  classificationConfidence: real("classification_confidence"), // 0-1
  accessRoles: jsonb("access_roles"), // List of roles that can access
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => ({
  tenantIdx: sql`CREATE INDEX IF NOT EXISTS data_assets_tenant_idx ON ${table} (${table.tenantId})`,
  connectorIdx: sql`CREATE INDEX IF NOT EXISTS data_assets_connector_idx ON ${table} (${table.connectorInstanceId})`,
}));

export const dataFields = pgTable("data_fields", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),
  dataAssetId: varchar("data_asset_id").notNull().references(() => dataAssets.id),
  name: varchar("name", { length: 255 }).notNull(),
  dataType: varchar("data_type", { length: 100 }), // "varchar", "integer", "boolean", etc.
  isNullable: boolean("is_nullable").default(true),
  isPrimaryKey: boolean("is_primary_key").default(false),
  isForeignKey: boolean("is_foreign_key").default(false),
  description: text("description"),
  classificationCategory: varchar("classification_category", { length: 100 }), // "name", "email", "ssn", etc.
  classificationMethod: varchar("classification_method", { length: 100 }), // "rule", "regex", "ml", "user_override"
  classificationConfidence: real("classification_confidence"), // 0-1
  isEncrypted: boolean("is_encrypted").default(false),
  isMasked: boolean("is_masked").default(false),
  lastDiscovered: timestamp("last_discovered").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => ({
  tenantIdx: sql`CREATE INDEX IF NOT EXISTS data_fields_tenant_idx ON ${table} (${table.tenantId})`,
  assetIdx: sql`CREATE INDEX IF NOT EXISTS data_fields_asset_idx ON ${table} (${table.dataAssetId})`,
}));

// ─── Data Lineage ───────────────────────────────────────────────────────────
export const dataFlows = pgTable("data_flows", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),
  sourceAssetId: varchar("source_asset_id").notNull().references(() => dataAssets.id),
  targetAssetId: varchar("target_asset_id").notNull().references(() => dataAssets.id),
  flowType: varchar("flow_type", { length: 50 }).notNull(), // "copy", "transform", "aggregate", "report", "export"
  frequency: varchar("frequency", { length: 100 }), // "real_time", "hourly", "daily", "weekly", "manual"
  direction: varchar("direction", { length: 50 }).notNull(), // "inbound", "outbound", "internal"
  containsPersonalData: boolean("contains_personal_data"),
  containsSensitiveData: boolean("contains_sensitive_data"),
  lastObserved: timestamp("last_observed"),
  discoveryMethod: varchar("discovery_method", { length: 100 }), // "schema_analysis", "audit_log", "metadata", "user_defined"
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => ({
  tenantIdx: sql`CREATE INDEX IF NOT EXISTS data_flows_tenant_idx ON ${table} (${table.tenantId})`,
  sourceIdx: sql`CREATE INDEX IF NOT EXISTS data_flows_source_idx ON ${table} (${table.sourceAssetId})`,
  targetIdx: sql`CREATE INDEX IF NOT EXISTS data_flows_target_idx ON ${table} (${table.targetAssetId})`,
}));

// ─── Processing Activities ──────────────────────────────────────────────────
export const processingActivities = pgTable("processing_activities", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),
  dataAssetId: varchar("data_asset_id").references(() => dataAssets.id),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  purpose: text("purpose").notNull(), // Why is this data being processed?
  lawfulBasis: varchar("lawful_basis", { length: 100 }).notNull(), // "consent", "contract", "legal_obligation", etc.
  isAutomatedDecision: boolean("is_automated_decision").default(false),
  automatedDecisionDetails: text("automated_decision_details"),
  dataSubjectCategories: jsonb("data_subject_categories"), // ["customers", "employees", "patients"]
  recipientCategories: jsonb("recipient_categories"),
  consentRequired: boolean("consent_required").default(false),
  consentEvidenceLocation: varchar("consent_evidence_location", { length: 255 }),
  consentStatus: varchar("consent_status", { length: 50 }), // "valid", "expired", "withdrawn", "missing"
  documentationLocation: varchar("documentation_location", { length: 255 }),
  approvedBy: varchar("approved_by"),
  approvalDate: timestamp("approval_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => ({
  tenantIdx: sql`CREATE INDEX IF NOT EXISTS processing_activities_tenant_idx ON ${table} (${table.tenantId})`,
  assetIdx: sql`CREATE INDEX IF NOT EXISTS processing_activities_asset_idx ON ${table} (${table.dataAssetId})`,
}));

// ─── Retention Management ────────────────────────────────────────────────────
export const retentionPolicies = pgTable("retention_policies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  recordCategory: varchar("record_category", { length: 100 }).notNull(), // "customer", "employee", "transaction", "log", etc.
  personalDataCategory: varchar("personal_data_category", { length: 100 }), // "general", "sensitive", "special"
  systemScope: jsonb("system_scope"), // { systems: [...], databases: [...], tables: [...] }
  retentionDurationDays: integer("retention_duration_days").notNull(),
  retentionTrigger: varchar("retention_trigger", { length: 100 }).notNull(), // "collection_date", "last_transaction", "contract_end", etc.
  dispositionAction: varchar("disposition_action", { length: 100 }).notNull(), // "delete", "anonymise", "pseudonymise", "archive"
  legalBasis: varchar("legal_basis", { length: 100 }),
  archiveLocation: varchar("archive_location", { length: 255 }),
  legalHoldException: boolean("legal_hold_exception").default(false),
  reviewDate: timestamp("review_date"),
  approvedBy: varchar("approved_by").notNull(),
  effectiveDate: timestamp("effective_date").notNull(),
  expiryDate: timestamp("expiry_date"),
  version: integer("version").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => ({
  tenantIdx: sql`CREATE INDEX IF NOT EXISTS retention_policies_tenant_idx ON ${table} (${table.tenantId})`,
}));

export const retentionFindings = pgTable("retention_findings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),
  dataAssetId: varchar("data_asset_id").notNull().references(() => dataAssets.id),
  retentionPolicyId: varchar("retention_policy_id").references(() => retentionPolicies.id),
  findingType: varchar("finding_type", { length: 50 }).notNull(), // "past_retention", "approaching_expiry", "no_policy", etc.
  estimatedRecordsAffected: integer("estimated_records_affected"),
  expiryDate: timestamp("expiry_date"),
  severity: findingSeverityEnum("severity").notNull(),
  status: findingStatusEnum("status").notNull(),
  remediationTask: varchar("remediation_task"),
  exceptionGrantedUntil: timestamp("exception_granted_until"),
  exceptionReason: text("exception_reason"),
  approverComment: text("approver_comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => ({
  tenantIdx: sql`CREATE INDEX IF NOT EXISTS retention_findings_tenant_idx ON ${table} (${table.tenantId})`,
  assetIdx: sql`CREATE INDEX IF NOT EXISTS retention_findings_asset_idx ON ${table} (${table.dataAssetId})`,
}));

// ─── Incidents & Breaches ───────────────────────────────────────────────────
export const incidents = pgTable("incidents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),
  incidentCode: varchar("incident_code", { length: 50 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  incidentType: connectorIncidentTypeEnum("incident_type").notNull(),
  detectionSource: varchar("detection_source", { length: 100 }).notNull(), // "audit_log", "dlp_alert", "siem", "user_report", "connector"
  dateOccurred: timestamp("date_occurred").notNull(),
  dateDetected: timestamp("date_detected").notNull(),
  dateReported: timestamp("date_reported"),
  affectedSystems: jsonb("affected_systems").notNull(), // List of connector/asset IDs
  affectedDataCategories: jsonb("affected_data_categories").notNull(),
  estimatedDataSubjectsAffected: integer("estimated_data_subjects_affected"),
  confidentialityImpact: varchar("confidentiality_impact", { length: 50 }), // "none", "low", "medium", "high", "critical"
  integrityImpact: varchar("integrity_impact", { length: 50 }),
  availabilityImpact: varchar("availability_impact", { length: 50 }),
  cause: text("cause"),
  threatActor: varchar("threat_actor", { length: 100 }), // "external", "insider", "unknown"
  status: incidentStatusEnum("status").notNull(),
  dpoAssessment: text("dpo_assessment"),
  notificationRequired: boolean("notification_required"),
  notificationDecisionDate: timestamp("notification_decision_date"),
  notificationDecisionReason: text("notification_decision_reason"),
  dpaDeadline: timestamp("dpa_deadline"), // Calculated: dateDetected + 2 days (CDPA s.71)
  dpaDeadlineExceeded: boolean("dpa_deadline_exceeded").default(false),
  notificationSentAt: timestamp("notification_sent_at"),
  regulatoryNotificationId: varchar("regulatory_notification_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdBy: varchar("created_by").notNull(),
}, table => ({
  tenantIdx: sql`CREATE INDEX IF NOT EXISTS incidents_tenant_idx ON ${table} (${table.tenantId})`,
  dateDetectedIdx: sql`CREATE INDEX IF NOT EXISTS incidents_date_detected_idx ON ${table} (${table.dateDetected})`,
  statusIdx: sql`CREATE INDEX IF NOT EXISTS incidents_status_idx ON ${table} (${table.status})`,
}));

// ─── Compliance Findings ─────────────────────────────────────────────────────
export const complianceFindings = pgTable("compliance_findings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),
  findingCode: varchar("finding_code", { length: 50 }).notNull().unique(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  ruleId: varchar("rule_id").notNull().references(() => complianceRules.id),
  ruleVersion: integer("rule_version").notNull(),
  severity: findingSeverityEnum("severity").notNull(),
  affectedAssets: jsonb("affected_assets").notNull(), // List of asset IDs
  affectedSystems: jsonb("affected_systems"), // List of connector IDs
  evidenceReferences: jsonb("evidence_references"), // Links to finding evidence
  remediationDueDate: timestamp("remediation_due_date"),
  remediationOwner: varchar("remediation_owner"),
  status: findingStatusEnum("status").notNull(),
  remediationNotes: text("remediation_notes"),
  riskAcceptanceReason: text("risk_acceptance_reason"),
  riskAcceptanceExpiryDate: timestamp("risk_acceptance_expiry_date"),
  dpoReview: text("dpo_review"),
  dpoReviewedAt: timestamp("dpo_reviewed_at"),
  dpoReviewedBy: varchar("dpo_reviewed_by"),
  firstDetected: timestamp("first_detected").notNull(),
  lastDetected: timestamp("last_detected").notNull(),
  detectionCount: integer("detection_count").default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => ({
  tenantIdx: sql`CREATE INDEX IF NOT EXISTS compliance_findings_tenant_idx ON ${table} (${table.tenantId})`,
  ruleIdx: sql`CREATE INDEX IF NOT EXISTS compliance_findings_rule_idx ON ${table} (${table.ruleId})`,
  statusIdx: sql`CREATE INDEX IF NOT EXISTS compliance_findings_status_idx ON ${table} (${table.status})`,
}));

// ─── Compliance Rules (Version-Controlled) ───────────────────────────────────
export const complianceRules = pgTable("compliance_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),
  ruleCode: varchar("rule_code", { length: 100 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  jurisdiction: varchar("jurisdiction", { length: 100 }).notNull(), // "zimbabwe", "gdpr", "ccpa", etc.
  legalInstrument: varchar("legal_instrument", { length: 255 }).notNull(), // "CDPA", "POTRAZ Guidance", etc.
  legalReference: varchar("legal_reference", { length: 255 }), // "s.71", "Chapter 12:07", etc.
  requirementDescription: text("requirement_description").notNull(),
  applicabilityConditions: jsonb("applicability_conditions"), // { dataCategories: [...], systems: [...] }
  detectionLogic: jsonb("detection_logic").notNull(), // Rule definition
  recommendedAction: text("recommended_action"),
  responsibleRole: varchar("responsible_role", { length: 100 }), // "dpo", "data_owner", "security_team"
  severity: findingSeverityEnum("severity").notNull(),
  version: integer("version").default(1),
  previousVersionId: varchar("previous_version_id"),
  effectiveDate: timestamp("effective_date").notNull(),
  expiryDate: timestamp("expiry_date"),
  approvedBy: varchar("approved_by").notNull(),
  approvalDate: timestamp("approval_date").notNull(),
  status: complianceRuleStatusEnum("status").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
}, table => ({
  tenantIdx: sql`CREATE INDEX IF NOT EXISTS compliance_rules_tenant_idx ON ${table} (${table.tenantId})`,
  statusIdx: sql`CREATE INDEX IF NOT EXISTS compliance_rules_status_idx ON ${table} (${table.status})`,
}));

// ─── Approvals & Audit Trail ─────────────────────────────────────────────────
export const approvals = pgTable("approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),
  targetType: varchar("target_type", { length: 50 }).notNull(), // "deletion", "notification", "legal_hold", "exception", "rule_change"
  targetId: varchar("target_id").notNull(),
  approvalType: varchar("approval_type", { length: 50 }).notNull(), // "required", "optional", "notification"
  status: approvalStatusEnum("status").notNull(),
  requestedBy: varchar("requested_by").notNull(),
  requestedAt: timestamp("requested_at").notNull(),
  approverRole: varchar("approver_role", { length: 100 }).notNull(),
  approvedBy: varchar("approved_by"),
  approvalReason: text("approval_reason"),
  approvedAt: timestamp("approved_at"),
  rejectionReason: text("rejection_reason"),
  rejectedAt: timestamp("rejected_at"),
  validUntil: timestamp("valid_until"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => ({
  tenantIdx: sql`CREATE INDEX IF NOT EXISTS approvals_tenant_idx ON ${table} (${table.tenantId})`,
}));

export const auditEvents = pgTable("audit_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: varchar("tenant_id").notNull(),
  actor: varchar("actor").notNull(), // User ID
  action: varchar("action", { length: 100 }).notNull(), // "connector.registered", "finding.created", "deletion.approved", etc.
  targetType: varchar("target_type", { length: 50 }).notNull(), // "connector", "finding", "incident", "deletion", etc.
  targetId: varchar("target_id"),
  targetName: varchar("target_name", { length: 255 }),
  previousValue: jsonb("previous_value"),
  newValue: jsonb("new_value"),
  reason: text("reason"),
  sourceIP: varchar("source_ip", { length: 45 }),
  outcome: varchar("outcome", { length: 50 }).notNull(), // "success", "failure", "partial"
  errorMessage: text("error_message"),
  correlationId: varchar("correlation_id"), // Link related events
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, table => ({
  tenantIdx: sql`CREATE INDEX IF NOT EXISTS audit_events_tenant_idx ON ${table} (${table.tenantId})`,
  actionIdx: sql`CREATE INDEX IF NOT EXISTS audit_events_action_idx ON ${table} (${table.action})`,
  createdAtIdx: sql`CREATE INDEX IF NOT EXISTS audit_events_created_at_idx ON ${table} (${table.createdAt})`,
}));

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

export const adrsSessions = pgTable("adrs_sessions", {
  sid: varchar("sid").primaryKey(),
  sess: jsonb("sess").notNull(),
  expire: timestamp("expire", { precision: 6 }).notNull(),
});

export const insertAccessRequestSchema = createInsertSchema(accessRequests).omit({ id: true, createdAt: true, updatedAt: true });

export const insertExtractionTextSchema = createInsertSchema(extractionTexts).omit({ id: true, createdAt: true });
export const insertBatchSchema = createInsertSchema(batches).omit({ id: true, createdAt: true, updatedAt: true });
export const insertEvidenceSchema = createInsertSchema(evidenceFiles).omit({ id: true, createdAt: true, updatedAt: true });
export const insertExtractionRunSchema = createInsertSchema(extractionRuns).omit({ id: true, createdAt: true });
export const insertValidationTaskSchema = createInsertSchema(validationTasks).omit({ id: true, createdAt: true, updatedAt: true });
export const insertCdmEntitySchema = createInsertSchema(cdmEntities).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDatasetSchema = createInsertSchema(publishedDatasets).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAuditLogSchema = createInsertSchema(auditLogs).omit({ id: true, createdAt: true });
export const insertDataControllerSchema = createInsertSchema(dataControllers).omit({ id: true, createdAt: true, updatedAt: true });
export const insertProcessingRecordSchema = createInsertSchema(processingRecords).omit({ id: true, createdAt: true, updatedAt: true });
export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true, updatedAt: true, lastLoginAt: true });
export const insertChunkEmbeddingSchema = createInsertSchema(chunkEmbeddings).omit({ id: true, createdAt: true });
export const insertEntityEmbeddingSchema = createInsertSchema(entityEmbeddings).omit({ id: true, createdAt: true });

export const insertDataBreachSchema = createInsertSchema(dataBreaches).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDsrRequestSchema = createInsertSchema(dsrRequests).omit({ id: true, createdAt: true, updatedAt: true });
export const insertDsrComplaintSchema = createInsertSchema(dsrComplaints).omit({ id: true, createdAt: true });
export const insertComplianceAuditSchema = createInsertSchema(complianceAudits).omit({ id: true, createdAt: true, updatedAt: true });
export const insertExternalIntegrationSchema = createInsertSchema(externalIntegrations).omit({ id: true, createdAt: true });
export const insertExternalIntegrationEventSchema = createInsertSchema(externalIntegrationEvents).omit({ id: true, createdAt: true });


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
  role: z.enum(["SUPER_ADMIN", "ADMIN", "DATA_CONTROLLER", "DATA_PROTECTION_OFFICER", "ANALYST", "REVIEWER", "VIEWER", "REGULATOR"]).default("ANALYST"),
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
export type InsertChunkEmbedding = typeof chunkEmbeddings.$inferInsert;
export type EntityEmbedding = typeof entityEmbeddings.$inferSelect;
export type InsertEntityEmbedding = typeof entityEmbeddings.$inferInsert;
export type KgNode = typeof kgNodes.$inferSelect;
export type KgEdge = typeof kgEdges.$inferSelect;

export type DataBreach = typeof dataBreaches.$inferSelect;
export type InsertDataBreach = z.infer<typeof insertDataBreachSchema>;
export type DsrRequest = typeof dsrRequests.$inferSelect;
export type InsertDsrRequest = z.infer<typeof insertDsrRequestSchema>;
export type DsrComplaint = typeof dsrComplaints.$inferSelect;
export type InsertDsrComplaint = z.infer<typeof insertDsrComplaintSchema>;
export type ComplianceAudit = typeof complianceAudits.$inferSelect;
export type InsertComplianceAudit = z.infer<typeof insertComplianceAuditSchema>;
export type ExternalIntegration = typeof externalIntegrations.$inferSelect;
export type InsertExternalIntegration = z.infer<typeof insertExternalIntegrationSchema>;
export type ExternalIntegrationEvent = typeof externalIntegrationEvents.$inferSelect;
export type InsertExternalIntegrationEvent = z.infer<typeof insertExternalIntegrationEventSchema>;


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

// ─── Strict Entity Schema Definitions ─────────────────────────────────────────
// These harden the CDM by ensuring that known entity types have well-typed fields
export const personFieldsSchema = z.object({
  name: z.string().min(1).optional(),
  date_of_birth: z.string().optional(),
  nationality: z.string().optional(),
  gender: z.string().optional(),
}).catchall(z.any());

export const organizationFieldsSchema = z.object({
  name: z.string().min(1).optional(),
  registration_number: z.string().optional(),
  tax_number: z.string().optional(),
  industry: z.string().optional(),
  jurisdiction: z.string().optional(),
}).catchall(z.any());

export const documentFieldsSchema = z.object({
  title: z.string().optional(),
  doc_type: z.string().optional(),
  document_date: z.string().optional(),
  reference_number: z.string().optional(),
}).catchall(z.any());

// ─── Insert Schemas (Zod) for Compliance Module ──────────────────────────────
// (Declared above near their respective table definitions with .omit() applied)

export type InsertDataController = z.infer<typeof insertDataControllerSchema>;
export type InsertProcessingRecord = z.infer<typeof insertProcessingRecordSchema>;

export const dpoAppointments = pgTable("dpo_appointments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").references(() => dataControllers.id).notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  appointedAt: timestamp("appointed_at").notNull().defaultNow(),
  notifiedToAuthorityAt: timestamp("notified_to_authority_at"),
  status: text("status").notNull().default("PENDING"), // 'PENDING' | 'NOTIFIED' | 'REVOKED'
  isZimbabweEstablished: boolean("is_zimbabwe_established").notNull().default(true),
  localRepName: text("local_rep_name"),
  localRepEmail: text("local_rep_email"),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
});

export const consentRecords = pgTable("consent_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").references(() => dataControllers.id).notNull(),
  dataSubjectName: text("data_subject_name").notNull(),
  dataSubjectEmail: text("data_subject_email").notNull(),
  sensitivityTier: text("sensitivity_tier").notNull(), // 'NON_SENSITIVE' | 'SENSITIVE' | 'HEALTH_GENETIC_BIOMETRIC'
  method: text("method").notNull(), // 'IMPLIED' | 'EXPRESS_WRITTEN'
  legalBasisCode: text("legal_basis_code").notNull(),
  justification: text("justification"),
  evidenceUri: text("evidence_uri"),
  givenAt: timestamp("given_at").notNull().defaultNow(),
  withdrawnAt: timestamp("withdrawn_at"),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
});

export const patientIdentifiers = pgTable("patient_identifiers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").references(() => dataControllers.id).notNull(),
  dataSubjectName: text("data_subject_name").notNull(),
  dataSubjectEmail: text("data_subject_email").notNull(),
  identifierValue: text("identifier_value").notNull().unique(),
  healthProfessionalCustodian: text("health_professional_custodian").notNull(),
  authorityApprovalId: text("authority_approval_id"),
  linkedIds: text("linked_ids").array().default([]),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const transferRecords = pgTable("transfer_records", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").references(() => dataControllers.id).notNull(),
  destinationCountry: text("destination_country").notNull(),
  adequacyStatus: text("adequacy_status").notNull(), // 'ADEQUATE' | 'NOT_ADEQUATE'
  derogationCode: text("derogation_code"),
  justification: text("justification"),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const whistleblowerReports = pgTable("whistleblower_reports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgId: varchar("org_id").references(() => dataControllers.id).notNull(),
  isAnonymous: boolean("is_anonymous").notNull().default(true),
  reporterName: text("reporter_name"),
  reporterEmail: text("reporter_email"),
  implicatedPerson: text("implicated_person").notNull(),
  details: text("details").notNull(),
  disclosureStatus: text("disclosure_status").notNull().default("PENDING"), // 'PENDING' | 'DISCLOSED' | 'WITHHELD_EXCEPTION'
  withheldReason: text("withheld_reason"),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  filedAt: timestamp("filed_at").notNull().defaultNow(),
});

export const enforcementCases = pgTable("enforcement_cases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  respondentName: text("respondent_name").notNull(),
  breachedSections: text("breached_sections").array().notNull(),
  penaltyBand: text("penalty_band").notNull(), // 'LEVEL_7' | 'LEVEL_11'
  fineAmount: real("fine_amount"),
  imprisonmentTerm: text("imprisonment_term"),
  seizureOrder: boolean("seizure_order").notNull().default(false),
  deletionOrder: boolean("deletion_order").notNull().default(false),
  destructionConfirmedAt: timestamp("destruction_confirmed_at"),
  status: text("status").notNull().default("OPEN"), // 'OPEN' | 'APPEALED' | 'CLOSED'
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const appealCases = pgTable("appeal_cases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  enforcementCaseId: varchar("enforcement_case_id").references(() => enforcementCases.id).notNull(),
  filedAt: timestamp("filed_at").notNull().defaultNow(),
  courtReference: text("court_reference").notNull(),
  outcome: text("outcome"),
  status: text("status").notNull().default("PENDING"), // 'PENDING' | 'RESOLVED'
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
});

export const adequacyCountries = pgTable("adequacy_countries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  countryName: text("country_name").notNull().unique(),
  isAdequate: boolean("is_adequate").notNull().default(true),
  legalBasis: text("legal_basis"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const authorityApprovals = pgTable("authority_approvals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subjectType: text("subject_type").notNull(), // 'PATIENT_ID_LINK' | 'ROPA_HIGH_RISK' | 'TIA_EXCEPTION'
  subjectId: text("subject_id").notNull(),
  decision: text("decision").notNull().default("PENDING"), // 'PENDING' | 'APPROVED' | 'REJECTED' | 'CONDITIONAL'
  conditions: text("conditions"),
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at"),
  tenantId: text("tenant_id").notNull().default("TENANT-001"),
});

export const insertDpoAppointmentSchema = createInsertSchema(dpoAppointments).omit({ id: true, appointedAt: true });
export const insertConsentRecordSchema = createInsertSchema(consentRecords).omit({ id: true, givenAt: true });
export const insertPatientIdentifierSchema = createInsertSchema(patientIdentifiers).omit({ id: true, createdAt: true });
export const insertTransferRecordSchema = createInsertSchema(transferRecords).omit({ id: true, createdAt: true });
export const insertWhistleblowerReportSchema = createInsertSchema(whistleblowerReports).omit({ id: true, filedAt: true });
export const insertEnforcementCaseSchema = createInsertSchema(enforcementCases).omit({ id: true, createdAt: true });
export const insertAppealCaseSchema = createInsertSchema(appealCases).omit({ id: true, filedAt: true });
export const insertAdequacyCountrySchema = createInsertSchema(adequacyCountries).omit({ id: true, updatedAt: true });
export const insertAuthorityApprovalSchema = createInsertSchema(authorityApprovals).omit({ id: true, decidedAt: true });

export type DpoAppointment = typeof dpoAppointments.$inferSelect;
export type InsertDpoAppointment = z.infer<typeof insertDpoAppointmentSchema>;
export type ConsentRecord = typeof consentRecords.$inferSelect;
export type InsertConsentRecord = z.infer<typeof insertConsentRecordSchema>;
export type PatientIdentifier = typeof patientIdentifiers.$inferSelect;
export type InsertPatientIdentifier = z.infer<typeof insertPatientIdentifierSchema>;
export type TransferRecord = typeof transferRecords.$inferSelect;
export type InsertTransferRecord = z.infer<typeof insertTransferRecordSchema>;
export type WhistleblowerReport = typeof whistleblowerReports.$inferSelect;
export type InsertWhistleblowerReport = z.infer<typeof insertWhistleblowerReportSchema>;
export type EnforcementCase = typeof enforcementCases.$inferSelect;
export type InsertEnforcementCase = z.infer<typeof insertEnforcementCaseSchema>;
export type AppealCase = typeof appealCases.$inferSelect;
export type InsertAppealCase = z.infer<typeof insertAppealCaseSchema>;
export type AdequacyCountry = typeof adequacyCountries.$inferSelect;
export type InsertAdequacyCountry = z.infer<typeof insertAdequacyCountrySchema>;
export type AuthorityApproval = typeof authorityApprovals.$inferSelect;
export type InsertAuthorityApproval = z.infer<typeof insertAuthorityApprovalSchema>;

export * from "./models/chat";

