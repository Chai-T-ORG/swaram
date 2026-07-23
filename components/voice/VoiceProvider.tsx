"use client";

/**
 * VoiceProvider — the headless voice engine of Swaram.
 *
 * Owns everything that is NOT presentation: the voice context (public API for
 * pages), STT/PTT wiring, transcript routing, theme persistence, conversation
 * logs, mic-volume analysis, model warm-loading, and global voice commands.
 * The visible shells (mobile/desktop) consume this through useVoice() and
 * useVoiceShell() and render whatever chrome suits the device.
 *
 * The logic here moved verbatim from the original GlobalVoice component; the
 * consumer-facing contract (VoiceContextValue, useVoice, useVoicePage) is
 * unchanged.
 */

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
import {
  speak,
  cancelSpeech,
  speechUnlocked,
  unlockAudioPlayback,
  loadKokoro,
  subscribeKokoroStatus,
  addSpeechListener,
  addTtsStateListener,
} from "@/lib/voice/textToSpeech";
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
import { setHapticsEnabled } from "@/lib/voice/haptics";
import { setMicLevel } from "@/lib/voice/micLevel";
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

export type VoiceUiState = "idle" | "listening" | "thinking" | "speaking" | "paused" | "success" | "error";

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
  ttsActive: boolean;
  voiceUiState: VoiceUiState;
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

/**
 * Shell-facing context: everything the visible chrome (top bars, orb dock,
 * consent dialog) needs beyond the public voice API. Internal to the shells —
 * pages should keep using useVoice()/useVoicePage().
 */
interface VoiceShellValue {
  exclusive: boolean;
  pttActive: boolean;
  isTouch: boolean;
  theme: "light" | "dark";
  toggleTheme: () => void;
  userName: string;
  greeting: string;
  showNotice: boolean;
  dismissNotice: () => void;
  /** Consent dialog's primary action: acknowledge + start continuous listening. */
  acknowledgeAndListen: () => void;
  onMicPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onMicPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onMicPointerCancel: () => void;
  togglePtt: () => void;
  voiceUiState: VoiceUiState;
}

const VoiceShellContext = createContext<VoiceShellValue | null>(null);

