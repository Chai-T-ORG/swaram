# Swaram — OCR Accuracy Improvement Recommendations

Compiled from a review of `ocr_scanning_and_field_recognition.md` (the current camera scanning, OCR, and field-recognition architecture) plus research into cloud OCR alternatives and available student credits.

**Current stack confirmed:** Tesseract.js (OCR) + OpenCV.js (shape detection, camera guidance) + pdf-lib (write-back). All free, open-source, on-device.

---

## Priority 1 — Add Perspective Correction (biggest likely win, and it's free)

**The gap:** The camera guidance loop already computes the document's four corner points (quad geometry) via Canny edge + contour detection, to check alignment and coverage in real time. But the OCR preprocessing step (`preprocessForOcr()`) only does grayscale → adaptive threshold → median blur — there's no `warpPerspective` step that flattens the image using those corners before OCR runs.

**Why it matters:** A form can pass the alignment/sharpness/coverage checks and still be photographed at a mild angle, since those checks measure centering and sharpness, not flatness. Every downstream shape-detection heuristic (checkbox aspect-ratio range 0.65–1.5, input-box aspect ratio >2.5, the underline morphology kernel) assumes axis-aligned rectangles. A 5–8° skew is enough to push real shapes outside those ranges.

**The fix (near-free, since the corner data already exists):**

```typescript
// At capture time, reuse the same quad corners computed by the guidance loop
const srcCorners = detectedQuad; // [x0,y0, x1,y1, x2,y2, x3,y3] — already available
const dstCorners = computeTargetRectangle(srcCorners); // straightened output size

const M = cv.getPerspectiveTransform(
  cv.matFromArray(4, 1, cv.CV_32FC2, srcCorners),
  cv.matFromArray(4, 1, cv.CV_32FC2, dstCorners)
);

const flattened = new cv.Mat();
cv.warpPerspective(sourceMat, flattened, M, outputSize);

// THEN run preprocessForOcr() on `flattened`, not the raw capture
```

**Recommended order:** capture → `warpPerspective` (new) → existing `preprocessForOcr()` (grayscale, adaptive threshold, median blur) → Tesseract.

---

## Priority 2 — Confirm Full-Resolution Image Reaches OCR

The guidance loop's real-time metrics run on a 480px-width scaled canvas for performance (reasonable for a 900ms polling loop). It's not clear from the architecture doc whether the **final OCR pass** reuses that same downscaled canvas or re-processes the original full-resolution capture.

If it's reusing the 480px proxy: this alone could be capping accuracy hard. Tesseract wants roughly 300 DPI equivalent — 480px width on a typical form photo is well below that.

**Action:** Verify the OCR pipeline pulls from the full-resolution capture, not the guidance-loop's downscaled canvas.

---

## Tesseract-Specific Tuning

- **Switch to `eng_best.traineddata`** (and `mal_best.traineddata`) instead of the default/fast model — meaningfully more accurate, slower, worth it since each form is processed once. Confirm which variant is currently loaded.
- **Verify Malayalam is actually wired in.** The architecture doc's example only shows `eng` and `hin` — worth confirming `mal.traineddata` didn't get dropped somewhere, given it's core to Swaram's original scope.
- **Use PSM 7 (single line) on individual cropped field regions**, instead of running PSM 3 (auto full-page segmentation) on the whole form. Once a field's bounding box is known, cropping to just that region and re-running Tesseract with the correct PSM mode avoids page-level segmentation guesses.
- **Character whitelisting for constrained fields** — digits-only for phone/pincode, letters-only for name fields — removes a large class of misreads.

## Shape Detection — Re-tune After Perspective Correction Lands

