# Swaram — Preview/Review Split: Two Jobs, Two Screens

**The problem to solve:** `/review/[formId]` is one screen wearing two jobs. Entered
*before* filling (processing's "Preview all fields first"), it says "Almost done", counts
every untouched field as "Skipped", and offers a "Looks good — finish" button that would
complete a blank form. Entered *after* filling, it's correct. The two jobs need different
information: **preview verifies the extraction** (did OCR find the right fields, right
labels, right types, which are low-confidence) — **review verifies the answers**. Today
there is no UI anywhere to fix a mislabeled field or delete a spurious detection, which is
the entire point of a verification step. This pass builds a real preview screen and makes
review state-aware. Same frozen zones and gates as `antigravity_polish.md` §1–2.

## 0. What already exists — use it, add nothing

- **The data model is ready.** `FormField` (lib/types.ts) already carries `bbox`
  (fractions 0..1, top-left origin), `page`, `type`, `confidence` (0–100), `source`,
  `options`, `question`, `profileKey`, `sensitive`, `dependsOn`. The enterprise
  side-by-side pattern (document with field overlays) is pure UI on top of this.
- **PDF rendering exists**: `loadPdfDocument` + `renderPageToCanvas` from
  `lib/pdf/pdfReader.ts` (import and consume — lib stays read-only). Images:
  `getFile(formId, "original")` → object URL. **Do not add any PDF/viewer/annotation
  library** (react-pdf, pdf-viewer, konva, etc.) — pdfjs-dist is already here.
- **Persistence pattern exists**: mutate `record.fields`, `saveForm(updated)` — exactly
  what `useReview.saveEdit` does today. Copy the pattern.
- "Unclear" is defined as `confidence < 60 && source === "ocr"` (same rule as
  `unclearCount` in useProcessing). Use this one definition everywhere.

## 1. Frozen zones & gates

`lib/**` and `app/api/**` read-only. `useVoicePage` contract untouched. E2e anchors:
`/review/[formId]` keeps existing and keeps rendering every field's label in body text
(the e2e checks "Full Name" appears there); "fields detected" strings in useProcessing
unchanged; `input[type=file]` on /upload; no route renames — `/preview/[formId]` is
**additive**. Real `<button>`s, 44px targets, reduced-motion variants, StatusAnnouncer for
state changes. After each step: `npx tsc --noEmit`; at the end `npm run build`,
`npx tsx scripts/smoke.test.ts`, `node scripts/e2e.mjs` against
`npm run start -- -p 3111` — all green. Never alter a test or fixture to get green; if a
gate fails, fix the product code or stop and report.

## 2. The split — routing

New route `app/preview/[formId]/page.tsx` (copy the device-switch shell from
`app/review/[formId]/page.tsx`), bodies `PreviewMobile`/`PreviewDesktop`, logic in
`components/screens/usePreview.ts`. Rewire the *pre-fill* entry points in
`useProcessing.ts`: `goReview` → `/preview/${formId}`, the `preview|review fields` voice
command, and the `preview_fields` adaptive action. Everything post-fill (fill-complete
links, complete page, home resume `routeForForm`) keeps pointing at `/review` — do not
touch those.

## 3. The preview screen — "Check what I found"

Header: eyebrow **"Before you fill"**, H1 Fraunces **"Check what I found"**, subline
"`{n} fields` · fix anything I got wrong, then start."

**Document pane.** Render the original: image via object URL; PDF pages via
`renderPageToCanvas` (render lazily per page, cache). Over each page, absolutely position
an outline per field from its fractional `bbox` (skip fields with `bbox: null` — AcroForm
fields place themselves). Boxes: 1.5px `--accent` outline at 60% opacity; unclear fields
use `--warn`; the selected field's box goes solid with a soft fill. Tapping a box selects
its row; selecting a row scrolls/pans to its box. Multi-page: page dots (mobile) /
stacked pages (desktop).

**Field list.** One row per field, sorted by `order`: index + label, a type chip, and
when relevant: "auto-fill" chip (`profileKey && !sensitive`), "unclear" chip (warn), the
spoken `question` as a quiet second line. Row actions:
- **Rename** — inline edit of `label` (reuse the FieldEditForm interaction pattern).
- **Change type** — only between `text | date | choice | checkbox`; `comb`, `table`,
  `signature` render their type as a read-only chip (their extra geometry can't be
  authored here).
- **Remove** — "Not a real field": deletes the field, with a single-level Undo row in its
  place for ~6s. On delete, also strip any other field's `dependsOn` whose `fieldKey`
  equals the removed field's `profileKey` (that's how useFillSession resolves it —
  verify at `components/screens/useFillSession.ts:266`).
Every commit mutates the record and `saveForm`s immediately.

**Actions.** Primary `Start filling` → `/fill/{id}` (the one solid-green button).
Secondary quiet link back home. Voice page: title "Check the detected fields", commands —
`start( filling)?|begin` (reuse the intentRegex("start") pattern from useProcessing) →
fill; `read (the )?fields` → speak each label in order (cancelable, like review's
read-back); adaptive actions mirroring both. Deleting/renaming stays touch/pointer-only —
don't invent voice editing here.

**Layouts.** Desktop: two panes — document sticky left (~55%), list scrolling right.
Mobile: document as a collapsible card up top (default collapsed to page 1 at ~40vh),
list beneath, sticky `Start filling` above the dock, safe-area aware.

## 4. Review becomes state-aware (`useReview.ts` + both bodies)

Review's job is now answers only, but it can still be visited mid-fill. Fix the
pending conflation:
- Split `pending` out of `skippedCount`. Tiles: when `pending > 0`, the fourth tile is
  **"Not asked yet"** (pending) and Skipped shows only truly skipped/unclear; when
  `pending === 0`, keep today's four tiles.
- When `pending > 0`: eyebrow **"In progress"** (not "Almost done"), primary CTA
  **"Continue filling"** → `/fill/{id}` (plain, not `?only=skipped`), and the
  "Looks good — finish" button demotes to btn-secondary. When `pending === 0`, screen
  behaves exactly as today.
- Voice hint follows the same split ("`{n}` not asked yet" vs "skipped").
- Do not change the field-row rendering — labels in body text are an e2e anchor.

## 5. Analysing page follow-ups (small, in the same pass)

- The ready card's stat chips ("`{n}` auto-fill", "`{n}` unclear") become real buttons
  that open `/preview/{id}` — evidence now lives there. Keep chip styling, add
  aria-labels ("See the 3 unclear fields").
- Fix the Cancel link's conflicting `underline` + `no-underline` classes in
  `ProcessingMobile.tsx` (keep the underline).
- No other processing changes; every spoken/status string stays byte-identical.

## 6. Manual test matrix (after gates — human)

Upload the sample PDF → processing → "Preview all fields first" lands on /preview: boxes
sit on the right labels at every viewport width; tap box ↔ row sync both ways; rename,
retype, remove + undo all persist across a reload; remove a field another field depends
on → fill loop no longer references it; "start filling" by voice works from preview.
Mid-fill, open review: "In progress" framing, "Continue filling" resumes at the next
unanswered field. Finish a fill → review shows today's framing; finish → complete.
TalkBack/VoiceOver: box selection is announced via the list, not the canvas.
