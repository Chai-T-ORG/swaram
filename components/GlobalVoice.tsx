"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import Link from "next/link";
import {
  speak,
  cancelSpeech,
  speechUnlocked,
  unlockAudioPlayback,
  loadKokoro,
  subscribeKokoroStatus,
  addSpeechListener,
  addTtsStateListener,
  isSpeaking,
} from "@/lib/voice/textToSpeech";
import { motion, AnimatePresence } from "framer-motion";
import { getVoiceSettings, setVoiceSettings, migrateVoiceSettings } from "@/lib/voice/voiceSettings";
import {
  startContinuousListening,
  stopContinuousListening,
  wakeUpContinuous,
  onStateChange,
  addTranscriptListener,
  removeTranscriptListener,
  isSttSupported,
  needsCloudNotice,
  acknowledgeCloudNotice,
  CLOUD_FALLBACK_NOTICE,
} from "@/lib/voice/speechToText";
import { playEarconStart, playEarconStop } from "@/lib/voice/earcons";
import { getProfile } from "@/lib/storage/profileStore";
import { getStream, primeMicIfGranted } from "@/lib/voice/micManager";
import { loadWhisper, isWhisperReady } from "@/lib/voice/whisperSTT";
import { probeGroqAvailability, isAzureConfigured } from "@/lib/voice/groqSTT";
import { resolveAction, isLlmAvailable, probeLlmAvailability } from "@/lib/voice/llm";
import { intentRegex, type IntlIntent } from "@/lib/voice/intlCommands";
import { onAzureStreamDiag, warmAzureStream } from "@/lib/voice/azureStreamSTT";
import {
  registerGlobalActions,
  setPageActions,
  getAvailableActions,
  getAction,
  type VoiceAction,
} from "@/lib/voice/actionRegistry";
import { startPtt, stopPtt, cancelPtt, isPttCapturing, onPttStateChange } from "@/lib/voice/pushToTalk";
import type { MicMode } from "@/lib/voice/voiceSettings";
import { upgradeToWhisper } from "@/lib/voice/speechToText";
import { subscribeSetup, isSetupComplete, updateSttProgress, markSttReady } from "@/lib/voice/modelManager";
import { classifyIntent } from "@/lib/voice/intentClassifier";
import { offTopicRedirect } from "@/lib/voice/offTopicRedirect";
import { logClassification } from "@/lib/voice/intentMetrics";
import SetupOverlay from "./SetupOverlay";
import {
  IconMic,
  IconX,
  IconHome,
  IconDoc,
  IconSettings,
  IconHelp,
  IconWave,
  IconUser,
  IconSun,
  IconMoon,
  IconCheck,
  IconRepeat,
  IconArrowLeft,
  IconSkip,
  IconKeyboard,
  IconPause,
  IconChevronRight,
  IconChevronDown,
  IconShield,
} from "@/components/icons";
import Waveform from "./Waveform";

export type VoiceCommand = [pattern: RegExp, handler: () => void, help: string];

/**
 * OR an English command pattern together with the multilingual keyword regex
 * for the same intent, so a single VoiceCommand matches every language. Input
 * is lower-cased before testing; the `u` flag makes native-script matching work.
 */
function orIntl(base: RegExp, intent: IntlIntent): RegExp {
  return new RegExp(`${base.source}|${intentRegex(intent).source}`, "iu");
}

export interface PageVoiceConfig {
  title?: string;
  hint?: string;
  description?: string;
  commands?: VoiceCommand[];
  /** Screen-specific actions for the adaptive (LLM) router — see actionRegistry. */
  actions?: VoiceAction[];
  exclusive?: boolean;
}

export interface ConversationMessage {
  sender: "assistant" | "user";
  text: string;
  timestamp: number;
}

