const { writeFileSync, existsSync } = require("node:fs");
const { resolve } = require("node:path");
const crypto = require("node:crypto");

const PDF_NAME = "Swaram Stress Test Form.pdf";

function createField({ label, type, page, bbox, order, profileKey, sensitive, options, question, help, combLength, columns, rows, cells, dependsOn }) {
  return {
    id: crypto.randomUUID(),
    label,
    type,
    page,
    bbox,
    order,
    confidence: 100,
    source: "ocr",
    ...(profileKey && { profileKey }),
    ...(sensitive && { sensitive: true }),
    ...(options && { options }),
    ...(combLength && { combLength }),
    ...(columns && { columns }),
    ...(rows && { rows }),
    ...(cells && { cells }),
    ...(dependsOn && { dependsOn }),
    question: question || `What is the value for ${label}?`,
    ...(help && { help }),
    value: "",
    status: "pending"
  };
}

function main() {
  const pdfPath = resolve(__dirname, "..", "Original", "Unfilled", PDF_NAME);
  console.log(`Checking target PDF: ${pdfPath}`);
  
  if (!existsSync(pdfPath)) {
    console.error(`Error: Reference form PDF not found at ${pdfPath}`);
    process.exit(1);
  }

  const fields = [];
  let order = 0;

  // =========================================================================
  // PAGE 1 (page = 0): SECTION 1 | PERSONAL DETAILS (15 fields)
  // =========================================================================

  fields.push(createField({
    label: "Full Name",
    type: "text",
    page: 0,
    bbox: { x: 0.1128, y: 0.3258, w: 0.5689, h: 0.0086 },
    order: order++,
    profileKey: "full_name",
    question: "What is your full name?",
    help: "Speak your full name as printed on official documents."
  }));

  fields.push(createField({
    label: "Date of Birth",
    type: "date",
    page: 0,
    bbox: { x: 0.1128, y: 0.3800, w: 0.1800, h: 0.0086 },
    order: order++,
    profileKey: "date_of_birth",
    question: "What is your date of birth?",
    help: "Say your date of birth in day, month, year format (for example, 25 August 2007)."
  }));

  fields.push(createField({
    label: "Gender",
    type: "choice",
    page: 0,
    bbox: { x: 0.3200, y: 0.3800, w: 0.2800, h: 0.0086 },
    order: order++,
    profileKey: "gender",
    options: ["Male", "Female", "Other"],
    question: "What is your gender? Male, Female, or Other?",
    help: "Select one of the gender options."
  }));

  fields.push(createField({
    label: "Father's Name",
    type: "text",
    page: 0,
    bbox: { x: 0.3539, y: 0.4169, w: 0.5706, h: 0.0086 },
    order: order++,
    profileKey: "father_name",
    question: "What is your father's or guardian's name?",
    help: "Speak your father's full name."
  }));

  fields.push(createField({
    label: "Mother's Name",
    type: "text",
    page: 0,
    bbox: { x: 0.3539, y: 0.4480, w: 0.5706, h: 0.0086 },
    order: order++,
    profileKey: "mother_name",
    question: "What is your mother's name?",
    help: "Speak your mother's full name."
  }));

  fields.push(createField({
    label: "Community / Category",
    type: "choice",
    page: 0,
    bbox: { x: 0.3539, y: 0.4790, w: 0.5706, h: 0.0086 },
    order: order++,
    profileKey: "community",
    options: ["General", "OBC", "SC", "ST", "EWS"],
    question: "Which category do you belong to? General, OBC, SC, ST, or EWS?",
    help: "Select your community category."
  }));

  fields.push(createField({
    label: "Aadhaar Number",
    type: "comb",
    combLength: 12,
    page: 0,
    bbox: { x: 0.3539, y: 0.5100, w: 0.5706, h: 0.0086 },
    order: order++,
    profileKey: "aadhaar",
    sensitive: true,
    question: "What is your twelve-digit Aadhaar number?",
    help: "Enter the twelve digits without spaces."
  }));

  fields.push(createField({
    label: "PAN",
    type: "comb",
    combLength: 10,
    page: 0,
    bbox: { x: 0.3539, y: 0.5410, w: 0.5706, h: 0.0086 },
    order: order++,
    profileKey: "pan",
    sensitive: true,
    question: "What is your PAN card number?",
    help: "Enter your ten-digit alphanumeric PAN card number."
  }));

  fields.push(createField({
    label: "Mobile Number",
    type: "comb",
    combLength: 10,
    page: 0,
    bbox: { x: 0.3539, y: 0.5720, w: 0.5706, h: 0.0086 },
    order: order++,
    profileKey: "phone",
    question: "What is your mobile number?",
    help: "Speak your ten-digit mobile number."
  }));

  fields.push(createField({
    label: "Email Address",
    type: "text",
    page: 0,
    bbox: { x: 0.3539, y: 0.6030, w: 0.5706, h: 0.0086 },
    order: order++,
    profileKey: "email",
    question: "What is your email address?",
    help: "Speak or type your email address."
  }));

  fields.push(createField({
    label: "Permanent Address",
    type: "text",
    page: 0,
    bbox: { x: 0.3539, y: 0.6390, w: 0.5706, h: 0.0450 },
    order: order++,
    profileKey: "address",
    question: "What is your permanent address?",
    help: "Speak your house name, street, city or town details."
  }));

  fields.push(createField({
    label: "PIN Code",
    type: "comb",
    combLength: 6,
    page: 0,
    bbox: { x: 0.1500, y: 0.7180, w: 0.1800, h: 0.0086 },
    order: order++,
    profileKey: "pincode",
    question: "What is your six-digit PIN code?",
    help: "Say the six digits of your PIN code."
  }));

  fields.push(createField({
    label: "District",
    type: "text",
    page: 0,
    bbox: { x: 0.4000, y: 0.7180, w: 0.2000, h: 0.0086 },
    order: order++,
    profileKey: "district",
    question: "What is your district?",
    help: "Speak the name of your district."
  }));

  fields.push(createField({
    label: "State",
    type: "text",
    page: 0,
    bbox: { x: 0.6800, y: 0.7180, w: 0.2440, h: 0.0086 },
    order: order++,
    profileKey: "state",
    question: "What is your state?",
    help: "Speak the name of your state."
  }));

  fields.push(createField({
    label: "Address for Correspondence Same",
    type: "choice",
    page: 0,
    bbox: { x: 0.7000, y: 0.7550, w: 0.2240, h: 0.0086 },
    order: order++,
    profileKey: "correspondence_same",
    options: ["Yes", "No"],
    question: "Is your correspondence address the same as your permanent address? Yes or No?",
    help: "Select Yes or No."
  }));

  // =========================================================================
  // PAGE 2 (page = 1): SECTION 2 | ACADEMIC DETAILS (26 fields)
  // =========================================================================

  fields.push(createField({
    label: "Name of Institution",
    type: "text",
    page: 1,
    bbox: { x: 0.3539, y: 0.1400, w: 0.5706, h: 0.0086 },
    order: order++,
    profileKey: "institution",
    question: "What is the name of your institution?",
    help: "Speak the full name of your college or school."
  }));

  fields.push(createField({
    label: "Course / Programme",
    type: "text",
    page: 1,
    bbox: { x: 0.3539, y: 0.1710, w: 0.2500, h: 0.0086 },
    order: order++,
    profileKey: "course",
    question: "What is your course or programme?",
    help: "Speak your degree name, like B.Tech or B.Sc."
  }));

  fields.push(createField({
    label: "Branch",
    type: "text",
    page: 1,
    bbox: { x: 0.7000, y: 0.1710, w: 0.2246, h: 0.0086 },
    order: order++,
    question: "What is your branch or specialization?",
    help: "Speak your stream or department, like Computer Science."
  }));

  fields.push(createField({
    label: "Register Number",
    type: "text",
    page: 1,
    bbox: { x: 0.3539, y: 0.2020, w: 0.5706, h: 0.0086 },
    order: order++,
    profileKey: "register_number",
    question: "What is your college register or roll number?",
    help: "Speak your university registration number."
  }));

  fields.push(createField({
    label: "Current Semester",
    type: "text",
    page: 1,
    bbox: { x: 0.3539, y: 0.2330, w: 0.2000, h: 0.0086 },
    order: order++,
    question: "What is your current semester or year?",
    help: "Say the semester number, like Semester 3."
  }));

  fields.push(createField({
    label: "Year of Admission",
    type: "text",
    page: 1,
    bbox: { x: 0.7000, y: 0.2330, w: 0.2246, h: 0.0086 },
    order: order++,
    profileKey: "admission_year",
    question: "What was your year of admission?",
    help: "Speak the four-digit year, like 2024."
  }));

  // Academic Records Grid
  const rows = ["SSLC", "HSE", "Semester 1", "Semester 2"];
  const yOffsets = [0.3100, 0.3320, 0.3540, 0.3760];
  const columns = ["Board", "Year", "Max Marks", "Marks Obtained", "Percentage"];
  const xOffsets = [0.3539, 0.5400, 0.6500, 0.7600, 0.8700];
  const wOffsets = [0.1800, 0.1000, 0.1000, 0.1000, 0.0546];

  const cells = rows.map((r, i) => {
    return columns.map((c, j) => {
      return { x: xOffsets[j], y: yOffsets[i], w: wOffsets[j], h: 0.0086 };
    });
  });

  fields.push(createField({
    label: "Academic Records",
    type: "table",
    page: 1,
    bbox: null,
    order: order++,
    columns,
    rows,
    cells,
    question: "Let's fill out your Academic Records. Please provide details for SSLC, HSE, and your semesters.",
    help: "For each row, provide the Board, Year, Max Marks, Marks Obtained, and Percentage."
  }));

  // =========================================================================
  // PAGE 2 (page = 1): SECTION 3 | FINANCIAL DETAILS (7 fields)
  // =========================================================================

  fields.push(createField({
    label: "Annual Family Income (Figures)",
    type: "text",
    page: 1,
    bbox: { x: 0.4500, y: 0.4420, w: 0.4746, h: 0.0086 },
    order: order++,
    profileKey: "annual_income",
    question: "What is your annual family income in figures?",
    help: "Say the numeric amount in Rupees."
  }));

  fields.push(createField({
    label: "Annual Family Income (Words)",
    type: "text",
    page: 1,
    bbox: { x: 0.4500, y: 0.4680, w: 0.4746, h: 0.0086 },
    order: order++,
    question: "What is your annual family income in words?",
    help: "Say the amount in words (for example: Rupees Two Lakh Fifty Thousand Only)."
  }));

  fields.push(createField({
    label: "Occupation of Father / Guardian",
    type: "choice",
    page: 1,
    bbox: { x: 0.4500, y: 0.5200, w: 0.4746, h: 0.0086 },
    order: order++,
    options: ["Salaried", "Self-employed", "Agriculture", "Daily wage", "Pensioner", "Unemployed", "Deceased", "Other (specify)"],
    question: "What is the occupation of your father or guardian?",
    help: "Select from the options or specify under other."
  }));

  fields.push(createField({
    label: "Bank Account Number",
    type: "comb",
    combLength: 16,
    page: 1,
    bbox: { x: 0.3539, y: 0.6000, w: 0.5706, h: 0.0086 },
    order: order++,
    profileKey: "bank_account",
    sensitive: true,
    question: "What is your bank account number?",
    help: "Speak your bank account digits."
  }));

  fields.push(createField({
    label: "IFSC Code",
    type: "comb",
    combLength: 11,
    page: 1,
    bbox: { x: 0.3539, y: 0.6310, w: 0.2500, h: 0.0086 },
    order: order++,
    profileKey: "ifsc",
    sensitive: true,
    question: "What is your bank's eleven-character IFSC code?",
    help: "Enter the eleven letters and digits."
  }));

  fields.push(createField({
    label: "Account Type",
    type: "choice",
    page: 1,
    bbox: { x: 0.7000, y: 0.6310, w: 0.2246, h: 0.0086 },
    order: order++,
    options: ["Savings", "Current"],
    question: "Is your account type Savings or Current?",
    help: "Select Savings or Current."
  }));

  fields.push(createField({
    label: "Bank Name & Branch",
    type: "text",
    page: 1,
    bbox: { x: 0.3539, y: 0.6620, w: 0.5706, h: 0.0086 },
    order: order++,
    profileKey: "bank_name",
    question: "What is your bank name and branch?",
    help: "Speak the bank name and branch location."
  }));

  // =========================================================================
  // PAGE 3 (page = 2): SECTION 4 | SCHOLARSHIP CATEGORY AND ENCLOSURES (5 fields)
  // =========================================================================

  fields.push(createField({
    label: "Scholarship Category",
    type: "choice",
    page: 2,
    bbox: { x: 0.3539, y: 0.1400, w: 0.5706, h: 0.0086 },
    order: order++,
    options: ["Merit-based", "Means-based (financial need)", "Sports Quota", "Persons with Disability"],
    question: "Which scholarship category are you applying for? Merit-based, Means-based, Sports Quota, or Persons with Disability?",
    help: "Select one category option."
  }));

  fields.push(createField({
    label: "Documents Enclosed",
    type: "choice",
    page: 2,
    bbox: { x: 0.3539, y: 0.1910, w: 0.5706, h: 0.0086 },
    order: order++,
    options: ["Income Certificate", "Caste / Community Certificate", "Bank Passbook (first page)", "Aadhaar copy", "Mark lists (all)", "Bonafide Certificate", "Disability Certificate"],
    question: "Which documents have you enclosed? Select all that apply.",
    help: "Select each document you are enclosing with this application."
  }));

  fields.push(createField({
    label: "Receiving Other Scholarship",
    type: "choice",
    page: 2,
    bbox: { x: 0.6000, y: 0.2900, w: 0.3246, h: 0.0086 },
    order: order++,
    options: ["Yes", "No"],
    question: "Are you receiving any other scholarship or stipend this academic year? Yes or No?",
    help: "Select Yes or No."
  }));

  fields.push(createField({
    label: "Other Scholarship Name",
    type: "text",
    page: 2,
    bbox: { x: 0.3000, y: 0.3120, w: 0.3000, h: 0.0086 },
    order: order++,
    question: "What is the name of that scholarship scheme?",
    help: "Leave blank or speak NA if none."
  }));

  fields.push(createField({
    label: "Other Scholarship Amount",
    type: "text",
    page: 2,
    bbox: { x: 0.7000, y: 0.3120, w: 0.2246, h: 0.0086 },
    order: order++,
    question: "What is the amount in Rupees of that scholarship?",
    help: "Leave blank or speak NA if none."
  }));

  // =========================================================================
  // PAGE 3 (page = 2): SECTION 5 | PARTICULARS OF FAMILY MEMBERS (25 fields)
  // =========================================================================

  const famY = [0.4400, 0.4620, 0.4840, 0.5060, 0.5280];
  const famColumns = ["Name", "Relationship", "Age", "Occupation", "Annual Income"];
  const famXOffsets = [0.1500, 0.4100, 0.5700, 0.6600, 0.8200];
  const famWOffsets = [0.2500, 0.1500, 0.0800, 0.1500, 0.1046];

  const famCells = famY.map((y) => {
    return famColumns.map((c, j) => {
      return { x: famXOffsets[j], y: y, w: famWOffsets[j], h: 0.0086 };
    });
  });

  fields.push(createField({
    label: "Particulars of Family Members",
    type: "table",
    page: 2,
    bbox: null,
    order: order++,
    columns: famColumns,
    rows: ["Member 1", "Member 2", "Member 3", "Member 4", "Member 5"],
    cells: famCells,
    question: "Please provide the particulars of your dependent family members.",
    help: "For each member, speak their Name, Relationship, Age, Occupation, and Annual Income."
  }));

  // =========================================================================
  // PAGE 4 (page = 3): SECTION A | ANNEXURE A (3 fields)
  // =========================================================================

  fields.push(createField({
    label: "Correspondence PIN Code",
    type: "comb",
    combLength: 6,
    page: 3,
    bbox: { x: 0.1500, y: 0.2200, w: 0.1800, h: 0.0086 },
    order: order++,
    profileKey: "pincode",
    dependsOn: { fieldKey: "correspondence_same", expectedValue: "No" },
    question: "What is your correspondence six-digit PIN code?",
    help: "Enter the PIN code for your mailing address."
  }));

  fields.push(createField({
    label: "Correspondence District",
    type: "text",
    page: 3,
    bbox: { x: 0.4000, y: 0.2200, w: 0.2000, h: 0.0086 },
    order: order++,
    profileKey: "district",
    dependsOn: { fieldKey: "correspondence_same", expectedValue: "No" },
    question: "What is your correspondence district?",
    help: "Mailing district name."
  }));

  fields.push(createField({
    label: "Correspondence State",
    type: "text",
    page: 3,
    bbox: { x: 0.6800, y: 0.2200, w: 0.2440, h: 0.0086 },
    order: order++,
    profileKey: "state",
    dependsOn: { fieldKey: "correspondence_same", expectedValue: "No" },
    question: "What is your correspondence state?",
    help: "Mailing state name."
  }));

  // =========================================================================
  // PAGE 4 (page = 3): SECTION 6 | DECLARATION AND UNDERTAKING (2 fields)
  // =========================================================================

  fields.push(createField({
    label: "Place",
    type: "text",
    page: 3,
    bbox: { x: 0.1500, y: 0.4590, w: 0.2000, h: 0.0086 },
    order: order++,
    question: "What place are you signing this declaration from?",
    help: "Speak the name of your current city or town."
  }));

  fields.push(createField({
    label: "Date",
    type: "date",
    page: 3,
    bbox: { x: 0.4500, y: 0.4590, w: 0.2000, h: 0.0086 },
    order: order++,
    question: "What is the date of signing this declaration?",
    help: "Speak the current date (for example, 16 July 2026)."
  }));

  fields.push(createField({
    label: "Applicant Signature",
    type: "signature",
    page: 3,
    bbox: { x: 0.7000, y: 0.4500, w: 0.2000, h: 0.0500 },
    order: order++,
    question: "Please sign in the applicant signature box.",
    help: "This field requires a physical signature. It cannot be filled digitally."
  }));

  // Write fields array to parsed_form.json
  const outPath = resolve(__dirname, "..", "Original", "Unfilled", "Swaram_ParsedForm_UNFILLED.json");
  writeFileSync(outPath, JSON.stringify(fields, null, 2));
  console.log(`Successfully generated perfect JSON at: ${outPath}`);
  console.log(`Total fields exported: ${fields.length}`);
}

main();
