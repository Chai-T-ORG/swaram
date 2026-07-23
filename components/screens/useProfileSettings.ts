"use client";

/**
 * Profile & settings logic — every binding to voiceSettings, groqSTT,
 * profileStore, and the Supabase backup moved verbatim from the old page.
 */

import { useEffect, useState } from "react";
import { useVoicePage } from "@/components/voice/VoiceProvider";
import {
  getProfile,
  setProfile,
  clearProfile,
  getCloudConsent,
  setCloudConsent,
} from "@/lib/storage/profileStore";
import {
  isSupabaseConfigured,
  syncProfileToCloud,
  fetchProfileFromCloud,
  deleteCloudProfile,
} from "@/lib/storage/supabaseClient";
import {
  listVoices,
  speak,
  loadKokoro,
  subscribeKokoroStatus,
  type KokoroStatus,
} from "@/lib/voice/textToSpeech";
import {
  getVoiceSettings,
  setVoiceSettings,
  DEFAULT_VOICE_SETTINGS,
  type TtsProvider,
  type SttProvider,
  type MicMode,
} from "@/lib/voice/voiceSettings";
import { getGroqKey, setGroqKey, probeGroqAvailability } from "@/lib/voice/groqSTT";
import { setHapticsEnabled, haptic } from "@/lib/voice/haptics";
import { clearNames } from "@/lib/voice/nameDictionary";
import type { ProfileData } from "@/lib/types";

export const PROFILE_FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: "full_name", label: "Full Name" },
  { key: "date_of_birth", label: "Date of Birth", hint: "DD/MM/YYYY" },
  { key: "gender", label: "Gender" },
  { key: "category", label: "Category", hint: "General, OBC, SC, ST, or EWS" },
  { key: "father_name", label: "Father's Name" },
  { key: "mother_name", label: "Mother's Name" },
  { key: "guardian_name", label: "Guardian's Name" },
  { key: "address", label: "Address" },
  { key: "city", label: "City or Village" },
  { key: "state", label: "State" },
  { key: "pincode", label: "PIN Code" },
  { key: "email", label: "Email Address" },
  { key: "phone", label: "Mobile Number" },
];

export const STT_LANGS = [
  ["en-IN", "English (India)"],
  ["en-US", "English (US)"],
  ["en-GB", "English (UK)"],
  ["hi-IN", "हिन्दी — Hindi"],
  ["ml-IN", "മലയാളം — Malayalam"],
  ["fr-FR", "Français — French"],
] as const;

export type ProfileTone = "info" | "success" | "warning" | "error";
export type ProfileSection = "voice" | "personal" | "cloud";

