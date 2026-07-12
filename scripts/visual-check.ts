/**
 * Visual placement check: upload the synthetic scholarship PDF, take the
 * browser-analyzed fields, fill them with sample answers in Node using the
 * real writer, and save the output PDF for rendering.
 * Run: npx tsx scripts/visual-check.ts
 */
import puppeteer from "puppeteer-core";
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { fillFlatPdf } from "../lib/pdf/pdfWriter";
import type { FormField } from "../lib/types";

const BASE = "http://localhost:3111";
const OUT = "/private/tmp/claude-501/-Users-tejaskm-Documents-Github-swaram/43a107c4-b6f0-4396-9c3c-6d1bf81756a2/scratchpad";

// Reuse the e2e PDF generator via dynamic import of the mjs file's logic — simplest: regenerate here.
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

async function makeTestPdf() {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595, 842]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const black = rgb(0, 0, 0);
  page.drawText("MERIT-CUM-MEANS SCHOLARSHIP APPLICATION", { x: 90, y: 800, size: 16, font: bold, color: black });
  const row = (label: string, y: number, lineFrom = 240, lineTo = 535) => {
    page.drawText(label, { x: 60, y, size: 13, font, color: black });
    page.drawLine({ start: { x: lineFrom, y: y - 3 }, end: { x: lineTo, y: y - 3 }, thickness: 1, color: black });
  };
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
  page.drawText("Father's Occupation:", { x: 60, y: 500, size: 13, font, color: black });
  const options: [string, number][] = [["Salaried", 210], ["Self-employed", 300], ["Farmer", 420], ["Other", 500]];
  for (const [label, x] of options) {
    page.drawRectangle({ x, y: 495, width: 13, height: 13, borderColor: black, borderWidth: 1.2 });
    page.drawText(label, { x: x + 18, y: 498, size: 11, font, color: black });
  }
  page.drawText("SCHOLARSHIP CATEGORY (tick one)", { x: 60, y: 450, size: 13, font: bold, color: black });
  page.drawText("Merit-based", { x: 70, y: 420, size: 11, font, color: black });
  page.drawText("Means-based", { x: 210, y: 420, size: 11, font, color: black });
  page.drawText("Sports Quota", { x: 350, y: 420, size: 11, font, color: black });
  page.drawText("Disability", { x: 490, y: 420, size: 11, font, color: black });
  row("Signature of Applicant:", 100, 230, 400);
  return doc.save();
}

const SAMPLE: Record<string, string> = {
  "full name": "Tejas K M",
  "father": "Ramesh Kumar",
  "mother": "Twinsha T Thilakan",
  "date of birth": "25/08/2007",
  "mobile": "7736184696",
  "email": "tejaskm2508@gmail.com",
  "address": "Kunnappilly House, Ernakulam, Kerala",
  "occupation": "Other",
  "category": "Merit-based",
};

async function main() {
  const pdfBytes = await makeTestPdf();
  const pdfPath = `${OUT}/visual-input.pdf`;
  writeFileSync(pdfPath, pdfBytes);

  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  await page.goto(`${BASE}/upload`, { waitUntil: "networkidle0" });
  const input = await page.$('input[type="file"]');
  await input!.uploadFile(pdfPath);
  await page.waitForFunction(() => location.pathname.startsWith("/processing/"), { timeout: 20000 });
  await page.waitForFunction(() => /fields detected|could not find/i.test(document.body.innerText), {
    timeout: 180000,
    polling: 1000,
  });
  const formId = await page.evaluate(() => location.pathname.split("/")[2]);
  const fields = (await page.evaluate(
    (id: string) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open("swaram");
        req.onsuccess = () => {
          const get = req.result.transaction("forms").objectStore("forms").get(id);
          get.onsuccess = () => resolve(get.result?.fields ?? []);
          get.onerror = () => reject(get.error);
        };
      }),
    formId,
  )) as FormField[];
  await browser.close();

  for (const field of fields) {
    const key = Object.keys(SAMPLE).find((k) => field.label.toLowerCase().includes(k));
    if (key) {
      field.value = SAMPLE[key];
      field.status = "answered";
    }
  }

  const filled = await fillFlatPdf(pdfBytes.slice().buffer as ArrayBuffer, fields);
  const outPdf = `${OUT}/visual-filled.pdf`;
  writeFileSync(outPdf, filled);
  execSync(`qlmanage -t -s 1400 -o "${OUT}" "${outPdf}" 2>/dev/null`);
  console.log("wrote", outPdf);
}

main();
