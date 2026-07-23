/**
 * Unit test for lib/analysis/vlmAdapter.ts — maps the raw Gemini vision schema
 * into FormField[]. Uses a synthetic raw fixture (no network) that exercises
 * every branch: text/date/comb/signature, choice with & without optionBboxes,
 * array (multi-select) values, and native tables with and without a serial
 * column.
 *
 * Run: npx tsx scripts/vlm-adapter.test.ts
 */
import { schemaToFields, gboxToBBox, evenCellsInGroups, type VlmPage } from "../lib/analysis/vlmAdapter";
import type { BBox } from "../lib/types";
import type { FormField } from "../lib/types";

let passed = 0;
let failed = 0;
function ok(cond: boolean, msg: string) {
  if (cond) { passed++; } else { failed++; console.error("  ✗ " + msg); }
}
function near(a: number, b: number, eps = 1e-6) { return Math.abs(a - b) < eps; }

// ---- coordinate conversion ----
const b = gboxToBBox([100, 200, 140, 800]);
ok(!!b && near(b.x, 0.2) && near(b.y, 0.1) && near(b.w, 0.6) && near(b.h, 0.04),
  `gboxToBBox [100,200,140,800] -> {x:.2,y:.1,w:.6,h:.04}, got ${JSON.stringify(b)}`);
ok(gboxToBBox(undefined) === null, "gboxToBBox(undefined) is null");
ok(gboxToBBox([1, 2, 3] as unknown as [number, number, number, number]) === null, "gboxToBBox(bad len) is null");

// ---- synthetic raw page schema ----
const pages: VlmPage[] = [
  {
    page: 0,
    fields: [
      { label: "Full Name", type: "comb", combLength: 20, value: "ANJALI S NAIR", bbox: [312, 112, 335, 680] },
      { label: "Date of Birth", type: "date", combLength: 8, value: "14/07/2007", bbox: [365, 251, 390, 461] },
      { label: "Mobile Number", type: "comb", combLength: 10, value: "9847213560", bbox: [560, 352, 583, 581] },
      {
        label: "Gender", type: "choice", value: "Female",
        options: ["Male", "Female", "Other"],
        optionBboxes: [[368, 651, 388, 690], [368, 740, 388, 780], [368, 850, 388, 888]],
        bbox: [368, 651, 390, 888],
      },
      {
        // choice WITHOUT optionBboxes -> options kept, optionBboxes undefined
        label: "Account Type", type: "choice", value: "Savings",
        options: ["Savings", "Current"], bbox: [631, 700, 651, 900],
      },
      {
        // multi-select value returned as an array -> joined
        label: "Documents Enclosed", type: "choice",
        value: ["Income Certificate", "Aadhaar copy"],
        options: ["Income Certificate", "Aadhaar copy", "Bonafide Certificate"],
        optionBboxes: [[210, 108, 226, 124], [230, 108, 246, 124], [250, 108, 266, 124]],
        bbox: [210, 108, 275, 705],
      },
      { label: "Applicant Signature", type: "signature", value: "", bbox: [880, 140, 980, 450] },
    ],
  },
  {
    page: 1,
    fields: [
      {
        // table WITHOUT a serial column (Academic-style): 5 data columns
        label: "Academic Record", type: "table",
        columns: ["Board / University", "Year", "Max. Marks", "Marks Obt.", "% / CGPA"],
        rows: [
          { rowLabel: "SSLC / Class X", cells: [
            { value: "Kerala State Board", bbox: [510, 150, 530, 360] },
            { value: "2022", bbox: [510, 360, 530, 470] },
            { value: "500", bbox: [510, 470, 530, 580] },
            { value: "489", bbox: [510, 580, 530, 690] },
            { value: "97.8%", bbox: [510, 690, 530, 800] },
          ] },
          { rowLabel: "HSE / Class XII", cells: [
            { value: "Kerala State Board", bbox: [540, 150, 560, 360] },
            { value: "2024", bbox: [540, 360, 560, 470] },
            { value: "500", bbox: [540, 470, 560, 580] },
            { value: "465", bbox: [540, 580, 560, 690] },
            { value: "93.0%", bbox: [540, 690, 560, 800] },
          ] },
        ],
      },
      {
        // table WITH a serial "#" column (Family-style): cells include the serial value
        label: "Particulars of Family Members", type: "table",
        columns: ["#", "Name", "Relationship", "Age", "Occupation", "Annual Income (Rs.)"],
        rows: [
          { rowLabel: "1", cells: [
            { value: "1", bbox: [448, 140, 470, 160] },
            { value: "Anjali S Nair", bbox: [448, 160, 470, 400] },
            { value: "Self", bbox: [448, 400, 470, 540] },
            { value: "19", bbox: [448, 540, 470, 610] },
            { value: "Student", bbox: [448, 610, 470, 790] },
            { value: "0", bbox: [448, 790, 470, 920] },
          ] },
        ],
      },
    ],
  },
];

