"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  subscribeSetup,
  getSetupState,
  isSetupComplete,
  markSetupComplete,
  formatBytes,
  formatSpeed,
  retry,
  updateSttProgress,
  markSttReady,
  updateTtsProgress,
  markTtsReady,
  type SetupState,
} from "@/lib/voice/modelManager";
import { loadKokoro } from "@/lib/voice/textToSpeech";
import { loadWhisper } from "@/lib/voice/whisperSTT";
import { probeGroqAvailability, isAzureConfigured } from "@/lib/voice/groqSTT";
import { getVoiceSettings } from "@/lib/voice/voiceSettings";
import { initMic } from "@/lib/voice/micManager";
import { speak, unlockAudioPlayback } from "@/lib/voice/textToSpeech";
import { IconMic, IconCheck } from "@/components/icons";

/**
 * SetupOverlay — the one-tap welcome shown on first visit.
 *
 * With cloud voices (the default), nothing is downloaded, so this is simply a
 * "tap to begin" screen. That tap is essential: it unlocks audio playback (iOS
 * requires a user gesture) and requests the microphone, so the very first spoken
 * line is actually audible. The download progress UI only appears when the user
 * has opted into an offline engine (on-device Kokoro voice or Whisper).
 */
export default function SetupOverlay() {
  const [state, setState] = useState<SetupState>(getSetupState);
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  // Refs (not state) so flipping them can't re-run the dismiss effect and
  // clear its timer before it fires — the reason the overlay used to hang.
  const announcedRef = useRef(false);
  const dismissTimerRef = useRef<number | null>(null);

  // Check if setup is needed
  useEffect(() => {
    if (isSetupComplete()) {
      setDismissed(true);
      return;
    }
    setVisible(true);
  }, []);

  // Subscribe to setup state
  useEffect(() => {
    return subscribeSetup(setState);
  }, []);

  // Auto-dismiss when ready. Uses refs so it fires exactly once and the timer
  // is never cleared by a re-render.
  useEffect(() => {
    if (state.stage !== "ready" || dismissed) return;
    if (!announcedRef.current) {
      announcedRef.current = true;
      const isTouch =
        typeof window !== "undefined" &&
        ((typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches) ||
          "ontouchstart" in window ||
          navigator.maxTouchPoints > 0);
      speak(
        getVoiceSettings().micMode === "ptt"
          ? isTouch
            ? "All set. Tap anywhere to talk, then tap again to send."
            : "All set. Hold the space bar, or tap the microphone, then speak."
          : "All set. I'm listening — just tell me what you'd like to do.",
        { interrupt: false },
      );
    }
    if (dismissTimerRef.current === null) {
      dismissTimerRef.current = window.setTimeout(() => {
        markSetupComplete(); // persist so setup never re-runs on reload
        setVisible(false);
        window.setTimeout(() => setDismissed(true), 600);
      }, 2500);
    }
  }, [state.stage, dismissed]);

  // Start downloads on first user gesture
  const startSetup = useCallback(async () => {
    if (hasStarted) return;
    setHasStarted(true);

    // This tap is the user gesture that unlocks audio (iOS won't play a sound
    // otherwise). Do it first, then request the microphone.
    unlockAudioPlayback();
    await initMic();

    const { ttsProvider, sttProvider } = getVoiceSettings();
    const needsDownload = ttsProvider === "local" || sttProvider === "whisper";

    speak(
      needsDownload
        ? "Swaram here. I'm getting your offline voice ready. This happens only once and takes about a minute — I'll tell you the moment it's ready."
        : "Welcome to Swaram. Your voice assistant is ready.",
      { interrupt: true },
    );

    // TTS: cloud and system voices are instant. Only on-device Kokoro downloads,
    // and if it fails we still complete on the system voice — a voice-model
    // hiccup must never wedge the whole app on the welcome screen.
    if (ttsProvider === "local") {
      loadKokoro()
        .then((tts) => {
          if (!tts) {
            updateTtsProgress(1, "Using system voice");
            markTtsReady();
          }
        })
        .catch(() => {
          updateTtsProgress(1, "Using system voice");
          markTtsReady();
        });
    } else {
      updateTtsProgress(1, ttsProvider === "cloud" ? "Cloud voice ready" : "System voice ready");
      markTtsReady();
    }

    // STT: cloud engines (Groq / Azure) download nothing — mark ready once a
    // key is confirmed. Only on-device Whisper fetches a model.
    if (sttProvider === "groq" || sttProvider === "auto" || sttProvider === "azure") {
      probeGroqAvailability().then((groqOk) => {
        const ok = sttProvider === "azure" ? isAzureConfigured() : groqOk;
        if (ok) {
          updateSttProgress(1, "Cloud voice ready");
          markSttReady();
        } else {
          loadWhisper().catch(console.error);
        }
      });
    } else if (sttProvider === "whisper") {
      loadWhisper().catch(console.error);
    } else {
      updateSttProgress(1, "Ready");
      markSttReady();
    }
  }, [hasStarted]);

  if (dismissed) return null;

  const overallPercent = Math.round(state.overallProgress * 100);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-surface/90 backdrop-blur-md"
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5, type: "spring" }}
            className="max-w-lg w-full mx-4 p-8 rounded-3xl bg-raised border border-line shadow-2xl"
          >
            {/* Logo / Branding */}
            <div className="text-center mb-8">
              <motion.div
                initial={{ scale: 0, rotate: -20 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: "spring", delay: 0.3, damping: 15 }}
                className="w-20 h-20 mx-auto rounded-full flex items-center justify-center mb-6 bg-gradient-to-br from-accent to-accent-deep shadow-button"
              >
                <IconMic className="w-10 h-10 text-white" strokeWidth={1.5} />
              </motion.div>

              <h1 className="text-2xl font-bold mb-2 text-ink">
                Welcome to Swaram
              </h1>
              <p className="text-sm text-soft">
                {!hasStarted
                  ? "Tap below to begin. I'll read your forms aloud and fill them in for you — just by talking."
                  : state.stage === "ready"
                    ? "Your voice assistant is ready to use."
                    : "Getting your offline voice ready. This only happens once."
                }
              </p>
            </div>

            {/* Start Button (before download begins) */}
            {!hasStarted && (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={startSetup}
                aria-label="Tap to begin using Swaram"
                className="w-full py-5 px-6 rounded-2xl font-bold text-white text-lg mb-6 cursor-pointer bg-accent hover:bg-accent-deep shadow-button transition-colors"
              >
                Tap to begin
              </motion.button>
            )}

            {/* Download Progress (after started) */}
            {hasStarted && state.stage !== "ready" && (
              <div className="space-y-5 mb-6">
                {/* Per-model progress */}
                {state.models.map((model) => (
                  <div key={model.id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-ink">
                        {model.name}
                      </span>
                      <span className="text-xs tabular-nums text-soft">
                        {model.status === "ready"
                          ? "Done"
                          : model.status === "error"
                            ? "Failed"
                            : `${Math.round(model.progress * 100)}%`
                        }
                      </span>
                    </div>
                    <div className="h-2 rounded-full overflow-hidden bg-line">
                      <motion.div
                        className="h-full rounded-full"
                        style={{
                          background: model.status === "error"
                            ? "var(--bad)"
                            : model.status === "ready"
                              ? "var(--ok)"
                              : "var(--accent)",
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(model.progress * 100, model.status === "error" ? 100 : 0)}%` }}
                        transition={{ duration: 0.3, ease: "easeOut" }}
                      />
                    </div>
                    <p className="text-xs mt-1 text-faint">
                      {model.detail}
                    </p>
                    {model.status === "error" && (
                      <button
                        onClick={() => retry(model.id)}
                        className="text-xs mt-1 underline cursor-pointer text-accent font-medium"
                      >
                        Retry download
                      </button>
                    )}
                  </div>
                ))}

                {/* Overall progress bar */}
                <div className="pt-3 border-t border-line">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-semibold text-ink">
                      Overall Progress
                    </span>
                    <span className="text-xs tabular-nums font-bold text-accent">
                      {overallPercent}%
                    </span>
                  </div>
                  <div className="h-3 rounded-full overflow-hidden bg-line">
                    <motion.div
                      className="h-full rounded-full bg-accent"
                      initial={{ width: 0 }}
                      animate={{ width: `${overallPercent}%` }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                    />
                  </div>
                </div>

                {/* Speed and ETA */}
                <div className="flex items-center justify-between text-xs text-soft">
                  <span>
                    {state.speed > 0 ? `Downloading at ${formatSpeed(state.speed)}` : "Starting download…"}
                  </span>
                  <span>{state.eta}</span>
                </div>

                {/* Total size */}
                <p className="text-xs text-center text-faint">
                  {state.totalSize} — downloaded once, cached offline forever
                </p>
              </div>
            )}

            {/* Ready state */}
            {state.stage === "ready" && (
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-center py-4"
              >
                <div
                  className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
                  style={{
                    background: "var(--color-success, #22c55e)",
                    boxShadow: "0 8px 24px rgba(34, 197, 94, 0.3)",
                  }}
                >
                  <IconCheck className="w-8 h-8 text-white" strokeWidth={2.5} />
                </div>
                <p className="text-lg font-bold text-ink">
                  All Set
                </p>
                <p className="text-sm mt-1 text-soft">
                  Your voice assistant is ready. Entering Swaram…
                </p>
              </motion.div>
            )}

            {/* Skip option */}
            {hasStarted && state.stage !== "ready" && (
              <button
                onClick={() => {
                  setVisible(false);
                  setTimeout(() => setDismissed(true), 600);
                }}
                className="w-full text-center text-xs py-2 cursor-pointer text-soft hover:text-ink transition-colors bg-transparent border-none"
              >
                Skip — I'll use the system voice for now
              </button>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
