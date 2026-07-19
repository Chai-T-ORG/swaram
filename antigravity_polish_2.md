# Swaram — Polish Pass 2: Fix the Regressions, Then Go to 10x

**Task type:** presentation-only. Pass 1 landed texture, motion, and warmth — good. It also
introduced regressions and left craft debt. This brief has two halves: **P0 fixes** (do these
first, they are review findings, not suggestions) and the **10x craft pass** (the last 10% that
separates "nice" from "designed"). Same constraints as `antigravity_polish.md` §1–2 — they all
still apply verbatim (frozen `lib/**`, voice contract, e2e anchors, real `<button>`s, reduced
motion, the green gate). Re-read that section before starting.

The reference mockup image (deep-green orb on cream, phone frames) is the visual north star for
the orb redraw — ask the user to attach it to this session if it isn't already.

---

## PART A — P0 fixes (review findings from the last pass)

### A1. The mobile privacy card lies — content error, fix first
`components/mobile/HomeMobile.tsx`: the "On-device privacy" card claims "no forms, audio, or
metadata ever leave this phone." **False** — the default speech path sends audio to cloud STT.
The product decision on record is: no claims the app can't keep. Replace the copy with the
honest version: *"Your forms are read and filled on this device. Voice uses a cloud service by
default — a fully offline mode is available in Settings."* Or delete the card. Also remove the
duplicate "Private by design" caption directly beneath it — privacy is stated once, honestly.

### A2. Free the desktop orb — it went back in a box
`components/desktop/HomeDesktop.tsx`: the orb + headline + waveform + two chip rows got wrapped
in one giant white card. That reverses the design thesis (the orb is a presence ON the paper,
not a widget IN a card) and pushes Upload/Scan below the fold. Restructure:
- No card around the stage. Orb sits directly on the grain, its ambient glow bleeding into the
  canvas (soft radial, no visible circular border).
- ONE headline. "Good evening." (Fraunces) with the listening line as its quiet sub-line —
  delete the second competing heading inside the stage.
- Upload / Scan cards visible without scrolling at 1440×900. Tighten vertical rhythm until the
  fold contains: greeting → orb → one chip strip → both action cards.

### A3. Redraw the orb core (`components/ui/VoiceOrb.tsx`)
The current core reads as a plastic button: tiny squashed waveform glyph, hairline halo ring.
Target (match the mockup):
- Core = layered radial gradients (light from upper-left: `--accent` → `--accent-hover` →
  `--accent-deep` at the rim), a soft specular hotspot, and a **waveform that scales with the
  core** (≥45% of core width, bars with rounded caps that idle at varied heights and dance with
  `volume` when listening / TTS pulse when speaking).
- Replace the outline-circle halo with cast light: a blurred radial glow behind the orb plus a
  soft elliptical green-tinted contact shadow *below* it, so it sits on the paper.
- Verify at all three sizes (`sm` in the tab bar/fab, `md`, `lg`) — the fab currently looks
  washed out; the sage gradient needs more depth at small sizes.

### A4. Kill the chip redundancy
- Desktop home: two stacked centered chip rows ("Try saying" + "Swaram voice commands") →
  **one** strip, max 3 quoted phrases, styled as speech (Fraunces italic or quoted, paper-slip
  scatter with ±1.5° rotation), clearly non-interactive (no button affordance).
- Mobile home: delete the "Swaram voice commands" card entirely — the tab bar directly below
  offers the same destinations. If a hint survives, it's one caption line under the greeting.

### A5. Small confusions
- Mobile Scan card: the unlabeled green circle on the right looks like an unwired toggle —
  remove it or replace with a chevron like the Upload card's affordance.
- Desktop grain: halve the opacity — it currently reads as dot-grid graph paper. Grain should
  be felt, not seen (≤1.5% light, ≤0.8% dark, off under `prefers-contrast: more`).

### A6. Fill preview performance (`components/desktop/FillDesktop.tsx`)
`generateFilledPdf` currently re-runs after **every** answer. Gate it: only regenerate when the
Form View pane is open, debounce ~800ms behind the last field change, and skip while
`phase === "asking" | "listening"` so PDF work never competes with the voice loop. Revoke old
object URLs (already done — keep it).

---

## PART B — The 10x craft pass

Work through these as audits across every screen, not one-off tweaks. After each screen,
screenshot at 390 (mobile UA) and 1440, light + dark, and ask: *"would a designer sign this?"*
If any element makes you hesitate, fix it before moving on.

### B1. Typography micro-tuning
- Fraunces: `font-optical-sizing: auto` everywhere it renders large; weight 560–620 for
  headlines, never 700+; letter-spacing −0.01em above 28px, 0 below.
- Numbers that count (Question 3 of 9, stat tiles, progress %): `font-variant-numeric:
  tabular-nums` so they don't jitter as they change.
