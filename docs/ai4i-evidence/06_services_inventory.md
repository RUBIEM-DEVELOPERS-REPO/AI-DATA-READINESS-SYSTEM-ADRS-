# Services Inventory — ADRS (Key server/service implementations)

- **`ai-extraction.ts`**: orchestrates LLM-based extraction and classification; uses `createAiClient` (OpenAI wrapper), supports text-based and vision extraction (`aiExtractDocumentFields`, `aiExtractWithVision`), audio transcription via OpenAI audio, enforces structured JSON response, includes doc-type normalization and scoring functions. Depends on external binaries: `pdftoppm` (vision), `pdftotext` (extraction) and local files in `UPLOADS_DIR`.

- **`extraction.ts`**: file-format text extraction utilities for PDFs, DOCX, XLSX, text formats; contains heuristic regex extraction fallbacks; exposes `extractTextFromFile`, `isTextExtractionFailure`, and `findPdftoppm`.

- **`embeddings.ts`**: local embedding generation via `@xenova/transformers` using `Xenova/all-MiniLM-L6-v2`; stores/queries vectors in Postgres (`pgvector`) via `drizzle-orm`. Exposes `generateEmbedding` and `semanticSearch`.

- **`ai-provider.ts`**: central AI provider config and client factory. Reads `.adrs-ai-config.json` and env vars; exposes `createAiClient`, `getTextModel`, `getChatModel`, `getVisionModel`, `getEmbeddingModel`. Throws if API key missing.

- **`local-language-llm.ts`**: selection logic for sovereign/local LLMs (language detection and model selection) with domain-specific defaults and a `selectionCommitment` hash for auditability.

- **`agent.ts`**: Agent orchestration and tools for automated tasks across layers (evidence, cdm, validation, graph, publishing). Defines `AGENT_TASKS`, function-calling tool interfaces (`query_database`, `escalate_to_hitl`, `suggest_field_correction`), `runAgentTask`, `getAgentOrchestrationPlan`, and safety checks for outputs.

- **`embeddings.ts` (service)**: (see above) notes that embeddings are produced locally by default; system will write vectors to `chunkEmbeddings` table and supports pgvector similarity search.

- **`connector-manager.ts`**: lifecycle and orchestration for external connectors: registration, credential vault integration, health checks, discovery, sync, remediation, retries with exponential backoff, and persistence of discovered assets/fields into `dataAssets`/`dataFields`.

- **`connector-registry.ts`**: registry of connector definitions and plugin factory (used by `connector-manager`).

- **`normalization.ts`**: field-level normalization and auto-approval policy. Implements `normalizeValue`, `normalizeExtractedFields`, `dedupAttributes`, `runQualityGates`, and `computeTrustScore`. References `ADRS_CONFIG` thresholds and patterns.

- **Other notable services**:
  - `agent.test.ts`: agent unit tests
  - `ai-provider.ts`: provider config and client factory
  - `attention.ts`, `party-inference.ts`, `registry.ts`, `publishing.ts`, `golden-records.ts`: domain-specific orchestration (profiling, inference, registry workflows, dataset publishing, golden-record computation).

Dependencies & external requirements:
- AI provider API key or local model availability (`@xenova/transformers`).
- External binaries: `pdftotext`, `pdftoppm` for PDF handling.
- Postgres with `pgvector` extension for similarity searches.
- Vault service for connector credentials (see `connector-vault.ts`).
- Environment variables: AI provider keys, `DATABASE_URL`, `DEFAULT_TENANT`, `SESSION_SECRET`, etc.

Notes for evidence: these services implement the core AI/ingestion/normalization pipeline and include numerous controls to prevent hallucination (fixed enum outputs, JSON-only response formats, low-trust auto-approval rules).
