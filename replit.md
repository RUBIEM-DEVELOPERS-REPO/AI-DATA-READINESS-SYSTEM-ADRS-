# AI Data Readiness System (ADRS)
## The AI Institute Africa

## Overview
A comprehensive platform that transforms raw, unstructured evidence (PDFs, images, documents, audio recordings, and video recordings) into structured, high-quality datasets ready for supervised ML, Knowledge Graphs, and LLM/RAG pipelines. Implements a full pipeline: physical batch management → evidence ingestion → OCR/transcription/document intelligence → HITL trust validation → CDM mapping → multi-artifact dataset publishing.

**Phase 3 (Audio/Video Support):** Evidence can now include audio (MP3, WAV, AAC, FLAC, OGG, M4A) and video (MP4, MOV, WEBM, AVI, MKV, M4V) files. New doc types: AUDIO_RECORDING, VIDEO_RECORDING, INTERVIEW, MEETING_RECORDING. New source types: RECORDING, DEVICE. Evidence cards show Audio/Video badges with duration. Intelligence page shows "Transcription" instead of "OCR" for A/V runs, with speaker labels and segmented transcript in the detail view.

## Architecture

### Frontend (React + TypeScript)
- Single Page Application with Wouter routing
- Shadcn/ui components with Tailwind CSS
- TanStack Query for data fetching
- Light/Dark mode support

### Backend (Express + TypeScript)
- REST API on port 5000
- PostgreSQL database via Drizzle ORM
- Seed data auto-loads on first run (checks `evidence_files` count; skips if data exists)
- `server/config.ts` — Centralised feature flags, per-field thresholds, reference patterns, trust weights
- `server/services/normalization.ts` — ValueNormalizationService + AutoApprovalPolicy + DedupService + QualityGates (imports ADRS_CONFIG)
- `server/services/publishing.ts` — Multi-artifact generator (ML CSV, KG JSONL, RAG JSONL, Dataset Card JSON, Bundle ZIP via jszip)
- `server/services/party-inference.ts` — Auto-PARTY + Identifier + Document CDM entity inference from normalized attributes

### Database
PostgreSQL (Replit managed) via `DATABASE_URL` environment variable.

## Pages / Sections

