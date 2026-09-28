export const orderQueryKeys = {
  paginated: (filters: unknown, page: number, pageSize: number, role: string | null, userId: string | undefined) =>
    ['orders-paginated', filters, page, pageSize, role, userId] as const,
  allIds: (filters: unknown, role: string | null, userId: string | undefined) =>
    ['orders-all-ids', filters, role, userId] as const,
};
