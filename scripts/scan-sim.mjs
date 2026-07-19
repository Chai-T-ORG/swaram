/**
 * Fake-camera drive of the Swaram /scan flow.
 *
 * Renders a synthetic scene (white form, rotated 7°, on a busy paisley-like
 * background), writes it as a y4m video, feeds it to Chrome's fake camera
 * device, and drives the real scan page: start camera → live outline →
 * auto-capture → confirm verdict → adjust-corners probe → retake probe.
 */
import { createRequire } from "module";
import { writeFileSync, existsSync } from "fs";

const require = createRequire("/Users/tejaskm/swaram/swaram/package.json");
const puppeteer = require("puppeteer-core");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = "http://localhost:3000";
const SCRATCH = "/private/tmp/claude-501/-Users-tejaskm-swaram-swaram/81348b70-8050-48d0-83d1-d19ec2fdb170/scratchpad";
const Y4M = `${SCRATCH}/scene.y4m`;
const W = 640;
const H = 480;

const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function makeSceneY4m() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: ["--no-sandbox", "--disable-gpu"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: W, height: H });
  await page.setContent(`<canvas id="c" width="${W}" height="${H}"></canvas>`);
  const rgba = await page.evaluate(() => {
    const c = document.getElementById("c");
    const x = c.getContext("2d");
    x.fillStyle = "#e8ddc4";
    x.fillRect(0, 0, 640, 480);
    const cols = ["#a33327", "#c98a2d", "#7a6b3a", "#902f21", "#d4a548", "#5b6b41"];
    let seed = 42;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 420; i++) {
      x.fillStyle = cols[i % cols.length];
      const px = rnd() * 640;
      const py = rnd() * 480;
      const r = 4 + rnd() * 18;
      x.beginPath();
      if (i % 3 === 0) x.ellipse(px, py, r, r * 0.5, rnd() * 3, 0, 7);
      else if (i % 3 === 1) {
        x.arc(px, py, r, 0, 6.3);
        x.lineWidth = 2;
        x.strokeStyle = cols[(i + 1) % 6];
        x.stroke();
      } else x.arc(px, py, r * 0.5, 0, 6.3);
      x.fill();
    }
    // The "paper": white, rotated 7 degrees, with text-like content
    x.save();
    x.translate(320, 240);
    x.rotate((7 * Math.PI) / 180);
    x.shadowColor = "rgba(0,0,0,0.35)";
    x.shadowBlur = 10;
    x.fillStyle = "#fbfaf6";
    x.fillRect(-130, -170, 260, 340);
    x.shadowBlur = 0;
    x.fillStyle = "#333";
    x.fillRect(-100, -150, 200, 14);
    for (let l = 0; l < 18; l++) x.fillRect(-105, -120 + l * 14, 60 + ((l * 37) % 140), 3);
    x.strokeStyle = "#444";
    x.lineWidth = 1.5;
    for (let b = 0; b < 6; b++) x.strokeRect(-100 + b * 33, 130, 14, 14);
    x.restore();
    return Array.from(x.getImageData(0, 0, 640, 480).data);
  });
  await browser.close();

  // RGBA -> I420 (BT.601)
  const y = Buffer.alloc(W * H);
  const u = Buffer.alloc((W * H) / 4);
  const v = Buffer.alloc((W * H) / 4);
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const p = (j * W + i) * 4;
      const [r, g, b] = [rgba[p], rgba[p + 1], rgba[p + 2]];
      y[j * W + i] = Math.max(16, Math.min(235, Math.round(0.257 * r + 0.504 * g + 0.098 * b + 16)));
    }
  }
  for (let j = 0; j < H; j += 2) {
    for (let i = 0; i < W; i += 2) {
      let r = 0, g = 0, b = 0;
      for (const [dj, di] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
        const p = ((j + dj) * W + i + di) * 4;
        r += rgba[p]; g += rgba[p + 1]; b += rgba[p + 2];
      }
      r /= 4; g /= 4; b /= 4;
      const q = (j / 2) * (W / 2) + i / 2;
      u[q] = Math.max(16, Math.min(240, Math.round(-0.148 * r - 0.291 * g + 0.439 * b + 128)));
      v[q] = Math.max(16, Math.min(240, Math.round(0.439 * r - 0.368 * g - 0.071 * b + 128)));
    }
  }
  const frame = Buffer.concat([Buffer.from("FRAME\n"), y, u, v]);
  const parts = [Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\n`)];
  for (let f = 0; f < 10; f++) parts.push(frame);
  writeFileSync(Y4M, Buffer.concat(parts));
  log(`scene.y4m written (${Buffer.concat(parts).length} bytes)`);
}

async function drive() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: "new",
    args: [
      "--no-sandbox",
      "--disable-gpu",
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-video-capture=${Y4M}`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${String(e).slice(0, 200)}`));
  let dbgCount = 0;
  page.on("console", (m) => {
    const t = m.text();
    if (t.includes("[cvdbg]") && dbgCount++ < 12) log(t);
    if (m.type() === "error" && !/favicon|net::ERR_ABORTED/i.test(t)) errors.push(t.slice(0, 200));
  });
  await page.setUserAgent(
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  );
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });

  // Chrome's y4m file-capture hangs headless — serve the scene from a canvas
  // captureStream instead, patched in before any app script runs.
  await page.evaluateOnNewDocument(() => {
    const draw = (x) => {
      x.fillStyle = "#e8ddc4";
      x.fillRect(0, 0, 640, 480);
      const cols = ["#a33327", "#c98a2d", "#7a6b3a", "#902f21", "#d4a548", "#5b6b41"];
      let seed = 42;
      const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
      for (let i = 0; i < 420; i++) {
        x.fillStyle = cols[i % cols.length];
        const px = rnd() * 640;
        const py = rnd() * 480;
        const r = 4 + rnd() * 18;
        x.beginPath();
        if (i % 3 === 0) x.ellipse(px, py, r, r * 0.5, rnd() * 3, 0, 7);
        else if (i % 3 === 1) {
          x.arc(px, py, r, 0, 6.3);
          x.lineWidth = 2;
          x.strokeStyle = cols[(i + 1) % 6];
          x.stroke();
        } else x.arc(px, py, r * 0.5, 0, 6.3);
        x.fill();
      }
      x.save();
      x.translate(320, 240);
      x.rotate((7 * Math.PI) / 180);
      x.shadowColor = "rgba(0,0,0,0.35)";
      x.shadowBlur = 10;
      x.fillStyle = "#fbfaf6";
      x.fillRect(-130, -170, 260, 340);
      x.shadowBlur = 0;
      x.fillStyle = "#333";
      x.fillRect(-100, -150, 200, 14);
      for (let l = 0; l < 18; l++) x.fillRect(-105, -120 + l * 14, 60 + ((l * 37) % 140), 3);
      x.strokeStyle = "#444";
      x.lineWidth = 1.5;
      for (let b = 0; b < 6; b++) x.strokeRect(-100 + b * 33, 130, 14, 14);
      x.restore();
    };
    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");
    draw(ctx);
    // Static canvases emit no frames; nudge a repaint so the stream flows.
    setInterval(() => draw(ctx), 100);
    const fakeStream = canvas.captureStream(30);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      if (constraints && constraints.video) return fakeStream.clone();
      throw new DOMException("no audio in fake", "NotFoundError");
    };
  });

  log("goto /scan");
  await page.goto(`${BASE}/scan`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => document.body.innerText.includes("Hold it up"), { timeout: 90000 });
  log("scan page rendered (mobile body)");

  const clickByText = async (text) =>
    page.evaluate((t) => {
      const els = [...document.querySelectorAll("button, a")];
      const el = els.find((e) => e.innerText.trim().toLowerCase().includes(t.toLowerCase()));
      if (el) el.click();
      return Boolean(el);
    }, text);

  // Isolated probe: does getUserMedia + play work at all in this context?
  const gumTest = await page.evaluate(async () => {
    const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error("TIMEOUT " + ms)), ms));
    try {
      const s = await Promise.race([
        navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment", width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        }),
        timeout(6000),
      ]);
      const v = document.createElement("video");
      v.muted = true;
      v.playsInline = true;
      v.srcObject = s;
      await Promise.race([v.play(), timeout(6000)]);
      const dims = `${v.videoWidth}x${v.videoHeight}`;
      s.getTracks().forEach((t) => t.stop());
      return `ok ${dims}`;
    } catch (e) {
      return "ERR " + String(e);
    }
  });
  log("getUserMedia probe:", gumTest);

  // First-visit gate: the "Tap to begin" audio-unlock overlay blocks the page.
  for (let i = 0; i < 10; i++) {
    if (await clickByText("Tap to begin")) {
      log("dismissed 'Tap to begin' overlay");
      break;
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  await new Promise((r) => setTimeout(r, 800));

  if (!(await clickByText("Start camera"))) throw new Error("Start camera button not found");
  log("camera starting; polling…");

  // If it hangs in "starting", dump media device state for diagnosis
  setTimeout(async () => {
    try {
      const devs = await page.evaluate(() =>
        navigator.mediaDevices.enumerateDevices().then((ds) => ds.map((d) => `${d.kind}:${d.label}`)),
      );
      log("mediaDevices:", JSON.stringify(devs));
    } catch {}
  }, 8000);

  let sawPolygon = false;
  let liveShot = false;
  let lastGuidance = "";
  const t0 = Date.now();
  while (Date.now() - t0 < 60000) {
    const state = await page.evaluate(() => ({
      heading: document.querySelector("h1")?.innerText ?? "",
      hasPolygon: Boolean(document.querySelector("svg polygon")),
      body: document.body.innerText,
    }));
    const guidLine = state.body.split("\n").find((l) =>
      /Hold|Move|Bring|Tilt|Captured|Here|couldn|Camera is on/i.test(l),
    );
    if (guidLine && guidLine !== lastGuidance) {
      lastGuidance = guidLine;
      log(`guidance: "${guidLine}"`);
    }
    if (state.hasPolygon && !sawPolygon) {
      sawPolygon = true;
      log("LIVE OUTLINE VISIBLE");
    }
    if (state.hasPolygon && !liveShot) {
      liveShot = true;
      await page.screenshot({ path: `${SCRATCH}/live-outline.png` });
    }
    if (state.heading.includes("Check & adjust")) {
      log("CONFIRM SCREEN reached");
      break;
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  const confirm = await page.evaluate(() => document.body.innerText);
  await page.screenshot({ path: `${SCRATCH}/confirm.png` });
  const verdictLine = confirm.split("\n").find((l) => /Here's your scan/i.test(l));
  log(`verdict line: "${verdictLine ?? "NOT FOUND"}"`);
  if (!confirm.includes("Check & adjust")) {
    log("FAIL: never reached confirm. Last page text:");
    console.log(confirm.slice(0, 800));
    console.log("console errors:", errors);
    await browser.close();
    process.exit(1);
  }

  // Probe 1: adjust-corners mode renders raw image + 4 handles
  await clickByText("Adjust corners");
  await new Promise((r) => setTimeout(r, 600));
  const handles = await page.$$eval("button[aria-label^='Adjust corner']", (els) => els.length);
  const adjHasImg = await page.evaluate(() => Boolean(document.querySelector("img[alt*='Original photo']")));
  log(`adjust mode: handles=${handles} rawImage=${adjHasImg}`);
  await page.screenshot({ path: `${SCRATCH}/adjust.png` });
  await clickByText("Done adjusting");
  await new Promise((r) => setTimeout(r, 800));

  // Probe 2: retake returns to live camera, then manual shutter capture
  await clickByText("Retake photo");
  await page.waitForFunction(() => document.body.innerText.includes("Hold it up"), { timeout: 20000 });
  log("retake returned to live viewfinder");
  await new Promise((r) => setTimeout(r, 4000));
  await page.evaluate(() => document.querySelector("button[aria-label='Capture now']")?.click());
  try {
    await page.waitForFunction(() => document.body.innerText.includes("Check & adjust"), { timeout: 15000 });
    log("manual shutter capture reached confirm");
  } catch {
    log("WARN: manual shutter did not reach confirm within 15s");
  }
  await page.screenshot({ path: `${SCRATCH}/confirm2.png` });

  console.log("\nconsole errors during run:", errors.length ? errors : "(none)");
  await browser.close();
}

if (!existsSync(Y4M) || process.argv.includes("--regen")) await makeSceneY4m();
await drive();
log("done");
