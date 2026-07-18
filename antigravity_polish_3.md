# Swaram — Pass 3: Composition, Not Decoration

**The problem to solve:** the app now has the *features* of a designed product (texture, motion,
serif, glow) but not the *judgment*. It reads as student work because elements are evenly
distributed instead of composed, decorations float unattached, and some screens still carry
noise a designer would have deleted. This pass adds nothing new. It composes, deletes, and
finishes. Same frozen zones and gates as `antigravity_polish.md` §1–2 (lib/**, voice contract,
e2e anchors, real buttons, reduced motion, tsc/build/smoke/e2e green after each screen).

## 0. Already fixed in the working tree — do not revert
- `.ambient-grid` in `app/globals.css` no longer draws the dot grid (it was wallpaper). Only
  the body::before fractal grain at 1.2% remains. Keep it that way.
- The orb's contact shadow in `components/ui/VoiceOrb.tsx` now hugs the sphere's underside
  (it used to float 25px below as a detached smudge). Keep the new offsets.

## 1. The layout laws (apply to every screen, desktop and mobile)

1. **Proximity is meaning.** Elements that belong together sit ≤16px apart. Zones that don't
   belong together are separated by ≥56px. **Never** a page of equal gaps — that's the
   student tell. Audit every screen's vertical rhythm against this.
2. **One focal point per screen.** Exactly one element gets scale + color + motion (usually
   the orb, or the current question, or the success check). Everything else recedes: smaller,
   quieter, grayer. If two things compete, demote one.
3. **Nothing floats.** Every visual element must be visually attached to a group — a caption
   belongs to the thing above it, a shadow to its object, a chip strip to its context. Test:
   screenshot the screen, squint, and ask "does anything hover in space unattached?" If yes,
   attach it or delete it.
4. **Weight discipline.** Solid green fill is reserved for THE primary action of the screen
   (one per screen) — everywhere else use accent-soft/accent text. The top-nav active pill is
   currently solid dark green: change to `bg-accent-soft text-accent`.
5. **Decoration must earn its place.** If removing an element loses no information and no
   warmth, remove it.

## 2. Desktop home — exact target composition (`components/desktop/HomeDesktop.tsx`)

Restructure into **two zones with one break**:

**Zone 1 — the conversation (one tight cluster, internal gaps ≤20px):**
- "Good evening." (Fraunces, ~40px) with the live status line directly beneath (8px).
- Orb (VoiceControl hero) 24px below the greeting block.
- **Delete the horizontal waveform strip under the orb** in the hero variant of
  `components/voice/VoiceControl.tsx` — the orb's core soundwave already carries that job;
  the strip is an orphaned decoration.
- The three quoted try-saying slips 16px under the orb (they are things you *say to the orb*
  — they belong to it, not to the page).

**Break: ≥64px. Then Zone 2 — the doors:**
- Upload / Scan cards side by side. **Delete the PDF/PNG and CAMERA format chips** inside
  them — that's developer thinking; the subtitle already says what they accept.
- Below the cards, privacy as a **single caption line** (not a slab, no card, no icon tile):
  *"Your forms are read and filled on this device. Voice uses a cloud service by default —
  a fully offline mode is available in Settings."* This replaces the current desktop privacy
  card whose copy ("audio streams are processed only on this machine") is **false** — this is
  a content error, fix it exactly as written.
- Resume card (when present) opens Zone 2, above the doors. Recent list stays below the fold.

The whole of Zone 1 + Zone 2 (without recent) must fit 1440×900 with room to breathe at the
bottom — bias the composition upward.

## 3. Sweep every other screen with the same laws

For each, the focal point is: **Mobile home** — the greeting + doors (tab-bar orb is the
control; check the privacy card here reads as one calm block, not a slab with dead space).
**Upload** — the drop zone. **Scan** — the viewport. **Processing** — the orb + checklist as
ONE cluster (they're currently separate floats). **Fill** — the question line, nothing else
may compete. **Review** — the field list; stat tiles recede. **Complete** — the check.
**Profile/History** — the content list; headers tighten to their lists.

On each screen: fix the rhythm (law 1), demote competitors (law 2), attach or delete floaters
(law 3), enforce weight discipline (law 4). Screenshot at 390 + 1440, light + dark, after
each, and squint-test before moving on.

## 4. Gates (unchanged)

`npx tsc --noEmit` after every screen. Full `npm run build` → `npm run start -- -p 3111` →
`node scripts/e2e.mjs` (**E2E PASSED**) + `npx tsx scripts/smoke.test.ts` (**ALL CHECKS
PASSED**) after home, after fill, and at the end. The fill start button keeps the word
"Start". Every interactive element is a real `<button>`/`<a>`. Stop and report on any red
gate — never work around it.

**Definition of done:** every screen passes the squint test — one focal point, clustered
groups, nothing floating, nothing false, nothing that exists only to look designed.
