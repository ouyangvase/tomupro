export type DriverAssignmentAction = 'ASSIGN' | 'REASSIGN';

type DriverAssignmentSnapshot = {
  driver_id: string | null;
};

export function resolveDriverAssignmentAction(
  orders: DriverAssignmentSnapshot[],
): DriverAssignmentAction {
  return orders.some((order) => Boolean(order.driver_id)) ? 'REASSIGN' : 'ASSIGN';
}