const fields = schemaToFields(pages);
const byLabel = (l: string) => fields.find((f) => f.label === l) as FormField;

// ---- counts / ordering ----
ok(fields.length === 9, `9 fields produced, got ${fields.length}`);
ok(fields.every((f, i) => f.order === i), "order is sequential 0..n");
ok(fields.every((f) => typeof f.id === "string" && f.id.length > 0), "every field has an id");

// ---- scalar fields ----
const name = byLabel("Full Name");
ok(name.type === "comb" && name.combLength === 20, "Full Name is comb/20");
ok(name.value === "ANJALI S NAIR", "Full Name value carried");
ok(!!name.bbox && near(name.bbox.x, 0.112), "Full Name bbox converted");

ok(byLabel("Date of Birth").type === "date", "DOB is date");
ok(byLabel("Date of Birth").combLength === 8, "boxed date carries combLength (renders per-box)");
ok(byLabel("Applicant Signature").type === "signature", "signature typed");

// ---- profileKey / sensitive from the dictionary ----
ok(!!name.profileKey, `Full Name got a profileKey (${name.profileKey})`);
const mobile = byLabel("Mobile Number");
ok(!!mobile.profileKey, `Mobile got a profileKey (${mobile.profileKey})`);

// ---- choice: optionBboxes parity ----
const gender = byLabel("Gender");
ok(gender.type === "choice" && gender.options?.length === 3, "Gender choice/3 options");
ok(gender.optionBboxes?.length === 3, "Gender has 3 optionBboxes (parallel)");
ok(!!gender.optionBboxes && near(gender.optionBboxes[1].x, 0.74), "Gender option[1] box converted");

const acct = byLabel("Account Type");
ok(acct.options?.length === 2 && acct.optionBboxes === undefined, "Account Type: options kept, no optionBboxes");

const docs = byLabel("Documents Enclosed");
ok(docs.value === "Income Certificate, Aadhaar copy", "multi-select value joined");
ok(docs.optionBboxes?.length === 3, "Documents optionBboxes parallel to options");

// ---- native tables ----
const acad = byLabel("Academic Record");
ok(acad.type === "table", "Academic Record is table");
ok(JSON.stringify(acad.columns) === JSON.stringify(["Board / University", "Year", "Max. Marks", "Marks Obt.", "% / CGPA"]), "academic columns intact");
ok(acad.rows?.length === 2 && acad.cells?.length === 2, "academic 2 rows / 2 cell-rows");
ok(acad.cells?.[0].length === 5, "academic row has 5 cells");
{
  const grid = JSON.parse(acad.value) as string[][];
  ok(grid[0][0] === "Kerala State Board" && grid[0][4] === "97.8%", "academic row0 values in order");
  ok(grid[1][3] === "465", "academic HSE Marks Obt = 465 (correct column)");
}

const fam = byLabel("Particulars of Family Members");
ok(JSON.stringify(fam.columns) === JSON.stringify(["Name", "Relationship", "Age", "Occupation", "Annual Income (Rs.)"]), "family serial '#' column dropped");
{
  const grid = JSON.parse(fam.value) as string[][];
  ok(grid[0].length === 5, "family row has 5 data cells (serial dropped)");
  ok(grid[0][0] === "Anjali S Nair" && grid[0][2] === "19" && grid[0][4] === "0", "family values aligned after dropping serial");
  ok(fam.cells?.[0].length === 5, "family cell bboxes parallel to 5 data cols");
}

