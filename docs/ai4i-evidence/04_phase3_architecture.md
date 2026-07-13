# Phase 3 Architecture Documentation — ADRS Backend

## Purpose

Document the backend architecture, service flow, and data movement for the ADRS system. This file focuses on the core express-based API, the AI extraction and semantic search pipeline, the portal-isolated storage design, and the agent/orchestration layer.

## Core Architecture Overview

The ADRS backend is implemented as an Express application in `server/index.ts` and `server/routes.ts`. It exposes a REST API under `/api/*` and integrates several service layers:

- `server/auth.ts`: session management, Passport local auth, role-based access control, session store configuration.
- `server/storage.ts`: multi-portal storage abstraction, role-based DB routing, and cross-portal user lookup.
- `server/db.ts`, `server/dpoDb.ts`, `server/regulatorDb.ts`: portal-specific database connections.
- `server/routes.ts`: primary application routes for evidence, extraction, validation, CDM, datasets, agent tasks, and features.
- `server/routes_registry.ts`: registry and regulator endpoints for data controller/regulator processes.
- `server/services/*`: specialized services for AI extraction, embeddings, attention, connector lifecycle, publishing, normalization, and agent orchestration.

## Layered Data Flow

### 1. Ingestion and Evidence Storage

Source: `server/routes.ts`

Evidence enters the system through several ingestion paths:

- `/api/evidence/upload`: multipart file upload.
- `/api/evidence/import-url`: ingest files from URLs (Google Drive, Dropbox, OneDrive, HTTP sources).
- `/api/evidence/upload-zip`: batch zip upload and extraction.

Ingestion logic performs:

- file hash deduplication using `computeFileHash`
- local persistence under `UPLOADS_DIR` with `local://` URIs
- evidence metadata creation through `storage.createEvidenceFile`
- audit log creation for ingestion events
- batch capacity enforcement and scanned document tracking

### 2. Text Extraction and AI Preprocessing

Sources: `server/services/extraction.ts`, `server/services/ai-extraction.ts`

After ingesting evidence, the backend extracts readable text from supported file formats:

- text/plain, CSV, JSON, Markdown, XML, HTML
- `PDF` using `pdftotext` first, with fallback to `pdf-parse` and regex-based parsing
- spreadsheet text via `XLSX` parsing
- DOCX via ZIP/XML extraction

The system also detects extraction failures via `isTextExtractionFailure` so downstream vision/transcription can be triggered when text extraction is insufficient.

### 3. AI Document Intelligence

Sources: `server/services/ai-extraction.ts`, `server/services/ai-provider.ts`

The AI extraction service provides structured document intelligence:

- `aiExtractDocumentFields`: sends text to an AI model and requests JSON-only structured output
- uses `EXTRACTION_SYSTEM_PROMPT` to constrain response shape and field set
- normalizes doc types and confidence scores
- extracts fields, entities, and summary information
- calls `resolveDynamicProfile` to compute profile relevance and weight confidence scores

AI provider configuration is centralized in `server/services/ai-provider.ts`, which:

- reads provider configuration from `.adrs-ai-config.json` and environment variables
- supports OpenAI, Groq, openai-compatible providers
- resolves text/chat/audio/vision/embedding models
- creates the `OpenAI` client with a configured API key

### 4. Semantic Embeddings and Attention

Sources: `server/services/embeddings.ts`, `server/services/attention.ts`

The system enriches documents with semantic embeddings and profile matching:

- `generateEmbedding`: uses local `@xenova/transformers` all-MiniLM-L6-v2 to embed text
- `semanticSearch`: stores and queries vectors in PostgreSQL via `pgvector`
- `resolveDynamicProfile`: dynamically matches document summaries to extraction profiles using cosine similarity and cached profile embeddings

This combination supports:

- semantic search over ingested document chunks
- dynamic profile selection for AI extraction confidence weighting
- attention layer context packets (`/api/attention/context-packet/:evidenceId`)

### 5. Validation, CDM, and Publishing

Sources: `server/routes.ts`, `server/storage.ts`, `server/services/publishing.ts`

The backend supports a human-in-the-loop pipeline:

