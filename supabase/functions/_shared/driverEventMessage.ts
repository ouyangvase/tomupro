export interface DriverTelegramMessageEvent {
  event_type: string;
  metadata: Record<string, any> | null;
  submitted_at: string | null;
  created_at: string;
}

export interface DriverTelegramMessageOrder {
  order_code: string | null;
  total_amount: number | string | null;
  driver_failed_reason: string | null;
  driver_failed_remark: string | null;
  driver_next_delivery_date: string | null;
}

export interface DriverTelegramMessageAttempt {
  result_type: string | null;
  failure_reason: string | null;
  remark: string | null;
  reschedule_date: string | null;
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatAmount(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'BND 0.00';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'BND 0.00';
  return `BND ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatEventDate(value: unknown): string {
  const date = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Brunei',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatDeliveryDate(value: unknown): string {
  const raw = String(value || '').trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00+08:00`)
    : new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Brunei',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

export function driverEventMessage(
  event: DriverTelegramMessageEvent,
  order: DriverTelegramMessageOrder,
  driverName?: string | null,
  attempt?: DriverTelegramMessageAttempt | null,
): string {
  const metadata = event.metadata || {};
  const orderCode = escapeHtml(metadata.order_code || order.order_code || 'Unknown order');
  const eventDate = event.event_type === 'driver_delivered'
    ? formatEventDate(metadata.driver_delivered_at || metadata.submitted_at || event.submitted_at || event.created_at)
    : formatEventDate(metadata.submitted_at || event.submitted_at || event.created_at);
  const amount = formatAmount(metadata.total_amount ?? order.total_amount);
  const header = [
    `<b>${orderCode}</b>`,
    ...(driverName?.trim() ? [`Driver: ${escapeHtml(driverName.trim())}`] : []),
    '',
  ];

  if (event.event_type === 'driver_failed') {
    const reason = String(
      attempt ? attempt.failure_reason || '' : metadata.driver_failed_reason || order.driver_failed_reason || '',
    ).trim();
    const remark = String(
      attempt ? attempt.remark || '' : metadata.driver_failed_remark || order.driver_failed_remark || '',
    ).trim();
    const nextDeliveryDate = String(
      attempt ? attempt.reschedule_date || '' : metadata.driver_next_delivery_date || order.driver_next_delivery_date || '',
    ).trim();
    const normalizedReason = reason.toLowerCase().replace(/\s+/g, ' ');

    if (normalizedReason === 'delivery tomorrow') {
      return [
        ...header,
        escapeHtml(reason),
        ...(nextDeliveryDate ? [formatDeliveryDate(nextDeliveryDate)] : []),
      ].join('\n');
    }

    if (normalizedReason === 'customer requested reschedule' && nextDeliveryDate) {
      return [
        ...header,
        escapeHtml(reason),
        'New Delivery Date:',
        formatDeliveryDate(nextDeliveryDate),
        ...(remark ? [`Remark: ${escapeHtml(remark)}`] : []),
      ].join('\n');
    }

    return [
      ...header,
      'Failed Delivery',
      eventDate,
      ...(reason ? [`Reason: ${escapeHtml(reason)}`] : []),
      ...(remark ? [`Remark: ${escapeHtml(remark)}`] : []),
    ].join('\n');
  }

  return [
    ...header,
    'Delivered',
    eventDate,
    `Amount: ${amount}`,
  ].join('\n');
}
