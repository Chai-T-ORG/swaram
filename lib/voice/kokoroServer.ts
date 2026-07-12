/**
 * Server-side Kokoro neural TTS.
 *
 * Runs the Kokoro-82M ONNX model in Node (onnxruntime-node, CPU) so the natural
 * voice is available on EVERY device — the phone just plays the audio we return,
 * with no WebGPU/WASM needed client-side (the reason on-device Kokoro failed on
 * Safari and low-end phones). This model bundles English voices only; the route
 * uses Google for other languages.
 *
 * The model (~80MB) downloads once on first load and is cached by
 * @huggingface/transformers. Loading is kicked off eagerly and never blocks a
 * request — until it's ready, callers fall back to another engine. Generations
 * are serialized, since one ONNX session isn't meant for concurrent runs.
 */
type KokoroAudio = { toWav: () => ArrayBuffer };
type KokoroModel = { generate: (text: string, opts: { voice: string }) => Promise<KokoroAudio> };

const VOICE = "af_heart"; // warm, clear female — the default

let model: KokoroModel | null = null;
let loadFailed = false;
let loadPromise: Promise<void> | null = null;
let chain: Promise<unknown> = Promise.resolve();

async function load(): Promise<void> {
  try {
    const mod = (await import("kokoro-js")) as unknown as {
      KokoroTTS: { from_pretrained: (id: string, opts: object) => Promise<KokoroModel> };
    };
    model = await mod.KokoroTTS.from_pretrained("onnx-community/Kokoro-82M-v1.0-ONNX", {
      dtype: "q8",
      device: "cpu",
    });
    console.log("[kokoro-server] model ready");
  } catch (err) {
    loadFailed = true;
    console.warn(
      "[kokoro-server] load failed — using fallback voice:",
      err instanceof Error ? err.message : err,
    );
  }
}

/** Begin loading the model (idempotent). Safe to call on import. */
export function warmKokoro(): void {
  // Opt-out for tiny/serverless hosts that can't spare ~300MB for the model —
  // TTS then uses Google everywhere with no attempt to load Kokoro.
  if (process.env.KOKORO_TTS === "off") {
    loadFailed = true;
    return;
  }
  if (!loadPromise && !loadFailed) loadPromise = load();
}

/** True once the model is loaded and can synthesize immediately. */
export function isKokoroReady(): boolean {
  return model !== null;
}

/** Synthesize English text to a WAV buffer. Throws if not ready. */
export function synthesizeKokoro(text: string): Promise<Buffer> {
  if (!model) return Promise.reject(new Error("kokoro-not-ready"));
  const run = chain.then(async () => {
    try {
      const audio = await model!.generate(text, { voice: VOICE });
      return Buffer.from(audio.toWav());
    } catch (e) {
      console.warn("[kokoro-server] generate failed:", e instanceof Error ? e.stack || e.message : e);
      throw e;
    }
  });
  chain = run.catch(() => {});
  return run as Promise<Buffer>;
}

// Start warming as soon as the server imports this module.
warmKokoro();
