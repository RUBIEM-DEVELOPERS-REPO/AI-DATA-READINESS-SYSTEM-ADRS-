import fs from "fs";
import path from "path";
import OpenAI from "openai";

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

const CONFIG_FILE = path.resolve(process.cwd(), ".adrs-ai-config.json");
const DEFAULT_PROVIDER: AiProviderName = "openai";

function readPersistedConfig(): Partial<AiProviderConfig> {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return {};
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    if (!raw.trim()) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    console.warn("[AI Provider] Unable to read persisted config:", error);
    return {};
  }
}

function normalizeProvider(provider?: string): AiProviderName {
  const value = (provider || "").toLowerCase();
  if (value === "groq") return "groq";
  if (value === "custom" || value === "openai-compatible" || value === "compatible") return "openai-compatible";
  return DEFAULT_PROVIDER;
}

export function getAiProviderConfig(): AiProviderConfig {
  const persisted = readPersistedConfig();

  const provider = normalizeProvider(process.env.AI_PROVIDER || persisted.provider || "openai");
  const apiKey = process.env.AI_PROVIDER_API_KEY || process.env.AI_INTEGRATIONS_OPENAI_API_KEY || process.env.OPENAI_API_KEY || persisted.apiKey || "";
  const persistedBaseUrl = process.env.AI_PROVIDER_BASE_URL || process.env.AI_INTEGRATIONS_OPENAI_BASE_URL || persisted.baseUrl || "";
  const baseUrl = persistedBaseUrl || (provider === "groq" ? "https://api.groq.com/openai/v1" : "https://api.openai.com/v1");
  const defaultTextModel = provider === "groq" ? "llama-3.3-70b-versatile" : "gpt-4.1-mini";
  const defaultAudioModel = provider === "groq" ? "distil-whisper-large-v3-en" : "gpt-4o-mini-transcribe";
  const defaultVisionModel = provider === "groq" ? "llama-3.2-90b-vision-preview" : "gpt-4o";
  const textModel = provider === "groq" ? defaultTextModel : (process.env.AI_TEXT_MODEL || persisted.textModel || defaultTextModel);
  const chatModel = provider === "groq" ? defaultTextModel : (process.env.AI_CHAT_MODEL || persisted.chatModel || textModel);
  const audioModel = provider === "groq" ? defaultAudioModel : (process.env.AI_AUDIO_MODEL || persisted.audioModel || defaultAudioModel);
  const visionModel = provider === "groq" ? defaultVisionModel : (process.env.AI_VISION_MODEL || persisted.visionModel || defaultVisionModel);
  const imageModel = process.env.AI_IMAGE_MODEL || persisted.imageModel || "gpt-image-1";
  const embeddingModel = process.env.AI_EMBEDDING_MODEL || persisted.embeddingModel || "text-embedding-3-small";

  return {
    provider,
    apiKey,
    baseUrl,
    textModel,
    chatModel,
    audioModel,
    visionModel,
    imageModel,
    embeddingModel,
  };
}

export function saveAiProviderConfig(input: Partial<AiProviderConfig>): AiProviderConfig {
  const current = getAiProviderConfig();
  const updated = {
    ...current,
    ...input,
    provider: normalizeProvider(input.provider || current.provider),
  };

  fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2));

  process.env.AI_PROVIDER = updated.provider;
  process.env.AI_PROVIDER_API_KEY = updated.apiKey || "";
  process.env.AI_PROVIDER_BASE_URL = updated.baseUrl || "";
  process.env.AI_TEXT_MODEL = updated.textModel || "";
  process.env.AI_CHAT_MODEL = updated.chatModel || updated.textModel || "";
  process.env.AI_AUDIO_MODEL = updated.audioModel || "";
  process.env.AI_VISION_MODEL = updated.visionModel || "";
  process.env.AI_IMAGE_MODEL = updated.imageModel || "";
  process.env.AI_EMBEDDING_MODEL = updated.embeddingModel || "";

  return updated;
}

export function createAiClient(config: AiProviderConfig = getAiProviderConfig()): OpenAI {
  if (!config.apiKey) {
    throw new Error("AI provider is not configured. Set an API key or configure the provider from the admin settings.");
  }

  if (config.provider === "openai-compatible" && !config.baseUrl) {
    throw new Error("baseUrl is required for openai-compatible providers.");
  }

  return new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });
}

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
