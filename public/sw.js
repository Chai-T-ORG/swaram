/*
 * Swaram service worker.
 * Cache-first for the heavy on-device engines (tesseract worker/core/lang,
 * pdf.js worker) so repeat visits work offline; network-first for pages.
 */
// Bumped v1 -> v2 so the activate step purges the old cache, which had precached
// the (now-deleted) 2 MB icon.svg.
const CACHE = "swaram-v2";
// Caches to preserve on activate. The TTS clip cache (managed by
// lib/voice/textToSpeech.ts) is kept so spoken prompts survive updates; keep
// this in sync with TTS_CACHE_NAME there.
const KEEP_CACHES = [CACHE, "swaram-tts-v1"];
const ENGINE_PATHS = ["/tesseract/", "/pdf.worker.min.mjs"];

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP_CACHES.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const isONNX = url.pathname.endsWith(".onnx");
  
  if (url.origin !== self.location.origin && !isONNX) return; // never touch cross-origin unless it's an ONNX model file
  if (event.request.method !== "GET") return;

  const isEngineAsset =
    ENGINE_PATHS.some((p) => url.pathname.startsWith(p)) ||
    url.pathname.startsWith("/_next/static/") ||
    isONNX;

  if (isEngineAsset) {
    // Cache-first: these are large, versioned, and immutable.
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(event.request);
        if (hit) return hit;
        const response = await fetch(event.request);
        if (response.ok) cache.put(event.request, response.clone());
        return response;
      }),
    );
    return;
  }

  // Network-first with cache fallback for navigations.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request).then((hit) => hit ?? caches.match("/"))),
    );
  }
});
