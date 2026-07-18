export type FieldType = "text" | "date" | "choice" | "checkbox" | "comb" | "table" | "signature";

export type FieldStatus =
  | "pending"
  | "answered"
  | "autofilled"
  | "skipped"
  | "unclear";

/** Bounding box as fractions (0..1) of the page, origin at top-left. */
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FormField {
  id: string;
  /** Human-readable label, spoken aloud as the question. */
  label: string;
  type: FieldType;
  /** For choice fields: the options to read aloud. */
  options?: string[];
  /** For OCR choice fields: where each option's tick box sits (parallel to options). */
  optionBboxes?: BBox[];
  /** 0-based page index. */
  page: number;
  /** Where the answer gets written. Null when unknown (AcroForm handles its own placement). */
  bbox: BBox | null;
  /** Reading order across the whole form. */
  order: number;
  /** OCR confidence of the label, 0-100. AcroForm fields are 100. */
  confidence: number;
  source: "acroform" | "ocr";
  /** AcroForm field name for direct write-back. */
  acroName?: string;
  /** Canonical profile key when the label matched the dictionary. */
  profileKey?: string;
  /** High-sensitivity value (Aadhaar etc.) — never stored in a profile. */
  sensitive?: boolean;
  /** Natural spoken question, refined by the LLM from the raw label. */
  question?: string;
  /** Short spoken hint about what to say / the expected format. */
  help?: string;
  value: string;
  status: FieldStatus;
  
  // Specific to "comb" fields (letter-by-letter)
  combLength?: number;

  // Specific to "table" fields
  columns?: string[];
  rows?: string[];
  /** 2D array of cells: cells[rowIndex][colIndex] */
  cells?: (BBox | null)[][];
  
  // Conditional logic
  dependsOn?: {
    fieldKey: string;
    expectedValue: string;
  };
}

/** Page size in PDF points (for PDFs) or pixels (for captured images). */
export interface PageDim {
  width: number;
  height: number;
}

export type FormStatus =
  | "processing"
  | "ready"
  | "filling"
  | "review"
  | "complete";

export interface FormRecord {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  status: FormStatus;
  sourceType: "pdf" | "image";
  isAcroForm: boolean;
  pageCount: number;
  pageDims: PageDim[];
  fields: FormField[];
}

export interface ProfileData {
  [key: string]: string;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
