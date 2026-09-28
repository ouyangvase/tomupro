import type { PaginatedOrderFilters } from '@/hooks/usePaginatedOrders';

export const CANCELLED_ORDER_SELECT: string = 'id,order_code,customer_name,phone,address,area,order_date,total_amount,payment_method,status,current_operational_state,cancelled_at,cancelled_by,cancel_reason,cancel_notes,created_at,updated_at,salesperson_id,runner_id,driver_id,driver_status,order_items(id,sku_label,qty,price,line_total,product_id)';

// Shared by paginated rows, explicit Select All, and export.
export function applyCancelledFilters<T extends { eq: (field: string, value: string) => T; or: (value: string) => T }>(query: T, filters: PaginatedOrderFilters): T {
  if (filters.status !== 'CANCELLED') return query;
  if (filters.cancelReason && filters.cancelReason !== 'all') query = query.eq('cancel_reason', filters.cancelReason);
  if (filters.cancelledSalespersonId && filters.cancelledSalespersonId !== 'all') query = query.eq('salesperson_id', filters.cancelledSalespersonId);
  if (filters.cancelledDateFrom && filters.cancelledDateTo) {
    const from = filters.cancelledDateFrom;
    const to = filters.cancelledDateTo;
    query = query.or(`and(cancelled_at.gte.${from},cancelled_at.lt.${to}),and(cancelled_at.is.null,updated_at.gte.${from},updated_at.lt.${to})`);
  }
  return query;
}
