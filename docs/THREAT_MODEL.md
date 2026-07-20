# AI Data Readiness System (ADRS) Threat Model

This document outlines the security architecture threat model for the ADRS platform using the **STRIDE** methodology.

---

## 1. System Boundaries & Data Flows
The ADRS platform has six core trust boundaries:
1. **Public Web UI Boundary:** Browser connections to the client SPA.
2. **Authenticated API Boundary:** Sessions and RBAC roles governing `/api/*` endpoints.
3. **Database Boundary:** Multi-portal databases (`db`, `dpoDb`, `regulatorDb`) containing client evidence and metadata.
4. **AI Provider Boundary:** External OpenAI/Groq API interfaces.
5. **File-system Boundary:** Uploaded evidence stored locally or in S3-compatible object stores.
6. **External Connector Boundary:** Integrations communicating with databases/REST endpoints.

---

## 2. STRIDE Threat Assessment

### Spoofing (S)
* **Threat:** Attackers spoof identities to access the pipeline, DPO portal, or Regulator views.
* **Mitigations:**
  - Passport local session strategy with strong hashing.
  - Multi-Factor Authentication (MFA) required for privileged roles (`SUPER_ADMIN` and `REGULATOR`).
  - Session-lockout mechanisms to block brute-force attempts.

### Tampering (T)
* **Threat:** Evidence files or database records are modified/tampered with during the ingestion pipeline.
* **Mitigations:**
  - Hardened multi-stage file uploads.
  - Immediate SHA-256 calculation of ingested assets to enforce data immutability.
  - Magic-byte scanning to verify integrity and prevent binary executable uploads.

### Repudiation (R)
* **Threat:** Users perform unauthorized operations (e.g. overriding quality gates or publishing low-confidence datasets) and deny doing so.
* **Mitigations:**
  - Comprehensive database-backed `audit_logs` tracking user, timestamp, tenant context, and action.
  - Mandatory logging of overrides with detailed justification fields.

### Information Disclosure (I)
* **Threat:** Sensitive client PII or system connection strings are leaked via diagnostic logs or sent to external AI providers.
* **Mitigations:**
  - Integrated a PII Sanitizer service to redact emails, phone numbers, and IDs before passing raw text to external APIs.
  - Global Winston logger masks credentials and redacts sensitive JSON bodies.
  - Production validation rejects known weak passwords or db URLs at startup.

### Denial of Service (D)
* **Threat:** Large file uploads or brute-force AI extraction calls exhaust server resources.
* **Mitigations:**
  - Multer limits file sizes to 500MB.
  - Global IP rate limiting prevents brute-force flood requests.
  - Timeout and Circuit Breaker patterns wrapper around external AI APIs.

### Elevation of Privilege (E)
* **Threat:** A standard user or regulator bypasses role controls to gain admin rights.
* **Mitigations:**
  - Strict hierarchical RBAC weight checks applied at both the router layer and frontend components.
  - Session token validation with step-up verification for critical routes.
