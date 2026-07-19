# Swaram — Emotional Polish Pass (for Antigravity)

**Task type:** presentation-only polish of an already-rebuilt UI. The architecture, logic, and
screens are done and verified — your job is to make them *feel* designed by a person who cares,
not generated. Work micro-interaction by micro-interaction, screen by screen. Keep the app
building and the tests green the whole way.

---

## 1. What exists (do not re-architect)

The app was just overhauled. Read this map first; land your edits in these files only.

- **Brand tokens:** `app/globals.css` — cream `#FAF7F1` canvas, forest green `#1E5138` accent
  (sage `#8FBF9B` in dark), Fraunces serif via `--font-display`, Geist Sans/Mono. All colors go
  through tokens. Fonts wired in `app/layout.tsx`.
- **Two separate experiences:** every page in `app/**/page.tsx` is a thin switcher between
  `components/mobile/<Screen>Mobile.tsx` and `components/desktop/<Screen>Desktop.tsx`, chosen by
  `useDevice()` (`components/device/DeviceProvider.tsx`).
- **Voice engine (HANDS OFF):** `components/voice/VoiceProvider.tsx` — headless context. Public
  API (`useVoice`, `useVoicePage`) and internal `useVoiceShell()` must not change shape.
- **The one control:** `components/voice/VoiceControl.tsx` (variants `hero | docked | fab`) and
  the orb `components/ui/VoiceOrb.tsx`. Shells: `components/mobile/MobileShell.tsx`,
  `components/desktop/DesktopShell.tsx`, consent dialog `components/voice/ConsentDialog.tsx`.
- **Screen logic (HANDS OFF internals):** `components/screens/use*.ts` hooks — especially
  `useFillSession.ts`, a timing-sensitive verbatim lift. You may consume their return values;
  never reorder/rename/memoize what's inside.
- **Shared ui:** `components/ui/` (StatusChip, ConversationLog, FieldEditForm, VoiceOrb),
  `components/screens/FillParts.tsx` (SpellBubbles, TypedAnswerForm, FieldsMapList),
  `components/StatusAnnouncer.tsx` (role=status contract — restyle only).
- **Dev reference:** `app/design-system/page.tsx` — update it as you add primitives/motion so it
  stays the living catalog.

## 2. Hard constraints — break these and the work is rejected

- Zero changes to `lib/**`, `app/api/**`, `next.config.ts`, `scripts/**`, `public/sw.js`.
- Do not alter: the `VoiceContextValue` shape; `useFillSession`'s internals (phase machine,
  refs, transcript effect); PTT semantics (hold Space / hold-or-tap orb / tap-anywhere on touch,
  release to send); SetupOverlay's gating logic (`isSetupComplete`/`markSetupComplete`, the
  gesture order `unlockAudioPlayback()` → `initMic()`); localStorage keys (`swaram_conv_*`,
  `swaram_theme`); route paths.
- e2e anchors that must keep rendering: `input[type="file"]` on `/upload`; body text
  `fields detected` / `could not find any fillable fields` / `Something went wrong` on
  `/processing/[id]`; field labels (e.g. "Full Name") on `/review/[id]`; the literal word
  **Start** on the fill start button.
- Every new interactive element must be a real `<button>`/`<a>` — the touch tap-anywhere PTT
  ignores taps via the selector `a, button, input, textarea, select, label, [role="button"]`.
  A styled `<div onClick>` will hijack the microphone.
- **Every animation you add must respect `prefers-reduced-motion`** (use framer-motion's
  `useReducedMotion` or the CSS block already in `globals.css`).
- Keep green after every screen: `npx tsc --noEmit` · `npm run build` ·
  `npx tsx scripts/smoke.test.ts` (ALL CHECKS PASSED) · `npm run start -- -p 3111` +
  `node scripts/e2e.mjs` (E2E PASSED). No new console errors.

## 3. The diagnosis — why it currently reads "AI-generated"

Fix these specifically; this is the brief's core.

