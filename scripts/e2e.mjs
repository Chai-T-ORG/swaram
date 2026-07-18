/**
 * End-to-end test in headless Chrome against the running prod server.
 * Generates a flat PDF modelled on a real Indian scholarship form —
 * underlined blanks, "Label: ___ Label: ___" rows, checkbox option rows,
 * a "(tick one)" section, a photo box, and a signature line — uploads it
 * through the real UI, waits for the in-browser pipeline (pdf.js +
 * tesseract + opencv), then asserts on the detected fields via IndexedDB.
 *
 * Run: node scripts/e2e.mjs [baseUrl]
 */
import puppeteer from "puppeteer-core";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:3111";
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

let failures = 0;
function check(name, condition, detail = "") {
  if (condition) console.log(`✓ ${name}`);
  else {
    failures += 1;
    console.log(`✗ ${name} ${detail}`);
  }
}

async function makeTestPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);

  page.drawText("MERIT-CUM-MEANS SCHOLARSHIP APPLICATION", { x: 90, y: 800, size: 16, font: bold, color: black });

  const row = (label, y, lineFrom = 240, lineTo = 535) => {
    page.drawText(label, { x: 60, y, size: 13, font, color: black });
    page.drawLine({ start: { x: lineFrom, y: y - 3 }, end: { x: lineTo, y: y - 3 }, thickness: 1, color: black });
  };

  // Photo box (should NOT become a field)
  page.drawRectangle({ x: 470, y: 660, width: 90, height: 110, borderColor: black, borderWidth: 1 });
  page.drawText("Affix", { x: 498, y: 730, size: 9, font, color: black });
  page.drawText("Passport", { x: 490, y: 716, size: 9, font, color: black });
  page.drawText("Size Photo", { x: 486, y: 702, size: 9, font, color: black });

  row("Full Name:", 750, 140, 440);
  row("Father's / Guardian's Name:", 710, 240, 440);
  row("Mother's Name:", 670, 170, 440);
  row("Date of Birth (DD/MM/YYYY):", 630, 250, 380);
  row("Mobile Number:", 590, 165, 300);
  page.drawText("Email Address:", { x: 320, y: 590, size: 13, font, color: black });
  page.drawLine({ start: { x: 415, y: 587 }, end: { x: 555, y: 587 }, thickness: 1, color: black });
  row("Permanent Address:", 550, 195, 535);

  // Occupation checkbox row
  page.drawText("Father's Occupation:", { x: 60, y: 500, size: 13, font, color: black });
  const options = [
    ["Salaried", 210],
    ["Self-employed", 300],
    ["Farmer", 420],
    ["Other", 500],
  ];
  for (const [label, x] of options) {
    page.drawRectangle({ x, y: 495, width: 13, height: 13, borderColor: black, borderWidth: 1.2 });
    page.drawText(label, { x: x + 18, y: 498, size: 11, font, color: black });
  }

  // (tick one) section with text-only options
  page.drawText("SCHOLARSHIP CATEGORY (tick one)", { x: 60, y: 450, size: 13, font: bold, color: black });
  page.drawText("Merit-based", { x: 70, y: 420, size: 11, font, color: black });
  page.drawText("Means-based", { x: 210, y: 420, size: 11, font, color: black });
  page.drawText("Sports Quota", { x: 350, y: 420, size: 11, font, color: black });
  page.drawText("Disability", { x: 490, y: 420, size: 11, font, color: black });

  // Signature line (should NOT become a field)
  row("Signature of Applicant:", 100, 230, 400);

  return doc.save();
}

const errors = [];
function watch(page, tag) {
  page.on("pageerror", (e) => errors.push(`[${tag}] pageerror: ${e.message}`));
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("[swaram]")) console.log("  browser:", text.slice(0, 200));
    if (msg.type() === "error" && !/favicon|net::ERR_ABORTED/i.test(text)) {
      errors.push(`[${tag}] console: ${text.slice(0, 200)}`);
    }
  });
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: "new",
  args: ["--no-sandbox", "--disable-gpu"],
});

