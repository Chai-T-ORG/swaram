# Swaram — Scan Revamp: A Real Scanner, Not a Video Tag

**The problem to solve:** the scan flow is a `<video>` with four decorative corner brackets.
It captures blind — the user never sees what was captured, can't fix a bad warp, can't
retake without re-scanning, and the framing guidance can disagree with what's on screen.
Enterprise scanners (Adobe Scan, Microsoft Lens, iOS Notes, Scanbot-class SDKs) all share
one shape: **live document outline → auto/manual capture → confirm screen (retake / adjust
corners / accept) → processing.** This pass builds that shape. Same frozen zones and gates
as `antigravity_polish.md` §1–2.

## 0. Library decisions — already researched, do not re-litigate

- **Do NOT add a scanning library.** Everything needed already exists in
  `lib/vision/shapeDetector.ts`: `detectCorners(canvas)` returns the four sheet corners,
  `warpPerspectiveCanvas(canvas, corners)` warps with *caller-supplied* corners,
  `checkDocumentInFrame` gives coverage/offset/sharpness. `jscanify` (the main OSS option)
  would duplicate this exact OpenCV pipeline and expects a global `cv` that conflicts with
  our `@techstark/opencv-js` CJS-shim loader. Only revisit jscanify if detection quality is
  demonstrably the blocker — its one unique feature is glare suppression.
- **Do NOT use `react-perspective-cropper` / `react-document-crop`** for the corner-adjust
  UI — stale (React 16-era peers, ~4 years unmaintained, breaks on React 19). Build the
  handles with pointer events + framer-motion (already installed).
- **Do NOT pull shadcn registry camera components** (`capture-photo` etc.) — they are thin
  getUserMedia wrappers in stock shadcn styling; ours is already better and on-brand. Use
  the existing brand classes (`btn-primary`, `card`, `eyebrow`, tokens) and lucide icons.
- Torch: `track.getCapabilities().torch` + `applyConstraints({ advanced: [{ torch }] })`.
  Android Chrome only — strictly feature-detected, button absent otherwise.

## 1. Frozen zones & gates (unchanged from polish briefs)

`lib/**` and `app/api/*` are read-only — the exports above are consumed from the UI layer,
never modified. `useVoicePage` contract untouched. E2e anchors intact (`input[type=file]`
on /upload, "fields detected" / "Full Name" / "Start" body text, clean route paths — the
confirm step is a **state inside /scan**, not a new route). All buttons are real
`<button>`s. Every animation has a reduced-motion variant. After each screen:
`npx tsc --noEmit`, `npm run build`, `npx tsx scripts/smoke.test.ts`,
`node scripts/e2e.mjs` against `npm run start -- -p 3111` — all green.

## 2. The new state machine (`components/screens/useScanCapture.ts`)

`idle → starting → active → captured → confirm → (ingest | active)`

- `capture()` stops the loop, grabs the full-res frame, runs `detectCorners` +
  `warpPerspectiveCanvas`, then enters **`confirm`** holding: the raw canvas, the detected
  corners (or a sensible inset default when detection fails — never silently ship a raw
  skewed photo), and the warped preview. It does **not** ingest.
- `retake()` → back to `active`, guidance loop restarts, previous frame discarded.
- `accept()` → re-warp with the (possibly user-adjusted) corners at full resolution →
  JPEG 0.92 → existing `ingest()` unchanged.
- Voice commands while in `confirm`: `retake|scan again` → retake;
  `use it|looks good|continue|keep it` → accept. Spoken prompt on entering confirm:
  "Here's your scan. Say use it, or retake." Existing commands/guidance strings stay.

## 3. Live viewfinder (both platforms)

1. **Real document outline.** While `active`, each guidance tick also runs
   `detectCorners` on the probe canvas and renders an SVG `<polygon>` over the video —
   corners spring-animated (framer-motion; snap instantly under reduced motion), stroke
   `--accent` when `isDocumentDetected`, `--warn`-muted while hunting. This *replaces* the
   four fake brackets during `active`; brackets may remain only as the idle-state affordance.
   Scale probe coords → rendered box; account for `object-fit` cropping.
2. **Honest framing.** Mobile crops the stream (`object-cover`, 3:4) but probes the full
   sensor frame — so voice guidance can contradict the screen. Fix: crop the probe canvas
   to exactly the visible region before `checkDocumentInFrame`/`detectCorners`. Keep the
   full-bleed look.
3. **Auto-capture is announced, not a jump-scare.** When the quad locks (first good frame),
   render a progress ring filling around the shutter over the ~2-frame window with caption
   "Hold steady…". Auto-capture fires when the ring completes. Manual tap still wins.
4. **Shutter with states.** iOS-style 72px ring + inner disc: pressed scale, capturing =
   disabled + spinner, flash overlay + `navigator.vibrate?.(50)` on capture (skip flash
   under reduced motion — already handled, keep it).
5. **Torch + camera flip**, top corners of the viewport, 44px targets, feature-detected
   (`torch` capability; flip only when `enumerateDevices` shows >1 videoinput).
6. **Declutter.** "Use the camera app instead" and "Upload a file instead" collapse into
   one quiet text row under the viewport: "Prefer the camera app or a file? Upload instead"
   (the `capture` file input covers the camera-app path on mobile). One primary action
   per screen: the shutter.

## 4. Confirm state — the missing screen (in `ScanMobile` / `ScanDesktop`)

Full-height warped preview on `bg-ink`, then:

- **Corner adjust:** four draggable handles (44px hit target, 12px visual dot) on the *raw*
  frame shown small OR toggled via "Adjust corners" — dragging updates the quad polygon
  live; the expensive re-warp runs on pointer-up only. Magnifier loupe near the active
  handle is a stretch goal, not required.
- **Rotate 90°** button (pure canvas rotate before ingest).
- Actions: primary `Use this scan` (accept), secondary `Retake`. Mobile: primary full-width
  above the dock, safe-area aware. Desktop: right-aligned pair.
- If corner detection failed, confirm opens with the caption "I couldn't find the edges —
  drag the corners to the paper, or retake." (spoken too, once).
- StatusAnnouncer carries all state changes, as everywhere else.

## 5. Desktop scan hierarchy (`ScanDesktop.tsx`)

Webcams are the worst document scanner. Invert the priorities: a calm banner-card **above**
the viewport — "Best results: upload a photo or PDF → /upload" (btn-secondary, not shouting)
— then the camera as the secondary path with the same new viewfinder + confirm flow.
Delete the four-bullet tips card; fold the two useful tips ("avoid glare", "flat, all four
corners in frame") into the viewfinder caption line. Keep `aspect-video`/`object-contain`.

## 6. Processing page, small trust fix (`ProcessingMobile/Desktop` + `useProcessing`)

While analyzing, show a small thumbnail of what's being analyzed
(`getFile(formId, "original")` → object URL, revoke on unmount) beside the checklist —
the user should see *their paper* being read, not an abstract orb alone. Add a quiet
"Cancel" text link → home (no confirm dialog; analysis is idempotent and re-runnable).
Do not touch the pipeline, stages, or any spoken/status strings ("fields detected" is an
e2e anchor).

## 7. Manual test matrix (after gates pass — needs a human + phone)

Real paper on a real phone: quad tracks the sheet within ~1s; guidance matches what's
visible; auto-capture ring completes → confirm shows a straightened page; drag one corner
badly → warp follows on release; retake returns to live camera without stale frames; torch
toggles on Android; voice "retake" / "use it" work; whole flow with VoiceOver/TalkBack
announces state changes. Desktop: webcam flow works but upload banner reads as the
recommended path.