1. **Everything is centered and symmetrical.** Every screen is a centered column of evenly
   spaced cards. Nothing breaks the grid, nothing overlaps, nothing bleeds.
2. **Uniform rhythm.** Same gap, same radius, same padding everywhere. No compression/release —
   no tight cluster next to generous air.
3. **The orb is decoration, not a being.** It sits in a box. It doesn't cast light on the page,
   doesn't react when the app speaks, isn't the emotional center.
4. **Motion is generic.** `fade-in` and `slide-up` on mount, applied uniformly. No choreography
   (nothing enters *in order*), no physics personality, no reaction to sound.
5. **Copy is competent but voiceless.** "Upload a form", "Your form is ready" — correct,
   forgettable. Swaram is a companion helping someone through intimidating paperwork; the words
   never smile.
6. **No texture.** The cream canvas is a flat hex. Paper — the entire subject of this app — has
   tooth, fibers, ink. The UI has none.
7. **No celebrated moments.** Finishing a form (a big deal for this audience) gets a static
   check circle. Capturing a scan gets nothing. First launch gets a card.

## 4. The direction

**Register:** a calm, warm companion — the patient relative who sits beside you and fills the
form while you talk. Indian government paperwork made humane. Confidence without corporate
chill; warmth without cuteness. The serif (Fraunces) is *the assistant's voice on screen* — it
speaks; the sans is the silent interface.

**Signature:** the orb is alive. Everything else stays quiet so the orb can be the emotion.

## 5. The work

### 5.1 Make the orb a presence (`components/ui/VoiceOrb.tsx`, `VoiceControl.tsx`)
- **Ambient light:** the orb casts a soft radial green glow onto the canvas behind it
  (a blurred `--gradient-glow` halo that brightens while listening/speaking, dims when idle).
  On the fill screen the whole stage should subtly warm when Swaram speaks.
- **Breath, not loop:** idle should read as slow breathing (~4s in/out scale 1→1.015), with a
  tiny randomized drift so two glances never look identical.
- **Reaction:** on the transition into `listening`, one crisp ring ripples outward (single
  pulse, then settles) — synced to the moment, not looping. On `speaking`, the inner core's
  light flickers gently with the TTS pulse (already volume-driven — amplify the mapping).
- **Specular life:** the top-light highlight should shift 1–2px with state changes so the
  sphere feels lit, not printed.

### 5.2 Choreograph entrances (all screen bodies)
Replace uniform `animate-fade-in` with **ordered reveals** using framer-motion stagger:
orb first (scale 0.9→1, spring), then the display line (springs up 8px, 80ms later), then
supporting elements (60ms stagger). One orchestrated moment per screen, nothing else animates
on mount. Springs: `stiffness 260, damping 24` for small elements; softer for the orb.
Question-to-question on fill: the old question line slides up and out, the next one settles in
from below with a spring — a conversation turning, not a re-render. (Key the `<h2>` on
`currentField.id` with `AnimatePresence mode="wait"` — presentation only.)

### 5.3 Break the symmetry (layout passes)
- **Home desktop:** let the stage breathe asymmetrically — orb slightly above optical center;
  the try-saying chips scattered with slight rotation (−1.5°/0°/+1°) like paper slips, not a
  pill row. Recent list left-aligned under an off-center eyebrow.
- **Cards:** vary radius and weight by role — hero surfaces `--radius-xl`, list rows
  `--radius-md`, chips full. Action cards get an accent-tinted top edge or corner detail
  instead of four identical borders.
- **Rhythm:** tighten related clusters (label→control 6–8px), widen between sections (48–64px
  desktop). Kill the even `gap-7` column feel.

### 5.4 Texture & depth (`app/globals.css`)
- Add a barely-there paper grain to the cream canvas (inline SVG `feTurbulence` noise as a
  data-URI background, ~2–3% opacity, `background-attachment: fixed`; omit in dark mode or
  drop to 1%).
- Two-layer shadows on raised surfaces: a tight contact shadow + a soft ambient one (tokens
  already exist — tune `--shadow-card`/`--shadow-float` so cards sit ON the paper, not float
  in a void).
