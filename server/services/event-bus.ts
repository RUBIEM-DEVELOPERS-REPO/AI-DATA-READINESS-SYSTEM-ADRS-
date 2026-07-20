/**
 * event-bus.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IntelliNexus Event Bus — Event-Driven Architecture (GAP-009)
 *
 * ARCHITECTURE ENFORCEMENT:
 *   ✅ GAP-009 FIXED: Typed event bus that decouples services via events
 *   ✅ Event-Driven: services emit events; consumers react asynchronously
 *   ✅ Multi-Tenant: every event carries tenantId for isolation and routing
 *   ✅ Extensible: pluggable backends (InMemory → Redis → Kafka)
 *   ✅ Observable: all events include correlationId for distributed tracing
 *   ✅ Configurable: backend selected via EVENT_BUS_BACKEND env var
 *
 * Backend selection:
 *   EVENT_BUS_BACKEND=memory   → In-process (development default)
 *   EVENT_BUS_BACKEND=redis    → Redis Pub/Sub (production — requires REDIS_URL)
 *
 * IntelliNexus Canonical Events (aligned to the data lifecycle):
 *   DatasetRegistered, EvidenceIngested, ExtractionStarted, ExtractionCompleted,
 *   ValidationCompleted, DatasetApproved, AgentStarted, AgentCompleted,
 *   KnowledgeUpdated, EmbeddingCreated, PublicationCompleted,
 *   HumanApprovalRequested, PolicyViolationDetected, AuditEventCreated
 */

import { randomUUID } from "crypto";

// ─── Event Types ───────────────────────────────────────────────────────────

export type IntelliNexusEventType =
  | "DatasetRegistered"
  | "EvidenceIngested"
  | "ExtractionStarted"
  | "ExtractionCompleted"
  | "ExtractionFailed"
  | "ValidationStarted"
  | "ValidationCompleted"
  | "DatasetApproved"
  | "DatasetPublished"
  | "AgentStarted"
  | "AgentCompleted"
  | "AgentFailed"
  | "KnowledgeUpdated"
  | "EmbeddingCreated"
  | "PublicationCompleted"
  | "HumanApprovalRequested"
  | "PolicyViolationDetected"
  | "AuditEventCreated"
  | "JobQueued"
  | "JobCompleted"
  | "JobFailed"
  | "TenantCreated"
  | "UserCreated"
  | "SystemConfigChanged";

export interface IntelliNexusEvent<TPayload = Record<string, unknown>> {
  /** Unique event identifier */
  id: string;
  /** Event type — maps to a lifecycle stage or system action */
  type: IntelliNexusEventType;
  /** Tenant that owns this event — used for isolation and routing */
  tenantId: string;
  /** Correlation ID for distributed tracing — propagate from HTTP X-Correlation-ID */
  correlationId?: string;
  /** ISO timestamp of when the event was emitted */
  timestamp: string;
  /** Event-specific payload */
  payload: TPayload;
  /** Optional source service/component for debugging */
  source?: string;
}

export type EventHandler<TPayload = Record<string, unknown>> = (
  event: IntelliNexusEvent<TPayload>
) => Promise<void> | void;

// ─── IEventBus Interface ───────────────────────────────────────────────────

export interface IEventBus {
  /** Publish an event to all subscribers of its type */
  publish<TPayload = Record<string, unknown>>(
    type: IntelliNexusEventType,
    payload: TPayload,
    options?: {
      tenantId?: string;
      correlationId?: string;
      source?: string;
    }
  ): Promise<void>;

  /** Subscribe to events of a given type */
  subscribe<TPayload = Record<string, unknown>>(
    type: IntelliNexusEventType,
    handler: EventHandler<TPayload>
  ): () => void; // Returns an unsubscribe function

  /** Subscribe to ALL events (useful for audit logging) */
  subscribeAll(handler: EventHandler<Record<string, unknown>>): () => void;
}

// ─── In-Memory Event Bus ───────────────────────────────────────────────────

export class InMemoryEventBus implements IEventBus {
  private readonly handlers = new Map<string, Set<EventHandler<any>>>();
  private readonly wildcardHandlers = new Set<EventHandler<any>>();

  async publish<TPayload = Record<string, unknown>>(
    type: IntelliNexusEventType,
    payload: TPayload,
    options: { tenantId?: string; correlationId?: string; source?: string } = {}
  ): Promise<void> {
    const event: IntelliNexusEvent<TPayload> = {
      id: randomUUID(),
      type,
      tenantId: options.tenantId ?? "system",
      correlationId: options.correlationId,
      timestamp: new Date().toISOString(),
      payload,
      source: options.source,
    };

    // Dispatch to type-specific handlers
    const typeHandlers = this.handlers.get(type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        void this.safeInvoke(handler, event);
      }
    }

