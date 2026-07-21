/**
 * sarvam-ws-relay.mjs — WebSocket relay for Sarvam Saaras v3 streaming STT.
 *
 * Why this exists: browsers cannot set the api-subscription-key header on a
 * WebSocket connect, and Next.js route handlers cannot host raw WebSockets —
 * so this tiny standalone process bridges the two. It is a TRANSPARENT pipe:
 * the browser speaks the Sarvam streaming protocol end-to-end (JSON audio
 * frames in, JSON transcripts out); the relay only injects the auth header
 * and forwards the query string. No audio is stored or logged.
 *
 * Run:   node scripts/sarvam-ws-relay.mjs        (port 3001, path /stt)
 * Env:   SARVAM_API_KEY (or .env.local), SARVAM_RELAY_PORT
 * App:   set SARVAM_STREAM_RELAY_URL=ws://localhost:3001/stt in .env.local;
 *        the "sarvam-stream" STT provider discovers it via GET /api/transcribe
 *        and falls back to clip-based capture whenever the relay is absent.
 */
import { createServer } from "http";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function envKey(name) {
  if (process.env[name]) return process.env[name];
  try {
    const line = readFileSync(resolve(root, ".env.local"), "utf8")
      .split("\n")
      .find((l) => l.startsWith(name + "="));
    return line ? line.slice(name.length + 1).trim() : "";
  } catch {
    return "";
  }
}

const API_KEY = envKey("SARVAM_API_KEY");
if (!API_KEY) {
  console.error("[relay] SARVAM_API_KEY not found (env or .env.local)");
  process.exit(1);
}

const PORT = Number(process.env.SARVAM_RELAY_PORT || 3001);
const UPSTREAM = "wss://api.sarvam.ai/speech-to-text/ws";

const server = createServer((_req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ ok: true, service: "sarvam-ws-relay" }));
});
const wss = new WebSocketServer({ server, path: "/stt" });

wss.on("connection", (client, req) => {
  const query = req.url && req.url.includes("?") ? req.url.slice(req.url.indexOf("?")) : "";
  const upstream = new WebSocket(UPSTREAM + query, {
    headers: { "api-subscription-key": API_KEY },
  });
  console.log(`[relay] session open ${query}`);

  // Frames sent before the upstream handshake completes are buffered.
  const pending = [];
  upstream.on("open", () => {
    for (const msg of pending) upstream.send(msg);
    pending.length = 0;
  });

  client.on("message", (data) => {
    // ws delivers Buffers; Sarvam rejects binary frames — always forward as
    // text (the protocol is JSON with base64 audio inside).
    const text = data.toString();
    if (upstream.readyState === WebSocket.OPEN) upstream.send(text);
    else if (upstream.readyState === WebSocket.CONNECTING) pending.push(text);
  });
  upstream.on("message", (data) => {
    if (client.readyState === WebSocket.OPEN) client.send(data.toString());
  });

  const closeBoth = (why) => {
    console.log(`[relay] session closed (${why})`);
    try { client.close(); } catch {}
    try { upstream.close(); } catch {}
  };
  client.on("close", () => closeBoth("client"));
  client.on("error", (e) => closeBoth("client-error " + e.message));
  upstream.on("close", (code, reason) => closeBoth(`upstream ${code} ${reason}`));
  upstream.on("error", (e) => closeBoth("upstream-error " + e.message));
});

server.listen(PORT, () => {
  console.log(`[relay] sarvam-ws-relay listening on ws://localhost:${PORT}/stt -> ${UPSTREAM}`);
});
