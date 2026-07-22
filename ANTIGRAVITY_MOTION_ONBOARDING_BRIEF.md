# Swaram: Global Motion and Onboarding Redesign Brief

## Mission

Completely elevate Swaram's interaction design through a cohesive, accessible global motion system and a redesigned first-run onboarding flow.

Swaram is a voice-first form assistant for blind and low-vision users. The product should feel calm, fluid, premium, tactile, and reassuring—like a thoughtful voice companion rather than a dashboard. This is a global interaction-quality upgrade, not simply a landing-page refresh.

## Repository and technical context

Inspect the implementation before editing. Important constraints:

- The stack is Next.js 16, React 19, and Tailwind CSS v4.
- `framer-motion` v12 is already installed and used throughout the app. Keep it as the sole global animation system; do **not** add Anime.js or another global animation package.
- Existing components include `SetupOverlay`, `VoiceOrb`, `VoiceControl`, desktop/mobile shells, `AuroraField`, and upload, scan, processing, preview, fill, review, complete, history, and profile screens.
- Preserve the warm cream / forest-green visual language, Fraunces display typography, light/dark themes, and existing voice, model-loading, and form-fill behavior.
- The desktop and mobile experiences are intentionally separate component trees. Tailor the behavior to each; do not merely scale one layout down.
- Swaram is accessibility-critical. Motion must explain state and never become a barrier.

## Motion-engine decision

Use the installed Framer Motion system globally. It already supports the React-native needs here: layout animation, gestures, springs, staggered variants, and exit animation.

Do not add Anime.js globally. It is appropriate only for a clearly isolated imperative/WAAPI timeline that Framer Motion cannot serve, which should not be necessary for this scope.

Kokonut UI is an optional source of compatible Tailwind/Motion interaction ideas—not a visual theme or a dependency to add wholesale. Swaram already has purpose-built systems for voice control, truthful processing/model progress, and file upload; preserve and improve those systems rather than replacing them with Kokonut UI's AI Voice, AI State Loading, or File Upload components.

The only potentially useful references are:

- Smooth Tab: compact shared-element transitions for onboarding steps or settings sections
- Spotlight Cards: restrained desktop-only focus/hover treatment for secondary action cards

If either is adopted, copy only the necessary interaction source through its shadcn CLI pattern and refactor it into Swaram's local components and design tokens. Do not introduce liquid-glass, high-motion, or generic AI aesthetics that conflict with Swaram.

## 1. Build a reusable global motion system

Consolidate timing, easing, spring configuration, stagger variants, and reduced-motion behavior into shared utilities. Improve or replace the existing motion helpers rather than scattering one-off values.

Use these motion tiers:

| Use | Typical duration |
| --- | --- |
| Immediate interaction feedback | 120–180ms |
| State changes and cards | 180–280ms |
| Page and step transitions | 250–350ms |
| Ambient effects | Slow, subtle, nonessential |

Rules:

- Prefer transforms and opacity. Avoid layout thrash, large animated blur/filter work, looping animated box shadows, and unnecessary re-renders.
- Use `AnimatePresence`, variants, `layout`, and `layoutId` deliberately.
- Respect `prefers-reduced-motion` globally: eliminate nonessential loops, parallax, character-by-character reveals, 3D tilt, and large spatial movement. Retain only brief opacity and state feedback where useful.
- Do not make hover the only feedback. Mobile, touch, keyboard, and screen-reader use must remain complete.
- Keep visible focus states and equivalent tap/keyboard feedback for every interactive element.
- Do not use confetti, bouncy card flips, cursor-chasing, fake "AI" effects, or animation that impairs reading.
- Ensure timers, animation controls, and event listeners clean up on unmount.

## 2. Apply motion consistently throughout the product

### Shell and navigation

- Add graceful, short route/screen transitions to both desktop and mobile shells. Maintain scroll position and avoid Next App Router exit-transition bugs.
- Give navigation active states a shared moving pill/highlight using `layoutId`; make the mobile tab bar and desktop navigation feel related.
- Improve dialogs, drawers, toast/status messages, buttons, cards, form rows, progress bars, list filtering, and reordering with consistent feedback.
- Animate hierarchy with a restrained stagger on the first meaningful arrival only; do not replay it on incidental state changes.

### Primary form workflow

