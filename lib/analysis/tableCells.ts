/**
 * tableCells.ts — pure helpers for filling native "table" fields by voice.
 *
 * A table FormField carries columns[], rows[] (row labels), cells[][] (per-cell
 * bboxes) and value = JSON.stringify(string[][]) (the value grid the pdf writer
 * draws). The voice loop can't ask a "table" as one question, so at fill time we
 * expand each EMPTY cell into a synthetic scalar field (kept only in the queue),
 * and mirror each committed answer back into the parent table's value grid.
 */
import type { FormField } from "../types";
import { newId } from "../types";

export interface CellRef {
  tableId: string;
  row: number;
  col: number;
}

export function inferCellType(columnName: string): FormField["type"] {
  return /\bdate\b|d\.?o\.?b\.?|birth/i.test(columnName) ? "date" : "text";
}

export interface RowCountRef {
  tableId: string;
  maxRows: number;
}

/**
 * A "list" table has generic rows the applicant supplies (serial numbers or
 * blank labels) — e.g. family members #1..#5 — so we ask "how many?" up front.
 * A table with descriptive row labels (SSLC, HSE, Semester 1) is a fixed grid;
 * every row is asked.
 */
export function isListTable(table: FormField): boolean {
  const rows = table.rows ?? [];
  if (rows.length < 2) return false;
  return rows.every((r) => r.trim() === "" || /^\d+$/.test(r.trim()));
}

const NUMBER_WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, none: 0,
};

/** Parse a spoken/typed row count ("3", "three", "none"); null if unrecognized. */
export function parseCount(s: string): number | null {
  const digits = s.match(/\d+/);
  if (digits) return Math.max(0, parseInt(digits[0], 10));
  const word = s.toLowerCase().match(/\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|none)\b/);
  return word ? NUMBER_WORDS[word[1]] : null;
}

/** Parse a table's JSON value into a rows×cols string grid, padding/truncating. */
export function parseGrid(value: string, rows: number, cols: number): string[][] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value || "[]");
  } catch {
    parsed = null;
  }
  const arr = Array.isArray(parsed) ? (parsed as unknown[][]) : [];
  const out: string[][] = [];
  for (let r = 0; r < rows; r++) {
    const row: string[] = [];
    for (let c = 0; c < cols; c++) row.push(String(arr[r]?.[c] ?? ""));
    out.push(row);
  }
  return out;
}

/**
 * Replace each table field with a synthetic scalar field per EMPTY cell (so the
 * existing ask/answer/confirm machinery works unchanged). Non-table fields pass
 * through by reference. Populates `cellMap` (synthetic id -> table/row/col).
 */
export function expandTableCells(
  fields: FormField[],
  cellMap: Map<string, CellRef>,
  rowCountMap?: Map<string, RowCountRef>,
): FormField[] {
  const out: FormField[] = [];
  for (const f of fields) {
    if (f.type !== "table" || !f.columns?.length || !f.cells?.length) {
      out.push(f);
      continue;
    }
    const rows = f.rows?.length ?? f.cells.length;
    const cols = f.columns.length;
    const grid = parseGrid(f.value, rows, cols);
    // For list tables (family members etc.) ask "how many?" first, so an empty
    // 5-row table doesn't become 25 questions. Only when we can track it.
    if (rowCountMap && isListTable(f) && !grid.some((row) => row.some((v) => v.trim()))) {
      const countId = newId();
      out.push({
        id: countId,
        label: `${f.label} — number of entries`,
        type: "text",
        page: f.page,
        bbox: null,
        order: f.order,
        confidence: f.confidence,
        source: f.source,
        value: "",
        status: "pending",
        question: `How many entries do you want to add for ${f.label}? Say a number, up to ${f.cells.length}.`,
      });
      rowCountMap.set(countId, { tableId: f.id, maxRows: f.cells.length });
    }
    for (let r = 0; r < f.cells.length; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r]?.[c]?.trim()) continue; // already has a value — don't re-ask
        const colName = f.columns[c] ?? `Column ${c + 1}`;
        const rowName = f.rows?.[r] ?? `Row ${r + 1}`;
        const syn: FormField = {
          id: newId(),
          label: `${f.label} — ${rowName} — ${colName}`,
          type: inferCellType(colName),
          page: f.page,
          bbox: f.cells[r]?.[c] ?? null,
          order: f.order,
          confidence: f.confidence,
          source: f.source,
          value: "",
          status: "pending",
          question: `For ${rowName}: what is the ${colName}?`,
        };
        out.push(syn);
        cellMap.set(syn.id, { tableId: f.id, row: r, col: c });
      }
    }
  }
  return out;
}

/** Human-readable summary of a filled table, for display and speech.
 *  "" when no cell has a value (so callers can fall back to a "Blank" label). */
export function describeTable(table: FormField): string {
  if (!table.columns?.length) return "";
  const rows = table.rows?.length ?? table.cells?.length ?? 0;
  const grid = parseGrid(table.value, rows, table.columns.length);
  const parts: string[] = [];
  grid.forEach((row, r) => {
    const filled = row
      .map((v, c) => (v.trim() ? `${table.columns![c]}: ${v.trim()}` : null))
      .filter((s): s is string => s !== null);
    if (filled.length) parts.push(`${table.rows?.[r] ?? `Row ${r + 1}`} — ${filled.join(", ")}`);
  });
  return parts.join("; ");
}

/** Value to show/speak for a field: a readable summary for tables, else the raw value. */
export function fieldDisplayValue(field: FormField): string {
  return field.type === "table" ? describeTable(field) : field.value;
}

/** Mirror one committed cell answer into its parent table's value grid + status. */
export function applyCellValue(table: FormField, cell: CellRef, value: string): void {
  if (!table.columns?.length) return;
  const rows = table.rows?.length ?? table.cells?.length ?? 0;
  const cols = table.columns.length;
  const grid = parseGrid(table.value, rows, cols);
  if (!grid[cell.row]) return;
  grid[cell.row][cell.col] = value;
  table.value = JSON.stringify(grid);
  table.status = grid.some((row) => row.some((v) => v.trim())) ? "answered" : "pending";
}