| Route | Page | Description |
|-------|------|-------------|
| `/` | Dashboard | System overview, pipeline stages, activity feed |
| `/evidence` | Evidence Management | File ingestion, batch management, SHA-256 immutability |
| `/intelligence` | Document Intelligence | OCR results, entity extraction, normalized attributes, quality gates |
| `/validation` | Trust & Validation | HITL validation workflow with policy gating (approve/reject/escalate) |
| `/cdm` | CDM Explorer | Canonical Data Model entities with golden records + identifiers |
| `/publishing` | Dataset Publishing | Multi-artifact publishing (ML features, KG, RAG chunks) with trust-block warning |
| `/audit` | Audit Log | Tamper-evident system activity log |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/config` | Read-only feature flags + thresholds |
| GET | `/api/dashboard/stats` | Dashboard statistics |
| GET/POST | `/api/batches` | Digitization batch management |
| GET/POST | `/api/evidence` | Evidence file metadata-only ingest (legacy) |
| POST | `/api/evidence/upload` | **Real file upload** via multipart/form-data (multer); computes real SHA-256; stores to `./uploads/` |
| POST | `/api/evidence/import-url` | **Import from URL** — downloads file from HTTP/HTTPS/Google Drive/Dropbox/OneDrive link |
| GET | `/api/evidence/:id/file` | **Serve stored file** — streams file from disk with correct MIME type |
| GET/POST | `/api/extractions` | Extraction runs — `rawText` stripped by default; add `?include_text=true` to hydrate |
| GET | `/api/extractions/:id/text` | Dedicated text endpoint returning extraction_texts record |
| GET/POST/PATCH | `/api/validation` | HITL validation tasks |
| GET/POST/PATCH | `/api/cdm` | CDM entities |
| GET/POST/PATCH | `/api/datasets` | Published datasets |
| POST | `/api/datasets/:id/publish` | Publish with multi-artifact generation; returns 422 if qualityScore < 0.60 (unless `override:true` + `overrideReason` provided) |
| GET | `/api/datasets/:code/artifact` | Download artifact: `type=ml` (CSV), `type=kg_entities/kg_edges/kg_identifiers/rag_chunks` (JSONL), `type=bundle` (ZIP) |
| POST | `/api/normalize/preview` | Preview normalization output with conflict detection |
| GET | `/api/audit` | Audit logs |

## Data Model (Key Tables)

- `batches` — Digitization batch registry
- `evidence_files` — Ingested files with SHA-256 hashes, immutability locking
- `extraction_runs` — OCR results, trust score, **normalized attributes array**, quality gate report, `extractionTextId` FK
- `extraction_texts` — Deduplicated raw text store (one row per extraction run; reduces storage on `extraction_runs`)
- `validation_tasks` — HITL tasks with **approval_policy_rule**, **approval_policy_reason**, auto-created on CONFLICT and LOW_TRUST
- `cdm_entities` — Canonical entities with **identifiers** (email/phone/ID), **relationships** (KG edges); auto-inferred PARTY/DOCUMENT entities
- `published_datasets` — Datasets with **artifact_uris** (ML/KG/RAG/bundle), **artifact_contents**, **dataset_card**, **quality_gates**
- `audit_logs` — Per-field APPROVE_FIELD/REVIEW_FIELD events, PUBLISH_BLOCKED, PUBLISH_OVERRIDE, AUTO_PARTY_INFERRED

## Phase 2 Features (Implemented)

| Feature | Location |
|---------|----------|
| Centralised config + feature flags | `server/config.ts` |
| Auto-approval policy (per-field thresholds) | `server/services/normalization.ts` |
| Reference number regex validation | `server/services/normalization.ts` (`validateReferencePattern`) |
| Dedup with conflict key list | `server/services/normalization.ts` (`dedupAttributes` returns `{deduped, conflictKeys}`) |
| Auto-create ValidationTask on CONFLICT | `server/routes.ts` (POST /api/extractions) |
| Auto-create ValidationTask on LOW_TRUST | `server/routes.ts` (POST /api/extractions) |
| Auto-create PARTY + DOCUMENT CDM entities | `server/services/party-inference.ts` + routes |
| `extraction_texts` table + deduplicated text | `shared/schema.ts` + storage + routes |
| rawText stripped by default (`?include_text=true`) | `server/routes.ts` (GET /api/extractions) |
| Field-level audit events (APPROVE_FIELD / REVIEW_FIELD) | `server/routes.ts` |
| Trust-score publish blocking (422 + override dialog) | `server/routes.ts` + `client/src/pages/publishing.tsx` |
| Real CSV artifact (`type=ml`) | `server/services/publishing.ts` (`generateMlCsv`) |
| Real ZIP bundle (`type=bundle`) | `server/services/publishing.ts` (`generateBundleZip` via jszip) |
| Trust-block warning banner (frontend) | `client/src/pages/publishing.tsx` (`banner-trust-warning`) |
| Override dialog with audit-logged reason | `client/src/pages/publishing.tsx` (`dialog-publish-override`) |

## Trust Score Formula
`0.35×OCR + 0.25×Extraction + 0.15×Completeness + 0.15×Consistency + 0.10×DocQuality`
Publishing blocks if dataset `qualityScore < 0.60` unless `override:true` + `overrideReason` is provided.

## File Upload & Cloud Storage

### Direct File Upload
- Real multipart upload via `multer` (up to 500 MB per file)
- Files stored in `./uploads/` directory with randomized filenames
- Real SHA-256 hash computed from file bytes on upload
- MIME type auto-detected from file extension
- Media type (DOCUMENT/IMAGE/AUDIO/VIDEO) auto-detected from extension
- `storedUri` set to `local://{filename}` for disk-stored files
- Files served back via `GET /api/evidence/:id/file` with correct Content-Type

### URL Import
- Downloads files from any HTTP/HTTPS URL
- Smart URL transformation for cloud providers:
  - **Google Drive**: `drive.google.com/file/d/{id}/view` → direct download URL
  - **Dropbox**: `?dl=0` → `?dl=1` for direct download
  - **OneDrive/SharePoint**: shared links used directly
- Follows up to 5 HTTP redirects
- SHA-256 hash computed on downloaded bytes

### Google Drive Native Browser (PENDING)
- The Replit Google Drive integration connector (`connector:ccfg_google-drive_0F6D7EF5E22543468DB221F94F`) was proposed but dismissed by the user.
- To enable native Google Drive file browsing, the user must authorize via the Replit integrations panel (Google Drive connector).
- Once authorized, the `connection:conn_google_drive_...` ID can be used to call `addIntegration` + `proposeIntegration` to get OAuth tokens.
- Placeholder "Connect Google Drive" button is in the Cloud Storage tab of the Ingest Evidence dialog.

## Dependencies
- `multer` — Multipart file upload handling
- `jszip` — Real ZIP bundle generation for multi-artifact downloads
- `drizzle-orm`, `drizzle-zod`, `@neondatabase/serverless` — ORM + validation
- `@tanstack/react-query` — Frontend data fetching
- `shadcn/ui`, `lucide-react`, `tailwindcss` — UI components
- `wouter` — Client-side routing
