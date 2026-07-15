# AI Capabilities in the Data Readiness System

## Overview

The system is an AI-enabled data readiness platform that ingests evidence, extracts structured information, validates outputs, stores semantic representations, and publishes AI-ready datasets.

### Overall architecture

The architecture is organized into layered stages:

1. Ingestion layer
   - Accepts documents, audio, and other evidence files.
   - Stores them in the evidence pipeline for downstream processing.

2. Intelligence layer
   - Uses LLMs for document understanding, classification, field extraction, and multimodal analysis.
   - Produces structured outputs, summaries, and entity extraction results.

3. Representation layer
   - Converts document content into vector embeddings for semantic search and retrieval.
   - Supports RAG-style exploration across the indexed corpus.

4. Governance and validation layer
   - Tracks extraction runs, validation tasks, and trust-related outcomes.
   - Supports human-in-the-loop review and confidence-based decision making.

5. Knowledge and publishing layer
   - Builds knowledge-graph style relationships and prepares datasets for downstream ML, governance, and reporting workflows.

The system includes two AI layers:

- a modern, model-driven stack for extraction, retrieval, and agent assistance
- a legacy Anthropic-based compliance scoring component

## Modern AI Capabilities

### 1. Structured document extraction
- Implemented in: `server/services/ai-extraction.ts`
- Model: `GPT-4.1-mini`
- Purpose: Extracts document type, summary, fields, entities, and language from uploaded text documents.

### 2. Vision-based document understanding
- Implemented in: `server/services/ai-extraction.ts`
- Model: `GPT-4o`
- Purpose: Supports multimodal document understanding for image/PDF-style content.

### 3. Audio and video transcription
- Implemented in: `server/services/ai-extraction.ts`
- Model: `GPT-4o-mini-transcribe`
- Purpose: Converts audio/video input into text for downstream extraction and analysis.

### 4. Semantic search and Retrieval-Augmented Generation (RAG)
- Implemented in: `server/services/embeddings.ts`
- Model: local `all-MiniLM-L6-v2`
- Purpose: Builds dense embeddings for text chunks and enables semantic similarity search through pgvector.

### 5. Dynamic contextual attention
- Implemented in: `server/services/attention.ts`
- Model: same embedding approach as above
- Purpose: Routes documents to the most relevant extraction profile using semantic similarity.

### 6. Agent-assisted workflow intelligence
- Implemented in: `server/services/agent.ts`
- Model: `GPT-4.1-mini` (chat/tool-using model)
- Purpose: Helps users analyze pipeline health, suggest actions, query the database, and orchestrate validation and publishing tasks.

### 7. AI user experience surfaces
- UI components include:
  - `client/src/components/ai-copilot.tsx`
  - `client/src/components/agent-assist.tsx`
  - `client/src/pages/agent-layer.tsx`
- Purpose: Exposes AI experiences for conversational assistance, task execution, and RAG-based exploration.

## Legacy AI Capability

### 8. Compliance scoring
- Implemented in: `src/agents/complianceScoringAgent.js`
- Model: `Claude 3 Haiku`
- Purpose: Scores compliance and ROPA-related records for risk and governance signals.

## Summary

The system uses AI primarily for:

- document understanding and extraction,
- multimodal ingestion,
- semantic search and retrieval,
- agent-driven analysis and workflow support,
- and legacy compliance evaluation.
