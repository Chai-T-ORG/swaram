/**
 * vadCapture.ts — shared microphone capture with energy-based Voice Activity
 * Detection. Emits one Float32Array per spoken utterance, resampled to 16 kHz
 * mono, which is what both on-device Whisper and cloud transcription want.
 *
 * Mirrors the VAD tuning used by the on-device Whisper path so the two engines
 * segment speech identically.
 */
import { getStream, initMic } from "./micManager";

// Smaller frames = finer-grained end-of-speech detection (lower latency).
const FRAME_SIZE = 2048;
const SPEECH_THRESHOLD = 0.012;
// Time-based thresholds (sample-rate independent) — the old frame-count VAD
// waited ~3.8s of silence, which made every command feel broken.
// A short affirmative, initial, or one-word command can be well under 150 ms.
// Let STT and the conservative transcript filter decide whether it is useful;
// VAD should not silently discard a valid user turn based on duration alone.
const MIN_SPEECH_MS = 60;
const SILENCE_FLUSH_MS = 500; // end the utterance this long after speech stops
                              // (500ms keeps short commands snappy without
                              //  clipping the natural pauses in a spoken answer)
// Spelling letter-by-letter has LONG pauses between letters; flushing at
// 500 ms chops "T W I…" / "N S H A" into fragments — the reason spell mode
// felt broken. While the spell hint is active, wait much longer.
const SPELL_FLUSH_MS = 2000;

let spellMode = false;
let sileroSpellSetter: ((on: boolean) => void) | null = null;

/**
 * Called by the STT hint plumbing when the user enters/leaves spell mode, so
 * BOTH VADs (energy + Silero) hold the utterance open between letters.
 */
export function setVadSpellMode(on: boolean): void {
  spellMode = on;
  sileroSpellSetter?.(on);
}

/** The Silero module registers its live-tuning hook here (avoids a cycle). */
export function registerSileroSpellSetter(fn: (on: boolean) => void): void {
  sileroSpellSetter = fn;
  fn(spellMode);
}
const MAX_UTTERANCE_MS = 14000; // hard cap
// Keep this much audio from *before* speech is detected, so soft word onsets
// ("T" in "Tejas") aren't clipped — clipped onsets are what makes Whisper
// hallucinate ("Tejas KM" -> "They just came").
const PRE_ROLL_MS = 300;

export interface VadHandle {
  stop(): void;
  pause(): void;
  resume(): void;
  /** Update the speech detection threshold (for barge-in during TTS). */
  setThreshold(value: number): void;
}

