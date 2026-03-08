# AI Data Readiness System (ADRS)

## Overview
A comprehensive platform for The AI Institute Africa that transforms raw, unstructured evidence (PDFs, images, documents) into structured, high-quality datasets ready for machine learning, Knowledge Graphs, and RAG pipelines.

## Architecture

### Frontend (React + TypeScript)
- Single Page Application with Wouter routing
- Shadcn/ui components with Tailwind CSS
- TanStack Query for data fetching
- Light/Dark mode support

### Backend (Express + TypeScript)
- REST API on port 5000
- PostgreSQL database via Drizzle ORM
- Seed data auto-loads on first run

### Database
PostgreSQL (Replit managed) via `DATABASE_URL` environment variable.

## Pages / Sections

| Route | Page | Description |
|-------|------|-------------|
| `/` | Dashboard | System overview, pipeline stages, activity feed |
| `/evidence` | Evidence Management | File ingestion, batch management, immutability |
| `/intelligence` | Document Intelligence | OCR results, entity extraction, trust scoring |
| `/validation` | Trust & Validation | HITL validation workflow (approve/reject) |
| `/cdm` | CDM Explorer | Canonical Data Model entities |
| `/publishing` | Dataset Publishing | Generate and export AI-ready datasets |
| `/audit` | Audit Log | Tamper-evident system activity log |

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/stats` | Dashboard statistics |
| GET/POST | `/api/batches` | Digitization batch management |
| GET/POST | `/api/evidence` | Evidence file ingestion |
| GET/POST | `/api/extractions` | Extraction run results |
| GET/POST/PATCH | `/api/validation` | HITL validation tasks |
| GET/POST | `/api/cdm` | CDM entities |
| GET/POST/PATCH | `/api/datasets` | Published datasets |
| GET | `/api/audit` | Audit logs |

## Data Model (Key Tables)

- `batches` — Digitization batch registry
- `evidence_files` — Ingested files with SHA-256 hashes and immutability
- `extraction_runs` — OCR + entity extraction results with confidence scores
- `validation_tasks` — HITL validation workflow states
- `cdm_entities` — Canonical Data Model entities (Person, Org, Doc, Transaction, Asset)
- `published_datasets` — Versioned dataset exports
- `audit_logs` — Tamper-evident activity log

## Design System
- Color scheme: Professional blue-tinted neutral palette
- Trust score formula: `0.35*OCR + 0.25*Extraction + 0.15*Completeness + 0.15*Consistency + 0.10*DocQuality`
- Status indicators: Colored badges for pipeline states
- Dark/light mode toggle in header

## Development
```bash
npm run dev          # Start development server
npm run db:push      # Push schema changes to PostgreSQL
```
