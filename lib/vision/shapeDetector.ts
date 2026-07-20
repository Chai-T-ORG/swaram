/**
 * Classical shape detection with opencv.js (WASM, on-device):
 * finds blank answer lines, input boxes, and checkboxes on a rendered page.
 *
 * OpenCV is a 13MB WASM bundle, so it is loaded lazily and treated as
 * best-effort: if it fails to load or crashes, analysis continues with
 * OCR-only heuristics (underscores, colons, dictionary labels).
 */

type CV = typeof import("@techstark/opencv-js");

export type ShapeKind = "line" | "box" | "checkbox";

export interface DetectedShape {
  kind: ShapeKind;
  /** Canvas pixel coordinates, origin top-left. */
  x: number;
  y: number;
  w: number;
  h: number;
}

let cvPromise: Promise<CV | null> | null = null;

/** Load OpenCV once; resolves null on failure/timeout instead of throwing. */
export function loadOpenCv(timeoutMs = 25000): Promise<CV | null> {
  if (!cvPromise) {
    cvPromise = (async () => {
      try {
        // Via a CJS shim: the package's module.exports IS a Promise that
        // resolves to cv when the WASM runtime is ready (see opencvRuntime.cjs).
        const mod = (await import("./opencvRuntime.cjs")) as unknown as {
          getOpenCv?: () => Promise<unknown>;
          default?: { getOpenCv?: () => Promise<unknown> };
        };
        const getOpenCv = mod.getOpenCv ?? mod.default?.getOpenCv;
        if (!getOpenCv) {
          console.warn("[swaram] opencv shim missing getOpenCv export");
          return null;
        }
        const ready = await Promise.race([
          getOpenCv(),
          new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
        ]);
        if (!ready) {
          console.warn("[swaram] opencv load timed out");
          return null;
        }
        const cv = ready as CV;
        if (typeof cv.Mat !== "function") {
          console.warn("[swaram] opencv resolved without runtime (Mat missing)");
          return null;
        }
        return cv;
      } catch (error) {
        console.warn("[swaram] opencv failed to load:", error);
        return null;
      }
    })();
  }
  return cvPromise;
}

/**
 * Detect writable shapes on a page canvas. Returns [] if OpenCV is
 * unavailable — callers must treat shapes as optional evidence.
 */
