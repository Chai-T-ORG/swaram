import { NextRequest, NextResponse } from "next/server";
import { buildExtractionPrompt } from "@/lib/analysis/vlmPrompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GEMINI_MODEL = process.env.VLM_MODEL || "gemini-flash-latest";
const OPENAI_MODEL = process.env.OPENAI_VLM_MODEL || "gpt-5.5";
// GPT-5's speed lever: 'low' keeps bounding-box quality at ~half the latency.
const OPENAI_REASONING = process.env.OPENAI_REASONING || "low";
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

/** openai when explicitly set or when only its key exists; otherwise gemini. */
function selectProvider(): "openai" | "gemini" {
  const p = (process.env.VLM_PROVIDER || "").toLowerCase();
  if (p === "openai" || p === "gemini") return p;
  return process.env.OPENAI_API_KEY ? "openai" : "gemini";
}

function error(message: string, status: number, details?: string) {
  return NextResponse.json({ error: message, ...(details ? { details } : {}) }, { status });
}

/**
 * Parse the model's JSON, tolerating the occasional truncated response (both
 * Gemini and OpenAI sometimes stop with the final brace(s) missing). On a
 * strict-parse failure we close unbalanced strings/brackets and retry, so a
 * page with one dropped closer still yields its earlier fields. Null only when
 * nothing is recoverable.
 */
function parseLenientJson(raw: string): { fields?: unknown } | null {
  const s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  try {
    return JSON.parse(s);
  } catch {
    // fall through to repair
  }
  let inStr = false;
  let esc = false;
  const stack: string[] = [];
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (esc) { esc = false; continue; }
    if (ch === "\\") { if (inStr) esc = true; continue; }
    if (ch === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }
  let fixed = s;
  if (inStr) fixed += '"';
  fixed = fixed.replace(/,\s*$/, "");
  for (let i = stack.length - 1; i >= 0; i--) fixed += stack[i] === "{" ? "}" : "]";
  try {
    return JSON.parse(fixed);
  } catch {
    return null;
  }
}

type ModelResult = { ok: true; modelText: string } | { ok: false; status: number; detail: string };

/** POST with a short retry for transient 5xx/network only. A 429 (rate-limit or
 *  exhausted quota) is NOT retried — fail fast so the client falls back. */
async function fetchWithRetry(url: string, init: RequestInit): Promise<{ ok: boolean; status: number; text: string }> {
  let status = 0;
  let text = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    let res: Response | null = null;
    try {
      res = await fetch(url, init);
    } catch (cause) {
      text = String(cause);
    }
    if (res) {
      status = res.status;
      const bodyText = await res.text();
      if (res.ok) return { ok: true, status, text: bodyText };
      text = bodyText.slice(0, 300);
    }
    const transient = !res || res.status >= 500;
    if (transient && attempt < 2) {
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
      continue;
    }
    break;
  }
  return { ok: false, status, text };
}

async function callGemini(b64: string, mime: string, page: number, total: number, key: string): Promise<ModelResult> {
  const body = {
    contents: [{ parts: [{ inline_data: { mime_type: mime, data: b64 } }, { text: buildExtractionPrompt(page, total) }] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json", maxOutputTokens: 40000 },
  };
  const r = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${key}`,
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) },
  );
  if (!r.ok) return { ok: false, status: r.status, detail: r.text };
  try {
    const json = JSON.parse(r.text) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    return { ok: true, modelText: json.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") ?? "" };
  } catch {
    return { ok: false, status: 502, detail: r.text.slice(0, 300) };
  }
}

async function callOpenAI(b64: string, mime: string, page: number, total: number, key: string): Promise<ModelResult> {
  const body = {
    model: OPENAI_MODEL,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildExtractionPrompt(page, total) },
          { type: "image_url", image_url: { url: `data:${mime};base64,${b64}`, detail: "high" } },
        ],
      },
    ],
    response_format: { type: "json_object" },
    max_completion_tokens: 40000,
    reasoning_effort: OPENAI_REASONING,
  };
  const r = await fetchWithRetry("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) return { ok: false, status: r.status, detail: r.text };
  try {
    const json = JSON.parse(r.text) as { choices?: { message?: { content?: string } }[] };
    return { ok: true, modelText: json.choices?.[0]?.message?.content ?? "" };
  } catch {
    return { ok: false, status: 502, detail: r.text.slice(0, 300) };
  }
}

/**
 * One grounded vision pass over a single rendered form page. The browser posts
 * a PNG; we call the selected provider (OpenAI gpt-5.5 or Gemini) and return the
 * raw field schema (bboxes in 0-1000 [ymin,xmin,ymax,xmax]). The client renders
 * pages in parallel; lib/analysis/vlmAdapter.ts turns this into FormField[].
 */
export async function POST(request: NextRequest) {
  const provider = selectProvider();
  const key = provider === "openai" ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY;
  if (!key) return error(`VLM analysis is not configured (${provider})`, 503);

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error("Expected multipart/form-data with an image", 400);
  }

  const image = form.get("image");
  const page = Number(form.get("page") ?? 1);
  const total = Number(form.get("total") ?? 1);
  if (!(image instanceof File)) return error("An image file is required", 400);
  if (image.size === 0 || image.size > MAX_IMAGE_BYTES) return error("Image must be 1 byte to 12 MB", 400);

  const b64 = Buffer.from(await image.arrayBuffer()).toString("base64");
  const mime = image.type || "image/png";

  const result =
    provider === "openai"
      ? await callOpenAI(b64, mime, page, total, key)
      : await callGemini(b64, mime, page, total, key);

  if (!result.ok) {
    // 429 -> 503 so the client treats it as "service unavailable, use fallback".
    return error("VLM extraction unavailable", result.status === 429 ? 503 : 502, result.detail);
  }

  // Lenient parse recovers a truncated page's earlier fields. Only give up —
  // and let the client fall back — when nothing at all is usable.
  const parsed = parseLenientJson(result.modelText);
  if (!parsed || !Array.isArray(parsed.fields)) {
    return error("VLM returned unusable output", 502, result.modelText.slice(0, 200));
  }
  return NextResponse.json({ page: page - 1, fields: parsed.fields });
}