interface VoiceContextValue {
  setPage: (config: PageVoiceConfig) => () => void;
  announce: (text: string) => void;
  sttState: "listening" | "paused-silence" | "off";
  micMode: MicMode;
  toast: string;
  wakeMic: () => void;
  /**
   * Pages with their own dialogue (the fill loop) register here. The
   * listener returns true when it consumed the transcript; otherwise the
   * global commands get a chance at it.
   */
  registerPageTranscriptListener: (listener: (text: string, confidence: number) => boolean) => () => void;
  messages: ConversationMessage[];
  addMessage: (sender: "assistant" | "user", text: string) => void;
  activeFormId: string | null;
  setActiveFormId: (id: string | null) => void;
  micVolume: number;
  ttsActive: boolean;
  /** Current fill page context for intent classification. */
  fillContext?: {
    phase: string;
    currentFieldLabel?: string;
    currentFieldType?: string;
    formName?: string;
  };
  /** Set by fill page to provide context. */
  setFillContext?: (ctx: VoiceContextValue["fillContext"]) => void;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

export function useVoicePage(config: PageVoiceConfig, deps: any[] = []) {
  const context = useContext(VoiceContext);
  useEffect(() => {
    if (!context) return;
    return context.setPage(config);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context, ...deps]);
  return context;
}

export function useVoice() {
  return useContext(VoiceContext);
}

// Screens the voice can jump to, with the label the assistant speaks.
const NAV: Record<string, { path: string; label: string }> = {
  home: { path: "/", label: "home" },
  upload: { path: "/upload", label: "upload" },
  scan: { path: "/scan", label: "scan" },
  history: { path: "/history", label: "my forms" },
  profile: { path: "/profile", label: "profile" },
};

// Spoken confirmation when the user switches language, written in that language.
const LANG_CONFIRM: Record<string, string> = {
  "en-IN": "Okay, I'll speak in English now.",
  "hi-IN": "ठीक है, अब मैं हिंदी में बात करूँगी।",
  "ml-IN": "ശരി, ഞാൻ ഇപ്പോൾ മലയാളത്തിൽ സംസാരിക്കാം.",
  "fr-FR": "D'accord, je parle en français maintenant.",
};

export default function GlobalVoice({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  
  const pageRef = useRef<PageVoiceConfig>({});
  const announcedRef = useRef<string>("");
  const pageListenerRef = useRef<((text: string, confidence: number) => boolean) | null>(null);

  const [exclusive, setExclusive] = useState(false);
  const [sttState, setSttState] = useState<"listening" | "paused-silence" | "off">("off");
  const [toast, setToast] = useState("");
  const [showNotice, setShowNotice] = useState(false);
  const [micMode, setMicMode] = useState<MicMode>("ptt");
  const [pttActive, setPttActive] = useState(false);
  // Touch devices can't reliably "hold" (a press triggers scroll / the OS
  // callout), so we switch push-to-talk to a tap-to-start / tap-to-stop toggle.
  const [isTouch, setIsTouch] = useState(false);

  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [userName, setUserName] = useState("User");
  const [greeting, setGreeting] = useState("");

  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [activeFormId, setActiveFormId] = useState<string | null>(null);
  const [micVolume, setMicVolume] = useState(0);
  const [ttsActive, setTtsActive] = useState(false);

  const [fillContext, setFillContext] = useState<VoiceContextValue["fillContext"]>(undefined);

  // One-time: move legacy installs off the old (silent-on-mobile) Kokoro default.
  useEffect(() => {
    migrateVoiceSettings();
  }, []);

  // Track TTS speaking state
  useEffect(() => {
    const unsubscribe = addTtsStateListener((active) => {
      setTtsActive(active);
    });
    return unsubscribe;
  }, []);

  // Track microphone voice volume — uses shared mic stream (no duplicate getUserMedia)
  useEffect(() => {
    if (sttState !== "listening") {
      setMicVolume(0);
      return;
    }

    let audioCtx: AudioContext | null = null;
    let animationId: number | null = null;

    async function initAnalyser() {
      try {
        let stream = getStream();
        if (!stream) {
          // If using Native STT, we might not have initialized the shared mic yet
          const { initMic } = await import("@/lib/voice/micManager");
          stream = await initMic();
        }
        if (!stream) {
          console.warn("[Visualizer] No mic stream available");
          return;
        }
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        audioCtx = new AudioCtx();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 32;
        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        source.connect(analyser);

        const update = () => {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const avg = sum / bufferLength;
          setMicVolume(Math.min(1, avg / 120));
          animationId = requestAnimationFrame(update);
        };
        animationId = requestAnimationFrame(update);
      } catch (err) {
        console.warn("Visualizer mic analysis failed:", err);
      }
    }

    void initAnalyser();

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
      // Do NOT stop stream tracks — micManager owns the lifecycle
      if (audioCtx && audioCtx.state !== "closed") {
        void audioCtx.close();
      }
    };
  }, [sttState]);

  // Automatically track active form ID from pathname
  useEffect(() => {
    const parts = pathname.split("/");
    const fillIdx = parts.indexOf("fill");
    const reviewIdx = parts.indexOf("review");
    const id = fillIdx !== -1 ? parts[fillIdx + 1] : (reviewIdx !== -1 ? parts[reviewIdx + 1] : null);
    if (id) {
      setActiveFormId(id);
    }
  }, [pathname]);

  // Load conversation messages from localStorage when activeFormId changes
  useEffect(() => {
    if (activeFormId) {
      const saved = localStorage.getItem("swaram_conv_" + activeFormId);
      if (saved) {
        try {
          setMessages(JSON.parse(saved));
        } catch {
          setMessages([]);
        }
      } else {
        setMessages([]);
      }
    } else {
      setMessages([]);
    }
  }, [activeFormId]);

  const addMessage = useCallback((sender: "assistant" | "user", text: string) => {
    if (!activeFormId) return;
    setMessages((prev) => {
      // Avoid duplicate consecutive messages with the exact same content
      if (prev.length > 0 && prev[prev.length - 1].sender === sender && prev[prev.length - 1].text === text) {
        return prev;
      }
      const updated = [...prev, { sender, text, timestamp: Date.now() }];
      localStorage.setItem("swaram_conv_" + activeFormId, JSON.stringify(updated));
      return updated;
    });
  }, [activeFormId]);

  useEffect(() => {
    // Determine initial theme on mount
    const saved = localStorage.getItem("swaram_theme") as "light" | "dark" | null;
    if (saved) {
      setTheme(saved);
      document.documentElement.classList.add(saved);
      document.documentElement.classList.remove(saved === "light" ? "dark" : "light");
    } else {
      const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTheme(isDark ? "dark" : "light");
      document.documentElement.classList.add(isDark ? "dark" : "light");
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("swaram_theme", next);
    document.documentElement.classList.add(next);
    document.documentElement.classList.remove(theme);
  };

  useEffect(() => {
    // Read user name from profile
    try {
      const profile = getProfile();
      if (profile?.full_name) {
        setUserName(profile.full_name.trim().split(" ")[0]); // Use first name
      } else {
        setUserName("User");
      }
    } catch {
      setUserName("User");
    }
  }, [pathname]); // Refresh name on route changes (since they might have saved settings!)

  // Set greeting after mount only to avoid SSR/client hydration mismatch
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 12) setGreeting("Good morning");
    else if (hour < 17) setGreeting("Good afternoon");
    else setGreeting("Good evening");
  }, []);

  const flashToast = useCallback((text: string, ms = 4000) => {
    setToast(text);
    if (text) {
      const timer = setTimeout(() => setToast((t) => (t === text ? "" : t)), ms);
      return () => clearTimeout(timer);
    }
  }, []);

  const setPage = useCallback(
    (config: PageVoiceConfig) => {
      pageRef.current = config;
      const clearActions = setPageActions(config.actions ?? []);
      setExclusive(Boolean(config.exclusive));
      const key = `${pathname}:${config.title ?? ""}`;
      if (config.title && announcedRef.current !== key && speechUnlocked()) {
        announcedRef.current = key;
        speak(`${config.title}.${config.hint ? ` ${config.hint}` : ""}`);
      }
      return () => {
        clearActions();
        if (pageRef.current === config) {
          pageRef.current = {};
          setExclusive(false);
        }
      };
    },
    [pathname],
  );

  const registerPageTranscriptListener = useCallback((listener: (text: string, confidence: number) => boolean) => {
    pageListenerRef.current = listener;
    return () => {
      if (pageListenerRef.current === listener) {
        pageListenerRef.current = null;
      }
    };
  }, []);

  // Navigate, but always say something — and if the user asks for the screen
  // they're already on, acknowledge it instead of silently doing nothing (the
  // "say home while on home" dead-end).
  const navigateWithFeedback = useCallback(
    (target: string) => {
      const dest = NAV[target];
      if (!dest) {
        speak("I'm not sure where you'd like to go. Try: home, upload, scan, my forms, or profile.");
        return;
      }
      const alreadyHere = dest.path === "/" ? pathname === "/" : pathname.startsWith(dest.path);
      if (alreadyHere) {
        speak(`You're already on the ${dest.label} screen. What would you like to do next?`);
        return;
      }
      speak(`Opening ${dest.label}.`);
      router.push(dest.path);
    },
    [pathname, router],
  );

  // Switch the assistant's language (recognition + voice + replies), and confirm
  // in the new language. PTT/cloud STT reads the language fresh each turn, so it
  // takes effect on the next thing the user says.
  const setAssistantLang = useCallback((lang: string) => {
    setVoiceSettings({ sttLang: lang });
    speak(LANG_CONFIRM[lang] ?? "Language updated.");
  }, []);

