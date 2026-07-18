# SWARAM Form Verification Report: Swaram_Stress_Test_Form_FILLED.pdf

## Summary Metrics
| Metric | Count |
| :--- | :--- |
| **Total Expected Fields** | 41 |
| **Successes** | 22 |
| **Missing / Untagged** | 26 |
| **Alignment Shifts (>2%)** | 36 |
| **Validation Failures** | 0 |
| **False Positives** | 4 |

## 1. Successes
| Page | Label | Extracted Value |
| :--- | :--- | :--- |
| P1 | Full Name | `A N J A L I S N A I R` |
| P1 | Gender | `0 7 / 2 0 0 7` |
| P1 | Father's Name | `Suresh Kumar S` |
| P1 | Mother's Name | `Latha Nair` |
| P1 | Aadhaar Number | `4 8 2 1 7 7 3 4 9 2 1 0` |
| P1 | Mobile Number | `9 8 4 7 2 1 3 5 6 0` |
| P1 | Email Address | `anjali.nair2007@gmail.com` |
| P1 | Permanent Address | `Chembakassery House, 24/118` |
| P2 | Name of Institution | `Adi Shankara Institute of Engg. & Technology` |
| P2 | Course / Programme | `B.Tech` |
| P2 | Branch | `Computer Science and Engg.` |
| P2 | Register Number | `A S E 2 3 C S 4 5 2 0` |
| P2 | Current Semester | `0 4` |
| P2 | Year of Admission | `2 3` |
| P2 | Annual Family Income (Figures) | `2 8 5 0 0 0` |
| P2 | Bank Account Number | `1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6` |
| P2 | IFSC Code | `S B I N 0 0 0 1 2 3 4` |
| P2 | Bank Name & Branch | `State Bank of India, Aluva Branch` |
| P3 | Particulars of Family Members [Member 2 - Name] | `Anjali S Nair Self` |
| P3 | Particulars of Family Members [Member 3 - Name] | `Suresh Kumar S Father` |
| P3 | Particulars of Family Members [Member 4 - Name] | `Latha Nair Mother` |
| P3 | Particulars of Family Members [Member 5 - Name] | `Arjun S Nair Brother` |

## 2. Missing/Untagged Fields
| Page | Label | Type |
| :--- | :--- | :--- |
| P1 | Community / Category | `choice` |
| P1 | PAN | `comb` |
| P1 | Address for Correspondence Same | `choice` |
| P2 | Academic Records [SSLC - Percentage] | `text` |
| P2 | Academic Records [HSE - Percentage] | `text` |
| P2 | Academic Records [Semester 1 - Percentage] | `text` |
| P2 | Academic Records [Semester 2 - Percentage] | `text` |
| P2 | Occupation of Father / Guardian | `choice` |
| P2 | Account Type | `choice` |
| P3 | Scholarship Category | `choice` |
| P3 | Documents Enclosed | `choice` |
| P3 | Receiving Other Scholarship | `choice` |
| P3 | Other Scholarship Name | `text` |
| P3 | Other Scholarship Amount | `text` |
| P3 | Particulars of Family Members [Member 1 - Name] | `text` |
| P3 | Particulars of Family Members [Member 1 - Relationship] | `text` |
| P3 | Particulars of Family Members [Member 1 - Age] | `text` |
| P3 | Particulars of Family Members [Member 1 - Occupation] | `text` |
| P3 | Particulars of Family Members [Member 1 - Annual Income] | `text` |
| P3 | Particulars of Family Members [Member 2 - Annual Income] | `text` |
| P3 | Particulars of Family Members [Member 3 - Annual Income] | `text` |
| P3 | Particulars of Family Members [Member 4 - Annual Income] | `text` |
| P3 | Particulars of Family Members [Member 5 - Annual Income] | `text` |
| P4 | Correspondence PIN Code | `comb` |
| P4 | Correspondence District | `text` |
| P4 | Correspondence State | `text` |

