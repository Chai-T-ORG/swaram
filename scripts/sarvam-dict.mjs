/**
 * Register a Sarvam Bulbul v3 pronunciation dictionary so the en-IN voice
 * says Indian names the Indian way (dossier W15; research report §8.1).
 *
 * For each name, the Devanagari phonetic form is machine-generated via
 * Sarvam's transliteration API (Indic scripts are phonetic, so the native
 * rendering IS the pronunciation spec), then the whole map is uploaded as a
 * pronunciation dictionary. Limits: 10 dictionaries/account, 100 words each.
 *
 * Usage:
 *   node scripts/sarvam-dict.mjs "Twinsha" "Thilakan" ...   # names as args
 *   node scripts/sarvam-dict.mjs --file names.json          # ["name", ...]
 *   node scripts/sarvam-dict.mjs                            # built-in seed
 *
 * Prints the dictionary_id and appends SARVAM_TTS_DICT_ID to .env.local
 * (unless already present). Re-running creates a NEW dictionary — delete old
 * ones from the Sarvam dashboard if you approach the 10-dictionary limit.
 */
import { readFileSync, appendFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envPath = resolve(root, ".env.local");

function envKey(name) {
  try {
    const line = readFileSync(envPath, "utf8").split("\n").find((l) => l.startsWith(name + "="));
    return line ? line.slice(name.length + 1).trim() : "";
  } catch {
    return "";
  }
}

const API_KEY = process.env.SARVAM_API_KEY || envKey("SARVAM_API_KEY");
if (!API_KEY) {
  console.error("SARVAM_API_KEY not found (env or .env.local)");
  process.exit(1);
}

const SEED = ["Twinsha", "Thilakan", "Tejas", "Swaram"];

function namesFromArgs() {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf("--file");
  if (fileIdx !== -1 && args[fileIdx + 1]) {
    return JSON.parse(readFileSync(resolve(args[fileIdx + 1]), "utf8"));
  }
  return args.length > 0 ? args : SEED;
}

async function transliterate(name) {
  const res = await fetch("https://api.sarvam.ai/transliterate", {
    method: "POST",
    headers: { "api-subscription-key": API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ input: name, source_language_code: "en-IN", target_language_code: "hi-IN" }),
  });
  if (!res.ok) throw new Error(`transliterate ${name}: ${res.status} ${await res.text()}`);
  return ((await res.json()).transliterated_text || "").trim();
}

const names = [...new Set(namesFromArgs().map((n) => String(n).trim()).filter(Boolean))].slice(0, 100);
console.log(`Building pronunciation map for ${names.length} name(s)…`);

const pronunciations = { "en-IN": {} };
for (const name of names) {
  const native = await transliterate(name);
  if (!native) {
    console.warn(`  ${name}: transliteration empty — skipped`);
    continue;
  }
  pronunciations["en-IN"][name] = native;
  console.log(`  ${name} -> ${native}`);
}

if (Object.keys(pronunciations["en-IN"]).length === 0) {
  console.error("No pronunciations generated — aborting.");
  process.exit(1);
}

const payload = JSON.stringify({ pronunciations }, null, 2);
const form = new FormData();
form.append("file", new Blob([payload], { type: "application/json" }), "swaram-names.json");

const res = await fetch("https://api.sarvam.ai/text-to-speech/pronunciation-dictionary", {
  method: "POST",
  headers: { "api-subscription-key": API_KEY },
  body: form,
});
const bodyText = await res.text();
if (!res.ok) {
  console.error(`Dictionary upload failed: ${res.status} ${bodyText}`);
  process.exit(1);
}
const dictId = JSON.parse(bodyText).dictionary_id;
console.log(`\nDictionary registered: ${dictId}`);

if (!envKey("SARVAM_TTS_DICT_ID")) {
  appendFileSync(envPath, `\n# Bulbul v3 pronunciation dictionary (scripts/sarvam-dict.mjs)\nSARVAM_TTS_DICT_ID=${dictId}\n`);
  console.log(`Appended SARVAM_TTS_DICT_ID to .env.local — restart the dev server to activate.`);
} else {
  console.log(`SARVAM_TTS_DICT_ID already set in .env.local — update it manually to ${dictId} if you want the new dictionary.`);
}
