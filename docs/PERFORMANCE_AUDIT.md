# Swaram — Performance Audit & Optimization Plan

_Static analysis of the Next.js 16 / React 19 app. Findings are ordered by impact-to-effort. Every item cites the file evidence it's based on. "Measured" numbers require a production build + Lighthouse/RUM; where a build wasn't run, the size is estimated from the source and dependency._

---

## TL;DR — the 6 things that matter most

| # | Culprit | Impact | Effort | Vercel lever |
|---|---------|--------|--------|--------------|
| 1 | **2 MB SVG favicon** injected into every page's `<head>` and precached by the service worker | Blocks/steals bandwidth on every fresh visit | 5 min | Image optim / just replace the file |
| 2 | **~9.7 MB of unreferenced hero/media images** shipped in `public/` (incl. a byte-for-byte duplicate) | Bloats every deploy; risks SW/CDN caching junk | 10 min | — (delete) |
| 3 | **Whole app is client-rendered** (63 of 74 files are `"use client"`); `VoiceProvider` + `framer-motion` + **both** mobile & desktop trees sit on every route's critical path | Large shared JS bundle, slow TTI on the landing screen | 1–2 days | Edge SSR / RSC / code-split |
| 4 | **No image pipeline** — 0 uses of `next/image`, raw `<img>`, no `images` config | No AVIF/WebP, no responsive sizes, no lazy-load | Half day | Vercel Image Optimization |
| 5 | **All 8 API routes are `runtime = "nodejs"`** — the pure fetch-proxies don't need it | Higher cold-start + latency, single-region | Half day | Edge Functions |
| 6 | **Blanket `public, s-maxage=60` on `/api/:path*`** + no `optimizePackageImports` + per-instance in-memory cache | Privacy/correctness risk on user data; missed CDN + tree-shaking wins | Half day | Edge caching / ISR |

---

## P0 — Ship-blocking, trivial to fix

### 1. The 2 MB SVG "icon" is on the hot path

- `public/icon.svg` and `app/icon0.svg` are **2,071,899 bytes each** — an SVG wrapper around a **base64-embedded 1024×1024 raster** plus RDF metadata (`head -c 300 public/icon.svg` shows the embedded-image envelope; `grep -c base64` = 1).
- `app/icon0.svg` is auto-injected into `<head>` on every route by Next's [metadata file convention](https://nextjs.org/docs/app/api-reference/file-conventions/metadata/app-icons). `app/layout.tsx:42` **also** lists `/icon.svg` in `metadata.icons`.
- `public/sw.js` **precaches it**: `ENGINE_PATHS = ["/tesseract/", "/pdf.worker.min.mjs", "/icon.svg"]` — so returning visitors also eat the 2 MB fetch, cache-first, forever.

**Fix:** regenerate the icon as a real vector or a small optimized PNG (a proper app icon is < 20 KB). Remove `/icon.svg` from `ENGINE_PATHS` in `public/sw.js`. Keep a single source of truth for the favicon. **Expected: ~2 MB → ~15 KB on first paint.**

### 2. ~9.7 MB of dead images in `public/`

