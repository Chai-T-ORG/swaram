/**
 * Server-side speech-to-text — proxy for everyday clips, ensemble for the
 * clips that decide whether the form is right: names and spelled letters.
 *
 * Everyday path (one engine, selected via `x-stt-provider`):
 *   Sarvam Saaras v3 (only if SARVAM_API_KEY set) — best for Indian languages
 *   Azure Speech (only if AZURE_SPEECH_KEY set)   — regional locales, premium
 *   Groq Whisper (large-v3-turbo)                 — the default
 *   Indic-language clips are auto-promoted to Sarvam.
 *
 * Accuracy path (`x-stt-hint: name|spell`) — how the top voice stacks do it
 * (OpenAI out-of-band Realtime transcription, Deepgram keyterms, AssemblyAI
 * keyterms_prompt), adapted to our engines: every configured recognizer
 * transcribes the SAME clip in parallel. Our own measurements show they fail
 * on different parts of a name (Saaras heard "Twinsha…Tilkan", Whisper
 * "…Tilkan Bhattu", each right where the other was wrong), so:
 *   - all hypotheses agree  -> done ("consensus", no LLM call)
 *   - they disagree         -> an LLM reconstructs the intended text from the
 *     hypotheses, the field label, and the user's already-confirmed names
 *     ("fusion" — generative error correction, the documented way to beat any
 *     single recognizer on proper nouns)
 * If GEMINI_API_KEY is set, a Gemini audio-native hypothesis joins the
 * ensemble — the exact mechanism OpenAI/Google voice agents use internally.
 *
 * Cost: the ensemble runs ONLY on hinted clips (a handful per form, a few
 * seconds each, per-second billing); consensus skips the LLM; everyday clips
 * stay single-engine.
 *
 *   GET  /api/transcribe -> { envKey, azure, sarvam, gemini }
 *   POST /api/transcribe -> body: raw audio; headers: x-language,
 *                           x-stt-provider?, x-stt-hint?, x-field-label?,
 *                           x-known-names?, x-groq-key?
 *                           -> { text, provider?, alternatives? } | { error }
 *
 * The audio transits this server and is never stored or logged here.
 */
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const GROQ_STT_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text";

/** Per-engine fetch timeout — a slow engine must not stall the ensemble. */
const ENGINE_TIMEOUT_MS = 6000;

export async function GET() {
  return Response.json({
    envKey: Boolean(process.env.GROQ_API_KEY),
    azure: Boolean(process.env.AZURE_SPEECH_KEY),
    sarvam: Boolean(process.env.SARVAM_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY),
  });
}

/* --------------------------- Sarvam Saaras v3 ----------------------------- */

/** Languages Saaras v3 supports (BCP-47). `fr-FR` etc. must not route here. */
const SARVAM_STT_LANGS = new Set([
  "hi-IN", "bn-IN", "kn-IN", "ml-IN", "mr-IN", "od-IN", "pa-IN", "ta-IN",
  "te-IN", "gu-IN", "en-IN", "as-IN", "ur-IN", "ne-IN", "kok-IN", "ks-IN",
  "sd-IN", "sa-IN", "sat-IN", "mni-IN", "brx-IN", "mai-IN", "doi-IN",
]);

function sarvamLocale(locale: string): string | null {
  if (SARVAM_STT_LANGS.has(locale)) return locale;
  // en-US / en-GB speakers still say Indian names; en-IN handles them.
  if (locale.startsWith("en")) return "en-IN";
  return null;
}

/** Sarvam REST caps clips at 30 s; 16 kHz mono 16-bit WAV ≈ 32 KB/s. */
const SARVAM_MAX_BYTES = 30 * 16000 * 2 + 4096;

/**
 * Transcribe one clip with Saaras v3. `verbatim` mode for spelled input (no
 * normalization, so "T W I N S H A" stays letters), `transcribe` otherwise.
 */
