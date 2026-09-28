import { describe, expect, it } from 'vitest';
import { resolveCurrentOrderState } from './orderLifecycle';

const baseOrder = {
  id: 'order-1',
  status: 'BOOKING',
  operational_status: 'NEW',
  runner_status: 'UNASSIGNED',
  runner_review_status: null,
  runner_final_outcome: null,
  runner_comment: null,
  runner_failed_reason_id: null,
  salesperson_action_required: false,
  salesperson_action_type: null,
  next_delivery_date: null,
  driver_next_delivery_date: null,
  driver_failed_reason: null,
  delivered_at: null,
  cancelled_at: null,
};

describe('resolveCurrentOrderState', () => {
  it('uses the latest current READY row instead of a historical RESCHEDULE outcome', () => {
    expect(resolveCurrentOrderState({
      ...baseOrder,
      status: 'READY',
      runner_final_outcome: 'RESCHEDULE',
      runner_review_status: 'REVIEWED',
      salesperson_action_required: false,
    })).toMatchObject({
      currentStatus: 'READY',
      destinationTab: 'ready',
      currentSubStatus: null,
    });
  });

  it('resolves an unresolved reschedule to Action Required with its date', () => {
    expect(resolveCurrentOrderState({
      ...baseOrder,
      status: 'READY',
      runner_final_outcome: 'RESCHEDULE',
      salesperson_action_required: true,
      next_delivery_date: '2026-08-15',
    })).toMatchObject({
      currentStatus: 'ACTION_REQUIRED',
      destinationTab: 'action-required',
      currentSubStatus: 'Rescheduled',
      scheduledDate: '2026-08-15',
    });
  });

  it('moves a resolved future booking out of Action Required', () => {
    expect(resolveCurrentOrderState({
      ...baseOrder,
      status: 'BOOKING',
      runner_final_outcome: 'RESCHEDULE',
      salesperson_action_required: false,
      next_delivery_date: '2026-08-15',
    })).toMatchObject({
      currentStatus: 'BOOKING',
      destinationTab: 'booking',
      currentSubStatus: 'Ready on',
      scheduledDate: '2026-08-15',
    });
  });

  it('keeps final Delivered and Cancelled states above old delivery fields', () => {
    expect(resolveCurrentOrderState({
      ...baseOrder,
      status: 'READY',
      runner_status: 'DELIVERED',
      operational_status: 'DELIVERED_FINAL',
    }).currentStatus).toBe('DELIVERED');

    expect(resolveCurrentOrderState({
      ...baseOrder,
      status: 'CANCELLED',
      runner_status: 'FAILED_DELIVERY',
    }).currentStatus).toBe('CANCELLED');

    expect(resolveCurrentOrderState({
      ...baseOrder,
      status: 'READY',
      runner_status: 'ASSIGNED',
      delivered_at: '2026-08-01T00:00:00Z',
      cancelled_at: '2026-08-01T00:00:00Z',
    }).currentStatus).toBe('READY');
  });

  it('resolves a current READY failed delivery to Action Required', () => {
    expect(resolveCurrentOrderState({
      ...baseOrder,
      status: 'READY',
      runner_status: 'FAILED_DELIVERY',
    }).destinationTab).toBe('action-required');
  });
});