## 3. False Positives
| Page | Value | BBox (x, y, w, h) |
| :--- | :--- | :--- |
| P1 | `Thottumugham Road, Aluva` | (0.118, 0.652, 0.190, 0.010) |
| P4 | `NOT APPLICABLE (Section 1.12 = Yes)` | (0.118, 0.155, 0.268, 0.010) |
| P4 | `(left blank -` | (0.212, 0.533, 0.054, 0.008) |
| P4 | `sign after printing)` | (0.195, 0.543, 0.087, 0.008) |

## 4. Bounding Box Alignment Shifts (>2%)
| Page | Label | Expected BBox | Actual BBox | Shift (dx%, dy%) | Extracted Value |
| :--- | :--- | :--- | :--- | :--- | :--- |
| P1 | Date of Birth | (0.113, 0.380) | (0.259, 0.369) | (14.6%, 1.1%) | `1 4 /` |
| P1 | PIN Code | (0.150, 0.718) | (0.214, 0.704) | (6.4%, 1.4%) | `6 8 3 1 0 1` |
| P1 | District | (0.400, 0.718) | (0.452, 0.707) | (5.2%, 1.1%) | `Ernakulam` |
| P1 | State | (0.680, 0.718) | (0.728, 0.707) | (4.8%, 1.1%) | `Kerala` |
| P2 | Academic Records [SSLC - Board] | (0.354, 0.310) | (0.305, 0.309) | (4.9%, 0.1%) | `Kerala State Board 2022` |
| P2 | Academic Records [SSLC - Year] | (0.540, 0.310) | (0.599, 0.309) | (5.9%, 0.1%) | `500` |
| P2 | Academic Records [SSLC - Max Marks] | (0.650, 0.310) | (0.708, 0.309) | (5.8%, 0.1%) | `489` |
| P2 | Academic Records [SSLC - Marks Obtained] | (0.760, 0.310) | (0.817, 0.309) | (5.7%, 0.1%) | `97.8%` |
| P2 | Academic Records [HSE - Board] | (0.354, 0.332) | (0.305, 0.329) | (4.9%, 0.3%) | `Kerala State Board 2024` |
| P2 | Academic Records [HSE - Year] | (0.540, 0.332) | (0.599, 0.329) | (5.9%, 0.3%) | `500` |
| P2 | Academic Records [HSE - Max Marks] | (0.650, 0.332) | (0.708, 0.329) | (5.8%, 0.3%) | `465` |
| P2 | Academic Records [HSE - Marks Obtained] | (0.760, 0.332) | (0.817, 0.329) | (5.7%, 0.3%) | `93.0%` |
| P2 | Academic Records [Semester 1 - Board] | (0.354, 0.354) | (0.305, 0.349) | (4.9%, 0.5%) | `APJAKTU 2024` |
| P2 | Academic Records [Semester 1 - Year] | (0.540, 0.354) | (0.599, 0.349) | (5.9%, 0.5%) | `-` |
| P2 | Academic Records [Semester 1 - Max Marks] | (0.650, 0.354) | (0.708, 0.349) | (5.8%, 0.5%) | `-` |
| P2 | Academic Records [Semester 1 - Marks Obtained] | (0.760, 0.354) | (0.817, 0.349) | (5.7%, 0.5%) | `9.13` |
| P2 | Academic Records [Semester 2 - Board] | (0.354, 0.376) | (0.305, 0.369) | (4.9%, 0.7%) | `APJAKTU 2025` |
| P2 | Academic Records [Semester 2 - Year] | (0.540, 0.376) | (0.599, 0.369) | (5.9%, 0.7%) | `-` |
| P2 | Academic Records [Semester 2 - Max Marks] | (0.650, 0.376) | (0.708, 0.369) | (5.8%, 0.7%) | `-` |
| P2 | Academic Records [Semester 2 - Marks Obtained] | (0.760, 0.376) | (0.817, 0.369) | (5.7%, 0.7%) | `9.48` |
| P2 | Annual Family Income (Words) | (0.450, 0.468) | (0.409, 0.465) | (4.1%, 0.3%) | `Rupees Two Lakh Eighty Five Thousand Only` |
| P3 | Particulars of Family Members [Member 2 - Relationship] | (0.410, 0.462) | (0.547, 0.454) | (13.7%, 0.8%) | `19` |
| P3 | Particulars of Family Members [Member 2 - Age] | (0.570, 0.462) | (0.614, 0.454) | (4.4%, 0.8%) | `Student` |
| P3 | Particulars of Family Members [Member 2 - Occupation] | (0.660, 0.462) | (0.790, 0.454) | (13.0%, 0.8%) | `0` |
| P3 | Particulars of Family Members [Member 3 - Relationship] | (0.410, 0.484) | (0.547, 0.475) | (13.7%, 0.9%) | `52` |
| P3 | Particulars of Family Members [Member 3 - Age] | (0.570, 0.484) | (0.614, 0.475) | (4.4%, 0.9%) | `Driver, KSRTC` |
| P3 | Particulars of Family Members [Member 3 - Occupation] | (0.660, 0.484) | (0.790, 0.475) | (13.0%, 0.9%) | `210000` |
| P3 | Particulars of Family Members [Member 4 - Relationship] | (0.410, 0.506) | (0.547, 0.497) | (13.7%, 0.9%) | `48` |
| P3 | Particulars of Family Members [Member 4 - Age] | (0.570, 0.506) | (0.614, 0.497) | (4.4%, 0.9%) | `Homemaker` |
| P3 | Particulars of Family Members [Member 4 - Occupation] | (0.660, 0.506) | (0.790, 0.497) | (13.0%, 0.9%) | `0` |
| P3 | Particulars of Family Members [Member 5 - Relationship] | (0.410, 0.528) | (0.547, 0.518) | (13.7%, 1.0%) | `15` |
| P3 | Particulars of Family Members [Member 5 - Age] | (0.570, 0.528) | (0.614, 0.518) | (4.4%, 1.0%) | `Student` |
| P3 | Particulars of Family Members [Member 5 - Occupation] | (0.660, 0.528) | (0.790, 0.518) | (13.0%, 1.0%) | `0` |
| P4 | Place | (0.150, 0.459) | (0.179, 0.445) | (2.9%, 1.4%) | `Aluva, Ernakulam` |
| P4 | Date | (0.450, 0.459) | (0.533, 0.442) | (8.3%, 1.7%) | `1 5 / 0 8 /` |
| P4 | Applicant Signature | (0.700, 0.450) | (0.651, 0.442) | (4.9%, 0.8%) | `2 0 2 6` |

