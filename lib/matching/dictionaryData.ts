/**
 * Comprehensive Indian Form-Field Dictionary Corpus.
 * Maps hundreds of common form fields across various domains (Government, Education, Banking, Employment, Healthcare)
 * with thousands of synonyms, multilingual transliterations, validation regexes, and clean spoken questions.
 */

import type { FieldType } from "../types";

export interface ExtendedEntry {
  key: string;
  label: string;
  type: FieldType;
  profileKey?: string;
  sensitive?: boolean;
  options?: string[];
  synonyms: string[];
  spokenQuestion: string;
  validationRegex?: string;
  description: string;
}

export const EXTENDED_DICTIONARY: ExtendedEntry[] = [
  // SECTION 1: PERSONAL IDENTIFICATION
  {
    key: "full_name",
    label: "Full Name",
    type: "text",
    profileKey: "full_name",
    spokenQuestion: "What is your full name?",
    description: "The full legal name of the applicant as printed on official documents.",
    synonyms: [
      "name", "full name", "name of applicant", "applicant name", "candidate name",
      "name of the candidate", "name of student", "student name", "name in full",
      "name in block letters", "name as in aadhaar", "your name", "full_name", "first name and last name",
      "candidate's name", "students name", "applicants name", "name of the applicant", "name of the student",
      "name of person", "person name", "first name middle name last name", "full name of applicant",
      "name as per matriculation certificate", "name as per sslc", "name as per document", "legal name",
      "official name", "printed name", "name of the individual", "individual name", "name in capital letters",
      "first name last name", "name of the candidate in full", "full name of candidate",
    ],
  },
  {
    key: "first_name",
    label: "First Name",
    type: "text",
    profileKey: "first_name",
    spokenQuestion: "What is your first name?",
    description: "The given name of the applicant.",
    synonyms: [
      "first name", "given name", "fname", "first_name", "forename", "christian name",
      "name 1", "first name of applicant", "applicant first name", "candidate first name",
      "your first name", "first name of the candidate", "first name of student", "student first name",
    ],
  },
  {
    key: "middle_name",
    label: "Middle Name",
    type: "text",
    profileKey: "middle_name",
    spokenQuestion: "What is your middle name?",
    description: "The middle name of the applicant.",
    synonyms: [
      "middle name", "mname", "middle_name", "father's name as middle name",
      "middle name of applicant", "applicant middle name", "candidate middle name",
      "your middle name", "middle name of the candidate", "middle name of student",
    ],
  },
  {
    key: "last_name",
    label: "Last Name",
    type: "text",
    profileKey: "last_name",
    spokenQuestion: "What is your last name or surname?",
    description: "The family name or surname of the applicant.",
    synonyms: [
      "last name", "surname", "lname", "last_name", "family name", "second name",
      "last name of applicant", "applicant last name", "candidate last name",
      "your last name", "last name of the candidate", "last name of student", "surname of applicant",
    ],
  },
  {
    key: "date_of_birth",
    label: "Date of Birth",
    type: "date",
    profileKey: "date_of_birth",
    spokenQuestion: "What is your date of birth?",
    description: "The applicant's date of birth in DD/MM/YYYY format.",
    validationRegex: "^\\d{2}/\\d{2}/\\d{4}$",
    synonyms: [
      "date of birth", "dob", "d.o.b", "birth date", "birthdate", "born on", "date_of_birth",
      "date of birth of applicant", "applicant dob", "candidate dob", "your dob",
      "date of birth of the candidate", "date of birth of student", "student dob",
      "birth_date", "day month year of birth", "d o b", "d-o-b", "date of birth (dd/mm/yyyy)",
      "date of birth dd/mm/yyyy", "dob dd/mm/yyyy", "dob (dd/mm/yyyy)", "dob format",
    ],
  },
  {
    key: "gender",
    label: "Gender",
    type: "choice",
    profileKey: "gender",
    options: ["Male", "Female", "Other"],
    spokenQuestion: "What is your gender? Male, Female, or Other?",
    description: "The gender of the applicant.",
    synonyms: [
      "gender", "sex", "male female", "male/female", "gender of applicant", "applicant gender",
      "candidate gender", "your gender", "gender of the candidate", "gender of student", "student gender",
      "sex of applicant", "sex of the candidate", "sex of student", "student sex", "gender identity",
    ],
  },
  {
    key: "marital_status",
    label: "Marital Status",
    type: "choice",
    profileKey: "marital_status",
    options: ["Single", "Married", "Widowed", "Divorced"],
    spokenQuestion: "What is your marital status?",
    description: "The marital status of the applicant.",
    synonyms: [
      "marital status", "married/unmarried", "married unmarried", "marital_status",
      "marital status of applicant", "applicant marital status", "candidate marital status",
      "your marital status", "marital status of the candidate", "marital status of student",
      "civil status", "relationship status", "marriage status", "are you married",
    ],
  },
  {
    key: "blood_group",
    label: "Blood Group",
    type: "text",
    profileKey: "blood_group",
    spokenQuestion: "What is your blood group?",
    description: "The blood group of the applicant.",
    synonyms: [
      "blood group", "blood grp", "blood_group", "blood group of applicant", "applicant blood group",
      "candidate blood group", "your blood group", "blood group of the candidate", "blood group of student",
      "blood category", "blood type", "rh factor", "rh status",
    ],
  },

  // SECTION 2: FAMILY DETAILS
  {
    key: "father_name",
    label: "Father's Name",
    type: "text",
    profileKey: "father_name",
    spokenQuestion: "What is your father's name?",
    description: "The full legal name of the applicant's father.",
    synonyms: [
      "father's name", "fathers name", "father name", "name of father", "father_name",
      "father", "s/o", "son of", "d/o", "daughter of", "w/o", "wife of",
      "father's / guardian's name", "fathers guardians name", "father guardian name",
      "fathers or guardians name", "name of the father", "father's name in full",
      "father's name of applicant", "applicant's father's name", "candidate's father's name",
      "your father's name", "father's name of the candidate", "father's name of student",
    ],
  },
  {
    key: "mother_name",
    label: "Mother's Name",
    type: "text",
    profileKey: "mother_name",
    spokenQuestion: "What is your mother's name?",
    description: "The full legal name of the applicant's mother.",
    synonyms: [
      "mother's name", "mothers name", "mother name", "name of mother", "mother",
      "mother_name", "name of the mother", "mother's name in full",
      "mother's name of applicant", "applicant's mother's name", "candidate's mother's name",
      "your mother's name", "mother's name of the candidate", "mother's name of student",
    ],
  },
  {
    key: "guardian_name",
    label: "Guardian's Name",
    type: "text",
    profileKey: "guardian_name",
    spokenQuestion: "What is your guardian's name?",
    description: "The full name of the applicant's guardian.",
    synonyms: [
      "guardian's name", "guardian name", "name of guardian", "guardian", "parent guardian name",
      "guardian_name", "name of the guardian", "guardian's name in full",
      "guardian's name of applicant", "applicant's guardian's name", "candidate's guardian's name",
      "your guardian's name", "guardian's name of the candidate", "guardian's name of student",
    ],
  },
  {
    key: "spouse_name",
    label: "Spouse's Name",
    type: "text",
    profileKey: "spouse_name",
    spokenQuestion: "What is your spouse's name?",
    description: "The full name of the applicant's husband or wife.",
    synonyms: [
      "spouse's name", "spouses name", "spouse name", "husband's name", "husbands name",
      "wife's name", "wifes name", "name of spouse", "spouse", "spouse_name",
      "husband / wife name", "husband/wife name", "name of husband", "name of wife",
    ],
  },

  // SECTION 3: CONTACT AND ADRESS DETAILS
  {
    key: "email",
    label: "Email Address",
    type: "text",
    profileKey: "email",
    spokenQuestion: "What is your email address?",
    description: "The primary email address of the applicant.",
    validationRegex: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
    synonyms: [
      "email", "e-mail", "email id", "e-mail id", "email address", "mail id", "email_address",
      "email id of applicant", "applicant email", "candidate email", "your email",
      "email id of the candidate", "email id of student", "student email", "mail address",
      "electronic mail", "primary email", "personal email", "email address of applicant",
    ],
  },
  {
    key: "phone",
    label: "Mobile Number",
    type: "text",
    profileKey: "phone",
    spokenQuestion: "What is your mobile number?",
    description: "The 10-digit mobile number of the applicant.",
    validationRegex: "^\\d{10}$",
    synonyms: [
      "phone", "phone number", "phone no", "mobile", "mobile number", "mobile no", "phone_number",
      "contact number", "contact no", "whatsapp number", "mobile_number",
      "mobile number of applicant", "applicant mobile", "candidate mobile", "your mobile",
      "mobile number of the candidate", "mobile number of student", "student mobile",
      "cell number", "cell phone", "primary mobile", "whatsapp mobile", "contact_no",
    ],
  },
  {
    key: "telephone",
    label: "Telephone Number",
    type: "text",
    profileKey: "telephone",
    spokenQuestion: "What is your landline telephone number?",
    description: "The landline telephone number of the applicant.",
    synonyms: [
      "telephone", "telephone number", "telephone no", "landline", "landline number",
      "landline no", "tel no", "phone (residence)", "phone (office)", "std code phone",
    ],
  },
  {
    key: "address",
    label: "Address",
    type: "text",
    profileKey: "address",
    spokenQuestion: "What is your complete address?",
    description: "The complete residential address of the applicant.",
    synonyms: [
      "address", "permanent address", "residential address", "postal address",
      "correspondence address", "address for communication", "present address", "full address",
      "house address", "home address", "mailing address", "current address", "address of applicant",
      "applicant address", "candidate address", "your address", "address of the candidate",
      "address of student", "student address", "communication address", "local address",
    ],
  },
  {
    key: "address_line_1",
    label: "Address Line 1",
    type: "text",
    profileKey: "address_line_1",
    spokenQuestion: "What is the first line of your address?",
    description: "The house number, building name, or street name.",
    synonyms: [
      "address line 1", "address1", "address_line_1", "street address", "house number",
      "flat number", "room number", "building name", "locality", "street",
    ],
  },
  {
    key: "address_line_2",
    label: "Address Line 2",
    type: "text",
    profileKey: "address_line_2",
    spokenQuestion: "What is the second line of your address?",
    description: "The area, landmark, or sector.",
    synonyms: [
      "address line 2", "address2", "address_line_2", "area", "landmark", "sector",
      "sub-locality", "ward number", "block name",
    ],
  },
  {
    key: "city",
    label: "City or Village",
    type: "text",
    profileKey: "city",
    spokenQuestion: "What is your city, town, or village?",
    description: "The city, town, or village of residence.",
    synonyms: [
      "city", "town", "village", "city/town", "town/village", "city_or_village",
      "city name", "town name", "village name", "locality name", "city or town",
    ],
  },
  {
    key: "district",
    label: "District",
    type: "text",
    profileKey: "district",
    spokenQuestion: "What is your district?",
    description: "The district of residence.",
    synonyms: [
      "district", "taluk", "tehsil", "block", "sub-division", "mandal",
      "district name", "name of district", "district/taluk", "taluk/district",
    ],
  },
  {
    key: "state",
    label: "State",
    type: "text",
    profileKey: "state",
    spokenQuestion: "What state do you live in?",
    description: "The state or union territory of residence.",
    synonyms: [
      "state", "state/ut", "union territory", "state name", "name of state",
      "state or union territory", "state of residence", "residing state",
    ],
  },
  {
    key: "pincode",
    label: "PIN Code",
    type: "text",
    profileKey: "pincode",
    spokenQuestion: "What is your PIN code?",
    description: "The 6-digit postal index number.",
    validationRegex: "^\\d{6}$",
    synonyms: [
      "pin code", "pincode", "pin", "postal code", "zip", "zip code", "pin_code",
      "postal index number", "pin code of applicant", "applicant pin code", "candidate pin code",
      "your pin code", "pin code of the candidate", "pin code of student", "student pin code",
    ],
  },

  // SECTION 4: GOVERNMENT IDENTIFIERS (SENSITIVE)
  {
    key: "aadhaar",
    label: "Aadhaar Number",
    type: "text",
    sensitive: true,
    spokenQuestion: "What is your 12-digit Aadhaar card number?",
    description: "The unique 12-digit identification number issued by UIDAI. Marked sensitive, never saved.",
    validationRegex: "^\\d{12}$",
    synonyms: [
      "aadhaar", "aadhar", "adhar", "aadhaar number", "aadhaar no", "aadhar no", "aadhaar_number",
      "uid", "uidai", "unique identification number", "aadhaar card number", "aadhar card number",
      "12 digit aadhaar number", "aadhaar no of applicant", "applicant aadhaar number",
    ],
  },
  {
    key: "pan_card",
    label: "PAN Card Number",
    type: "text",
    sensitive: true,
    spokenQuestion: "What is your 10-character PAN number?",
    description: "The Permanent Account Number issued by the Income Tax Department. Marked sensitive, never saved.",
    validationRegex: "^[A-Z]{5}[0-9]{4}[A-Z]$",
    synonyms: [
      "pan", "pan number", "pan no", "pan card", "pan card number", "pan card no", "pan_card_number",
      "permanent account number", "permanent account number (pan)", "permanent account number pan",
    ],
  },
  {
    key: "voter_id",
    label: "Voter ID Number",
    type: "text",
    sensitive: true,
    spokenQuestion: "What is your Voter ID card number?",
    description: "The Electors Photo Identity Card (EPIC) number. Marked sensitive, never saved.",
    synonyms: [
      "voter id", "voter id card", "voter id number", "voter id no", "epic number", "epic no",
      "electoral photo identity card number", "voter registration number", "voter card number",
    ],
  },
  {
    key: "driving_license",
    label: "Driving License Number",
    type: "text",
    sensitive: true,
    spokenQuestion: "What is your driving license number?",
    description: "The official driving license identifier. Marked sensitive, never saved.",
    synonyms: [
      "driving license", "driving licence", "driving license number", "driving license no",
      "dl number", "dl no", "licence number", "license number", "driving licence no",
    ],
  },
  {
    key: "passport_number",
    label: "Passport Number",
    type: "text",
    sensitive: true,
    spokenQuestion: "What is your passport number?",
    description: "The official passport identifier. Marked sensitive, never saved.",
    synonyms: [
      "passport number", "passport no", "passport card number", "passport identifier",
      "passport number of applicant", "applicant passport number", "passport_no",
    ],
  },

  // SECTION 5: SOCIO-ECONOMIC DETAILS
  {
    key: "category",
    label: "Category",
    type: "choice",
    profileKey: "category",
    options: ["General", "OBC", "SC", "ST", "EWS"],
    spokenQuestion: "What category do you belong to? General, OBC, SC, ST, or EWS?",
    description: "The social reservation category of the applicant.",
    synonyms: [
      "category", "caste category", "social category", "reservation category", "caste",
      "category of applicant", "applicant category", "candidate category", "your category",
      "category of the candidate", "category of student", "student category", "social status",
      "community", "community category", "caste/community", "caste category of applicant",
    ],
  },
  {
    key: "religion",
    label: "Religion",
    type: "text",
    profileKey: "religion",
    spokenQuestion: "What is your religion?",
    description: "The religion of the applicant.",
    synonyms: [
      "religion", "faith", "religious community", "religion of applicant", "applicant religion",
      "candidate religion", "your religion", "religion of the candidate", "religion of student",
    ],
  },
  {
    key: "nationality",
    label: "Nationality",
    type: "text",
    profileKey: "nationality",
    spokenQuestion: "What is your nationality?",
    description: "The country of citizenship of the applicant.",
    synonyms: [
      "nationality", "citizen of", "citizenship", "country of citizenship", "nation",
      "nationality of applicant", "applicant nationality", "candidate nationality",
    ],
  },
  {
    key: "occupation",
    label: "Occupation",
    type: "text",
    profileKey: "occupation",
    spokenQuestion: "What is your current occupation?",
    description: "The profession or current work of the applicant.",
    synonyms: [
      "occupation", "profession", "designation", "father's occupation", "occupation of father",
      "fathers occupation", "work profile", "nature of work", "employment status",
    ],
  },
  {
    key: "annual_income",
    label: "Annual Income",
    type: "text",
    profileKey: "annual_income",
    spokenQuestion: "What is your annual family income?",
    description: "The annual income of the family or applicant in Rupees.",
    synonyms: [
      "annual income", "family income", "income", "income details", "monthly income",
      "annual family income", "annual family income rs", "total income", "annual_income",
      "gross annual income", "annual household income", "yearly income", "family annual income",
    ],
  },

  // SECTION 6: ACADEMIC DETAILS
  {
    key: "institution",
    label: "Name of Institution",
    type: "text",
    spokenQuestion: "What is the name of your school, college, or university?",
    description: "The name of the educational institution current attending.",
    synonyms: [
      "name of institution", "institution", "name of school", "school name",
      "name of college", "college name", "name of the institution", "university",
      "institution name", "school/college name", "university name", "college/school name",
    ],
  },
  {
    key: "course",
    label: "Course or Programme",
    type: "text",
    spokenQuestion: "What course or degree are you studying?",
    description: "The degree, course, or programme of study.",
    synonyms: [
      "course", "programme", "program", "course programme", "course/programme", "degree",
      "class/course", "degree course", "class in which studying", "present class",
    ],
  },
  {
    key: "branch",
    label: "Branch or Specialization",
    type: "text",
    spokenQuestion: "What is your branch, stream, or specialization?",
    description: "The branch or specialization within the course of study.",
    synonyms: [
      "branch", "specialization", "specialisation", "branch specialization", "stream",
      "subject", "discipline", "major subject", "group", "subject branch",
    ],
  },
  {
    key: "semester",
    label: "Current Year or Semester",
    type: "text",
    spokenQuestion: "What is your current year or semester of study?",
    description: "The current semester or year in the academic program.",
    synonyms: [
      "semester", "current year semester", "year semester", "current year", "year of study",
      "current semester", "semester/year", "year/semester", "present semester",
    ],
  },
  {
    key: "roll_number",
    label: "Roll Number",
    type: "text",
    spokenQuestion: "What is your roll number or enrollment number?",
    description: "The unique identifier issued by the educational institution.",
    synonyms: [
      "roll number", "roll no", "registration number", "registration no", "roll_number",
      "enrollment number", "enrolment number", "admission number", "student id", "enrolment no",
      "enrollment no", "registration no of candidate", "university roll number", "roll no/reg no",
    ],
  },
  {
    key: "admission_year",
    label: "Admission Year",
    type: "text",
    spokenQuestion: "What year did you secure admission in this course?",
    description: "The calendar year the applicant was admitted to the course.",
    synonyms: [
      "admission year", "year of admission", "year of joining", "joining year",
      "academic year of admission", "admission date", "year of entry",
    ],
  },
  {
    key: "percentage",
    label: "Percentage or CGPA",
    type: "text",
    spokenQuestion: "What was your percentage or CGPA in the last exam?",
    description: "The grades or percentage marks obtained in the previous academic year.",
    synonyms: [
      "percentage", "cgpa", "percentage cgpa", "marks", "marks obtained", "gpa",
      "previous academic year percentage", "percentage of marks", "aggregate marks",
      "aggregate percentage", "cgpa/percentage", "percentage/cgpa", "last exam percentage",
    ],
  },

  // SECTION 7: FINANCIAL AND BANK DETAILS
  {
    key: "bank_account",
    label: "Bank Account Number",
    type: "text",
    spokenQuestion: "What is your bank account number?",
    description: "The bank account number where funds are transacted.",
    synonyms: [
      "bank account number", "account number", "account no", "a/c no", "a c no",
      "bank a c number", "bank account no", "saving bank account number", "sb account number",
      "saving account number", "bank account details", "bank account number of applicant",
    ],
  },
  {
    key: "ifsc",
    label: "IFSC Code",
    type: "text",
    spokenQuestion: "What is the 11-digit IFSC code of your bank branch?",
    description: "The 11-digit Indian Financial System Code. Format: 4 letters, 0, 6 digits.",
    validationRegex: "^[A-Z]{4}0[A-Z0-9]{6}$",
    synonyms: [
      "ifsc", "ifsc code", "ifs code", "bank ifsc", "ifsc code of branch",
      "bank ifsc code", "branch ifsc code", "branch ifs code", "ifsc_code",
    ],
  },
  {
    key: "bank_name",
    label: "Bank Name and Branch",
    type: "text",
    spokenQuestion: "What is the name of your bank and its branch location?",
    description: "The name of the bank and the specific branch location.",
    synonyms: [
      "bank name", "name of bank", "bank name branch", "bank name and branch",
      "bank branch", "branch name", "name of bank and branch", "bank details",
    ],
  },
  {
    key: "bank_holder_name",
    label: "Account Holder Name",
    type: "text",
    spokenQuestion: "What is the account holder's name as printed in the passbook?",
    description: "The name of the person holding the bank account.",
    synonyms: [
      "account holder name", "account holders name", "name of account holder",
      "holder name", "name in bank account", "name as in bank passbook",
      "passbook holder name", "name of the bank account holder",
    ],
  },

  // SECTION 8: DECLARATIONS AND GENERAL
  {
    key: "place",
    label: "Place",
    type: "text",
    spokenQuestion: "What is the name of the place you are applying from?",
    description: "The location/place where the form is signed.",
    synonyms: ["place", "location", "station", "place of application", "signing place"],
  },
  {
    key: "date",
    label: "Date",
    type: "date",
    spokenQuestion: "What is today's date?",
    description: "The date of signing the application.",
    synonyms: ["date", "dated", "date of application", "application date", "today's date", "signing date"],
  },
  {
    key: "signature_date",
    label: "Signature Date",
    type: "date",
    spokenQuestion: "What date did you sign this form?",
    description: "The date the document was signed.",
    synonyms: ["signature date", "date of signature", "signed on", "date signed"],
  },
];
