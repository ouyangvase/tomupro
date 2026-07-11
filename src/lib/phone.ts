/**
 * Phone Number Utilities
 *
 * Central module for phone number handling across TOMUPRO.
 * RULE: Phone numbers are ALWAYS stored and displayed as exact user input.
 * Never convert to number, float, or allow scientific notation.
 *
 * International numbers are preserved exactly as imported.
 * Only Brunei numbers (starting with +673, 673, 7x, 8x) may be optionally cleaned.
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
 * Determine if a phone number is a Brunei number.
 *
 * Brunei numbers match one of:
 * - Starts with +673
 * - Starts with 673 (and has >7 digits total)
 * - Starts with 7 or 8 (local Brunei mobile, 7 digits)
 *
 * Everything else is treated as international.
 */
export function isBruneiPhone(phone: string): boolean {
  if (!phone) return false;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');

  // +673... or 673... with enough digits
  if (trimmed.startsWith('+673')) return true;
  if (digits.startsWith('673') && digits.length > 7) return true;

  // Local Brunei: starts with 7 or 8, total digits = 7
  // (without any country code prefix like + or 00)
  if (!trimmed.startsWith('+') && !trimmed.startsWith('00')) {
    if ((digits.startsWith('7') || digits.startsWith('8')) && digits.length === 7) return true;
  }

  return false;
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
 *
 * NOTE: Does NOT reject non-Brunei numbers.
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
 * Returns digits with appropriate country code for wa.me link.
 *
 * - Brunei numbers: strips formatting, ensures 673 prefix
 * - International numbers: strips non-digits only (preserves country code)
 */
export function sanitizePhoneForWhatsApp(phone: string): string {
  if (!phone) return '';

  // If the phone is scientific notation, it's corrupted — return empty
  if (isScientificNotation(phone.trim())) return '';

  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');

  if (isBruneiPhone(trimmed)) {
    // Brunei number: extract local digits and prepend 673
    let local = digits;
    if (local.startsWith('673') && local.length > 7) {
      local = local.slice(3);
    }
    // Remove leading 0 if present
    if (local.startsWith('0') && local.length > 1) {
      local = local.slice(1);
    }
    return BRUNEI_COUNTRY_CODE + local;
  }

  // International number: return digits as-is (should already include country code)
  // If starts with 0, it might be a local number without country code — return as-is
  return digits;
}

/**
 * Generate a WhatsApp URL from a phone number.
 *
 * Rules:
 * - Brunei numbers: prepend +673 for the wa.me link
 * - International numbers: use the number's own country code
 * - Do NOT modify the stored phone value
 */
export function buildWhatsAppUrl(phone: string): string | null {
  const sanitized = sanitizePhoneForWhatsApp(phone);
  if (!sanitized) return null;
  return `https://wa.me/${sanitized}`;
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
