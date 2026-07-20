"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  isOnboardingComplete,
  markOnboardingComplete,
  getVoiceSettings,
  setVoiceSettings,
  type MicMode,
} from "@/lib/voice/voiceSettings";
import {
  subscribeSetup,
  getSetupState,
  type SetupState,
} from "@/lib/voice/modelManager";
import { initMicDetailed, type MicResult } from "@/lib/voice/micManager";
import { speak, unlockAudioPlayback } from "@/lib/voice/textToSpeech";
import {
  startContinuousListening,
  stopContinuousListening,
  addTranscriptListener,
  removeTranscriptListener,
} from "@/lib/voice/speechToText";
import { IconCheck, IconShield, IconMic, IconSparkle } from "@/components/icons";
import VoiceOrb from "@/components/ui/VoiceOrb";
import { useVoice } from "@/components/voice/VoiceProvider";

export default function SetupOverlay() {
  const prefersReducedMotion = useReducedMotion();
  const [modelState, setModelState] = useState<SetupState>(getSetupState);
  const [visible, setVisible] = useState(false);
  const [selectedMicMode, setSelectedMicMode] = useState<MicMode>("ptt");

  // Mic permission & request states
  const [micActivated, setMicActivated] = useState(false);
  const [micRequesting, setMicRequesting] = useState(false);
  const [micResult, setMicResult] = useState<MicResult | null>(null);

  // Spoken transcript feedback for onboarding
  const [lastHeardSpeech, setLastHeardSpeech] = useState<string>("");

  // Check if onboarding is needed
  useEffect(() => {
    if (isOnboardingComplete()) {
      setVisible(false);
      return;
    }
    const curSettings = getVoiceSettings();
    setSelectedMicMode(curSettings.micMode);
    setVisible(true);
  }, []);

  // Listen for replay events (e.g. from Profile settings)
  useEffect(() => {
    const checkVisibility = () => {
      if (!isOnboardingComplete()) {
        const curSettings = getVoiceSettings();
        setSelectedMicMode(curSettings.micMode);
        setMicActivated(false);
        setMicRequesting(false);
        setMicResult(null);
        setLastHeardSpeech("");
        setVisible(true);
      }
    };

    window.addEventListener("swaram_replay_onboarding", checkVisibility);
    return () => window.removeEventListener("swaram_replay_onboarding", checkVisibility);
  }, []);

  // Subscribe to model download progress
  useEffect(() => {
    return subscribeSetup(setModelState);
  }, []);

  // Finish onboarding smoothly with a smart "Welcome back" greeting
  const handleComplete = useCallback(() => {
    unlockAudioPlayback();
    stopContinuousListening();
    markOnboardingComplete();
    setVisible(false);
    speak("Welcome back! How may I assist you today?", { interrupt: true });
  }, []);

  // Robust command parser for hands-free onboarding voice input
  const handleOnboardingTranscript = useCallback((rawText: string) => {
    const text = rawText.toLowerCase().trim();
    console.log("[Onboarding Transcript Received]:", text);
    setLastHeardSpeech(rawText);

    if (/push|ptt|talk|option 1|option one|one|first/i.test(text)) {
      setSelectedMicMode("ptt");
      setVoiceSettings({ micMode: "ptt" });
      speak("Push-to-talk selected. Hold spacebar or tap the orb to talk.", { interrupt: true });
    } else if (/hands|free|handsfree|continuous|option 2|option two|two|second/i.test(text)) {
      setSelectedMicMode("continuous");
      setVoiceSettings({ micMode: "continuous" });
      speak("Hands-free selected. Swaram listens continuously.", { interrupt: true });
    } else if (/start|begin|continue|go|lets go|let's go|ready|enter|done|complete|okay|ok/i.test(text)) {
      handleComplete();
    } else if (/repeat|help|options|what|say/i.test(text)) {
      speak(
        "Say Push to talk, or say Hands free, or say Start to begin.",
        { interrupt: true }
      );
    } else if (/skip/i.test(text)) {
      handleComplete();
    }
  }, [handleComplete]);

  // Connect onboarding to Swaram's transcript stream. Registered as the PAGE
  // listener (consuming everything): the overlay is modal, so an utterance
  // like "back" or "help" must drive onboarding — not the global command
  // table underneath it (router.back() mid-setup was possible before).
  const voice = useVoice();
  useEffect(() => {
    if (!visible || !micActivated) return;

    const listener = (text: string) => {
      handleOnboardingTranscript(text);
      return true; // modal — nothing falls through while setup is on screen
    };

    if (voice) return voice.registerPageTranscriptListener(listener);
    const plain = (text: string) => void handleOnboardingTranscript(text);
    addTranscriptListener(plain);
    return () => {
      removeTranscriptListener(plain);
    };
  }, [visible, micActivated, handleOnboardingTranscript, voice]);

  // SINGLE-TAP & KEYPRESS UNIVERSAL ACTIVATION GATE
  const handleUniversalActivation = useCallback(async () => {
    // 1. Synchronously unlock HTML5 Audio Context & play TTS FIRST inside the user gesture
    unlockAudioPlayback();
    
    if (micActivated) {
      handleComplete();
      return;
    }

    speak(
      "Welcome to Swaram. Microphone enabled. I read forms aloud and fill them by voice. Say Push to talk, or say Hands free, or say Start to begin.",
      { interrupt: true }
    );

    setMicRequesting(true);
    setMicResult(null);

    // 2. Initiate mic request immediately
    const res = await initMicDetailed();
    setMicRequesting(false);
    setMicResult(res);

    if (res.ok && res.stream && res.stream.active) {
      setMicActivated(true);
      setVoiceSettings({ micMode: selectedMicMode });
      // Start continuous STT listening via Swaram's primary speech engine
      startContinuousListening({ lang: "en-IN" });
    } else {
      speak(
        "Microphone access was denied or unavailable. Tap anywhere to try again, or press space to continue with typed controls.",
        { interrupt: true }
      );
    }
  }, [micActivated, selectedMicMode, handleComplete]);

  // Global Keypress listener for accessibility (Space/Enter to trigger activation or voice commands)
  useEffect(() => {
    if (!visible) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        void handleUniversalActivation();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible, handleUniversalActivation]);

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-surface/94 backdrop-blur-lg p-4 sm:p-6 overflow-y-auto cursor-pointer"
        onClick={handleUniversalActivation}
        role="alertdialog"
        aria-modal="true"
        aria-label="Welcome to Swaram. Tap anywhere on screen or press Space to enable voice assistant"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: prefersReducedMotion ? 0 : 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: prefersReducedMotion ? 0 : -12 }}
          transition={{ type: "spring", stiffness: 220, damping: 22 }}
          className="relative max-w-xl w-full p-6 sm:p-8 rounded-3xl bg-raised border border-line shadow-2xl overflow-hidden my-auto cursor-default text-center"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Bar */}
          <div className="flex items-center justify-between border-b border-line pb-4 mb-6">
            <div className="flex items-center gap-2">
              <img src="/logo.png" alt="" className="h-7 w-7 rounded-lg object-contain shadow-xs" />
              <span className="text-xs font-bold uppercase tracking-wider text-ink">
                {micActivated ? "Voice Assistant Active" : "Voice Setup"}
              </span>
            </div>

            <button
              onClick={handleComplete}
              className="text-xs font-semibold text-soft hover:text-ink transition-colors cursor-pointer px-2.5 py-1 rounded-lg focus-visible:outline-2 focus-visible:outline-accent"
              aria-label="Skip onboarding"
            >
              Skip
            </button>
          </div>

          {/* Orb visual center */}
          <div className="mb-6 flex justify-center cursor-pointer" onClick={handleUniversalActivation}>
            <VoiceOrb state={micRequesting ? "thinking" : micActivated ? "listening" : "idle"} size="lg" />
          </div>

          <h1 className="font-display text-3xl mb-2 text-ink tracking-tight">
            Welcome to Swaram
          </h1>
          <p className="text-sm leading-relaxed text-soft max-w-md mx-auto mb-6">
            Swaram reads forms aloud and fills them by voice — built for blind and low-vision users.
          </p>

          {/* State Feedback */}
          {micRequesting ? (
            <div className="w-full p-4 rounded-2xl border border-accent/40 bg-accent-soft/30 text-sm font-bold text-accent animate-pulse mb-6">
              Waiting for browser microphone permission…
            </div>
          ) : micResult && !micResult.ok ? (
            <div className="w-full p-4 rounded-2xl border border-bad/40 bg-bad-soft text-left space-y-2 mb-6">
              <p className="text-xs font-bold text-bad">
                {micResult.error === "denied"
                  ? "Microphone access was denied."
                  : micResult.error === "unsupported"
                  ? "Microphone access is not supported in this browser."
                  : "Microphone hardware is unavailable or in use."}
              </p>
              <p className="text-xs text-soft">{micResult.message}</p>
              <button
                type="button"
                onClick={handleUniversalActivation}
                className="btn-primary w-full mt-2 py-3 text-xs"
              >
                Try Microphone Again
              </button>
            </div>
          ) : micActivated ? (
            /* ACTIVE VOICE MODE SELECTION & READY CONSOLE */
            <div className="space-y-4 text-left border-t border-line pt-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-soft">
                  Listening Mode (Say &ldquo;Push to talk&rdquo; or &ldquo;Hands free&rdquo;)
                </span>
                <span className="chip bg-accent-soft text-accent text-[10px] font-bold uppercase tracking-wider animate-pulse flex items-center gap-1">
                  <IconSparkle className="h-3 w-3" />
                  Listening
                </span>
              </div>

              {lastHeardSpeech && (
                <div className="p-2.5 rounded-xl border border-accent/30 bg-accent-soft/20 text-xs text-ink">
                  <span className="font-bold text-accent">Heard:</span> &ldquo;{lastHeardSpeech}&rdquo;
                </div>
              )}

              <div className="grid gap-2.5" role="radiogroup" aria-label="Listening mode">
                <button
                  type="button"
                  role="radio"
                  aria-checked={selectedMicMode === "ptt"}
                  onClick={() => {
                    unlockAudioPlayback();
                    setSelectedMicMode("ptt");
                    setVoiceSettings({ micMode: "ptt" });
                    speak("Push-to-talk selected. Hold spacebar or tap the orb to talk.", { interrupt: true });
                  }}
                  className={`flex items-center justify-between p-3.5 rounded-2xl border text-left transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-accent ${
                    selectedMicMode === "ptt"
                      ? "border-accent bg-accent-soft/30 shadow-sm"
                      : "border-line bg-raised hover:bg-sunken"
                  }`}
                >
                  <div>
                    <p className="text-xs font-bold text-ink">Push-to-talk (Recommended)</p>
                    <p className="text-[11px] text-soft">Hold spacebar or tap the orb to talk.</p>
                  </div>
                  {selectedMicMode === "ptt" && (
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-on-accent shrink-0">
                      <IconCheck className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={selectedMicMode === "continuous"}
                  onClick={() => {
                    unlockAudioPlayback();
                    setSelectedMicMode("continuous");
                    setVoiceSettings({ micMode: "continuous" });
                    speak("Hands-free selected. Swaram listens continuously.", { interrupt: true });
                  }}
                  className={`flex items-center justify-between p-3.5 rounded-2xl border text-left transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-accent ${
                    selectedMicMode === "continuous"
                      ? "border-accent bg-accent-soft/30 shadow-sm"
                      : "border-line bg-raised hover:bg-sunken"
                  }`}
                >
                  <div>
                    <p className="text-xs font-bold text-ink">Hands-free</p>
                    <p className="text-[11px] text-soft">Always listening in quiet rooms.</p>
                  </div>
                  {selectedMicMode === "continuous" && (
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-accent text-on-accent shrink-0">
                      <IconCheck className="h-3.5 w-3.5" />
                    </span>
                  )}
                </button>
              </div>

              {/* Inline Model Download Progress */}
              {modelState.stage === "downloading" && (
                <div className="w-full p-3 rounded-2xl border border-line bg-sunken space-y-2 text-left">
                  <div className="flex items-center justify-between text-xs font-semibold text-ink">
                    <span>Offline voice model downloading…</span>
                    <span>{Math.round(modelState.overallProgress * 100)}%</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden bg-line">
                    <motion.div
                      className="h-full bg-accent rounded-full"
                      animate={{ width: `${Math.round(modelState.overallProgress * 100)}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                onClick={handleComplete}
                className="w-full py-4 px-6 rounded-full font-bold text-on-accent text-base bg-accent hover:bg-accent-hover transition-all shadow-md cursor-pointer flex items-center justify-center gap-2 mt-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                <IconCheck className="w-5 h-5" />
                <span>Start Using Swaram (or Say &ldquo;Start&rdquo;)</span>
              </button>
            </div>
          ) : (
            /* FIRST GESTURE ACTIVATION BUTTON */
            <button
              type="button"
              autoFocus
              onClick={handleUniversalActivation}
              className="w-full py-4.5 px-6 rounded-full font-bold text-on-accent text-base bg-accent hover:bg-accent-hover transition-all shadow-md cursor-pointer flex items-center justify-center gap-2.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent mb-2"
              aria-label="Welcome to Swaram. Tap anywhere on screen or press Space bar to enable voice assistant"
            >
              <IconMic className="w-5 h-5" />
              <span>Tap Anywhere or Press Space to Enable Voice</span>
            </button>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
