import { describe, expect, it, beforeEach } from 'vitest';
import {
  formatBND,
  getDisplayCurrency,
  normalizeDisplayCurrency,
  setDisplayCurrency,
} from './currency';

describe('display currency', () => {
  beforeEach(() => setDisplayCurrency('BND'));

  it('changes only the displayed prefix and preserves the stored amount', () => {
    setDisplayCurrency('MYR');

    expect(formatBND(793)).toBe('RM 793.00');
    expect(formatBND(793, false)).toBe('793.00');
    expect(getDisplayCurrency()).toBe('MYR');
  });

  it('falls back to BND for unsupported or missing values', () => {
    expect(normalizeDisplayCurrency(undefined)).toBe('BND');
    expect(normalizeDisplayCurrency('SGD')).toBe('BND');
    expect(formatBND(793)).toBe('BND 793.00');
  });
});
