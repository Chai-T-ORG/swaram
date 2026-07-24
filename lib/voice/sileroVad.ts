/**
 * sileroVad.ts — neural Voice Activity Detection (Silero via
 * @ricky0123/vad-web) behind the same handle contract as the energy VAD.
 *
 * Why: the energy threshold fires on fans/traffic and clips soft unvoiced
 * onsets (the "T" in "Tejas"), which is exactly the audio that makes Whisper
 * hallucinate. Silero predicts the probability of human speech per 32 ms
 * frame, so segmentation survives noisy Indian households.
 *
 * Design constraints honored here:
 *  - The SHARED micManager stream is used; the library's default stream
 *    callbacks stop tracks, which would kill every other consumer, so all
 *    three lifecycle callbacks are overridden to never touch the tracks.
 *  - AudioWorklet where available ("auto" falls back to ScriptProcessor).
 *  - Everything fails soft: any load/start error marks Silero unavailable
 *    for the session and the caller drops to the energy VAD unchanged.
 *
 * Assets are self-hosted in /public/vad (model, worklet, ORT wasm) so no
 * CDN is involved; onnxruntime-web resolves its wasm from the same folder.
 */

type MicVADLike = {
  start: () => Promise<void>;
  pause: () => Promise<void>;
  destroy: () => Promise<void>;
  setOptions: (update: { redemptionMs?: number; positiveSpeechThreshold?: number; negativeSpeechThreshold?: number }) => void;
};

import { getStream, initMic } from "./micManager";
import { registerSileroSpellSetter, type VadHandle } from "./vadCapture";

/** Sticky availability: one failure disables Silero for this session. */
let sileroFailed = false;

export function isSileroDisabled(): boolean {
  return sileroFailed;
}

/**
 * Start Silero-based capture. Emits one Float32Array per utterance at
 * 16 kHz (the library resamples internally). Returns null when the model
 * can't load or the mic is unavailable — callers fall back to energy VAD.
 */
export async function startSileroCapture(
  onUtterance: (pcm: Float32Array, sampleRate: number) => void,
): Promise<VadHandle | null> {
  if (sileroFailed || typeof window === "undefined") return null;

  let stream = getStream();
  if (!stream) stream = await initMic();
  if (!stream) return null;
  const shared = stream;

  try {
    const { MicVAD } = await import("@ricky0123/vad-web");
    let destroyed = false;
    let paused = false;

    const vad = (await MicVAD.new({
      model: "v5",
      baseAssetPath: "/vad/",
      onnxWASMBasePath: "/vad/",
      processorType: "auto",
      startOnLoad: false,
      // Reuse the app's single mic stream; never stop its tracks.
      getStream: async () => shared,
      pauseStream: async () => {},
      resumeStream: async () => shared,
      // Tuned to mirror the energy VAD's timing so the rest of the pipeline
      // sees identical segmentation semantics:
      positiveSpeechThreshold: 0.7,  // robust onset without ambient triggers
      negativeSpeechThreshold: 0.45,
      redemptionMs: 500,             // silence that ends the utterance
      preSpeechPadMs: 300,           // pre-roll — soft onsets survive
      minSpeechMs: 150,              // minimum real speech
      onSpeechEnd: (audio: Float32Array) => {
        if (destroyed || paused) return;
        if (audio.length < 16000 * 0.1) return;
        onUtterance(audio, 16000);
      },
    })) as MicVADLike;

    await vad.start();
    console.log("[SileroVAD] neural VAD active");

    // Spell mode: hold utterances open across the long pauses between
    // dictated letters (mirrors the energy VAD's SPELL_FLUSH_MS).
    registerSileroSpellSetter((on) => {
      try { vad.setOptions({ redemptionMs: on ? 2000 : 500 }); } catch { /* tuning is best-effort */ }
    });

      return {
      stop() {
        destroyed = true;
        void vad.destroy();
      },
      pause() {
        paused = true;
        void vad.pause();
      },
      resume() {
        paused = false;
        void vad.start();
      },
      setThreshold(value: number) {
        try { vad.setOptions({ positiveSpeechThreshold: value }); } catch { /* best-effort */ }
      },
    };
  } catch (err) {
    sileroFailed = true;
    console.warn("[SileroVAD] unavailable — falling back to energy VAD:", err instanceof Error ? err.message : err);
    return null;
  }
}