function energy(samples: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

/**
 * Start capturing. `onUtterance` fires once per detected utterance with mono
 * PCM at the capture sample rate (also passed) — we do NOT downsample on the
 * client, so there's no aliasing; the transcription service resamples with a
 * proper filter server-side, which is far more accurate. Returns null if the
 * microphone can't be acquired.
 *
 * @param onUtterance - Called when a complete utterance is detected
 * @param options.onSpeechStart - Called when speech first detected (for barge-in)
 * @param options.bargeInThreshold - Energy threshold for barge-in detection (higher = less sensitive)
 */
export async function startVadCapture(
  onUtterance: (pcm: Float32Array, sampleRate: number) => void,
  options?: {
    onSpeechStart?: () => void;
    bargeInThreshold?: number;
  },
): Promise<VadHandle | null> {
  // Prefer the neural VAD (Silero) — far better segmentation in noisy rooms
  // and it never clips soft consonant onsets. Falls back to the energy loop
  // below on any load failure (old browsers, missing /vad assets, iOS WASM
  // quirks), which keeps this function's contract unchanged.
  const { startSileroCapture, isSileroDisabled } = await import("./sileroVad");
  if (!isSileroDisabled()) {
    const silero = await startSileroCapture(onUtterance);
    if (silero) return silero;
  }

  let stream = getStream();
  if (!stream) stream = await initMic();
  if (!stream) return null;

  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  // Use the hardware's native rate — forcing 16 kHz here would make the
  // browser resample, and not all browsers honor it anyway.
  const audioContext = new AudioCtx();
  if (audioContext.state === "suspended") {
    try { await audioContext.resume(); } catch { /* ignore */ }
  }
  const sr = audioContext.sampleRate;

  const source = audioContext.createMediaStreamSource(stream);
  const processor = audioContext.createScriptProcessor(FRAME_SIZE, 1, 1);

  let buffer: Float32Array[] = [];    // audio of the current utterance
  let preRoll: Float32Array[] = [];   // rolling window of pre-speech audio
  let speechMs = 0;
  let silenceMs = 0;
  let paused = false;
  let stopped = false;

  // Barge-in support: raised threshold during TTS so only genuine user speech triggers
  let speechThreshold = SPEECH_THRESHOLD;
  const onSpeechStart = options?.onSpeechStart;

  const totalMs = (frames: Float32Array[]) =>
    (frames.reduce((s, b) => s + b.length, 0) / sr) * 1000;
  const frameMsOf = (frame: Float32Array) => (frame.length / sr) * 1000;

  const flush = () => {
    const hadSpeech = speechMs >= MIN_SPEECH_MS;
    const utteranceSpeechMs = speechMs;
    const chunks = buffer;
    buffer = [];
    speechMs = 0;
    silenceMs = 0;
    if (!hadSpeech || chunks.length === 0) return;
    // Pre-flight quality gate: a clip that is almost entirely silence is a
    // noise transient (fan, traffic) that briefly crossed the threshold, not
    // speech. Sending it wastes a network call and is exactly the input that
    // makes Whisper hallucinate a fluent sentence out of nothing.
    const clipMs = totalMs(chunks);
    if (clipMs > 2000 && utteranceSpeechMs / clipMs < 0.15) return;
    const total = chunks.reduce((s, b) => s + b.length, 0);
    const full = new Float32Array(total);
    let off = 0;
    for (const b of chunks) { full.set(b, off); off += b.length; }
    onUtterance(full, sr);
  };

  processor.onaudioprocess = (event) => {
    if (stopped || paused) return;
    const raw = event.inputBuffer.getChannelData(0);
    const samples = new Float32Array(raw.length);
    samples.set(raw); // native-rate mono; no client-side resampling
    const loud = energy(samples) > speechThreshold;

    if (speechMs === 0) {
      // Idle: keep a short rolling pre-roll so a word's onset isn't lost.
      preRoll.push(samples);
      while (preRoll.length > 1 && totalMs(preRoll) > PRE_ROLL_MS) preRoll.shift();
      if (loud) {
        // Speech begins — seed the utterance with the pre-roll.
        buffer = preRoll;
        preRoll = [];
        buffer.push(samples);
        speechMs = frameMsOf(samples);
        silenceMs = 0;
        // Notify listener that speech started (for barge-in detection)
        onSpeechStart?.();
      }
      return;
    }

    // Collecting an utterance.
    buffer.push(samples);
    if (loud) {
      speechMs += frameMsOf(samples);
      silenceMs = 0;
    } else {
      silenceMs += frameMsOf(samples);
      if (silenceMs >= (spellMode ? SPELL_FLUSH_MS : SILENCE_FLUSH_MS)) flush();
    }
    if (totalMs(buffer) >= MAX_UTTERANCE_MS) flush();
  };

  source.connect(processor);
  processor.connect(audioContext.destination);

  return {
    stop() {
      stopped = true;
      flush();
      try { processor.disconnect(); } catch { /* ignore */ }
      processor.onaudioprocess = null;
      try { source.disconnect(); } catch { /* ignore */ }
      if (audioContext.state !== "closed") audioContext.close().catch(() => {});
    },
    pause() {
      paused = true;
      flush();
    },
    resume() {
      paused = false;
      buffer = [];
      preRoll = [];
      speechMs = 0;
      silenceMs = 0;
    },
    setThreshold(value: number) {
      speechThreshold = value;
    },
  };
}
