# Swaram — UI Revamp Brief (for Antigravity)

**Task type:** UI/UX revamp of an existing Next.js app. **Presentation only** — do NOT change the
voice / AI / OCR / PDF behaviour. Make the interface cohesive, premium, and unmistakably a **voice
assistant** (not a SaaS dashboard), fix the visual bugs, and make the mobile experience proper.

Work methodically, screen by screen. Keep the app building and the tests green the whole way.

---

## 1. Mission

Swaram is a voice-first assistant that fills forms for blind / low-vision users in India: upload or
photograph a form → it reads each field aloud, asks one question at a time (push-to-talk), confirms
the answer, and writes it back into the PDF. The **logic works**; the **UI is inconsistent, buggy,
and feels like an admin dashboard**. Revamp the presentation layer so it feels like one calm,
premium voice assistant, fix the concrete bugs below, and make it fully responsive on mobile.

The intended visual/UX language (palette, the "voice orb" identity, the call-screen feel, per-screen
content) is specified in **`prompts_chat.md` → §0 Shared Design System** and the per-page sections.
**Read `prompts_chat.md` first and follow it as the design spec.** This file is the *engineering*
contract for how to implement it safely.

---

## 2. Hard constraints — do NOT break these

**Do not modify the behaviour or exported signatures of the logic layer.** You may *call* and
*re-style around* them, but their function and API must stay identical:
- `lib/voice/*` — `textToSpeech.ts`, `speechToText.ts`, `pushToTalk.ts`, `groqSTT.ts`,
  `whisperSTT.ts`, `whisperWorker.ts`, `llm.ts`, `transcriptFormat.ts`, `fillCommands.ts`,
  `voiceSettings.ts`, `micManager.ts`, `modelManager.ts`, `earcons.ts`, `vadCapture.ts`
- `lib/analysis/*`, `lib/pdf/*`, `lib/ocr/*`, `lib/vision/*`, `lib/matching/*`, `lib/storage/*`
- `app/api/*` (transcribe, chat)