  const globalCommands = useCallback((): VoiceCommand[] => {
    // Hindi / Malayalam / French keyword alternations (native script) so the
    // same navigation commands work in every language, offline. English keeps
    // its richer hand-tuned patterns; the intl regex is ORed in.
    return [
      [/\b(hindi|हिंदी|हिन्दी)\b|hindi (me|mein)/, () => setAssistantLang("hi-IN"), "speak in Hindi"],
      [/\b(malayalam|മലയാളം)\b/, () => setAssistantLang("ml-IN"), "speak in Malayalam"],
      [/\b(french|francais|français)\b|en français/, () => setAssistantLang("fr-FR"), "speak in French"],
      [/(speak|switch|talk).{0,12}\benglish\b|\bin english\b/, () => setAssistantLang("en-IN"), "speak in English"],
      [orIntl(/\b(go |open )?home\b|main menu|home page/, "home"), () => navigateWithFeedback("home"), "home"],
      [orIntl(/\bupload\b|choose (a )?file|pdf file|new form/, "upload"), () => navigateWithFeedback("upload"), "upload"],
      [orIntl(/\bscan\b|camera|paper form|take (a )?photo/, "scan"), () => navigateWithFeedback("scan"), "scan"],
      [
        orIntl(/my forms|history|recent forms|open (my )?(forms?|folder|files?|documents?)|my documents/, "history"),
        () => navigateWithFeedback("history"),
        "my forms",
      ],
      [orIntl(/\bprofile\b|my details|voice settings|\bsettings\b|preferences/, "profile"), () => navigateWithFeedback("profile"), "profile"],
      [/^(go |take me )?back(ward)?$/, () => router.back(), "go back"],
      [
        orIntl(/read (this )?page|where am i/, "read_page"),
        () => {
          const page = pageRef.current;
          speak(page.description ?? page.title ?? "You are in Swaram.");
        },
        "read this page",
      ],
      [
        orIntl(/^(stop|quiet|silence)( talking| reading)?$/, "stop"),
        () => cancelSpeech(),
        "stop",
      ],
      [
        orIntl(/\bhelp\b|what can i say|commands/, "help"),
        () => {
          const pageHelp = (pageRef.current.commands ?? []).map(([, , help]) => help).filter(Boolean);
          const all = [...pageHelp, "upload", "scan", "my forms", "profile", "go home", "read this page", "stop"];
          speak(`You can say: ${all.join(", ")}.`);
        },
        "help",
      ],
    ];
  }, [router, navigateWithFeedback, setAssistantLang]);

  const runGlobalTranscript = useCallback(
    (transcript: string) => {
      // NFC so native-script (Malayalam/Hindi) regexes compare against the same
      // code-point form the recognizer emits.
      const heard = transcript.normalize("NFC").toLowerCase().trim();
      const commands = [...(pageRef.current.commands ?? []), ...globalCommands()];
      for (const [pattern, handler] of commands) {
        if (pattern.test(heard)) {
          handler();
          return true;
        }
      }
      return false;
    },
    [globalCommands],
  );

  // Adaptive fallback: when the fast (regex/keyword) lane doesn't match, resolve
  // the utterance against the actions available on this screen right now — first
  // any offline matcher, then the LLM, which maps arbitrary phrasings and any
  // language onto a real action (or answers as chat). Fails soft.
  const resolveWithLlm = useCallback(
    async (transcript: string) => {
      const actions = getAvailableActions();
      const lower = transcript.toLowerCase();

      // Fast lane: an action carrying its own offline matcher.
      for (const a of actions) {
        if (a.match && a.match.test(lower)) {
          a.run();
          return;
        }
      }

      // Context-aware fallback: offer what this screen actually supports, not a
      // generic home-page list.
      const pageOpts = (pageRef.current.commands ?? []).map((c) => c[2]).filter(Boolean);
      const nudge = pageOpts.length
        ? `On this screen you can say: ${[...pageOpts, "go home"].slice(0, 5).join(", ")}. What would you like to do?`
        : "I'm here to help you fill forms by voice. You can say: upload, scan, my forms, or profile. What would you like to do?";
      if (!isLlmAvailable()) {
        speak(nudge);
        return;
      }

      flashToast("Thinking…", 3000);
      const res = await resolveAction(
        transcript,
        { pageLabel: pageRef.current.title, lang: getVoiceSettings().sttLang },
        actions.map((a) => ({ id: a.id, description: a.description })),
      );

      if (res.action === "chat") {
        speak(res.reply || nudge);
        return;
      }
      const action = res.action && res.action !== "none" ? getAction(res.action) : undefined;
      if (action) {
        action.run();
        return;
      }
      speak(nudge); // never a dead end
    },
    [flashToast],
  );

  // Register the always-available actions once the handlers they call exist.
  // These give the adaptive router its baseline vocabulary; the fast-lane
  // regexes in globalCommands() still handle the common English phrasings.
  useEffect(() => {
    registerGlobalActions([
      { id: "go_home", description: "Go to the home screen.", run: () => navigateWithFeedback("home") },
      { id: "open_upload", description: "Go to the upload screen to choose a PDF or photo of a form from the device.", run: () => navigateWithFeedback("upload") },
      { id: "open_scan", description: "Open the camera to scan a paper form.", run: () => navigateWithFeedback("scan") },
      { id: "open_history", description: "Open the list of the user's saved forms and documents.", run: () => navigateWithFeedback("history") },
      { id: "open_profile", description: "Open profile and settings: voice, language, and saved personal details.", run: () => navigateWithFeedback("profile") },
      { id: "read_page", description: "Read aloud what is on the current screen.", run: () => speak(pageRef.current.description ?? pageRef.current.title ?? "You are in Swaram.") },
      { id: "stop_talking", description: "Stop talking / be quiet.", run: () => cancelSpeech() },
      { id: "help", description: "Explain what the user can say or do on this screen.", run: () => runGlobalTranscript("help") },
      { id: "language_english", description: "Speak and listen in English.", run: () => setAssistantLang("en-IN") },
      { id: "language_hindi", description: "Speak and listen in Hindi.", run: () => setAssistantLang("hi-IN") },
      { id: "language_malayalam", description: "Speak and listen in Malayalam.", run: () => setAssistantLang("ml-IN") },
      { id: "language_french", description: "Speak and listen in French.", run: () => setAssistantLang("fr-FR") },
    ]);
  }, [navigateWithFeedback, setAssistantLang, runGlobalTranscript]);

  // Initialize SpeechRecognition State Changes and Transcript routing
  useEffect(() => {
    onStateChange((state) => {
      setSttState(state);
      if (state === "paused-silence") {
        flashToast("Microphone paused to save battery. Tap anywhere to resume.", 8000);
      } else if (state === "listening") {
        flashToast("Listening ready…", 4000);
      }
    });

    const handleTranscript = (text: string, confidence: number) => {
      const trimmed = text.trim();
      if (trimmed.length < 2) return;

      // ── Intent classification (local, no LLM) ──
      const intent = classifyIntent(trimmed, {
        phase: fillContext?.phase,
        currentFieldLabel: fillContext?.currentFieldLabel,
        currentFieldType: fillContext?.currentFieldType,
        formName: fillContext?.formName,
        lang: getVoiceSettings().sttLang,
      });
      logClassification(intent, pathname.startsWith("/fill/") ? "fill" : "global");

      // Noise: defensive (speechToText.ts already filters), but safe to drop
      if (intent.type === "noise") return;

      // Command: pass through to page/global handlers as before
      if (intent.type === "command") {
        flashToast(`"${trimmed}"`);
        const consumedByPage = pageListenerRef.current
          ? pageListenerRef.current(trimmed, confidence)
          : false;
        if (!consumedByPage) runGlobalTranscript(trimmed);
        return;
      }

      // Answer: pass through (page dialogue handles validation / confirmation)
      if (intent.type === "answer") {
        flashToast(`"${trimmed}"`);
        if (pathname.startsWith("/fill/")) addMessage("user", trimmed);
        pageListenerRef.current?.(trimmed, confidence);
        return;
      }

      // Off-topic: speak a polite redirect, don't route to page/global
      if (intent.type === "off_topic") {
        if (!isSpeaking()) {
          const redirect = offTopicRedirect({
            transcript: trimmed,
            topic: intent.topic,
            inFillMode: !!pageListenerRef.current,
            formName: fillContext?.formName,
            currentFieldLabel: fillContext?.currentFieldLabel,
          });
          speak(redirect);
        }
        return;
      }

      // Unknown: route to page/global, then LLM fallback if needed
      if (pathname.startsWith("/fill/")) addMessage("user", trimmed);
      const consumedByPage = pageListenerRef.current
        ? pageListenerRef.current(trimmed, confidence)
        : false;
      if (!consumedByPage) {
        const handled = runGlobalTranscript(trimmed);
        if (!handled && !pageListenerRef.current && trimmed.length >= 3) {
          void resolveWithLlm(trimmed);
        }
      }
    };

    addTranscriptListener(handleTranscript);

    return () => {
      removeTranscriptListener(handleTranscript);
    };
  }, [flashToast, runGlobalTranscript, pathname, addMessage]);

