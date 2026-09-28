const normalizeState = (value: unknown) => String(value ?? '').trim().toUpperCase().replace(/[- ]+/g, '_');

const RECEIPT_ONLY_ACTIONS = new Set([
  'RECEIPT_UPLOADED',
  'RECEIPT_REUPLOADED',
  'RECEIPT_RE_UPLOADED',
  'CONFIRM_RECEIPT',
  'RECEIPT_CONFIRM',
  'RECEIPT_CONFIRMED',
  'FORCE_CONFIRM_RECEIPT',
  'RECEIPT_FORCE_CONFIRMED',
  'RECEIPT_REJECTED',
]);

const LOCATION_LABELS: Record<string, string> = {
  BOOKING: 'BOOKING SALES',
  READY: 'READY ORDER',
  ACTION_REQUIRED: 'ACTION REQUIRED',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
};

type JourneyEventKind = 'Lifecycle' | 'Runner assignment' | 'Driver assignment' | 'Driver action' | 'Runner decision';

export type JourneyTimelineItem = {
  key: string;
  occurredAt: string | null;
  kind: JourneyEventKind;
  title: string;
  operator: string;
  operatorRole: string;
  driver: string | null;
  runner: string | null;
  tab: string | null;
  from: string | null;
  to: string | null;
  detail: string | null;
};

const valueText = (value: unknown) => String(value ?? '').trim();

const displayTitle = (value: unknown) => valueText(value)
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .toLowerCase()
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const actionText = (event: Record<string, unknown>) => [
  event.action,
  event.event_type,
  event.result_type,
  event.decision,
  event.description,
].filter(Boolean).map(valueText).join(' ').toUpperCase();

const isReceiptOnlyEvent = (event: Record<string, unknown>) => [
  event.action_type,
  event.action,
  event.event_type,
].some((value) => RECEIPT_ONLY_ACTIONS.has(normalizeState(value)));

const eventTime = (event: Record<string, unknown>) => valueText(event.occurred_at || event.submitted_at || event.decided_at);

const eventKind = (value: unknown): JourneyEventKind => {
  if (value === 'Runner assignment' || value === 'Driver assignment' || value === 'Driver action' || value === 'Runner decision') return value;
  return 'Lifecycle';
};

const eventActor = (event: Record<string, unknown>, kind: JourneyEventKind) => {
  if (kind === 'Driver action') return valueText(event.driver_name || event.actor_name) || 'System';
  const actor = valueText(event.assigned_by_name || event.actor_name || event.runner_name);
  if (actor) return actor;
  return kind === 'Runner decision' ? 'Runner' : 'System';
};

const eventRole = (event: Record<string, unknown>, kind: JourneyEventKind) =>
  valueText(event.actor_role || event.assigned_by_role)
  || (kind === 'Driver action' ? 'Driver' : kind === 'Lifecycle' ? 'System' : 'Runner');

const isUnassign = (event: Record<string, unknown>) => /UNASSIGN|REMOVE|RELEASE|RETURN/.test(actionText(event));

const eventTitle = (event: Record<string, unknown>, kind: JourneyEventKind) => {
  const raw = actionText(event);
  if (kind === 'Runner assignment') return isUnassign(event) ? 'Runner removed' : 'Runner assigned';
  if (kind === 'Driver assignment') return isUnassign(event) ? 'Driver removed' : 'Driver assigned';
  if (kind === 'Driver action') {
    if (/RESCHEDULE|TOMORROW/.test(raw)) return 'Driver chose reschedule';
    if (/FAIL|FAILED|NOT DELIVER/.test(raw)) return 'Driver marked failed';
    if (/DELIVER|SUCCESS/.test(raw)) return 'Driver marked delivered';
    return 'Driver updated delivery';
  }
  if (kind === 'Runner decision') {
    if (/REJECT/.test(raw)) return 'Runner rejected driver result';
    if (/FAIL/.test(raw)) return 'Runner accepted failed delivery';
    if (/DELIVER|SUCCESS/.test(raw)) return 'Runner accepted delivery';
    return 'Runner reviewed delivery';
  }
  return displayTitle(event.event_type || event.action || event.description) || 'Order updated';
};

const eventDriver = (event: Record<string, unknown>) =>
  valueText(event.driver_name || event.assigned_driver_name || event.driver) || null;

const eventRunner = (event: Record<string, unknown>) =>
  valueText(event.runner_name || event.assigned_runner_name || event.source_runner_name) || null;

const eventDetail = (event: Record<string, unknown>) => {
  const detail = valueText(event.failure_reason || event.reason || event.remark || event.description);
  const rescheduleDate = valueText(event.reschedule_date);
  if (detail && rescheduleDate) return `${detail} · New date: ${rescheduleDate}`;
  if (detail) return detail;
  if (rescheduleDate) return `New date: ${rescheduleDate}`;
  return null;
};

