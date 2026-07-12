/**
 * Orders detected fields the way a sighted person reads a form:
 * cluster into columns by x-coordinate, then top-to-bottom per column,
 * left column first.
 */
import type { FormField } from "../types";

/** Two fields belong to different columns if their left edges differ by more than this. */
const COLUMN_GAP = 0.28;

export function orderFields(fields: FormField[]): FormField[] {
  const withBox = fields.filter((f) => f.bbox);
  const withoutBox = fields.filter((f) => !f.bbox);

  const ordered: FormField[] = [];
  const pageIndices = [...new Set(withBox.map((f) => f.page))].sort((a, b) => a - b);

  for (const page of pageIndices) {
    const pageFields = withBox.filter((f) => f.page === page);

    // Cluster left edges into columns.
    const sorted = [...pageFields].sort((a, b) => a.bbox!.x - b.bbox!.x);
    const columns: { minX: number; items: FormField[] }[] = [];
    for (const field of sorted) {
      const col = columns.find((c) => Math.abs(field.bbox!.x - c.minX) < COLUMN_GAP);
      if (col) {
        col.items.push(field);
        col.minX = Math.min(col.minX, field.bbox!.x);
      } else {
        columns.push({ minX: field.bbox!.x, items: [field] });
      }
    }

    // Single wide column? Fall back to pure top-to-bottom for stability.
    if (columns.length === 1) {
      ordered.push(...columns[0].items.sort(byReadingOrder));
    } else {
      columns.sort((a, b) => a.minX - b.minX);
      for (const col of columns) {
        ordered.push(...col.items.sort(byReadingOrder));
      }
    }
  }

  // Fields without geometry keep their original relative order, at the end.
  ordered.push(...withoutBox.sort((a, b) => a.order - b.order));

  return ordered.map((field, index) => ({ ...field, order: index }));
}

function byReadingOrder(a: FormField, b: FormField): number {
  const dy = a.bbox!.y - b.bbox!.y;
  // Same visual row (within ~1% of page height): left to right.
  if (Math.abs(dy) < 0.012) return a.bbox!.x - b.bbox!.x;
  return dy;
}
