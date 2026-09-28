/**
 * Currency formatting utilities for the application.
 * Display currency changes the code/symbol only; it never converts amounts.
 */

import type { DisplayCurrency } from '@/types/database';

export const DISPLAY_CURRENCY_OPTIONS: { value: DisplayCurrency; label: string }[] = [
  { value: 'BND', label: 'BND — Brunei Dollar' },
  { value: 'MYR', label: 'MYR / RM — Malaysian Ringgit' },
];

let activeDisplayCurrency: DisplayCurrency = 'BND';

export function normalizeDisplayCurrency(value: string | null | undefined): DisplayCurrency {
  return value === 'MYR' ? 'MYR' : 'BND';
}

export function setDisplayCurrency(value: string | null | undefined): void {
  activeDisplayCurrency = normalizeDisplayCurrency(value);
}

export function getDisplayCurrency(): DisplayCurrency {
  return activeDisplayCurrency;
}

export function getDisplayCurrencyPrefix(currency = activeDisplayCurrency): string {
  return currency === 'MYR' ? 'RM' : 'BND';
}

/**
 * Format a stored amount using the current user's display currency.
 * @param amount - The numeric amount to format
 * @param showSymbol - Whether to show "BND" prefix (default: true)
 * @returns Formatted string like "BND 10.00" / "RM 10.00" or "10.00"
 */
export function formatBND(amount: number | string | null | undefined, showSymbol = true): string {
  const num = Number(amount) || 0;
  const formatted = num.toFixed(2);
  return showSymbol ? `${getDisplayCurrencyPrefix()} ${formatted}` : formatted;
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
