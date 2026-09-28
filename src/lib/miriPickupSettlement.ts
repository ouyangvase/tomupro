export type MiriSettlement = {
  settlementBase: string;
  actualPickupCharge: string;
  internalOffset: string;
  runnerPayable: string;
  sellerCharge: string;
};

function toCents(value: string | number) {
  const text = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Amount must be a positive decimal with at most 2 decimal places');
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

function fromCents(cents: bigint) {
  return `${cents / 100n}.${(cents % 100n).toString().padStart(2, '0')}`;
}

export function calculateMiriPickupSettlement(actual: string | number, base: string | number = '200.00'): MiriSettlement {
  const actualCents = toCents(actual);
  const baseCents = toCents(base);
  if (actualCents <= 0n) throw new Error('Actual pickup charge must be greater than zero');
  if (actualCents > baseCents) throw new Error('AMOUNT_EXCEEDS_SETTLEMENT_BASE');
  const actualValue = fromCents(actualCents);
  return {
    settlementBase: fromCents(baseCents),
    actualPickupCharge: actualValue,
    internalOffset: fromCents(baseCents - actualCents),
    runnerPayable: actualValue,
    sellerCharge: actualValue,
  };
}
