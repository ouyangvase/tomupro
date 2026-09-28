import { describe, expect, it } from 'vitest';
import { validateDriverTelegramSource } from '../../supabase/functions/_shared/driverTelegramSource';

const attempt = {
  id: 'attempt-1',
  order_id: 'order-1',
  active_assignment_id: 'assignment-1',
  driver_id: 'driver-1',
  result_type: 'DRIVER_FAILED_SUBMITTED' as const,
  submitted_at: '2026-08-11T08:00:00.000Z',
  superseded_at: null,
};

const event = {
  event_type: 'driver_failed',
  order_id: 'order-1',
  delivery_attempt_id: 'attempt-1',
  active_assignment_id: 'assignment-1',
  driver_id: 'driver-1',
  event_source: 'DRIVER_APP',
  source_function: 'public.submit_driver_delivery_result',
  submitted_at: '2026-08-11T08:00:01.000Z',
  created_at: '2026-08-11T08:00:01.000Z',
};

describe('Driver Telegram provenance', () => {
  it('accepts only a matching Driver App attempt', () => {
    expect(validateDriverTelegramSource(event, attempt)).toEqual({ valid: true });
  });

  it('rejects an order update without an immutable attempt', () => {
    expect(validateDriverTelegramSource({ ...event, delivery_attempt_id: null }, null)).toEqual({
      valid: false,
      reason: 'SKIPPED_INVALID_SOURCE_MISSING_DELIVERY_ATTEMPT',
    });
  });

  it('rejects Runner/system provenance', () => {
    expect(validateDriverTelegramSource({ ...event, event_source: 'RUNNER_REVIEW' }, attempt)).toEqual({
      valid: false,
      reason: 'SKIPPED_INVALID_SOURCE_NOT_DRIVER_APP',
    });
  });

  it('rejects a final/superseded attempt', () => {
    expect(validateDriverTelegramSource({ ...event }, {
      ...attempt,
      superseded_at: '2026-08-11T08:05:00.000Z',
    })).toEqual({
      valid: false,
      reason: 'SKIPPED_INVALID_SOURCE_ATTEMPT_SUPERSEDED',
    });
  });
});