- A 1px warm top-highlight (`inset 0 1px 0 rgba(255,255,255,.6)`) on cards in light mode —
  the "coated stock" feel.

### 5.5 Give the words a voice (copy pass, all bodies)
Rewrite interface copy in Swaram's register — verb-first, first person, gentle:
- Home idle line: not "Hold to talk" alone — "I'm listening whenever you're ready." with the
  interaction hint as the sub-line.
- Empty forms list: "Nothing here yet — bring me a form and we'll fill it together."
- Processing: "Give me a moment — I'm reading every line so you don't have to."
- Completion: "Done. Your form is filled, checked, and ready to go."
- Buttons stay verb-first and stable through flows (Download → toast "Downloading").
- **Do not change spoken strings inside `components/screens/use*.ts` or anything in `lib/`**
  — visual copy only. Do not add offline/privacy claims beyond what exists.

### 5.6 Celebrate the moments
- **Complete screen:** the checkmark draws itself (SVG stroke-dashoffset, ~500ms, spring
  overshoot), the ok-circle blooms once, and a soft green radial wash rises behind the card.
  No confetti libraries; restraint is the brand. Screen-reader text unchanged.
- **Scan capture:** a white flash frame (120ms) + the captured frame settling into place with
  a slight scale-down, like a photo being taken.
- **Fill progress bar:** when it advances, a brief glow travels along the fill edge.
- **Tab bar (mobile):** active tab icon does a tiny spring pop (1→1.15→1); the orb slot lifts
  2px on any press.

### 5.7 Sweat the states (all interactive elements)
- Buttons: pressed = translate-y 1px + shadow collapse (physical push); hover = lift +
  shadow bloom (already partial — make it consistent everywhere).
- Focus: thick 3px accent ring with 2px offset on EVERY focusable — audit, not sample.
- Inputs: focused label warms to accent; a caret-colored underline grows in.
- Skeletons: the "Loading…" pulse texts become shaped placeholders (card-shaped shimmer in
  brand tones) on history/review/fill-loading.
- Dark mode: check every new effect at `#141311` — glows must be sage, shadows deeper, grain
  near-invisible.

### 5.8 Per-screen must-do list
- **HomeMobile / HomeDesktop** — choreographed entrance, chip scatter, ambient orb glow.
- **Upload both** — drop-zone border animates (dash offset marching) while dragging; the
  dashed zone breathes faintly when armed by voice.
- **Scan both** — corner brackets pulse toward accent when a document is detected (state
  already drives guidance text; mirror it visually); capture flash.
- **Processing both** — checklist items check off with a drawn tick + row settle; the orb
  "thinks" with the ambient glow slowly rotating.
- **Fill both (the hero)** — question transition choreography (5.2), speaking/listening stage
  wash (5.1), progress glow (5.6), SpellBubbles pop in staggered (20ms/letter, spring).
- **Review both** — rows cascade in (15ms stagger, cap at 12 then instant); edit form morphs
  open (height spring) instead of appearing.
- **Complete both** — the celebration (5.6).
- **SetupOverlay** — the welcome orb breathes; "Tap to begin" invites with a slow glow pulse.
- **design-system page** — add a "Motion" section demonstrating the entrance stagger, button
  press, check-draw, and celebrate states.

## 6. Method

One screen per commit-sized change. After each: `npx tsc --noEmit` + visual check at 390px
(mobile UA) and 1440px, light + dark, reduced-motion on and off. Full e2e after Upload, Fill,
and at the end. Centralize new motion values in `components/ui/motion.ts` (create it):
exported spring configs + stagger presets, all gated on `useReducedMotion` — no inline magic
numbers scattered through bodies.

**Definition of done:** someone opens the app and something *breathes* at them; every tap has
weight; finishing a form feels like an event; and nothing — not one interaction — broke:
tsc clean, build clean, smoke ALL CHECKS PASSED, e2e E2E PASSED, zero new console errors.