## 5. Validation Failures / Format Mismatches
*No validation failures detected.*

## 6. Recommended Programmatic Solutions

### 6.1 Bounding Box Shifts (>2% deviation)
- **Issue:** Coordinates mapped to visual text deviates from reference schema.
- **Fix:** Calculate bounding box shifts relative to a static anchor (e.g. page headers or logo) and apply translation scaling. Standardize page viewport dimensions (e.g. normalize to standard A4 points size 595x842) before writing fields.

### 6.2 Missing / Untagged Fields
- **Issue:** Fields are unpopulated because no overlapping text items were detected.
- **Fix:** Expand search box margins (specifically horizontal padding) for character cells like Aadhaar and PAN, and implement checks for ZapfDingbats checkmark glyphs (e.g. checking characters like '3', '51', '✓').

### 6.3 False Positives
- **Issue:** Template texts or labels parsed as input values.
- **Fix:** Implement robust template subtraction by building a cached key of the empty template's text items and filtering them out of any scanned form before layout calculations.

### 6.4 Validation Failures
- **Issue:** Scanned values fail format checks (e.g. Aadhaar shorter than 12 digits, or PAN having 13 characters).
- **Fix:** Enhance character recognition validation by applying dynamic regex patterns per profile key (e.g. \d{12} for Aadhaar, [A-Z]{5}\d{4}[A-Z] for PAN) and flagging violations prior to data ingestion.