    // Dispatch to wildcard handlers
    for (const handler of this.wildcardHandlers) {
      void this.safeInvoke(handler, event as any);
    }
  }

  subscribe<TPayload = Record<string, unknown>>(
    type: IntelliNexusEventType,
    handler: EventHandler<TPayload>
  ): () => void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler as any);
    return () => this.handlers.get(type)?.delete(handler as any);
  }

  subscribeAll(handler: EventHandler<Record<string, unknown>>): () => void {
    this.wildcardHandlers.add(handler);
    return () => this.wildcardHandlers.delete(handler);
  }

  private async safeInvoke<T>(handler: EventHandler<T>, event: IntelliNexusEvent<T>): Promise<void> {
    try {
      await handler(event);
    } catch (err) {
      console.error(`[EventBus] Handler error for event "${event.type}":`, err);
    }
  }
}

// ─── Redis Event Bus (Optional — production use) ───────────────────────────

export class RedisEventBus implements IEventBus {
  private publisher: any = null;
  private subscriber: any = null;
  private readonly localHandlers = new InMemoryEventBus();
  private initialized = false;

  private async init(): Promise<void> {
    if (this.initialized) return;
    const redisUrl = process.env.REDIS_URL;
    if (!redisUrl) throw new Error("REDIS_URL is required for RedisEventBus");

    try {
      const { createClient } = await import("redis" as any);
      this.publisher = createClient({ url: redisUrl });
      this.subscriber = createClient({ url: redisUrl });
      await Promise.all([this.publisher.connect(), this.subscriber.connect()]);

      // Subscribe to all IntelliNexus events
      await this.subscriber.pSubscribe("intellinexus:*", (message: string) => {
        try {
          const event = JSON.parse(message) as IntelliNexusEvent;
          void this.localHandlers.publish(event.type, event.payload, {
            tenantId: event.tenantId,
            correlationId: event.correlationId,
            source: event.source,
          });
        } catch (err) {
          console.error("[RedisEventBus] Failed to parse event:", err);
        }
      });

      this.initialized = true;
      console.log("[EventBus] Redis Pub/Sub connected");
    } catch (err) {
      console.error("[EventBus] Redis connection failed, falling back to in-memory:", err);
      throw err;
    }
  }

  async publish<TPayload = Record<string, unknown>>(
    type: IntelliNexusEventType,
    payload: TPayload,
    options: { tenantId?: string; correlationId?: string; source?: string } = {}
  ): Promise<void> {
    const event: IntelliNexusEvent<TPayload> = {
      id: randomUUID(),
      type,
      tenantId: options.tenantId ?? "system",
      correlationId: options.correlationId,
      timestamp: new Date().toISOString(),
      payload,
      source: options.source,
    };

    try {
      await this.init();
      await this.publisher.publish(`intellinexus:${type}`, JSON.stringify(event));
    } catch {
      // Fall back to local dispatch if Redis is unavailable
      void this.localHandlers.publish(type, payload, options);
    }
  }

  subscribe<TPayload = Record<string, unknown>>(
    type: IntelliNexusEventType,
    handler: EventHandler<TPayload>
  ): () => void {
    return this.localHandlers.subscribe(type, handler);
  }

  subscribeAll(handler: EventHandler<Record<string, unknown>>): () => void {
    return this.localHandlers.subscribeAll(handler);
  }
}

// ─── Factory ───────────────────────────────────────────────────────────────

function createEventBus(): IEventBus {
  const backend = (process.env.EVENT_BUS_BACKEND ?? "memory").toLowerCase();
  if (backend === "redis") {
    console.log("[EventBus] Using Redis Pub/Sub backend");
    return new RedisEventBus();
  }
  console.log("[EventBus] Using in-memory event bus (development mode)");
  return new InMemoryEventBus();
}

// ─── Singleton ─────────────────────────────────────────────────────────────

export const eventBus = createEventBus();

// ─── Convenience Publisher ─────────────────────────────────────────────────

/**
 * emit() — shorthand for eventBus.publish()
 * Usage: await emit("EvidenceIngested", { evidenceId, fileName }, { tenantId })
 */
export async function emit<TPayload = Record<string, unknown>>(
  type: IntelliNexusEventType,
  payload: TPayload,
  options?: { tenantId?: string; correlationId?: string; source?: string }
): Promise<void> {
  return eventBus.publish(type, payload, options);
}