**Preserve all voice wiring exactly** (re-style the components that use it, don't rip it out):
- The `useVoice()` / `useVoicePage()` context and everything it exposes (`sttState`, `micMode`,
  `wakeMic`, `registerPageTranscriptListener`, `messages`, `addMessage`, `micVolume`, `ttsActive`,
  `toast`, `setPage`, `announce`).
- `addTranscriptListener` / `removeTranscriptListener` usage in the fill page.
- Push-to-talk: hold **Space** to talk / hold or tap the orb; release to send. Continuous mode
  as a setting. The fill-loop phases: `loading | start | asking | listening | confirming | typing |
  paused | done`.
- The SetupOverlay gating (`isSetupComplete` / `markSetupComplete`) and mic-permission persistence.

**Preserve the debug/e2e hooks** (tests depend on them): `window.__swaramTTS`, `window.__swaramSTT`,
`window.__swaramPTT`, and the seeded-form/IndexedDB shape used by `scripts/e2e.mjs`.

**Keep it green** after every screen and at the end:
- `npx tsc --noEmit` clean, `npm run build` succeeds.
- `npx tsx scripts/smoke.test.ts` → "ALL CHECKS PASSED".
- Prod server on `:3111` (`npm run start -- -p 3111`) then `node scripts/e2e.mjs` → "E2E PASSED".
- No new console errors in the browser.

---

## 3. Stack

Next.js 16 (App Router, Turbopack), React 19, TypeScript, **Tailwind CSS v4** (`@import
"tailwindcss"` in `app/globals.css`, tokens via `@theme inline`), `framer-motion@12`,
`lucide-react`, fonts via `next/font` (Geist + Fraunces). Client components use `"use client"`.

---

## 4. Concrete bugs to fix (verified in the codebase)

1. **Broken icon sizes (the "SVG bugs").** ~55 uses of Tailwind sizes that don't exist in the v4
   default scale: `h-4.5 w-4.5`, `h-5.5 w-5.5`, `h-6.5 w-6.5`, `h-8.5 w-8.5` (note: `.5`/`1.5`/
   `2.5`/`3.5` DO exist, but `4.5/5.5/6.5/8.5` do NOT). These emit no width/height, so icons
   collapse or render at intrinsic size. **Fix:** replace every one with a valid size (`h-4 w-4`,
   `h-5 w-5`, `h-6 w-6`, `h-8 w-8`, `h-9 w-9`) OR extend the spacing scale in `@theme`. Audit every
   icon/svg and give it an explicit valid size + `aria-hidden` (or a label).
2. **Two icon systems.** Pages import from `lucide-react`; `components/GlobalVoice.tsx` imports the
   custom inline set in `components/icons.tsx`. Standardise on ONE across the whole app (recommend
   the custom inline set for consistent stroke/weight and zero dependency risk, but you may
   standardise on lucide if cleaner). Remove the unused one.
3. **Suspect dependency.** `lucide-react` is pinned at `^1.23.0`, which is not a normal lucide
   version — verify every lucide icon import actually resolves and renders; if any are missing/
   broken, that's another source of SVG bugs. Fix the version or migrate off it (ties into #2).
4. **Animations.** `framer-motion` is used ad-hoc across 8 files AND `app/globals.css` has a global
   `main > *` "rise" keyframe — these can double-animate and cause jank/layout shift. Establish ONE
   coherent motion system: GPU-friendly transforms/opacity only, consistent durations/easings from
   tokens, and **full `prefers-reduced-motion` support** (disable non-essential motion). The voice
   orb and waveform must run smoothly (~60fps) and stay in sync with STT/TTS state.
5. **Duplicate / wandering mic controls.** The mic affordance appears in multiple places and sizes
   and moves between screens. Consolidate to **one** voice control, same component, same fixed
   position on every screen.
6. **SaaS dashboard shell.** Remove the persistent left sidebar ("WORKFLOW PROGRESS",
   "ACCOUNT & HISTORY"), the "Good evening, User" greeting header, and the marketing hero. Replace
   with the minimal voice-first shell (§5).
7. **Mobile is not proper.** The desktop shell is cramped/overflowing on phones. Build a real
   responsive mobile layout: fixed bottom voice control, one-focus screens, large type, safe-area
   insets (`env(safe-area-inset-*)`), no horizontal scroll, 56px+ thumb targets.
8. **Naming drift.** "Voice Guidance" / "Phase 2 — Voice Session" / "Voice Conversation" etc. — one
   consistent term and one assistant persona everywhere.

---

## 5. What to build

### 5.1 App shell (in `components/GlobalVoice.tsx` or a new `AppShell`)
- Minimal top bar: left = back / small context label; right = a compact menu (Home · My Forms ·
  Profile · Help) + light/dark toggle. **No sidebar, no greeting, no username banner.**
- Page content as a **centered stage** (max-width, generous padding), one focus per screen.
- **One fixed voice control** (bottom-center on mobile; a consistent anchored spot on desktop) that
  is present on task screens, driven by `sttState` / `pttActive` / `ttsActive`, showing the orb +
  one-line status ("Hold to talk" / "Listening…" / "Thinking…" / "Speaking").
- Responsive: desktop centered stage (optionally a calm secondary column for the fill transcript /
  review list); mobile single column with the fixed bottom control.

### 5.2 `VoiceOrb` component (single source of truth for the identity)
- One reusable component with 4 states — **idle / listening / thinking / speaking** — visually
  distinct by shape+motion (not colour alone), reacting to `micVolume` when listening and `ttsActive`
  when speaking. Use it on home, fill, setup, and the fixed control. Reduced-motion friendly.

### 5.3 Design tokens (`app/globals.css`, `@theme inline`)
- Light + dark palettes, type scale, radii, shadows, motion durations — all as tokens; components
  reference tokens only (no ad-hoc hex). One accent used sparingly (keep a refined version of the
  current teal, or switch per `prompts_chat.md` — but be consistent). Semantic colours always
  paired with icon + text.

### 5.4 Shared UI primitives
Consolidate the repeated patterns into consistent components: `Button` (primary/secondary/ghost/
danger), `Card`, `StatusChip` (answered / auto-filled / skipped / needs-attention / unclear / ready
/ complete — icon+label), `ProgressBar`, field/answer `Row`, and the setup progress rows. Replace
inconsistent one-off markup with these.

---

## 6. Per-screen acceptance (keep ALL existing functional content)

For each screen, match the layout/content in `prompts_chat.md`, keep every current feature and its
wiring, and pass the checks in §2.

- **First-run / SetupOverlay** (`components/SetupOverlay.tsx`): welcome + mic permission + one-time
  model setup (progress/ETA/retry, cloud-STT marks ready instantly) → auto-dismiss to home. Keep
  the ref-based dismiss + `markSetupComplete`.
- **Home** (`app/page.tsx`): orb "Ready", upload/scan actions, recent-forms strip, "try saying"
  hints. No hero, no greeting.
- **Import** (`app/upload/page.tsx`): drop zone + choose file + "say choose file → tap anywhere"
  affordance + progress + error state. Keep the `armPicker` tap-to-open flow.
- **Scan** (`app/scan/page.tsx`): camera viewport, framing brackets, spoken-guidance caption,
  auto/manual capture, upload fallback, tips. Keep the OpenCV guidance loop wiring.
- **Processing** (`app/processing/[formId]/page.tsx`): stage checklist + progress + AI-enhancement
  step + rich ready summary (fields / auto-fill / unclear) + start/preview. Keep the analyze + LLM
  enhance calls and the richer spoken summary.
- **Fill** (`app/fill/[formId]/page.tsx`) — the hero: implement ALL states (start, asking,
  listening, confirming, spell mode, single-choice, checkbox, unclear, typing fallback, paused,
  done), progress "N of M", field-type chip, auto-filled badge, heard echo, spelled-out confirm,
  command hint bar, and the conversation transcript (secondary column on desktop / collapsible on
  mobile). Keep `parseFillCommand`, `needsConfirmation`, spell mode, PTT, and phase logic intact.
- **Review** (`app/review/[formId]/page.tsx`): summary stat tiles, field list with status chips +
  inline edit, read-all-aloud, answer-skipped, finish. Keep edit/read/continue wiring.
- **Complete** (`app/complete/[formId]/page.tsx`): success + PDF preview + download/share/print +
  read-back + save-to-profile offer (IDs never saved). Keep export + profile-merge wiring.
- **Profile & Settings** (`app/profile/page.tsx`): saved details, voice (voice picker + preview,
  speed, listening language), TTS engine (system/AI/Google + download status), STT method
  (Groq/auto/whisper/native + Groq key field), listening mode (PTT/continuous), privacy note, cloud
  backup. Keep every setting bound to `voiceSettings` / `groqSTT` exactly.
- **My Forms** (`app/history/page.tsx`): form cards with status badges + open/continue/download/
  delete + empty state.
- **Overlays / states**: voice-command help, cloud-speech consent, mic-permission denied,
  no-fields-found, offline; plus the toast and the 4-state voice control. Reuse the existing
  `app/design-system/page.tsx` as a living components reference (update it to match).

---

## 7. Accessibility bar (non-negotiable — this is the audience)

WCAG AAA contrast; base body ≥18px and a large "current line" (desktop 40–52px / mobile 30–40px);
56px+ touch targets; visible thick focus rings; keep `StatusAnnouncer` / `aria-live` for spoken
status; status by icon + text + colour (never colour alone); `prefers-reduced-motion` respected;
proper `aria-label`s on the orb, mic control, and icon-only buttons; full keyboard operability
(Space = talk must not conflict with focus/scroll on inputs).

---

## 8. Process & verification

1. Establish tokens + `VoiceOrb` + the shell + shared primitives first, then migrate screens one by
   one. Delete the sidebar/greeting/hero as part of the shell step.
2. After **each** screen: `npx tsc --noEmit` and `npm run build` must pass; check the screen at a
   **390px** mobile viewport and a **1440px** desktop viewport, in **both** light and dark.
3. Do a global icon-size audit (fix all invalid `.5` sizes) and a motion audit (reduced-motion) as
   dedicated passes.
4. At the end, run the full gate: `tsc` clean, `build` clean, `smoke.test.ts` = ALL CHECKS PASSED,
   `e2e.mjs` = E2E PASSED (start prod server on :3111 first), zero console errors, and capture
   before/after screenshots of home, fill (asking + listening + confirming), review, and profile at
   both 390px and 1440px in both themes.
5. Keep changes scoped to components / pages / `globals.css` / `icons.tsx`. If you must touch a
   `lib/*` file, only adjust presentation-adjacent exports and never change behaviour or signatures.

**Definition of done:** one consistent voice-assistant UI (no dashboard chrome), a single fixed
voice control + unified `VoiceOrb` on every screen, all icons rendering at correct sizes with one
icon system, smooth reduced-motion-aware animations, a proper responsive mobile layout, all existing
features and voice wiring intact, and every check in §8.4 passing.
