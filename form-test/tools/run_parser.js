const puppeteer = require("puppeteer-core");
const { writeFileSync, readFileSync, existsSync } = require("node:fs");
const { resolve, join } = require("node:path");
const { tmpdir } = require("node:os");

const BASE = "http://localhost:3000";

const CHROME_PATHS = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\BraveSoftware\\Brave-Browser\\Application\\brave.exe",
];

async function main() {
  let chromePath = null;
  for (const p of CHROME_PATHS) {
    if (existsSync(p)) {
      chromePath = p;
      break;
    }
  }

  if (!chromePath) {
    console.error("Error: Could not find Chrome, Edge, or Brave browser on your Windows system.");
    process.exit(1);
  }

  console.log("Found Chromium browser at:", chromePath);
  
  // Resolve source PDF path
  const sourcePdfPath = resolve(__dirname, "..", "Swaram Stress Test Form.pdf");
  console.log("Source PDF File path:", sourcePdfPath);

  if (!existsSync(sourcePdfPath)) {
    console.error("Error: PDF file not found at", sourcePdfPath);
    process.exit(1);
  }

  // Copy PDF to local system temp directory (C: drive)
  const tempPdfPath = join(tmpdir(), "Swaram_Stress_Test_Form.pdf");
  console.log("Copying PDF to local temp directory:", tempPdfPath);
  try {
    const fileBytes = readFileSync(sourcePdfPath);
    writeFileSync(tempPdfPath, fileBytes);
    console.log("PDF copied successfully to local temp folder.");
  } catch (err) {
    console.error("Error copying PDF to temp directory:", err);
    process.exit(1);
  }

  console.log("Launching headless browser...");
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ["--no-sandbox", "--disable-gpu"],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // Enable console logs from browser to be printed
    page.on("console", (msg) => {
      console.log(`[Browser Console]: ${msg.text()}`);
    });

    page.on("pageerror", (err) => {
      console.error(`[Browser PageError]: ${err.message}`, err.stack);
    });

    console.log(`Connecting to Swaram server at ${BASE}...`);
    // Wait for network idle to make sure Next.js is fully loaded and hydrated
    await page.goto(`${BASE}/upload`, { waitUntil: "networkidle0", timeout: 90000 });

    console.log("Waiting for file input...");
    await page.waitForSelector('input[type="file"]', { timeout: 30000 });

    const input = await page.$('input[type="file"]');
    
    // Give the page a moment to initialize
    await new Promise((r) => setTimeout(r, 2000));

    console.log("Uploading file...");
    await input.uploadFile(tempPdfPath);

    console.log("Waiting for redirect to processing page (timeout 60s)...");
    try {
      await page.waitForFunction(() => location.pathname.startsWith("/processing/"), { timeout: 60000 });
    } catch (err) {
      console.log("[Diagnostics] Redirect timed out. Let's dump the current page text:");
      const innerText = await page.evaluate(() => document.body.innerText);
      console.log(`----------------------------------------\n${innerText}\n----------------------------------------`);
      throw err;
    }
    
    const formId = await page.evaluate(() => location.pathname.split("/")[2]);
    console.log(`Processing started. Form ID in storage: ${formId}`);
    console.log("Running OCR & shape detection. Please wait, this takes 1-2 minutes...");

    // Wait until status text displays results
    await page.waitForFunction(
      () => /fields detected|could not find any fillable fields|Something went wrong/i.test(document.body.innerText),
      { timeout: 180000, polling: 1000 },
    );

    console.log("Form processing finished! Pulling results from IndexedDB...");

    // Pull fields from IndexedDB
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

    console.log(`Successfully extracted ${fields.length} actual parsed fields.`);

    const outPath = resolve(__dirname, "..", "actual_parsed_form.json");
    writeFileSync(outPath, JSON.stringify(fields, null, 2));
    console.log(`Wrote actual parsed results to: ${outPath}`);

  } catch (error) {
    console.error("Parser run failed:", error);
  } finally {
    await browser.close();
    console.log("Browser closed.");
  }
}

main().catch(console.error);