export async function detectShapes(canvas: HTMLCanvasElement): Promise<DetectedShape[]> {
  const cv = await loadOpenCv();
  if (!cv) return [];

  const shapes: DetectedShape[] = [];
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const binary = new cv.Mat();
  const horizontal = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    // Inverted adaptive threshold: ink becomes white on black.
    cv.adaptiveThreshold(
      gray,
      binary,
      255,
      cv.ADAPTIVE_THRESH_MEAN_C,
      cv.THRESH_BINARY_INV,
      15,
      10,
    );

    const pageW = canvas.width;
    const pageH = canvas.height;

    // --- 1. Horizontal blank lines (underlines to write on) ---
    const lineKernel = cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(Math.max(Math.round(pageW * 0.04), 20), 1));
    cv.morphologyEx(binary, horizontal, cv.MORPH_OPEN, lineKernel);
    lineKernel.delete();

    const lineContours = new cv.MatVector();
    const lineHierarchy = new cv.Mat();
    cv.findContours(horizontal, lineContours, lineHierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    for (let i = 0; i < lineContours.size(); i++) {
      const contour = lineContours.get(i);
      const rect = cv.boundingRect(contour);
      contour.delete();
      if (rect.width > pageW * 0.06 && rect.height < pageH * 0.01) {
        shapes.push({ kind: "line", x: rect.x, y: rect.y, w: rect.width, h: rect.height });
      }
    }
    lineContours.delete();
    lineHierarchy.delete();

    // --- 2. Rectangles: checkboxes (small squares) and input boxes ---
    const rectContours = new cv.MatVector();
    const rectHierarchy = new cv.Mat();
    cv.findContours(binary, rectContours, rectHierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);
    const approx = new cv.Mat();
    const minSide = pageW * 0.008;
    const maxCheckbox = pageW * 0.035;
    for (let i = 0; i < rectContours.size(); i++) {
      const contour = rectContours.get(i);
      const peri = cv.arcLength(contour, true);
      cv.approxPolyDP(contour, approx, 0.04 * peri, true);
      if (approx.rows === 4 && cv.isContourConvex(approx)) {
        const rect = cv.boundingRect(approx);
        const aspect = rect.width / Math.max(rect.height, 1);
        if (
          rect.width >= minSide &&
          rect.height >= minSide &&
          rect.width <= maxCheckbox &&
          rect.height <= maxCheckbox &&
          aspect > 0.65 &&
          aspect < 1.5
        ) {
          shapes.push({ kind: "checkbox", x: rect.x, y: rect.y, w: rect.width, h: rect.height });
        } else if (
          rect.width > pageW * 0.08 &&
          rect.width < pageW * 0.9 &&
          rect.height > pageH * 0.008 &&
          rect.height < pageH * 0.06 &&
          aspect > 2.5
        ) {
          shapes.push({ kind: "box", x: rect.x, y: rect.y, w: rect.width, h: rect.height });
        }
      }
      contour.delete();
    }
    approx.delete();
    rectContours.delete();
    rectHierarchy.delete();
  } catch (error) {
    // Partial results are fine; OCR heuristics cover the rest.
    console.warn("[swaram] shape detection failed midway:", error);
  } finally {
    src.delete();
    gray.delete();
    binary.delete();
    horizontal.delete();
  }

  return dedupeShapes(shapes);
}

function dedupeShapes(shapes: DetectedShape[]): DetectedShape[] {
  const kept: DetectedShape[] = [];
  for (const shape of shapes) {
    const overlaps = kept.some(
      (other) =>
        other.kind === shape.kind &&
        Math.abs(other.x - shape.x) < 8 &&
        Math.abs(other.y - shape.y) < 8 &&
        Math.abs(other.w - shape.w) < 16,
    );
    if (!overlaps) kept.push(shape);
  }
  return kept;
}

/**
 * Clean up a photographed page before OCR: grayscale + adaptive threshold
 * evens out lighting and shadows, which measurably improves tesseract on
 * phone photos. Returns the original canvas untouched if OpenCV is missing.
 */
export async function preprocessForOcr(canvas: HTMLCanvasElement): Promise<HTMLCanvasElement> {
  const cv = await loadOpenCv();
  if (!cv) return canvas;
  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const cleaned = new cv.Mat();
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.adaptiveThreshold(
      gray,
      cleaned,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY,
      39,
      15,
    );
    cv.medianBlur(cleaned, cleaned, 3);
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    cv.imshow(out, cleaned);
    return out;
  } catch {
    return canvas;
  } finally {
    src.delete();
    gray.delete();
    cleaned.delete();
  }
}

/**
 * Document-in-frame check for the camera page. Returns guidance on where
 * the largest paper-like quad sits in the frame, or null if none/no OpenCV.
 */
export interface FrameCheck {
  coverage: number; // 0..1 of frame area
  offsetX: number; // -1..1, negative = document is left of center
  offsetY: number;
  sharpness: number; // variance of Laplacian
}

