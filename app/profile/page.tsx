"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import StatusAnnouncer from "@/components/StatusAnnouncer";
import { useVoicePage } from "@/components/GlobalVoice";
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
import { listVoices, speak, loadKokoro, subscribeKokoroStatus, type KokoroStatus } from "@/lib/voice/textToSpeech";
import { getVoiceSettings, setVoiceSettings, DEFAULT_VOICE_SETTINGS, type TtsProvider, type SttProvider, type MicMode } from "@/lib/voice/voiceSettings";
import { getGroqKey, setGroqKey, probeGroqAvailability } from "@/lib/voice/groqSTT";
import type { ProfileData } from "@/lib/types";
import { motion } from "framer-motion";
import {
  IconArrowLeft,
  IconShield,
  IconWave,
  IconCheck,
  IconUser,
  IconSettings,
  IconUpload,
  IconTrash,
  IconSparkle,
  IconInfo,
  IconHelp
} from "@/components/icons";

const PROFILE_FIELDS: { key: string; label: string; hint?: string }[] = [
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

const STT_LANGS = [
  ["en-IN", "English (India)"],
  ["en-US", "English (US)"],
  ["en-GB", "English (UK)"],
  ["hi-IN", "हिन्दी — Hindi"],
  ["ml-IN", "മലയാളം — Malayalam"],
  ["fr-FR", "Français — French"],
] as const;

export default function ProfilePage() {
  const [values, setValues] = useState<ProfileData>({});
  const [status, setStatus] = useState(
    "Your profile lets me auto-fill common fields. It stays on this device unless you turn on cloud backup.",
  );
  const [tone, setTone] = useState<"info" | "success" | "warning" | "error">("info");
  const [consent, setConsent] = useState(false);
  const [cloudBusy, setCloudBusy] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState<string>("");
  const [rate, setRate] = useState(DEFAULT_VOICE_SETTINGS.rate);
  const [sttLang, setSttLang] = useState(DEFAULT_VOICE_SETTINGS.sttLang);
  const [useCloudTTS, setUseCloudTTS] = useState(DEFAULT_VOICE_SETTINGS.useCloudTTS);
  const [ttsProvider, setTtsProvider] = useState<TtsProvider>(DEFAULT_VOICE_SETTINGS.ttsProvider);
  const [sttProvider, setSttProvider] = useState<SttProvider>(DEFAULT_VOICE_SETTINGS.sttProvider);
  const [micMode, setMicMode] = useState<MicMode>(DEFAULT_VOICE_SETTINGS.micMode);
  const [groqKey, setGroqKeyState] = useState("");
  const [groqEnvKey, setGroqEnvKey] = useState(false);
  const [azureEnvKey, setAzureEnvKey] = useState(false);
  const [kokoroState, setKokoroState] = useState<KokoroStatus>({ state: "idle" });
  const [cloudTtsEngine, setCloudTtsEngine] = useState<"google" | "azure" | "kokoro">("google");
  const [activeSubTab, setActiveSubTab] = useState<"voice" | "personal" | "cloud">("voice");
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
    setUseCloudTTS(settings.useCloudTTS);
    setTtsProvider(settings.ttsProvider);
    setSttProvider(settings.sttProvider);
    setMicMode(settings.micMode);
    setGroqKeyState(getGroqKey());
    void probeGroqAvailability(); // warms the availability cache
    fetch("/api/transcribe").then((r) => r.json()).then((d) => {
      setGroqEnvKey(Boolean(d.envKey));
      setAzureEnvKey(Boolean(d.azure));
    }).catch(() => {});
    fetch("/api/tts").then((r) => r.json()).then((d) => {
      setCloudTtsEngine(d.default === "azure" ? "azure" : d.default === "kokoro" ? "kokoro" : "google");
    }).catch(() => {});
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

  const cardVariants = {
    hidden: { opacity: 0, y: 15 },
    visible: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 120, damping: 14 } },
  };

  return (
    <div className="flex-1 p-6 md:p-8 overflow-y-auto page-transition bg-surface">
      <div className="max-w-4xl mx-auto flex flex-col gap-8 text-left">
        
        {/* Breadcrumb */}
        <nav aria-label="Breadcrumb" className="self-start">
          <Link href="/" className="link-plain inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
            <IconArrowLeft className="h-4 w-4" />
            Back to home
          </Link>
        </nav>

        {/* Header Title */}
        <header className="border-b border-line pb-4 flex flex-col md:flex-row justify-between md:items-end gap-4">
          <div>
            <span className="eyebrow mb-1">Preferences</span>
            <h1 className="font-display text-3xl font-extrabold text-ink tracking-tight">Swaram Workspace Profile</h1>
            <p className="text-xs text-soft font-semibold mt-1">
              Customize speech synthesis engines and manage your on-device personal data vault.
            </p>
          </div>
        </header>

        <StatusAnnouncer message={status} tone={tone} />

        {/* PROFILE SUBTABS NAVBAR */}
        <div className="flex border-b border-line gap-2 overflow-x-auto pb-px">
          {[
            { id: "voice", label: "Voice Preferences", icon: <IconSettings className="h-4 w-4" /> },
            { id: "personal", label: "Personal Details", icon: <IconUser className="h-4 w-4" /> },
            { id: "cloud", label: "Cloud Sync (Optional)", icon: <IconUpload className="h-4 w-4" /> }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`px-4 py-2.5 font-bold text-xs whitespace-nowrap transition-all border-b-2 flex items-center gap-2 ${
                activeSubTab === tab.id
                  ? "border-accent text-accent"
                  : "border-transparent text-soft hover:text-ink"
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* TAB A: VOICE PREFERENCES */}
        {activeSubTab === "voice" && (
          <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-col gap-6"
          >
            <div className="card flex flex-col gap-5 border-line bg-raised shadow-sm">
              <div className="flex items-center gap-2 border-b border-line pb-3">
                <IconSettings className="h-5 w-5 text-accent" />
                <h2 className="font-display text-base font-extrabold text-ink">
                  Speech Synthesizer Configuration
                </h2>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="voice-select" className="text-xs font-bold text-soft uppercase">
                  Select speaking voice
                </label>
                <p className="text-xs text-faint font-semibold leading-relaxed">
                  Voices are loaded from your local browser and system. Chrome and Microsoft Edge include highly polished natural voice engines.
                </p>
                <div className="mt-1 flex flex-wrap gap-3">
                  <select
                    id="voice-select"
                    className="field-input max-w-sm flex-1 min-h-10 text-xs"
                    value={voiceURI}
                    onChange={(e) => {
                      setVoiceURI(e.target.value);
                      setVoiceSettings({ voiceURI: e.target.value || null });
                      speak("This is how I sound.", { voiceURI: e.target.value || undefined });
                    }}
                  >
                    <option value="">Automatic (recommended)</option>
                    {voices.map((voice) => (
                      <option key={voice.voiceURI} value={voice.voiceURI}>
                        {voice.name} ({voice.lang})
                      </option>
                    ))}
                  </select>
                  
                  <button
                    type="button"
                    className="btn btn-secondary min-h-10 px-4 text-xs font-bold shadow-sm"
                    onClick={() => speak("Hello! I'm Swaram. I'll read your forms and fill them as you speak.")}
                  >
                    <IconWave className="h-4 w-4 text-soft" />
                    <span>Preview Voice</span>
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5 max-w-sm">
                <label htmlFor="rate-slider" className="text-xs font-bold text-soft uppercase">
                  Speaking speed <span className="font-bold text-accent">({rate.toFixed(2)}&times;)</span>
                </label>
                <input
                  id="rate-slider"
                  type="range"
                  min={0.7}
                  max={1.6}
                  step={0.05}
                  value={rate}
                  className="w-full h-1.5 bg-line rounded-full appearance-none cursor-pointer accent-[#0d9488]"
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setRate(next);
                    setVoiceSettings({ rate: next });
                  }}
                  onPointerUp={() => speak("This is how fast I speak now.")}
                />
              </div>

              <div className="flex flex-col gap-1.5 max-w-sm">
                <label htmlFor="stt-lang" className="text-xs font-bold text-soft uppercase">
                  Assistant Language — voice, recognition &amp; replies
                </label>
                <select
                  id="stt-lang"
                  className="field-input min-h-10 text-xs"
                  value={sttLang}
                  onChange={(e) => {
                    setSttLang(e.target.value);
                    setVoiceSettings({ sttLang: e.target.value });
                  }}
                >
                  {STT_LANGS.map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Advanced TTS Engines */}
              <div className="flex flex-col gap-3.5 border-t border-line/65 pt-4 mt-2">
                <div className="flex flex-col gap-2">
                  <label htmlFor="tts-provider-select" className="text-xs font-bold text-soft uppercase">
                    Advanced Speech Generation Method
                  </label>
                  <select
                    id="tts-provider-select"
                    className="field-input max-w-sm min-h-10 text-xs"
                    value={ttsProvider === "google" ? "cloud" : ttsProvider}
                    onChange={(e) => {
                      const next = e.target.value as TtsProvider;
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
                    }}
                  >
                    <option value="cloud">Cloud Neural Voice &mdash; recommended, works on every device, no download</option>
                    <option value="system">System Voice &mdash; instant, uses your device&rsquo;s built-in voices</option>
                    <option value="local">On-Device AI Voice (Kokoro) &mdash; private &amp; offline, ~90MB download</option>
                  </select>

                  {(ttsProvider === "cloud" || ttsProvider === "google") && (
                    <p className="max-w-sm text-[11px] text-soft font-semibold leading-normal mt-1">
                      {cloudTtsEngine === "azure"
                        ? "Using Azure Neural voices — studio-grade — in your selected language."
                        : cloudTtsEngine === "kokoro"
                          ? "Using the natural Kokoro voice for English (runs on the server, so it works on every device). Other languages use Google, in the right language."
                          : "Using Google voices in your selected language. On a persistent server the natural Kokoro voice loads automatically for English; add an Azure key for studio-grade voices in every language."}
                    </p>
                  )}

                  {ttsProvider === "local" && kokoroState.state !== "idle" && (
                    <div
                      className="max-w-sm rounded-2xl border border-line bg-surface p-4 mt-3 animate-fade-in"
                      role="status"
                      aria-live="polite"
                    >
                      {kokoroState.state === "loading" && (
                        <div className="flex flex-col gap-2">
                          <p className="text-xs font-bold text-ink leading-tight">{kokoroState.detail}</p>
                          <div
                            role="progressbar"
                            aria-label="AI voice download progress"
                            aria-valuenow={Math.round(kokoroState.progress * 100)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            className="h-2 w-full overflow-hidden rounded-full bg-line"
                          >
                            <div
                              className="h-full rounded-full bg-accent transition-all duration-300"
                              style={{ width: `${Math.round(kokoroState.progress * 100)}%` }}
                            />
                          </div>
                          <p className="text-[10px] text-faint font-semibold leading-normal">
                            Downloading assets. You can keep using Swaram; the system voice will automatically switch when finished.
                          </p>
                        </div>
                      )}
                      {kokoroState.state === "ready" && (
                        <p className="flex items-center gap-2 text-xs font-bold text-ok leading-none">
                          <IconCheck className="h-4 w-4" />
                          AI voice is active and running locally.
                        </p>
                      )}
                      {kokoroState.state === "error" && (
                        <div className="flex flex-col gap-2">
                          <p className="text-xs font-bold text-bad leading-tight">{kokoroState.message}</p>
                          <button
                            type="button"
                            className="btn btn-secondary min-h-9 self-start px-3 text-xs"
                            onClick={() => {
                              speak("Retrying AI voice download.");
                              void loadKokoro();
                            }}
                          >
                            Retry download
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Listening mode: push-to-talk vs hands-free */}
                <div className="flex flex-col gap-2 border-t border-line/65 pt-4 mt-2">
                  <label htmlFor="mic-mode-select" className="text-xs font-bold text-soft uppercase">
                    Listening Mode
                  </label>
                  <select
                    id="mic-mode-select"
                    className="field-input max-w-sm min-h-10 text-xs"
                    value={micMode}
                    onChange={(e) => {
                      const next = e.target.value as MicMode;
                      setMicMode(next);
                      setVoiceSettings({ micMode: next });
                      speak(
                        next === "ptt"
                          ? "Push to talk. Hold the space bar or tap the microphone, then speak. Best in noisy places."
                          : "Hands-free. I'll listen continuously. Best in a quiet room.",
                      );
                    }}
                  >
                    <option value="ptt">Push-to-talk &mdash; hold space / tap to speak (best in noise &amp; crowds)</option>
                    <option value="continuous">Hands-free &mdash; always listening (quiet rooms only)</option>
                  </select>
                  <p className="text-[10px] text-faint font-semibold leading-normal max-w-sm">
                    In a crowd or noisy room, push-to-talk is far more reliable — the microphone only
                    records while you hold or tap it, so background voices are never picked up.
                  </p>
                </div>

                {/* Speech recognition (STT) engine */}
                <div className="flex flex-col gap-2 border-t border-line/65 pt-4 mt-2">
                  <label htmlFor="stt-provider-select" className="text-xs font-bold text-soft uppercase">
                    Speech Recognition Method
                  </label>
                  <select
                    id="stt-provider-select"
                    className="field-input max-w-sm min-h-10 text-xs"
                    value={sttProvider}
                    onChange={(e) => {
                      const next = e.target.value as SttProvider;
                      setSttProvider(next);
                      setVoiceSettings({ sttProvider: next });
                      if (next === "groq") speak("Using cloud recognition. This is the most accurate option.");
                      else if (next === "azure") speak("Using Azure regional recognition, tuned for your selected language.");
                      else if (next === "azure-stream") speak("Using Azure real-time recognition. I'll understand any language as you speak.");
                      else if (next === "whisper") speak("Using on-device recognition.");
                      else if (next === "native") speak("Using the browser's built-in recognition.");
                      else speak("Using automatic recognition. I'll pick the best available.");
                    }}
                  >
                    <option value="groq">Cloud Whisper (Groq) &mdash; most accurate, needs internet</option>
                    <option value="azure">Azure Speech (Regional) &mdash; tuned per language, needs internet</option>
                    <option value="azure-stream">Azure Speech &mdash; Real-time (beta) &mdash; fastest, auto-detects language</option>
                    <option value="auto">Automatic &mdash; cloud when online, on-device otherwise</option>
                    <option value="whisper">On-Device Whisper &mdash; private &amp; offline (~150MB)</option>
                    <option value="native">Browser Built-in &mdash; instant, no download</option>
                  </select>

                  {sttProvider === "azure-stream" && (
                    <p className="max-w-sm text-[11px] text-soft font-semibold leading-normal mt-1">
                      Real-time streaming: text appears as you speak, and it auto-detects English,
                      Hindi, Malayalam or French so you don&apos;t have to switch languages. If it can&apos;t
                      connect, it falls back to the standard Azure path automatically.
                    </p>
                  )}

                  {(sttProvider === "azure" || sttProvider === "azure-stream") && (
                    <div className="max-w-sm rounded-2xl border border-line bg-surface p-4 mt-1 flex flex-col gap-2.5">
                      {azureEnvKey ? (
                        <p className="flex items-center gap-2 text-xs font-bold text-ok leading-tight">
                          <IconCheck className="h-4 w-4" />
                          Azure key configured on the server. Ready to go.
                        </p>
                      ) : (
                        <>
                          <p className="flex items-center gap-2 text-xs font-bold text-warn leading-tight">
                            <IconInfo className="h-4 w-4 shrink-0" />
                            No Azure key detected on the server.
                          </p>
                          <p className="text-[10px] text-faint font-semibold leading-normal">
                            Azure recognition needs a server key and region. Set{" "}
                            <code className="rounded bg-raised px-1 py-0.5 font-mono">AZURE_SPEECH_KEY</code>{" "}
                            and{" "}
                            <code className="rounded bg-raised px-1 py-0.5 font-mono">AZURE_SPEECH_REGION</code>{" "}
                            on the server, then restart it. Until then, recognition falls back to cloud
                            Whisper or the browser&apos;s built-in engine.
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  {(sttProvider === "groq" || sttProvider === "auto") && (
                    <div className="max-w-sm rounded-2xl border border-line bg-surface p-4 mt-1 flex flex-col gap-2.5">
                      {groqEnvKey ? (
                        <p className="flex items-center gap-2 text-xs font-bold text-ok leading-tight">
                          <IconCheck className="h-4 w-4" />
                          Cloud key configured on the server. Ready to go.
                        </p>
                      ) : (
                        <>
                          <label htmlFor="groq-key" className="text-[11px] font-bold text-soft uppercase">
                            Groq API key
                          </label>
                          <p className="text-[10px] text-faint font-semibold leading-normal">
                            No server key detected. Paste a Groq key to enable cloud recognition on
                            this device. Stored only in this browser. For a shared deploy, set{" "}
                            <code className="rounded bg-raised px-1 py-0.5 font-mono">GROQ_API_KEY</code>{" "}
                            on the server instead.
                          </p>
                          <div className="flex gap-2">
                            <input
                              id="groq-key"
                              type="password"
                              className="field-input min-h-10 text-xs flex-1"
                              placeholder="gsk_…"
                              value={groqKey}
                              onChange={(e) => setGroqKeyState(e.target.value)}
                            />
                            <button
                              type="button"
                              className="btn btn-secondary min-h-10 px-3 text-xs font-bold"
                              onClick={() => {
                                setGroqKey(groqKey);
                                void probeGroqAvailability();
                                speak(groqKey.trim() ? "Cloud key saved." : "Cloud key cleared.");
                              }}
                            >
                              Save
                            </button>
                          </div>
                          {!groqKey && (
                            <p className="text-[10px] text-warn font-bold leading-normal">
                              Without a key, recognition falls back to the browser&apos;s built-in engine.
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* TAB B: PERSONAL AUTO-FILL DETAILS */}
        {activeSubTab === "personal" && (
          <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-col gap-6"
          >
            {/* Privacy note */}
            <div className="card flex gap-4 border-line bg-raised shadow-sm">
              <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <IconShield className="h-5 w-5" />
              </span>
              <div>
                <h2 className="mb-1 font-bold text-sm text-ink">Sensitive Data &amp; ID Privacy</h2>
                <p className="text-xs text-soft font-semibold leading-relaxed">
                  Aadhaar card, PAN card, passports, voter cards, and bank account numbers are never saved in your profile. Even if a form asks for these fields, they are compiled straight into the final PDF output and discarded immediately.
                </p>
              </div>
            </div>

            <form
              className="card flex flex-col gap-5 border-line bg-raised shadow-sm"
              onSubmit={(e) => {
                e.preventDefault();
                save();
              }}
            >
              <div className="flex items-center gap-2 border-b border-line pb-3">
                <IconUser className="h-5 w-5 text-accent" />
                <h2 className="font-display text-base font-extrabold text-ink">
                  Auto-Fill Database Vault
                </h2>
              </div>
              
              <div className="grid gap-4 sm:grid-cols-2">
                {PROFILE_FIELDS.map((field) => (
                  <div key={field.key} className={`flex flex-col gap-1.5 ${field.key === "address" ? "sm:col-span-2" : ""}`}>
                    <label htmlFor={`profile-${field.key}`} className="text-xs font-bold text-soft">
                      {field.label}
                    </label>
                    <input
                      id={`profile-${field.key}`}
                      className="field-input min-h-10 text-xs shadow-sm"
                      type="text"
                      value={values[field.key] ?? ""}
                      placeholder={field.hint}
                      onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
                    />
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2.5 pt-3.5 border-t border-line/65 mt-2">
                <button type="submit" className="btn btn-primary min-h-10 px-5 text-xs font-bold">
                  Save Changes
                </button>
                <button
                  type="button"
                  className="btn btn-danger min-h-10 px-4 text-xs font-bold"
                  onClick={clearAll}
                >
                  Delete profile database
                </button>
              </div>
            </form>
          </motion.div>
        )}

        {/* TAB C: CLOUD BACKUP & RESTORATION */}
        {activeSubTab === "cloud" && (
          <motion.div
            variants={cardVariants}
            initial="hidden"
            animate="visible"
            className="flex flex-col gap-6"
          >
            <div className="card flex flex-col gap-5 border-line bg-raised shadow-sm">
              <div className="flex items-center gap-2 border-b border-line pb-3">
                <IconUpload className="h-5 w-5 text-accent" />
                <h2 className="font-display text-base font-extrabold text-ink">
                  Supabase Cloud Synchronization
                </h2>
              </div>

              {!configured ? (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-soft font-semibold leading-relaxed">
                    Cloud backup is currently disabled. All profile details reside securely on this local device. To configure backup storage, set the environment variables:
                  </p>
                  <pre className="rounded-xl border border-line bg-surface p-3 font-mono text-[10.5px] text-ink overflow-x-auto">
                    NEXT_PUBLIC_SUPABASE_URL=your-supabase-url{"\n"}
                    NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-key
                  </pre>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5 accent-[#0d9488] rounded border-line cursor-pointer"
                      checked={consent}
                      onChange={(e) => handleConsentChange(e.target.checked)}
                    />
                    <span className="text-xs text-soft font-semibold leading-relaxed">
                      I agree to back up my profile details to the cloud for restoration on other devices. Sensitive government IDs will never be synced.
                    </span>
                  </label>
                  
                  {consent && (
                    <div className="flex flex-wrap gap-2.5 pt-3.5 border-t border-line/65 mt-1">
                      <button
                        type="button"
                        className="btn btn-primary min-h-10 px-5 text-xs font-bold"
                        onClick={syncNow}
                        disabled={cloudBusy}
                      >
                        Back Up Now
                      </button>
                      <button
                        type="button"
                        className="btn btn-secondary min-h-10 px-4 text-xs font-bold"
                        onClick={fetchCloud}
                        disabled={cloudBusy}
                      >
                        Restore Backup
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger min-h-10 px-4 text-xs font-bold sm:ml-auto"
                        onClick={deleteCloud}
                        disabled={cloudBusy}
                      >
                        <IconTrash className="h-3.5 w-3.5" />
                        Delete Cloud Archive
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}

      </div>
    </div>
  );
}
