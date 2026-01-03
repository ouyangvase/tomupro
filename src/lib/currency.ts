/**
 * Currency formatting utilities for the application.
 * The entire app uses BND (Brunei Dollar) as the primary currency.
 */

/**
 * Format a number as BND currency
 * @param amount - The numeric amount to format
 * @param showSymbol - Whether to show "BND" prefix (default: true)
 * @returns Formatted string like "BND 10.00" or "10.00"
 */
export function formatBND(amount: number | string | null | undefined, showSymbol = true): string {
  const num = Number(amount) || 0;
  const formatted = num.toFixed(2);
  return showSymbol ? `BND ${formatted}` : formatted;
}

/**
 * Format a number as RM (Malaysian Ringgit) for admin reconciliation view
 * @param amount - The numeric amount to format
 * @returns Formatted string like "RM 10.00"
 */
export function formatRM(amount: number | string | null | undefined): string {
  const num = Number(amount) || 0;
  return `RM ${num.toFixed(2)}`;
}

/**
 * Parse a currency string to a number
 * Removes any currency symbols and whitespace
 */
export function parseCurrencyString(value: string): number {
  const cleaned = value.replace(/[^0-9.-]/g, '');
  return parseFloat(cleaned) || 0;
}

/**
 * Convert BND to RM using exchange rate
 */
export function convertBNDtoRM(bndAmount: number, exchangeRate: number): number {
  return Number((bndAmount * exchangeRate).toFixed(2));
}

/**
 * Format exchange rate for display
 */
export function formatExchangeRate(rate: number | string | null | undefined): string {
  const num = Number(rate) || 0;
  return num.toFixed(4);
}
