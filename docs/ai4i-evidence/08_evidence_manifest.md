# Evidence Manifest — AI4I Development Track

## Overview

This manifest summarizes all evidence artifacts collected for the ADRS (African Data Readiness System) as part of the AI4I (AI for Infrastructure) Development Track. All artifacts are stored in `docs/ai4i-evidence/` and are designed to be traceable, redaction-aware, and non-invasive to production.

## Artifact Summary

| # | Artifact | File(s) | Purpose | Status |
|---|---|---|---|---|
| 01 | Repository Baseline | `01_repository_baseline.md`, `.json` | Metadata about repo structure, tech stack, version control, and environment setup | ✅ Complete |
| 02 | File Language Inventory | `02_file_language_counts.csv`, `.md` | Count and inventory of source files by language and extension | ✅ Complete |
| 03 | Redacted Secrets Scan | `03_redacted_secrets.md`, `.json` | Record of sensitive literals found, redaction recommendations, and audit trail | ✅ Complete |
| 04 | Phase 3 Architecture | `04_phase3_architecture.md`, `.json` | Backend architecture, service flow, API layers, AI pipeline, portal-isolated storage design | ✅ Complete |
| 05 | API Inventory | `05_api_inventory.csv`, `.json`, `05_api_test_results.md` | Complete REST API endpoint listing with layer assignments and test results | ✅ Complete |
| 06 | Services Inventory | `06_services_inventory.md` | Backend service module descriptions, dependencies, and responsibilities | ✅ Complete |
| 07 | Service-to-File Mapping | `07_service_to_file_map.csv` | Traceable cross-reference between services and their source file locations | ✅ Complete |
| 08 | Evidence Manifest | `08_evidence_manifest.md`, `.json` | This file: index and summary of all evidence artifacts | ✅ Complete |

## Artifact Details

### 01 — Repository Baseline
- **Purpose**: Establish baseline metadata for the ADRS system.
- **Contains**: Tech stack (TypeScript, React, Express, Drizzle ORM), database setup, Docker Compose, migration scripts, environment configuration.
- **Key Fields**: `repository_name`, `default_branch`, `primary_languages`, `tech_stack`, `codebase_size_lines`, `creation_date`.

### 02 — File Language Inventory
- **Purpose**: Provide a complete inventory of code assets by file type and language.
- **Contains**: Extension counts, language distribution (TypeScript, JavaScript, SQL, CSS, etc.), and statistics.
- **Key Finding**: Predominantly TypeScript/JavaScript backend and frontend with supporting SQL migrations.

### 03 — Redacted Secrets Scan
- **Purpose**: Audit and record sensitive information found during evidence collection without exposing secrets.
- **Contains**: Redacted findings (git remote token, `.env` keys, seed passwords), recommendations for remediation, and audit trail.
- **Key Action**: No secrets are exposed; recommendations include credential rotation, environment variable hardening, and test data separation.

### 04 — Phase 3 Architecture
- **Purpose**: Document backend architecture and service flow for ADRS.
- **Contains**: 
  - Layered data flow: ingestion → extraction → AI intelligence → embeddings → validation → CDM → publishing
  - Service modules: AI extraction, embeddings, attention, connector lifecycle, agent orchestration
  - Portal-isolated DB design and RBAC
  - Infrastructure dependencies and runtime requirements
- **Key Insight**: Backend is a sophisticated AI-driven document intelligence system with multi-tenant portal isolation and deterministic JSON-constrained extraction.

### 05 — API Inventory
- **Purpose**: Provide a complete REST API endpoint catalog with layer assignments.
- **Contains**: All `/api/*` endpoints (authentication, evidence, extraction, validation, CDM, datasets, agent tasks, features, etc.) with their layer, role requirements, and HTTP method.
- **Key Finding**: 82 unique endpoints across 9 functional layers (auth, evidence, extraction, validation, CDM, datasets, features, attention, agent).

### 06 — Services Inventory
- **Purpose**: Catalog backend service modules and their responsibilities.
- **Contains**: Service names, file paths, summaries, and key dependencies for: AI extraction, embeddings, attention, agent orchestration, connector lifecycle, normalization, publishing, golden records, etc.
- **Key Insight**: Services implement a modular AI pipeline with clear separation of concerns.

