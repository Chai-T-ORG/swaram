/**
 * Server-side proxy to Groq's chat completions (OpenAI-compatible).
 *
 * The API key lives on the server (GROQ_API_KEY) and never reaches the client
 * bundle; for quick demos the client may pass a key via `x-groq-key`. Used for
 * natural-language command understanding and in-form assistance.
 *
 *   GET  /api/chat -> { available: boolean }
 *   POST /api/chat -> { messages, json?, temperature?, maxTokens? } -> { text }
 *
 * Prompts transit this server to Groq and are never stored or logged here.
 */
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
interface ChatBody {
  messages: ChatMessage[];
  json?: boolean;
  temperature?: number;
  maxTokens?: number;
  /** Use the small, low-latency model — for quick jobs like transcript cleanup. */
  fast?: boolean;
}

export async function GET() {
  return Response.json({ available: Boolean(process.env.GROQ_API_KEY) });
}

export async function POST(req: NextRequest) {
  const key = process.env.GROQ_API_KEY || req.headers.get("x-groq-key") || "";
  if (!key) return Response.json({ error: "no-key" }, { status: 400 });

  let body: ChatBody;
  try {
    body = (await req.json()) as ChatBody;
  } catch {
    return Response.json({ error: "bad-request" }, { status: 400 });
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: "no-messages" }, { status: 400 });
  }

  const model = body.fast
    ? process.env.GROQ_LLM_FAST_MODEL || "llama-3.1-8b-instant"
    : process.env.GROQ_LLM_MODEL || "llama-3.3-70b-versatile";

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: body.messages,
        temperature: body.temperature ?? 0.2,
        max_tokens: body.maxTokens ?? 512,
        ...(body.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return Response.json({ error: "groq", detail: detail.slice(0, 500) }, { status: 502 });
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return Response.json({ text: data.choices?.[0]?.message?.content?.trim() ?? "" });
  } catch (err) {
    return Response.json(
      { error: "network", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