export async function checkDocumentInFrame(canvas: HTMLCanvasElement): Promise<FrameCheck | null> {
  const cv = await loadOpenCv(1); // must already be loaded; don't block the camera loop
  if (!cv) return null;

  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edges = new cv.Mat();
  const lap = new cv.Mat();
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Sharpness: variance of the Laplacian.
    cv.Laplacian(gray, lap, cv.CV_64F);
    const mean = new cv.Mat();
    const stddev = new cv.Mat();
    cv.meanStdDev(lap, mean, stddev);
    const sharpness = stddev.doubleAt(0, 0) ** 2;
    mean.delete();
    stddev.delete();

    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
    cv.Canny(blurred, edges, 60, 180);

    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(edges, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let bestArea = 0;
    let best: { x: number; y: number; w: number; h: number } | null = null;
    const approx = new cv.Mat();
    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const peri = cv.arcLength(contour, true);
      cv.approxPolyDP(contour, approx, 0.03 * peri, true);
      if (approx.rows >= 4) {
        const rect = cv.boundingRect(approx);
        const area = rect.width * rect.height;
        if (area > bestArea) {
          bestArea = area;
          best = { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
        }
      }
      contour.delete();
    }
    approx.delete();
    contours.delete();
    hierarchy.delete();

    if (!best) return { coverage: 0, offsetX: 0, offsetY: 0, sharpness };
    const frameArea = canvas.width * canvas.height;
    const centerX = best.x + best.w / 2;
    const centerY = best.y + best.h / 2;
    return {
      coverage: bestArea / frameArea,
      offsetX: (centerX - canvas.width / 2) / (canvas.width / 2),
      offsetY: (centerY - canvas.height / 2) / (canvas.height / 2),
      sharpness,
    };
  } catch {
    return null;
  } finally {
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    lap.delete();
  }
}

function sortCorners(points: number[]): number[] {
  const pts = [];
  for (let i = 0; i < 8; i += 2) {
    pts.push({ x: points[i], y: points[i + 1] });
  }

  const sum = pts.map((p) => p.x + p.y);
  const diff = pts.map((p) => p.y - p.x);

  const tl = pts[sum.indexOf(Math.min(...sum))];
  const br = pts[sum.indexOf(Math.max(...sum))];
  const tr = pts[diff.indexOf(Math.min(...diff))];
  const bl = pts[diff.indexOf(Math.max(...diff))];

  return [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y];
}

/** Shoelace area of a quad [x0,y0,...,x3,y3]. */
function quadAreaOf(pts: number[]): number {
  let area = 0;
  for (let i = 0; i < 4; i++) {
    area +=
      pts[i * 2] * pts[((i + 1) % 4) * 2 + 1] - pts[((i + 1) % 4) * 2] * pts[i * 2 + 1];
  }
  return Math.abs(area) / 2;
}

