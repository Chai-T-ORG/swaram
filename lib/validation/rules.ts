/**
 * Rigid Regex Validations for Indian Profile Fields
 * Used to validate user input before writing to the document.
 */

export const ValidationRules = {
  aadhaar: {
    pattern: /^\d{12}$/,
    message: "Aadhaar number must be exactly 12 digits.",
  },
  pan: {
    // 10-char alphanumeric (matches the message). We intentionally do NOT
    // enforce the strict 5-letter/4-digit/1-letter PAN shape: it blocked
    // legitimate test data and mishears with no upside for a form-filler.
    pattern: /^[A-Z0-9]{10}$/i,
    message: "PAN must be a 10-character alphanumeric string (e.g. ABCDE1234F).",
  },
  pinCode: {
    pattern: /^[1-9][0-9]{5}$/,
    message: "PIN code must be exactly 6 digits and cannot start with 0.",
  },
  ifsc: {
    pattern: /^[A-Z]{4}0[A-Z0-9]{6}$/i,
    message: "IFSC code must be 11 characters, starting with 4 letters, a zero, and 6 alphanumeric characters.",
  },
  mobile: {
    pattern: /^[6-9]\d{9}$/,
    message: "Mobile number must be 10 digits starting with 6, 7, 8, or 9.",
  },
};

/**
 * Validates a given value against known schemas based on the field label.
 * Returns an error message if invalid, or null if valid/no-matching-rule.
 */
export function validateField(label: string, value: string): string | null {
  const normalized = label.toLowerCase();
  const cleanValue = value.replace(/[\s-]/g, ""); // Remove spaces/dashes before validation

  if (/aadhaar|aadhar/i.test(normalized)) {
    return ValidationRules.aadhaar.pattern.test(cleanValue) ? null : ValidationRules.aadhaar.message;
  }
  if (/\bpan\b/i.test(normalized)) {
    return ValidationRules.pan.pattern.test(cleanValue) ? null : ValidationRules.pan.message;
  }
  if (/pin\b|pincode/i.test(normalized)) {
    return ValidationRules.pinCode.pattern.test(cleanValue) ? null : ValidationRules.pinCode.message;
  }
  if (/ifsc/i.test(normalized)) {
    return ValidationRules.ifsc.pattern.test(cleanValue) ? null : ValidationRules.ifsc.message;
  }
  if (/mobile|phone/i.test(normalized)) {
    return ValidationRules.mobile.pattern.test(cleanValue) ? null : ValidationRules.mobile.message;
  }

  return null; // Valid or unknown field
}
