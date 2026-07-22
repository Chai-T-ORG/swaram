// Draw per-option tick boxes (optionBboxes) for choice fields on filled page 1,
// to confirm they land on the individual checkboxes/radios.
// Usage: node verify-options.mjs
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { extractPage } from "./extract.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const img = resolve(__dirname, "pages", "filled-1.png");
const { fields } = await extractPage("filled", 1, 4);
const meta = await sharp(img).metadata();
const W = meta.width, H = meta.height;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
for (const f of fields.filter((x) => x.type === "choice" && x.optionBboxes)) {
  f.optionBboxes.forEach((g, i) => {
    if (!Array.isArray(g) || g.length !== 4) return;
    const [ymin, xmin, ymax, xmax] = g;
    const x = (xmin / 1000) * W, y = (ymin / 1000) * H, w = ((xmax - xmin) / 1000) * W, h = ((ymax - ymin) / 1000) * H;
    const sel = (f.value || "").toLowerCase().includes((f.options?.[i] || "").toLowerCase());
    const color = sel ? "#e53935" : "#1e88e5";
    svg += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="none" stroke="${color}" stroke-width="3"/>`;
    svg += `<text x="${x.toFixed(1)}" y="${(y - 3).toFixed(1)}" font-family="sans-serif" font-size="12" fill="${color}">${esc(f.options?.[i] ?? "")}${sel ? " ✓" : ""}</text>`;
  });
}
svg += `</svg>`;
const out = resolve(__dirname, "out", "filled-1.options.png");
await sharp(img).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).toFile(out);
console.error("wrote " + out);
