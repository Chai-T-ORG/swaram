/**
 * eval-harness.mjs — empirical baseline for the STT pipeline (dossier W13).
 *
 * Pushes a golden set of audio clips through the local /api/transcribe route
 * and scores the pipeline the way form-filling actually experiences it:
 *
 *  - Orthographically-informed WER: an output is scored against the BEST of
 *    the accepted spellings (Voice of India methodology) — "Tvinsha" vs
 *    "Twinsha" is a spelling variant, not a total miss, so each case may
 *    list altSpellings.
 *  - Entity accuracy: pass/fail on the exact string the form needs (the
 *    digits of a phone number, the normalized name) — the metric that
 *    actually decides whether the printed form is right.
 *
 * Audio: form-test/eval/audio/<id>.wav. Missing clips are synthesized once
 * via Azure Neural TTS (independent of the recognizers under test; Sarvam
 * TTS fallback) and cached on disk. Replace them with real recordings of
 * real speakers as they're collected — the manifest doesn't change.
 *
 * Usage:
 *   npm run dev            (in another terminal — the app must be running)
 *   npm run stt:eval               # run + print + write last-report.json
 *   node scripts/eval-harness.mjs --gate   # exit 1 if worse than baseline.json
 *   node scripts/eval-harness.mjs --save-baseline
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const evalDir = resolve(root, "form-test/eval");
const audioDir = resolve(evalDir, "audio");
const BASE = process.env.EVAL_BASE_URL || "http://localhost:3000";

function envKey(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(resolve(root, ".env.local"), "utf8").split("\n").find((l) => l.startsWith(name + "="));
    return line ? line.slice(name.length + 1).trim() : "";
  } catch {
    return "";
  }
}

/* ------------------------------ scoring --------------------------------- */

