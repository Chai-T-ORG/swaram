// Extract all 4 pages via OpenAI IN PARALLEL (hides per-page latency), save the
// raw + normalized output. Usage: OPENAI_MODEL=gpt-5.5 OPENAI_REASONING=low node run-openai.mjs <filled|unfilled>
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractPageOpenAI } from "./extract-openai.mjs";
import { toAppBbox } from "./extract.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "out");
mkdirSync(OUT, { recursive: true });

function normalize(field, page) {
  const f = { page, label: field.label, type: field.type };
  if (field.options) f.options = field.options;
  if (field.optionBboxes) f.optionBboxes = field.optionBboxes.map(toAppBbox);
  if (field.combLength) f.combLength = field.combLength;
  if (field.cellBboxes) f.combCells = field.cellBboxes.map(toAppBbox);
  if (field.type === "table") {
    f.columns = field.columns ?? [];
    f.rows = (field.rows ?? []).map((r) => ({ rowLabel: r.rowLabel, cells: (r.cells ?? []).map((c) => ({ value: c.value ?? "", bbox: toAppBbox(c.bbox) })) }));
  } else {
    f.value = Array.isArray(field.value) ? field.value.join(", ") : (field.value ?? "");
    f.bbox = toAppBbox(field.bbox);
  }
  return f;
}

const kind = process.argv[2] || "filled";
const t0 = Date.now();
const results = await Promise.all(
  [1, 2, 3, 4].map((p) =>
    extractPageOpenAI(kind, p, 4)
      .then((r) => ({ p, ...r }))
      .catch((e) => ({ p, fields: [], err: String(e).slice(0, 120) })),
  ),
);
results.sort((a, b) => a.p - b.p);

const all = [];
const raw = [];
let tokens = 0;
for (const r of results) {
  process.stderr.write(`page ${r.p}: ${r.fields.length} fields ${r.ms ? r.ms + "ms" : ""} ${r.err ? "ERR " + r.err : ""}\n`);
  tokens += r.usage?.total_tokens ?? 0;
  raw.push({ page: r.p - 1, fields: r.fields });
  for (const f of r.fields) all.push(normalize(f, r.p - 1));
}
writeFileSync(resolve(OUT, `${kind}.json`), JSON.stringify(all, null, 2));
writeFileSync(resolve(OUT, `${kind}.raw.json`), JSON.stringify(raw, null, 2));
process.stderr.write(`\nPARALLEL wall-time ${Date.now() - t0}ms  total fields ${all.length}  tokens ${tokens}\nwrote out/${kind}.{json,raw.json}\n`);
