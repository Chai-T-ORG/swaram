// Score extracted output against ground-truth answers.
// Usage: node score.mjs <filled>
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "out");
const kind = process.argv[2] || "filled";

const extracted = JSON.parse(readFileSync(resolve(OUT, `${kind}.json`), "utf8"));
const gt = JSON.parse(readFileSync(resolve(__dirname, `gt-${kind}.json`), "utf8")).answers;

const isSerialCol = (name) => /^(#|s\.?\s*no\.?|sl\.?|sr\.?|serial)$/i.test(String(name).trim());

// Flatten extracted (tables -> cells). Cells keep table/row/col SEPARATE
// (_t/_r/_c) — never string-joined — so slashes inside names can't collide.
const flat = [];
for (const f of extracted) {
  if (f.type === "table") {
    const cols = f.columns ?? [];
    for (const r of f.rows ?? []) {
      const cells = r.cells ?? [];
      const offset = cells.length === cols.length + 1 ? 1 : 0; // drop leading serial cell if included
      cols.forEach((col, i) => {
        if (isSerialCol(col)) return;
        const c = cells[i + offset];
        if (!c) return;
        flat.push({ page: f.page, type: "cell", _t: f.label, _r: String(r.rowLabel ?? ""), _c: col,
          label: `${f.label} » ${r.rowLabel} » ${col}`, value: c.value ?? "" });
      });
    }
  } else {
    flat.push({ page: f.page, label: f.label, value: f.value ?? "", type: f.type });
  }
}

// Parse a GT cell label "Table / Row / Column" (parts are slash-free in GT).
function gtCellParts(label) {
  const p = label.split(" / ").map((s) => s.trim());
  return { _t: p[0], _r: p.slice(1, -1).join(" "), _c: p[p.length - 1] };
}

const norm = (s) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
const tight = (s) => norm(s).replace(/[^a-z0-9]/g, "");
// keep digit tokens ("1","2") so "Semester 1" != "Semester 2"
const keyTokens = (s) => new Set(norm(s).replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((t) => t.length > 1 || /[0-9]/.test(t)));
const partSim = (x, y) => {
  const X = keyTokens(x), Y = keyTokens(y);
  if (!X.size || !Y.size) return 0;
  let i = 0; for (const t of X) if (Y.has(t)) i++;
  return i / Math.max(X.size, Y.size);
};

// Canonicalize known label synonyms so the printed label matches the GT key.
const ALIASES = [
  [/category applied for|scholarship category/, "scholarship category"],
  [/are you receiving any other scholarship.*|receiving other scholarship/, "receiving other scholarship"],
  [/if yes,? name of scheme|other scholarship name/, "other scholarship name"],
  [/amount \(rs\.?\)|other scholarship amount/, "other scholarship amount"],
  [/is your address for correspondence the same.*|address for correspondence same/, "address for correspondence same"],
  [/full name of applicant|full name/, "full name"],
];
function canon(s) {
  let t = norm(s);
  for (const [re, to] of ALIASES) if (re.test(t)) return to;
  return t;
}
function labelSim(a, b) {
  if (canon(a) === canon(b)) return 1;
  const pa = a.split("/").map((s) => s.trim()), pb = b.split("/").map((s) => s.trim());
  // Structural match for table cells "Table / row / column": compare table,
  // row (middle), and column (last) separately so rows/cols can't cross-match.
  if (pa.length >= 3 && pb.length >= 3) {
    const t = partSim(pa[0], pb[0]);
    const c = partSim(pa[pa.length - 1], pb[pb.length - 1]);
    const r = partSim(pa.slice(1, -1).join(" "), pb.slice(1, -1).join(" "));
    return (t + r + c) / 3;
  }
  return partSim(a, b);
}

function valueMatch(exp, act) {
  const e = norm(exp), a = norm(act);
  if (e === "" && a === "") return "exact";
  if (e === a) return "exact";
  if (tight(exp) === tight(act) && tight(exp) !== "") return "exact";
  // choice: multi-select order-independent
  const es = e.split(",").map((x) => x.trim()).filter(Boolean).sort().join("|");
  const as = a.split(",").map((x) => x.trim()).filter(Boolean).sort().join("|");
  if (es && es === as) return "exact";
  if (e && a && (a.includes(e) || e.includes(a))) return "close";
  return "miss";
}

let vExact = 0, vClose = 0, vMiss = 0, notFound = 0;
const problems = [];
const usedIdx = new Set();

for (const g of gt) {
  const gCell = g.type === "cell" ? gtCellParts(g.label) : null;
  // find best matching extracted answer on same page.
  let best = -1, bestSim = 0;
  flat.forEach((f, i) => {
    if (f.page !== g.page || usedIdx.has(i)) return;
    let sim;
    if (gCell && f.type === "cell") {
      sim = (partSim(gCell._t, f._t) + partSim(gCell._r, f._r) + partSim(gCell._c, f._c)) / 3;
    } else if (gCell || f.type === "cell") {
      sim = 0; // don't match a cell against a scalar field
    } else {
      sim = labelSim(g.label, f.label);
    }
    if (sim > bestSim) { bestSim = sim; best = i; }
  });
  // Fallback: if no good label match, claim an unused extracted field on the
  // same page whose value matches exactly (same field, different printed label).
  if (best < 0 || bestSim < 0.34) {
    let vIdx = -1;
    flat.forEach((f, i) => {
      if (f.page !== g.page || usedIdx.has(i)) return;
      if (valueMatch(g.value, f.value) === "exact" && norm(g.value) !== "") vIdx = i;
    });
    if (vIdx < 0) {
      notFound++;
      problems.push(`NOT FOUND  [p${g.page}] ${g.label}  (exp="${g.value}")`);
      continue;
    }
    best = vIdx; bestSim = 0.5;
  }
  usedIdx.add(best);
  const m = valueMatch(g.value, flat[best].value);
  if (m === "exact") vExact++;
  else if (m === "close") { vClose++; problems.push(`~CLOSE     [p${g.page}] ${g.label}  exp="${g.value}"  got="${flat[best].value}"`); }
  else { vMiss++; problems.push(`WRONG VAL  [p${g.page}] ${g.label}  exp="${g.value}"  got="${flat[best].value}"`); }
}

// extra fields the model produced that no GT answer claimed
const extras = flat.filter((_, i) => !usedIdx.has(i)).map((f) => `EXTRA      [p${f.page}] ${f.label} = "${f.value}"`);

const N = gt.length;
console.log(`\n=== SCORE (${kind}) ===`);
console.log(`Ground-truth answers : ${N}`);
console.log(`Found & value EXACT  : ${vExact}  (${(100 * vExact / N).toFixed(1)}%)`);
console.log(`Found, value CLOSE   : ${vClose}`);
console.log(`Found, value WRONG   : ${vMiss}`);
console.log(`NOT FOUND (missing)  : ${notFound}`);
console.log(`Extra/over-detected  : ${extras.length}`);
console.log(`\n--- issues ---`);
for (const p of problems) console.log(p);
console.log(`\n--- extras ---`);
for (const e of extras) console.log(e);
