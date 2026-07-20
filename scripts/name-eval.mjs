/**
 * name-eval.mjs — large-scale NAME FAITHFULNESS benchmark.
 *
 * Samples real Indian names from form-test/eval/indian-names.tsv (cleaned from
 * the Kaggle ananysharma/indian-names-dataset), speaks each with a neutral TTS
 * voice INDEPENDENT of the recognizers, runs it through the live name path of
 * /api/transcribe, and checks the pipeline returned the name EXACTLY.
 *
 * This dataset is used ONLY here (evaluation) — never in the recognition path:
 * it is North-Indian-skewed, carries title noise, and contains the token "km"
 * (a Kumari abbreviation) that would corrupt the initials handling if injected
 * into fusion. As a held-out test set, though, it proves the pipeline does not
 * "guess" plausible-but-wrong names at scale.
 *
 * Two conditions per name:
 *   cold  — no known-names context (first-ever encounter; pure recognition)
 *   warm  — the true name passed as x-known-names (models the confirm-once
 *           dictionary; should approach 100%)
 *
 * Usage:
 *   npm run dev                       (server must be running)
 *   node scripts/name-eval.mjs            # 40 names, both conditions
 *   node scripts/name-eval.mjs --n 100 --seed 7
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evalDir = resolve(root, "form-test/eval");
const cacheDir = resolve(evalDir, "name-audio");
const BASE = process.env.EVAL_BASE_URL || "http://localhost:3000";

function envKey(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(resolve(root, ".env.local"), "utf8").split("\n").find((l) => l.startsWith(name + "="));
    return line ? line.slice(name.length + 1).trim() : "";
  } catch { return ""; }
}

const arg = (flag, def) => {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
};
const N = Number(arg("--n", "40"));
let seed = Number(arg("--seed", "42"));
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);

function norm(s) {
  return s.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}]/gu, "");
}

/* --- sample names, balanced by gender, both a single and a two-part name --- */
const rows = readFileSync(resolve(evalDir, "indian-names.tsv"), "utf8").split("\n").filter(Boolean)
  .map((l) => { const [name, g] = l.split("\t"); return { name, g }; });
const twoPart = rows.filter((r) => r.name.includes(" "));
const onePart = rows.filter((r) => !r.name.includes(" "));
function sample(pool, k) {
  const out = [];
  const used = new Set();
  let guard = 0;
  while (out.length < k && guard++ < k * 50) {
    const r = pool[Math.floor(rnd() * pool.length)];
    if (!used.has(r.name)) { used.add(r.name); out.push(r); }
  }
  return out;
}
const picks = [...sample(twoPart, Math.ceil(N * 0.7)), ...sample(onePart, Math.floor(N * 0.3))];

/* --- neutral TTS (Azure male/female; independent of the ASR engines) --- */
async function synth(name, g) {
  const path = resolve(cacheDir, `${norm(name)}_${g}.wav`);
  if (existsSync(path)) return readFileSync(path);
  const key = envKey("AZURE_SPEECH_KEY");
  const region = envKey("AZURE_SPEECH_REGION") || "centralindia";
  const voice = g === "f" ? "en-IN-NeerjaNeural" : "en-IN-PrabhatNeural";
  const ssml = `<speak version='1.0' xml:lang='en-IN'><voice name='${voice}'>${name}</voice></speak>`;
  const r = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: { "Ocp-Apim-Subscription-Key": key, "Content-Type": "application/ssml+xml", "X-Microsoft-OutputFormat": "riff-16khz-16bit-mono-pcm", "User-Agent": "swaram-name-eval" },
    body: ssml,
  });
  if (!r.ok) throw new Error(`tts ${r.status}`);
  const wav = Buffer.from(await r.arrayBuffer());
  writeFileSync(path, wav);
  return wav;
}

async function transcribe(wav, knownNames) {
  const headers = { "Content-Type": "audio/wav", "x-language": "en-IN", "x-stt-hint": "name", "x-field-label": "Full Name" };
  if (knownNames) headers["x-known-names"] = encodeURIComponent(knownNames);
  const r = await fetch(`${BASE}/api/transcribe`, { method: "POST", headers, body: wav });
  return (await r.json()).text || "";
}

mkdirSync(cacheDir, { recursive: true });
const health = await fetch(`${BASE}/api/transcribe`).then((r) => r.json()).catch(() => null);
if (!health) { console.error(`Cannot reach ${BASE} — is the dev server running?`); process.exit(1); }
console.log(`Engines: sarvam=${health.sarvam} gemini=${health.gemini} azure=${health.azure}\nSampling ${picks.length} names…\n`);

let coldHit = 0, warmHit = 0, done = 0;
const misses = [];
for (const { name, g } of picks) {
  let wav;
  try { wav = await synth(name, g); } catch (e) { console.log(`  [skip] ${name}: ${e.message}`); continue; }
  const cold = await transcribe(wav, "");
  const warm = await transcribe(wav, name);
  const coldOk = norm(cold) === norm(name);
  const warmOk = norm(warm) === norm(name);
  if (coldOk) coldHit++; if (warmOk) warmHit++;
  done++;
  if (!coldOk) misses.push({ name, cold, warm, warmOk });
  console.log(`  ${coldOk ? "OK " : "XX "}${warmOk ? "OK " : "XX "} ${name.padEnd(24)} cold="${cold}"${coldOk ? "" : `  warm="${warm}"`}`);
}

console.log(`\nExact-match faithfulness over ${done} names:`);
console.log(`  cold (no context):     ${(100 * coldHit / done).toFixed(1)}%`);
console.log(`  warm (name known):     ${(100 * warmHit / done).toFixed(1)}%`);
console.log(`\nCold misses (${misses.length}) — did it GUESS a different name, or just misspell?`);
for (const m of misses.slice(0, 25)) {
  const guessed = norm(m.cold).length > 0 && !norm(m.cold).includes(norm(m.name).slice(0, 4));
  console.log(`  ${m.name.padEnd(24)} -> "${m.cold}" ${guessed ? "[substituted]" : "[near-miss]"}${m.warmOk ? "  (warm fixed it)" : ""}`);
}
writeFileSync(resolve(evalDir, "name-eval-report.json"), JSON.stringify({ at: new Date().toISOString(), n: done, coldHit, warmHit, misses }, null, 2));
