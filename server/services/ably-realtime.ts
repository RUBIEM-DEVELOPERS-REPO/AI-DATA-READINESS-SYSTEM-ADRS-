/**
 * ably-realtime.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Ably Real-time Adapter — Serverless-compatible WebSocket replacement
 *
 * ARCHITECTURE:
 *   On traditional servers (Docker/K8s) the system uses the native `ws` server
 *   in websocket.ts for real-time push. On Vercel (serverless), persistent
 *   WebSocket connections are not possible — this module provides an equivalent
 *   interface using Ably's managed WebSocket infrastructure.
 *
 *   Flow:
 *     1. Browser calls GET /api/ably/token  → receives a short-lived Ably token
 *     2. Browser connects to Ably directly with that token
 *     3. Browser subscribes to channel "tenant:<tenantId>"
 *     4. When server emits an event, it calls publishToTenantChannel() here
 *     5. Ably delivers the message to all subscribed browser clients
 *
 *   This is activated automatically when ABLY_API_KEY is present in env.
 *   When ABLY_API_KEY is absent the module is a no-op (falls back to ws server).
 *
 * Environment variables:
 *   ABLY_API_KEY — Root API key from the Ably Dashboard (required for Ably mode)
 *
 * Client-side usage (React):
 *   import Ably from "ably";
 *   const client = new Ably.Realtime({ authUrl: "/api/ably/token" });
 *   const channel = client.channels.get(`tenant:${tenantId}`);
 *   channel.subscribe("event", (msg) => handleEvent(msg.data));
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AblyTokenRequest {
  keyName: string;
  ttl: number;
  capability: string;
  clientId: string;
  timestamp: number;
  nonce: string;
  mac: string;
}

// ─── Client Singleton ─────────────────────────────────────────────────────────

let _restClient: any = null;

function getAblyKey(): string | undefined {
  return process.env.ABLY_API_KEY;
}

async function getRestClient(): Promise<any> {
  const apiKey = getAblyKey();
  if (!apiKey) {
    throw new Error(
      "ABLY_API_KEY is not set. Configure it to enable Ably real-time push.",
    );
  }

  if (_restClient) return _restClient;

  try {
    // Dynamic import — only loaded when Ably is actually needed
    const Ably = await import("ably");
    _restClient = new Ably.Rest({ key: apiKey });
    return _restClient;
  } catch {
    throw new Error(
      'Ably SDK not installed. Run: npm install ably',
    );
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns true when the Ably adapter is configured and should be used.
 * When false, the native WebSocket server (websocket.ts) handles real-time push.
 */
export function isAblyEnabled(): boolean {
  return Boolean(getAblyKey());
}

/**
 * Publish an event to all clients connected to a tenant's Ably channel.
 * Maps to the same semantics as broadcastToTenant() in websocket.ts.
 *
 * @param tenantId  - Tenant identifier (used as channel name suffix)
 * @param event     - Any serialisable payload
 */
export async function publishToTenantChannel(
  tenantId: string,
  event: unknown,
): Promise<void> {
  try {
    const client = await getRestClient();
    const channel = client.channels.get(`tenant:${tenantId}`);
    await channel.publish("event", event);
  } catch (err) {
    // Non-fatal: real-time push failure must not break the request/response cycle
    console.error("[Ably] Failed to publish to tenant channel:", tenantId, err);
  }
}

/**
 * Publish a system-wide message to all tenants.
 * Maps to broadcastToAll() in websocket.ts.
 * NOTE: Requires all tenants to be enumerated from DB — use sparingly.
 *
 * @param tenantIds - Array of active tenant IDs
 * @param event     - Any serialisable payload
 */
export async function publishToAllTenants(
  tenantIds: string[],
  event: unknown,
): Promise<void> {
  await Promise.allSettled(
    tenantIds.map((tenantId) => publishToTenantChannel(tenantId, event)),
  );
}

/**
 * Issue a short-lived Ably token request for a specific authenticated user.
 * The token grants subscribe-only access to the user's tenant channel.
 *
 * Returns a TokenRequest object that the browser can use with Ably.Realtime.
 *
 * @param tenantId - Tenant the user belongs to
 * @param userId   - Authenticated user ID (becomes Ably clientId)
 */
export async function issueClientToken(
  tenantId: string,
  userId: string,
): Promise<AblyTokenRequest> {
  const client = await getRestClient();

  const tokenRequest = await client.auth.createTokenRequest({
    // Subscribe-only access scoped to the tenant's channel
    capability: {
      [`tenant:${tenantId}`]: ["subscribe"],
    },
    clientId: userId,
    // 1-hour TTL — clients refresh automatically via authUrl
    ttl: 60 * 60 * 1000,
  });

  return tokenRequest as AblyTokenRequest;
}
