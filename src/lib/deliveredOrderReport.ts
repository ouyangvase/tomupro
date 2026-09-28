const REPORT_TIME_ZONE = 'Asia/Kuala_Lumpur';
const REPORT_DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-GB', {
  timeZone: REPORT_TIME_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const REPORT_DATE_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: REPORT_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export const EXCLUDE_P_AREAS_FILTER = '__exclude_p_areas__';

export function isPNumberArea(area: string | null | undefined): boolean {
  return /^P\d+$/i.test(area?.trim() || '');
}

type DeliveredTimestampFields = {
  driver_delivered_at?: string | null;
  delivered_at?: string | null;
};

export function getDeliveredOrderTimestamp(order: DeliveredTimestampFields): string | null {
  return order.driver_delivered_at || order.delivered_at || null;
}

export function formatKualaLumpurDateTime(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = REPORT_DATE_TIME_FORMATTER.formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${values.day} ${values.month} ${values.year} ${values.hour}:${values.minute}`;
}

export function getKualaLumpurDateKey(value: Date | string): string | null {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const parts = REPORT_DATE_FORMATTER.formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value: partValue }) => [type, partValue]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isDeliveredInKualaLumpurDateRange(
  order: DeliveredTimestampFields,
  fromKey?: string | null,
  toKey?: string | null,
): boolean {
  const deliveredDateKey = getKualaLumpurDateKey(getDeliveredOrderTimestamp(order));
  if (!deliveredDateKey) return false;
  return (!fromKey || deliveredDateKey >= fromKey) && (!toKey || deliveredDateKey <= toKey);
}
