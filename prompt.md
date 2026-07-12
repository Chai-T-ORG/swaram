# Swaram — Build Prompt

Build a Progressive Web App called Swaram — an accessible, voice-first form-filling assistant for blind and low-vision users. Build as much of this end-to-end as possible in this session, prioritizing a working core loop over partial coverage of every feature.

**Attached are UI mockups showing the intended screens and flow states — use them as a reference for layout, tone, and which screens exist, not as a pixel-perfect spec. Prioritize getting the functional pipeline (steps 2–7 below) working correctly over matching the exact visual styling. Visual polish is secondary to a working core loop.**

---

## Product Summary

A user uploads a PDF or photographs a paper form. The app detects every fillable field, reads each one aloud, captures the spoken answer, confirms it back, and writes all answers into the original form's exact layout, producing a completed PDF ready to print or submit — without the user ever needing to see the screen.

---

## Tech Stack (use exactly these, no substitutions)

- Next.js (App Router) + React + TypeScript + Tailwind CSS
- `pdf-lib` — reading AcroForm fields and writing answers back at coordinates
- `pdf.js` (Mozilla) — rendering PDF pages to images for the OCR path, and generating previews
- `tesseract.js` — OCR on scanned/flat forms, client-side, WASM
- `opencv.js` — classical shape detection (blank lines, boxes, checkboxes), client-side, WASM
- `fuse.js` — fuzzy matching of field labels against a saved profile
- Web Speech API (`SpeechRecognition` / `webkitSpeechRecognition`) and `SpeechSynthesis` — native browser APIs, no external speech service
- Supabase JS client — only for optional profile storage, never called unless the user explicitly opts in
- No other external APIs. No LLM calls. No cloud vision APIs. Everything else runs on-device.

---

## Build Priority Order (stop and confirm working before moving to the next)

### 1. Project Scaffold

Set up the Next.js app with this route structure:

```
app/
  page.tsx                    -> home: upload / scan entry point
  upload/page.tsx              -> PDF/image file picker
  scan/page.tsx                -> camera capture with audio-guided framing
  processing/[formId]/page.tsx -> OCR + analysis progress
  fill/[formId]/page.tsx       -> voice loop: ask, listen, confirm
  review/[formId]/page.tsx     -> auto-fill review, skipped fields
  complete/[formId]/page.tsx   -> completion, export options
  profile/page.tsx             -> view/edit saved profile
  history/page.tsx             -> local form history
lib/
  ocr/tesseractEngine.ts
  vision/shapeDetector.ts
  vision/fieldClusterer.ts      -> column clustering + top-to-bottom sort
  pdf/pdfReader.ts
  pdf/pdfWriter.ts              -> coordinate write-back
  pdf/acroformDetector.ts       -> AcroForm vs scanned detection
  voice/speechToText.ts         -> wraps SpeechRecognition, handles iOS webkit prefix
  voice/textToSpeech.ts         -> wraps SpeechSynthesis
  matching/keywordDictionary.ts
  matching/fuzzyProfileMatch.ts -> Fuse.js wrapper
  storage/supabaseClient.ts
  storage/localHistoryStore.ts  -> IndexedDB wrapper
```

### 2. Form Ingestion

- **Upload path:** accept PDF, JPG, PNG, max 50MB, with validation and progress.
- **Scan path:** camera capture with spoken/visual guidance ("Move left," "Hold steady"), auto-capture when form fills frame and is in focus.

### 3. Form Analysis Pipeline

- Detect if the PDF is an AcroForm (has embedded fields) or flat/scanned.
- **AcroForm:** read fields directly via pdf-lib, skip OCR entirely.
- **Scanned:** run tesseract.js OCR (text + position + confidence per word) → run opencv.js shape detection (find blank lines, rectangles, circles) → match OCR labels against a starter keyword dictionary (build one covering common Indian form fields: name, date of birth, father's/guardian's name, category, address, email, phone, Aadhaar number) → cluster fields by x-coordinate and sort top-to-bottom per column.
- Normalize everything into one shape: `{ id, label, type, bbox, order }`.

### 4. Voice Loop

For each field: speak the question via TTS → listen via STT → read back what was heard → wait for yes/no confirmation → advance on yes, retry on no. Support field types: text, date, single-choice, checkbox/yes-no. Always allow "type instead," "repeat," and "skip this field" as interrupts, not just at the start.

Critically: implement the iOS Safari fallback correctly —

```javascript
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
```

and handle the `service-not-allowed` error with a clear message pointing to Settings → Privacy & Security → Speech Recognition.

### 5. Unclear Field Handling

If OCR confidence on a label is below 60%, do not guess. Spell the text letter-by-letter aloud and ask the user to identify the field. If still unresolved after one retry, skip it and flag it in a final summary — never block the rest of the form on one unclear field.

### 6. PDF Write-Back

Convert each field's stored bounding box (as a percentage) into actual PDF point coordinates using the page's real dimensions. Draw text answers with pdf-lib at those coordinates on top of the original page/image as background. Draw a checkmark glyph for checkbox/radio fields. Output must be visually identical to the original form except for the filled values.

### 7. Profile and Auto-Fill

After completing a form, ask if the user wants to save their answers (explicit opt-in only — do not save anything without this). On a new form, run Fuse.js matching (threshold 0.7 to start) between detected labels and saved profile keys (`full_name`, `date_of_birth`, `category`, `address`, `email`, `phone`, `father_name`). Auto-fill matches silently, announce how many matched, and only run the voice loop for the remainder.

Do not store Aadhaar or other high-sensitivity government ID numbers in the profile table under any circumstance, even if a form field asks for one — those values only ever get written into the local PDF output.

### 8. Export

Download, native share (Android share sheet), print. Store form history (name, date, field count, status) entirely in IndexedDB, never in Supabase.

---

## Non-Negotiable Constraints

- Zero paid APIs anywhere in the pipeline.
- OCR, shape detection, and PDF processing must never leave the browser — no network calls for any of these three.
- Supabase is called only after explicit user consent, and only for the profile table — nothing else.
- Voice input should prefer on-device recognition where the browser supports it, and must show an explicit notice before falling back to cloud-based recognition for unsupported languages.
- Accessibility: every screen must be usable with a screen reader, all interactive elements need proper ARIA labels, minimum 44px touch targets, and no critical information conveyed by color alone.

---

Work through this in order, get each stage functionally working before adding polish, and flag clearly if any step (especially opencv.js shape detection reliability, or iOS Safari speech recognition) needs a fallback or simplification to stay within scope.