- In upload/scan, improve Swaram's existing purpose-built upload and camera flow with clear drag, captured-file, accepted-file, error, and progress feedback. Do not replace it with a third-party upload component.
- Processing must continue to use Swaram's existing truthful staged progress and received results—not fake indefinite loading or a third-party loading component.
- In preview and review, animate list additions, removals, and edits with stable layout transitions that retain focus.
- In the fill flow, make the active question/field change especially clear: the outgoing question settles away, the next field arrives, progress updates smoothly, and confirmation/error feedback is unambiguous without cognitive overload.
- Completion should feel quietly successful, not celebratory or visually noisy.

### Voice as the visual center

- The existing `VoiceOrb` and `VoiceControl` must clearly distinguish idle, listening, thinking, speaking, paused, success, and error using subtle state-driven motion.
- Drive live voice response with motion values and composited properties where possible. Do not replace Swaram's semantics with a generic animated microphone.
- Keep all voice-state labels and status announcements accessible; motion supplements them rather than conveying essential information alone.

## 3. Replace first-run onboarding

Replace the current single "Tap to begin" setup overlay with a short, progressive, voice-first onboarding flow that earns trust before asking for access.

The onboarding should be a focused 3–4 step full-screen experience:

1. **Welcome** — Explain in one clear sentence that Swaram reads forms aloud and fills them by voice. Introduce the `VoiceOrb` with a calm, subtle arrival.
2. **Privacy and control** — State in plain language what stays on-device and that cloud voice is the default where applicable. Let users choose **Push-to-talk** (recommended/default) or **Hands-free**, with clear tradeoffs. Do not expose technical STT/TTS provider or model choices here; leave advanced choices in Profile settings.
3. **Enable microphone** — Explain why it is needed before requesting permission. Use the required browser-gate behavior below.
4. **First success** — Offer a lightweight optional test: tap/hold the orb and say a suggested phrase. If speech is unavailable or skipped, still make the user feel complete and take them to the home screen.

Use a simple semantic step indicator with a smooth shared transition inspired by Kokonut UI Smooth Tab. Support Back, Skip, keyboard navigation, `aria-live` updates, and screen-reader clarity.

Never auto-play long speech or surprise the user. Speech must follow the first direct user interaction.

### Required browser-gate behavior: audio activation and microphone permission

Audio output and microphone permission are separate browser gates and must be treated as such:

- Do not auto-play speech or request microphone access on mount.
- The first explicit **Enable voice** / **Let's begin** tap must synchronously call the existing audio-unlock routine before any awaited work. This preserves iOS/Safari and mobile-browser permission for later voice output.
- That same user gesture should initiate `getUserMedia` / microphone permission. The native browser permission dialog is unavoidable and must be anticipated in the UI: explain, “Your browser will now ask to use your microphone—choose Allow to speak with Swaram.”
- Treat the browser's **Allow** action as a separate step. While it is open, show an honest “Waiting for microphone permission” state; never imitate, obscure, or replace the native browser dialog.
- Only after permission resolves should Swaram speak its welcome/test line. Do not assume that the permission dialog itself unlocks audio.
- If permission is denied, unavailable, or dismissed, show clear recovery actions: **Try again**, **Continue without voice**, and a concise browser-settings hint. Users must still be able to upload, scan, and use typed controls.
- Preserve the existing `unlockAudioPlayback()` behavior and keep it in the direct click/tap handler—not after an async permission/download promise.
- Persist onboarding completion only when the user deliberately completes it or explicitly chooses the non-voice path. Do not re-prompt successful users.
- Add an accessible way to replay onboarding from Profile settings.

### Model downloads

- When an on-device TTS/STT model is specifically selected, show truthful download and warm-up progress inline as an optional enhancement—not an opaque blocker.
- Cloud and system defaults should proceed immediately.
- Reuse existing persistence, voice, model, fallback, and retry APIs where possible.
- Do not regress iOS audio unlocking, microphone fallback behavior, or model-download recovery.

## 4. Engineering and verification

- Reuse and extend existing components/tokens instead of duplicating UI logic.
- Do not change unrelated API behavior or add a component-library dependency unless truly needed.
- Keep semantic HTML, focus management, minimum target sizes, and accessible labels intact.
- Verify all work with the repository's lint and production build commands. Add focused tests where the project supports them.
- Finish by reporting changed files, the new motion rules, onboarding behavior, and verification results.
