// Extract all 4 pages of a form kind and save normalized output.
// Usage: node run.mjs <filled|unfilled>
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { extractPage, toAppBbox, MODEL } from "./extract.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "out");
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function normalize(field, page) {
  const f = { page, label: field.label, type: field.type };
  if (field.options) f.options = field.options;
  if (field.optionBboxes) f.optionBboxes = field.optionBboxes.map(toAppBbox);
  if (field.combLength) f.combLength = field.combLength;
  if (field.type === "table") {
    f.columns = field.columns ?? [];
    f.rows = (field.rows ?? []).map((r) => ({
      rowLabel: r.rowLabel,
      cells: (r.cells ?? []).map((c) => ({ value: c.value ?? "", bbox: toAppBbox(c.bbox) })),
    }));
  } else {
    f.value = Array.isArray(field.value) ? field.value.join(", ") : (field.value ?? "");
    f.bbox = toAppBbox(field.bbox);
  }
  return f;
}

const kind = process.argv[2] || "filled";
const all = [];
const raw = []; // { page (0-based), fields: <raw gemini schema> } — adapter test fixture
let totalTokens = 0;
for (let page = 1; page <= 4; page++) {
  process.stderr.write(`[${kind}] page ${page} … `);
  const { fields, usage } = await extractPage(kind, page, 4);
  totalTokens += usage?.totalTokenCount ?? 0;
  raw.push({ page: page - 1, fields });
  for (const f of fields) all.push(normalize(f, page - 1)); // page index 0-based like app
  process.stderr.write(`${fields.length} fields\n`);
  if (page < 4) await sleep(4000); // pace for free-tier RPM
}
writeFileSync(resolve(OUT, `${kind}.json`), JSON.stringify(all, null, 2));
writeFileSync(resolve(OUT, `${kind}.raw.json`), JSON.stringify(raw, null, 2));
process.stderr.write(`\nmodel=${MODEL}  total fields=${all.length}  tokens=${totalTokens}\nwrote out/${kind}.json\n`);
