# Legacy & Platform Integrations Documentation
> Documented on 2026-07-17

---

## 1. Context

The ADRS repository historically contained integrations specific to the Replit development environment (such as platform-specific AI models, audio transcription, image generation, and local batch helper scripts) and local scripts like `intellinexus_agent.py` at the root.

As the platform transitions to a hardened, cloud-native architecture, these components are considered **deprecated** and are isolated from the main production execution path.

---

## 2. Legacy Components Inventory

### A. Replit Platform Integrations
Located in: [server/replit_integrations/](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/server/replit_integrations)

- **`audio/`**: Platform-specific audio client (`client.ts`) and Express routes (`routes.ts`) for whisper/transcription.
- **`batch/`**: Local helper utilities for running concurrent batch tasks.
- **`chat/`**: Client and route interfaces for direct chat integration.
- **`image/`**: Visual client and visual generation endpoints.

#### Deprecation & Isolation Strategy:
- **Gated Registration**: Mounting of any routes under this folder is disabled by default in production.
- **De-coupling**: Main application flows (e.g. document extraction in `ai-extraction.ts`) now use the standard unified `OpenAI` client from `ai-provider.ts` directly, bypassing the platform-specific wrappers.
- **JSDoc Annotations**: Every file in this module has been annotated with `@deprecated` comments.

---

### B. IntelliNexus Root Agent Script
File: [intellinexus_agent.py](file:///c:/Users/User/Desktop/Data-Readiness-Hub-latest/Data-Readiness-Sys/Data-Readiness-Hub/intellinexus_agent.py)

- **Description**: A legacy python-based agent orchestration script used for automated data inventory and registry sync actions.
- **Status**: Deprecated. Bounded business logic has been refactored into the modern TypeScript-based services under `server/services/`.
- **Action**: Retained temporarily for backward reference and backward-compatible command-line tasks, but isolated from web/API triggers.

---

## 3. Recommended Deprecation Path

In the next major version release (v2.0.0):
1. **Remove directory** `server/replit_integrations/` completely.
2. **Remove file** `intellinexus_agent.py` from the root directory.
3. Update the builder scripts to omit any dependencies specific to nix-store or Replit (e.g. Nix binary lookups in `server/services/extraction.ts`).
