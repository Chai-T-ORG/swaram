// Draw extracted bboxes back onto page images for visual verification.
// Usage: node overlay.mjs <filled|unfilled>
import { readFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, "out");
mkdirSync(OUT, { recursive: true });

const kind = process.argv[2] || "filled";
const fields = JSON.parse(readFileSync(resolve(OUT, `${kind}.json`), "utf8"));

const COLORS = { text: "#1e88e5", date: "#8e24aa", choice: "#e53935", comb: "#00897b", signature: "#6d4c41", table: "#f4511e" };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function rect(b, W, H, color, label) {
  if (!b) return "";
  const x = b.x * W, y = b.y * H, w = b.w * W, h = b.h * H;
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="none" stroke="${color}" stroke-width="2.5"/>` +
    (label ? `<text x="${x.toFixed(1)}" y="${(y - 3).toFixed(1)}" font-family="sans-serif" font-size="13" fill="${color}">${esc(label)}</text>` : "");
}

for (let page = 0; page < 4; page++) {
  const img = resolve(__dirname, "pages", `${kind}-${page + 1}.png`);
  const meta = await sharp(img).metadata();
  const W = meta.width, H = meta.height;
  const pf = fields.filter((f) => f.page === page);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
  for (const f of pf) {
    const color = COLORS[f.type] || "#333";
    if (f.type === "table") {
      for (const r of f.rows ?? []) for (const c of r.cells ?? []) svg += rect(c.bbox, W, H, color, "");
      svg += `<text x="8" y="16" font-family="sans-serif" font-size="14" fill="${color}">TABLE: ${esc(f.label)}</text>`;
    } else {
      svg += rect(f.bbox, W, H, color, f.label);
    }
  }
  svg += `</svg>`;
  const outPath = resolve(OUT, `${kind}-${page + 1}.overlay.png`);
  await sharp(img).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).toFile(outPath);
  process.stderr.write(`wrote ${outPath}  (${pf.length} fields)\n`);
}
