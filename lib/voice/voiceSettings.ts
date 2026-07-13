/** User-tunable voice settings, persisted locally. */

/**
 * "cloud"  — neural voice via our /api/tts proxy (Google free, or Azure if a key
 *            is set). Plays MP3 through <audio>, so it works on iOS Safari and
 *            low-end phones. The default.
 * "system" — the browser's built-in speechSynthesis (offline, instant, varies).
 * "local"  — Kokoro neural TTS fully on-device (private/offline, heavy; opt-in).
 * "google" — legacy alias, treated as "cloud".
 */
export type TtsProvider = "system" | "cloud" | "local" | "google";
/**
 * "groq"         — cloud Whisper via Groq (most accurate, needs internet + key)
 * "azure"        — cloud Azure Speech, REST (regional locales, server key + region)
 * "azure-stream" — cloud Azure Speech, real-time streaming SDK: partial results,
 *                  auto language detection, phrase-list biasing. Falls back to
 *                  the Azure REST path on any failure. (Opt-in / beta.)
 * "whisper"      — on-device Whisper (private, offline, heavier)
 * "native"       — the browser's built-in recognition (instant, no download)
 * "auto"         — groq if configured & online, else whisper if ready, else native
 */
export type SttProvider = "groq" | "azure" | "azure-stream" | "whisper" | "native" | "auto";
/**
 * "ptt"        — push-to-talk: capture only while the user holds space / taps
 *                the mic. Reliable in noisy/crowded rooms; nothing is recorded
 *                between activations.
 * "continuous" — hands-free always-listening (best in a quiet room only).
 */
export type MicMode = "ptt" | "continuous";

export interface VoiceSettings {
  /** Preferred SpeechSynthesis voiceURI; null = auto-pick best. */
  voiceURI: string | null;
  /** Speaking rate. 1.0 is the browser default. */
  rate: number;
  /** Recognition language. */
  sttLang: string;
  /** Use high-quality cloud voice fallback if offline engine is mocked/fails. */
  useCloudTTS: boolean; // Keep for migration compatibility
  /** Active Text-To-Speech engine provider. */
  ttsProvider: TtsProvider;
  /** Active Speech-To-Text engine provider. */
  sttProvider: SttProvider;
  /** Push-to-talk vs hands-free continuous listening. */
  micMode: MicMode;
  /** Whether the first-time model setup has completed successfully. */
  setupComplete: boolean;
}

const KEY = "swaram_voice_settings";

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  voiceURI: null,
  rate: 1.12,
  sttLang: "en-IN",
  useCloudTTS: true,
  ttsProvider: "cloud",       // Cloud neural voice via /api/tts — works on every device
  sttProvider: "groq",        // Cloud Whisper (Groq) — accurate & instant; native is the fallback
  micMode: "ptt",             // Push-to-talk by default — reliable in noisy rooms
  setupComplete: false,
};

export function getVoiceSettings(): VoiceSettings {
  if (typeof window === "undefined") return DEFAULT_VOICE_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_VOICE_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
    return {
      voiceURI: typeof parsed.voiceURI === "string" ? parsed.voiceURI : null,
      rate: clampRate(typeof parsed.rate === "number" ? parsed.rate : DEFAULT_VOICE_SETTINGS.rate),
      sttLang: typeof parsed.sttLang === "string" ? parsed.sttLang : DEFAULT_VOICE_SETTINGS.sttLang,
      useCloudTTS: typeof parsed.useCloudTTS === "boolean" ? parsed.useCloudTTS : DEFAULT_VOICE_SETTINGS.useCloudTTS,
      ttsProvider: isValidTtsProvider(parsed.ttsProvider) ? parsed.ttsProvider! : DEFAULT_VOICE_SETTINGS.ttsProvider,
      sttProvider: isValidSttProvider(parsed.sttProvider) ? parsed.sttProvider! : DEFAULT_VOICE_SETTINGS.sttProvider,
      micMode: parsed.micMode === "continuous" || parsed.micMode === "ptt" ? parsed.micMode : DEFAULT_VOICE_SETTINGS.micMode,
      setupComplete: typeof parsed.setupComplete === "boolean" ? parsed.setupComplete : DEFAULT_VOICE_SETTINGS.setupComplete,
    };
  } catch {
    return DEFAULT_VOICE_SETTINGS;
  }
}

export function setVoiceSettings(update: Partial<VoiceSettings>): VoiceSettings {
  const next = { ...getVoiceSettings(), ...update };
  next.rate = clampRate(next.rate);
  localStorage.setItem(KEY, JSON.stringify(next));
  return next;
}

function clampRate(rate: number): number {
  return Math.min(1.6, Math.max(0.7, rate));
}

function isValidTtsProvider(provider: any): provider is TtsProvider {
  return ["system", "cloud", "local", "google"].includes(provider);
}

/**
 * One-time migration for existing installs. Kokoro ("local") was the old default
 * and was silent on Safari/iOS/low-end phones — the exact "I can't hear the
 * voice" bug. Move those (and the legacy "google" alias) to the reliable cloud
 * voice, once. Users can still re-pick "local" afterward; the flag stops us from
 * overriding that choice on the next load.
 */
export function migrateVoiceSettings(): void {
  if (typeof window === "undefined") return;
  try {
    if (localStorage.getItem("swaram_settings_migrated") === "2") return;
    const cur = getVoiceSettings();
    if (cur.ttsProvider === "local" || cur.ttsProvider === "google") {
      setVoiceSettings({ ttsProvider: "cloud" });
    }
    localStorage.setItem("swaram_settings_migrated", "2");
  } catch {
    // migration is best-effort
  }
}

function isValidSttProvider(provider: any): provider is SttProvider {
  return ["groq", "azure", "azure-stream", "whisper", "native", "auto"].includes(provider);
}