export async function detectCorners(canvas: HTMLCanvasElement): Promise<number[] | null> {
  const cv = await loadOpenCv();
  if (!cv) return null;

  const src = cv.imread(canvas);
  const gray = new cv.Mat();
  const work = new cv.Mat();
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U);

  const w = canvas.width;
  const h = canvas.height;
  const frameArea = w * h;
  const minArea = frameArea * 0.1;
  const maxArea = frameArea * 0.95;
  const borderX = w * 0.02;
  const borderY = h * 0.02;

  let bestScore = 0;
  let bestPoints: number[] | null = null;

  /**
   * Score every plausible 4-corner candidate in a binary mask. The hull is
   * convex by construction; a held sheet (fingers, curled corner) often
   * approximates to 5-6 points at tight tolerance before collapsing to its
   * 4 true corners, hence the epsilon escalation. Quads that hug the frame
   * are the merged-background blob, never the paper — rejected outright.
   */
  const considerContours = (mask: unknown, mode: number) => {
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(mask as never, contours, hierarchy, mode, cv.CHAIN_APPROX_SIMPLE);

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      const area = cv.contourArea(contour);
      if (area < minArea) {
        contour.delete();
        continue;
      }

      const hull = new cv.Mat();
      cv.convexHull(contour, hull, false, true);
      const hullPeri = cv.arcLength(hull, true);

      for (const eps of [0.02, 0.04, 0.06, 0.09]) {
        const approx = new cv.Mat();
        cv.approxPolyDP(hull, approx, eps * hullPeri, true);
        if ((approx as any).rows === 4) {
          const pts: number[] = [];
          for (let j = 0; j < 4; j++) {
            pts.push((approx as any).data32S[j * 2], (approx as any).data32S[j * 2 + 1]);
          }
          const qa = quadAreaOf(pts);
          let borderCorners = 0;
          for (let j = 0; j < 4; j++) {
            const x = pts[j * 2];
            const y = pts[j * 2 + 1];
            if (x < borderX || x > w - borderX || y < borderY || y > h - borderY) borderCorners++;
          }
          // A photographed sheet keeps its corners near 90° even under
          // perspective; |cos| > 0.5 (outside 60°–120°) is never the paper.
          let maxCos = 0;
          for (let j = 0; j < 4; j++) {
            const v1x = pts[((j + 3) % 4) * 2] - pts[j * 2];
            const v1y = pts[((j + 3) % 4) * 2 + 1] - pts[j * 2 + 1];
            const v2x = pts[((j + 1) % 4) * 2] - pts[j * 2];
            const v2y = pts[((j + 1) % 4) * 2 + 1] - pts[j * 2 + 1];
            const cos = Math.abs(
              (v1x * v2x + v1y * v2y) / (Math.hypot(v1x, v1y) * Math.hypot(v2x, v2y) || 1),
            );
            maxCos = Math.max(maxCos, cos);
          }
          if (qa >= minArea && qa <= maxArea && borderCorners < 3 && maxCos <= 0.5) {
            // Prefer large, rectangular, and right-angled: a paper sheet
            // fills its bounding box; sprawling background contours don't.
            const rect = cv.boundingRect(approx);
            const rectangularity = qa / Math.max(1, rect.width * rect.height);
            const score = qa * rectangularity * (1 - maxCos);
            if (score > bestScore) {
              bestScore = score;
              bestPoints = pts;
            }
          }
          approx.delete();
          break;
        }
        approx.delete();
      }
      hull.delete();
      contour.delete();
    }

    contours.delete();
    hierarchy.delete();
  };

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, work, new cv.Size(5, 5), 0);

    // Path A — the paper is usually the brightest region in frame: segment it
    // directly (robust on busy/colored backgrounds where edges are hopeless).
    const bright = new cv.Mat();
    cv.threshold(work, bright, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    cv.morphologyEx(bright, bright, cv.MORPH_CLOSE, kernel);
    considerContours(bright, cv.RETR_EXTERNAL);
    bright.delete();

    // Path S — whiteness: paper is bright AND unsaturated. Warm light-colored
    // backgrounds (cream fabric, wood) fool a pure brightness split, but they
    // carry saturation the paper doesn't.
    const rgb = new cv.Mat();
    cv.cvtColor(src, rgb, cv.COLOR_RGBA2RGB);
    const hsv = new cv.Mat();
    cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
    rgb.delete();
    const chans = new cv.MatVector();
    cv.split(hsv, chans);
    hsv.delete();
    const sat = chans.get(1);
    const val = chans.get(2);
    const lowSat = new cv.Mat();
    cv.threshold(sat, lowSat, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
    const brightV = new cv.Mat();
    cv.threshold(val, brightV, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);
    const white = new cv.Mat();
    cv.bitwise_and(lowSat, brightV, white);
    lowSat.delete();
    brightV.delete();
    sat.delete();
    val.delete();
    chans.delete();
    cv.morphologyEx(white, white, cv.MORPH_CLOSE, kernel);
    considerContours(white, cv.RETR_EXTERNAL);
    white.delete();

    // Path B — edge outline with ONE gentle gap-closing dilation. RETR_LIST,
    // because on textured backgrounds the dilated texture merges into a blob
    // and the paper survives only as a hole inside it.
    const edges = new cv.Mat();
    cv.Canny(work, edges, 30, 100);
    cv.dilate(edges, edges, kernel, new cv.Point(-1, -1), 1);
    considerContours(edges, cv.RETR_LIST);
    edges.delete();

    // Path C — adaptive threshold: survives uneven lighting and soft shadows
    // that defeat the single global Otsu split.
    const adaptive = new cv.Mat();
    const rawBlock = Math.max(3, Math.round(Math.min(w, h) / 8));
    const blockSize = rawBlock % 2 === 1 ? rawBlock : rawBlock + 1;
    cv.adaptiveThreshold(work, adaptive, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, blockSize, 5);
    cv.morphologyEx(adaptive, adaptive, cv.MORPH_CLOSE, kernel);
    considerContours(adaptive, cv.RETR_LIST);
    adaptive.delete();

    if (!bestPoints) return null;
    return sortCorners((bestPoints as number[]).map((v) => Math.round(v)));
  } catch (error) {
    console.warn("[swaram] detectCorners failed:", error);
    return null;
  } finally {
    src.delete();
    gray.delete();
    work.delete();
    kernel.delete();
  }
}

