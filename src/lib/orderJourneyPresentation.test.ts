import { describe, expect, it } from 'vitest';
import { buildJourneyTimeline, getJourneyEventLocation, getJourneyEventMovement, orderLocation } from './orderJourneyPresentation';

describe('order journey presentation', () => {
  it('maps canonical states to their actual order page labels', () => {
    expect(orderLocation('ACTION_REQUIRED')).toBe('ACTION REQUIRED');
    expect(orderLocation('booking')).toBe('BOOKING SALES');
  });

  it('uses the state recorded at the event instead of the current state', () => {
    const event = {
      metadata: {
        before: { current_operational_state: 'READY' },
        after: { current_operational_state: 'ACTION_REQUIRED' },
      },
    };

    expect(getJourneyEventMovement(event)).toEqual({ from: 'READY ORDER', to: 'ACTION REQUIRED' });
    expect(getJourneyEventLocation(event)).toBe('ACTION REQUIRED');
  });

  it('does not invent a historical page for events without state evidence', () => {
    expect(getJourneyEventLocation({ action: 'ASSIGN DRIVER', driver_name: 'Driver' })).toBeNull();
    expect(getJourneyEventLocation({ action: 'ASSIGN DRIVER', driver_name: 'Driver' }, 'READY ORDER')).toBe('READY ORDER');
  });

  it('uses the server-projected order location for events without a full snapshot', () => {
    expect(getJourneyEventLocation({ action: 'DRIVER_FAILURE_ACCEPTED', order_location: 'ACTION_REQUIRED' }))
      .toBe('ACTION REQUIRED');
    expect(getJourneyEventMovement({
      order_location: 'ACTION_REQUIRED',
      metadata: { before: { status: 'READY' } },
    })).toEqual({ from: 'READY ORDER', to: 'ACTION REQUIRED' });
  });

  it('does not move a delivered order to Booking Sales when receipt is confirmed', () => {
    const receiptEvent = {
      action: 'Confirm Receipt',
      event_type: 'Confirm Receipt',
      order_location: 'BOOKING',
      metadata: { after: { runner_review_status: 'REVIEWED' } },
    };

    expect(getJourneyEventMovement(receiptEvent)).toBeNull();
    expect(getJourneyEventLocation(receiptEvent, 'DELIVERED')).toBe('DELIVERED');
  });

  it('keeps receipt-only timeline events on the previous lifecycle tab', () => {
    const timeline = buildJourneyTimeline({
      lifecycle: [
        {
          action: 'DRIVER_DELIVERY_ACCEPTED',
          occurred_at: '2026-08-29T00:12:00.000Z',
          order_location: 'DELIVERED',
        },
        {
          action: 'Confirm Receipt',
          event_type: 'Confirm Receipt',
          occurred_at: '2026-09-01T06:07:30.000Z',
          order_location: 'BOOKING SALES',
          metadata: { after: { receipt_status: 'confirmed' } },
        },
      ],
    });

    expect(timeline.map((event) => event.tab)).toEqual(['DELIVERED', 'DELIVERED']);
  });

  it('shows one clear row for an assignment instead of repeating the audit copy', () => {
    const timeline = buildJourneyTimeline({
      lifecycle: [{
        occurred_at: '2026-08-20T02:20:38.000Z',
        action: 'ASSIGN DRIVER',
        description: 'Driver assigned',
        actor_name: 'Yc',
      }],
      driver_assignments: [{
        occurred_at: '2026-08-20T02:20:38.000Z',
        action: 'DRIVER_ASSIGNED',
        driver_name: 'Ming',
        assigned_by_name: 'Yc',
        assigned_by_role: 'runner',
      }],
    });

    expect(timeline).toHaveLength(1);
    expect(timeline[0]).toMatchObject({
      title: 'Driver assigned',
      operator: 'Yc',
      driver: 'Ming',
      operatorRole: 'runner',
    });
  });

  it('keeps the driver visible when that driver is later removed', () => {
    const timeline = buildJourneyTimeline({
      driver_assignments: [
        {
          occurred_at: '2026-08-20T02:20:38.000Z',
          action: 'DRIVER_ASSIGNED',
          driver_name: 'Ming',
          assigned_by_name: 'Yc',
        },
        {
          occurred_at: '2026-08-20T03:56:36.000Z',
          action: 'DRIVER_UNASSIGNED',
          assigned_by_name: 'Yc',
        },
      ],
    });

    expect(timeline[1]).toMatchObject({ title: 'Driver removed', driver: 'Ming' });
  });

  it('keeps the order in Ready when Driver submits a result until Runner accepts it', () => {
    const timeline = buildJourneyTimeline({
      lifecycle: [{
        action: 'Order Created',
        event_type: 'Order Created',
        occurred_at: '2026-08-20T14:26:14.000Z',
        order_location: 'READY',
      }],
      driver_actions: [{
        action: 'Failed Delivery',
        result_type: 'DRIVER_FAILED_SUBMITTED',
        failure_reason: 'Other',
        submitted_at: '2026-08-21T06:37:16.000Z',
        order_location: 'ACTION_REQUIRED',
        driver_name: 'Iman',
      }],
      runner_decisions: [{
        decision: 'ACCEPTED',
        result_type: 'DRIVER_FAILED_SUBMITTED',
        decided_at: '2026-08-21T19:42:36.000Z',
        order_location: 'ACTION_REQUIRED',
        driver_name: 'Iman',
        runner_name: 'Yc',
      }],
    });

    expect(timeline.find((event) => event.kind === 'Driver action')).toMatchObject({
      tab: 'READY ORDER',
      from: null,
      to: null,
    });
    expect(timeline.find((event) => event.kind === 'Runner decision')).toMatchObject({
      tab: 'ACTION REQUIRED',
    });
  });

  it('never presents the Driver as the Runner decision operator', () => {
    const timeline = buildJourneyTimeline({
      runner_decisions: [{
        decision: 'ACCEPTED',
        result_type: 'DRIVER_FAILED_SUBMITTED',
        decided_at: '2026-08-21T19:42:36.000Z',
        driver_name: 'Iman',
      }],
    });

    expect(timeline[0]).toMatchObject({ operator: 'Runner', operatorRole: 'Runner' });
  });
});
