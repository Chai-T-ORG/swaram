import puppeteer from "puppeteer-core";

async function main() {
  console.log("Launching browser to inspect DOM...");
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();

  page.on("console", (msg) => {
    console.log(`[BROWSER CONSOLE] ${msg.type().toUpperCase()}: ${msg.text()}`);
  });

  page.on("pageerror", (err) => {
    console.error("[BROWSER ERROR]", err);
  });

  console.log("Navigating to http://localhost:3000/ ...");
  await page.goto("http://localhost:3000/", { waitUntil: "networkidle0" });

  const html = await page.evaluate(() => {
    const greeting = document.querySelector('section[aria-label="Welcome greeting"]');
    return greeting ? greeting.outerHTML : "Greeting section NOT found!";
  });

  console.log("\n--- GREETING SECTION HTML ---");
  console.log(html);
  console.log("-----------------------------\n");

  await browser.close();
}

main().catch(console.error);
