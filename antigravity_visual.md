# Swaram — Pass 4: The Atmosphere Pass (Living Light on Paper)

**The problem:** the app is composed and calm but visually *flat* — one green, flat cream,
flat white cards. Serious AI products don't get richness from more widgets; they get it from
**light**. Gemini's design language builds everything from gradient *energy* (sharp leading
edge, diffuse tail, motion = thinking) contained in circles, with blur creating an
"in-between" layer. Awwwards winners pair exactly one immersive signature with restrained
everything-else, and lean on type-in-motion. Swaram will do the same with CSS only — no
WebGL, no libraries.

Same frozen zones and gates as `antigravity_polish.md` §1–2. All previous passes' rules
(composition laws, honesty of copy, one focal point) still bind. This pass adds ONE new
system: atmosphere.

---

## 1. Expand the palette: a green *spectrum* + one warm counterpoint

One flat forest green cannot carry atmosphere. Add gradient-only tokens to `app/globals.css`
(these are for light effects ONLY — buttons/text/chips keep using the existing tokens):

```css
/* Light mode */
--aurora-forest:  #1E5138;   /* anchor — existing accent */
--aurora-emerald: #2E7D57;   /* mid energy */
--aurora-mint:    #9FD8B4;   /* light edge */
--aurora-gold:    #E8B04B;   /* marigold — the warm counterpoint, tiny doses only */
/* Dark mode: same hues, −20% saturation, glows wider and dimmer */
```

**Marigold rules:** it appears ONLY inside aurora fields, the listening ripple, and the
specular hint on the orb — never on buttons, text, or borders. It is warmth in the light,
not a second brand color.

## 2. The AuroraField — one component, every screen's atmosphere

New `components/ui/AuroraField.tsx` (client, presentational): a fixed, pointer-events-none
layer of 3–4 huge blurred radial blobs (300–600px, `blur(80–120px)`, opacity 0.10–0.22 light
/ 0.14–0.28 dark) in the aurora tokens, biased toward the top-center of the screen where the
orb/stage lives, fading to nothing by mid-viewport. Slow drift: each blob animates position
±4% and scale ±6% on 18–30s offset loops (CSS keyframes, `will-change: transform`, no JS
per-frame work).

**It listens.** Accept a `mood` prop: `"idle" | "listening" | "thinking" | "speaking"` —
shells/screens pass it from `useVoice()` state (read-only; no engine changes):
- idle: slow drift, low opacity
- listening: blobs tighten toward the orb, +30% opacity, mint edge sharpens (Gemini's
  "concentrated" state)
- thinking: slow rotation of the whole field (`conic` hue drift)
- speaking: gentle opacity breathing synced to the existing TTS pulse rhythm

Mount it in both shells behind `<main>` (replaces `.ambient-grid`'s wash), and in the fill
bodies' stage. Reduced motion: static field, no drift. `prefers-contrast: more`: hidden.

## 3. Depth hierarchy: glass over light

With light behind them, surfaces must let it through — that's what makes the current flat
white cards feel dead. Introduce a `.glass-raised` treatment (blur 16–24px, background
`color-mix(in oklab, var(--raised) 72%, transparent)`, existing border + top-highlight) and
apply it to: the floating top bars, the docked VoiceControl pill, the mobile tab bar, sheets
and dialogs — the *floating* elevation tier only. Resting cards stay opaque (`--raised`) for
readability; they sit ON the paper, glass floats ABOVE the light. Never put body text over
an unblurred aurora area.

## 4. The orb becomes energy (Gemini-grade)

`components/ui/VoiceOrb.tsx` — keep the sphere + soundwave, add the energy layer:
- Inside the core, a slow-rotating conic/mesh gradient (forest → emerald → hint of mint,
  8–14s) under the specular layer, so the sphere's surface is never a static gradient.
- Listening ripple, redesigned per Gemini: a ring with a **sharp leading edge and diffuse
  tail** (radial-gradient ring, hard stop on the outer edge, 40% fade inward) expanding once
  on state entry — with a whisper of `--aurora-gold` at the leading edge.
- Thinking: the internal conic speeds up ×2 — the energy visibly "works".

## 5. Type as a visual element

- Desktop display moments go genuinely display-size: home greeting and fill question at
  **clamp(2.5rem, 5vw, 4.25rem)** Fraunces; the current 40px reads timid at 1440.
- The fill question is the app's type-in-motion moment: per-word rise (word-level stagger,
  ~40ms, spring — NOT per-character gimmickry) as each question arrives. Reduced motion:
  simple fade.
- One italic Fraunces accent per screen maximum (the try-saying slips already are it on
  home; nothing else goes italic there).

## 6. Where each screen gets its atmosphere (and where it doesn't)

- **Home (both):** AuroraField behind greeting+orb zone. Doors/cards stay on clean paper.
- **Fill (both):** the hero of the pass — field behind the question stage, mood-driven; the
  conversation column and fields map stay quiet.
- **Processing:** thinking mood, tight around the orb.
- **Complete:** one-time bloom — the field flares (opacity ×1.5, 900ms, decays) as the check
  draws. Marigold allowed in the flare.
- **SetupOverlay:** idle mood at its calmest — first impression of the light.
- **Upload/Scan/Review/History/Profile:** minimal field (top 25% of viewport, idle only) —
  work surfaces, not stages.

## 7. Guardrails — atmosphere must cost nothing

- CSS keyframes only; no per-frame JS, no canvas, no WebGL, no new deps.
- Text contrast: every text block must still pass AA over its *actual* rendered background —
  test with the aurora at peak listening opacity.
- `prefers-reduced-motion`: no drift, no ripple, static low-opacity field.
  `prefers-contrast: more`: no aurora at all, opaque surfaces everywhere.
- Frame check: with the field animating, interaction (typing in fields, PTT hold) must show
  zero jank in a 4× CPU-throttled DevTools run on the fill screen.
- Blur layers capped: max 2 glass elements + 1 aurora field composited per screen.

## 8. Gates (unchanged, non-negotiable)

`npx tsc --noEmit` per screen; full `npm run build` → `npm run start -- -p 3111` →
`node scripts/e2e.mjs` (**E2E PASSED**) + `npx tsx scripts/smoke.test.ts` (**ALL CHECKS
PASSED**) after home, fill, and at the end. Fill start button keeps the word "Start". Real
`<button>`/`<a>` for everything interactive. Voice engine, hooks, lib/**, e2e script:
untouched. Stop and report on any red gate.

**Definition of done:** screenshot home and fill in both themes — if the light doesn't make
someone pause, the pass isn't done; if any text is harder to read than before, it went too
far. The target is atmosphere with AA contrast, 60fps, and zero behavior change.
