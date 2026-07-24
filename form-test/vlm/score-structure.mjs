// Structure score: detected unfilled fields vs the 41-field ground-truth schema.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const gt = JSON.parse(readFileSync(resolve(__dirname, "..", "Original", "Unfilled", "Swaram_ParsedForm_UNFILLED.json"), "utf8"));
const det = JSON.parse(readFileSync(resolve(__dirname, "out", "unfilled.json"), "utf8"));

const norm = (s) => String(s ?? "").toLowerCase().replace(/[’'`]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const ALIASES = [
  [/category applied for|scholarship category/, "scholarship category"],
  [/are you receiving any other scholarship.*|receiving other scholarship/, "receiving other scholarship"],
  [/if yes name of scheme|other scholarship name/, "other scholarship name"],
  [/^amount rs$|other scholarship amount/, "other scholarship amount"],
  [/is your address for correspondence the same.*|address for correspondence same/, "address for correspondence same"],
  [/full name of applicant|full name/, "full name"],
  [/particulars of family members|family members/, "family members"],
  [/academic record.*/, "academic record"],
  [/signature of applicant|applicant signature/, "applicant signature"],
  [/annual family income in figures|annual family income figures/, "annual family income figures"],
  [/annual family income in words|annual family income words/, "annual family income words"],
];
const canon = (s) => { const t = norm(s); for (const [re, to] of ALIASES) if (re.test(t)) return to; return t; };
const tokens = (s) => new Set(canon(s).split(" ").filter((t) => t.length > 1 || /[0-9]/.test(t)));
function sim(a, b) {
  if (canon(a) === canon(b)) return 1;
  const A = tokens(a), B = tokens(b); if (!A.size || !B.size) return 0;
  let i = 0; for (const t of A) if (B.has(t)) i++; return i / Math.max(A.size, B.size);
}

// index detected by page
let found = 0, typeMatch = 0, optMatch = 0;
const rows = [];
const used = new Set();
for (const g of gt) {
  let best = -1, bs = 0;
  det.forEach((d, i) => { if (d.page !== g.page || used.has(i)) return; const s = sim(g.label, d.label); if (s > bs) { bs = s; best = i; } });
  if (best < 0 || bs < 0.34) { rows.push(`MISSING  [p${g.page}] ${g.label} (${g.type})`); continue; }
  used.add(best); found++;
  const d = det[best];
  // type equivalence: comb<->text acceptable (both write regions); signature ok; table must be table
  const tOk = d.type === g.type ||
    (g.type === "text" && (d.type === "comb" || d.type === "text")) ||
    (g.type === "comb" && (d.type === "comb" || d.type === "text"));
  if (tOk) typeMatch++;
  const gOpt = g.options?.length ?? 0, dOpt = d.options?.length ?? 0;
  const oOk = g.type !== "choice" || gOpt === dOpt;
  if (oOk) optMatch++;
  if (!tOk || !oOk) rows.push(`DIFF     [p${g.page}] ${g.label}: gt(${g.type}${gOpt ? "/" + gOpt + "opt" : ""}) vs det(${d.type}${dOpt ? "/" + dOpt + "opt" : ""})`);
}
const N = gt.length;
console.log(`\n=== STRUCTURE SCORE (unfilled vs 41-field schema) ===`);
console.log(`GT fields         : ${N}`);
console.log(`Detected (coverage): ${found}/${N}  (${(100 * found / N).toFixed(1)}%)`);
console.log(`Type match        : ${typeMatch}/${N}  (comb/text treated as equivalent)`);
console.log(`Choice-option count match : ${optMatch}/${N}`);
console.log(`Detected total fields: ${det.length}`);
console.log(`\n--- notes ---`);
for (const r of rows) console.log(r);