try {
  const page = await browser.newPage();
  watch(page, "app");

  await page.goto(`${BASE}/`, { waitUntil: "networkidle0", timeout: 30000 });
  const home = await page.evaluate(() => document.body.innerText);
  const renders = home.includes("Swaram") || /form/i.test(home);
  check("home renders", renders, renders ? "" : `HTML Body:\n${home}\nErrors:\n${errors.join("\n")}`);

  const pdfBytes = await makeTestPdf();
  const pdfPath = join(tmpdir(), "swaram-e2e-scholarship.pdf");
  writeFileSync(pdfPath, pdfBytes);

  await page.goto(`${BASE}/upload`, { waitUntil: "networkidle0" });
  const input = await page.$('input[type="file"]');
  await input.uploadFile(pdfPath);
  console.log("… uploaded, waiting for in-browser OCR (~30-90s)");

  await page.waitForFunction(() => location.pathname.startsWith("/processing/"), { timeout: 20000 });
  await page.waitForFunction(
    () => /fields detected|could not find any fillable fields|Something went wrong/i.test(document.body.innerText),
    { timeout: 180000, polling: 1000 },
  );

  const formId = await page.evaluate(() => location.pathname.split("/")[2]);

  // Pull the analyzed fields straight out of IndexedDB.
  const fields = await page.evaluate(
    (id) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("swaram");
        req.onsuccess = () => {
          const db = req.result;
          const get = db.transaction("forms").objectStore("forms").get(id);
          get.onsuccess = () => resolve(get.result?.fields ?? []);
          get.onerror = () => reject(get.error);
        };
        req.onerror = () => reject(req.error);
      }),
    formId,
  );

  console.log(
    "Detected:",
    fields.map((f) => `${f.label} [${f.type}]`).join(" | "),
  );

  const byLabel = (re) => fields.find((f) => re.test(f.label));

  check("detected a sensible number of fields", fields.length >= 8 && fields.length <= 20, `got ${fields.length}`);
  check("Full Name found", Boolean(byLabel(/^Full Name$/i)));
  check(
    "Father's / Guardian's Name -> Father's Name (not Full Name)",
    Boolean(byLabel(/Father's Name/i)),
    fields.map((f) => f.label).join(","),
  );
  check("Mother's Name found", Boolean(byLabel(/Mother's Name/i)));
  const dob = byLabel(/Date of Birth/i);
  check("Date of Birth found as date", dob?.type === "date", dob?.type);
  check("Mobile Number found", Boolean(byLabel(/Mobile/i)));
  check("Email found", Boolean(byLabel(/Email/i)));
  check("Address found", Boolean(byLabel(/Address/i)));

  const occupation = byLabel(/Occupation/i);
  check("Occupation is a choice field", occupation?.type === "choice", occupation?.type);
  check(
    "Occupation options include Salaried & Other",
    Boolean(occupation?.options?.some((o) => /salaried/i.test(o)) && occupation?.options?.some((o) => /other/i.test(o))),
    JSON.stringify(occupation?.options),
  );
  check("Occupation has per-option tick boxes", (occupation?.optionBboxes?.length ?? 0) >= 3);

  const category = byLabel(/Category/i);
  check("Category (tick one) is a choice field", category?.type === "choice", category?.type);
  check(
    "Category options include Merit-based",
    Boolean(category?.options?.some((o) => /merit/i.test(o))),
    JSON.stringify(category?.options),
  );

  check("no Signature field", !fields.some((f) => /signature|sign\b/i.test(f.label)), fields.map((f) => f.label).join(","));
  check("no photo-box field", !fields.some((f) => /affix|passport|photo/i.test(f.label)));

  const mother = byLabel(/Mother's Name/i);
  check(
    "Mother's answer area sits on its blank (not past it)",
    Boolean(mother?.bbox && mother.bbox.x > 0.2 && mother.bbox.x < 0.35 && mother.bbox.x + mother.bbox.w < 0.85),
    JSON.stringify(mother?.bbox),
  );

  // Review page renders with the fields
  await page.goto(`${BASE}/review/${formId}`, { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 1200));
  const review = await page.evaluate(() => document.body.innerText);
  check("review page lists fields", /Full Name/i.test(review));

  await page.goto(`${BASE}/fill/${formId}`, { waitUntil: "domcontentloaded" });
  await new Promise((r) => setTimeout(r, 800));
  const fill = await page.evaluate(() => document.body.innerText);
  check("fill page ready", /Start/i.test(fill));
} finally {
  await browser.close();
}

if (errors.length) {
  console.log("\nBrowser errors observed:");
  for (const e of [...new Set(errors)].slice(0, 10)) console.log("  " + e);
} else {
  console.log("\nNo browser console/page errors.");
}
console.log(failures === 0 ? "\nE2E PASSED" : `\n${failures} E2E CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
