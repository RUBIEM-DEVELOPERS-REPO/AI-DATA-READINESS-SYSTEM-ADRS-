# IntelliNexus / ADRS Test Matrix

Columns: Module | Feature | Preconditions | Test Steps | Expected Result | Actual Result | Status | Priority | Severity

| Module | Feature | Preconditions | Test Steps | Expected Result | Actual Result | Status | Priority | Severity |
|---|---|---|---|---|---|---:|---:|---:|
| Authentication | Login Page | Server running; DB seeded with `admin` | Open `http://localhost:5000` (local dev only) → Click Login → enter `admin` / `Admin@12345!` | Login screen loads; login accepted; prompt to change password on first login |  | Not Run | P0 | Critical |
| Authentication | Password Change | Logged in as seeded admin | Follow password change flow, set new strong password | Password updated; subsequent logins accept new password; session issued |  | Not Run | P0 | Critical |
| RBAC | Role Enforcement (ADMIN vs VIEWER) | Two users seeded with roles | Login as Viewer; attempt admin-only action (publish dataset) | UI disabled or 403 from API when attempted |  | Not Run | P0 | Critical |
| Ingestion | Multipart File Upload | Server running; tenant exists | Create batch → Upload small PDF via UI or `POST /api/batches/:id/upload` | File saved in `uploads/`; `evidence_files` row created with SHA-256; extraction run queued |  | Not Run | P0 | High |
| Ingestion | ZIP Batch Upload | Docker DB seeded; batch exists | Upload `.zip` via UI or API to a batch | ZIP extracted; each file registered; files saved; evidence rows created |  | Not Run | P1 | High |
| Ingestion | URL Import | Network access; reachable URL | Use API to import file by URL | File downloaded, hashed, stored; evidence row created |  | Not Run | P2 | Medium |
| Upload | Large File Handling | Server and `multer` configured | Upload ~400MB file | Upload completes without timeout; progress shown; file stored |  | Not Run | P2 | Medium |
| OCR & Vision | PDF OCR | `pdftoppm` available; sample scanned PDF | Trigger extraction for PDF | `extraction_runs` contains OCR text; confidence > 0; `extraction_texts` created |  | Not Run | P1 | High |
| Audio Transcription | Whisper Integration | `AI_AUDIO_MODEL` set; audio sample present | Upload MP3 and run transcription | `extraction_runs` with diarized segments created; transcript accuracy reasonable |  | Not Run | P2 | Medium |
| AI Extraction | Field Extraction JSON | `AI_INTEGRATIONS_OPENAI_API_KEY` set or mock | Run extraction job on evidence | `extraction_runs` contains structured JSON; key fields present with confidence scores |  | Not Run | P0 | Critical |
| Attention | Dynamic Profile Resolution | Profiles defined in `shared/profiles.ts` | Submit document ambiguous type | System selects correct profile (generic/finance/employment) and applies profile rules |  | Not Run | P1 | High |
| Embeddings | Vector Generation | `pgvector` enabled in DB | Run embedding job for text | `embeddings` vectors created; similarity queries return expected nearest neighbors |  | Not Run | P1 | High |
| Normalization | Date/Phone/Currency Normalization | `normalization` service active | Process sample with varied date formats | Normalized values stored in `cdm_entities` or normalized fields |  | Not Run | P1 | High |
| Party Inference | Person/Organization Detection | Profile & threshold configured | Run entity inference on sample CV and company doc | `cdm_entities` created with `type` Person/Organization; `trust_score` >= configured threshold |  | Not Run | P1 | High |
| Contact Binding | Email/Phone Attribution | Document includes several emails | Run contact binding | Email/phone bound to correct entity via adjacency; binding confidence logged |  | Not Run | P2 | Medium |
| Entity Type Correction | Post-extraction filter | Vocab filter configured | Extract candidate terms that might misclassify | System filters false positives and reclassifies entities correctly |  | Not Run | P2 | Medium |
| Deduplication | Golden Record Merge | Multiple records with overlapping fields | Trigger entity resolution | `golden_records` created or merged; merge audit logged |  | Not Run | P1 | High |
| Validation/HITL | Auto-create ValidationTask | Low trust runs exist | Inspect a low-trust extraction | `validation_tasks` created and assigned to `REVIEWER` |  | Not Run | P1 | High |
| Publishing | Dataset Packaging | Dataset finalized; quality gate passed | Run publish action | `published_datasets` entry; artifacts (CSV, JSONL, RAG chunks, ZIP) generated |  | Not Run | P0 | Critical |
| Publishing | Quality Gate Block | Average trust < threshold | Attempt to publish | Publish blocked unless ADMIN override recorded in `audit_logs` |  | Not Run | P0 | Critical |
| Email | Notifications | SMTP configured or test SMTP | Trigger password reset or publish notification | Email sent and delivery logged; no SMTP errors |  | Not Run | P3 | Low |
| Audit Logging | Tamper-evidence | Admin performs actions | Check `audit_logs` entries | Audit entries contain user, action, timestamp, and signature/hash |  | Not Run | P0 | Critical |
| API | Health & Version | Server running | `GET /api/health` and `GET /api/version` | 200 OK with uptime and version fields |  | Not Run | P0 | Critical |
| API | Extraction Endpoint | Auth token present | `POST /api/extractions/run` with evidence_id | 202 Accepted; job queued; extraction run created |  | Not Run | P1 | High |
| UI | Dashboard | Logged in and datasets exist | Open Dashboard page | Graphs and counts render; network calls return 200 |  | Not Run | P2 | Medium |
| UI | Evidence List & Viewer | Evidence records exist | Open Evidence list; open evidence detail | List populates; detail shows OCR text, extractions, and actions |  | Not Run | P1 | High |
| Regulator Portal | Investigations Flow | Regulator user exists | Login as Regulator → Open Investigations → create investigation | Investigation created; linked evidence and audit trail |  | Not Run | P2 | Medium |
| DPO Portal | ROPA & DSRs | DPO user exists | Login as DPO → Open ROPA → create/edit record → process DSR | ROPA entry created; DSR flows produce notifications and logs |  | Not Run | P2 | Medium |
| Neuroworks | Orchestration Trigger | Neuroworks agent active or mocked | Trigger end-to-end workflow (ingest → extract → validate → publish) | Each agent step logs execution; HITL escalations when needed; learning updates applied |  | Not Run | P2 | Medium |
| Security | SQLi / XSS / CSRF checks | App running in test mode | Attempt SQLi payloads on inputs, XSS in text fields, missing CSRF tokens | Inputs sanitized; parameterized queries; CSRF protection present; no XSS stored execution |  | Not Run | P0 | Critical |
| Performance | API Load (k6/jmeter) | Test harness available | Run 100 concurrent users against core APIs for 10 minutes | 95th percentile latency under SLA; no DB connection exhaustion; CPU/memory within limits |  | Not Run | P1 | High |
| Regression | CI Integration | GitHub Actions configured | Run `npm test` and integration scripts | All tests pass; coverage thresholds met |  | Not Run | P0 | Critical |


> Notes:
> - Fill `Actual Result` and `Status` (Pass/Fail/Blocked) during execution.
> - Priority: P0 (Critical), P1 (High), P2 (Medium), P3 (Low)
> - Severity: Critical/High/Medium/Low


