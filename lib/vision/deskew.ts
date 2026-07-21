import cv from "@techstark/opencv-js";

export function deskewCanvas(sourceCanvas: HTMLCanvasElement): HTMLCanvasElement {
  let src = cv.imread(sourceCanvas);
  let gray = new cv.Mat();
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);

  let binary = new cv.Mat();
  cv.threshold(gray, binary, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);

  let coords = new cv.Mat();
  cv.findNonZero(binary, coords);

  if (coords.rows === 0) {
    src.delete();
    gray.delete();
    binary.delete();
    coords.delete();
    return sourceCanvas; // Empty image, no skew to fix
  }

  let rect = cv.minAreaRect(coords);
  let angle = rect.angle;

  // OpenCV returns angles in the range [-90, 0).
  // If the angle is near -90, it means it's mostly straight but slightly rotated the other way.
  if (angle < -45) {
    angle = -(90 + angle);
  } else {
    angle = -angle;
  }

  // If the angle is very small, bypass rotation to preserve pixel clarity and save compute
  if (Math.abs(angle) < 0.5) {
    src.delete();
    gray.delete();
    binary.delete();
    coords.delete();
    return sourceCanvas;
  }

  let center = new cv.Point(src.cols / 2, src.rows / 2);
  let M = cv.getRotationMatrix2D(center, angle, 1.0);
  let dst = new cv.Mat();
  
  // Warp with a white border mode to avoid black triangles on corners
  cv.warpAffine(src, dst, M, new cv.Size(src.cols, src.rows), cv.INTER_CUBIC, cv.BORDER_CONSTANT, new cv.Scalar(255, 255, 255, 255));

  let outputCanvas = document.createElement("canvas");
  outputCanvas.width = src.cols;
  outputCanvas.height = src.rows;
  cv.imshow(outputCanvas, dst);

  src.delete();
  gray.delete();
  binary.delete();
  coords.delete();
  dst.delete();
  M.delete();

  return outputCanvas;
}