async function transcribeSarvam(audio: ArrayBuffer, locale: string, hint: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/wav" }), "audio.wav");
  form.append("model", "saaras:v3");
  form.append("mode", hint === "spell" ? "verbatim" : "transcribe");
  form.append("language_code", locale);
  const res = await fetch(SARVAM_STT_URL, {
    method: "POST",
    headers: { "api-subscription-key": process.env.SARVAM_API_KEY! },
    body: form,
    signal: AbortSignal.timeout(ENGINE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error("sarvam-" + res.status);
  const data = (await res.json()) as { transcript?: string };
  return (data.transcript || "").trim();
}

/* ----------------------------- Azure (premium) ---------------------------- */

/**
 * Transcribe one short 16 kHz mono PCM WAV clip via Azure's short-audio REST
 * endpoint. `detailed=true` asks for the N-best list — Azure's alternative
 * hypotheses are ensemble fuel, not just one guess.
 */
async function transcribeAzure(audio: ArrayBuffer, locale: string, detailed = false): Promise<string[]> {
  const key = process.env.AZURE_SPEECH_KEY!;
  const region = process.env.AZURE_SPEECH_REGION || "centralindia";
  const url =
    `https://${region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1` +
    `?language=${encodeURIComponent(locale)}&format=${detailed ? "detailed" : "simple"}&profanity=raw`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
      Accept: "application/json",
    },
    body: audio,
    signal: AbortSignal.timeout(ENGINE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error("azure-" + res.status);
  const data = (await res.json()) as {
    RecognitionStatus?: string;
    DisplayText?: string;
    NBest?: { Display?: string }[];
  };
  // NoMatch / InitialSilenceTimeout are "heard nothing", not errors.
  if (data.RecognitionStatus && data.RecognitionStatus !== "Success") return [];
  if (detailed && data.NBest?.length) {
    return data.NBest.slice(0, 2)
      .map((n) => (n.Display || "").trim())
      .filter(Boolean);
  }
  const text = (data.DisplayText || "").trim();
  return text ? [text] : [];
}

/* ------------------------------ Groq Whisper ------------------------------ */

function whisperPrompt(hint: string, label: string, names: string): string {
  if (hint === "spell") {
    return "The speaker is spelling a word letter by letter, like: T W I N S H A. Transcribe each letter separately as capital letters.";
  }
  if (hint === "name") {
    return (
      `The speaker is saying an Indian person's name or place name` +
      (label ? ` for the form field "${label}"` : " for a form") +
      `. Transcribe the name exactly as heard.` +
      (names ? ` Names that may occur: ${names}.` : "")
    );
  }
  return "Voice input for a form-filling assistant. The speaker says proper names, dates, phone numbers, email addresses, PIN codes, and short commands like yes, no, skip, repeat.";
}

async function transcribeGroq(
  audio: ArrayBuffer,
  contentType: string,
  locale: string,
  hint: string,
  label: string,
  names: string,
  key: string,
): Promise<string> {
  const model = process.env.GROQ_STT_MODEL || "whisper-large-v3-turbo";
  const language = locale.split("-")[0] || "en";
  // Groq infers the audio format from the filename extension, so map the
  // incoming content type (MediaRecorder emits webm/ogg/mp4; the VAD path
  // sends wav) to the right extension.
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
  form.append("prompt", whisperPrompt(hint, label, names));

  const res = await fetch(GROQ_STT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: form,
    signal: AbortSignal.timeout(ENGINE_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error("groq-" + res.status);
  const data = (await res.json()) as { text?: string };
  return (data.text || "").trim();
}

/* ------------------- Gemini audio-native pass (optional) ------------------ */

/**
 * A multimodal-LLM hypothesis — the model *listens* with the field context in
 * mind, which is how OpenAI's Realtime out-of-band transcription and Google's
 * voice agents get names right. Dormant until GEMINI_API_KEY is set.
 */
async function transcribeGemini(audio: ArrayBuffer, hint: string, label: string, names: string): Promise<string> {
  const key = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_STT_MODEL || "gemini-2.0-flash";
  const instruction =
    hint === "spell"
      ? "The audio is a person spelling one word letter by letter (possibly using words like 'bee' for B or 'D for Delhi'). Reply with ONLY the spelled letters, uppercase, separated by single spaces. Digits stay digits."
      : `Transcribe this short audio exactly. It is an Indian speaker answering the form field "${label || "a form field"}".` +
        (names ? ` Names that may occur: ${names}.` : "") +
        " Reply with ONLY the transcription.";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: instruction },
              { inline_data: { mime_type: "audio/wav", data: Buffer.from(audio).toString("base64") } },
            ],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 60 },
      }),
      signal: AbortSignal.timeout(ENGINE_TIMEOUT_MS),
    },
  );
  if (!res.ok) throw new Error("gemini-" + res.status);
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  return (data.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
}