export function useVoiceShell(): VoiceShellValue {
  const ctx = useContext(VoiceShellContext);
  if (!ctx) throw new Error("useVoiceShell must be used inside VoiceProvider");
  return ctx;
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

export default function VoiceProvider({ children }: { children: ReactNode }) {
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
  const [ttsActive, setTtsActive] = useState(false);

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

  // Track microphone voice volume — uses shared mic stream (no duplicate
  // getUserMedia). Feeds the external micLevel store (NOT React state) so the
  // 60fps updates never re-render the voice context tree.
  useEffect(() => {
    if (sttState !== "listening") {
      setMicLevel(0);
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
          // Skip the FFT work while the tab is hidden (nothing is visible).
          if (typeof document !== "undefined" && document.hidden) {
            animationId = requestAnimationFrame(update);
            return;
          }
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < bufferLength; i++) {
            sum += dataArray[i];
          }
          const avg = sum / bufferLength;
          setMicLevel(Math.min(1, avg / 120));
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

  const toggleTheme = useCallback(() => {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      localStorage.setItem("swaram_theme", next);
      document.documentElement.classList.add(next);
      document.documentElement.classList.remove(current);
      return next;
    });
  }, []);

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

  /**
   * One normal form for every matcher lane: NFC (native scripts), lowercase,
   * apostrophes removed ("let's" → "lets", so /let'?s/ still matches), and all
   * other punctuation/hyphens become spaces ("Re-take." → "re take") — STT
   * punctuation habits must never defeat a command regex.
   */
  const normalizeUtterance = (t: string) =>
    t
      .normalize("NFC")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[.,!?;:"“”()।…|-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const runGlobalTranscript = useCallback(
    (transcript: string) => {
      // NFC so native-script (Malayalam/Hindi) regexes compare against the same
      // code-point form the recognizer emits.
      const heard = normalizeUtterance(transcript);
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
      const lower = normalizeUtterance(transcript);

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
      // Ignore empty/noise fragments so we don't nag "sorry" at stray sounds.
      const trimmed = text.trim();
      if (trimmed.length < 2) return;
      flashToast(`“${text}”`);

      if (pathname.startsWith("/fill/")) {
        addMessage("user", text);
      }

      // Route transcript: the page dialogue gets first refusal; anything it
      // doesn't consume falls through to the global commands, so "go home"
      // or "help" always works — even mid-form.
      const consumedByPage = pageListenerRef.current
        ? pageListenerRef.current(text, confidence)
        : false;
      if (!consumedByPage) {
        const handled = runGlobalTranscript(text);
        // The fill screen runs its own rich dialogue; don't second-guess it.
        // Only escalate to the LLM for a real phrase (avoids "sorry" spam).
        if (!handled && !pageListenerRef.current && !pathname.startsWith("/fill/") && trimmed.length >= 3) {
          void resolveWithLlm(text);
        }
      }
    };

    addTranscriptListener(handleTranscript);

    // Dev-only: lets tests inject an utterance as if STT heard it
    // (scripts/scan-sim.mjs drives voice commands through this).
    if (process.env.NODE_ENV !== "production") {
      (window as unknown as Record<string, unknown>).__swaramSay = (t: string) =>
        handleTranscript(t, 1);
    }

    return () => {
      removeTranscriptListener(handleTranscript);
      if (process.env.NODE_ENV !== "production") {
        delete (window as unknown as Record<string, unknown>).__swaramSay;
      }
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

  // Detect coarse-pointer / touch input or mobile viewport so push-to-talk can adapt
  // its interaction model (tap-toggle) and its on-screen copy ("Tap to talk").
  useEffect(() => {
    const checkTouch = () => {
      setIsTouch(
        (typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches) ||
          "ontouchstart" in window ||
          navigator.maxTouchPoints > 0 ||
          window.innerWidth < 768
      );
    };
    checkTouch();
    window.addEventListener("resize", checkTouch);
    return () => window.removeEventListener("resize", checkTouch);
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
    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
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
      if (e.pointerType === "mouse" && window.innerWidth >= 768) return; // desktop uses hold-to-talk
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
      } else if (event instanceof KeyboardEvent && event.code === "Space") {
        // Always prevent the browser from scrolling on Space, unless the
        // user is typing in a form field.
        if (!isTypingTarget(event.target)) {
          event.preventDefault();
        }
        if (sttState === "off") {
          startListeningNow();
        }
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

  // First-load voice. Page intros are gated on audio being unlocked (browser
  // autoplay policy), so the very FIRST screen a blind user lands on would stay
  // silent until they happened to trigger something. Announce the current
  // page's intro on the first gesture that unlocks audio, then self-remove.
  //
  // CRITICAL: this listens on `pointerUP` in the BUBBLE phase, never
  // `pointerdown`/capture. A capture-phase pointerdown handler here would run
  // BEFORE functional handlers on the same tap, and calling unlockAudioPlayback
  // + speak() consumes the tap's user-activation — which silently breaks any
  // gesture-gated action that runs later in the same tap, e.g. the upload
  // screen's "tap anywhere to open the file picker" (inputRef.click() needs a
  // live user gesture). By the time pointerup fires, the picker has already
  // opened on pointerdown, so we never preempt it.
  useEffect(() => {
    if (typeof window === "undefined" || speechUnlocked()) return;
    const announceOnUnlock = () => {
      unlockAudioPlayback();
      const cfg = pageRef.current;
      const key = `${pathname}:${cfg.title ?? ""}`;
      if (cfg.title && announcedRef.current !== key) {
        announcedRef.current = key;
        speak(`${cfg.title}.${cfg.hint ? ` ${cfg.hint}` : ""}`);
      }
      window.removeEventListener("pointerup", announceOnUnlock);
      window.removeEventListener("keydown", announceOnUnlock);
    };
    window.addEventListener("pointerup", announceOnUnlock);
    window.addEventListener("keydown", announceOnUnlock);
    return () => {
      window.removeEventListener("pointerup", announceOnUnlock);
      window.removeEventListener("keydown", announceOnUnlock);
    };
  }, [pathname]);

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

  // Keep micMode + haptics in sync with settings (updates when the user changes
  // them in Profile and navigates back).
  useEffect(() => {
    const s = getVoiceSettings();
    setMicMode(s.micMode);
    setHapticsEnabled(s.hapticsEnabled);
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

  const listening = sttState === "listening";
  const thinking = !listening && toast.startsWith("Thinking");
  const isError = toast.toLowerCase().includes("fail") || toast.toLowerCase().includes("error") || toast.toLowerCase().includes("denied");
  const isSuccess = toast.toLowerCase().includes("ready") || toast.toLowerCase().includes("saved") || toast.toLowerCase().includes("done") || toast.toLowerCase().includes("complete");

  const voiceUiState: VoiceUiState =
    isError ? "error"
    : isSuccess ? "success"
    : listening ? "listening"
    : ttsActive ? "speaking"
    : thinking ? "thinking"
    : sttState === "paused-silence" ? "paused"
    : "idle";

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
    ttsActive,
    voiceUiState,
  };

  const shellValue: VoiceShellValue = {
    exclusive,
    pttActive,
    isTouch,
    theme,
    toggleTheme,
    userName,
    greeting,
    showNotice,
    dismissNotice: () => setShowNotice(false),
    acknowledgeAndListen: () => {
      acknowledgeCloudNotice();
      setShowNotice(false);
      startContinuousListening();
    },
    onMicPointerDown,
    onMicPointerUp,
    onMicPointerCancel,
    togglePtt,
    voiceUiState,
  };

  return (
    <VoiceContext.Provider value={contextValue}>
      <VoiceShellContext.Provider value={shellValue}>
        {children}
      </VoiceShellContext.Provider>
    </VoiceContext.Provider>
  );
}