- validation tasks are created and reviewed under `/api/validation` endpoints
- approved validation results can trigger party inference and CDM enrichment
- CDM entities are managed via `/api/cdm` and golden-record APIs
- dataset artifacts are created and published via `/api/datasets` endpoints
- publishing includes artifact generation for ML features, knowledge graph exports, and bundle downloads

The publishing service enforces trust score gating and audit logging before datasets are published.

### 6. Agent Orchestration and Task Automation

Sources: `server/services/agent.ts`, `server/routes.ts`

The backend exposes an agent layer for AI-augmented automation:

- `/api/agent/tasks`: list registered AI agent tasks by layer
- `/api/agent/run`: execute a specific agent task
- `/api/agent/orchestrate`: generate or apply an orchestration plan
- `/api/agent/insights`: system health and AI usage insights

Agent orchestration can create validation tasks and trigger knowledge graph syncs automatically, while preserving audit trails.

### 7. Registry / Regulator Portal Separation

Source: `server/routes_registry.ts`

Registry routes support data controller, regulator, and DPO workflows:

- data controller endpoints for processing records, breaches, DSRs, audits, integrations, DPO appointments
- regulator endpoints for approvals, notices, public register entries, policy notes, exemptions
- access control enforced via `requireAuth` and `requireRole`

### 8. Portal-Isolated Storage Model

Source: `server/storage.ts`

The backend uses strict portal isolation for user and session data:

- `db`: main pipeline/analyst database
- `dpoDb`: data protection officer portal database
- `regulatorDb`: regulator portal database

`DatabaseStorage` implements `getUser*` using `findUserInPortalDatabases` for login searches across portals, but writes go to a single portal-specific database determined by role.

This design preserves separation between:

- analyst/system pipeline data
- DPO/portal-specific user management
- regulator-specific user management

### 9. Access Control and Session Security

Source: `server/auth.ts`

Authentication and RBAC details:

- Passport local strategy against hashed passwords
- session storage in PostgreSQL with `connect-pg-simple`
- `SESSION_DATABASE_URL` fallback to `DATABASE_URL`
- secure cookies in production
- role hierarchy and portal-aware role checks for `/api/*` routes

## Infrastructure and Runtime Dependencies

- PostgreSQL with `pgvector` extension for semantic search
- local file storage and upload directory (`UPLOADS_DIR`)
- external binaries for document extraction: `pdftotext`, `pdftoppm`
- AI provider access via environment variables or `.adrs-ai-config.json`
- optional connector vault service for external system credentials
- Node.js runtime with Express, Drizzle ORM, and AI / file parsing packages

## Traceability Matrix

| Architecture Area | Primary Files | Notes |
|---|---|---|
| Server bootstrap | `server/index.ts` | Express setup, logging, Vite static serving, route registration |
| Auth/session | `server/auth.ts` | Passport, sessions, RBAC, portal DB session store |
| API routes | `server/routes.ts` | Evidence, extraction, validation, CDM, datasets, agent layers |
| Registry endpoints | `server/routes_registry.ts` | DPO/regulator-specific workflows |
| Storage / DB | `server/storage.ts` | Multi-DB gateway, portal isolation, audit logs |
| Text extraction | `server/services/extraction.ts` | PDF/DOCX/XLSX/text parsing and fallbacks |
| AI extraction | `server/services/ai-extraction.ts` | structured LLM extraction and doc-type normalization |
| AI provider config | `server/services/ai-provider.ts` | provider, model, client factory |
| Embeddings | `server/services/embeddings.ts` | local embeddings, pgvector search |
| Attention | `server/services/attention.ts` | profile matching and semantic attention |
| Agent orchestration | `server/services/agent.ts` | AI task execution and action planning |
| Connector lifecycle | `server/services/connector-manager.ts` | external system registration and sync orchestration |
| Publishing | `server/services/publishing.ts` | dataset publishing, artifact generation |

## Conclusion

This Phase 3 architecture artifact documents the ADRS backend as a layered system with:

- evidence ingestion and secure local storage
- robust format extraction with fallback parsing
- AI-powered structured extraction and semantic attention
- portal-isolated DB storage and role-based authorization
- validation/HITL workflows, CDM, and publishable datasets
- agent-driven automation and registry/regulator orchestration

This file is intended as a traceable evidence artifact for the ADRS backend architecture under `docs/ai4i-evidence/`.
