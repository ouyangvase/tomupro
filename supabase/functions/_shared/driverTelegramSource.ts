export type DriverTelegramEventType = 'driver_delivered' | 'driver_failed';

export type DriverAttemptResultType =
  | 'DRIVER_DELIVERED_SUBMITTED'
  | 'DRIVER_FAILED_SUBMITTED'
  | 'DRIVER_DELIVERY_TOMORROW_SUBMITTED'
  | 'DRIVER_RESCHEDULE_SUBMITTED';

export interface DriverTelegramQueueSource {
  event_type: string;
  order_id: string;
  delivery_attempt_id: string | null;
  active_assignment_id: string | null;
  driver_id: string | null;
  event_source: string | null;
  source_function: string | null;
  submitted_at: string | null;
  created_at: string;
}

export interface DriverDeliveryAttemptSource {
  id: string;
  order_id: string;
  active_assignment_id: string;
  driver_id: string;
  result_type: DriverAttemptResultType;
  failure_reason: string | null;
  remark: string | null;
  reschedule_date: string | null;
  submitted_at: string;
  superseded_at: string | null;
  proof_images?: unknown;
}

export function validateDriverTelegramSource(
  event: DriverTelegramQueueSource,
  attempt: DriverDeliveryAttemptSource | null | undefined,
): { valid: true } | { valid: false; reason: string } {
  if (!event.delivery_attempt_id) {
    return { valid: false, reason: 'SKIPPED_INVALID_SOURCE_MISSING_DELIVERY_ATTEMPT' };
  }

  if (!attempt) {
    return { valid: false, reason: 'SKIPPED_INVALID_SOURCE_ATTEMPT_NOT_FOUND' };
  }

  if (event.event_source !== 'DRIVER_APP') {
    return { valid: false, reason: 'SKIPPED_INVALID_SOURCE_NOT_DRIVER_APP' };
  }

  if (event.source_function !== 'public.submit_driver_delivery_result') {
    return { valid: false, reason: 'SKIPPED_INVALID_SOURCE_WRONG_FUNCTION' };
  }

  if (event.delivery_attempt_id !== attempt.id
    || event.order_id !== attempt.order_id
    || event.active_assignment_id !== attempt.active_assignment_id
    || event.driver_id !== attempt.driver_id
  ) {
    return { valid: false, reason: 'SKIPPED_INVALID_SOURCE_IDENTITY_MISMATCH' };
  }

  if (attempt.superseded_at) {
    return { valid: false, reason: 'SKIPPED_INVALID_SOURCE_ATTEMPT_SUPERSEDED' };
  }

  const attemptTime = Date.parse(attempt.submitted_at);
  const eventTime = Date.parse(event.submitted_at || event.created_at);
  if (!Number.isFinite(attemptTime) || !Number.isFinite(eventTime)
    || Math.abs(eventTime - attemptTime) > 5 * 60 * 1000
  ) {
    return { valid: false, reason: 'SKIPPED_INVALID_SOURCE_TIME_MISMATCH' };
  }

  const validResult = event.event_type === 'driver_delivered'
    ? attempt.result_type === 'DRIVER_DELIVERED_SUBMITTED'
    : event.event_type === 'driver_failed'
      ? attempt.result_type !== 'DRIVER_DELIVERED_SUBMITTED'
      : false;

  if (!validResult) {
    return { valid: false, reason: 'SKIPPED_INVALID_SOURCE_RESULT_MISMATCH' };
  }

  return { valid: true };
}
