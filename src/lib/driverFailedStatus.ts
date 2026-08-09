import { addDays, format } from 'date-fns';

export const DELIVERY_TOMORROW_REASON = 'Delivery Tomorrow';
export const CUSTOMER_RESCHEDULE_REASON = 'Customer requested reschedule';
const BRUNEI_TIME_ZONE = 'Asia/Brunei';

export function normalizeFailedReason(value: string | null | undefined) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function sortFailedStatusReasons<T extends { label: string }>(reasons: T[]) {
  return [...reasons].sort((left, right) => {
    const leftLabel = normalizeFailedReason(left.label);
    const rightLabel = normalizeFailedReason(right.label);
    if (leftLabel === normalizeFailedReason(DELIVERY_TOMORROW_REASON)) {
      return rightLabel === normalizeFailedReason('Other') ? -1 : 0;
    }
    if (rightLabel === normalizeFailedReason(DELIVERY_TOMORROW_REASON)) {
      return leftLabel === normalizeFailedReason('Other') ? 1 : 0;
    }
    return 0;
  });
}

export function getTomorrowDateKey(today = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: BRUNEI_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(today);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const bruneiDate = new Date(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
  );
  return format(addDays(bruneiDate, 1), 'yyyy-MM-dd');
}

export function getFailedStatusDate(reason: string, requestedDate?: string | null, today = new Date()) {
  const normalizedReason = normalizeFailedReason(reason);
  const tomorrowDateKey = getTomorrowDateKey(today);

  if (normalizedReason === normalizeFailedReason(DELIVERY_TOMORROW_REASON)) {
    return { valid: true, nextDeliveryDate: tomorrowDateKey };
  }

  if (normalizedReason === normalizeFailedReason(CUSTOMER_RESCHEDULE_REASON)) {
    if (!requestedDate || requestedDate < tomorrowDateKey) {
      return { valid: false, nextDeliveryDate: undefined };
    }
    return { valid: true, nextDeliveryDate: requestedDate };
  }

  return { valid: true, nextDeliveryDate: undefined };
}