`du` of the heavy files totals **9.7 MB**, and **none of them are referenced anywhere in `app/` or `components/`** (grep for `hero`, `media-`, `tip_illustration`, `hero-bg` finds only the file picker's `accept=".png"` strings — no `src`):

- `hero-2.png` 1.0 MB, `hero-bg.png` 608 KB, `hero-bg-full.png` 516 KB, `hero-1/3/4.jpg` ~285 KB each, `tip_illustration.png` 724 KB
- `media-1.png` and `media-3.png` are **981 KB each and byte-identical** (`md5sum` matches) — a literal duplicate.

These are leftovers from the `create-next-app` template / an old landing page. The only image actually used in the UI is `logo.png` (34 KB) via `<img src="/logo.png">` (DesktopShell, MobileShell, SetupOverlay, ProfileSections).

**Fix:** delete the unreferenced files. Also drop `public/next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg` if unused. **Shrinks the deploy and the SW's navigation-cache surface.**

---

## P1 — High impact on interactive performance

### 3. Everything is a Client Component; the shell drags heavy deps onto every route

- **63 of 74** files in `app/` + `components/` carry `"use client"`. `app/page.tsx` itself is `"use client"` and branches on `useDevice()` at runtime. There is effectively **no RSC/SSR payload** — the browser downloads and hydrates the whole app.
- **Both device trees are always bundled.** `AppShell.tsx` imports `MobileShell` *and* `DesktopShell`; `app/page.tsx` imports `HomeMobile` *and* `HomeDesktop`, then picks one at runtime. The device is already known server-side (`app/layout.tsx:69` reads `userAgent(headers())`), yet both code paths still ship to every client.
- **`framer-motion` is a static import in 20+ files**, including always-rendered shell chrome: `DesktopShell.tsx:16`, `SetupOverlay.tsx:4`, `VoiceControl.tsx:16`, `ConsentDialog.tsx:10`, plus `AuroraField`/`EdgeGlow`. So framer-motion (~a large animation runtime) is on the **critical path for every page**, used mostly for a nav pill and fade transitions.
- **`VoiceProvider` wraps the entire app in `layout.tsx:79` and statically imports the full voice stack** at module top: `textToSpeech`, `speechToText`, `whisperSTT`, `groqSTT`, `llm`, `azureStreamSTT`, `micManager`, `actionRegistry`, `pushToTalk`, `modelManager`, `intlCommands`, `earcons`, `haptics` (`VoiceProvider.tsx:28–71`). Even a user who never taps the mic downloads and parses all of it before the home screen is interactive.

**Fixes (in order of payoff):**
1. Make the shell chrome and static screens **Server Components** where they don't need browser APIs; push `"use client"` down to the smallest interactive leaves. The landing screen can be mostly RSC and stream from the edge.
2. **Render only the device tree the server already chose.** Since `layout.tsx` computes `initialDevice`, pass it down and `next/dynamic`-import just the matching shell/home tree (`{ ssr: true }`) instead of importing both.
3. **Lazy-load the animation layer.** Swap the eager `framer-motion` imports in shell chrome for `motion` via `next/dynamic`, or use the `LazyMotion` + `domAnimation` feature bundle so the full engine isn't in the entry chunk. Reduced-motion users (`useReducedMotion`) can skip it entirely.
4. **Defer the voice engine.** Keep `VoiceProvider`'s React context static, but move the STT/TTS/LLM module graph behind `import()` that fires on first mic intent / setup completion (a lot already is — `kokoro`, `whisper`, `vad`, `opencv`, `tesseract`, `azure-sdk` are dynamically imported — but the orchestration modules in `VoiceProvider.tsx:28–71` are still eager). This trims the shared entry chunk that gates the whole app.

### 4. No image optimization pipeline

- **0 uses of `next/image`**; 15 raw `<img>` tags; **no `images` block** in `next.config.ts`.
- Every image is served as-is: no AVIF/WebP negotiation, no `srcset`/responsive sizing, no automatic lazy-loading, no blur placeholder.

**Fix:** switch content images to `next/image` and enable modern formats:
```ts
// next.config.ts
images: {
  formats: ["image/avif", "image/webp"],
  // add remotePatterns if any images ever come from Supabase storage
},
```
On Vercel this routes through **Vercel Image Optimization** (per-device resizing + format negotiation at the edge, cached on the CDN). The 34 KB `logo.png` is minor, but any future content/hero imagery should go through this from day one.

### 5. Move the pure API proxies to the Edge runtime

All eight routes declare `export const runtime = "nodejs"` (`grep` across `app/api/**`). Several do **no Node-specific work** — they're thin `fetch` proxies using only Web APIs (`fetch`, `Request`, `Response.json`, `FormData`, `Blob`):

| Route | What it does | Edge-ready? |
|-------|--------------|-------------|
| `api/chat` | Proxy → Groq chat completions | ✅ pure `fetch` |
| `api/transliterate` | Proxy → Sarvam transliterate + Map cache | ✅ pure `fetch` |
| `api/speech/token` | Mint a short-lived speech token | ✅ likely |
| `api/sarvam/job` | Poll Sarvam job status | ✅ pure `fetch` |
| `api/transcribe` | Multi-provider STT orchestrator w/ circuit breakers, audio buffers | ⚠️ keep Node (large bodies, in-proc breaker state) |
| `api/sarvam/stream` | Uses `adm-zip` (Node) | ❌ keep Node |
| `api/tts` | Server Kokoro (`onnxruntime-node`) | ❌ keep Node |
| `api/vlm/extract` | 60 s VLM extraction | ❌ keep Node (`maxDuration = 60`) |

**Fix:** set `export const runtime = "edge"` on the four ✅ routes. Edge Functions have **near-zero cold starts** and run in the region closest to the user — a real latency win for the chat/intent-router and transliteration calls that happen inline during a voice turn. Also add `preconnect` hints to `api.groq.com` / `api.sarvam.ai` (none exist today) so the TLS handshake overlaps with the first request.

---

## P2 — Correctness + tuning

### 6. The blanket API cache header is risky and blunt

`next.config.ts:33–41` applies to **every** `/api/:path*` response:
```
Cache-Control: public, s-maxage=60, stale-while-revalidate=600
```
Problems:
- **`public` on user-specific responses.** `api/transcribe` returns a user's spoken words, `api/tts` returns synthesized audio, `api/chat` returns LLM replies to user prompts. Marking these `public` invites shared-cache (CDN/proxy) storage of per-user content. POSTs aren't cached by CDNs by default, but the header is still semantically wrong and applies to GETs too.
- **One TTL for everything.** A 60 s shared cache is meaningless for a streaming transcription and wrong for a token-minting endpoint.

**Fix:** remove the blanket rule and set `Cache-Control` **per route** in the handler:
- `api/chat` / `api/transcribe` / `api/tts` / `api/speech/token` → `private, no-store`.
- `api/transliterate` GET availability / stable lookups → `public, s-maxage=…, stale-while-revalidate=…` is fine (deterministic, non-personal).

### 7. Caching layers that aren't being used

- **`optimizePackageImports`** is not set. Add it for the barrel-heavy libs so only used symbols ship:
  ```ts
  experimental: { optimizePackageImports: ["lucide-react", "framer-motion"] }
  ```
  `lucide-react` is imported both as a barrel (`components/icons.tsx`) and directly (`ScanDesktop`, `ScanMobile`).
- **Transliterate's in-memory `Map` cache** (`transliterate/route.ts`) does **not** survive across serverless invocations or regions — most requests miss. Back it with **Vercel KV / Edge Config** (or Next's `unstable_cache`/`revalidateTag`) so a name is billed once globally, not once per warm instance.
- **ISR / RSC data caching:** static-ish screens (home, design-system) could be statically generated / streamed from the edge instead of fully client-rendered (ties into #3).
- **RUM:** no `@vercel/speed-insights` or `@vercel/analytics`. Add Speed Insights to get real Core Web Vitals (LCP/INP/CLS) from actual devices rather than guessing.

### 8. Smaller wins

- **Fonts:** three Google families loaded — `Geist`, `Geist_Mono`, `Fraunces` (with the `opsz` axis) in `layout.tsx:12–26`. `next/font` self-hosts and adds `display: swap` automatically, which is good, but confirm all three are actually used in the UI; Fraunces + a variable axis is the heaviest. Drop any unused family.
- **`ogl` (WebGL)** is pulled in via `components/Strands.tsx` → `components/ui/VoiceStrands.tsx`. Confirm the strands background is actually mounted; if it's only used on one screen, keep it behind `next/dynamic` so `ogl` isn't in shared JS.
- **`pdf-lib`** is a static import in `lib/analysis/sarvamApi.ts` → `analyzeForm` → `useProcessing.ts` (client). It's correctly confined to the `/processing/[formId]` route chunk, but consider `import()`-ing it at call time so it doesn't inflate that route's first load.
- **Add a bundle analyzer** (`@next/bundle-analyzer`) to CI so the entry-chunk size (the real number behind #3) is tracked and can't silently regress.

---

## Suggested sequencing

1. **Day 1 (quick wins, ~1–2 hrs):** #1 favicon, #2 delete dead images, #6 fix the API cache header, add `optimizePackageImports` + `images.formats`, add preconnects & Speed Insights. These are low-risk and immediately move LCP/bandwidth.
2. **Day 2:** #5 edge-ify the 4 pure proxies; #7 move transliterate cache to KV.
3. **Then (larger):** #3 render only the chosen device tree, lazy-load framer-motion, and defer the voice orchestration graph — measured against the bundle analyzer and Speed Insights.

_Recommend re-measuring with a production build + Lighthouse before and after #3 so the bundle reduction is quantified._