export async function warpPerspectiveCanvas(
  canvas: HTMLCanvasElement,
  corners: number[],
): Promise<HTMLCanvasElement> {
  const cv = await loadOpenCv();
  if (!cv) return canvas;

  const src = cv.imread(canvas);
  const dst = new cv.Mat();

  try {
    const tl = { x: corners[0], y: corners[1] };
    const tr = { x: corners[2], y: corners[3] };
    const br = { x: corners[4], y: corners[5] };
    const bl = { x: corners[6], y: corners[7] };

    const widthA = Math.hypot(br.x - bl.x, br.y - bl.y);
    const widthB = Math.hypot(tr.x - tl.x, tr.y - tl.y);
    const width = Math.round(Math.max(widthA, widthB));

    const heightA = Math.hypot(tr.x - br.x, tr.y - br.y);
    const heightB = Math.hypot(tl.x - bl.x, tl.y - bl.y);
    const height = Math.round(Math.max(heightA, heightB));

    if (width < 50 || height < 50) return canvas;

    const srcCornersMat = cv.matFromArray(4, 1, cv.CV_32FC2, corners);
    const dstCorners = [
      0, 0,
      width, 0,
      width, height,
      0, height,
    ];
    const dstCornersMat = cv.matFromArray(4, 1, cv.CV_32FC2, dstCorners);

    const M = cv.getPerspectiveTransform(srcCornersMat, dstCornersMat);
    const dsize = new cv.Size(width, height);
    cv.warpPerspective(src, dst, M, dsize, cv.INTER_LINEAR, cv.BORDER_CONSTANT, new cv.Scalar());

    const out = document.createElement("canvas");
    out.width = width;
    out.height = height;
    cv.imshow(out, dst);

    srcCornersMat.delete();
    dstCornersMat.delete();
    M.delete();

    return out;
  } catch (error) {
    console.warn("[swaram] warpPerspectiveCanvas failed:", error);
    return canvas;
  } finally {
    src.delete();
    dst.delete();
  }
}

/**
 * Convenience wrapper: converts an image Blob to a Canvas,
 * attempts to detect its corners, and returns a cropped (warped) JPEG Blob.
 * If no document is found or OpenCV fails, returns the original Blob.
 */
export async function autoCropImageBlob(blob: Blob): Promise<Blob> {
  // Use imageBitmap if available (browser), fallback to createImageBitmap
  let img: ImageBitmap | HTMLImageElement;
  try {
    img = await createImageBitmap(blob);
  } catch {
    // Safari fallback
    const url = URL.createObjectURL(blob);
    img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = reject;
      i.src = url;
    });
    URL.revokeObjectURL(url);
  }

  const canvas = document.createElement("canvas");
  canvas.width = img.width;
  canvas.height = img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return blob;
  ctx.drawImage(img, 0, 0);

  const corners = await detectCorners(canvas);
  if (!corners || corners.length !== 8) {
    return blob; // No distinct quad found, return original
  }

  const warped = await warpPerspectiveCanvas(canvas, corners);
  if (warped === canvas) {
    return blob; // Warping failed
  }

  return new Promise<Blob>((resolve) => {
    warped.toBlob((b) => resolve(b || blob), "image/jpeg", 0.9);
  });
}
