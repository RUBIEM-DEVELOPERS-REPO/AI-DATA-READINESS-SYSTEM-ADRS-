# AI Data Readiness System (ADRS)
## The AI Institute Africa

## Overview
A comprehensive platform that transforms raw, unstructured evidence (PDFs, images, documents) into structured, high-quality datasets ready for supervised ML, Knowledge Graphs, and LLM/RAG pipelines. Implements a full pipeline: physical batch management → evidence ingestion → OCR/document intelligence → HITL trust validation → CDM mapping → multi-artifact dataset publishing.

## Architecture

### Frontend (React + TypeScript)
- Single Page Application with Wouter routing
- Shadcn/ui components with Tailwind CSS
- TanStack Query for data fetching
- Light/Dark mode support

### Backend (Express + TypeScript)
- REST API on port 5000
- PostgreSQL database via Drizzle ORM
- Seed data auto-loads on first run (clears on restart)
- `server/services/normalization.ts` — ValueNormalizationService + AutoApprovalPolicy + DedupService + QualityGates
- `server/services/publishing.ts` — Multi-artifact generator (ML, KG, RAG, Dataset Card)

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
| `/publishing` | Dataset Publishing | Multi-artifact publishing (ML features, KG, RAG chunks) |
| `/audit` | Audit Log | Tamper-evident system activity log |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/stats` | Dashboard statistics |
| GET/POST | `/api/batches` | Digitization batch management |
| GET/POST | `/api/evidence` | Evidence file ingestion |
| GET/POST | `/api/extractions` | Extraction runs (auto-normalizes + runs quality gates on create) |
| GET/POST/PATCH | `/api/validation` | HITL validation tasks |
| GET/POST/PATCH | `/api/cdm` | CDM entities |
| GET/POST/PATCH | `/api/datasets` | Published datasets |
| POST | `/api/datasets/:id/publish` | Publish with multi-artifact generation |
| GET | `/api/datasets/:code/artifact` | Download artifact (type=ml/kg_entities/kg_edges/rag_chunks/bundle) |
| POST | `/api/normalize/preview` | Preview normalization output |
| GET | `/api/audit` | Audit logs |

## Data Model (Key Tables)

- `batches` — Digitization batch registry
- `evidence_files` — Ingested files with SHA-256 hashes, immutability locking
- `extraction_runs` — OCR results, trust score, **normalized attributes array**, quality gate report
- `validation_tasks` — HITL tasks with **approval_policy_rule**, **approval_policy_reason**
- `cdm_entities` — Canonical entities with **identifiers** (email/phone/ID), **relationships** (KG edges)
- `published_datasets` — Datasets with **artifact_uris** (ML/KG/RAG/bundle), **artifact_contents**, **dataset_card**, **quality_gates**
- `audit_logs` — Tamper-evident event log

## Phase 2 Features (Data Quality)

### Normalization Service (`server/services/normalization.ts`)
- **ValueNormalizationService**: date→ISO-8601, phone→E.164, email→lowercase, currency parsing
- **AutoApprovalPolicy**: conservative per-field thresholds (email≥90%, phone≥90%, date≥85%, etc.)
  - Rejects weak values ("foundation", "note", "address"), failed normalizations, low confidence
  - Stores `approval_policy_rule` + `approval_policy_reason` per attribute
- **DedupService**: collapses duplicate subject+key attributes, creates CONFLICT tasks for mismatches
- **QualityGates**: completeness checks per doc type, OCR quality, normalization success gates
- **Subject separation**: identity fields (name/email/phone) → PARTY, document fields → DOCUMENT

### Trust Score Formula
`0.35×OCR + 0.25×Extraction + 0.15×Completeness + 0.15×Consistency + 0.10×DocQuality`

### Multi-Artifact Publishing (`server/services/publishing.ts`)
One publish action creates a single `dataset_version_id` with 3 separate fit-for-purpose artifacts:
1. **ML Features** (`ml_features.jsonl`) — flat feature matrix for supervised ML training
2. **Knowledge Graph** — `kg_entities.jsonl` + `kg_identifiers.jsonl` + `kg_edges.jsonl`
3. **RAG Chunks** (`rag_chunks.jsonl`) — paragraph-chunked text with stable chunk_ids, entity links, trust metadata
4. **Bundle** (`bundle.json`) — all artifacts + dataset_card in one download

### Dataset Card (v1.1)
Includes: schema_version, dataset_version, lineage (source_batches, evidence_ids, pipeline_version), quality_metrics (avg_confidence, avg_trust_score, approved_pct, normalization_success_pct), validation_summary, artifact stats, approvals.

## Tenant / User Config
- Tenant: `TENANT-001`
- Default user: `Wills` (Project Lead)
- Port: 5000
