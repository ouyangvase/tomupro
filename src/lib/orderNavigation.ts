import { supabase } from '@/integrations/supabase/client';
import type { NavigateFunction } from 'react-router-dom';

/**
 * Determine the correct Orders tab route based on order status.
 * Shared by GlobalSearchBar, NotificationCenter, and NotificationBell.
 */
export function getOrderTabRoute(
  status: string,
  runnerStatus: string | null,
  orderId: string,
): string {
  if (runnerStatus === 'DELIVERED') return `/orders?tab=delivered&highlight=${orderId}`;
  if (runnerStatus === 'FAILED_DELIVERY') return `/orders?tab=action-required&highlight=${orderId}`;
  if (status === 'BOOKING') return `/orders?tab=booking&highlight=${orderId}`;
  if (status === 'CANCELLED') return `/orders?tab=cancelled&highlight=${orderId}`;
  if (status === 'READY') return `/orders?tab=ready&highlight=${orderId}`;
  return `/orders?tab=booking&highlight=${orderId}`;
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
      .select('id, order_code, status, runner_status')
      .eq('id', orderId)
      .maybeSingle();

    if (error) {
      console.error('[navigateToOrder] lookup error:', error.message);
      navigate(`/orders/not-found?ref=${encodeURIComponent(orderId)}`);
      return false;
    }

    if (!data) {
      navigate(`/orders/not-found?ref=${encodeURIComponent(orderId)}`);
      return false;
    }

    const route = getOrderTabRoute(data.status, data.runner_status, data.id);
    navigate(route);
    return true;
  } catch (err) {
    console.error('[navigateToOrder] unexpected error:', err);
    navigate(`/orders/not-found?ref=${encodeURIComponent(orderId)}`);
    return false;
  }
}
