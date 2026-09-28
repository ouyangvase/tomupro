import { supabase } from '@/integrations/supabase/client';
import type { NavigateFunction } from 'react-router-dom';
import { resolveCurrentOrderState, type CurrentOrderFields } from '@/lib/orderLifecycle';

/**
 * Determine the correct Orders tab route from the same current-state resolver
 * used to render Global Search.
 */
export function getOrderTabRoute(order: CurrentOrderFields): string {
  const state = resolveCurrentOrderState(order);
  const params = new URLSearchParams({ tab: state.destinationTab, highlight: order.id });
  return `/orders?${params.toString()}`;
}

/**
 * Look up an order by UUID and navigate to the correct page.
 * Used by notification click handlers where we only have reference_id (UUID).
 * Returns true if order was found, false otherwise.
 */
export async function navigateToOrder(
  orderId: string,
  navigate: NavigateFunction,
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('orders')
      .select('id, order_code, status, operational_status, current_operational_state, runner_status, runner_review_status, runner_final_outcome, runner_comment, runner_failed_reason_id, salesperson_action_required, salesperson_action_type, next_delivery_date, driver_next_delivery_date, driver_failed_reason, delivered_at, cancelled_at')
      .eq('id', orderId)
      .maybeSingle();

    if (error) {
      navigate(`/orders/not-found?ref=${encodeURIComponent(orderId)}`);
      return false;
    }

    if (!data) {
      navigate(`/orders/not-found?ref=${encodeURIComponent(orderId)}`);
      return false;
    }

    const route = getOrderTabRoute(data);
    navigate(route);
    return true;
  } catch (err) {
    navigate(`/orders/not-found?ref=${encodeURIComponent(orderId)}`);
    return false;
  }
}
