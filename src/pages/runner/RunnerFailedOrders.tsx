import { useState, useMemo, useCallback, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHero } from '@/components/dashboard/PageHero';
import { DispatchStatusCards } from '@/components/orders/DispatchStatusCards';
import { DispatchBoard } from '@/components/orders/DispatchBoard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { usePaginatedOrders } from '@/hooks/usePaginatedOrders';
import { useAuth } from '@/contexts/AuthContext';
import { useValidAreas } from '@/hooks/useValidAreas';
import { useMyDrivers } from '@/hooks/useDrivers';
import type { Order } from '@/types/database';
import { XCircle, Calendar, Search } from 'lucide-react';
import capybaraEmpty from '@/assets/capybara-empty.png';
import { OrderEditor } from '@/components/orders/OrderEditor';
import { OrderFiltersPanel, type OrderFilters } from '@/components/filters/OrderFiltersPanel';

interface RunnerFailedOrdersProps {
  initialSearch?: string;
  highlightOrderId?: string | null;
}

export default function RunnerFailedOrders({ initialSearch = '', highlightOrderId = null }: RunnerFailedOrdersProps) {
  const { user } = useAuth();
  const [serverSearch, setServerSearch] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [filters, setFilters] = useState<OrderFilters>({});
  const { data: validAreas = [] } = useValidAreas();
  const { data: myDrivers = [] } = useMyDrivers();

  const areaOptions = useMemo(() => validAreas.map(a => ({ label: a, value: a })), [validAreas]);
  const driverOptions = useMemo(() => myDrivers.map(d => ({ label: d.driver?.display_name || 'Unknown', value: d.driver_id })), [myDrivers]);

  const { data: orders, isLoading, isFetching, pagination, setPage } = usePaginatedOrders({
    runnerId: user?.id,
    runnerStatusIn: ['FAILED_DELIVERY'] as any[],
    searchQuery: serverSearch || undefined,
    areaFilter: filters.area,
    driverId: filters.driverId,
    reconciliationStatus: filters.reconciliationStatus as any,
  }, 50);

  const handleSearchChange = useCallback((q: string) => setServerSearch(q), []);

  useEffect(() => {
    if (initialSearch) {
      setServerSearch(initialSearch);
    }
  }, [initialSearch]);

  const failedDeliveries = useMemo(() => orders.filter(o => o.runner_status === 'FAILED_DELIVERY'), [orders]);
  const cancelledOrders = useMemo(() => orders.filter(o => o.status === 'CANCELLED'), [orders]);
  const rescheduledOrders = useMemo(() => orders.filter(o => o.next_delivery_date), [orders]);

  const handleRowClick = (order: Order) => {
    setEditingOrder(order);
    setEditorOpen(true);
  };

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Page Hero */}
        <PageHero
          icon={<XCircle className="h-6 w-6 text-destructive" />}
          title="Failed & Cancelled Orders"
          subtitle="Orders that need attention or have been cancelled"
          image={capybaraEmpty}
          imageAlt="Failed Orders Capybara"
        />

        {/* Status Summary Cards */}
        <DispatchStatusCards
          totalReady={pagination.totalCount || orders.length}
          unassigned={failedDeliveries.length}
          assigned={cancelledOrders.length}
          codOrders={rescheduledOrders.length}
          labels={{
            total: 'Total Issues',
            unassigned: 'Failed Deliveries',
            assigned: 'Cancelled',
            fourth: 'Rescheduled',
          }}
          icons={{
            fourth: <Calendar className="h-4 w-4" />,
          }}
        />

        {/* Search */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search order code..."
              value={serverSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 h-10 rounded-full border-border/60 bg-card"
            />
          </div>
        </div>

        {/* Filters */}
        <OrderFiltersPanel
          filters={filters}
          onFiltersChange={setFilters}
          areaOptions={areaOptions}
          driverOptions={driverOptions}
          showDriverFilter
          showRunnerStatus={false}
          showDriverStatus={false}
          showOrderStatus={false}
          showReconciliationStatus
        />

        {/* Dispatch Board - visual card rows */}
        <DispatchBoard
          orders={orders}
          loading={isLoading}
          selectedRows={[]}
          onSelectionChange={() => {}}
          onRowClick={handleRowClick}
          selectable={false}
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalCount={pagination.totalCount}
          totalPages={pagination.totalPages}
          onPageChange={setPage}
          isFetching={isFetching}
          highlightOrderId={highlightOrderId}
        />
      </div>

      <OrderEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        order={editingOrder}
        mode="edit"
      />
    </AppLayout>
  );
}