- **Coverage threshold (currently 20% of viewport)** may be too permissive as a floor — test raising to ~35–40% once perspective correction is in, since a form filling only a fifth of the frame may still be under-resolved for small text.
- Re-test the checkbox (0.65–1.5 aspect ratio) and input-box (>2.5 aspect ratio) thresholds after adding perspective correction — some of the current misses may resolve automatically once shapes are no longer skewed.
- **Confirm the multi-column clustering step** (grouping fields by x-coordinate, sorting top-to-bottom within columns — originally in the SRS) still exists somewhere in `analyzeForm.ts`. It isn't mentioned in the architecture doc reviewed here; worth checking it wasn't quietly dropped during the voice-engine overhaul.

---

## Should You Add a Cloud OCR/Forms Service?

Worth A/B testing against your real forms — but think "forms," not just "OCR," since your actual bottleneck (matching text to the right field) is what purpose-built form-extraction APIs solve natively:

| Service | What it does | Cost | Notes |
|---|---|---|---|
| **AWS Textract — Analyze Document (Forms)** | Extracts key-value pairs directly (e.g. "Father's Name" → "Ramesh Kumar") | $0.05/page, **not** covered by free trial tier | Could replace a chunk of your custom shape-detection + dictionary-matching pipeline, not just improve raw OCR |
| **Azure Document Intelligence** (formerly Form Recognizer) | Same category as Textract | Azure for Students credit applies | Confirm current free-tier quota directly on Azure's pricing page |
| **Google Cloud Vision** | General OCR, not form-structure-aware | Free ongoing tier: 1,000 units/month | No trial expiry — good for benchmarking raw text accuracy specifically |
| **PaddleOCR** (self-hosted) | Generally outperforms Tesseract on messy real-world scans in many benchmarks | Free, no per-page cost | Python-based, not browser-WASM like Tesseract.js — needs a small backend service (you already run one for Kokoro voice) |

**Suggested pattern:** Keep Tesseract as the on-device default. Only call out to a cloud Forms API for pages where OCR confidence stays low *after* preprocessing is fixed — mirroring the on-device-first, cloud-fallback-with-disclosure pattern you already built for speech recognition.

**One accuracy data point (treat with some skepticism — source is an AI-consulting firm with incentive to sound authoritative):** in a 100-document benchmark, Google Document AI scored ~95.8% vs. Textract's ~94.2% on clean documents; on phone-photo-quality documents specifically, the gap widened to ~81.2% vs. ~76.3%. Benchmark on your own real forms rather than trusting vendor numbers.

---

## GitHub Student Pack / .edu Credits

- **Azure for Students** — $100 credit, no credit card required, free access to 25+ Azure services. Usable toward Document Intelligence.
- **AWS Educate** — ~$100 AWS credit. At Textract Forms' $0.05/page, that's ~2,000 pages of real testing before any cost — enough for a proper benchmark against Tesseract.
- **DigitalOcean** — $200 credit through 7/31/26, but explicitly **excludes** third-party AI models hosted outside DigitalOcean's own infrastructure. Fine for hosting your own PaddleOCR service; not usable for calling external AI APIs through it.
- **No dedicated OCR/document-scanning partner exists in the GitHub Student Pack itself** (checked directly) — the path to better OCR services runs through the generic cloud credits above, not a specialized pack partner.
- **Google Cloud education credits** — sometimes offered as a separate program via `.edu` email, outside the Student Pack. Worth checking Google Cloud's education page directly; no reliable current specifics found for this one.

---

## Suggested Priority Order

1. **Add perspective correction** — free, reuses data you already compute, likely the single biggest accuracy win.
2. **Confirm full-resolution capture reaches Tesseract**, not the 480px guidance-loop proxy.
3. **Switch to `_best` traineddata variants** + crop-and-PSM-7 per field instead of whole-page PSM 3.
4. **Re-test shape-detection thresholds** after perspective correction lands — some current failures may resolve on their own.
5. **If still short of your accuracy target:** A/B test AWS Textract Forms or Azure Document Intelligence on your hardest real forms, using student credits.
6. **Only consider self-hosted PaddleOCR** if cloud costs or rate limits become a real blocker at scale — free but adds backend complexity.