export function useProfileSettings() {
  const [values, setValues] = useState<ProfileData>({});
  const [status, setStatus] = useState(
    "Your profile lets me auto-fill common fields. It stays on this device unless you turn on cloud backup.",
  );
  const [tone, setTone] = useState<ProfileTone>("info");
  const [consent, setConsent] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState<string>("");
  const [rate, setRate] = useState(DEFAULT_VOICE_SETTINGS.rate);
  const [sttLang, setSttLang] = useState(DEFAULT_VOICE_SETTINGS.sttLang);
  const [ttsProvider, setTtsProvider] = useState<TtsProvider>(DEFAULT_VOICE_SETTINGS.ttsProvider);
  const [sttProvider, setSttProvider] = useState<SttProvider>(DEFAULT_VOICE_SETTINGS.sttProvider);
  const [micMode, setMicMode] = useState<MicMode>(DEFAULT_VOICE_SETTINGS.micMode);
  const [hapticsEnabled, setHapticsState] = useState<boolean>(DEFAULT_VOICE_SETTINGS.hapticsEnabled);
  const [groqKey, setGroqKeyState] = useState("");
  const [groqEnvKey, setGroqEnvKey] = useState(false);
  const [azureEnvKey, setAzureEnvKey] = useState(false);
  const [kokoroState, setKokoroState] = useState<KokoroStatus>({ state: "idle" });
  const [cloudTtsEngine, setCloudTtsEngine] = useState<"google" | "azure" | "kokoro">("google");
  const [activeSection, setActiveSection] = useState<ProfileSection>("voice");
  const configured = isSupabaseConfigured();

  useVoicePage({
    title: "Your profile and settings",
    hint: "Here you can edit saved details and tune my voice.",
    description:
      "Profile page. Edit the details I use for auto-fill, change my speaking voice and speed, and manage optional cloud backup. Aadhaar and other ID numbers are never stored here.",
    commands: [
      [/test (the )?voice|preview voice/, () => speak("Hello! This is how I sound at your current settings."), "test the voice"],
      [/faster/, () => changeRate(0.1), "faster"],
      [/slower/, () => changeRate(-0.1), "slower"],
    ],
  });

  useEffect(() => {
    setValues(getProfile());
    setConsent(getCloudConsent());
    const settings = getVoiceSettings();
    setVoiceURI(settings.voiceURI ?? "");
    setRate(settings.rate);
    setSttLang(settings.sttLang);
    setTtsProvider(settings.ttsProvider);
    setSttProvider(settings.sttProvider);
    setMicMode(settings.micMode);
    setHapticsState(settings.hapticsEnabled);
    setGroqKeyState(getGroqKey());
    void probeGroqAvailability(); // warms the availability cache
    fetch("/api/transcribe")
      .then((r) => r.json())
      .then((d) => {
        setGroqEnvKey(Boolean(d.envKey));
        setAzureEnvKey(Boolean(d.azure));
      })
      .catch(() => {});
    fetch("/api/tts")
      .then((r) => r.json())
      .then((d) => {
        setCloudTtsEngine(d.default === "azure" ? "azure" : d.default === "kokoro" ? "kokoro" : "google");
      })
      .catch(() => {});
    setVoices(listVoices());
    const timer = setTimeout(() => setVoices(listVoices()), 600);
    const unsubscribe = subscribeKokoroStatus((status) => setKokoroState(status));

    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  function changeRate(delta: number) {
    const next = Math.round((getVoiceSettings().rate + delta) * 100) / 100;
    const applied = setVoiceSettings({ rate: next }).rate;
    setRate(applied);
    speak(`Speed ${applied.toFixed(2)}. This is how I sound now.`);
  }

  function save() {
    setProfile(values);
    setValues(getProfile());
    setTone("success");
    setStatus("Profile saved on this device.");
    speak("Profile saved.");
  }

  function clearAll() {
    if (!window.confirm("Delete all saved profile details from this device?")) return;
    clearProfile();
    setValues({});
    setTone("success");
    setStatus("Profile cleared from this device.");
  }

  function handleConsentChange(next: boolean) {
    setConsent(next);
    setCloudConsent(next);
    setTone("info");
    setStatus(
      next
        ? "Cloud backup is on. Your profile — never Aadhaar or other IDs — can now sync."
        : "Cloud backup is off. Your profile stays only on this device.",
    );
  }

  async function syncNow() {
    setCloudBusy(true);
    const result = await syncProfileToCloud(getProfile());
    setCloudBusy(false);
    setTone(result.ok ? "success" : "error");
    setStatus(result.ok ? "Profile backed up to the cloud." : (result.error ?? "Backup failed."));
  }

  async function fetchCloud() {
    setCloudBusy(true);
    const cloud = await fetchProfileFromCloud();
    setCloudBusy(false);
    if (cloud) {
      setProfile({ ...getProfile(), ...cloud });
      setValues(getProfile());
      setTone("success");
      setStatus("Profile restored from your cloud backup.");
    } else {
      setTone("warning");
      setStatus("No cloud backup found.");
    }
  }

  async function deleteCloud() {
    if (!window.confirm("Delete your cloud backup? Your on-device profile is kept.")) return;
    setCloudBusy(true);
    const result = await deleteCloudProfile();
    setCloudBusy(false);
    setTone(result.ok ? "success" : "error");
    setStatus(result.ok ? "Cloud backup deleted." : (result.error ?? "Delete failed."));
  }

  function selectVoice(uri: string) {
    setVoiceURI(uri);
    setVoiceSettings({ voiceURI: uri || null });
    speak("This is how I sound.", { voiceURI: uri || undefined });
  }

  function selectRate(next: number) {
    setRate(next);
    setVoiceSettings({ rate: next });
  }

  function selectLang(lang: string) {
    setSttLang(lang);
    setVoiceSettings({ sttLang: lang });
  }

  function selectTtsProvider(next: TtsProvider) {
    setTtsProvider(next);
    setVoiceSettings({ ttsProvider: next });

    if (next === "local") {
      if (kokoroState.state === "ready") {
        speak("Using the on-device AI voice. This is how I sound.");
      } else {
        speak(
          "Downloading the on-device AI voice in the background. I'll keep this voice and switch over automatically when it's ready.",
        );
        void loadKokoro();
      }
    } else if (next === "cloud") {
      speak("Using the cloud neural voice. This is how I sound.");
    } else {
      speak("Using the system voice.");
    }
  }

  function selectMicMode(next: MicMode) {
    setMicMode(next);
    setVoiceSettings({ micMode: next });
    speak(
      next === "ptt"
        ? "Push to talk. Hold the space bar or tap the microphone, then speak. Best in noisy places."
        : "Hands-free. I'll listen continuously. Best in a quiet room.",
    );
  }

  function toggleHaptics(next: boolean) {
    setHapticsState(next);
    setVoiceSettings({ hapticsEnabled: next });
    setHapticsEnabled(next);
    if (next) haptic("success"); // let them feel it turn on
    speak(next ? "Vibration cues on." : "Vibration cues off.");
  }

  function forgetNames() {
    clearNames();
    setTone("success");
    const msg = "Cleared the names I'd learned. I'll ask fresh next time.";
    setStatus(msg);
    speak(msg);
  }

  function selectSttProvider(next: SttProvider) {
    setSttProvider(next);
    setVoiceSettings({ sttProvider: next });
    if (next === "groq") speak("Using cloud recognition. This is the most accurate option.");
    else if (next === "azure") speak("Using Azure regional recognition, tuned for your selected language.");
    else if (next === "azure-stream") speak("Using Azure real-time recognition. I'll understand any language as you speak.");
    else if (next === "sarvam-stream") speak("Using Sarvam real-time recognition — the fastest option for Indian languages.");
    else if (next === "whisper") speak("Using on-device recognition.");
    else if (next === "native") speak("Using the browser's built-in recognition.");
    else speak("Using automatic recognition. I'll pick the best available.");
  }

  function saveGroqKey() {
    setGroqKey(groqKey);
    void probeGroqAvailability();
    speak(groqKey.trim() ? "Cloud key saved." : "Cloud key cleared.");
  }

  function retryKokoro() {
    speak("Retrying AI voice download.");
    void loadKokoro();
  }

  return {
    // state
    values,
    setValues,
    status,
    tone,
    consent,
    cloudBusy,
    voices,
    voiceURI,
    rate,
    sttLang,
    ttsProvider,
    sttProvider,
    micMode,
    hapticsEnabled,
    groqKey,
    setGroqKeyState,
    groqEnvKey,
    azureEnvKey,
    kokoroState,
    cloudTtsEngine,
    activeSection,
    setActiveSection,
    configured,
    // actions
    save,
    clearAll,
    handleConsentChange,
    syncNow,
    fetchCloud,
    deleteCloud,
    selectVoice,
    selectRate,
    selectLang,
    selectTtsProvider,
    selectMicMode,
    toggleHaptics,
    forgetNames,
    selectSttProvider,
    saveGroqKey,
    retryKokoro,
  };
}

export type ProfileSettings = ReturnType<typeof useProfileSettings>;
