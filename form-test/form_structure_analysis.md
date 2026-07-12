# Scholarship Application Form — Structural Analysis Report

This report analyzes the visual layout, field types, input constraints, and section structure of the [Scholarship Application Form.pdf](file:///g:/swaram/form-test/Scholarship%20Application%20Form.pdf).

---

## 1. Section Titles vs. Interactive Questions

Section titles are structural labels meant for layout organization and visual separation. They do not accept text input, unlike the questions.

*   **Section 1 Title:** `1. PERSONAL DETAILS`
*   **Section 2 Title:** `2. ACADEMIC DETAILS`
*   **Section 3 Title:** `3. FINANCIAL DETAILS`
*   **Section 4 Title:** `4. SCHOLARSHIP CATEGORY (tick one)`
*   **Section 5 Title:** `5. DECLARATION`
*   **Form Header Title:** `MERIT-CUM-MEANS SCHOLARSHIP APPLICATION FORM`
*   **Academic Year Subtitle:** `Academic Year 2026-2027`

---

## 2. Interactive Fields & Constraints Matrix

Below is the complete analysis of all questions present on the form, mapping what they visually are, their OCR readings, and their structural constraints:

| Visual Question Label | Section | Structural Type | OCR Raw Label Read | Input Box Constraint / Behavior |
| :--- | :--- | :--- | :--- | :--- |
| **Full Name** | 1. Personal | Textbox (Free Line) | `Full Name` | Standard horizontal line. Text should sit on the baseline. |
| **Date of Birth** | 1. Personal | Date Input | `Date of Birth (DD/MM/YYYY)` | Divided into `DD/MM/YYYY` segments or free underline. |
| **Gender** | 1. Personal | Multiple Choice (Circle/Box) | `Gender` | Choice of: `Male`, `Female`, `Other`. Option bboxes to left. |
| **Father's / Guardian's Name** | 1. Personal | Textbox (Free Line) | `Father's / Guardian's Name` | Standard horizontal line. |
| **Mother's Name** | 1. Personal | Textbox (Free Line) | `Mother's Name` | Standard horizontal line. |
| **Aadhaar Number** | 1. Personal | **Boxed Character Cells** | `Aadhaar Number` | **12 discrete square boxes**. Text characters must be drawn individually inside their respective cells. |
| **Mobile Number** | 1. Personal | Textbox (Free Line) | `Mobile Number` | Free underline. |
| **Email Address** | 1. Personal | Textbox (Free Line) | `Email Address` | Free underline. |
| **Permanent Address** | 1. Personal | Textbox (Free Line) | `Permanent Address` | Free underline. |
| **Pin Code** | 1. Personal | **Boxed Character Cells** | `Pin Code` | **6 discrete square boxes**. Text digits must be isolated per box. |
| **District** | 1. Personal | Textbox (Free Line) | `District` | Free underline. |
| **State** | 1. Personal | Textbox (Free Line) | `State` | Free underline. |
| **Name of Institution** | 2. Academic | Textbox (Free Line) | `Name of Institution` | Free underline. |
| **Course / Programme** | 2. Academic | Textbox (Free Line) | `Course / Programme` | Free underline. |
| **Branch / Specialization** | 2. Academic | Textbox (Free Line) | `Branch / Specialization` | Free underline. |
| **Current Year / Semester** | 2. Academic | Textbox (Free Line) | `Current Year / Semester` | Free underline. |
| **Roll Number** | 2. Academic | Textbox (Free Line) | `Roll Number` | Free underline. |
| **Admission Year** | 2. Academic | Textbox (Free Line) | `Admission Year` | Free underline. |
| **Percentage / CGPA** | 2. Academic | Textbox (Free Line) | `Previous Academic Year Percentage / CGPA` | Free underline. |
| **Annual Family Income** | 3. Financial | Textbox (Free Line) | `Annual Family Income (Rs.)` | Free underline. |
| **Father's Occupation** | 3. Financial | Multiple Choice (Inline) | `Father's Occupation` | Options: `Salaried`, `Self-employed`, `Farmer`, `Other` |
| **Bank Account Number** | 3. Financial | Textbox (Free Line) | `Bank Account Number` | Free underline. |
| **IFSC Code** | 3. Financial | **Boxed Character Cells** | `IFSC Code` | **11 discrete square boxes**. Alphanumeric values mapped exactly to boxes. |
| **Bank Name & Branch** | 3. Financial | Textbox (Free Line) | `Bank Name & Branch` | Free underline. |
| **Scholarship Category** | 4. Category | Multiple Choice (Tick One) | `SCHOLARSHIP CATEGORY` | Options: `Merit-based`, `Means-based`, `Sports Quota`, `Disability` |
| **Place** | 5. Declaration | Textbox (Free Line) | `Place` | Free underline. |
| **Date** | 5. Declaration | Date Input | `Date` | Free underline. |
| **Signature of Applicant** | 5. Declaration | *Non-Fillable* | `Signature of Applicant` | Visual signature line. Not a voice question. |

---

## 3. Detailed Boxed Character Field Boundaries

For fields labeled **Boxed Character Cells** (Aadhaar Number, Pin Code, IFSC Code), standard text writing will overflow and render outside the lines. To prevent this, the PDF coordinate writer should implement a segmented character grid calculation:

*   **Aadhaar Number (12 Cells):**
    *   *Behavior:* Divide the total width of the detected input box by 12.
    *   *Writing Constraint:* Center each digit at $x_i = x_{\text{start}} + i \times \text{cell\_width} + \text{offset}$ so characters never cross box dividers.
*   **Pin Code (6 Cells):**
    *   *Behavior:* Divide the total width of the Pin Code box by 6.
    *   *Writing Constraint:* Draw digits individually with a horizontal character spacing offset.
*   **IFSC Code (11 Cells):**
    *   *Behavior:* Divide the total width of the IFSC input box by 11.
    *   *Writing Constraint:* Render alphanumeric characters inside the 11 boundaries.
