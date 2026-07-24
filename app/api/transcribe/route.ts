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
import { nameClose } from "@/lib/voice/nameMatch";

export const runtime = "nodejs";

const GROQ_STT_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";
const SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text";

/** Per-engine fetch timeout — a slow engine must not stall the ensemble. */
const ENGINE_TIMEOUT_MS = 6000;

/**
 * Everyday-path hedge: Sarvam is normally fast (<1 s) but has a measured
 * ~5 s cold path. If it hasn't answered by this deadline, Whisper starts in
 * parallel and the first success wins — tail latency capped, accuracy kept.
 */
const SARVAM_HEDGE_MS = 2500;

/** Ensemble budget: after this, fuse whatever hypotheses have arrived. A
 * straggler engine loses its vote rather than making the user wait. */
const ENSEMBLE_BUDGET_MS = 3500;

const delay = (ms: number) => new Promise<undefined>((r) => setTimeout(() => r(undefined), ms));

/**
 * Languages where Whisper-family models enter hallucination loops instead of
 * transcribing (Voice of India benchmark, arXiv:2604.19151: Malayalam ~168%
 * WER, Gujarati ~296%). Whisper is excised from BOTH the ensemble and the
 * everyday fallback chain for these — a wrong-looking transcript is
 * recoverable, a fluent hallucination is not.
 */
const WHISPER_UNSAFE_LANGS = new Set(["ml-IN", "gu-IN"]);

/* --------------------------- circuit breakers ----------------------------- */

/**
 * Per-vendor circuit breaker. Without this, a vendor outage makes every
 * user interaction wait out the full timeout before falling back. Five
 * consecutive failures trip the breaker for five minutes; one "half-open"
 * probe is allowed through when the cooldown expires.
 */
const BREAKER_TRIP_AFTER = 5;
const BREAKER_COOLDOWN_MS = 5 * 60 * 1000;

interface Breaker {
  failures: number;
  trippedUntil: number;
  probing: boolean;
}
const breakers = new Map<string, Breaker>();

function breaker(name: string): Breaker {
  let b = breakers.get(name);
  if (!b) {
    b = { failures: 0, trippedUntil: 0, probing: false };
    breakers.set(name, b);
  }
  return b;
}

/** May we call this vendor right now? Claims the half-open probe slot. */
function breakerAllows(name: string): boolean {
  const b = breaker(name);
  if (Date.now() >= b.trippedUntil) {
    if (b.failures >= BREAKER_TRIP_AFTER) {
      if (b.probing) return false; // someone else is already probing
      b.probing = true; // this request is the half-open probe
    }
    return true;
  }
  return false;
}

function breakerRecord(name: string, ok: boolean): void {
  const b = breaker(name);
  b.probing = false;
  if (ok) {
    b.failures = 0;
    b.trippedUntil = 0;
  } else {
    b.failures += 1;
    if (b.failures >= BREAKER_TRIP_AFTER) {
      b.trippedUntil = Date.now() + BREAKER_COOLDOWN_MS;
      console.warn(`[transcribe] circuit breaker TRIPPED for ${name} (${b.failures} consecutive failures)`);
    }
  }
}

/* ------------------------- hallucination scrub ---------------------------- */

/**
 * Whisper-style hallucinations on noisy/short clips are fluent loops
 * ("Thank you. Thank you. Thank you.") or a single phoneme repeated. The
 * Groq API exposes no no_speech_prob/compression metrics, so detect the
 * loop shape itself. Deliberately conservative — real answers repeat words
 * ("double five five") but not whole multi-word phrases 3+ times.
 */
function looksHallucinated(text: string): boolean {
  const t = text.trim();
  if (t.length < 12) return false;
  const words = t.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").split(/\s+/).filter(Boolean);
  if (words.length >= 6) {
    // Phrase looping: the same 2-4 word phrase repeated to fill the clip.
    for (const n of [2, 3, 4]) {
      if (words.length >= n * 3) {
        const first = words.slice(0, n).join(" ");
        let repeats = 1;
        for (let i = n; i + n <= words.length; i += n) {
          if (words.slice(i, i + n).join(" ") === first) repeats += 1;
          else break;
        }
        if (repeats >= 3 && repeats * n >= words.length * 0.8) return true;
      }
    }
    // Vocabulary collapse: many words, almost no distinct ones.
    const distinct = new Set(words);
    if (words.length >= 8 && distinct.size <= 2) return true;
  }
  return false;
}

