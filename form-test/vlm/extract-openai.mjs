// OpenAI vision extraction — A/B against Gemini. Same prompt, same output shape.
// Usage: OPENAI_MODEL=gpt-5.5 node extract-openai.mjs <filled|unfilled> <page>
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

function loadKey() {
  const env = readFileSync(resolve(ROOT, ".env.local"), "utf8");
  const m = env.match(/^OPENAI_API_KEY=(.+)$/m);
  if (!m) throw new Error("OPENAI_API_KEY not found in .env.local");
  return m[1].trim();
}

const MODEL = process.env.OPENAI_MODEL || "gpt-5.5";

// Reuse the exact Gemini prompt so the comparison is apples-to-apples.
function buildPrompt(page, total) {
  const src = readFileSync(resolve(__dirname, "extract.mjs"), "utf8");
  const body = src.match(/const PROMPT = \(\{ page, total \}\) => `([\s\S]*?)`;/)[1];
  return body.replace(/\$\{page\}/g, String(page)).replace(/\$\{total\}/g, String(total));
}

function parseLenientJson(raw) {
  const s = String(raw).trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try { return JSON.parse(s); } catch { /* repair */ }
  let inStr = false, esc = false; const stack = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { if (inStr) esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{" || ch === "[") stack.push(ch); else if (ch === "}" || ch === "]") stack.pop();
  }
  let fixed = s; if (inStr) fixed += '"'; fixed = fixed.replace(/,\s*$/, "");
  for (let i = stack.length - 1; i >= 0; i--) fixed += stack[i] === "{" ? "}" : "]";
  try { return JSON.parse(fixed); } catch { return null; }
}

export async function extractPageOpenAI(kind, page, total = 4) {
  const key = loadKey();
  const imgPath = resolve(__dirname, "pages", `${kind}-${page}.png`);
  const b64 = readFileSync(imgPath).toString("base64");

  const body = {
    model: MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildPrompt(page, total) },
          { type: "image_url", image_url: { url: `data:image/png;base64,${b64}`, detail: "high" } },
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 40000,
    // GPT-5's main speed lever: minimal/low/medium/high. Lower = faster.
    ...(process.env.OPENAI_REASONING ? { reasoning_effort: process.env.OPENAI_REASONING } : {}),
  };

  const t0 = Date.now();
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const json = await res.json();
  const text = json.choices?.[0]?.message?.content ?? "";
  const parsed = parseLenientJson(text);
  if (!parsed) throw new Error("Non-JSON:\n" + text.slice(0, 500));
  return { fields: parsed.fields ?? [], usage: json.usage, ms: Date.now() - t0, model: json.model };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [kind = "filled", pageArg = "1"] = process.argv.slice(2);
  const { fields, usage, ms, model } = await extractPageOpenAI(kind, Number(pageArg), 4);
  console.error(`model=${model} ms=${ms} usage=${JSON.stringify(usage)} fields=${fields.length}`);
  console.log(JSON.stringify({ kind, page: Number(pageArg) - 1, fields }, null, 2));
}
