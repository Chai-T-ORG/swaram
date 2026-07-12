/**
 * Cloud text-to-speech proxy — returns ready-to-play audio bytes.
 *
 * Why a server route: returning plain audio lets the client play it through a
 * normal <audio> element — the one path that works reliably on iOS Safari and
 * low-end phones, where WebGPU/on-device models and speechSynthesis fall down.
 *
 *   GET  /api/tts   -> { default, kokoroReady, providers }
 *   POST /api/tts   -> body: { text, lang?, voice? } -> audio/(wav|mpeg) | { error }
 *
 * Engine chain (first success wins, so one hiccup is never fatal):
 *   Azure Neural (only if AZURE_SPEECH_KEY set)        — all languages, premium
 *   Kokoro server-side (English only, when loaded)     — natural, free, all devices
 *   Google Translate TTS                               — all languages, free
 *
 * Multilingual: the app's lines are authored in English, so for a non-English
 * language we first translate the text (keyless Google endpoint, sl=auto — text
 * already in the target language passes through) and THEN synthesize, so the
 * voice actually speaks the language instead of reading English with an accent.
 *
 * Audio is synthesized at a neutral rate; the client sets playbackRate, so a
 * given line caches once regardless of the user's chosen speed.
 */
import type { NextRequest } from "next/server";
import { isKokoroReady, synthesizeKokoro, warmKokoro } from "@/lib/voice/kokoroServer";

export const runtime = "nodejs";

const OUTPUT_FORMAT = "audio-24khz-48kbitrate-mono-mp3";

// Start loading the Kokoro model as soon as the route module is first used.
warmKokoro();

/**
 * Language -> voice. `azure` is the neural voice name (used when a key is set);
 * `tl` is Google Translate's language code (also the translation target).
 */
const VOICES: Record<string, { azure: string; tl: string }> = {
  en: { azure: "en-IN-NeerjaNeural", tl: "en" },
  "en-in": { azure: "en-IN-NeerjaNeural", tl: "en" },
  "en-us": { azure: "en-US-AriaNeural", tl: "en" },
  "en-gb": { azure: "en-GB-SoniaNeural", tl: "en" },
  hi: { azure: "hi-IN-SwaraNeural", tl: "hi" },
  "hi-in": { azure: "hi-IN-SwaraNeural", tl: "hi" },
  ml: { azure: "ml-IN-SobhanaNeural", tl: "ml" },
  "ml-in": { azure: "ml-IN-SobhanaNeural", tl: "ml" },
  fr: { azure: "fr-FR-DeniseNeural", tl: "fr" },
  "fr-fr": { azure: "fr-FR-DeniseNeural", tl: "fr" },
};

function resolveVoice(lang: string): { azure: string; tl: string } {
  const key = (lang || "en-IN").toLowerCase();
  return VOICES[key] || VOICES[key.split("-")[0]] || VOICES.en;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/'/g, "&apos;")
    .replace(/"/g, "&quot;");
}

/* ------------------------- translation (multilingual) --------------------- */

const translateCache = new Map<string, string>();

/** Translate app text into the spoken language. English is a no-op. */
async function translateForSpeech(text: string, tl: string): Promise<string> {
  if (tl === "en" || !text.trim()) return text;
  const key = `${tl}|${text}`;
  const hit = translateCache.get(key);
  if (hit !== undefined) return hit;
  try {
    const url =
      `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto` +
      `&tl=${encodeURIComponent(tl)}&dt=t&q=${encodeURIComponent(text)}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return text;
    const data = (await res.json()) as [Array<[string, ...unknown[]]>, ...unknown[]];
    const translated = (data?.[0] ?? [])
      .map((seg) => (Array.isArray(seg) ? seg[0] : ""))
      .join("");
    const out = translated || text;
    translateCache.set(key, out);
    if (translateCache.size > 500) translateCache.delete(translateCache.keys().next().value as string);
    return out;
  } catch {
    return text;
  }
}

/* ----------------------- Google Translate (free) -------------------------- */

/** Google's endpoint caps at ~200 chars; split on word boundaries. */
function chunkForGoogle(text: string, max = 190): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean ? [clean] : [];
  const words = clean.split(" ");
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max && cur) {
      out.push(cur.trim());
      cur = w;
    } else {
      cur += " " + w;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

async function synthesizeGoogle(text: string, tl: string): Promise<Buffer> {
  const parts = chunkForGoogle(text);
  const buffers: Buffer[] = [];
  for (const part of parts) {
    const url =
      `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(tl)}` +
      `&client=tw-ob&q=${encodeURIComponent(part)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
        Referer: "https://translate.google.com/",
      },
    });
    if (!res.ok) throw new Error("google-" + res.status);
    buffers.push(Buffer.from(await res.arrayBuffer()));
  }
  if (buffers.length === 0) throw new Error("google-empty");
  return Buffer.concat(buffers);
}