const eventSignature = (event: Record<string, unknown>, kind: JourneyEventKind) => [
  eventTime(event),
  kind,
  actionText(event),
  eventDriver(event),
  eventRunner(event),
  eventActor(event, kind),
].join('|');

/**
 * Converts the five backend history collections into one readable timeline.
 * Duplicate audit/assignment rows are removed here so one user action is shown once.
 */
export function buildJourneyTimeline(journey: {
  lifecycle?: Record<string, unknown>[];
  runner_assignments?: Record<string, unknown>[];
  driver_assignments?: Record<string, unknown>[];
  driver_actions?: Record<string, unknown>[];
  runner_decisions?: Record<string, unknown>[];
}) {
  const lifecycleEvents = (journey.lifecycle || []).filter((event) => {
    const raw = actionText(event);
    return !(/DRIVER|RUNNER/.test(raw) && /ASSIGN|UNASSIGN|REMOVE|RELEASE|RETURN/.test(raw));
  });
  const rawEvents: Array<Record<string, unknown> & { __kind: JourneyEventKind }> = [
    ...lifecycleEvents.map((event) => ({ ...event, __kind: 'Lifecycle' as const })),
    ...(journey.runner_assignments || []).map((event) => ({ ...event, __kind: 'Runner assignment' as const })),
    ...(journey.driver_assignments || []).map((event) => ({ ...event, __kind: 'Driver assignment' as const })),
    ...(journey.driver_actions || []).map((event) => ({ ...event, __kind: 'Driver action' as const })),
    ...(journey.runner_decisions || []).map((event) => ({ ...event, __kind: 'Runner decision' as const })),
  ].sort((a, b) => new Date(eventTime(a) || 0).getTime() - new Date(eventTime(b) || 0).getTime());

  const seen = new Set<string>();
  let previousTab: string | null = null;
  let previousDriver: string | null = null;
  let previousRunner: string | null = null;

  return rawEvents.reduce<JourneyTimelineItem[]>((items, event, index) => {
    const kind = eventKind(event.__kind);
    const signature = eventSignature(event, kind);
    if (seen.has(signature)) return items;
    seen.add(signature);

    // A Driver submission is evidence for the Runner, not an order-location
    // transition. The location changes only when the Runner reviews it.
    const movement = kind === 'Driver action' ? null : getJourneyEventMovement(event);
    const tab = kind === 'Driver action' ? previousTab : getJourneyEventLocation(event, previousTab);
    const explicitDriver = eventDriver(event);
    const explicitRunner = eventRunner(event);
    const driver = explicitDriver || (kind === 'Driver assignment' && isUnassign(event) ? previousDriver : null);
    const runner = explicitRunner || (kind === 'Runner assignment' && isUnassign(event) ? previousRunner : null);
    if (tab) previousTab = tab;
    if (explicitDriver) previousDriver = explicitDriver;
    if (explicitRunner) previousRunner = explicitRunner;

    items.push({
      key: `${signature}|${index}`,
      occurredAt: eventTime(event) || null,
      kind,
      title: eventTitle(event, kind),
      operator: eventActor(event, kind),
      operatorRole: eventRole(event, kind),
      driver,
      runner,
      tab,
      from: movement?.from || null,
      to: movement?.to || null,
      detail: eventDetail(event),
    });
    return items;
  }, []);
}

export function orderLocation(value: unknown) {
  return LOCATION_LABELS[normalizeState(value)] || null;
}

function stateFromPart(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const part = value as Record<string, unknown>;
  return orderLocation(part.current_operational_state || part.operational_state || part.operational_status || part.status);
}

export function getJourneyEventMovement(event: Record<string, unknown>) {
  if (isReceiptOnlyEvent(event)) return null;

  const metadata = event.metadata && typeof event.metadata === 'object'
    ? event.metadata as Record<string, unknown>
    : {};
  const from = stateFromPart(metadata.before)
    || orderLocation(event.previous_order_state || event.previous_operational_state || event.previous_status);
  const to = stateFromPart(metadata.after)
    || orderLocation(event.new_order_state || event.new_operational_state || event.new_status)
    || orderLocation(event.order_location);

  return from && to ? { from, to } : null;
}

/**
 * Returns only state evidence recorded with the event. It intentionally does
 * not fall back to the order's current state: history must never be labelled
 * with a later projection.
 */
export function getJourneyEventLocation(event: Record<string, unknown>, previousLocation: string | null = null) {
  // Receipt confirmation/upload changes payment evidence only. Legacy rows may
  // carry a stale BOOKING location from a partial audit snapshot, so receipt
  // events inherit the last lifecycle tab instead of moving the order.
  if (isReceiptOnlyEvent(event)) return previousLocation || null;

  const movement = getJourneyEventMovement(event);
  return orderLocation(event.order_location)
    || movement?.to
    || stateFromPart(event)
    || orderLocation(event.new_order_state || event.new_operational_state || event.new_status)
    || previousLocation
    || null;
}
