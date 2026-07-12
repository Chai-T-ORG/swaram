/**
 * Node smoke test for the browser-independent core:
 * dictionary matching, profile sanitization, clustering, field inference,
 * AcroForm extract + fill round-trip, and flat-PDF coordinate write-back.
 *
 * Run: npx tsx scripts/smoke.test.ts
 */
import { PDFDocument, PDFTextField } from "pdf-lib";
import { matchLabel, isNonFillableLabel } from "../lib/matching/keywordDictionary";
import { matchFieldsToProfile, extractProfileUpdates } from "../lib/matching/fuzzyProfileMatch";
import { sanitizeProfile, isForbiddenProfileKey } from "../lib/storage/profileStore";
import { orderFields } from "../lib/vision/fieldClusterer";
import { inferFieldsFromPage } from "../lib/analysis/analyzeForm";
import { detectAcroform, extractAcroformFields } from "../lib/pdf/acroformDetector";
import {
  formatEmail,
  formatPhone,
  formatDate,
  formatAnswer,
  titleCase,
  wordsToDigits,
  spellTokensToText,
} from "../lib/voice/transcriptFormat";
import { fillAcroformPdf, fillFlatPdf } from "../lib/pdf/pdfWriter";
import { parseFillCommand, needsConfirmation, isNameField } from "../lib/voice/fillCommands";
import type { FormField } from "../lib/types";
import type { OcrLine } from "../lib/ocr/tesseractEngine";

let failures = 0;
function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    console.log(`  ✓ ${name}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${name} ${detail}`);
  }
}

function field(partial: Partial<FormField>): FormField {
  return {
    id: Math.random().toString(36).slice(2),
    label: "Field",
    type: "text",
    page: 0,
    bbox: null,
    order: 0,
    confidence: 90,
    source: "ocr",
    value: "",
    status: "pending",
    ...partial,
  };
}