/* --------------------------- Azure (premium, opt-in) ---------------------- */

async function synthesizeAzure(text: string, voice: string): Promise<Buffer> {
  const key = process.env.AZURE_SPEECH_KEY!;
  const region = process.env.AZURE_SPEECH_REGION || "centralindia";
  const lang = voice.split("-").slice(0, 2).join("-") || "en-IN";
  const ssml = `<speak version='1.0' xml:lang='${lang}'><voice name='${voice}'>${escapeXml(text)}</voice></speak>`;
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": OUTPUT_FORMAT,
      "User-Agent": "swaram",
    },
    body: ssml,
  });
  if (!res.ok) throw new Error("azure-" + res.status);
  return Buffer.from(await res.arrayBuffer());
}

/* ------------------------------- Route glue ------------------------------- */

interface CachedAudio {
  audio: Buffer;
  contentType: string;
  provider: string;
}

const CACHE_MAX = 250;
const ttsCache = new Map<string, CachedAudio>();
function cacheGet(k: string): CachedAudio | undefined {
  const v = ttsCache.get(k);
  if (v) {
    ttsCache.delete(k);
    ttsCache.set(k, v);
  }
  return v;
}
function cacheSet(k: string, v: CachedAudio): void {
  ttsCache.set(k, v);
  if (ttsCache.size > CACHE_MAX) ttsCache.delete(ttsCache.keys().next().value as string);
}

function audioResponse(audio: Buffer, provider: string, contentType: string): Response {
  return new Response(new Uint8Array(audio), {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(audio.length),
      "X-TTS-Provider": provider,
      "Cache-Control": "public, max-age=86400",
    },
  });
}

export async function GET() {
  return Response.json({
    default: process.env.AZURE_SPEECH_KEY ? "azure" : isKokoroReady() ? "kokoro" : "google",
    kokoroReady: isKokoroReady(),
    providers: [
      ...(process.env.AZURE_SPEECH_KEY ? ["azure"] : []),
      "kokoro",
      "google",
    ],
  });
}

export async function POST(req: NextRequest) {
  let body: { text?: string; lang?: string; voice?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad-json" }, { status: 400 });
  }

  const text = (body.text || "").slice(0, 2000).trim();
  if (!text) return new Response(null, { status: 204 });

  const lang = body.lang || "en-IN";
  const langVoice = resolveVoice(lang);
  const tl = langVoice.tl;

  const cacheKey = `${lang}|${text}`;
  const cached = cacheGet(cacheKey);
  if (cached) return audioResponse(cached.audio, "cache", cached.contentType);

  // Speak the language, not English-with-an-accent: translate first for non-EN.
  const speakText = await translateForSpeech(text, tl);

  const azureVoice = body.voice || langVoice.azure;
  let lastError = "";

  // 1) Azure (premium, all languages) when a key is configured.
  if (process.env.AZURE_SPEECH_KEY) {
    try {
      const audio = await synthesizeAzure(speakText, azureVoice);
      if (audio.length > 0) {
        const out = { audio, contentType: "audio/mpeg", provider: "azure" };
        cacheSet(cacheKey, out);
        return audioResponse(out.audio, out.provider, out.contentType);
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  // 2) Kokoro server-side — natural English voice, once the model is loaded.
  if (tl === "en" && isKokoroReady()) {
    try {
      const audio = await synthesizeKokoro(speakText);
      if (audio.length > 0) {
        const out = { audio, contentType: "audio/wav", provider: "kokoro" };
        cacheSet(cacheKey, out);
        return audioResponse(out.audio, out.provider, out.contentType);
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  // 3) Google Translate TTS — free, every language.
  try {
    const audio = await synthesizeGoogle(speakText, tl);
    if (audio.length > 0) {
      const out = { audio, contentType: "audio/mpeg", provider: "google" };
      cacheSet(cacheKey, out);
      return audioResponse(out.audio, out.provider, out.contentType);
    }
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
  }

  return Response.json({ error: "tts-failed", detail: lastError }, { status: 502 });
}
