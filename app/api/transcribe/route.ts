/**
 * Server-side proxy for speech-to-text.
 *
 * Two engines, selected per-request via the `x-stt-provider` header:
 *   Azure Speech (only if AZURE_SPEECH_KEY set)  — regional locales, premium
 *   Groq Whisper (large-v3-turbo)                — the default, most accurate
 *
 * The keys live on the server so they never ship in the client bundle. For
 * quick demos without a Groq env var, the client may pass a key it holds
 * locally via the `x-groq-key` header — the env var always wins. Azure has no
 * client-key path; it needs a server key + region.
 *
 * When Azure is requested but fails or hears nothing, we fall through to Groq
 * (when configured) so one hiccup is never fatal — mirroring the TTS proxy.
 *
 *   GET  /api/transcribe  -> { envKey: boolean, azure: boolean }
 *   POST /api/transcribe  -> body: raw audio; headers: x-language,
 *                            x-stt-provider?, x-groq-key?
 *                            -> { text, provider? } | { error, detail? }
 *
 * The audio transits this server and is never stored or logged here.
 */
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

export async function GET() {
  return Response.json({
    envKey: Boolean(process.env.GROQ_API_KEY),
    azure: Boolean(process.env.AZURE_SPEECH_KEY),
  });
}

/* ----------------------------- Azure (premium) ---------------------------- */

/**
 * Transcribe one short WAV clip via Azure's short-audio REST endpoint. The
 * client sends 16 kHz mono PCM WAV (the only format this endpoint accepts).
 * `locale` is the full BCP-47 tag (e.g. hi-IN) — Azure needs the region, unlike
 * Whisper which takes only the base language.
 */
async function transcribeAzure(audio: ArrayBuffer, locale: string): Promise<string> {
  const key = process.env.AZURE_SPEECH_KEY!;
  const region = process.env.AZURE_SPEECH_REGION || "centralindia";
  const url =
    `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
    `?language=${encodeURIComponent(locale)}&format=simple&profanity=raw`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
      Accept: "application/json",
    },
    body: audio,
  });
  if (!res.ok) throw new Error("azure-" + res.status);
  const data = (await res.json()) as { RecognitionStatus?: string; DisplayText?: string };
  // NoMatch / InitialSilenceTimeout are "heard nothing", not errors.
  if (data.RecognitionStatus && data.RecognitionStatus !== "Success") return "";
  return (data.DisplayText || "").trim();
}

/* ------------------------------- Route glue ------------------------------- */

export async function POST(req: NextRequest) {
  const provider = req.headers.get("x-stt-provider") || "";
  const audio = await req.arrayBuffer();
  // Skip clips too short to contain speech.
  if (!audio || audio.byteLength < 1500) {
    return Response.json({ text: "" });
  }

  const locale = req.headers.get("x-language") || "en-IN";

  // 1) Azure when explicitly requested and a server key is configured.
  let azureError = "";
  if (provider === "azure" && process.env.AZURE_SPEECH_KEY) {
    try {
      const text = await transcribeAzure(audio, locale);
      if (text) return Response.json({ text, provider: "azure" });
      // Empty result — fall through to Groq as a backstop if we have a key.
    } catch (err) {
      azureError = err instanceof Error ? err.message : String(err);
    }
  }

  // 2) Groq Whisper — the default, and the fallback for the Azure path.
  const key = process.env.GROQ_API_KEY || req.headers.get("x-groq-key") || "";
  if (!key) {
    // Azure was tried but there's no Groq backstop: surface its outcome so the
    // client can drop to an on-device engine, without a misleading "no-key".
    if (provider === "azure" && process.env.AZURE_SPEECH_KEY) {
      return azureError
        ? Response.json({ error: "azure", detail: azureError }, { status: 502 })
        : Response.json({ text: "", provider: "azure" });
    }
    return Response.json({ error: "no-key" }, { status: 400 });
  }

  const model = process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo";
  const language = locale.split("-")[0] || "en";

  // Groq infers the audio format from the filename extension, so map the
  // incoming content type (MediaRecorder emits webm/ogg/mp4; the VAD path
  // sends wav) to the right extension.
  const contentType = req.headers.get("content-type") || "audio/wav";
  const ext = contentType.includes("webm")
    ? "webm"
    : contentType.includes("ogg")
      ? "ogg"
      : contentType.includes("mp4") || contentType.includes("m4a") || contentType.includes("aac")
        ? "m4a"
        : contentType.includes("mpeg") || contentType.includes("mp3")
          ? "mp3"
          : "wav";

  const form = new FormData();
  form.append("file", new Blob([audio], { type: contentType }), `audio.${ext}`);
  form.append("model", model);
  form.append("language", language);
  form.append("response_format", "json");
  form.append("temperature", "0");
  // A light domain hint biases Whisper toward what people actually say while
  // filling a form (proper names, dates, numbers) instead of common phrases.
  form.append(
    "prompt",
    "Voice input for a form-filling assistant. The speaker says proper names, dates, phone numbers, email addresses, PIN codes, and short commands like yes, no, skip, repeat.",
  );

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return Response.json({ error: "groq", detail: detail.slice(0, 500) }, { status: 502 });
    }
    const data = (await res.json()) as { text?: string };
    return Response.json({ text: (data.text || "").trim() });
  } catch (err) {
    return Response.json(
      { error: "network", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
