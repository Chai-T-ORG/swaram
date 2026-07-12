/**
 * wavEncode.ts — encode PCM to 16 kHz mono 16-bit WAV.
 *
 * Azure's short-audio Speech-to-Text REST API only accepts 8/16 kHz mono PCM
 * WAV, so the Azure STT path resamples to 16 kHz here before upload. (Groq and
 * on-device Whisper resample server-/worker-side, so they keep the native rate
 * the VAD capture emits.)
 */

const TARGET_RATE = 16000;

/** Linear-resample mono Float32 PCM to 16 kHz. No-op when already at 16 kHz. */
function resampleTo16k(input: Float32Array, srcRate: number): Float32Array {
  if (srcRate === TARGET_RATE || input.length === 0) return input;
  const ratio = srcRate / TARGET_RATE;
  const outLen = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = input[i0] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/** Encode mono Float32 PCM (any sample rate) as a 16 kHz 16-bit WAV blob. */
export function encodeWav16k(samples: Float32Array, srcRate: number): Blob {
  const pcm = resampleTo16k(samples, srcRate);
  const buffer = new ArrayBuffer(44 + pcm.length * 2);
  const view = new DataView(buffer);
  const writeStr = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + pcm.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, TARGET_RATE, true);
  view.setUint32(28, TARGET_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, pcm.length * 2, true);
  let o = 44;
  for (let i = 0; i < pcm.length; i++) {
    const s = Math.max(-1, Math.min(1, pcm[i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    o += 2;
  }
  return new Blob([view], { type: "audio/wav" });
}

/**
 * Decode a recorded audio blob (webm/mp4/ogg from MediaRecorder) to a 16 kHz
 * mono WAV blob via the browser's own decoder. Returns null if decoding fails.
 */
export async function blobToWav16k(blob: Blob): Promise<Blob | null> {
  if (typeof window === "undefined") return null;
  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  const ctx = new AudioCtx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const channels = decoded.numberOfChannels;
    const length = decoded.length;
    const mono = new Float32Array(length);
    for (let c = 0; c < channels; c++) {
      const data = decoded.getChannelData(c);
      for (let i = 0; i < length; i++) mono[i] += data[i] / channels;
    }
    return encodeWav16k(mono, decoded.sampleRate);
  } catch {
    return null;
  } finally {
    if (ctx.state !== "closed") ctx.close().catch(() => {});
  }
}
