/**
 * vlmAdapter.ts — maps the raw Gemini vision schema (one grounded pass over a
 * rendered page image) into the app's FormField[] shape.
 *
 * The VLM sees the real layout, so this adapter does no geometry guessing: it
 * only converts coordinate formats, carries structure through, and re-attaches
 * the app-specific bits the rest of the pipeline needs (profileKey / sensitive
 * from the dictionary, ids, order). Tables are kept NATIVE (type "table" with a
 * 2D cells grid + JSON value) so write-back and the table fill flow can consume
 * them directly.
 */
import type { BBox, FormField, FieldType } from "../types";
import { newId } from "../types";
import { matchLabel } from "../matching/keywordDictionary";

/** Gemini box: [ymin, xmin, ymax, xmax], integers 0-1000 normalized to the image. */
export type GBox = [number, number, number, number];

export interface VlmCell {
  value?: string;
  bbox?: GBox;
}
export interface VlmRow {
  rowLabel?: string;
  cells?: VlmCell[];
}
export interface VlmField {
  label?: string;
  type?: string;
  options?: string[];
  optionBboxes?: GBox[];
  combLength?: number;
  /** Per-cell boxes for grouped combs / boxed dates (parallel to the chars). */
  cellBboxes?: GBox[];
  value?: string | string[];
  bbox?: GBox;
  columns?: string[];
  rows?: VlmRow[];
  /** optional 0-100 self-reported reliability; drives the "unclear" spell-out path */
  confidence?: number;
}
export interface VlmPage {
  /** 0-based page index. */
  page: number;
  fields: VlmField[];
}

