import puppeteer from "puppeteer-core";
import { writeFileSync, mkdirSync } from "node:fs";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

const BASE = "http://localhost:3111";
const ARTIFACTS_DIR = "/Users/tejaskm/.gemini/antigravity-ide/brain/6d97efb1-5977-4ff4-b0b2-93f55172bc21";
const PDF_PATH = "/tmp/visual-input-test.pdf";

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
  row("Full Name:", 750, 140, 440);
  row("Father's / Guardian's Name:", 710, 240, 440);
  row("Mother's Name:", 670, 170, 440);
  return doc.save();
}

async function capture(stage: string) {
  const pdfBytes = await makeTestPdf();
  writeFileSync(PDF_PATH, pdfBytes);

  console.log("Launching browser...");
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--no-sandbox", "--window-size=1440,900"],
    defaultViewport: { width: 1440, height: 900 }
  });
  const page = await browser.newPage();

  // 1. Home Light
  console.log("Navigating to Home...");
  await page.goto(`${BASE}/`, { waitUntil: "networkidle0" });
  await page.evaluate(() => {
    localStorage.setItem("theme", "light");
    document.documentElement.classList.remove("dark");
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: `${ARTIFACTS_DIR}/${stage}-home-light.png` });
  console.log(`Saved ${stage}-home-light.png`);

  // 2. Home Dark
  await page.evaluate(() => {
    localStorage.setItem("theme", "dark");
    document.documentElement.classList.add("dark");
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: `${ARTIFACTS_DIR}/${stage}-home-dark.png` });
  console.log(`Saved ${stage}-home-dark.png`);

  // Reset to Light for upload
  await page.evaluate(() => {
    localStorage.setItem("theme", "light");
    document.documentElement.classList.remove("dark");
  });

  // 3. Upload & Fill Light
  console.log("Uploading PDF...");
  await page.goto(`${BASE}/upload`, { waitUntil: "networkidle0" });
  const fileInput = await page.$('input[type="file"]');
  await fileInput!.uploadFile(PDF_PATH);

  console.log("Waiting for processing to complete...");
  await page.waitForFunction(() => location.pathname.startsWith("/processing/"), { timeout: 20000 });
  await page.waitForFunction(() => /fields detected/i.test(document.body.innerText), {
    timeout: 90000,
    polling: 1000
  });

  const formId = await page.evaluate(() => location.pathname.split("/")[2]);
  console.log("Navigating to fill page directly:", `${BASE}/fill/${formId}`);
  await page.goto(`${BASE}/fill/${formId}`, { waitUntil: "networkidle0" });
  await new Promise(r => setTimeout(r, 2000));

  // Take Fill Light
  await page.evaluate(() => {
    localStorage.setItem("theme", "light");
    document.documentElement.classList.remove("dark");
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: `${ARTIFACTS_DIR}/${stage}-fill-light.png` });
  console.log(`Saved ${stage}-fill-light.png`);

  // Take Fill Dark
  await page.evaluate(() => {
    localStorage.setItem("theme", "dark");
    document.documentElement.classList.add("dark");
  });
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: `${ARTIFACTS_DIR}/${stage}-fill-dark.png` });
  console.log(`Saved ${stage}-fill-dark.png`);

  await browser.close();
}

const stageArg = process.argv[2] || "stage1";
capture(stageArg).catch(err => {
  console.error(err);
  process.exit(1);
});
