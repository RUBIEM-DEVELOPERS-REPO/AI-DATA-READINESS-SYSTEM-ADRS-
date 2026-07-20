/**
 * @deprecated This module belongs to the legacy Replit platform integration layer.
 * It is NOT used in the production code path. See LEGACY_MODULES.md for the
 * deprecation plan. This module will be removed in a future major release (v2.0.0).
 */
export { registerAudioRoutes } from "./routes";
export {
  detectAudioFormat,
  convertToWav,
  ensureCompatibleFormat,
  type AudioFormat,
  voiceChat,
  voiceChatStream,
  textToSpeech,
  textToSpeechStream,
  speechToText,
  speechToTextStream,
} from "./client";