const VALID_TYPES: FieldType[] = ["text", "date", "choice", "checkbox", "comb", "table", "signature"];
const SERIAL_COL = /^(#|s\.?\s*no\.?|sl\.?|sr\.?|serial|no\.?)$/i;

/** Gemini [ymin,xmin,ymax,xmax] 0-1000 -> app {x,y,w,h} fraction 0-1, clamped. */
export function gboxToBBox(g?: GBox): BBox | null {
  if (!Array.isArray(g) || g.length !== 4 || g.some((n) => typeof n !== "number" || Number.isNaN(n))) {
    return null;
  }
  const [ymin, xmin, ymax, xmax] = g;
  const x = clamp01(Math.min(xmin, xmax) / 1000);
  const y = clamp01(Math.min(ymin, ymax) / 1000);
  const w = clamp01(Math.abs(xmax - xmin) / 1000);
  const h = clamp01(Math.abs(ymax - ymin) / 1000);
  return { x, y, w: Math.max(w, 0.01), h: Math.max(h, 0.008) };
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Re-space comb cells evenly within each group. The VLM reliably captures a
 * comb's group structure (Aadhaar's 4-4-4 gaps, a date's DD/MM/YYYY gaps) but
 * jitters the individual cells — the last cell of a group is often too wide, so
 * digits drift off-centre. Physical cells are evenly spaced within a group, so
 * we keep each group's outer extent and divide it into equal cells.
 */
export function evenCellsInGroups(cells: BBox[]): BBox[] {
  if (cells.length < 2) return cells;
  const sorted = [...cells].sort((a, b) => a.x - b.x);
  const widths = sorted.map((c) => c.w).sort((a, b) => a - b);
  const medW = widths[Math.floor(widths.length / 2)] || 0.02;

  // Split into groups wherever the gap to the next cell exceeds half a cell.
  const groups: BBox[][] = [];
  let group: BBox[] = [sorted[0]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const gap = sorted[i].x - (prev.x + prev.w);
    if (gap > medW * 0.5) {
      groups.push(group);
      group = [];
    }
    group.push(sorted[i]);
  }
  groups.push(group);

  const out: BBox[] = [];
  for (const g of groups) {
    const left = g[0].x;
    const right = g[g.length - 1].x + g[g.length - 1].w;
    const w = (right - left) / g.length;
    for (let k = 0; k < g.length; k++) {
      out.push({ x: left + k * w, y: g[k].y, w, h: g[k].h });
    }
  }
  return out;
}

function normType(t?: string): FieldType {
  return VALID_TYPES.includes(t as FieldType) ? (t as FieldType) : "text";
}

function joinValue(v?: string | string[]): string {
  if (Array.isArray(v)) return v.filter(Boolean).join(", ");
  return (v ?? "").toString();
}

/**
 * Convert the raw multi-page VLM schema into FormField[] in reading order.
 * Pure and deterministic — unit-testable against saved raw fixtures.
 */
export function schemaToFields(pages: VlmPage[]): FormField[] {
  const fields: FormField[] = [];
  let order = 0;

  for (const { page, fields: raw } of pages) {
    for (const vf of raw ?? []) {
      // A table is high-value structural data — never drop it just because the
      // model forgot a caption. Give it a fallback label so it survives; other
      // captionless fields are still dropped as noise.
      const isTable = normType(vf.type) === "table";
      const label = (vf.label ?? "").trim() || (isTable ? "Table" : "");
      if (!label) continue;
      const dict = matchLabel(label);
      const base = {
        id: newId(),
        label,
        page,
        order: order++,
        confidence: typeof vf.confidence === "number" ? Math.round(vf.confidence) : 90,
        source: "ocr" as const,
        profileKey: dict?.profileKey,
        sensitive: dict?.sensitive,
        status: "pending" as const,
      };

      if (normType(vf.type) === "table") {
        fields.push({ ...base, ...buildTable(vf) });
        continue;
      }

      const type = normType(vf.type);
      const field: FormField = {
        ...base,
        type,
        bbox: gboxToBBox(vf.bbox),
        value: joinValue(vf.value),
      };
      if (type === "choice" && Array.isArray(vf.options)) {
        field.options = vf.options;
        if (Array.isArray(vf.optionBboxes)) {
          field.optionBboxes = vf.optionBboxes
            .map(gboxToBBox)
            .filter((b): b is BBox => b !== null);
          // keep parallel to options; drop if we couldn't recover a box per option
          if (field.optionBboxes.length !== vf.options.length) field.optionBboxes = undefined;
        }
      }
      // combLength drives per-box rendering; a boxed date (DD/MM/YYYY cells)
      // carries it too so its digits land in the boxes instead of as flat text.
      if ((type === "comb" || type === "date") && vf.combLength) field.combLength = vf.combLength;
      // Per-cell boxes for grouped combs (Aadhaar 4-4-4, dates) — kept only when
      // every cell converts, then re-spaced evenly within each group so digits
      // land dead-centre (the model gets group extents right but jitters cells).
      if ((type === "comb" || type === "date") && Array.isArray(vf.cellBboxes) && vf.cellBboxes.length) {
        const cells = vf.cellBboxes.map(gboxToBBox).filter((b): b is BBox => b !== null);
        if (cells.length === vf.cellBboxes.length) field.combCells = evenCellsInGroups(cells);
      }
      fields.push(field);
    }
  }

  return fields;
}

/**
 * Build the native "table" FormField the writer expects:
 *  - columns: data column headers (serial/# column dropped)
 *  - rows:    row labels
 *  - cells:   (BBox|null)[][] parallel to the value grid
 *  - value:   JSON.stringify of the 2D value grid (pdfWriter parses this)
 */
function buildTable(vf: VlmField): Pick<FormField, "type" | "bbox" | "value" | "columns" | "rows" | "cells"> {
  const cols = vf.columns ?? [];
  const keepCol = cols.map((c) => !SERIAL_COL.test(String(c).trim()));
  const columns = cols.filter((_, i) => keepCol[i]);

  const rowLabels: string[] = [];
  const cells: (BBox | null)[][] = [];
  const values: string[][] = [];
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  let anyBox = false;

  for (const r of vf.rows ?? []) {
    const cellArr = r.cells ?? [];
    // If the model included the serial cell too, drop the leading one.
    const offset = cellArr.length === cols.length + 1 ? 1 : 0;
    const rowCells: (BBox | null)[] = [];
    const rowVals: string[] = [];
    cols.forEach((_, i) => {
      if (!keepCol[i]) return;
      const c = cellArr[i + offset];
      const b = gboxToBBox(c?.bbox);
      rowCells.push(b);
      rowVals.push((c?.value ?? "").toString());
      if (b) {
        anyBox = true;
        minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
        maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
      }
    });
    rowLabels.push((r.rowLabel ?? "").toString());
    cells.push(rowCells);
    values.push(rowVals);
  }

  const bbox = anyBox ? { x: minX, y: minY, w: Math.max(maxX - minX, 0.01), h: Math.max(maxY - minY, 0.008) } : null;
  return { type: "table", bbox, columns, rows: rowLabels, cells, value: JSON.stringify(values) };
}