export async function GET() {
  return Response.json({
    envKey: Boolean(process.env.GROQ_API_KEY),
    azure: Boolean(process.env.AZURE_SPEECH_KEY),
    sarvam: Boolean(process.env.SARVAM_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    // Optional Sarvam WebSocket relay (scripts/sarvam-ws-relay.mjs) for the
    // opt-in "sarvam-stream" provider; null means clip-based capture only.
    streamUrl: process.env.SARVAM_STREAM_RELAY_URL || null,
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
 * normalization, so "T W I N S H A" stays letters); `codemix` for Hindi,
 * where Hinglish is the norm — it keeps English loanwords in Latin script
 * instead of force-transliterating them ("मेरा phone number है 98…");
 * `transcribe` otherwise.
 */
function sarvamMode(locale: string, hint: string): string {
  if (hint === "spell") return "verbatim";
  if (process.env.SARVAM_STT_MODE) return process.env.SARVAM_STT_MODE;
  if (locale === "hi-IN") return "codemix";
  return "transcribe";
}

async function transcribeSarvam(audio: ArrayBuffer, locale: string, hint: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([audio], { type: "audio/wav" }), "audio.wav");
  form.append("model", "saaras:v3");
  form.append("mode", sarvamMode(locale, hint));
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
    NBest?: { Display?: string; Lexical?: string }[];
  };
  // NoMatch / InitialSilenceTimeout are "heard nothing", not errors.
  if (data.RecognitionStatus && data.RecognitionStatus !== "Success") return [];
  if (detailed && data.NBest?.length) {
    // Lexical FIRST: it is the raw, ITN-free transcription — measured as the
    // most faithful hypothesis for names/initials ("tejas k m"), where
    // Display's inverse-text-normalization guesses ("Tejas, KM.").
    const top = data.NBest[0];
    return [top.Lexical || "", top.Display || "", data.NBest[1]?.Display || ""]
      .map((t) => t.trim())
      .filter(Boolean)
      .slice(0, 3);
  }
  const text = (data.DisplayText || "").trim();
  return text ? [text] : [];
}

/* ------------------------------ Groq Whisper ------------------------------ */

function whisperPrompt(hint: string, label: string, names: string): string {
  if (hint === "spell") {
    return (
      "The speaker is spelling a word letter by letter, like: T W I N S H A. Transcribe each letter separately as capital letters. " +
      'If the speaker says the word "space" between letters, transcribe it as the word: space — it separates words and must not be dropped.'
    );
  }
  if (hint === "name") {
    // Measured: without the initials/no-substitution rules, Whisper's language
    // model overrides the audio ("Tejas K M" -> "They just gay in.").
    return (
      `Indian name dictation` +
      (label ? ` for the form field "${label}"` : " for a form") +
      `. The name may be rare, and may contain single-letter initials spoken as separate letters (like "Tejas K M"). ` +
      `Write initials as separate capital letters. Do NOT expand initials into words. ` +
      `Do NOT substitute a more common name. Transcribe only the sounds heard.` +
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
  // Flash-Lite is tuned for exactly this: short-clip ASR at $0.50/1M audio
  // tokens (~$0.0008/min) — the audio-native "listener with context" arm.
  const model = process.env.GEMINI_STT_MODEL || "gemini-3.1-flash-lite";
  const instruction =
    hint === "spell"
      ? "The audio is a person spelling letter by letter (possibly using words like 'bee' for B or 'D for Delhi'). Reply with ONLY the spelled letters, uppercase, separated by single spaces. Digits stay digits. If the speaker says the word 'space' between letter groups, output the word space there — it marks a word boundary."
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
 * "My name is Tejas K M" -> "Tejas K M" — the form wants the answer alone.
 *
 * The carrier is stripped whether or not a name follows it (\s* , and the
 * bare "my name" / "myself" forms), so a clip where the actual name was
 * inaudible ("my name is …") collapses to "" — a failed capture the caller
 * re-prompts for — instead of committing the literal words "My name" as the
 * answer (the "said their name, got 'My name'" bug). Longer carriers are
 * listed first so the alternation prefers them.
 */
function stripCarrier(t: string): string {
  return t
    .replace(/^\s*(?:my name is|the name is|my name's|my name|name is|myself|i'?m called|call me|it'?s|this is|i am|i'?m)\b\s*/i, "")
    .trim();
}

/** Of two normalized-equal hypotheses, keep the properly-cased one. */
function betterCased(a: string, b: string): string {
  const caps = (s: string) => (s.match(/\p{Lu}/gu) || []).length;
  return caps(b) > caps(a) ? b : a;
}

/**
 * Deterministic dictionary snap for consensus results: engines can AGREE on a
 * near-miss ("Twinsha T Thilkan"), which would short-circuit past the fusion
 * LLM that knows the user's confirmed names — so the snap runs here too. The
 * match predicate is the SHARED, per-word `nameClose` (lib/voice/nameMatch) —
 * the same one the client dictionary uses, so a different given name ("Maria")
 * can never snap to a stored one ("Gordan"), on either side.
 */
function snapToKnown(text: string, namesCsv: string): string {
  const heard = normalized(text.trim());
  if (!heard || !namesCsv) return text;
  for (const name of namesCsv.split(",").map((n) => n.trim()).filter(Boolean)) {
    if (nameClose(heard, normalized(name))) return name;
  }
  return text;
}

/* -------------- native-script name context for the fusion LLM ------------- */

/**
 * LLMs disambiguate Indic phonemes far better when a name is ALSO shown in
 * its phonetic native script ("Thilakan / തിലകൻ") than from Latin alone,
 * which discards aspiration/retroflex distinctions. Cached per server
 * lifetime; Hindi/Malayalam sessions only; always fails soft to Latin-only.
 */
const translitCache = new Map<string, string>();

async function nativeScriptNames(names: string, locale: string): Promise<string> {
  if (!process.env.SARVAM_API_KEY) return names;
  const target = locale === "hi-IN" ? "hi-IN" : locale === "ml-IN" ? "ml-IN" : null;
  if (!target || !names) return names;
  const list = names.split(",").map((n) => n.trim()).filter(Boolean).slice(0, 8);
  const out: string[] = [];
  for (const name of list) {
    const key = `${target}|${name}`;
    let native = translitCache.get(key);
    if (native === undefined) {
      try {
        const res = await fetch("https://api.sarvam.ai/transliterate", {
          method: "POST",
          headers: {
            "api-subscription-key": process.env.SARVAM_API_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ input: name, source_language_code: "en-IN", target_language_code: target }),
          signal: AbortSignal.timeout(2500),
        });
        native = res.ok ? ((await res.json()) as { transliterated_text?: string }).transliterated_text || "" : "";
      } catch {
        native = "";
      }
      translitCache.set(key, native);
      if (translitCache.size > 300) translitCache.delete(translitCache.keys().next().value as string);
    }
    out.push(native ? `${name} (${native})` : name);
  }
  return out.join(", ");
}

/**
 * Generative error correction (GER, per RobustGER / Whispering-LLaMA): the
 * LLM reconstructs the intended text from several imperfect hypotheses by
 * PHONETIC alignment, not string overlap — each recognizer heard the same
 * sounds and erred differently, so the truth lives in what the variants
 * sound like, not in which words they share. Runs only on disagreement.
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
      ? `Several speech recognizers transcribed the SAME audio of one person spelling letter by letter. ` +
        `Letters may appear as words ("bee" = B, "double you" = W, "D for Delhi" = D). ` +
        `Reconstruct the spelled sequence. Reply with ONLY the letters, uppercase, separated by single spaces; digits stay digits. ` +
        `If the speaker said the word "space" between letter groups, KEEP it — output the word space there (it separates words). No commentary.`
      : `Several independent speech recognizers transcribed the SAME short audio: an Indian speaker answering the form field "${label || "unknown"}". ` +
        `The hypotheses are noisy acoustic interpretations of ONE utterance. Align them by SOUND and reconstruct the utterance FAITHFULLY — ` +
        `a correct reconstruction may combine syllables from different hypotheses (e.g. "Twinsha Tilkan" + "Tvinsha T Thilakan" -> "Twinsha T Thilakan").\n` +
        `Reply with ONLY the reconstructed answer.\nRules:\n` +
        `- FAITHFULNESS OVER PLAUSIBILITY: the name may be rare or unusual. NEVER replace it with a different, more common name. ` +
        `Never introduce syllables that appear in no hypothesis.\n` +
        `- Single-letter initials stay single letters, separated by spaces ("Tejas K M"). NEVER expand initials into words ` +
        `("K M" must not become "Kumar") and never merge them ("KM").\n` +
        `- If a carrier phrase like "my name is" is present, return only the answer itself.\n` +
        `- Never change, add, or drop digits.\n` +
        `- Proper-case names and places.` +
        (names
          ? `\n- Names this user has already confirmed (Latin, with native script where known): ${names}. ` +
            `Return one of these EXACTLY (in Latin) only when a hypothesis is phonetically nearly identical to it; otherwise ignore this list completely.`
          : "");
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
    if (process.env.SARVAM_API_KEY && sarvamLang && audio.byteLength <= SARVAM_MAX_BYTES && breakerAllows("sarvam")) {
      runs.push({ engine: "sarvam", p: transcribeSarvam(audio, sarvamLang, hint).then((t) => (t ? [t] : [])) });
    }
    // Whisper hallucinates instead of failing on Dravidian/Gujarati speech —
    // it must not contribute hypotheses there (Voice of India benchmark).
    if (groqKey && !WHISPER_UNSAFE_LANGS.has(locale) && breakerAllows("groq")) {
      runs.push({ engine: "groq", p: transcribeGroq(audio, contentType, locale, hint, label, names, groqKey).then((t) => (t ? [t] : [])) });
    }
    if (process.env.AZURE_SPEECH_KEY && breakerAllows("azure")) {
      runs.push({ engine: "azure", p: transcribeAzure(audio, locale, true) });
    }
    if (process.env.GEMINI_API_KEY && breakerAllows("gemini")) {
      runs.push({ engine: "gemini", p: transcribeGemini(audio, hint, label, names).then((t) => (t ? [t] : [])) });
    }

    if (runs.length > 0) {
      // Collect hypotheses AS THEY ARRIVE. The moment two engines agree on
      // their top hypothesis we answer — the user shouldn't wait out a slow
      // straggler to hear a readback the fast engines already settled.
      const hyps: string[] = [];
      const seen = new Set<string>();
      const topByEngine = new Map<string, { norm: string; raw: string }>();
      let agreed: string | null = null;
      let settledCount = 0;
      let finishEarly: () => void = () => {};
      const allDone = new Promise<void>((resolve) => {
        finishEarly = resolve;
        runs.forEach((r) =>
          r.p
            .then(
              (texts) => {
                breakerRecord(r.engine, true);
                for (const t of texts) {
                  if (looksHallucinated(t)) {
                    console.warn(`[transcribe] ${r.engine} hypothesis dropped as hallucination loop`);
                    continue;
                  }
                  // Spell clips are Latin letters; Saaras verbatim sometimes
                  // answers in Indic script, which would poison the fusion.
                  if (hint === "spell" && /[^\x00-\x7F]/.test(t)) continue;
                  const key = normalized(t);
                  if (key && !seen.has(key)) {
                    seen.add(key);
                    hyps.push(t);
                  }
                }
                const top = normalized(texts[0] || "");
                if (top) {
                  topByEngine.set(r.engine, { norm: top, raw: texts[0] });
                  // For a name with NO dictionary backup, two engines agreeing
                  // on a near-miss ("Twinsh") must not short-circuit past
                  // fusion — a third engine may have heard the missing
                  // syllable. Require 3 votes there; 2 elsewhere (a wrong
                  // consensus with names present is healed by the snap).
                  const needed = hint === "name" && !names ? 3 : 2;
                  const matching = [...topByEngine.values()].filter((v) => v.norm === top);
                  if (matching.length >= needed) {
                    agreed = matching.map((m) => m.raw).reduce(betterCased);
                    finishEarly();
                  }
                }
              },
              (reason) => {
                breakerRecord(r.engine, false);
                console.warn(`[transcribe] ${r.engine} failed in ensemble:`, reason instanceof Error ? reason.message : reason);
              },
            )
            .finally(() => {
              settledCount += 1;
              if (settledCount === runs.length) finishEarly();
            }),
        );
      });
      await Promise.race([allDone, delay(ENSEMBLE_BUDGET_MS)]);

      // Name answers must come back as just the name — engines that keep the
      // carrier phrase ("my name is …") agree on it too, so strip it here —
      // and a near-miss of a confirmed name snaps to it deterministically.
      const finalize = (t: string) => (hint === "name" ? snapToKnown(stripCarrier(t), names) : t);
      if (agreed) return Response.json({ text: finalize(agreed), provider: "consensus", alternatives: hyps });
      if (hyps.length === 0) return Response.json({ text: "", provider: "ensemble" });
      if (hyps.length === 1) return Response.json({ text: finalize(hyps[0]), provider: "consensus" });

      // Engines disagree — GER: the LLM reconstructs the utterance from the
      // hypotheses, with the user's names shown in Latin + native script.
      if (groqKey) {
        const namesCtx = hint === "name" ? await nativeScriptNames(names, locale) : names;
        const fused = await fuseHypotheses(hyps, hint, label, namesCtx, groqKey);
        if (fused) return Response.json({ text: finalize(fused), provider: "fusion", alternatives: hyps });
      }
      // No fusion available: prefer the engine best at this clip type.
      return Response.json({ text: finalize(hyps[0]), provider: "ensemble", alternatives: hyps });
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
    // Saaras is Tier-I for Indian speech INCLUDING Indian English (Voice of
    // India benchmark; measured faithful on initials where Whisper guesses),
    // so every supported locale promotes to it unless Azure was chosen.
    // Groq stays the automatic fallback when Sarvam errors.
    provider !== "azure" &&
    provider !== "azure-stream";
  if (wantsSarvam && breakerAllows("sarvam")) {
    const sarvamP: Promise<{ text: string; provider: string } | null> = transcribeSarvam(audio, sarvamLang!, hint).then(
      (text) => {
        breakerRecord("sarvam", true);
        return { text, provider: "sarvam" };
      },
      (err) => {
        breakerRecord("sarvam", false);
        console.warn("[transcribe] sarvam failed:", err instanceof Error ? err.message : err);
        return null;
      },
    );
    // Fast path: Sarvam answers within the hedge window (the normal case) —
    // one engine billed, done.
    const early = await Promise.race([sarvamP, delay(SARVAM_HEDGE_MS)]);
    if (early) return Response.json(early);

    // Sarvam is slow or failed — hedge with Whisper and take the first
    // success. Whisper-unsafe locales skip the hedge (handled below).
    if (early === undefined && groqKey && !WHISPER_UNSAFE_LANGS.has(locale) && breakerAllows("groq")) {
      const groqP: Promise<{ text: string; provider: string } | null> = transcribeGroq(audio, contentType, locale, hint, label, names, groqKey).then(
        (text) => {
          breakerRecord("groq", true);
          return { text: looksHallucinated(text) ? "" : text, provider: "groq" };
        },
        (err) => {
          breakerRecord("groq", false);
          console.warn("[transcribe] groq hedge failed:", err instanceof Error ? err.message : err);
          return null;
        },
      );
      const never = new Promise<never>(() => {});
      const winner = await Promise.race([
        sarvamP.then((r) => r ?? never),
        groqP.then((r) => r ?? never),
        delay(ENGINE_TIMEOUT_MS + 1000).then(() => null),
      ]);
      if (winner) return Response.json(winner);
      return Response.json({ error: "network", detail: "all engines failed" }, { status: 502 });
    }
    // Sarvam failed outright — fall through to the ordinary chain below.
  }

  // Whisper-unsafe languages must NEVER drop to Groq Whisper — its failure
  // mode there is fluent hallucination, not an error. Azure is the only safe
  // cloud fallback; otherwise tell the client to use its on-device engine.
  if (WHISPER_UNSAFE_LANGS.has(locale)) {
    if (process.env.AZURE_SPEECH_KEY && breakerAllows("azure")) {
      try {
        const [text] = await transcribeAzure(audio, locale);
        breakerRecord("azure", true);
        return Response.json({ text: text ?? "", provider: "azure" });
      } catch (err) {
        breakerRecord("azure", false);
        console.warn("[transcribe] azure fallback failed for whisper-unsafe locale:", err instanceof Error ? err.message : err);
      }
    }
    return Response.json({ error: "no-safe-engine", detail: `no non-Whisper engine available for ${locale}` }, { status: 502 });
  }

  // 2) Azure when explicitly requested and a server key is configured.
  // "azure-stream" degrades to the same REST path when the streaming SDK path
  // fails on the client, so it maps here too.
  const wantsAzure = provider === "azure" || provider === "azure-stream";
  let azureError = "";
  if (wantsAzure && process.env.AZURE_SPEECH_KEY && breakerAllows("azure")) {
    try {
      const [text] = await transcribeAzure(audio, locale);
      breakerRecord("azure", true);
      if (text) return Response.json({ text, provider: "azure" });
      // Empty result — fall through to Groq as a backstop if we have a key.
    } catch (err) {
      breakerRecord("azure", false);
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

  if (!breakerAllows("groq")) {
    return Response.json({ error: "groq-tripped", detail: "groq circuit breaker open" }, { status: 502 });
  }
  try {
    const text = await transcribeGroq(audio, contentType, locale, hint, label, names, groqKey);
    breakerRecord("groq", true);
    // A fluent repetition loop is Whisper hallucinating over noise — return
    // silence so the app re-asks instead of confirming garbage.
    if (looksHallucinated(text)) {
      console.warn("[transcribe] groq transcript dropped as hallucination loop");
      return Response.json({ text: "" });
    }
    return Response.json({ text });
  } catch (err) {
    breakerRecord("groq", false);
    return Response.json(
      { error: "network", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
