/**
 * Server-side proxy for Sarvam's transliteration API — converts a short Latin
 * string (a person's name, a town) into the phonetic Indic script of the
 * spoken language, so the TTS voice pronounces it the Indian way instead of
 * guessing English letter-to-sound rules.
 *
 *   GET  /api/transliterate -> { available: boolean }
 *   POST /api/transliterate -> { text, target } -> { text } | { error }
 *
 * Cost control (billed per character): only name-length strings are accepted,
 * and every result is LRU-cached — a given name is billed once per server
 * lifetime, and the client keeps its own cache on top.
 */
import type { NextRequest } from "next/server";

// Pure fetch proxy (Web APIs only) — runs at the edge for low cold-start +
// region-local latency. The in-memory LRU below is best-effort per isolate;
// the client keeps its own cache on top, and inputs are capped at 120 chars.
export const runtime = "edge";

/** Targets the app can speak that Sarvam can transliterate into. */
const TARGETS = new Set(["hi-IN", "ml-IN"]);

const MAX_CHARS = 120;

const CACHE_MAX = 500;
const cache = new Map<string, string>();

export async function GET() {
  return Response.json({ available: Boolean(process.env.SARVAM_API_KEY) });
}

export async function POST(req: NextRequest) {
  if (!process.env.SARVAM_API_KEY) return Response.json({ error: "no-key" }, { status: 400 });

  let body: { text?: string; target?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "bad-json" }, { status: 400 });
  }

  const text = (body.text || "").trim().slice(0, MAX_CHARS);
  const target = body.target || "";
  if (!text || !TARGETS.has(target)) return Response.json({ error: "bad-request" }, { status: 400 });

  const key = `${target}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return Response.json({ text: hit });

  try {
    const res = await fetch("https://api.sarvam.ai/transliterate", {
      method: "POST",
      headers: {
        "api-subscription-key": process.env.SARVAM_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: text,
        source_language_code: "en-IN",
        target_language_code: target,
      }),
    });
    if (!res.ok) return Response.json({ error: "sarvam-" + res.status }, { status: 502 });
    const data = (await res.json()) as { transliterated_text?: string };
    const out = (data.transliterated_text || "").trim();
    if (!out) return Response.json({ error: "empty" }, { status: 502 });
    cache.set(key, out);
    if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value as string);
    return Response.json({ text: out });
  } catch (err) {
    return Response.json(
      { error: "network", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
