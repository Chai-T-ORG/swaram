/**
 * Unit test for lib/analysis/tableCells.ts — expanding native table fields into
 * per-empty-cell questions and mirroring answers back into the value grid.
 *
 * Run: npx tsx scripts/table-cells.test.ts
 */
import { expandTableCells, applyCellValue, parseGrid, inferCellType, isListTable, parseCount, type CellRef, type RowCountRef } from "../lib/analysis/tableCells";
import type { FormField } from "../lib/types";

let passed = 0, failed = 0;
function ok(cond: boolean, msg: string) { if (cond) passed++; else { failed++; console.error("  ✗ " + msg); } }

const bb = () => ({ x: 0, y: 0, w: 0.1, h: 0.02 });

function makeTable(): FormField {
  return {
    id: "tbl1", label: "Academic Record", type: "table", page: 1, bbox: null,
    columns: ["Board", "Year", "Marks"],
    rows: ["SSLC", "HSE"],
    cells: [[bb(), bb(), bb()], [bb(), bb(), bb()]],
    // SSLC has Board+Year; SSLC/Marks and all of HSE are empty
    value: JSON.stringify([["Kerala Board", "2022", ""], ["", "", ""]]),
    order: 5, confidence: 90, source: "ocr", status: "pending",
  };
}

// ---- inferCellType ----
ok(inferCellType("Date of Admission") === "date", "date column -> date");
ok(inferCellType("Board / University") === "text", "text column -> text");

// ---- parseGrid pads/truncates ----
const g = parseGrid(JSON.stringify([["a"]]), 2, 3);
ok(g.length === 2 && g[0].length === 3 && g[0][0] === "a" && g[1][2] === "", "parseGrid pads to rows×cols");
ok(parseGrid("not json", 1, 2)[0].length === 2, "parseGrid tolerates bad JSON");

// ---- expandTableCells ----
const normalBefore: FormField = { id: "n1", label: "Full Name", type: "text", page: 0, bbox: bb(), order: 0, confidence: 90, source: "ocr", value: "", status: "pending" };
const table = makeTable();
const normalAfter: FormField = { id: "n2", label: "Email", type: "text", page: 1, bbox: bb(), order: 9, confidence: 90, source: "ocr", value: "", status: "pending" };

const cellMap = new Map<string, CellRef>();
const expanded = expandTableCells([normalBefore, table, normalAfter], cellMap);

// 2 normal + 4 empty cells (SSLC/Marks, HSE/Board, HSE/Year, HSE/Marks)
ok(expanded.length === 6, `expanded to 6 items, got ${expanded.length}`);
ok(expanded[0] === normalBefore, "normal field before passes through BY REFERENCE");
ok(expanded[expanded.length - 1] === normalAfter, "normal field after passes through BY REFERENCE");
ok(cellMap.size === 4, `cellMap has 4 entries, got ${cellMap.size}`);
ok(!expanded.some((f) => f.type === "table"), "no raw table field remains in the queue");

const synth = expanded.filter((f) => cellMap.has(f.id));
ok(synth.every((f) => f.label.startsWith("Academic Record — ")), "synthetic labels are Table — row — col");
ok(synth.some((f) => f.label === "Academic Record — HSE — Board"), "HSE/Board cell present");
ok(!synth.some((f) => f.label === "Academic Record — SSLC — Board"), "already-filled SSLC/Board NOT re-asked");
ok(synth.every((f) => f.bbox !== null), "synthetic cells carry their cell bbox");
ok(synth.every((f) => typeof f.question === "string" && f.question!.includes("what is the")), "synthetic cells have a spoken question");

// ---- table with row labels but NO cell bboxes must STILL expand (the "it
// skipped Academic Record" bug: an unexpanded table gets dropped by the fill
// loop, which auto-skips type "table") ----
const noCells: FormField = {
  id: "tblNC", label: "Academic Record", type: "table", page: 1, bbox: null,
  columns: ["Board", "Year"], rows: ["SSLC", "HSE"],
  cells: undefined, value: "",
  order: 5, confidence: 90, source: "ocr", status: "pending",
};
const cmNC = new Map<string, CellRef>();
const ncExpanded = expandTableCells([noCells], cmNC);
ok(ncExpanded.length === 4, `table without cells expands to 2×2=4, got ${ncExpanded.length}`);
ok(!ncExpanded.some((f) => f.type === "table"), "no raw table remains when cells are absent");
ok(ncExpanded.every((f) => f.bbox === null), "synthetic cells have null bbox when cell bboxes absent");
ok(cmNC.size === 4, "cellMap populated even without cell bboxes");

// ---- applyCellValue round-trips into the parent table ----
// Answer every empty cell; the grid should end fully populated in the right spots.
for (const f of synth) {
  const ref = cellMap.get(f.id)!;
  applyCellValue(table, ref, `${ref.row}-${ref.col}`);
}
const finalGrid = parseGrid(table.value, 2, 3);
ok(finalGrid[0][0] === "Kerala Board" && finalGrid[0][1] === "2022", "pre-filled SSLC cells preserved");
ok(finalGrid[0][2] === "0-2", "SSLC/Marks filled at [0][2]");
ok(finalGrid[1][0] === "1-0" && finalGrid[1][1] === "1-1" && finalGrid[1][2] === "1-2", "HSE row filled in correct columns");
ok(table.status === "answered", "table marked answered once cells filled");

// ---- list-table gating ("how many entries?") ----
ok(!isListTable(table), "descriptive-row table (SSLC/HSE) is NOT a list table");
const listTable: FormField = {
  id: "fam", label: "Family Members", type: "table", page: 2, bbox: null,
  columns: ["Name", "Age"], rows: ["1", "2", "3"],
  cells: [[bb(), bb()], [bb(), bb()], [bb(), bb()]],
  value: JSON.stringify([["", ""], ["", ""], ["", ""]]),
  order: 3, confidence: 90, source: "ocr", status: "pending",
};
ok(isListTable(listTable), "numeric-row table (1,2,3) IS a list table");

ok(parseCount("3") === 3 && parseCount("three") === 3 && parseCount("none") === 0, "parseCount digits/words/none");
ok(parseCount("add 2 people") === 2 && parseCount("banana") === null, "parseCount extracts / rejects");

const cm = new Map<string, CellRef>();
const rcm = new Map<string, RowCountRef>();
const listExpanded = expandTableCells([listTable], cm, rcm);
ok(rcm.size === 1, "one row-count question emitted for the list table");
const countField = listExpanded.find((f) => rcm.has(f.id))!;
ok(!!countField && /how many/i.test(countField.question ?? ""), "count question is spoken naturally");
ok(rcm.get(countField.id)!.maxRows === 3, "count question knows the max rows");
ok(listExpanded.length === 1 + 6, "count question + 3 rows × 2 cols cells");
ok(listExpanded[0] === countField, "count question comes BEFORE the cells");

// simulate the useFillSession prune: keep 2 entries -> drop row-2 cells
const keep = 2;
const pos = 0; // count question at position 0
const pruned = listExpanded.filter((qf, i) => {
  if (i <= pos) return true;
  const c = cm.get(qf.id);
  return !(c && c.tableId === "fam" && c.row >= keep);
});
ok(pruned.length === 1 + 4, "after answering 2: count + 2 rows × 2 cols");
ok(!pruned.some((f) => cm.get(f.id)?.row === 2), "row 3's cells were pruned");

// without a rowCountMap, no count question (backward compatible)
ok(expandTableCells([listTable], new Map()).length === 6, "no count question when rowCountMap omitted");

console.log(`\ntable-cells.test: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
