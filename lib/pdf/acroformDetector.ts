/**
 * Detects whether a PDF has embedded AcroForm fields, and if so extracts
 * them directly with pdf-lib — no OCR needed on this path.
 */
import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
  PDFOptionList,
  type PDFField,
} from "pdf-lib";
import type { BBox, FormField, PageDim } from "../types";
import { matchLabel } from "../matching/keywordDictionary";
import { orderFields } from "../vision/fieldClusterer";

export interface AcroformDetection {
  isAcroForm: boolean;
  fieldCount: number;
}

export async function detectAcroform(bytes: ArrayBuffer): Promise<AcroformDetection> {
  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    const fields = doc.getForm().getFields();
    const usable = fields.filter(isFillableField);
    return { isAcroForm: usable.length > 0, fieldCount: usable.length };
  } catch {
    return { isAcroForm: false, fieldCount: 0 };
  }
}

function isFillableField(field: PDFField): boolean {
  return (
    field instanceof PDFTextField ||
    field instanceof PDFCheckBox ||
    field instanceof PDFRadioGroup ||
    field instanceof PDFDropdown ||
    field instanceof PDFOptionList
  );
}

/** Turn a raw AcroForm field name like "applicant_dob2" into speakable text. */
function humanizeName(name: string): string {
  const cleaned = name
    .replace(/\[\d+\]/g, " ")
    .replace(/[_.\-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\d+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return name;
  return cleaned.replace(/\b\w/g, (c) => c.toUpperCase());
}

export interface AcroformExtraction {
  fields: FormField[];
  pageDims: PageDim[];
  pageCount: number;
}

export async function extractAcroformFields(bytes: ArrayBuffer): Promise<AcroformExtraction> {
  const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
  const pages = doc.getPages();
  const pageDims: PageDim[] = pages.map((p) => {
    const { width, height } = p.getSize();
    return { width, height };
  });

  // Map widget annotation refs -> page index so fields sort in reading order.
  const refToPage = new Map<string, number>();
  pages.forEach((page, pageIndex) => {
    const annots = page.node.Annots();
    if (!annots) return;
    for (let i = 0; i < annots.size(); i++) {
      const ref = annots.get(i);
      if (ref) refToPage.set(ref.toString(), pageIndex);
    }
  });

  const fields: FormField[] = [];
  const rawFields = doc.getForm().getFields();

  rawFields.forEach((field, index) => {
    if (!isFillableField(field)) return;

    const name = field.getName();
    const label = humanizeName(name);
    const dict = matchLabel(label);

    let type: FormField["type"] = "text";
    let options: string[] | undefined;
    if (field instanceof PDFCheckBox) {
      type = "checkbox";
    } else if (field instanceof PDFRadioGroup || field instanceof PDFDropdown || field instanceof PDFOptionList) {
      type = "choice";
      options = field.getOptions().filter((o) => o.trim().length > 0);
      if (options.length === 0) options = undefined;
    } else if (dict?.type === "date") {
      type = "date";
    }

    // Widget rectangle -> page index + top-left fractional bbox.
    let page = 0;
    let bbox: BBox | null = null;
    try {
      const widgets = field.acroField.getWidgets();
      const widget = widgets[0];
      if (widget) {
        const fieldRefStr = field.ref.toString();
        if (refToPage.has(fieldRefStr)) {
          page = refToPage.get(fieldRefStr) as number;
        }
        const rect = widget.getRectangle();
        const dims = pageDims[page] ?? pageDims[0];
        if (dims && dims.width > 0 && dims.height > 0) {
          bbox = {
            x: rect.x / dims.width,
            y: 1 - (rect.y + rect.height) / dims.height,
            w: rect.width / dims.width,
            h: rect.height / dims.height,
          };
        }
      }
    } catch {
      // Keep bbox null; ordering falls back to field index.
    }

    fields.push({
      id: `acro-${index}`,
      label: dict ? dict.label : label,
      type: dict?.type === "choice" && options ? "choice" : type,
      options: options ?? (type === "choice" ? dict?.options : undefined),
      page,
      bbox,
      order: index,
      confidence: 100,
      source: "acroform",
      acroName: name,
      profileKey: dict?.profileKey,
      sensitive: dict?.sensitive,
      value: "",
      status: "pending",
    });
  });

  return { fields: orderFields(fields), pageDims, pageCount: pages.length };
}
