---
name: verify
description: How to runtime-verify Swaram changes — gates, e2e, and the fake-camera scan simulator
---

# Verifying Swaram changes

## Standard gates (CI parity, not verification)
`npx tsc --noEmit` · `npm run build` · `npx tsx scripts/smoke.test.ts` ·
`node scripts/e2e.mjs` against `npm run start -- -p 3111` (e2e expects Chrome at
`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`).

## Scan flow — fake-camera simulator (no phone needed)
`node scripts/scan-sim.mjs` drives the REAL `/scan` page end-to-end against a dev
server on **localhost:3000**: it injects a `getUserMedia` override serving a
`canvas.captureStream()` scene (white form rotated 7° on a busy cream/paisley
background — deliberately the hard case), then walks: start camera → live outline
→ auto-capture → confirm verdict text → adjust-corners probe → retake → manual
shutter. Screenshots land in the script's `SCRATCH` dir (edit that constant per
session). Exit 1 + page dump if confirm is never reached.

Gotchas learned the hard way:
- Chrome's `--use-file-for-fake-video-capture` (y4m) **hangs getUserMedia in
  headless** — that's why the canvas-captureStream override exists. Don't go back
  to y4m.
- A first-visit "Tap to begin" overlay blocks the page; the script polls and
  dismisses it before starting the camera.
- Watch for a stray server squatting port 3000 (`lsof -nP -iTCP:3000`): an
  Antigravity test clone (`~/antigravity/Smart-PDF-Form-Filler`) has grabbed it
  before, causing "page couldn't load" and stale-code confusion.

## What still needs a human + phone
Real-world detection quality (lighting, glare, hand shake), TTS timing/overlap of
the guidance voice, torch, haptics, and the push-to-talk matrix (hold-Space,
hold-orb, tap-anywhere, continuous wake) after any voice-adjacent change.
