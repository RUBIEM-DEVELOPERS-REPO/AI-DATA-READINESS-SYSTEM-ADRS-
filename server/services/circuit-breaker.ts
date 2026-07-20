/**
 * circuit-breaker.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lightweight circuit breaker + timeout utilities for AI and external calls.
 *
 * No additional npm dependencies — pure Node.js.
 *
 * Usage:
 *   const aiBreaker = new CircuitBreaker({ name: "openai", failureThreshold: 5, resetTimeoutMs: 30_000 });
 *
 *   const result = await aiBreaker.execute(
 *     () => withTimeout(openai.chat.completions.create(...), 30_000, "OpenAI")
 *   );
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

export interface CircuitBreakerOptions {
  /** Descriptive name used in error messages and logs. */
  name: string;
  /** Number of consecutive failures before the circuit trips. */
  failureThreshold?: number;
  /** Milliseconds to wait in OPEN state before attempting HALF_OPEN. */
  resetTimeoutMs?: number;
  /** Optional callback invoked on state changes. */
  onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void;
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureAt: string | null;
  lastSuccessAt: string | null;
  openedAt: string | null;
}

// ─── withTimeout ──────────────────────────────────────────────────────────────

/**
 * Reject a promise if it does not resolve within `ms` milliseconds.
 *
 * @param promise  The promise to race.
 * @param ms       Timeout duration in milliseconds.
 * @param label    Human-readable label for the error message.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = "operation"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(
        Object.assign(
          new Error(`${label} timed out after ${ms}ms`),
          { code: "TIMEOUT", label }
        )
      );
    }, ms);

    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err)   => { clearTimeout(timer); reject(err); }
    );
  });
}

// ─── CircuitBreaker ───────────────────────────────────────────────────────────

export class CircuitBreaker {
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly resetTimeoutMs: number;
  private readonly onStateChange?: (name: string, from: CircuitState, to: CircuitState) => void;

  private state: CircuitState = "CLOSED";
  private failures = 0;
  private successes = 0;
  private lastFailureAt: Date | null = null;
  private lastSuccessAt: Date | null = null;
  private openedAt: Date | null = null;

  constructor(opts: CircuitBreakerOptions) {
    this.name = opts.name;
    this.failureThreshold = opts.failureThreshold ?? 5;
    this.resetTimeoutMs = opts.resetTimeoutMs ?? 30_000;
    this.onStateChange = opts.onStateChange;
  }

  private transition(to: CircuitState) {
    const from = this.state;
    if (from === to) return;
    this.state = to;
    this.onStateChange?.(this.name, from, to);
  }

  /**
   * Execute a function through the circuit breaker.
   * - CLOSED: executes normally; records successes/failures.
   * - OPEN:   immediately rejects with a CIRCUIT_OPEN error.
   * - HALF_OPEN: allows one probe; transitions to CLOSED on success or OPEN on failure.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if OPEN circuit should attempt HALF_OPEN
    if (this.state === "OPEN") {
      const elapsed = this.openedAt ? Date.now() - this.openedAt.getTime() : Infinity;
      if (elapsed >= this.resetTimeoutMs) {
        this.transition("HALF_OPEN");
      } else {
        throw Object.assign(
          new Error(`Circuit breaker [${this.name}] is OPEN — service unavailable. Retry in ${Math.ceil((this.resetTimeoutMs - elapsed) / 1000)}s.`),
          { code: "CIRCUIT_OPEN", circuitName: this.name }
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure();
      throw err;
    }
  }

  private onSuccess() {
    this.lastSuccessAt = new Date();
    this.successes++;
    if (this.state === "HALF_OPEN") {
      this.failures = 0;
      this.openedAt = null;
      this.transition("CLOSED");
    }
  }

  private onFailure() {
    this.lastFailureAt = new Date();
    this.failures++;
    if (this.state === "HALF_OPEN" || this.failures >= this.failureThreshold) {
      this.openedAt = new Date();
      this.transition("OPEN");
    }
  }

  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureAt: this.lastFailureAt?.toISOString() ?? null,
      lastSuccessAt: this.lastSuccessAt?.toISOString() ?? null,
      openedAt: this.openedAt?.toISOString() ?? null,
    };
  }
}

// ─── Pre-configured breakers ──────────────────────────────────────────────────

/**
 * Shared circuit breaker for the AI provider (OpenAI / Groq).
 * Trips after 5 consecutive failures; resets after 30 seconds.
 */
export const aiCircuitBreaker = new CircuitBreaker({
  name: "ai-provider",
  failureThreshold: 5,
  resetTimeoutMs: 30_000,
  onStateChange: (name, from, to) => {
    console.warn(`[CircuitBreaker] ${name}: ${from} → ${to}`);
  },
});

/**
 * Shared circuit breaker for external connector/HTTP calls.
 * Trips after 3 consecutive failures; resets after 60 seconds.
 */
export const connectorCircuitBreaker = new CircuitBreaker({
  name: "connector",
  failureThreshold: 3,
  resetTimeoutMs: 60_000,
  onStateChange: (name, from, to) => {
    console.warn(`[CircuitBreaker] ${name}: ${from} → ${to}`);
  },
});

/** Default AI call timeout: 45 seconds. */
export const AI_TIMEOUT_MS = 45_000;

/** Default connector/HTTP call timeout: 15 seconds. */
export const CONNECTOR_TIMEOUT_MS = 15_000;
