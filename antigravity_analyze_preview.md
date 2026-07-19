# Swaram — Pass: Preview Is a Workspace, Analysing Is a Reading

**The problem to solve:** the new `/preview` desktop screen is composed like a centered
blog article — a `max-w-6xl mx-auto` block floating in dead space — when its job is a
**workspace**: document evidence on one side, an editable checklist on the other, filling
the viewport like any split-pane verification tool. Its field rows are tall cards with a
loud labeled button repeated 36 times. And the processing screen is still an orb over a
list — the user's *document* never becomes the thing being visibly read. This pass
recomposes both. No new features, no new libraries. Same frozen zones and gates as
`antigravity_polish.md` §1–2.

## 0. Before anything: protect the uncommitted bugfix

The working tree contains an uncommitted crash fix in `PreviewDesktop.tsx`,
`PreviewMobile.tsx` (PdfPageCanvas now draws into a **React-owned `<canvas>`** — never
`innerHTML`/`appendChild`) and `usePreview.ts` (`renderPdfPage` in `useCallback`).
**First action: commit exactly these three files** as
`fix(preview): render PDF pages into React-owned canvas`, staged file-by-file. Never
reintroduce imperative DOM mutation inside React-managed containers — this caused a
Runtime NotFoundError (removeChild) crash. The rest of the dirty tree (lib/voice/*,
app/api/*, useFillSession.ts, scripts/*, transliterate files) is another workstream:
untouchable, as before.

## 1. Desktop preview → full-width workspace (`PreviewDesktop.tsx`)

1. **Kill the centering.** The screen fills the content area: a CSS grid
   `minmax(0,55fr) minmax(0,45fr)` (or equivalent) with ~24px gutters, no `max-w-*`,
   no `mx-auto`. On very wide screens cap at ~1800px but anchored left-ish, never a
   narrow floating column.
2. **Slim command bar on top, panes below.** One header band spanning both columns:
   eyebrow + "Check what I found" + the `{n} fields` subline on the left; `Start filling`
   (primary) and `Read fields aloud` (secondary) on the right. The panes begin under it.
   Remove the buttons from the list column.
3. **One message, not two.** The visible green status pill currently repeats the header
   subline. On this screen the initial info status must be aria-live only (sr-only);
   render a visible StatusAnnouncer pill solely for success/warning/error updates
   (saved / removed / undo / load failure).
4. **Checklist density.** Replace the 36 separate cards with **one card containing
   compact rows** (min-h-14, divider-separated — same pattern as the processing
   checklist): `{n}. {label}` + inline type/auto-fill/unclear chips; the spoken question
   stays as a quiet second line only when present. Actions become icon-only (pencil,
   trash) with aria-labels, visible on hover/focus-within/selected — not a labeled
   "Rename" button repeated 36 times. Whole row clicks to select; the icons
   stopPropagation. Keep the existing edit-in-place form on pencil.
5. **Selection is spatial.** Selecting a row scrolls the document pane to that field's
   box (`scrollIntoView` within the pane, `behavior: "smooth"`, instant under reduced
   motion); clicking a box scrolls the list to its row. Both directions must work.
6. Mobile preview only inherits the density fix (§1.4) and the message fix (§1.3) —
   its collapsible-document composition stays.

## 2. Analysing screen — the document being read (`Processing*` + `useProcessing`)

1. **Real thumbnail for PDFs too.** `useProcessing` renders page 1 via `loadPdfDocument`
   + `renderPageToCanvas` from `lib/pdf/pdfReader` (consume only — lib stays read-only)
   → data URL; images keep the object-URL path. The generic doc icon remains only as
   the error/missing fallback.
2. **The document is the hero while analyzing.** Desktop: one card, two columns — the
   page thumbnail (~260px wide) left with an animated scan-line sweeping over it (reuse
   the `.laser-line` treatment from /scan; static subtle glow under reduced motion),
   checklist right, orb shrinking to sit above the checklist, "Reading your form…" +
   the 20–40s line above it. Mobile: thumbnail (~140px, centered, scan-line) between
   the title and the checklist. Cancel link stays.
3. **Checklist keeps its exact stages, labels, and strings** — add only a slim
   determinate progress bar above it driven by `stage index / STAGE_ORDER length`
   (plus the existing OCR page/% detail). No fake motion, no invented percentages.
4. **Ready state gets evidence, not just claims.** Keep the headline (`{n} fields
   detected` — e2e anchor), keep the chip-buttons into /preview, keep both actions.
   Add: the thumbnail persists (no scan-line), and one quiet line with the type
   breakdown derived from fields — e.g. "12 text · 4 choice · 3 checkbox · 1 table".
5. **Byte-identical strings.** Every existing spoken/status string, stage key/label,
   the startedRef single-run guard, and all voice commands stay exactly as they are.

## 3. Gates & sweep

After each screen: `npx tsc --noEmit`. At the end: `npm run build`,
`npx tsx scripts/smoke.test.ts`, `node scripts/e2e.mjs` against
`npm run start -- -p 3111` — all green; never modify tests or fixtures. Reduced-motion
variants for every new animation. Real `<button>`s, 44px targets, aria-labels on
icon-only actions. One commit per numbered section (after the §0 fix commit).

## 4. Manual check (human)

At 1440×900 and an ultrawide: preview fills the width, no floating column, rows scan
like a checklist, exactly one visible message region. Row↔box sync scrolls both panes.
PDF upload → processing shows the actual first page with the sweep, then the ready card
with the same thumbnail and the type-breakdown line. Reduced-motion: no sweep, no smooth
scrolling. TalkBack/VoiceOver: initial field-count status is announced despite being
visually hidden.
