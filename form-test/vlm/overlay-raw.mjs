// Draw raw [ymin,xmin,ymax,xmax]/1000 bboxes (+ option/cell boxes) from a raw
// extraction JSON onto a page image, to judge bbox quality.
// Usage: node overlay-raw.mjs <raw.json> <page-image.png> <out.png>
import { readFileSync } from "node:fs";
import sharp from "sharp";

const [rawPath, imgPath, outPath] = process.argv.slice(2);
const data = JSON.parse(readFileSync(rawPath, "utf8"));
const fields = data.fields ?? data;
const meta = await sharp(imgPath).metadata();
const W = meta.width, H = meta.height;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function r(g, color, w = 2.5) {
  if (!Array.isArray(g) || g.length !== 4) return "";
  const [ymin, xmin, ymax, xmax] = g;
  const x = (Math.min(xmin, xmax) / 1000) * W, y = (Math.min(ymin, ymax) / 1000) * H;
  const ww = (Math.abs(xmax - xmin) / 1000) * W, hh = (Math.abs(ymax - ymin) / 1000) * H;
  return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${ww.toFixed(1)}" height="${hh.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${w}"/>`;
}

let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">`;
for (const f of fields) {
  if (f.type !== "table" && f.bbox) {
    svg += r(f.bbox, "#1e88e5");
    const [ymin, xmin] = f.bbox;
    svg += `<text x="${((xmin / 1000) * W).toFixed(1)}" y="${((ymin / 1000) * H - 3).toFixed(1)}" font-family="sans-serif" font-size="12" fill="#1e88e5">${esc(f.label ?? "")}</text>`;
  }
  for (const ob of f.optionBboxes ?? []) svg += r(ob, "#e53935", 3);
  for (const cb of f.cellBboxes ?? []) svg += r(cb, "#00c853", 2);
}
svg += `</svg>`;
await sharp(imgPath).composite([{ input: Buffer.from(svg), top: 0, left: 0 }]).toFile(outPath);
console.error("wrote " + outPath);
