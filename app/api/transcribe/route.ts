/**
 * Server-side proxy to Groq's Whisper transcription API.
 *
 * The API key lives on the server (GROQ_API_KEY env var) so it never ships in
 * the client bundle. For quick demos without an env var, the client may pass a
 * key it holds locally via the `x-groq-key` header — the env var always wins.
 *
 *   GET  /api/transcribe  -> { envKey: boolean }  (is a server key configured?)
 *   POST /api/transcribe  -> body: raw audio/wav; headers: x-language, x-groq-key?
 *                            -> { text } | { error, detail? }
 *
 * The audio transits this server to Groq and is never stored or logged here.
 */
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const GROQ_URL = "https://api.groq.com/openai/v1/audio/transcriptions";

export async function GET() {
  return Response.json({ envKey: Boolean(process.env.GROQ_API_KEY) });
}

export async function POST(req: NextRequest) {
  const key = process.env.GROQ_API_KEY || req.headers.get("x-groq-key") || "";
  if (!key) {
    return Response.json({ error: "no-key" }, { status: 400 });
  }

  const audio = await req.arrayBuffer();
  // Skip clips too short to contain speech.
  if (!audio || audio.byteLength < 1500) {
    return Response.json({ text: "" });
  }

  const model = process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo";
  const language = req.headers.get("x-language")?.split("-")[0] || "en";

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
