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

  const cx = pts.reduce((sum, p) => sum + p.x, 0) / 4;
  const cy = pts.reduce((sum, p) => sum + p.y, 0) / 4;

  pts.sort((a, b) => {
    const angleA = Math.atan2(a.y - cy, a.x - cx);
    const angleB = Math.atan2(b.y - cy, b.x - cx);
    return angleA - angleB;
  });

  let minDist = Infinity;
  let tlIndex = 0;
  for (let i = 0; i < 4; i++) {
    const dist = pts[i].x * pts[i].x + pts[i].y * pts[i].y;
    if (dist < minDist) {
      minDist = dist;
      tlIndex = i;
    }
  }

  const tl = pts[tlIndex];
  const tr = pts[(tlIndex + 1) % 4];
  const br = pts[(tlIndex + 2) % 4];
  const bl = pts[(tlIndex + 3) % 4];

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
  const maxArea = frameArea * 0.85; // Strict: documents taking >85% are either vignettes or don't need cropping

  /**
   * Evaluates a binary mask and returns the best 4-corner polygon (if any)
   * that represents a paper-like sheet.
   */
  const getBestQuad = (mask: unknown, mode: number): number[] | null => {
    const contours = new cv.MatVector();
    const hierarchy = new cv.Mat();
    cv.findContours(mask as never, contours, hierarchy, mode, cv.CHAIN_APPROX_SIMPLE);

    let bestScore = 0;
    let bestPoints: number[] | null = null;

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

      // Wider epsilon range: allows cut-off corners (5-gons) to collapse into 4-gons
      for (const eps of [0.02, 0.03, 0.04, 0.05, 0.07, 0.09, 0.12]) {
        const approx = new cv.Mat();
        cv.approxPolyDP(hull, approx, eps * hullPeri, true);
        
        if ((approx as any).rows === 4 && cv.isContourConvex(approx)) {
          const pts: number[] = [];
          for (let j = 0; j < 4; j++) {
            pts.push((approx as any).data32S[j * 2], (approx as any).data32S[j * 2 + 1]);
          }
          
          const qa = quadAreaOf(pts);
          
          const minX = Math.min(pts[0], pts[2], pts[4], pts[6]);
          const maxX = Math.max(pts[0], pts[2], pts[4], pts[6]);
          const minY = Math.min(pts[1], pts[3], pts[5], pts[7]);
          const maxY = Math.max(pts[1], pts[3], pts[5], pts[7]);
          const wSpan = (maxX - minX) / w;
          const hSpan = (maxY - minY) / h;

          // ULTIMATE VIGNETTE KILLER:
          // If a quad spans >92% in BOTH dimensions, or >96% in ANY dimension, it's a camera lens artifact.
          if ((wSpan > 0.92 && hSpan > 0.92) || wSpan > 0.96 || hSpan > 0.96) {
            approx.delete();
            continue;
          }

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

          // Relaxed maxCos to 0.6 (approx 53 degrees) to allow for steeper camera angles
          if (qa >= minArea && qa <= maxArea && maxCos <= 0.6) {
            // Score primarily by area, but heavily penalize non-rectangular shapes (maxCos > 0)
            const score = qa * Math.pow(1 - maxCos, 2);
            if (score > bestScore) {
              bestScore = score;
              bestPoints = pts;
            }
          }
          approx.delete();
          break; // Found a valid 4-gon for this hull, no need to increase epsilon
        }
        approx.delete();
      }
      hull.delete();
      contour.delete();
    }

    contours.delete();
    hierarchy.delete();
    return bestPoints;
  };

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, work, new cv.Size(5, 5), 0);

    // Path B — edge outline with ONE gentle gap-closing dilation.
    // Most reliable for physical boundaries; immune to vignettes/lighting gradients.
    const edges = new cv.Mat();
    cv.Canny(work, edges, 30, 100);
    cv.dilate(edges, edges, kernel, new cv.Point(-1, -1), 1);
    
    // CRITICAL FIX: If the document is cut off by the camera frame, Canny produces an open U-shape.
    // By drawing a solid 2px white border around the entire image, we force those open curves
    // to connect to the frame boundary, closing the polygon perfectly.
    // The giant frame boundary contour itself will be rejected by the wSpan/hSpan check.
    cv.rectangle(edges, new cv.Point(0, 0), new cv.Point(w - 1, h - 1), new cv.Scalar(255, 255, 255, 255), 2);

    const quadB = getBestQuad(edges, cv.RETR_LIST);
    edges.delete();
    if (quadB) return sortCorners(quadB.map(Math.round));

    // Path S — whiteness: paper is bright AND unsaturated.
    // Extremely reliable on colored/wood backgrounds where edges might have gaps.
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
    
    // Also draw border for white mask just in case
    cv.rectangle(white, new cv.Point(0, 0), new cv.Point(w - 1, h - 1), new cv.Scalar(0, 0, 0, 0), 2);
    cv.morphologyEx(white, white, cv.MORPH_CLOSE, kernel);
    const quadS = getBestQuad(white, cv.RETR_EXTERNAL);
    white.delete();
    if (quadS) return sortCorners(quadS.map(Math.round));

    // We INTENTIONALLY REMOVED Path C (Adaptive) and Path A (Otsu).
    // On dark desks, they create massive "vignette" blobs that look like rectangles
    // and hijack the cropping algorithm. If Canny and Saturation fail to find a 
    // perfect 4-corner document, it is MUCH safer to return null (no crop) 
    // than to violently warp the background desk.

    return null;
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

  const MAX_WORKING_DIM = 1920;
  let w = img.width;
  let h = img.height;

  if (Math.max(w, h) > MAX_WORKING_DIM) {
    const scale = MAX_WORKING_DIM / Math.max(w, h);
    w = Math.round(w * scale);
    h = Math.round(h * scale);
  }

  const workingCanvas = document.createElement("canvas");
  workingCanvas.width = w;
  workingCanvas.height = h;
  const ctx = workingCanvas.getContext("2d");
  if (!ctx) return blob;
  ctx.drawImage(img, 0, 0, w, h);

  const MAX_PROBE_DIM = 600;
  let pw = w;
  let ph = h;
  let probeScale = 1;
  if (Math.max(pw, ph) > MAX_PROBE_DIM) {
    probeScale = MAX_PROBE_DIM / Math.max(pw, ph);
    pw = Math.round(pw * probeScale);
    ph = Math.round(ph * probeScale);
  }

  let probeCanvas = workingCanvas;
  if (probeScale < 1) {
    probeCanvas = document.createElement("canvas");
    probeCanvas.width = pw;
    probeCanvas.height = ph;
    const pctx = probeCanvas.getContext("2d");
    if (pctx) {
      pctx.drawImage(workingCanvas, 0, 0, pw, ph);
    } else {
      probeCanvas = workingCanvas;
      probeScale = 1;
    }
  }

  const corners = await detectCorners(probeCanvas);
  if (!corners || corners.length !== 8) {
    return blob; // No distinct quad found, return original
  }

  const scaledCorners = corners.map((c) => Math.round(c / probeScale));
  const warped = await warpPerspectiveCanvas(workingCanvas, scaledCorners);
  if (warped === workingCanvas) {
    return blob; // Warping failed
  }

  return new Promise<Blob>((resolve) => {
    warped.toBlob((b) => resolve(b || blob), "image/jpeg", 0.9);
  });
}
