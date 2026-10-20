import { format, parseISO, subDays } from 'date-fns';

export function bruneiDateKey(date = new Date()) {
  return format(date, 'yyyy-MM-dd');
}

export function isLatestThreeCalendarDays(value: string, today = new Date()) {
  const selected = parseISO(value);
  const todayKey = bruneiDateKey(today);
  const earliestKey = bruneiDateKey(subDays(today, 2));
  return value >= earliestKey && value <= todayKey && !Number.isNaN(selected.getTime());
}

export function calculateReconciliation(acceptedCash: number, cashHanded: number, cdmAmount: number) {
  const accepted = Number(acceptedCash || 0);
  const cash = Math.max(Number(cashHanded || 0), 0);
  const cdm = Math.max(Number(cdmAmount || 0), 0);
  const declared = Number((cash + cdm).toFixed(2));
  return {
    declared,
    difference: Number((accepted - declared).toFixed(2)),
    balanced: Math.abs(accepted - declared) <= 0.005,
  };
}

export function hasDriverFinanceAmount(driver: {
  accepted_cash?: unknown;
  cash_handed?: unknown;
  cdm_amount?: unknown;
}) {
  return [driver.accepted_cash, driver.cash_handed, driver.cdm_amount].some((value) => {
    const amount = Number(value ?? 0);
    return Number.isFinite(amount) && amount !== 0;
  });
}

export function calculateClaimGross(batchTotal: number, outAmount: number) {
  const total = Math.max(Number(batchTotal || 0), 0);
  const out = Math.max(Number(outAmount || 0), 0);
  if (out > total) return null;
  return Number((total - out).toFixed(2));
}