async function main() {
  console.log("1. Keyword dictionary");
  check("matches 'Name of the Candidate'", matchLabel("Name of the Candidate")?.key === "full_name");
  check("matches 'D.O.B:'", matchLabel("D.O.B:")?.key === "date_of_birth");
  check("prefers father over name", matchLabel("Father's Name")?.key === "father_name");
  check("matches aadhaar as sensitive", matchLabel("Aadhaar No")?.sensitive === true);
  check("matches 'Mobile No.'", matchLabel("Mobile No.")?.key === "phone");
  check("no match for prose", matchLabel("Please fill this form carefully") === null);

  console.log("2. Profile sanitization");
  const dirty = { full_name: "Arun", aadhaar_number: "1234", pan_card: "X", email: " a@b.c " };
  const clean = sanitizeProfile(dirty);
  check("keeps normal keys", clean.full_name === "Arun" && clean.email === "a@b.c");
  check("strips aadhaar", !("aadhaar_number" in clean));
  check("strips pan", !("pan_card" in clean));
  check("isForbiddenProfileKey('Aadhaar No')", isForbiddenProfileKey("Aadhaar No"));

  console.log("3. Fuzzy profile match");
  const fields = [
    field({ id: "f1", label: "Full Name", profileKey: "full_name" }),
    field({ id: "f2", label: "Applicant Nam" }), // OCR typo — fuzzy should still hit
    field({ id: "f3", label: "Aadhaar Number", sensitive: true }),
    field({ id: "f4", label: "Roll Number" }),
  ];
  const profile = { full_name: "Arun Kumar", phone: "98765" };
  const matches = matchFieldsToProfile(fields, profile);
  check("dictionary-keyed field matches", matches.some((m) => m.fieldId === "f1" && m.value === "Arun Kumar"));
  check("sensitive field never matches", !matches.some((m) => m.fieldId === "f3"));
  const updates = extractProfileUpdates([
    field({ label: "Full Name", profileKey: "full_name", value: "Arun", status: "answered" }),
    field({ label: "Aadhaar Number", sensitive: true, profileKey: undefined, value: "1234 5678", status: "answered" }),
  ]);
  check("profile updates include name", updates.full_name === "Arun");
  check("profile updates exclude sensitive", Object.keys(updates).length === 1);

  console.log("4. Column clustering + reading order");
  const ordered = orderFields([
    field({ id: "rightTop", bbox: { x: 0.55, y: 0.1, w: 0.3, h: 0.02 } }),
    field({ id: "leftBottom", bbox: { x: 0.05, y: 0.8, w: 0.3, h: 0.02 } }),
    field({ id: "leftTop", bbox: { x: 0.06, y: 0.1, w: 0.3, h: 0.02 } }),
    field({ id: "rightBottom", bbox: { x: 0.56, y: 0.7, w: 0.3, h: 0.02 } }),
  ]);
  check(
    "left column first, top to bottom",
    ordered.map((f) => f.id).join(",") === "leftTop,leftBottom,rightTop,rightBottom",
    `got ${ordered.map((f) => f.id).join(",")}`,
  );

  console.log("5. OCR field inference");
  const mkLine = (text: string, x0: number, y0: number, conf = 92): OcrLine => ({
    text,
    confidence: conf,
    bbox: { x0, y0, x1: x0 + text.length * 12, y1: y0 + 24 },
    words: text.split(" ").map((w, i) => ({
      text: w,
      confidence: conf,
      bbox: { x0: x0 + i * 60, y0, x1: x0 + i * 60 + 50, y1: y0 + 24 },
    })),
  });
  const lines: OcrLine[] = [
    mkLine("Name: ____________", 50, 100),
    mkLine("Date of Birth: ____________", 50, 160),
    mkLine("This is a very long instruction sentence that should not be a field at all", 50, 220),
    mkLine("PARISH", 50, 280, 40), // low confidence garbage label with underscores
    mkLine("Gender", 50, 340),
    mkLine("Male", 160, 400),
    mkLine("Female", 360, 400),
  ];
  const shapes = [
    { kind: "line" as const, x: 120, y: 300, w: 300, h: 3 }, // under PARISH
    { kind: "checkbox" as const, x: 120, y: 395, w: 24, h: 24 },
    { kind: "checkbox" as const, x: 320, y: 395, w: 24, h: 24 },
  ];
  const inferred = inferFieldsFromPage(lines, shapes, 1000, 1400, 0);
  const labels = inferred.map((f) => `${f.label}(${f.type})`).join(", ");
  check("finds Full Name", inferred.some((f) => f.label === "Full Name" && f.type === "text"), labels);
  check("finds Date of Birth as date", inferred.some((f) => f.label === "Date of Birth" && f.type === "date"), labels);
  check("skips prose line", !inferred.some((f) => f.label.includes("instruction")), labels);
  check("keeps low-confidence PARISH for unclear flow", inferred.some((f) => f.label === "PARISH" && f.confidence < 60), labels);
  const choice = inferred.find((f) => f.type === "choice");
  check("checkbox pair becomes choice", Boolean(choice), labels);
  check("choice options read from words", Boolean(choice?.options?.some((o) => /male/i.test(o))), JSON.stringify(choice?.options));

  console.log("6. AcroForm round-trip");
  const doc = await PDFDocument.create();
  const page = doc.addPage([600, 800]);
  const form = doc.getForm();
  const nameField = form.createTextField("full_name");
  nameField.addToPage(page, { x: 100, y: 700, width: 300, height: 24 });
  const hostel = form.createCheckBox("hostel_required");
  hostel.addToPage(page, { x: 100, y: 650, width: 20, height: 20 });
  const gender = form.createRadioGroup("gender");
  gender.addOptionToPage("Male", page, { x: 100, y: 600, width: 20, height: 20 });
  gender.addOptionToPage("Female", page, { x: 200, y: 600, width: 20, height: 20 });
  const bytes = (await doc.save()).buffer as ArrayBuffer;

  const detection = await detectAcroform(bytes);
  check("detects AcroForm", detection.isAcroForm && detection.fieldCount === 3, JSON.stringify(detection));
  const extraction = await extractAcroformFields(bytes);
  check("extracts 3 fields", extraction.fields.length === 3);
  const extractedName = extraction.fields.find((f) => f.acroName === "full_name");
  check("maps full_name to dictionary label", extractedName?.label === "Full Name" && extractedName.profileKey === "full_name");
  const extractedGender = extraction.fields.find((f) => f.acroName === "gender");
  check("radio becomes choice with options", extractedGender?.type === "choice" && extractedGender.options?.length === 2);
  check("widget bbox extracted", Boolean(extractedName?.bbox && extractedName.bbox.y < 0.2));

  const filledFields = extraction.fields.map((f) => ({
    ...f,
    value: f.acroName === "full_name" ? "Arun Kumar" : f.acroName === "hostel_required" ? "Yes" : "Male",
    status: "answered" as const,
  }));
  const filledBytes = await fillAcroformPdf(bytes, filledFields);
  check("filled PDF is a PDF", String.fromCharCode(...filledBytes.slice(0, 5)) === "%PDF-");
  const reloaded = await PDFDocument.load(filledBytes.slice().buffer as ArrayBuffer);
  const remaining = reloaded.getForm().getFields();
  const stillText = remaining.find((f): f is PDFTextField => f instanceof PDFTextField);
  check("form flattened or value written", remaining.length === 0 || stillText?.getText() === "Arun Kumar");

  console.log("7. Flat PDF coordinate write-back");
  const flatDoc = await PDFDocument.create();
  flatDoc.addPage([600, 800]);
  const flatBytes = (await flatDoc.save()).buffer as ArrayBuffer;
  const flatFilled = await fillFlatPdf(flatBytes, [
    field({ value: "Arun Kumar", status: "answered", bbox: { x: 0.2, y: 0.1, w: 0.5, h: 0.03 } }),
    field({ type: "checkbox", value: "Yes", status: "answered", bbox: { x: 0.2, y: 0.2, w: 0.03, h: 0.02 } }),
  ]);
  const flatReloaded = await PDFDocument.load(flatFilled.slice().buffer as ArrayBuffer);
  check("flat write-back produces valid 1-page PDF", flatReloaded.getPageCount() === 1);
  check("flat write-back grew the file", flatFilled.length > (flatBytes as ArrayBuffer).byteLength);

  console.log("8. Transcript formatting");
  check(
    "email: 'arun kumar at gmail dot com'",
    formatEmail("arun kumar at gmail dot com") === "arunkumar@gmail.com",
    formatEmail("arun kumar at gmail dot com"),
  );
  check(
    "email: 'a k 9 at the rate of yahoo dot co dot in'",
    formatEmail("a k nine at the rate of yahoo dot co dot in") === "ak9@yahoo.co.in",
    formatEmail("a k nine at the rate of yahoo dot co dot in"),
  );
  check("phone: 'nine eight seven six five double four three two one'", formatPhone("nine eight seven six five double four three two one") === "9876544321");
  check("phone digits pass through", formatPhone("98765 43210") === "9876543210");
  check("date: '25th of May 2002'", formatDate("25th of May 2002") === "25/05/2002");
  check("date: 'may 25 2002'", formatDate("may 25 2002") === "25/05/2002");
  check("date numeric: '25 5 02'", formatDate("25 5 02") === "25/05/2002");
  check("titleCase names", titleCase("arun kumar s-o ramesh") === "Arun Kumar S-O Ramesh");
  check("digits: 'double nine one'", wordsToDigits("double nine one") === "991");
  const fmtNameField = field({ label: "Full Name", profileKey: "full_name" });
  check("formatAnswer capitalizes names", formatAnswer("arun kumar", fmtNameField) === "Arun Kumar");
  const genericField = field({ label: "Remarks" });
  check(
    "formatAnswer spoken punctuation",
    formatAnswer("i live in kochi comma kerala full stop", genericField) === "I live in kochi, kerala.",
    formatAnswer("i live in kochi comma kerala full stop", genericField),
  );

  console.log("9. Multi-field line splitting");
  const multiLine: OcrLine = {
    text: "Name: ______ Date: ______",
    confidence: 90,
    bbox: { x0: 50, y0: 500, x1: 900, y1: 524 },
    words: [
      { text: "Name:", confidence: 92, bbox: { x0: 50, y0: 500, x1: 120, y1: 524 } },
      { text: "______", confidence: 60, bbox: { x0: 130, y0: 500, x1: 380, y1: 524 } },
      { text: "Date:", confidence: 93, bbox: { x0: 420, y0: 500, x1: 480, y1: 524 } },
      { text: "______", confidence: 60, bbox: { x0: 490, y0: 500, x1: 860, y1: 524 } },
    ],
  };
  const multiFields = inferFieldsFromPage([multiLine], [], 1000, 1400, 0);
  check(
    "splits into two fields",
    multiFields.length === 2,
    multiFields.map((f) => f.label).join(","),
  );
  check("first is Full Name", multiFields[0]?.label === "Full Name");
  check("second is Date", multiFields[1]?.label === "Date" && multiFields[1]?.type === "date");
  check(
    "answer areas don't overlap",
    Boolean(
      multiFields[0]?.bbox &&
        multiFields[1]?.bbox &&
        multiFields[0].bbox.x + multiFields[0].bbox.w <= multiFields[1].bbox.x + 0.01,
    ),
  );

  console.log("10. Real-form label matching");
  check("Father's / Guardian's Name", matchLabel("Father's / Guardian's Name")?.key === "father_name");
  check("Mother's Name", matchLabel("Mother's Name")?.key === "mother_name");
  check("Bank Name & Branch", matchLabel("Bank Name & Branch")?.key === "bank_name");
  check("Annual Family Income (Rs.)", matchLabel("Annual Family Income (Rs.)")?.key === "annual_income");
  check("Percentage / CGPA", matchLabel("Previous Academic Year Percentage / CGPA")?.key === "percentage");
  check("IFSC Code", matchLabel("IFSC Code")?.key === "ifsc");
  check("signature is non-fillable", isNonFillableLabel("Signature of Applicant"));
  check("photo box is non-fillable", isNonFillableLabel("Affix Passport Size Photo"));
  check("declaration is non-fillable", isNonFillableLabel("5. DECLARATION"));
  check("Full Name is fillable", !isNonFillableLabel("Full Name"));

  console.log("11. Spell-by-letter input");
  check("plain letters", spellTokensToText("t w i n s h a space t") === "twinsha t", spellTokensToText("t w i n s h a space t"));
  check("letter homophones", spellTokensToText("bee ee en") === "ben", spellTokensToText("bee ee en"));
  check("double letters", spellTokensToText("double el o") === "llo", spellTokensToText("double el o"));
  check("digits in spelling", spellTokensToText("a k nine eight") === "ak98");

  console.log("12. Options printed on the label line -> choice field");
  const mkWord = (text: string, x0: number, y0 = 500, w = text.length * 11) => ({
    text,
    confidence: 91,
    bbox: { x0, y0, x1: x0 + w, y1: y0 + 24 },
  });
  const occupationWords = [
    mkWord("Father's", 50),
    mkWord("Occupation:", 145),
    mkWord("Salaried", 320),
    mkWord("Self-employed", 470),
    mkWord("Farmer", 680),
    mkWord("Other", 830),
  ];
  const occupationLine: OcrLine = {
    text: "Father's Occupation: Salaried Self-employed Farmer Other",
    confidence: 91,
    bbox: { x0: 50, y0: 500, x1: 940, y1: 524 },
    words: occupationWords,
  };
  const occFields = inferFieldsFromPage([occupationLine], [], 1000, 1400, 0);
  const occChoice = occFields.find((f) => f.type === "choice");
  check("occupation row becomes one choice field", occFields.length === 1 && Boolean(occChoice), JSON.stringify(occFields.map((f) => f.label)));
  check("occupation options read from gaps", occChoice?.options?.length === 4 && occChoice.options.includes("Salaried") && occChoice.options.includes("Other"), JSON.stringify(occChoice?.options));
  check("occupation has tick boxes per option", occChoice?.optionBboxes?.length === 4);
  check("occupation label from dictionary", occChoice?.label === "Occupation");

  console.log("13. (tick one) header -> next line options");
  const headerLine: OcrLine = {
    text: "4. SCHOLARSHIP CATEGORY (tick one)",
    confidence: 92,
    bbox: { x0: 50, y0: 100, x1: 500, y1: 124 },
    words: [mkWord("4.", 50, 100), mkWord("SCHOLARSHIP", 90, 100), mkWord("CATEGORY", 250, 100), mkWord("(tick", 380, 100), mkWord("one)", 445, 100)],
  };
  const optionsLine: OcrLine = {
    text: "Merit-based Means-based Sports Quota Disability",
    confidence: 90,
    bbox: { x0: 60, y0: 150, x1: 900, y1: 174 },
    words: [
      mkWord("Merit-based", 60, 150),
      mkWord("Means-based", 300, 150),
      mkWord("Sports", 560, 150),
      mkWord("Quota", 640, 150),
      mkWord("Disability", 800, 150),
    ],
  };
  const catFields = inferFieldsFromPage([headerLine, optionsLine], [], 1000, 1400, 0);
  const catChoice = catFields.find((f) => f.type === "choice");
  check("tick-one header yields a choice", Boolean(catChoice), JSON.stringify(catFields.map((f) => `${f.label}:${f.type}`)));
  check("category options detected", (catChoice?.options?.length ?? 0) >= 3, JSON.stringify(catChoice?.options));
  check("category label matched", catChoice?.label === "Category", catChoice?.label);
  check("header line itself is not a separate field", catFields.length === 1);

  console.log("14. Underscore geometry: answer sits ON the blank, not after it");
  const motherLine: OcrLine = {
    text: "Mother's Name: ____________",
    confidence: 93,
    bbox: { x0: 50, y0: 300, x1: 480, y1: 324 },
    words: [mkWord("Mother's", 50, 300), mkWord("Name:", 145, 300), { text: "____________", confidence: 50, bbox: { x0: 215, y0: 300, x1: 480, y1: 324 } }],
  };
  const motherFields = inferFieldsFromPage([motherLine], [], 1000, 1400, 0);
  const mother = motherFields[0];
  check("mother's name field found", mother?.label === "Mother's Name", mother?.label);
  check(
    "answer area starts at the blank, after the label",
    Boolean(mother?.bbox && mother.bbox.x >= 0.2 && mother.bbox.x <= 0.23),
    JSON.stringify(mother?.bbox),
  );
  check(
    "answer area ends at the blank's end, not page edge",
    Boolean(mother?.bbox && mother.bbox.x + mother.bbox.w <= 0.5),
    JSON.stringify(mother?.bbox),
  );

  console.log("15. Writer ticks the chosen option box");
  const tickDoc = await PDFDocument.create();
  tickDoc.addPage([600, 800]);
  const tickBytes = (await tickDoc.save()).buffer as ArrayBuffer;
  const tickFilled = await fillFlatPdf(tickBytes, [
    field({
      type: "choice",
      label: "Occupation",
      options: ["Salaried", "Self-employed", "Farmer", "Other"],
      optionBboxes: [
        { x: 0.2, y: 0.5, w: 0.02, h: 0.015 },
        { x: 0.35, y: 0.5, w: 0.02, h: 0.015 },
        { x: 0.55, y: 0.5, w: 0.02, h: 0.015 },
        { x: 0.7, y: 0.5, w: 0.02, h: 0.015 },
      ],
      value: "Other",
      status: "answered",
      bbox: { x: 0.2, y: 0.5, w: 0.02, h: 0.015 },
    }),
  ]);
  const tickReloaded = await PDFDocument.load(tickFilled.slice().buffer as ArrayBuffer);
  check("option tick renders into valid PDF", tickReloaded.getPageCount() === 1 && tickFilled.length > (tickBytes as ArrayBuffer).byteLength);

  console.log("16. Fill-loop command parsing (the 'commands don't work' fix)");
  check("'Skip.' -> skip (punctuation tolerant)", parseFillCommand("Skip.") === "skip");
  check("'skip this field' -> skip", parseFillCommand("skip this field") === "skip");
  check("'Repeat that.' -> repeat", parseFillCommand("Repeat that.") === "repeat");
  check("'go back please' -> back (politeness stripped)", parseFillCommand("go back please") === "back", String(parseFillCommand("go back please")));
  check("'let me spell' -> spell", parseFillCommand("let me spell") === "spell");
  check("'type instead' -> type", parseFillCommand("type instead") === "type");
  check("'pause' -> pause", parseFillCommand("pause") === "pause");
  check("answer containing a command word is NOT a command", parseFillCommand("my name is Skip Roberts") === null, String(parseFillCommand("my name is Skip Roberts")));
  check("plain answer -> null", parseFillCommand("Tejas Kumar") === null);

  console.log("17. Smart confirmation policy");
  const mk = (over: Partial<FormField>) => field(over);
  check("name field confirms", needsConfirmation(mk({ label: "Full Name", profileKey: "full_name" }), false));
  check("phone confirms", needsConfirmation(mk({ label: "Mobile Number", profileKey: "phone" }), false));
  check("email confirms", needsConfirmation(mk({ label: "Email Address", profileKey: "email" }), false));
  check("date confirms", needsConfirmation(mk({ label: "Date of Birth", type: "date" }), false));
  check("aadhaar (sensitive) confirms", needsConfirmation(mk({ label: "Aadhaar Number", sensitive: true }), false));
  check("address does NOT confirm", !needsConfirmation(mk({ label: "Permanent Address", profileKey: "address" }), false));
  check("choice does NOT confirm", !needsConfirmation(mk({ label: "Gender", type: "choice", options: ["Male", "Female"] }), false));
  check("unclear field always confirms", needsConfirmation(mk({ label: "City" }), true));
  check("isNameField true for Father's Name", isNameField({ label: "Father's Name", profileKey: "father_name" }));
  check("isNameField false for City", !isNameField({ label: "City", profileKey: "city" }));

  console.log(failures === 0 ? "\nALL CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
