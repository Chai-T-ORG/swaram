/**
 * End-to-end write-back verification using the REAL production code:
 *   raw VLM schema  --schemaToFields-->  FormField[]  --fillFlatPdf-->  filled PDF
 *
 * Fills the ORIGINAL unfilled form with the values the VLM read off the FILLED
 * form, so the output should reproduce the filled form. Exercises comb boxes,
 * choice ticks (optionBboxes), multi-select, native table cells, and coordinate
 * conversion — the whole write path — on the real document.
 *
 * Run from repo root: npx tsx scripts/e2e-writeback.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { schemaToFields, type VlmPage } from "../lib/analysis/vlmAdapter";
import { fillFlatPdf } from "../lib/pdf/pdfWriter";

async function main() {
  const rawPath = resolve("form-test/vlm/out/filled.raw.json");
  const origPath = resolve("form-test/Original/Unfilled/Swaram Stress Test Form.pdf");
  const outPath = resolve("form-test/vlm/out/filled-by-swaram.pdf");

  const raw = JSON.parse(readFileSync(rawPath, "utf8")) as VlmPage[];
  const fields = schemaToFields(raw);

  const counts: Record<string, number> = {};
  for (const f of fields) counts[f.type] = (counts[f.type] || 0) + 1;
  console.log(`fields: ${fields.length} ->`, counts);
  console.log(`fields carrying a value: ${fields.filter((f) => (f.value ?? "").trim().length > 0).length}`);

  const origBuf = readFileSync(origPath);
  const origAb = origBuf.buffer.slice(origBuf.byteOffset, origBuf.byteOffset + origBuf.byteLength);

  const filled = await fillFlatPdf(origAb, fields);
  writeFileSync(outPath, filled);
  console.log(`\nwrote ${outPath} (${filled.byteLength} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
