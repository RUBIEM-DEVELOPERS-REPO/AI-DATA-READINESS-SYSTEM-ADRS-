# AI Data Readiness System (ADRS)
> **The AI Institute Africa**

[![Tech Stack](https://img.shields.io/badge/Stack-React%20%7C%20Express%20%7C%20Postgres-blue.svg)](#technology-stack)
[![ORM](https://img.shields.io/badge/ORM-Drizzle-orange.svg)](#technology-stack)
[![AI Supported](https://img.shields.io/badge/AI-Groq%20%7C%20Llama%203.3%20%7C%20Whisper-green.svg)](#ai-document--media-intelligence)

An advanced enterprise-grade platform designed to ingest, process, validate, and clean unstructured evidence (PDFs, documents, images, audio, and video recordings) and transform them into structured, high-quality, normalized datasets ready for supervised Machine Learning, Knowledge Graphs, and LLM/RAG pipelines.

ADRS implements a comprehensive, audit-logged pipeline: **Physical Batch Management** → **Evidence Ingestion** → **AI-powered Extraction & Transcription** → **Human-in-the-Loop (HITL) Validation** → **CDM Mapping & Entity Resolution** → **Multi-Artifact Dataset Publishing**.

---

## 📖 Table of Contents
1. [Core Pipeline & Features](#-core-pipeline--features)
2. [Technology Stack](#-technology-stack)
3. [Project Directory Layout](#-project-directory-layout)
4. [Environment Configuration](#-environment-configuration)
5. [Quick Start & Setup](#-quick-start--setup)
6. [User Roles & RBAC Matrix](#-user-roles--rbac-matrix)
7. [Services & Algorithms Overview](#-services--algorithms-overview)
8. [Database Schema Mapping](#-database-schema-mapping)

---

## 🚀 Core Pipeline & Features

### 1. Ingestion & Batch Registry
* **Digitization Batches:** Group files into batches with configured capacities (`expectedDocuments`) and real-time scanned metrics tracking.
* **Direct Multipart Upload:** Supports uploading large files (up to 500 MB) via `multer`. Each file is hashed using **SHA-256** to enforce data immutability and prevent duplicates. Files are stored in the [uploads/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/uploads) directory.
* **ZIP Batch Upload:** Extracts and processes multi-file zip archives, performing pre-extraction capacity checks on target batches.
* **Cloud & URL Imports:** Supports importing files directly from standard URLs, Google Drive, and Dropbox with smart URL redirection handling.

### 2. AI Document & Media Intelligence
* **OCR & Vision Ingestion:** Scans PDFs (extracting pages using `pdftoppm`) and extracts structured text, entities, and summaries using advanced Vision APIs (configured for `Llama-3.2-90b-vision-preview` or `GPT-4o`).
* **Audio & Video Transcription:** Transcribes multimedia evidence (MP3, WAV, MP4, etc.) using Whisper (`whisper-large-v3`), outputting diarized speaker segments.
* **Layer 5 Dynamic Contextual Attention:** Resolves the most relevant extraction profile (**Generic**, **Financial**, or **HR & Employment**) dynamically via cosine similarity of zero-shot document summary vector embeddings.
* **Entity Type Correction:** Employs a post-extraction vocabulary filter to skip candidate terms (e.g. skills, job titles, or certificates) from incorrectly mapping into PERSON/ORGANIZATION entities.
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

## 🛠️ Technology Stack

| Layer | Technologies |
| :--- | :--- |
| **Frontend** | React 18, TypeScript, Vite, Wouter (routing), Tailwind CSS, Radix UI, TanStack Query, Framer Motion, Recharts, React Force Graph 2D |
| **Backend** | Express 5, Node.js 20, TypeScript, Passport.js (Authentication & RBAC) |
| **Database** | PostgreSQL 15, Drizzle ORM, `pgvector` extension for semantic embedding searches |
| **AI Integration**| OpenAI SDK initialized with Groq API integration (Llama 3.3, Llama 3.2 Vision, Whisper Large) |

---

## 📂 Project Directory Layout

* 📁 **[client/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client)** - React Frontend Application
  * 📁 **[public/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/public)** - Static assets
  * 📁 **[src/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src)** - Source directory
    * 📁 **[components/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/components)** - Reusable components (sidebar, dialogs, copilot)
    * 📁 **[context/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/context)** - Context providers (auth, session)
    * 📁 **[hooks/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/hooks)** - Custom React hooks
    * 📁 **[pages/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/pages)** - SPA Pages (dashboard, evidence, intelligence, validation, CDM explorer, publishing, graph visualizer, audit log)
    * 📄 **[App.tsx](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/App.tsx)** - Main routing setup and application gatekeeper
    * 📄 **[index.css](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/client/src/index.css)** - Tailwind directives & global styling definitions
* 📁 **[server/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server)** - Express Backend Application
  * 📁 **[services/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services)** - Core service layer & backend logic
  * 📄 **[auth.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/auth.ts)** - Session authentication & RBAC middleware
  * 📄 **[config.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/config.ts)** - Global feature flags, validation weights, thresholds
  * 📄 **[db.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/db.ts)** - Drizzle database initialization & vector extension execution
  * 📄 **[index.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/index.ts)** - Node HTTP server startup file
  * 📄 **[routes.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/routes.ts)** - REST API route definitions and controllers
  * 📄 **[upload.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/upload.ts)** - Ingestion mechanics, disk storage, URL parsing
* 📁 **[shared/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/shared)** - Shared Code & Models
  * 📄 **[schema.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/shared/schema.ts)** - Drizzle schema definitions and Zod validation models
  * 📄 **[profiles.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/shared/profiles.ts)** - Zero-shot extraction profile definitions
* 📁 **[uploads/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/uploads)** - Local storage folder for all ingested evidence documents

---

## ⚙️ Environment Configuration

To configure the application, create a `.env` file in the root of the `Data-Readiness-Hub` directory. The variables are mapped as follows:

```ini
# PostgreSQL Database URL
DATABASE_URL=postgresql://postgres:postgres@localhost:5444/storage_db

# Session Secret (For express-session authentication)
SESSION_SECRET=adrs-secret-key-12345

# AI Extraction API credentials (using Groq)
AI_INTEGRATIONS_OPENAI_API_KEY=your_groq_api_key
AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.groq.com/openai/v1

# AI Model settings
AI_TEXT_MODEL=llama-3.3-70b-versatile
AI_VISION_MODEL=llama-3.2-90b-vision-preview
AI_AUDIO_MODEL=whisper-large-v3

# TLS verification settings
NODE_TLS_REJECT_UNAUTHORIZED=0
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
> The database runs on local port `5444` mapping to internal port `5432`. If running a raw docker command, make sure to map `-p 5444:5432` to match the `.env` settings.

### Step 2: Install Dependencies
Run the installation command in the `Data-Readiness-Hub` directory:
```bash
npm install
```

### Step 3: Initialize Database Schema
Generate and apply the tables directly onto the PostgreSQL instance:
```bash
npm run db:push
```

### Step 4: Run the Application
Start the server in development mode:
```bash
npm run dev
```
The application will serve:
* **Frontend Single Page Application:** [http://localhost:5000](http://localhost:5000)
* **Backend API Controller endpoints:** [http://localhost:5000/api](http://localhost:5000/api)

### Step 5: Log In
The server seeds a default administrator on its initial run:
* **Username:** `admin`
* **Password:** `Admin@12345!`
* **Default Tenant:** `TENANT-001`
*(Users logging in with seeded credentials will be immediately prompted to set a new password.)*

---

## 🔐 User Roles & RBAC Matrix

The system implements a strict, hierarchical Role-Based Access Control (RBAC) model. Permissions are checked at both the UI layer (disabling actions/buttons) and the server route layer (throwing a `403 Access Restricted` error).

| Role | Weight | Accessible UI Elements & Permissions |
| :--- | :--- | :--- |
| **SUPER_ADMIN** | `5` | Comprehensive access, database manipulation, backend administration, full log auditing |
| **ADMIN** | `4` | Dataset publishing/archiving, system settings editing, SMTP configurations, managing and approving user access requests |
| **ANALYST** | `3` | Creating batches, uploading evidence files, executing extraction tasks, mapping CDM entities, creating drafts of datasets |
| **REVIEWER** | `2` | Viewing pipelines, resolving data conflicts, resolving or escalating low-trust HITL tasks |
| **VIEWER** | `1` | Read-only access to dashboards, evidence lists, data catalogues, and logs |

---

## ⚙️ Services & Algorithms Overview

The core logic is divided into modular services under [server/services/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services):

1. **[ai-extraction.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/ai-extraction.ts):** Performs structured field extraction via LLM JSON schemas, scanned document vision matching, and media audio transcription.
2. **[attention.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/attention.ts):** Implements dynamic profile resolution matching zero-shot document embeddings with profile descriptions.
3. **[embeddings.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/embeddings.ts):** Generates vector embeddings using the configured API and runs similarity lookup algorithms.
4. **[normalization.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/normalization.ts):** Normalizes field values (dates, telephones, currencies), computes deduplication keys, and checks data consistency gates.
5. **[party-inference.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/party-inference.ts):** Automatically identifies individual PERSON and ORGANIZATION entities, matching names using heuristics.
6. **[contact-binding.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/contact-binding.ts):** Evaluates prefix proximity and bounding-box layout grids to attribute emails and phone numbers to specific entities.
7. **[entity-type-correction.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/entity-type-correction.ts):** Classification utility filtering system vocabularies to exclude candidate terms from mapping into entity classes.
8. **[golden-records.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/golden-records.ts):** Deterministic deduplication that resolves duplicates by merging field values based on confidence metrics.
9. **[publishing.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/publishing.ts):** Package builder converting database collections into ML CSV, KG JSONL, and RAG chunk structures.
10. **[email.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/services/email.ts):** Controls communication loops (such as role promotions, approvals, password notifications) using SMTP transporter rules.

---

## 🗄️ Database Schema Mapping

Key database models configured within Drizzle [shared/schema.ts](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/shared/schema.ts):

* **`batches`:** Active digitization batches.
* **`evidence_files`:** Ingested source files with unique SHA-256 signatures and file format configurations.
* **`extraction_runs`:** Logs OCR content, AI extraction records, confidence values, and structural quality gate metrics.
* **`extraction_texts`:** Keeps a deduplicated catalog of extracted text payloads to save storage.
* **`validation_tasks`:** Captures verification tasks created for Reviewers on validation failures or data conflicts.
* **`cdm_entities`:** Normalised CDM entries including relational edges, identifiers, and trust scores.
* **`published_datasets`:** Catalog of completed datasets with download URIs pointing to published artifacts.
* **`audit_logs`:** Audit log record detailing admin events, overrides, and user movements.
