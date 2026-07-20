/**
 * ai-provider.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * IntelliNexus AI Provider Abstraction — Cloud-Native State Remediation
 *
 * ARCHITECTURE ENFORCEMENT:
 *   ✅ GAP-005 FIXED: AI config is no longer mutated into process.env.
 *      Config is stored in the `systemConfig` DB table and read at call time
 *      with a configurable TTL cache. All replicas see the same config within
 *      the TTL window after an admin change.
 *   ✅ Cloud-Native: no per-process state that diverges across replicas
 *   ✅ Configurable: model routing via env vars AND DB config (DB wins)
 *   ✅ Extensible: new providers added without code changes (openai-compatible)
 *   ✅ Multi-Tenant: model routing is global config (per-tenant model routing
 *      can be added as a future feature via tenant-scoped systemConfig)
 */

import OpenAI from "openai";
import { db } from "../db";
import { sql } from "drizzle-orm";

export type AiProviderName = "openai" | "groq" | "openai-compatible" | "custom";

export interface AiProviderConfig {
  provider: AiProviderName;
  apiKey?: string;
  baseUrl?: string;
  textModel?: string;
  chatModel?: string;
  audioModel?: string;
  visionModel?: string;
  imageModel?: string;
  embeddingModel?: string;
}

// ─── TTL Cache (replaces process.env mutation) ─────────────────────────────

interface CachedConfig {
  config: AiProviderConfig;
  expiresAt: number;
}

const CONFIG_TTL_MS = 60_000; // 60 seconds — admin changes propagate within 1 minute
let cachedEntry: CachedConfig | null = null;

const DEFAULT_PROVIDER: AiProviderName = "openai";

function normalizeProvider(provider?: string): AiProviderName {
  const value = (provider || "").toLowerCase();
  if (value === "groq") return "groq";
  if (value === "custom" || value === "openai-compatible" || value === "compatible") return "openai-compatible";
  return DEFAULT_PROVIDER;
}

function buildConfigFromValues(values: Record<string, string | null | undefined>): AiProviderConfig {
  const provider = normalizeProvider(values.provider || process.env.AI_PROVIDER || "openai");
  const apiKey = values.apiKey
    || process.env.AI_PROVIDER_API_KEY
    || process.env.AI_INTEGRATIONS_OPENAI_API_KEY
    || process.env.OPENAI_API_KEY
    || "";
  const persistedBaseUrl = values.baseUrl
    || process.env.AI_PROVIDER_BASE_URL
    || process.env.AI_INTEGRATIONS_OPENAI_BASE_URL
    || "";
  const baseUrl = persistedBaseUrl
    || (provider === "groq" ? "https://api.groq.com/openai/v1" : "https://api.openai.com/v1");

  const defaultTextModel = provider === "groq" ? "llama-3.3-70b-versatile" : "gpt-4.1-mini";
  const defaultAudioModel = provider === "groq" ? "distil-whisper-large-v3-en" : "gpt-4o-mini-transcribe";
  const defaultVisionModel = provider === "groq" ? "llama-3.2-90b-vision-preview" : "gpt-4o";

  const textModel = values.textModel
    || (provider === "groq" ? defaultTextModel : (process.env.AI_TEXT_MODEL || defaultTextModel));
  const chatModel = values.chatModel
    || (provider === "groq" ? defaultTextModel : (process.env.AI_CHAT_MODEL || textModel));
  const audioModel = values.audioModel
    || (provider === "groq" ? defaultAudioModel : (process.env.AI_AUDIO_MODEL || defaultAudioModel));
  const visionModel = values.visionModel
    || (provider === "groq" ? defaultVisionModel : (process.env.AI_VISION_MODEL || defaultVisionModel));
  const imageModel = values.imageModel || process.env.AI_IMAGE_MODEL || "gpt-image-1";
  const embeddingModel = values.embeddingModel || process.env.AI_EMBEDDING_MODEL || "text-embedding-3-small";

  return {
    provider, apiKey, baseUrl, textModel, chatModel, audioModel, visionModel, imageModel, embeddingModel,
  };
}

// ─── DB Config Loading ─────────────────────────────────────────────────────

async function loadConfigFromDb(): Promise<Record<string, string | null>> {
  try {
    const res = await db.execute(sql`
      SELECT key, value FROM system_config
      WHERE key IN (
        'ai_provider', 'ai_provider_api_key', 'ai_provider_base_url',
        'ai_text_model', 'ai_chat_model', 'ai_audio_model',
        'ai_vision_model', 'ai_image_model', 'ai_embedding_model'
      )
    `);
    const rows = res.rows || [];
    return Object.fromEntries(rows.map((r: any) => [r.key, r.value]));
  } catch {
    return {};
  }
}

// ─── Public API ────────────────────────────────────────────────────────────

/**
 * Initialize AI Provider Config from database on startup.
 * Populates the TTL cache — does NOT write to process.env.
 */
