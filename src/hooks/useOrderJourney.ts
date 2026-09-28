import { useQuery } from '@tanstack/react-query';
import { callSupabaseRpc } from '@/lib/supabaseRpc';

export type OrderJourney = {
  order: Record<string, unknown>;
  source_runner?: Record<string, unknown> | null;
  current_runner?: Record<string, unknown> | null;
  current_driver?: Record<string, unknown> | null;
  runner_assignments: Record<string, unknown>[];
  driver_assignments: Record<string, unknown>[];
  driver_actions: Record<string, unknown>[];
  runner_decisions: Record<string, unknown>[];
  lifecycle: Record<string, unknown>[];
  stock_movements: Record<string, unknown>[];
  payments: Record<string, unknown>;
  notifications: Record<string, unknown>;
  snapshot?: Record<string, unknown> | null;
  summary: Record<string, unknown>;
  anomalies: Record<string, unknown>[];
};

export type OrderJourneyRow = {
  order_id: string;
  order_code: string;
  journey: OrderJourney;
};

export function normalizeOrderCodes(value: string) {
  return Array.from(new Set(
    value
      .split(/[\s,]+/)
      .map((code) => code.trim().toUpperCase())
      .filter(Boolean),
  )).slice(0, 50);
}

export function useOrderJourney({
  orderCodes,
  dateFrom,
  dateTo,
  snapshotAt,
  enabled = true,
}: {
  orderCodes: string[];
  dateFrom?: string;
  dateTo?: string;
  snapshotAt?: string;
  enabled?: boolean;
}) {
  return useQuery({
    queryKey: ['order-journey', orderCodes, dateFrom || null, dateTo || null, snapshotAt || null],
    queryFn: () => callSupabaseRpc<OrderJourneyRow[]>('get_order_journey', {
      p_order_codes: orderCodes,
      p_date_from: dateFrom || null,
      p_date_to: dateTo || null,
      p_snapshot_at: snapshotAt ? new Date(snapshotAt).toISOString() : null,
    }),
    enabled: enabled && orderCodes.length > 0,
    staleTime: 15_000,
  });
}
