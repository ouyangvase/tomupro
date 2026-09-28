import { supabase } from '@/integrations/supabase/client';
import type { CurrentOrderStatus } from '@/lib/orderLifecycle';

interface TransitionOrderLifecycleParams {
  orderId: string;
  toState: CurrentOrderStatus;
  expectedState?: CurrentOrderStatus;
  reason?: string | null;
  nextDeliveryDate?: string | null;
  allowReopen?: boolean;
}

/**
 * Call the guarded database transition service with the current state as the
 * optimistic-concurrency token when the caller did not provide one.
 */
export async function transitionOrderLifecycle({
  orderId,
  toState,
  expectedState,
  reason,
  nextDeliveryDate,
  allowReopen = false,
}: TransitionOrderLifecycleParams) {
  let guardedExpectedState = expectedState;

  if (!guardedExpectedState) {
    const { data: currentOrder, error: currentError } = await supabase
      .from('orders')
      .select('current_operational_state')
      .eq('id', orderId)
      .single();

    if (currentError) throw currentError;
    guardedExpectedState = currentOrder.current_operational_state as CurrentOrderStatus;
  }

  const { data, error } = await supabase.rpc('transition_order_lifecycle', {
    p_order_id: orderId,
    p_to_state: toState,
    p_expected_state: guardedExpectedState,
    p_reason: reason ?? null,
    p_next_delivery_date: nextDeliveryDate ?? null,
    p_allow_reopen: allowReopen,
  });

  if (error) throw error;
  return data;
}