function norm(s) {
  return s.toLowerCase().normalize("NFC").replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function werWords(ref, hyp) {
  const r = norm(ref).split(" ").filter(Boolean);
  const h = norm(hyp).split(" ").filter(Boolean);
  if (r.length === 0) return h.length === 0 ? 0 : 1;
  let prev = Array.from({ length: h.length + 1 }, (_, i) => i);
  for (let i = 1; i <= r.length; i++) {
    const cur = [i];
    for (let j = 1; j <= h.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (r[i - 1] === h[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[h.length] / r.length;
}

/** Orthographic WER: best score across all accepted spellings. */
function orthoWer(testCase, hyp) {
  const refs = [testCase.text, ...(testCase.altSpellings || [])];
  return Math.min(...refs.map((r) => werWords(r, hyp)));
}

function entityPass(testCase, hyp) {
  if (!testCase.entity) return null;
  const h = norm(hyp).replace(/\s+/g, "");
  const e = norm(testCase.entity).replace(/\s+/g, "");
  return h.includes(e);
}

/* --------------------------- clip synthesis ------------------------------ */

async function synthAzure(text, lang) {
  const key = envKey("AZURE_SPEECH_KEY");
  if (!key) return null;
  const region = envKey("AZURE_SPEECH_REGION") || "centralindia";
  const voices = { "en-IN": "en-IN-PrabhatNeural", "hi-IN": "hi-IN-MadhurNeural", "ml-IN": "ml-IN-MidhunNeural" };
  const voice = voices[lang] || voices["en-IN"];
  const ssml = `<speak version='1.0' xml:lang='${lang}'><voice name='${voice}'>${text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")}</voice></speak>`;
  const res = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "riff-16khz-16bit-mono-pcm",
      "User-Agent": "swaram-eval",
    },
    body: ssml,
  });
  if (!res.ok) return null;
  return Buffer.from(await res.arrayBuffer());
}

async function synthSarvam(text, lang) {
  const key = envKey("SARVAM_API_KEY");
  if (!key) return null;
  const res = await fetch("https://api.sarvam.ai/text-to-speech", {
    method: "POST",
    headers: { "api-subscription-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({
      text, target_language_code: lang, speaker: "priya", model: "bulbul:v3",
      speech_sample_rate: 16000, output_audio_codec: "wav",
    }),
  });
  if (!res.ok) return null;
  const b64 = (await res.json()).audios?.[0];
  return b64 ? Buffer.from(b64, "base64") : null;
}

async function ensureClip(testCase) {
  const path = resolve(audioDir, `${testCase.id}.wav`);
  if (existsSync(path)) return path;
  const spoken = testCase.spoken || testCase.text;
  const wav = (await synthAzure(spoken, testCase.lang)) || (await synthSarvam(spoken, testCase.lang));
  if (!wav) throw new Error(`cannot synthesize clip for ${testCase.id} (no TTS key)`);
  writeFileSync(path, wav);
  console.log(`  [synth] ${testCase.id}.wav (${wav.length} bytes)`);
  return path;
}

/* -------------------------------- run ------------------------------------ */

const manifest = JSON.parse(readFileSync(resolve(evalDir, "manifest.json"), "utf8"));
mkdirSync(audioDir, { recursive: true });

const health = await fetch(`${BASE}/api/transcribe`).then((r) => r.json()).catch(() => null);
if (!health) {
  console.error(`Cannot reach ${BASE}/api/transcribe — is the dev server running?`);
  process.exit(1);
}
console.log(`Engines: groq=${health.envKey} azure=${health.azure} sarvam=${health.sarvam} gemini=${health.gemini}\n`);

const results = [];
for (const c of manifest.cases) {
  const clipPath = await ensureClip(c);
  const audio = readFileSync(clipPath);
  const headers = { "Content-Type": "audio/wav", "x-language": c.lang };
  if (c.hint) headers["x-stt-hint"] = c.hint;
  if (c.label) headers["x-field-label"] = encodeURIComponent(c.label);
  if (c.names) headers["x-known-names"] = encodeURIComponent(c.names.join(", "));

  const t0 = Date.now();
  let out = { text: "", provider: "error" };
  try {
    const res = await fetch(`${BASE}/api/transcribe`, { method: "POST", headers, body: audio });
    out = await res.json();
  } catch (e) {
    out = { text: "", provider: "error:" + e.message };
  }
  const ms = Date.now() - t0;
  const wer = orthoWer(c, out.text || "");
  const entity = entityPass(c, out.text || "");
  results.push({ id: c.id, lang: c.lang, hint: c.hint || "", expected: c.text, got: out.text || "", provider: out.provider || "groq", ms, wer, entity });
  const mark = entity === null ? "" : entity ? " ENTITY:PASS" : " ENTITY:FAIL";
  console.log(`  ${c.id.padEnd(22)} wer=${wer.toFixed(2)} ${String(ms).padStart(5)}ms [${(out.provider || "groq").padEnd(9)}]${mark}  "${out.text}"`);
}

const avgWer = results.reduce((s, r) => s + r.wer, 0) / results.length;
const entityCases = results.filter((r) => r.entity !== null);
const entityRate = entityCases.length ? entityCases.filter((r) => r.entity).length / entityCases.length : 1;
const avgMs = Math.round(results.reduce((s, r) => s + r.ms, 0) / results.length);

console.log(`\nOrthographic WER: ${(avgWer * 100).toFixed(1)}%   Entity accuracy: ${(entityRate * 100).toFixed(1)}% (${entityCases.length} cases)   Avg latency: ${avgMs}ms`);

const report = { at: new Date().toISOString(), avgWer, entityRate, avgMs, results };
writeFileSync(resolve(evalDir, "last-report.json"), JSON.stringify(report, null, 2));

if (process.argv.includes("--save-baseline")) {
  writeFileSync(resolve(evalDir, "baseline.json"), JSON.stringify(report, null, 2));
  console.log("Baseline saved.");
}
if (process.argv.includes("--gate")) {
  const basePath = resolve(evalDir, "baseline.json");
  if (existsSync(basePath)) {
    const baseline = JSON.parse(readFileSync(basePath, "utf8"));
    const werOk = avgWer <= baseline.avgWer + 0.02;
    const entOk = entityRate >= baseline.entityRate - 0.02;
    console.log(`Gate vs baseline (${baseline.at}): WER ${werOk ? "OK" : "REGRESSED"}, entity ${entOk ? "OK" : "REGRESSED"}`);
    if (!werOk || !entOk) process.exit(1);
  } else {
    console.log("No baseline.json — run with --save-baseline first.");
  }
}