export async function initAiProviderConfig(): Promise<void> {
  try {
    const dbValues = await loadConfigFromDb();
    const config = buildConfigFromValues({
      provider: dbValues["ai_provider"],
      apiKey: dbValues["ai_provider_api_key"],
      baseUrl: dbValues["ai_provider_base_url"],
      textModel: dbValues["ai_text_model"],
      chatModel: dbValues["ai_chat_model"],
      audioModel: dbValues["ai_audio_model"],
      visionModel: dbValues["ai_vision_model"],
      imageModel: dbValues["ai_image_model"],
      embeddingModel: dbValues["ai_embedding_model"],
    });
    cachedEntry = { config, expiresAt: Date.now() + CONFIG_TTL_MS };
    console.log(`[AI Provider] Initialized: provider=${config.provider}, model=${config.textModel}`);
  } catch (error) {
    console.warn("[AI Provider] Failed to load config from DB, falling back to env vars:", error);
    cachedEntry = { config: buildConfigFromValues({}), expiresAt: Date.now() + CONFIG_TTL_MS };
  }
}

/**
 * Get current AI provider config.
 * Refreshes from DB if the TTL has expired (async, non-blocking on cache hit).
 */
export function getAiProviderConfig(): AiProviderConfig {
  if (!cachedEntry || Date.now() > cachedEntry.expiresAt) {
    // Trigger async refresh but return stale config (or env-based) immediately
    void loadConfigFromDb().then(dbValues => {
      const config = buildConfigFromValues({
        provider: dbValues["ai_provider"],
        apiKey: dbValues["ai_provider_api_key"],
        baseUrl: dbValues["ai_provider_base_url"],
        textModel: dbValues["ai_text_model"],
        chatModel: dbValues["ai_chat_model"],
        audioModel: dbValues["ai_audio_model"],
        visionModel: dbValues["ai_vision_model"],
        imageModel: dbValues["ai_image_model"],
        embeddingModel: dbValues["ai_embedding_model"],
      });
      cachedEntry = { config, expiresAt: Date.now() + CONFIG_TTL_MS };
    }).catch(() => {/* retain stale cache on error */});

    if (!cachedEntry) {
      // First call before initAiProviderConfig() — build from env
      const config = buildConfigFromValues({});
      cachedEntry = { config, expiresAt: Date.now() + CONFIG_TTL_MS };
    }
  }
  return cachedEntry.config;
}

/**
 * Save AI provider config — persists to DB only (NOT to process.env).
 * All replicas will pick up the change within CONFIG_TTL_MS milliseconds.
 */
export async function saveAiProviderConfig(input: Partial<AiProviderConfig>): Promise<AiProviderConfig> {
  const current = getAiProviderConfig();
  const updated: AiProviderConfig = {
    ...current,
    ...input,
    provider: normalizeProvider(input.provider || current.provider),
  };

  // Persist each changed key to the DB systemConfig table
  const keysMap: Record<keyof AiProviderConfig, string> = {
    provider: "ai_provider",
    apiKey: "ai_provider_api_key",
    baseUrl: "ai_provider_base_url",
    textModel: "ai_text_model",
    chatModel: "ai_chat_model",
    audioModel: "ai_audio_model",
    visionModel: "ai_vision_model",
    imageModel: "ai_image_model",
    embeddingModel: "ai_embedding_model",
  };

  await Promise.allSettled(
    Object.entries(input).map(([k, val]) => {
      const dbKey = keysMap[k as keyof AiProviderConfig];
      if (!dbKey || val === undefined) return Promise.resolve();
      return db.execute(sql`
        INSERT INTO system_config (key, value, updated_by, updated_at)
        VALUES (${dbKey}, ${val as string}, 'system', NOW())
        ON CONFLICT (key) DO UPDATE
          SET value = ${val as string}, updated_by = 'system', updated_at = NOW()
      `);
    })
  );

  // Immediately invalidate local cache so this replica picks up the change
  cachedEntry = { config: updated, expiresAt: Date.now() + CONFIG_TTL_MS };

  return updated;
}

// ─── Client Factory ────────────────────────────────────────────────────────

export function createAiClient(config: AiProviderConfig = getAiProviderConfig()): OpenAI {
  if (!config.apiKey) {
    throw new Error(
      "AI provider is not configured. Set an API key or configure the provider from the admin settings."
    );
  }
  if (config.provider === "openai-compatible" && !config.baseUrl) {
    throw new Error("baseUrl is required for openai-compatible providers.");
  }
  return new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl });
}

// ─── Model Accessors ────────────────────────────────────────────────────────

export function getChatModel(config: AiProviderConfig = getAiProviderConfig()): string {
  return config.chatModel || config.textModel || "gpt-4.1-mini";
}

export function getTextModel(config: AiProviderConfig = getAiProviderConfig()): string {
  return config.textModel || config.chatModel || "gpt-4.1-mini";
}

export function getAudioModel(config: AiProviderConfig = getAiProviderConfig()): string {
  return config.audioModel || "gpt-4o-mini-transcribe";
}

export function getVisionModel(config: AiProviderConfig = getAiProviderConfig()): string {
  return config.visionModel || config.chatModel || config.textModel || "gpt-4o";
}

export function getEmbeddingModel(config: AiProviderConfig = getAiProviderConfig()): string {
  return config.embeddingModel || "text-embedding-3-small";
}

export function getImageModel(config: AiProviderConfig = getAiProviderConfig()): string {
  return config.imageModel || "gpt-image-1";
}
