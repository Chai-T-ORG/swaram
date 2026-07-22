"use client";

/**
 * Client helper for speaking names correctly in Indic languages.
 *
 * Indic scripts are phonetic — "Thilakan" written as തിലകൻ is pronounced
 * right, while the Latin spelling makes the TTS guess English sound rules.
 * So before the assistant reads a name back in Hindi/Malayalam, we convert
 * just the name span via /api/transliterate (Sarvam, server-cached) and keep
 * a client cache so each name costs at most one round-trip per session.
 *
 * Everything fails soft to the original text — pronunciation is an
 * enhancement, never a dependency.
 */

const TARGET_BY_LANG: Record<string, string> = { hi: "hi-IN", ml: "ml-IN" };

const cache = new Map<string, string>();
let available: boolean | null = null;

/** The Indic transliteration target for a UI language, or null. */
export function transliterationTarget(lang: string | undefined): string | null {
  return TARGET_BY_LANG[(lang || "").split("-")[0].toLowerCase()] ?? null;
}

async function probe(): Promise<boolean> {
  if (available !== null) return available;
  try {
    const res = await fetch("/api/transliterate");
    available = Boolean(((await res.json()) as { available?: boolean }).available);
  } catch {
    available = false;
  }
  return available;
}

/**
 * Transliterate a short Latin value (a name, a town) into the script of the
 * spoken language. Returns the original text when the language needs no
 * conversion, the value isn't a plain Latin string, or anything fails.
 */
export async function transliterateForSpeech(value: string, lang: string | undefined): Promise<string> {
  const target = transliterationTarget(lang);
  const text = value.trim();
  // Only plain Latin-letter values — digits, emails, and native-script text
  // pass through untouched.
  if (!target || !text || text.length > 80 || !/^[A-Za-z][A-Za-z .'-]*$/.test(text)) return value;

  const key = `${target}|${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  if (!(await probe())) return value;
  try {
    const res = await fetch("/api/transliterate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, target }),
    });
    if (!res.ok) return value;
    const data = (await res.json()) as { text?: string };
    const out = (data.text || "").trim() || value;
    cache.set(key, out);
    return out;
  } catch {
    return value;
  }
}