// ---- grouped-comb per-cell boxes (combCells) ----
{
  const pages2: VlmPage[] = [{
    page: 0, fields: [
      {
        label: "Aadhaar Number", type: "comb", combLength: 3, value: "123",
        bbox: [498, 352, 521, 657],
        cellBboxes: [[498, 352, 521, 400], [498, 420, 521, 468], [498, 500, 521, 548]],
      },
      // contiguous comb, no cellBboxes -> must fall back to uniform (undefined)
      { label: "Register Number", type: "comb", combLength: 5, value: "ABC12", bbox: [188, 359, 231, 681] },
    ],
  }];
  const f2 = schemaToFields(pages2);
  const aadhaar = f2.find((f) => f.label === "Aadhaar Number")!;
  ok(aadhaar.combCells?.length === 3, "grouped comb carries combCells (3)");
  ok(!!aadhaar.combCells && near(aadhaar.combCells[0].x, 0.352), "combCells[0] converted to fraction");
  ok(f2.find((f) => f.label === "Register Number")!.combCells === undefined,
    "contiguous comb without cellBboxes -> combCells undefined (uniform fallback preserved)");
}

// ---- evenCellsInGroups: re-space comb cells evenly within each group ----
{
  const c = (x: number, w: number): BBox => ({ x, y: 0.5, w, h: 0.01 });
  // Aadhaar-like 4-4-4: last cell of each group too wide, ~15% gap between groups
  const cells: BBox[] = [
    c(0.353, 0.02), c(0.373, 0.02), c(0.393, 0.02), c(0.413, 0.031),
    c(0.459, 0.02), c(0.479, 0.02), c(0.499, 0.02), c(0.519, 0.031),
    c(0.565, 0.02), c(0.585, 0.02), c(0.605, 0.02), c(0.625, 0.031),
  ];
  const even = evenCellsInGroups(cells);
  ok(even.length === 12, "12 cells preserved");
  ok(Math.abs(even[0].x - 0.353) < 1e-6, "group-1 left extent preserved");
  ok(Math.abs(even[3].x + even[3].w - 0.444) < 1e-4, "group-1 right extent preserved");
  ok(Math.abs(even[1].x - even[0].x - 0.02275) < 1e-4, "even spacing within group (~0.02275)");
  ok(Math.abs(even[0].w - even[3].w) < 1e-9, "all cells in a group share one width");
  ok(Math.abs(even[4].x - 0.459) < 1e-6, "next group starts at its own left (gap preserved)");
  ok(evenCellsInGroups([c(0.1, 0.02)]).length === 1, "single cell returned unchanged");
}

// A table with NO caption/label must survive (fallback label), not be dropped
// as a captionless field — the "Academic Record vanished" class of bug.
{
  const noLabelTable: VlmPage[] = [{
    page: 1,
    fields: [{
      label: "", type: "table",
      columns: ["Board", "Year"],
      rows: [
        { rowLabel: "SSLC", cells: [{ value: "", bbox: [1, 1, 2, 2] }, { value: "", bbox: [1, 3, 2, 4] }] },
        { rowLabel: "HSE", cells: [{ value: "", bbox: [3, 1, 4, 2] }, { value: "", bbox: [3, 3, 4, 4] }] },
      ],
    }] as unknown as VlmPage["fields"],
  }];
  const out = schemaToFields(noLabelTable);
  ok(out.length === 1, `captionless table survives, got ${out.length}`);
  ok(out[0]?.type === "table", "survivor is a table");
  ok(!!out[0]?.label, "captionless table gets a fallback label");
  ok((out[0]?.columns?.length ?? 0) === 2 && (out[0]?.rows?.length ?? 0) === 2, "table structure intact");
}

console.log(`\nvlm-adapter.test: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
