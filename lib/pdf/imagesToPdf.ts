import { PDFDocument } from "pdf-lib";

/**
 * Creates a multi-page PDF from an array of image Blobs.
 * Each image will be added as a new page matching the image dimensions.
 */
export async function imagesToPdf(imageBlobs: Blob[]): Promise<Blob> {
  const doc = await PDFDocument.create();

  for (const blob of imageBlobs) {
    const bytes = await blob.arrayBuffer();
    const isPng = blob.type.includes("png");
    let image;
    
    if (isPng) {
      image = await doc.embedPng(bytes);
    } else {
      image = await doc.embedJpg(bytes);
    }

    const page = doc.addPage([image.width, image.height]);
    page.drawImage(image, {
      x: 0,
      y: 0,
      width: image.width,
      height: image.height,
    });
  }

  const pdfBytes = await doc.save();
  return new Blob([new Uint8Array(pdfBytes)], { type: "application/pdf" });
}
