import { QueryClient } from '@tanstack/react-query';

/**
 * Centralized invalidation for all order-related queries.
 *
 * Every mutation that touches the `orders` table MUST call this
 * so that paginated lists, stats cards, and dashboards all refresh.
 *
 * This is the SINGLE SOURCE OF TRUTH for query invalidation after order mutations.
 * When adding new order-related query keys, add them here — not in individual hooks.
 */
export function invalidateOrderQueries(queryClient: QueryClient) {
  // Core order lists
  queryClient.invalidateQueries({ queryKey: ['orders'] });
  queryClient.invalidateQueries({ queryKey: ['orders-paginated'] });

  // Order items
  queryClient.invalidateQueries({ queryKey: ['order-items'] });

  // Delivered orders
  queryClient.invalidateQueries({ queryKey: ['delivered-orders-fast'] });
  queryClient.invalidateQueries({ queryKey: ['delivered-summary'] });

  // Runner stats
  queryClient.invalidateQueries({ queryKey: ['runner-operational-stats'] });
  queryClient.invalidateQueries({ queryKey: ['runner-driver-orders'] });
  queryClient.invalidateQueries({ queryKey: ['driver-assignments'] });
  queryClient.invalidateQueries({ queryKey: ['runner-dispatch-driver-workloads'] });
  queryClient.invalidateQueries({ queryKey: ['driver-route-optimization'] });
  queryClient.invalidateQueries({ queryKey: ['runner-route-overview'] });
  queryClient.invalidateQueries({ queryKey: ['driver-analytics'] });
  queryClient.invalidateQueries({ queryKey: ['runner-drivers-analytics'] });
  queryClient.invalidateQueries({ queryKey: ['runner-performance'] });
  queryClient.invalidateQueries({ queryKey: ['runner-performance-day'] });

  // Admin ready order stats
  queryClient.invalidateQueries({ queryKey: ['ready-order-stats'] });

  // Dashboard & action-required stats (all role variants)
  queryClient.invalidateQueries({ queryKey: ['salesperson-dashboard'] });
  queryClient.invalidateQueries({ queryKey: ['action-required-stats'] });

  // Reschedule / expected date history
  queryClient.invalidateQueries({ queryKey: ['reschedule-history'] });
  queryClient.invalidateQueries({ queryKey: ['expected-date-history'] });

  // Claims
  queryClient.invalidateQueries({ queryKey: ['claims'] });
  queryClient.invalidateQueries({ queryKey: ['claim-batches'] });

  // Cash liabilities
  queryClient.invalidateQueries({ queryKey: ['runner-cash-liabilities'] });
  queryClient.invalidateQueries({ queryKey: ['runner-settlement-history'] });

  // Stock (deductions can change with order status)
  queryClient.invalidateQueries({ queryKey: ['stock-balance'] });
  queryClient.invalidateQueries({ queryKey: ['stock_movements'] });
  queryClient.invalidateQueries({ queryKey: ['filtered-stock-balance'] });

  // Notifications (order-related notifications)
  queryClient.invalidateQueries({ queryKey: ['notifications'] });
  queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });

  // Pickups and returns
  queryClient.invalidateQueries({ queryKey: ['driver-pickups'] });
  queryClient.invalidateQueries({ queryKey: ['runner-pickups'] });
  queryClient.invalidateQueries({ queryKey: ['runner-driver-pickup-needs'] });
  queryClient.invalidateQueries({ queryKey: ['suggested-pickup-qty'] });
  queryClient.invalidateQueries({ queryKey: ['driver-allocated-stock'] });
  queryClient.invalidateQueries({ queryKey: ['driver-returns'] });
  queryClient.invalidateQueries({ queryKey: ['runner-returns'] });

  // Inbound shipments (may depend on order state)
  queryClient.invalidateQueries({ queryKey: ['inbound_shipments'] });

  // Sidebar badges (counts shown in navigation)
  queryClient.invalidateQueries({ queryKey: ['sidebar-badge'] });

  // Team orders (manager views)
  queryClient.invalidateQueries({ queryKey: ['team-orders'] });
  queryClient.invalidateQueries({ queryKey: ['team-orders-server'] });
}
