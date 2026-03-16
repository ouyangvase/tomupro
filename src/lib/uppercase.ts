/**
 * Converts only Latin alphabet characters to uppercase.
 * Preserves Unicode characters (Chinese, Arabic, etc.), numbers, and symbols.
 */
export function toUpperLatin(value: string | null | undefined): string {
  if (!value) return '';
  return value.replace(/[a-z]/g, char => char.toUpperCase());
}

/**
 * Applies uppercase normalization to all text fields of an order data object.
 */
export function normalizeOrderFields<T extends Record<string, unknown>>(data: T): T {
  const textFields = ['order_code', 'customer_name', 'address', 'area', 'channel', 'notes', 'order_ref'];
  const result = { ...data };
  for (const field of textFields) {
    if (typeof result[field] === 'string') {
      (result as any)[field] = toUpperLatin(result[field] as string);
    }
  }
  return result;
}