  // Listen to TTS speech outputs to log assistant prompts
  useEffect(() => {
    if (!pathname.startsWith("/fill/")) return;
    const unsubscribe = addSpeechListener((text) => {
      if (
        text.trim() &&
        text !== "Ready." &&
        !text.includes("using the system voice meanwhile") &&
        !text.includes("The AI voice is ready")
      ) {
        addMessage("assistant", text);
      }
    });
    return unsubscribe;
  }, [pathname, addMessage]);

  const startListeningNow = useCallback(() => {
    if (!isSttSupported()) {
      flashToast("Voice input is not supported in this browser.");
      return;
    }
    if (needsCloudNotice()) {
      setShowNotice(true);
      speak(CLOUD_FALLBACK_NOTICE);
      return;
    }
    playEarconStart();
    startContinuousListening();
  }, [flashToast]);

  /* ---------------------- Push-to-talk controls ---------------------- */

  const beginPtt = useCallback(async () => {
    unlockAudioPlayback();
    cancelSpeech(); // the user wants to speak — stop any prompt immediately
    const ok = await startPtt();
    if (!ok) flashToast("Couldn't access the microphone. Check permissions.", 5000);
  }, [flashToast]);

  const endPtt = useCallback(async () => {
    if (!isPttCapturing()) return;
    flashToast("Thinking…", 2500);
    const text = await stopPtt();
    if (!text) {
      flashToast(
        isTouch ? "Didn't catch that — tap and speak clearly." : "Didn't catch that — hold and speak clearly.",
        3000,
      );
    }
  }, [flashToast, isTouch]);

  const togglePtt = useCallback(() => {
    if (isPttCapturing()) void endPtt();
    else void beginPtt();
  }, [beginPtt, endPtt]);

  // Reflect PTT capture as the visible mic state in push-to-talk mode.
  useEffect(() => {
    const unsub = onPttStateChange((cap) => setPttActive(cap));
    return unsub;
  }, []);

  // Detect coarse-pointer / touch input once on mount so push-to-talk can adapt
  // its interaction model (tap-toggle) and its on-screen copy ("Tap to talk").
  useEffect(() => {
    setIsTouch(
      (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches) ||
        "ontouchstart" in window ||
        navigator.maxTouchPoints > 0,
    );
  }, []);

  // Surface real-time (Azure streaming) status so failures are visible instead
  // of silently falling back. Errors stay on-screen long enough to read/report.
  useEffect(() => {
    return onAzureStreamDiag((msg, isError) => {
      if (isError) flashToast("Real-time voice: " + msg, 7000);
      else if (msg.startsWith("connected")) flashToast("Real-time recognition connected.", 2500);
    });
  }, [flashToast]);
  useEffect(() => {
    if (micMode === "ptt") setSttState(pttActive ? "listening" : "off");
  }, [pttActive, micMode]);

  const wakeMic = useCallback(() => {
    if (micMode === "ptt") {
      togglePtt();
      return;
    }
    if (sttState === "paused-silence") {
      wakeUpContinuous();
    } else if (sttState === "off") {
      startListeningNow();
    }
  }, [micMode, sttState, startListeningNow, togglePtt]);

  // Touch/mouse push-to-talk on the mic panel. Hold to talk, release to send —
  // and a quick tap toggles listening on (tap again to send), so it works
  // whether the user holds or taps. Pointer events + capture are reliable on
  // mobile where a bare onClick frequently misses (the exact "PTT doesn't work
  // on mobile" bug). Only active in push-to-talk mode; continuous mode uses the
  // panel's onClick to wake.
  const HOLD_MS = 350;
  const pttPressRef = useRef<{ start: number; stopping: boolean } | null>(null);