/* ------------------------------ LLM fusion -------------------------------- */

/** Punctuation/case-insensitive form for agreement checks. */
function normalized(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
}

/**
 * Generative error correction: reconstruct the intended text from several
 * imperfect hypotheses. Runs only when the engines disagree.
 */
async function fuseHypotheses(
  hyps: string[],
  hint: string,
  label: string,
  names: string,
  groqKey: string,
): Promise<string | null> {
  const system =
    hint === "spell"
      ? `Several speech recognizers transcribed the SAME audio of one person spelling one word letter by letter. ` +
        `Letters may appear as words ("bee" = B, "double you" = W, "D for Delhi" = D). ` +
        `Reconstruct the spelled sequence. Reply with ONLY the letters, uppercase, separated by single spaces; digits stay digits. No commentary.`
      : `Several independent speech recognizers transcribed the SAME short audio: an Indian speaker answering the form field "${label || "unknown"}". ` +
        `Each recognizer makes different mistakes; the true answer is usually assembled from the pieces they agree on. ` +
        `Reply with ONLY the single most likely intended answer.\nRules:\n` +
        `- Never invent a word that appears in no hypothesis.\n` +
        `- Never change, add, or drop digits.\n` +
        `- Proper-case names and places.` +
        (names ? `\n- Names this user has already confirmed: ${names}. If a hypothesis is a close mishearing of one, return that name exactly.` : "");
  const user = hyps.map((h, i) => `Recognizer ${i + 1}: ${h}`).join("\n");

  const res = await fetch(GROQ_CHAT_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.GROQ_FUSION_MODEL || process.env.GROQ_LLM_MODEL || "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0,
      max_tokens: 60,
    }),
    signal: AbortSignal.timeout(ENGINE_TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const out = (data.choices?.[0]?.message?.content || "").trim().replace(/^["']+|["']+$/g, "");
  // A rambling reply means the model ignored the format — discard it.
  if (!out || out.length > Math.max(...hyps.map((h) => h.length)) * 2 + 24) return null;
  return out;
}

/* ------------------------------- Route glue ------------------------------- */

function header(req: NextRequest, name: string, cap: number): string {
  const raw = req.headers.get(name) || "";
  try {
    return decodeURIComponent(raw).slice(0, cap);
  } catch {
    return raw.slice(0, cap);
  }
}

export async function POST(req: NextRequest) {
  const provider = req.headers.get("x-stt-provider") || "";
  const audio = await req.arrayBuffer();
  // Skip clips too short to contain speech.
  if (!audio || audio.byteLength < 1500) {
    return Response.json({ text: "" });
  }

  const locale = req.headers.get("x-language") || "en-IN";
  const hint = req.headers.get("x-stt-hint") || "";
  const label = header(req, "x-field-label", 80);
  const names = header(req, "x-known-names", 240);
  const contentType = req.headers.get("content-type") || "audio/wav";
  const groqKey = process.env.GROQ_API_KEY || req.headers.get("x-groq-key") || "";
  const sarvamLang = sarvamLocale(locale);

  /* ---- Accuracy path: parallel ensemble for name / spell clips ---- */
  if (hint === "name" || hint === "spell") {
    const runs: { engine: string; p: Promise<string[]> }[] = [];
    if (process.env.SARVAM_API_KEY && sarvamLang && audio.byteLength <= SARVAM_MAX_BYTES) {
      runs.push({ engine: "sarvam", p: transcribeSarvam(audio, sarvamLang, hint).then((t) => (t ? [t] : [])) });
    }
    if (groqKey) {
      runs.push({ engine: "groq", p: transcribeGroq(audio, contentType, locale, hint, label, names, groqKey).then((t) => (t ? [t] : [])) });
    }
    if (process.env.AZURE_SPEECH_KEY) {
      runs.push({ engine: "azure", p: transcribeAzure(audio, locale, true) });
    }
    if (process.env.GEMINI_API_KEY) {
      runs.push({ engine: "gemini", p: transcribeGemini(audio, hint, label, names).then((t) => (t ? [t] : [])) });
    }

    if (runs.length > 0) {
      const settled = await Promise.allSettled(runs.map((r) => r.p));
      const hyps: string[] = [];
      const seen = new Set<string>();
      settled.forEach((s, i) => {
        if (s.status !== "fulfilled") {
          console.warn(`[transcribe] ${runs[i].engine} failed in ensemble:`, s.reason instanceof Error ? s.reason.message : s.reason);
          return;
        }
        for (const t of s.value) {
          const key = normalized(t);
          if (key && !seen.has(key)) {
            seen.add(key);
            hyps.push(t);
          }
        }
      });

      if (hyps.length === 0) return Response.json({ text: "", provider: "ensemble" });
      if (hyps.length === 1) return Response.json({ text: hyps[0], provider: "consensus" });

      // Engines disagree — let the LLM reconstruct from the pieces.
      if (groqKey) {
        const fused = await fuseHypotheses(hyps, hint, label, names, groqKey);
        if (fused) return Response.json({ text: fused, provider: "fusion", alternatives: hyps });
      }
      // No fusion available: prefer the engine best at this clip type.
      return Response.json({ text: hyps[0], provider: "ensemble", alternatives: hyps });
    }
    // No cloud engine configured at all — fall through to the error paths below.
  }

  /* ---- Everyday path: one engine ---- */

  // 1) Sarvam Saaras — explicitly selected, or promoted for Indic-language
  // speech. Per-second billing on short VAD-trimmed clips keeps this cheap.
  const wantsSarvam =
    Boolean(process.env.SARVAM_API_KEY) &&
    sarvamLang !== null &&
    audio.byteLength <= SARVAM_MAX_BYTES &&
    (provider === "sarvam" ||
      (!locale.startsWith("en") && provider !== "azure" && provider !== "azure-stream"));
  if (wantsSarvam) {
    try {
      const text = await transcribeSarvam(audio, sarvamLang!, hint);
      // Sarvam answered (possibly with silence) — don't bill a second engine.
      return Response.json({ text, provider: "sarvam" });
    } catch (err) {
      console.warn("[transcribe] sarvam failed, falling through:", err instanceof Error ? err.message : err);
    }
  }

  // 2) Azure when explicitly requested and a server key is configured.
  // "azure-stream" degrades to the same REST path when the streaming SDK path
  // fails on the client, so it maps here too.
  const wantsAzure = provider === "azure" || provider === "azure-stream";
  let azureError = "";
  if (wantsAzure && process.env.AZURE_SPEECH_KEY) {
    try {
      const [text] = await transcribeAzure(audio, locale);
      if (text) return Response.json({ text, provider: "azure" });
      // Empty result — fall through to Groq as a backstop if we have a key.
    } catch (err) {
      azureError = err instanceof Error ? err.message : String(err);
    }
  }

  // 3) Groq Whisper — the default, and the fallback for the premium paths.
  if (!groqKey) {
    // Azure was tried but there's no Groq backstop: surface its outcome so the
    // client can drop to an on-device engine, without a misleading "no-key".
    if (wantsAzure && process.env.AZURE_SPEECH_KEY) {
      return azureError
        ? Response.json({ error: "azure", detail: azureError }, { status: 502 })
        : Response.json({ text: "", provider: "azure" });
    }
    return Response.json({ error: "no-key" }, { status: 400 });
  }

  try {
    const text = await transcribeGroq(audio, contentType, locale, hint, label, names, groqKey);
    return Response.json({ text });
  } catch (err) {
    return Response.json(
      { error: "network", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