- Real typography: curly quotes/apostrophes in ALL copy (’ not '), the em-dash pattern the
  brand already uses, no double spaces. Audit every string in the platform bodies.
- One type scale: audit for orphan sizes (text-[13px], text-[15px], text-[1.75rem]…) and
  collapse to a documented scale in the design-system page. No more than 7 sizes app-wide.

### B2. Spacing & optical alignment audit
- Everything on a 4px grid; kill one-off paddings (p-4.5 is fine, p-[18px] is not).
- Icons optically centered in their containers (chevrons sit 1px right of geometric center,
  play triangles 1px right — check every icon-in-circle).
- Consistent card anatomy: one padding for card headers, one gap between label→control,
  one section gap. Same physical rhythm on every screen.
- Buttons in a row share ONE height. Audit: several rows currently mix min-h-11/12/13.

### B3. Elevation system (not just shadows)
Define and apply three elevations consistently: canvas (grain), resting card (contact +
ambient shadow, 1px warm top-highlight), floating (docked pill, sheets, dialogs — deeper
ambient, slight scale). Border color must follow elevation too: resting = `--line`, floating =
`--line` at 60% + stronger shadow. No element invents its own shadow.

### B4. Motion vocabulary — finish it
- ALL enters get exits: chips, confirm blocks, typing forms, toasts, sheets — anything that
  `AnimatePresence`-enters must animate out, not pop away.
- Layout animation on lists: review rows, history cards, fields map — additions/removals
  settle with `layout` springs, no reflow jumps.
- Interruptibility: question-to-question transitions must never queue (mode="wait" is right;
  check rapid skip-skip-skip stays clean, no flicker).
- The docked VoiceControl pill and tab-bar orb: subtle idle presence (2–3px glow breathing) so
  the control never looks dead, and a clear press-down state (scale .97 + shadow collapse).
- One page-level choreography per screen max — audit for accumulated animation stacking from
  pass 1 (nothing should double-animate).

### B5. State completeness table
For EVERY interactive element verify all six: default / hover / active-press / focus-visible
(3px accent ring, 2px offset) / disabled (reduced opacity + no hover lift) / dark-mode
variants of all five. Sweep screen by screen; the design-system page gets a "States" section
proving each control.

### B6. Dark mode as its own design
- Glows: sage `#8FBF9B` at lower opacity than light mode's forest glow — dark glow spreads
  wider, dimmer.
- Shadows: near-black, larger blur, lower alpha; the 1px top-highlight becomes
  `rgba(255,255,255,.04)`.
- Check every pass-1 effect (flash frames, progress shimmer, ambient washes) on `#141311` —
  the white progress shimmer (`via-white/80`) is currently a light-mode value; use an
  ink-aware token.
- Status bar / theme-color already handled — verify the floating bars' translucency doesn't
  go muddy on dark.

### B7. Perceived performance
- Skeletons must match the final layout's exact geometry (no jump when content lands) —
  fill loading, history, review.
- Zero layout shift on: theme toggle, question transitions, chip appearance, tab switches.
- Any image (scan preview, PDF pane) gets explicit dimensions or aspect-ratio boxes.

### B8. Voice & copy final read
One editorial pass over every visible string, checking: verb-first buttons; the same action
never has two names across screens (Download/Filled PDF → pick one); sentence case everywhere
except the eyebrow style; no exclamation marks except the completion moment; empty states
always name the next action. The assistant speaks in first person, the interface never does
("I'll read it aloud" vs "Your forms").

### B9. Screen-specific final 10%
- **Home desktop:** after A2, the fold should feel like a foyer: greeting, breathing orb,
  two doors. Recent list only appears below the fold.
- **Fill desktop:** the three toggle buttons (Fields / Form View / Transcript) read as equal
  siblings but do different things — make them a segmented control group; active state
  visible. The stage card can lose its border entirely (elevation via shadow only).
- **Fill mobile:** verify the control row + fab + tab-bar-less layout leaves ≥24px clearance
  above the home indicator on iPhone (safe-area padding already there — visually confirm).
- **Review:** stat tiles should use tabular numbers and share exact heights; the finish bar's
  backdrop blur should not tint rows scrolling beneath it.
- **Complete:** the check-draw + bloom is the emotional peak — time it so TTS "your form is
  filled" lands during the bloom, not after (the speak call exists; just don't delay the
  animation behind data work).
- **SetupOverlay:** first impression of the entire product — the orb here must be the A3
  redraw at its best, with the slowest, calmest breathing in the app.

---

## Method & gates (unchanged, non-negotiable)

One screen per change-set. After each: `npx tsc --noEmit` clean → visual check 390/1440 ×
light/dark × reduced-motion on/off. Full gate after Part A, after Fill, and at the end:
`npm run build` → `npm run start -- -p 3111` → `node scripts/e2e.mjs` → **E2E PASSED**, plus
`npx tsx scripts/smoke.test.ts` → **ALL CHECKS PASSED**. Zero new console errors. The fill
start button keeps the literal word "Start". If any gate goes red, stop and report — do not
work around it.

**Definition of done for this pass:** Part A findings all closed; every element passes the
six-state check; both themes feel intentionally designed; and nothing in the voice pipeline
changed behavior.