  const onMicPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (micMode !== "ptt" || isTouch) return; // touch uses tap-toggle via onClick
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
      const alreadyCapturing = isPttCapturing();
      pttPressRef.current = { start: Date.now(), stopping: alreadyCapturing };
      if (!alreadyCapturing) void beginPtt();
    },
    [micMode, isTouch, beginPtt],
  );

  const onMicPointerUp = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (micMode !== "ptt" || isTouch) return;
      const press = pttPressRef.current;
      pttPressRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      if (!press) return;
      const held = Date.now() - press.start;
      // Stop & send when this was the "off" tap of a toggle, or a genuine hold.
      // A quick first tap leaves recording on; the next tap ends it.
      if (press.stopping || held >= HOLD_MS) void endPtt();
    },
    [micMode, isTouch, endPtt],
  );

  const onMicPointerCancel = useCallback(() => {
    if (isTouch) return;
    const press = pttPressRef.current;
    pttPressRef.current = null;
    if (press && !press.stopping) cancelPtt();
  }, [isTouch]);

  const isTypingTarget = (t: EventTarget | null): boolean => {
    const el = t as HTMLElement | null;
    return Boolean(
      el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable),
    );
  };

  // Push-to-talk: hold the SPACE bar to talk (release to send). Ignored while
  // typing in a field.
  useEffect(() => {
    if (micMode !== "ptt") return;
    let holding = false;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || isTypingTarget(e.target)) return;
      e.preventDefault();
      if (!holding) {
        holding = true;
        void beginPtt();
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      if (holding) {
        holding = false;
        e.preventDefault();
        void endPtt();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      if (holding) cancelPtt();
    };
  }, [micMode, beginPtt, endPtt]);

  // Touch push-to-talk: tap anywhere on the page to start listening, tap again
  // to send. We ignore taps on interactive controls (so buttons, links, and
  // form fields still work) and on gestures that are really a scroll or a
  // long-press. The mic panel handles its own tap via onClick, so it's skipped
  // here too. Desktop keeps hold-to-talk (space bar / mouse), handled above.
  useEffect(() => {
    if (micMode !== "ptt" || !isTouch) return;
    let x = 0;
    let y = 0;
    let downAt = 0;
    let moved = false;

    const onDown = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      downAt = Date.now();
      moved = false;
    };
    const onMove = (e: PointerEvent) => {
      if (Math.hypot(e.clientX - x, e.clientY - y) > 12) moved = true;
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerType === "mouse") return; // desktop uses hold-to-talk
      if (moved || Date.now() - downAt > 600) return; // a scroll or long-press, not a tap
      if (!isSetupComplete() || showNotice) return; // don't fight the setup/consent UI
      const el = e.target as HTMLElement | null;
      // Interactive controls and the mic panel (role=button) self-handle taps.
      if (el?.closest('a, button, input, textarea, select, label, [role="button"], [contenteditable="true"]')) {
        return;
      }
      togglePtt();
    };

    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("pointermove", onMove, true);
    document.addEventListener("pointerup", onUp, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("pointermove", onMove, true);
      document.removeEventListener("pointerup", onUp, true);
    };
  }, [micMode, isTouch, showNotice, togglePtt]);

  // Continuous mode only: wake from the idle auto-pause on any interaction.
  useEffect(() => {
    if (micMode !== "continuous") return;
    function onWakeTrigger(event: Event) {
      unlockAudioPlayback();
      if (sttState === "paused-silence") {
        if (event instanceof KeyboardEvent && isTypingTarget(event.target)) {
          if (event.code !== "Space" && event.code !== "Enter") return;
        }
        event.preventDefault();
        wakeMic();
      } else if (sttState === "off" && event instanceof KeyboardEvent && event.code === "Space") {
        const target = event.target as HTMLElement | null;
        if (target && target !== document.body && target.tagName !== "MAIN") return;
        event.preventDefault();
        startListeningNow();
      }
    }
    window.addEventListener("click", onWakeTrigger);
    window.addEventListener("keydown", onWakeTrigger);
    return () => {
      window.removeEventListener("click", onWakeTrigger);
      window.removeEventListener("keydown", onWakeTrigger);
    };
  }, [micMode, sttState, wakeMic, startListeningNow]);

  // Trigger initial getVoices() load on mount to prepare premium system voices
  useEffect(() => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.getVoices();
    }
  }, []);

  // AI voice (Kokoro) + Whisper STT: warm-load in the background.
  // The SetupOverlay handles first-visit progress UI. This effect handles
  // subsequent visits where models are already cached.
  const lastKokoroToastRef = useRef(-1);
  useEffect(() => {
    // Warm the LLM availability probe so the intent router is ready.
    void probeLlmAvailability();

    const provider = getVoiceSettings().sttProvider;
    // Cloud STT (Groq / Azure) downloads nothing — probe the server for a key
    // and mark the STT model ready so setup never waits on the ~150 MB Whisper
    // download.
    // Preload the streaming SDK + token so the first real-time press is fast.
    if (provider === "azure-stream") void warmAzureStream();
    if (provider === "groq" || provider === "auto" || provider === "azure" || provider === "azure-stream") {
      void probeGroqAvailability().then((groqOk) => {
        const cur = getVoiceSettings().sttProvider;
        const ok = cur === "azure" || cur === "azure-stream" ? isAzureConfigured() : groqOk;
        if (ok && (cur === "groq" || cur === "auto" || cur === "azure" || cur === "azure-stream")) {
          updateSttProgress(1, "Cloud voice ready");
          markSttReady();
        } else if (cur === "auto") {
          // No cloud key — fall back to downloading on-device Whisper.
          void loadWhisper().catch(console.error);
        }
      });
    }

    // If setup is already complete, just load models silently
    if (isSetupComplete()) {
      if (getVoiceSettings().ttsProvider === "local") {
        void loadKokoro();
      }
      if (provider === "whisper") {
        void loadWhisper().catch(console.error);
      }
    }

    const unsubscribeKokoro = subscribeKokoroStatus((status) => {
      if (status.state === "ready") {
        if (lastKokoroToastRef.current !== 100) {
          lastKokoroToastRef.current = 100;
          if (isSetupComplete()) {
            flashToast("AI voice is ready.", 4000);
          }
        }
      } else if (status.state === "error") {
        lastKokoroToastRef.current = -1;
        flashToast(status.message, 8000);
      }
    });

    // When Whisper finishes loading, upgrade STT engine mid-session
    const unsubscribeSetup = subscribeSetup((setupState) => {
      const sttModel = setupState.models.find((m) => m.id === "stt");
      if (sttModel?.status === "ready" && isWhisperReady()) {
        upgradeToWhisper();
        if (isSetupComplete()) {
          flashToast("Enhanced speech recognition is ready.", 4000);
        }
      }
    });

    return () => {
      unsubscribeKokoro();
      unsubscribeSetup();
    };
  }, [flashToast]);

  // Keep micMode in sync with settings (updates when the user changes it in
  // Profile and navigates back).
  useEffect(() => {
    setMicMode(getVoiceSettings().micMode);
  }, [pathname]);

  // Push-to-talk needs the mic stream ready ahead of time (so the first hold
  // doesn't miss the start of speech), but must NOT start any recognition.
  useEffect(() => {
    if (micMode !== "ptt") return;
    void primeMicIfGranted();
  }, [micMode]);

  // Continuous mode only: if permission was granted before, start listening on
  // load; otherwise start on the first gesture.
  useEffect(() => {
    if (micMode !== "continuous" || !isSetupComplete()) return;
    let cancelled = false;
    primeMicIfGranted().then((stream) => {
      if (!cancelled && stream && sttState === "off" && !needsCloudNotice()) {
        startContinuousListening();
      }
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [micMode]);

  useEffect(() => {
    if (micMode !== "continuous") return;
    function onFirstGesture() {
      unlockAudioPlayback();
      if (sttState === "off") startListeningNow();
      window.removeEventListener("click", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    }
    window.addEventListener("click", onFirstGesture);
    window.addEventListener("keydown", onFirstGesture);
    return () => {
      window.removeEventListener("click", onFirstGesture);
      window.removeEventListener("keydown", onFirstGesture);
    };
  }, [micMode, sttState, startListeningNow]);

  const contextValue: VoiceContextValue = {
    setPage,
    announce: (text) => speak(text),
    sttState,
    micMode,
    toast,
    wakeMic,
    registerPageTranscriptListener,
    messages,
    addMessage,
    activeFormId,
    setActiveFormId,
    micVolume,
    ttsActive,
    fillContext,
    setFillContext,
  };

  const isHome = pathname === "/";

  return (
    <VoiceContext.Provider value={contextValue}>
      <SetupOverlay />
      <div className="flex h-screen w-screen overflow-hidden flex-col bg-surface text-ink md:flex-row">
        {/* LEFT SIDEBAR - Desktop only */}
        {!exclusive && (
          <aside className="hidden w-72 shrink-0 flex-col justify-between border-r border-line bg-raised p-6 md:flex h-full overflow-y-auto">
            {!isHome ? (
              <div className="flex flex-col gap-8">
                {/* Logo */}
                <Link
                  href="/"
                  className="flex items-center gap-3 rounded-full py-1 font-semibold text-ink no-underline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-accent text-white shadow-md">
                    <IconWave className="h-5.5 w-5.5" />
                  </span>
                  <div>
                    <span className="font-display text-lg tracking-tight font-extrabold block leading-tight">SWARAM</span>
                    <span className="text-[10px] text-faint block -mt-0.5 font-bold tracking-wide">Your voice. Our help.</span>
                  </div>
                </Link>

                {/* Workflow Stepper Navigation */}
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-bold text-faint uppercase tracking-wider mb-2">Workflow Progress</span>
                  <div className="flex flex-col relative pl-4 border-l border-line gap-5">
                    {[
                      { label: "Start", step: 1 },
                      { label: "Import Form", step: 2 },
                      { label: "Preparing Document", step: 3 },
                      { label: "Voice Guidance", step: 4 },
                      { label: "Review Answers", step: 5 },
                      { label: "Submit & Export", step: 6 },
                    ].map((step) => {
                      const activeStep = (() => {
                        if (pathname === "/") return 1;
                        if (pathname === "/upload" || pathname === "/scan") return 2;
                        if (pathname.startsWith("/processing/")) return 3;
                        if (pathname.startsWith("/fill/")) return 4;
                        if (pathname.startsWith("/review/")) return 5;
                        if (pathname.startsWith("/complete/")) return 6;
                        return 0; // secondary pages
                      })();

                      const isActive = step.step === activeStep;
                      const isCompleted = activeStep > step.step && activeStep !== 0;
                      const stepPath = (() => {
                        if (step.step === 1) return "/";
                        if (step.step === 2) return "/upload";
                        if (!activeFormId) return "";
                        if (step.step === 3) return `/processing/${activeFormId}`;
                        if (step.step === 4) return `/fill/${activeFormId}`;
                        if (step.step === 5) return `/review/${activeFormId}`;
                        if (step.step === 6) return `/complete/${activeFormId}`;
                        return "";
                      })();

                      const linkContent = (
                        <span className={`text-xs font-bold transition-colors ${
                          isActive ? "text-accent" : isCompleted ? "text-ink" : "text-faint"
                        }`}>
                          {step.label}
                        </span>
                      );

                      return (
                        <div key={step.label} className="relative flex items-center justify-between group">
                          {/* Dot indicator on the timeline line */}
                          <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 transition-all duration-300 ${
                            isCompleted
                              ? "bg-ok border-ok scale-110"
                              : isActive
                              ? "bg-accent border-accent ring-4 ring-accent/15 scale-110"
                              : "bg-surface border-line"
                          }`} />
                          
                          {stepPath ? (
                            <Link href={stepPath} className="no-underline hover:opacity-90">
                              {linkContent}
                            </Link>
                          ) : (
                            <span>{linkContent}</span>
                          )}

                          {isActive && (
                            <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Secondary links (My Forms / Profile) */}
                <div className="border-t border-line/65 pt-4.5 mt-2 flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold text-faint uppercase tracking-wider mb-1">Account &amp; History</span>
                  {[
                    { label: "My Forms", href: "/history", icon: <IconDoc className="h-4 w-4" /> },
                    { label: "Profile & Settings", href: "/profile", icon: <IconUser className="h-4 w-4" /> },
                  ].map((link) => {
                    const active = pathname === link.href;
                    return (
                      <Link
                        key={link.label}
                        href={link.href}
                        className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-2xl font-bold transition-all duration-300 text-xs ${
                          active
                            ? "bg-accent/10 text-accent shadow-sm"
                            : "text-soft hover:bg-surface hover:text-ink"
                        }`}
                      >
                        {link.icon}
                        <span>{link.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ) : (
              // Sidebar is empty placeholder because the fixed Voice Assistant covers it on Home page
              <div className="flex-1" />
            )}
          </aside>
        )}

        {/* GLOBAL VOICE ASSISTANT */}
        {(!exclusive || isHome) && (
          <div
            onClick={() => {
              // Continuous mode: tap wakes the mic. Touch push-to-talk: tap
              // toggles listening. Desktop push-to-talk: the pointer handlers
              // own the hold interaction, so onClick is a no-op there.
              if (micMode !== "ptt") wakeMic();
              else if (isTouch) togglePtt();
            }}
            onPointerDown={onMicPointerDown}
            onPointerUp={onMicPointerUp}
            onPointerCancel={onMicPointerCancel}
            role="button"
            tabIndex={0}
            aria-label={
              micMode === "ptt"
                ? isTouch
                  ? "Tap to talk, tap again to send"
                  : "Hold to talk, release to send"
                : "Tap to listen"
            }
            className={`fixed touch-none select-none transition-all duration-700 ease-in-out overflow-hidden bg-raised border border-line ${
              isHome
                ? "top-[90px] left-4 right-4 h-[320px] rounded-3xl shadow-md z-40 flex flex-col items-center justify-between p-6 md:top-0 md:left-0 md:bottom-0 md:right-auto md:w-72 md:h-full md:rounded-none md:border-r md:border-b-0 md:shadow-none"
                : "bottom-4 left-4 right-4 h-20 rounded-2xl shadow-lg z-50 flex items-center justify-between px-4 py-3 bg-raised/95 backdrop-blur md:bottom-6 md:left-auto md:right-6 md:w-80 md:h-[155px] md:rounded-[28px] md:flex-col md:p-4"
            }`}
          >
            {isHome ? (
              // Large Home Assistant layout
              <div className="flex flex-col items-center justify-between h-full w-full gap-4">
                {/* Logo - Desktop only */}
                <div className="hidden md:flex items-center gap-3 w-full border-b border-line pb-4">
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-accent text-white shadow-md">
                    <IconWave className="h-5.5 w-5.5" />
                  </span>
                  <div>
                    <span className="font-display text-lg tracking-tight font-extrabold block leading-tight">SWARAM</span>
                    <span className="text-[10px] text-faint block -mt-0.5 font-bold tracking-wide">Your voice. Our help.</span>
                  </div>
                </div>

                {/* Orb and Pulses */}
                <div className="flex-grow flex flex-col items-center justify-center gap-6 py-4 w-full">
                  <div className="relative flex items-center justify-center w-36 h-36 md:w-40 md:h-40">
                    {/* Concentric pulses */}
                    <motion.div
                      className="absolute -inset-6 rounded-full border border-teal-500/20 bg-teal-500/5"
                      animate={{
                        scale: sttState === "listening" ? 1 + micVolume * 0.4 : ttsActive ? 1.05 + Math.sin(Date.now() * 0.01) * 0.05 : 1,
                        opacity: sttState === "listening" ? 0.3 + micVolume * 0.7 : ttsActive ? 0.4 : 0.15,
                      }}
                      transition={{ type: "spring", stiffness: 180, damping: 15 }}
                    />
                    <motion.div
                      className="absolute -inset-3 rounded-full border border-teal-500/30 bg-teal-500/10"
                      animate={{
                        scale: sttState === "listening" ? 1 + micVolume * 0.25 : ttsActive ? 1.03 + Math.sin(Date.now() * 0.015) * 0.03 : 1,
                        opacity: sttState === "listening" ? 0.4 + micVolume * 0.6 : ttsActive ? 0.5 : 0.25,
                      }}
                      transition={{ type: "spring", stiffness: 200, damping: 18 }}
                    />
                    {/* Outer morphing blob */}
                    <motion.div
                      className="absolute inset-0 bg-[#f0fdfa] dark:bg-[#002e2c]/40 border border-[#ccfbf1] dark:border-[#115e59]/30 rounded-full shadow-inner"
                      animate={{
                        scale: sttState === "listening" ? 1 + micVolume * 0.18 : ttsActive ? 1.02 + Math.sin(Date.now() * 0.02) * 0.02 : 1,
                        borderRadius: [
                          "42% 58% 70% 30% / 45% 45% 55% 55%",
                          "70% 30% 52% 48% / 60% 40% 60% 40%",
                          "50% 50% 35% 65% / 40% 60% 45% 55%",
                          "42% 58% 70% 30% / 45% 45% 55% 55%",
                        ]
                      }}
                      transition={{
                        scale: { type: "spring", stiffness: 200, damping: 15 },
                        borderRadius: { repeat: Infinity, duration: 8, ease: "easeInOut" }
                      }}
                    />
                    {/* Inner wobbly blob */}
                    <motion.div
                      className="absolute inset-3 bg-[#ccfbf1] dark:bg-[#004d47]/30 border border-[#99f6e4]/40 rounded-full"
                      animate={{
                        scale: sttState === "listening" ? 1 + micVolume * 0.1 : ttsActive ? 1.01 + Math.sin(Date.now() * 0.02) * 0.01 : 1,
                        borderRadius: [
                          "70% 30% 52% 48% / 60% 40% 60% 40%",
                          "50% 50% 35% 65% / 40% 60% 45% 55%",
                          "42% 58% 70% 30% / 45% 45% 55% 55%",
                          "70% 30% 52% 48% / 60% 40% 60% 40%",
                        ]
                      }}
                      transition={{
                        scale: { type: "spring", stiffness: 220, damping: 18 },
                        borderRadius: { repeat: Infinity, duration: 10, ease: "easeInOut" }
                      }}
                    />
                    {/* Inner Core */}
                    <motion.div
                      className="relative flex items-center justify-center bg-accent text-white rounded-full shadow-lg w-20 h-20 md:w-24 md:h-24"
                      animate={{
                        scale: sttState === "listening" ? 1 + micVolume * 0.08 : ttsActive ? 1.01 + Math.sin(Date.now() * 0.02) * 0.01 : 1,
                      }}
                      transition={{ type: "spring", stiffness: 240, damping: 20 }}
                    >
                      <IconWave className="w-8 h-8 md:w-9 md:h-9" />
                    </motion.div>
                  </div>

                  {/* Status texts */}
                  <div className="text-center">
                    <h3 className="font-display text-lg font-bold text-ink leading-tight">
                      {sttState === "listening"
                        ? micMode === "ptt" ? "Listening…" : "Listening..."
                        : sttState === "paused-silence"
                        ? "Microphone Paused"
                        : micMode === "ptt"
                        ? isTouch ? "Tap to talk" : "Hold to talk"
                        : "Microphone Off"}
                    </h3>
                    <p className="text-xs text-soft mt-1 max-w-[200px] leading-relaxed font-semibold">
                      {sttState === "listening"
                        ? micMode === "ptt"
                          ? isTouch ? "Speak now, then tap to send." : "Speak now, then release."
                          : "Speak naturally, I'll take it from here."
                        : micMode === "ptt"
                        ? isTouch ? "Tap anywhere to talk, tap again to send." : "Hold the space bar or tap here, then speak."
                        : "Tap to resume listening"}
                    </p>
                  </div>

                  {/* Horizontal Bar Waveform */}
                  <div className="w-full max-w-[180px] -mt-2">
                    <Waveform active={sttState === "listening"} speaking={ttsActive} volume={micVolume} />
                  </div>
                </div>

                {/* Try Saying Card - Desktop only */}
                <div className="hidden md:flex flex-col gap-2 w-full bg-surface border border-line rounded-2xl p-3.5 text-left shadow-sm">
                  <span className="text-[10px] font-bold text-faint uppercase tracking-wider">Try saying</span>
                  <p className="text-xs font-bold text-ink flex items-center justify-between">
                    <span>&ldquo;Upload my scholarship form&rdquo;</span>
                    <IconChevronRight className="h-3.5 w-3.5 text-soft animate-pulse" />
                  </p>
                </div>

                {/* Privacy Badge - Desktop only */}
                <div className="hidden md:flex items-center gap-2.5 border-t border-line pt-4 w-full text-[10px] text-faint font-bold">
                  <IconShield className="h-4.5 w-4.5 text-accent" />
                  <span>Your data stays private. Always secure.</span>
                </div>
              </div>
            ) : (
              // Minimized / Floating Assistant Layout
              <>
                {/* Mobile View */}
                <div className="flex md:hidden items-center justify-between w-full h-full gap-3">
                  <div className="relative flex items-center justify-center w-12 h-12 shrink-0">
                    <motion.div
                      className="absolute inset-0 bg-accent-soft/30 rounded-full"
                      animate={{
                        scale: sttState === "listening" ? 1 + micVolume * 0.3 : ttsActive ? 1.05 : 1,
                        borderRadius: [
                          "42% 58% 70% 30% / 45% 45% 55% 55%",
                          "70% 30% 52% 48% / 60% 40% 60% 40%",
                          "42% 58% 70% 30% / 45% 45% 55% 55%",
                        ]
                      }}
                      transition={{
                        scale: { type: "spring", stiffness: 200, damping: 15 },
                        borderRadius: { repeat: Infinity, duration: 6, ease: "easeInOut" }
                      }}
                    />
                    <motion.div
                      className="relative flex items-center justify-center bg-accent text-white rounded-full w-9 h-9 shadow-sm"
                      animate={{
                        scale: sttState === "listening" ? 1 + micVolume * 0.1 : 1,
                      }}
                    >
                      <IconWave className="w-4.5 h-4.5" />
                    </motion.div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-ink leading-tight truncate">
                      {sttState === "listening" ? "Swaram is listening" : "Swaram is paused"}
                    </p>
                    <p className="text-[10px] text-soft mt-0.5 truncate">
                      {toast ||
                        (micMode === "ptt" && isTouch
                          ? sttState === "listening"
                            ? "Tap anywhere to send"
                            : "Tap anywhere to talk"
                          : "Speak naturally")}
                    </p>
                  </div>
                  <div className="w-16 shrink-0">
                    <Waveform active={sttState === "listening"} speaking={ttsActive} volume={micVolume} />
                  </div>
                </div>

                {/* Desktop View */}
                <div className="hidden md:flex flex-col justify-between w-full h-full gap-2">
                  <div className="flex items-center gap-3">
                    <div className="relative flex items-center justify-center w-12 h-12 shrink-0">
                      <motion.div
                        className="absolute inset-0 bg-accent-soft/30 rounded-full"
                        animate={{
                          scale: sttState === "listening" ? 1 + micVolume * 0.3 : ttsActive ? 1.05 : 1,
                          borderRadius: [
                            "42% 58% 70% 30% / 45% 45% 55% 55%",
                            "70% 30% 52% 48% / 60% 40% 60% 40%",
                            "42% 58% 70% 30% / 45% 45% 55% 55%",
                          ]
                        }}
                        transition={{
                          scale: { type: "spring", stiffness: 200, damping: 15 },
                          borderRadius: { repeat: Infinity, duration: 6, ease: "easeInOut" }
                        }}
                      />
                      <motion.div
                        className="relative flex items-center justify-center bg-accent text-white rounded-full w-9 h-9 shadow-sm"
                        animate={{
                          scale: sttState === "listening" ? 1 + micVolume * 0.1 : 1,
                        }}
                      >
                        <IconWave className="w-4.5 h-4.5" />
                      </motion.div>
                    </div>
                    <div>
                      <p className="text-sm font-bold text-ink leading-tight">
                        {sttState === "listening" ? "Swaram is listening..." : "Microphone paused"}
                      </p>
                      <p className="text-[11px] text-soft mt-0.5">
                        {toast || "Ask me anything"}
                      </p>
                    </div>
                  </div>
                  <div className="border-t border-line pt-2">
                    <Waveform active={sttState === "listening"} speaking={ttsActive} volume={micVolume} />
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* MOBILE HEADER - Mobile only */}
        {!exclusive && (
          <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-raised/80 px-5 py-3.5 backdrop-blur-md md:hidden">
            <Link href="/" className="flex items-center gap-2.5 font-semibold text-ink no-underline">
              <span className="grid h-8.5 w-8.5 place-items-center rounded-xl bg-accent text-white shadow-sm">
                <IconWave className="h-4.5 w-4.5" />
              </span>
              <span className="font-display text-[1.15rem] font-bold tracking-tight">SWARAM</span>
            </Link>
            <div className="flex items-center gap-3.5">
              {/* Theme Toggle */}
              <button
                onClick={toggleTheme}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-raised text-soft shadow-sm hover:bg-surface cursor-pointer"
                aria-label="Toggle theme"
              >
                {theme === "light" ? <IconMoon className="h-4.5 w-4.5" /> : <IconSun className="h-4.5 w-4.5" />}
              </button>
              <Link href="/profile" className="flex items-center justify-center h-8.5 w-8.5 rounded-full bg-accent font-display text-[13px] font-bold text-white uppercase no-underline">
                {userName.charAt(0)}
              </Link>
            </div>
          </header>
        )}

        {/* MAIN BODY AREA */}
        <div className={`flex flex-1 flex-col min-w-0 bg-surface h-full ${exclusive ? "overflow-hidden" : "overflow-y-auto"}`}>
          {/* HEADER BAR FOR DESKTOP */}
          {!exclusive && (
            <header className="hidden md:flex items-center justify-between border-b border-line bg-raised px-8 py-5">
              <div>
                <h1 className="font-display text-2xl font-bold flex items-center gap-2 leading-none text-ink">
                  {greeting ? `${greeting}, ` : ""}{userName}
                  {greeting && (
                    <span className="text-accent ml-2 shrink-0">
                      {new Date().getHours() < 12 ? (
                        <IconSun className="h-5.5 w-5.5 inline align-text-bottom" />
                      ) : new Date().getHours() < 17 ? (
                        <IconSun className="h-5.5 w-5.5 inline align-text-bottom" />
                      ) : (
                        <IconMoon className="h-5.5 w-5.5 inline align-text-bottom" />
                      )}
                    </span>
                  )}
                </h1>
                <p className="text-xs text-soft font-semibold mt-1">
                  {pathname === "/" 
                    ? "I'm here to help you fill any form. Just speak, I'll handle the rest." 
                    : "Let's get your form filled with ease."}
                </p>
              </div>

              <div className="flex items-center gap-4">
                {/* Theme Toggle Sun/Moon pill */}
                <button
                  onClick={toggleTheme}
                  className="flex items-center gap-1 rounded-full border border-line bg-surface p-1 shadow-sm hover:bg-surface/50 transition-colors cursor-pointer"
                  aria-label="Toggle theme"
                >
                  <span className={`grid h-7 w-7 place-items-center rounded-full transition-all duration-200 ${theme === "light" ? "bg-accent-soft text-accent" : "text-faint"}`}>
                    <IconSun className="h-4 w-4" />
                  </span>
                  <span className={`grid h-7 w-7 place-items-center rounded-full transition-all duration-200 ${theme === "dark" ? "bg-accent-soft text-accent" : "text-faint"}`}>
                    <IconMoon className="h-4 w-4" />
                  </span>
                </button>

                {/* User Dropdown Badge */}
                <Link
                  href="/profile"
                  className="flex items-center gap-3 rounded-2xl border border-line bg-surface pl-3 pr-3.5 py-1.5 shadow-sm hover:bg-surface/50 no-underline text-ink transition-colors"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-accent font-display text-xs font-bold text-white uppercase shrink-0">
                    {userName.charAt(0)}
                  </span>
                  <div className="text-left leading-none">
                    <p className="text-xs font-bold text-ink">{userName}</p>
                    <p className="text-[10px] font-bold text-faint mt-0.5">Active profile</p>
                  </div>
                  <IconChevronDown className="h-3.5 w-3.5 text-faint ml-1 shrink-0" strokeWidth={2.5} />
                </Link>
              </div>
            </header>
          )}

          <main id="main" className={exclusive ? "w-full flex-1 flex flex-col h-full overflow-hidden" : "mx-auto w-full max-w-5xl flex-1 px-5 pb-32 pt-6 md:px-8 md:pt-8"}>
            {children}
          </main>

          {!exclusive && (
            <footer className="border-t border-line py-5 text-center text-xs text-faint flex flex-col sm:flex-row items-center justify-between px-8 gap-2 bg-raised">
              <p>Private by design &mdash; form parsing, OCR, and speech happen locally on your device.</p>
              <span className="flex items-center gap-1.5 font-semibold text-accent shrink-0">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                Offline ready
              </span>
            </footer>
          )}
        </div>

        {/* ONE-TIME PRIVACY NOTICE DIALOG */}
        {showNotice && (
          <div
            role="alertdialog"
            aria-modal="true"
            aria-label="Speech privacy notice"
            className="fixed inset-0 z-50 grid place-items-center bg-ink/40 p-4 backdrop-blur-sm"
          >
            <div className="card max-w-md">
              <div className="mb-3 flex items-start justify-between gap-3">
                <h2 className="font-display text-xl font-bold">Before we use your voice</h2>
                <button
                  type="button"
                  aria-label="Close"
                  className="grid h-9 w-9 place-items-center rounded-full text-soft hover:bg-surface"
                  onClick={() => setShowNotice(false)}
                >
                  <IconX className="h-4 w-4" />
                </button>
              </div>
              <p className="mb-5 text-[0.95rem] leading-relaxed text-soft">{CLOUD_FALLBACK_NOTICE}</p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    acknowledgeCloudNotice();
                    setShowNotice(false);
                    startContinuousListening();
                  }}
                >
                  Continue with voice
                </button>
                <button type="button" className="btn-secondary" onClick={() => setShowNotice(false)}>
                  Use buttons instead
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </VoiceContext.Provider>
  );
}
