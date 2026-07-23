/**
 * Short-lived Azure Speech token broker.
 *
 * The browser Speech SDK needs credentials to open a streaming connection, but
 * the subscription key must never ship to the client. This route exchanges the
 * server-held key for a 10-minute STS token (safe to hand out) and caches it so
 * we don't mint one per request.
 *
 *   GET /api/speech/token -> { token, region } | { error }
 *
 * Returns 503 when no Azure key is configured, so the client cleanly falls back
 * to its non-streaming STT paths.
 */
// Pure fetch proxy (Web APIs only) — runs at the edge for low cold-start +
// region-local latency. The in-memory token cache is best-effort per isolate;
// on a miss we simply mint a fresh 10-minute token, which is cheap.
export const runtime = "edge";

interface CachedToken {
  token: string;
  region: string;
  expiresAt: number;
}
let cache: CachedToken | null = null;

// Tokens are valid for 10 minutes; refresh a minute early to be safe.
const TOKEN_TTL_MS = 9 * 60 * 1000;

export async function GET() {
  const key = process.env.AZURE_SPEECH_KEY;
  const region = process.env.AZURE_SPEECH_REGION || "centralindia";
  if (!key) {
    return Response.json({ error: "no-azure-key" }, { status: 503 });
  }

  if (cache && cache.expiresAt > Date.now() && cache.region === region) {
    return Response.json({ token: cache.token, region: cache.region });
  }

  try {
    const res = await fetch(
      `https://${region}.api.cognitive.microsoft.com/sts/v1.0/issueToken`,
      {
        method: "POST",
        // No Content-Length header: it's a forbidden request header in undici
        // (Node fetch) and setting it throws. An empty POST body is implicit.
        headers: { "Ocp-Apim-Subscription-Key": key },
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return Response.json(
        { error: "issue-token-" + res.status, detail: detail.slice(0, 200) },
        { status: 502 },
      );
    }
    const token = await res.text();
    cache = { token, region, expiresAt: Date.now() + TOKEN_TTL_MS };
    return Response.json({ token, region });
  } catch (err) {
    return Response.json(
      { error: "network", detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