### 07 — Service-to-File Mapping
- **Purpose**: Enable traceability from service name to source file location.
- **Contains**: CSV mapping of service name → file path → summary → dependencies.
- **Use Case**: Quick reference for developers and auditors to locate service implementations.

### 08 — Evidence Manifest
- **Purpose**: This index file.
- **Contains**: Summary of all artifacts, their purposes, statuses, and cross-references.

## Evidence Collection Methodology

All artifacts were collected through:

1. **Static Code Analysis**: Reading and parsing TypeScript, JavaScript, SQL, and configuration files.
2. **Metadata Extraction**: Cataloging repository structure, dependencies, and configuration.
3. **Redaction-Aware Audit**: Scanning for sensitive information and recording findings without exposure.
4. **Architecture Mapping**: Documenting service flow, API routes, and data movement.
5. **Non-invasive Observation**: No modifications to production code or data.

## Key Findings

### Technology Stack
- **Frontend**: React 18, Vite, Tailwind CSS, TypeScript
- **Backend**: Express, TypeScript, Node.js
- **Database**: PostgreSQL with `pgvector` extension for semantic search
- **AI/ML**: OpenAI integration, local embeddings via `@xenova/transformers`, Drizzle ORM
- **File Handling**: Multer, XLSX, pdf-parse, jszip for multi-format ingestion
- **Authentication**: Passport.js with local strategy and session-based RBAC

### Architecture Highlights
- **Multi-Tenant Portal Isolation**: Three isolated databases (main, DPO, regulator) with strict role-based routing.
- **AI Document Intelligence Pipeline**: Structured extraction with fallback parsing, confidence scoring, and profile-driven weighting.
- **Semantic Search & Attention**: Local embeddings and pgvector similarity search for contextual attention.
- **Human-in-the-Loop Validation**: HITL workflows for conflict resolution and manual approval before publishing.
- **Agent-Driven Orchestration**: AI agents for task automation with audit trail preservation.

### Security Observations
- Sensitive information found (git token, environment keys) — recommendations provided without exposing values.
- Strong password hashing (bcrypt), secure session storage in PostgreSQL, role-based access control enforced at route level.

### Evidence Scope
- **Included**: Backend architecture, API inventory, service modules, file listings, configuration metadata.
- **Excluded**: Source code snippets beyond what is necessary for architectural documentation, runtime logs, user data, database contents.

## Cross-Reference Matrix

| Artifact | Related Artifacts | Purpose |
|---|---|---|
| 01 Baseline | All | Foundation for all other artifacts |
| 02 File Counts | 01 Baseline, 07 Service Map | Provides statistical context |
| 03 Secrets | All | Security audit across all artifacts |
| 04 Architecture | 05 API, 06 Services, 07 Map | Core backend documentation |
| 05 API | 04 Architecture, 06 Services | Detailed endpoint mapping |
| 06 Services | 04 Architecture, 07 Map | Service-level detail |
| 07 Service Map | 06 Services | Enables file-level traceability |
| 08 Manifest | All | This index |

## Usage and Access

All evidence artifacts are stored in the `ai4i-evidence` branch under `docs/ai4i-evidence/`:

```
docs/ai4i-evidence/
├── 01_repository_baseline.{md,json}
├── 02_file_language_counts.{csv,md}
├── 03_redacted_secrets.{md,json}
├── 04_phase3_architecture.{md,json}
├── 05_api_inventory.{csv,json}
├── 05_api_test_results.md
├── 06_services_inventory.md
├── 07_service_to_file_map.csv
└── 08_evidence_manifest.{md,json}
```

Each artifact includes both human-readable (markdown/CSV) and machine-readable (JSON) formats where applicable.

## Branch and Commit Information

- **Branch**: `ai4i-evidence`
- **Base Branch**: `main`
- **Artifacts Created**: 8 main evidence artifacts (16 files total)
- **Purpose**: Provide traceable, auditable evidence of ADRS architecture and codebase for AI4I Development Track

## Sign-Off

**Evidence Package**: Complete as of 2026-07-13  
**Status**: ✅ All artifacts finalized and indexed  
**Quality**: Non-invasive, redaction-aware, traceable, and ready for audit

This manifest serves as the definitive index for the ADRS AI4I evidence package.
