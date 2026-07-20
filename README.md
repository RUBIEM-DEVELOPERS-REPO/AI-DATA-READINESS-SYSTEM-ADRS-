# AI Data Readiness System (ADRS) — Sovereign SupTech & Compliance Edition
> **The AI Institute Africa**

[![Tech Stack](https://img.shields.io/badge/Stack-React%2018%20%7C%20Express%205%20%7C%20Postgres-blue.svg)](#technology-stack)
[![ORM](https://img.shields.io/badge/ORM-Drizzle-orange.svg)](#technology-stack)
[![AI Supported](https://img.shields.io/badge/AI-Groq%20%7C%20Llama%203.3%20%7C%20Whisper%20%7C%20Claude-green.svg)](#ai-document--media-intelligence)
[![Security](https://img.shields.io/badge/Security-MFA%20%7C%20ZKP%20%7C%20Forensic%20Ledger-red.svg)](#security--cryptographic-compliance-overlay)

An advanced enterprise-grade platform designed to ingest, process, validate, and clean unstructured evidence (PDFs, documents, images, audio, and video recordings) and transform them into structured, high-quality, normalized datasets ready for supervised Machine Learning, Knowledge Graphs, and LLM/RAG pipelines.

This edition features a **Sovereign SupTech Overlay** containing regulatory controls, data protection officer (DPO) workflows, data subject rights (DSR) request trackers, cryptographic forensic auditing logs, and zero-knowledge proof evaluations to satisfy rigorous national data governance policies.

---

## 📖 Table of Contents
1. [Core Pipeline & Features](#-core-pipeline--features)
2. [Security & Cryptographic Compliance Overlay](#-security--cryptographic-compliance-overlay)
3. [Technology Stack](#-technology-stack)
4. [Project Directory Layout](#-project-directory-layout)
5. [Client Page Matrix (35 Pages)](#-client-page-matrix-35-pages)
6. [Service Layer Architecture (36 Services)](#-service-layer-architecture-36-services)
7. [Environment Configuration](#-environment-configuration)
8. [Quick Start & Setup](#-quick-start--setup)
9. [User Roles & RBAC Matrix](#-user-roles--rbac-matrix)

---

## 🚀 Core Pipeline & Features

### 1. Ingestion & Batch Registry
* **Digitization Batches:** Group incoming files into logical batches with target capacities (`expectedDocuments`) and real-time scanned metrics tracking.
* **Direct Multipart Upload:** Support for uploading large files (up to 500 MB) via `multer`. Files are hashed using **SHA-256** to enforce data immutability and prevent duplicate files. Ingested files are stored in the [uploads/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/uploads) folder.
* **ZIP Batch Upload:** Extracts and validates multi-file zip archives, performing pre-extraction capacity and malware scans on target batches.
* **Cloud & URL Imports:** Pull files directly from standard URLs, Google Drive, and Dropbox with smart redirection handling.

### 2. AI Document & Media Intelligence
* **OCR & Vision Ingestion:** Scans PDF files (generating page images using `pdftoppm`) and extracts structured text, entities, and summaries using advanced Vision APIs (configured for `Llama-3.2-90b-vision-preview` or `GPT-4o`).
* **Audio & Video Transcription:** Transcribes multimedia evidence (MP3, WAV, MP4, etc.) using Whisper (`whisper-large-v3`), outputting speaker-diarized segments.
* **Layer 5 Dynamic Contextual Attention:** Resolves the most relevant extraction profile (**Generic**, **Financial**, or **HR & Employment**) dynamically via cosine similarity of zero-shot document summary vector embeddings.
* **Entity Type Correction:** Employs post-extraction vocabulary filters to skip candidate terms (e.g., skills, certificates) from incorrectly mapping into PERSON/ORGANIZATION entity classes.
* **Strict Contact Binding:** Attributes contact details (emails, phone numbers) to entity targets using distance adjacency (±2 words) and section boundaries.

### 3. Entity Resolution & Common Data Model (CDM)
* **CDM Inference:** Inferred entities are mapped into standard schemas such as Party (Person / Organization) and Document models.
* **Deterministic Entity Resolution (v2):** Merges duplicates via field-union (confidence-wins), promotes singletons to `GOLDEN` status, and quarantines ambiguous matching name records.
* **Document Reclassification:** Runs a zero-hallucination reclassification prompt to correct doc-type or entity mismatches (e.g., PERSON vs. ORGANIZATION).

### 4. Human-in-the-Loop (HITL) Validation
* **Task Automation:** Triggers validation tasks automatically on data collision (`CONFLICT`) or when the extraction quality drops below a specific threshold (`LOW_TRUST`).
* **Validation Interface:** Allows Reviewers and Admins to approve, reject, escalate, or resolve conflicting field attributes with detailed field-level audit trails.

### 5. Multi-Artifact Dataset Publishing
* **Published Formats:** Dynamically generates multiple exports upon dataset finalization:
  - **Machine Learning Data:** CSV tables containing normalized model features.
  - **Knowledge Graph Data:** JSON Lines (`JSONL`) separating nodes, edges, and entity identifiers.
  - **RAG/LLM Chunks:** Formatted document segments for vector database indexing.
  - **Bundle:** A comprehensive `.zip` package containing all the above assets alongside a JSON Dataset Card.
* **Quality Gate Safeguards:** Enforces validation policies by blocking dataset publishing when the quality score drops below `0.60`, unless overridden by an administrator with a logged reason.

---

## 🔐 Security & Cryptographic Compliance Overlay

ADRS includes a robust compliance and governance overlay designed for sovereign auditing and privacy law compliance (e.g., CDPA / GDPR):

* **Tamper-Evident Forensic Ledger:** Implements a cryptographically chained log (SHA-256 blockchain lineage) tracking all updates to evidence states, ensuring auditable provenance.
* **Zero-Knowledge Proof (ZKP) Verification:** Generates cryptographic commitments confirming evidence complies with processing rules without exposing underlying sensitive fields.
* **Federated Audit Architecture:** Simulates distributed audit capabilities via local `FederatedAuditNodes` executing risk checks and publishing attestations to a centralized `FederatedRegulatoryHub`.
* **Multi-Factor Authentication (MFA):** Implements secure TOTP MFA setup (QR code generation, verification, and recovery backup codes).
* **Malware Scanning:** Employs an on-upload file attachment validator checking for malware signatures.
* **CORS & CSRF Defenses:** Enforces origin checks, cookie policies, and anti-forgery tokens.
* **Prompt Injection Guard:** Validates user prompts and AI responses using regex filters and structural checks to block injection attacks.

---

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite, Wouter (routing), Tailwind CSS, Radix UI, TanStack Query, Framer Motion, Recharts, React Force Graph 2D |
| **Backend** | Express 5, Node.js 20, TypeScript, Passport.js, WebSockets (`ws`) |
| **Database** | PostgreSQL 15, Drizzle ORM, `pgvector` extension for semantic embedding searches |
| **Secret Management** | HashiCorp Vault client, Node environment secrets |
| **AI Integration** | OpenAI SDK integrated with Groq API endpoints (Llama 3.3, Llama 3.2 Vision, Whisper Large) and Claude API (for compliance scoring agents) |

---

## 📂 Project Directory Layout

* 📁 **[client/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client)** - React Frontend Application
  * 📁 **[public/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/public)** - Static assets
  * 📁 **[src/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src)** - Source directory
    * 📁 **[components/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/components)** - Reusable components (sidebar, dialogs, copilot)
    * 📁 **[context/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/context)** - Context providers (auth, session)
    * 📁 **[hooks/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/hooks)** - Custom React hooks
    * 📁 **[pages/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/pages)** - SPA Pages (dashboard, DPO portal, regulator, validation, cdm, catalog)
* 📁 **[server/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server)** - Express Backend Application
  * 📁 **[services/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services)** - Core service layer & backend logic
  * 📁 **[middleware/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/middleware)** - CSRF, security, and router middleware
  * 📄 **[auth.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/auth.ts)** - Session authentication & RBAC middleware
  * 📄 **[routes.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/routes.ts)** - Main REST API route controllers
  * 📄 **[routes_registry.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/routes_registry.ts)** - Registry & Regulator API endpoints
  * 📄 **[storage.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/storage.ts)** - Database read/write mapper abstraction
* 📁 **[shared/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/shared)** - Shared TypeScript Types & Models
  * 📄 **[schema.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/shared/schema.ts)** - Drizzle schema definitions and Zod validation models
  * 📄 **[profiles.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/shared/profiles.ts)** - Zero-shot extraction profile definitions

---

## 📋 Client Page Matrix (35 Pages)

The React Single Page Application maps directly to the following modular page components:

1. **[dashboard.tsx](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/pages/dashboard.tsx):** High-level data readiness counts, trust scores, batch completeness charts.
2. **[evidence.tsx](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/pages/evidence.tsx):** Bulk file uploads, ZIP imports, cloud URLs, batch creation, and page previews.
3. **[intelligence.tsx](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/pages/intelligence.tsx):** Trigger and monitor OCR page extractions, view diarized audio segments.
4. **[validation.tsx](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/pages/validation.tsx):** Human-in-the-loop conflict resolution pane with field-level compare.
5. **[cdm.tsx](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/pages/cdm.tsx):** View mapped entities, inspect quarantines, merge candidate singletons.
6. **[publishing.tsx](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/pages/publishing.tsx):** Formulate datasets, run quality threshold gates, download CSV/JSONL.
7. **[agent-layer.tsx](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/pages/agent-layer.tsx):** Interactive AI Copilot workspace running SQL tasks, plan steps, and TEE configurations.
8. **[registry.tsx](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/pages/registry.tsx):** Classic controller registry for ROPAs, DPOs, and DSR handling.
9. **[registry-v3-tabs.tsx](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/pages/registry-v3-tabs.tsx):** Full-featured registry console (exemption forms, whistleblowing, ADM lists, security audits).
10. **[regulator.tsx](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/pages/regulator.tsx):** Core regulator dashboard for auditing and data controller licensing status.
11. **[regulator-v3-tabs.tsx](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/pages/regulator-v3-tabs.tsx):** Regulator enforcement console (investigation logs, cross-border liaison, public register, and policy notes).
12. **[connected-systems.tsx](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/pages/connected-systems.tsx) / [connected-systems-detail.tsx](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/pages/connected-systems-detail.tsx):** Interface for syncing external databases and privacy APIs (OneTrust, TrustArc).
13. **[dpo-data-discovery.tsx](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/pages/dpo-data-discovery.tsx):** PII identification and mapping dashboards for databases.
14. **[dsrr-public.tsx](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/pages/dsrr-public.tsx):** Unauthenticated public portal for citizens to submit data erasure and access requests.
15. **[audit.tsx](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/pages/audit.tsx):** Logs details of administrative changes, user creations, and policy configurations.
16. **[feature-representation.tsx](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/pages/feature-representation.tsx):** ML features vectors preview, correlation grids, feature selection UI.
17. **[kg-visualizer.tsx](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/pages/kg-visualizer.tsx):** Interactive 2D graph viewer for resolving entities and relationship edges.
18. **[connected pages & lists:](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/pages)** `auth.tsx` (MFA flow), `users.tsx` (RBAC management), `risk-assessments.tsx`, `policies.tsx`, `retention.tsx`, `reports.tsx`, `findings.tsx`, `my-work.tsx`, `administration.tsx`.

---

## ⚙️ Service Layer Architecture (36 Services)

The backend features a highly modular structure. The primary services in [server/services/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services) execute core tasks:

1. **[agent.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/agent.ts):** Evaluates agent queries, parses task plans, runs safe SQL read-only lookups, triggers escalations.
2. **[ai-extraction.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/ai-extraction.ts):** Vision/OCR extraction, structured schema generation, media Whispering transcription.
3. **[ai-provider.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/ai-provider.ts):** API adapter for OpenAI, Claude, and Groq endpoints.
4. **[attention.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/attention.ts):** Computes similarity of summaries to select dynamic extraction profiles.
5. **[circuit-breaker.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/circuit-breaker.ts):** Guards external AI/Sync requests against cascading outages.
6. **[connector-manager.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/connector-manager.ts) / [connector-registry.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/connector-registry.ts):** Manages sync schedules, credentials, schemas for OneTrust, TrustArc, MySQL, MSSQL, MongoDB, Oracle.
7. **[contact-binding.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/contact-binding.ts):** Bounds email addresses and phone lines to nearby entities.
8. **[data-discovery.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/data-discovery.ts):** Scans database servers to catalog PII fields and map schemas.
9. **[email.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/email.ts):** Handles DSR approvals, user registration notifications, breach notifications.
10. **[embeddings.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/embeddings.ts):** Generates vector embeddings for documents and entity texts.
11. **[entity-type-correction.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/entity-type-correction.ts):** Standardizes entity classifications (e.g. mapping titles, skills).
12. **[evaluation.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/evaluation.ts):** Performs compliance checks and risks scoring on ROPAs.
13. **[event-bus.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/event-bus.ts):** Local events management for decouple service notifications.
14. **[extraction.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/extraction.ts):** Evidence file segmentation and chunk management.
15. **[federated-audit.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/federated-audit.ts):** Implements local audit policies and signs attestations.
16. **[golden-records.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/golden-records.ts):** Entity deduplication and confidence-based field merges.
17. **[graph-sync.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/graph-sync.ts):** Synchronizes database entities with graphic visualization nodes.
18. **[ledger.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/ledger.ts):** Cryptographic SHA-256 forensic blockchain lineage logs.
19. **[local-language-llm.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/local-language-llm.ts):** Support interface for local translation models.
20. **[mfa.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/mfa.ts):** MFA secret generator, backup tokens helper, QR codes provider.
21. **[normalization.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/normalization.ts):** Cleans dates, telephone patterns, checks quality gates.
22. **[object-store.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/object-store.ts):** File reads, writes, and uploads storage controller.
23. **[ontology.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/ontology.ts):** Base ontology structure for standard mapping layers.
24. **[party-inference.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/party-inference.ts):** Infers individual people and groups using proximity keywords.
25. **[persistent-queue.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/persistent-queue.ts):** Background jobs handling with state history database tracking.
26. **[pii-sanitizer.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/pii-sanitizer.ts):** Sanitizes or redacts personal text data fields.
27. **[prompt-guard.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/prompt-guard.ts):** Validates query safety for prompt injections.
28. **[publishing.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/publishing.ts):** Compiles finalized datasets into CSV, JSONL, RAG chunks, ZIP bundles.
29. **[registry-v3.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/registry-v3.ts):** Advanced registry APIs for whistleblowing, security controls, DPAs, and ADM.
30. **[registry.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/registry.ts):** Core compliance registry functions (ROPA, breaches, DSR, controllers).
31. **[tee.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/tee.ts):** Simulates Trusted Execution Environment secure task attestations.
32. **[zkp-audit.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/zkp-audit.ts):** Compiles and validates zero-knowledge proofs.

---

## ⚙️ Environment Configuration

To configure the application, create a `.env` file in the root of the `Data-Readiness-Hub` directory. The variables are mapped as follows:

```ini
# Server Port
PORT=5000
NODE_ENV=development

# PostgreSQL Database Connections
DATABASE_URL=postgresql://postgres:postgres@localhost:5444/storage_db
DPO_DATABASE_URL=postgresql://postgres:postgres@localhost:5444/dpo_db
REGULATOR_DATABASE_URL=postgresql://postgres:postgres@localhost:5444/regulator_db

# Session Security (For express-session authentication)
SESSION_SECRET=adrs-secret-key-12345
SESSION_TABLE_NAME=adrs_sessions

# AI Extraction API credentials (using Groq)
AI_INTEGRATIONS_OPENAI_API_KEY=your_groq_api_key
AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.groq.com/openai/v1

# Claude API Key (for agentic AI compliance checks)
CLAUDE_API_KEY=your_claude_api_key

# AI Model configurations
AI_TEXT_MODEL=llama-3.3-70b-versatile
AI_VISION_MODEL=llama-3.2-90b-vision-preview
AI_AUDIO_MODEL=whisper-large-v3

# Vault secret store (optional)
VAULT_ADDR=https://vault.example.com:8200
VAULT_TOKEN=your_vault_token
VAULT_KV_MOUNT=secret
```

---

## 🔌 Quick Start & Setup

### Prerequisites
* **Node.js** (v20 or higher) and **npm** installed.
* **Docker Desktop** installed and running on your system.

### Step 1: Spin Up the Database
Launch the pre-configured PostgreSQL instance with the vector library installed using Docker Compose:
```bash
docker-compose up -d
```
> [!NOTE]
> The database runs on local port `5444` mapping to internal port `5432` to match the `.env` settings.

### Step 2: Install Dependencies
Run the installation command in the `Data-Readiness-Hub` directory:
```bash
npm install
```

### Step 3: Initialize Database Schema
Generate and apply the tables directly onto the PostgreSQL instance:
```bash
npm run db:push
npm run db:migrate-compliance
```

### Step 4: Run the Application
Start the server in development mode:
```bash
npm run dev
```
The application will serve:
* **Frontend Single Page Application (development only):** [http://localhost:5000](http://localhost:5000)
* **Backend API endpoints:** [http://localhost:5000/api](http://localhost:5000/api)

### Step 5: Seeding Credentials
The server seeds a default administrator on its initial run:
* **Username:** `admin`
* **Password:** `Admin@12345!`
* **Default Tenant:** `TENANT-001`
*(Users logging in with seeded credentials will be immediately prompted to set a new password and configure MFA.)*

---

## 🔐 User Roles & RBAC Matrix

The system implements a hierarchical Role-Based Access Control (RBAC) model. Permissions are checked at both the UI layer (disabling actions) and the server route layer (throwing a `403 Access Restricted` error).

| Role | Weight | Accessible UI Elements & Permissions |
| :--- | :--- | :--- |
| **SUPER_ADMIN** | `5` | Comprehensive access, database manipulation, backend administration, full log auditing |
| **ADMIN** | `4` | Dataset publishing, system settings editing, SMTP configurations, managing and approving user access requests |
| **ANALYST** | `3` | Creating batches, uploading evidence files, executing extraction tasks, mapping CDM entities, creating drafts of datasets |
| **REVIEWER** | `2` | Viewing pipelines, resolving data conflicts, resolving or escalating low-trust HITL tasks |
| **VIEWER** | `1` | Read-only access to dashboards, evidence lists, data catalogues, and logs |
| **DATA_CONTROLLER** | `Portal` | Registers organizations, logs ROPA processing records, updates compliance certificates |
| **DATA_PROTECTION_OFFICER** | `Portal` | DPO verification, audit reviews, logs DSR request resolutions, reports breach incidents |
| **REGULATOR** | `Audit` | Approves or rejects licenses, audits compliance ratings, executes enforcement orders, reviews appeals |
