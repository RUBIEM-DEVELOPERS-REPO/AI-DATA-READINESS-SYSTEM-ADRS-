**API Inventory Test Instructions**

- **Purpose:** Manual verification steps for key API endpoints discovered in `server/routes.ts` and `server/routes_registry.ts`.
- **Prerequisites:**
  - Local Postgres instance or Docker Compose up (see `docker-compose.yml`).
  - Environment variables set: `DATABASE_URL`, `DEFAULT_TENANT`, `SESSION_SECRET`, `SMTP_HOST` (if testing email), and any AI provider keys if testing AI endpoints.
  - Create test users via `server/routes.ts` seeding functions or by calling `/api/auth/register`.

- **Common curl template:**

```bash
# Login and capture cookie (session-based auth)
curl -c cookies.txt -H "Content-Type: application/json" -d '{"username":"admin","password":"password"}' http://localhost:3000/api/auth/login

# Authenticated GET
curl -b cookies.txt http://localhost:3000/api/evidence

# Authenticated POST with JSON
curl -b cookies.txt -H "Content-Type: application/json" -d '{"name":"test batch"}' http://localhost:3000/api/batches
```

> Note: These examples use HTTP for local development only. Production deployments must serve the API over HTTPS.

- **Smoke tests (suggested order):**
  1. Start server: `npm run dev`.
  2. Register admin user (`/api/auth/register`) or run `seedAdminUser()` via scripts.
  3. Login and call `/api/auth/me` to verify session.
  4. Upload a small text file to `/api/evidence/upload` using `multipart/form-data`.
  5. Trigger extraction `/api/evidence/:id/extract` and poll `/api/extractions/:id` until completion.
  6. Query `/api/features/search` with a sample query to verify embedding-backed search.
  7. Call public endpoint `/api/public-register` and ensure it's accessible without auth.

- **Notes on AI endpoints:**
  - Running `/api/evidence/:id/extract` may call configured LLM providers. If keys are not available, the endpoint may fall back to local models or return an error. Do not supply real user PII during tests.

- **Reporting:** Capture HTTP status codes, response bodies, timestamps, and any errors. Store as `docs/ai4i-evidence/05_api_test_results.raw.json` if you record actual responses.
