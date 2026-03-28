/**
 * Phone Number Utilities
 *
 * Central module for phone number handling across TOMUPRO.
 * RULE: Phone numbers are ALWAYS stored and displayed as exact user input.
 * Never convert to number, float, or allow scientific notation.
 */

const BRUNEI_COUNTRY_CODE = '673';

/**
 * Detect if a string looks like scientific notation (e.g. 6.28776E+12, 1.23e10).
 * These values indicate a corrupted phone number from Excel numeric formatting.
 */
export function isScientificNotation(value: string): boolean {
  if (!value) return false;
  return /^[+-]?\d+\.?\d*[eE][+-]?\d+$/.test(value.trim());
}

/**
 * Validate a phone number string.
 * Returns an error message if invalid, or null if valid.
 *
 * Rules:
 * - Must not be scientific notation
 * - Must not be empty
 * - Must contain at least 6 digits
 * - Allowed characters: digits, +, -, spaces, parentheses
 */
export function validatePhone(phone: string): string | null {
  if (!phone || !phone.trim()) return 'Phone is required';

  const trimmed = phone.trim();

  // Reject scientific notation
  if (isScientificNotation(trimmed)) {
    return 'Phone number format invalid (scientific notation detected, e.g. 6.28E+12). Please enter the phone number as text.';
  }

  // Reject if contains E/e followed by + (partial scientific notation in a longer string)
  if (/\d[eE][+-]\d/.test(trimmed)) {
    return 'Phone number format invalid (contains scientific notation). Please enter the phone number as text.';
  }

  // Must contain at least 6 digits
  const digitCount = (trimmed.match(/\d/g) || []).length;
  if (digitCount < 6) {
    return 'Phone number must contain at least 6 digits';
  }

  // Only allow digits, +, -, spaces, parentheses, dots (for formatting)
  if (!/^[\d\s+\-().]+$/.test(trimmed)) {
    return 'Phone number contains invalid characters';
  }

  return null; // valid
}

/**
 * Sanitize a phone number for use in WhatsApp links.
 * Extracts digits only, handles country code.
 *
 * - If phone starts with "+673" or "673", strip the country code prefix
 * - Returns local digits only (no country code)
 */
export function sanitizePhoneForWhatsApp(phone: string): string {
  if (!phone) return '';

  // If the phone is scientific notation, it's corrupted — return empty
  if (isScientificNotation(phone.trim())) return '';

  // Remove all non-digits
  let digits = phone.replace(/\D/g, '');

  // Strip 673 country code if present at start
  if (digits.startsWith('673') && digits.length > 7) {
    digits = digits.slice(3);
  }

  return digits;
}

/**
 * Generate a WhatsApp URL from a phone number.
 *
 * Rules:
 * - Always prepend +673 for the wa.me link (Brunei default)
 * - Do NOT modify the stored phone value
 * - If phone starts with "+" it may already have a country code,
 *   but for this system all phones are Brunei local numbers
 */
export function buildWhatsAppUrl(phone: string): string | null {
  const local = sanitizePhoneForWhatsApp(phone);
  if (!local) return null;
  return `https://wa.me/${BRUNEI_COUNTRY_CODE}${local}`;
}

/**
 * Format phone for display — always returns the exact stored value.
 * Never applies numeric formatting.
 */
export function formatPhoneDisplay(phone: string | null | undefined): string {
  if (!phone) return '-';
  // Safety: if somehow a number-like value snuck in, ensure string output
  return String(phone);
}
