import { useQuery } from '@tanstack/react-query';
import type { Order } from '@/types/database';
import { callSupabaseRpc } from '@/lib/supabaseRpc';

export type DriverAssignmentState =
  | 'ACTIVE'
  | 'PENDING_ACCEPTANCE'
  | 'DELIVERED'
  | 'FAILED'
  | 'INACTIVE';

export type DriverAssignment = Order & {
  operational_date: string;
  assignment_state: DriverAssignmentState;
  is_active_assignment: boolean;
  collect_amount: number;
  driver_name: string;
};

export type DriverAssignmentQuery = {
  runnerId?: string | null;
  driverId?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  activeOnly?: boolean;
  includeItems?: boolean;
};

type AssignmentRpcRow = {
  order_id: string;
  order_code: string | null;
  runner_id: string;
  driver_id: string;
  driver_name: string;
  operational_date: string;
  assignment_state: DriverAssignmentState;
  is_active_assignment: boolean;
  collect_amount: number | string | null;
  order_data: Record<string, unknown>;
};

export async function fetchDriverAssignments({
  runnerId,
  driverId,
  dateFrom,
  dateTo,
  activeOnly = false,
  includeItems = true,
}: DriverAssignmentQuery = {}): Promise<DriverAssignment[]> {
  const data = await callSupabaseRpc<AssignmentRpcRow[]>('get_driver_assignment_source', {
    p_runner_id: runnerId || null,
    p_driver_id: driverId || null,
    p_date_from: dateFrom || null,
    p_date_to: dateTo || null,
    p_active_only: activeOnly,
    p_include_items: includeItems,
  });

  return (data || []).map((row) => ({
    ...row.order_data,
    id: row.order_id,
    order_code: row.order_code,
    runner_id: row.runner_id,
    driver_id: row.driver_id,
    driver_name: row.driver_name,
    operational_date: row.operational_date,
    assignment_state: row.assignment_state,
    is_active_assignment: row.is_active_assignment,
    collect_amount: Number(row.collect_amount || 0),
  })) as DriverAssignment[];
}

export function useDriverAssignments(query: DriverAssignmentQuery = {}) {
  return useQuery({
    queryKey: [
      'driver-assignments',
      query.runnerId || 'any-runner',
      query.driverId || 'any-driver',
      query.dateFrom || 'any-start',
      query.dateTo || 'any-end',
      query.activeOnly || false,
      query.includeItems !== false,
    ],
    queryFn: () => fetchDriverAssignments(query),
    enabled: Boolean(query.runnerId || query.driverId),
    refetchInterval: query.activeOnly ? 10_000 : false,
    refetchIntervalInBackground: false,
  });
}

export function useActiveDriverAssignments(
  driverId?: string | null,
  includeItems = false,
) {
  return useDriverAssignments({
    driverId,
    activeOnly: true,
    includeItems,
  });
}

export function summarizeDriverAssignments(assignments: DriverAssignment[]) {
  const delivered = assignments.filter((order) => order.assignment_state === 'DELIVERED').length;
  const failed = assignments.filter((order) => order.assignment_state === 'FAILED').length;
  const inactive = assignments.filter((order) => order.assignment_state === 'INACTIVE').length;
  const pendingAcceptance = assignments.filter(
    (order) => order.assignment_state === 'PENDING_ACCEPTANCE',
  ).length;
  const assigned = assignments.filter((order) => order.assignment_state !== 'INACTIVE').length;
  const pending = Math.max(assigned - delivered - failed, 0);
  const cashCollected = assignments
    .filter((order) => order.assignment_state === 'DELIVERED')
    .reduce((sum, order) => sum + Number(order.driver_cash_amount ?? order.collect_amount ?? 0), 0);
  const acceptedAmount = assignments
    .filter((order) => order.assignment_state === 'DELIVERED')
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);
  const pendingAcceptanceAmount = assignments
    .filter((order) => order.assignment_state === 'PENDING_ACCEPTANCE')
    .reduce((sum, order) => sum + Number(order.total_amount || 0), 0);

  return {
    assigned,
    delivered,
    failed,
    inactive,
    pendingAcceptance,
    pending,
    deliveryRate: assigned > 0 ? (delivered / assigned) * 100 : 0,
    cashCollected,
    acceptedAmount,
    pendingAcceptanceAmount,
  };
}
