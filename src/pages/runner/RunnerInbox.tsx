import { useState, useMemo, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHero } from '@/components/dashboard/PageHero';
import { DispatchStatusCards } from '@/components/orders/DispatchStatusCards';
import { DispatchBoard } from '@/components/orders/DispatchBoard';
import capybaraRunner from '@/assets/capybara-runner.png';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useBulkUpdateOrders } from '@/hooks/useOrders';
import { usePaginatedOrders } from '@/hooks/usePaginatedOrders';
import { useAuth } from '@/contexts/AuthContext';
import { CreateClaimDialog } from '@/components/runner/CreateClaimDialog';
import { FailedDeliveryDialog } from '@/components/runner/FailedDeliveryDialog';
import { BulkClaimDialog } from '@/components/runner/BulkClaimDialog';
import { useSubmitBulkClaim } from '@/hooks/useClaimBatches';
import { useMyDrivers } from '@/hooks/useDrivers';
import { exportSelectedRunnerOrderLines } from '@/lib/csv';
import { useToast } from '@/hooks/use-toast';
import { useValidAreas } from '@/hooks/useValidAreas';
import type { Order } from '@/types/database';
import { Package, Truck, Loader2, DollarSign, Search, Download, Clock, Filter, X } from 'lucide-react';
import { OrderEditor } from '@/components/orders/OrderEditor';
import { OrderFiltersPanel, type OrderFilters } from '@/components/filters/OrderFiltersPanel';

export default function RunnerInbox() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: myDrivers = [] } = useMyDrivers();
  const { data: validAreas = [] } = useValidAreas();

  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [failedDialogOpen, setFailedDialogOpen] = useState(false);
  const [bulkClaimDialogOpen, setBulkClaimDialogOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [serverSearch, setServerSearch] = useState('');
  const [filters, setFilters] = useState<OrderFilters>({});
  
  const bulkUpdateOrders = useBulkUpdateOrders();
  const submitBulkClaim = useSubmitBulkClaim();

  const areaOptions = useMemo(() => validAreas.map(a => ({ label: a, value: a })), [validAreas]);
  const driverOptions = useMemo(() => myDrivers.map(d => ({ label: d.driver?.display_name || 'Unknown', value: d.driver_id })), [myDrivers]);

  const { data: orders, isLoading, isFetching, pagination, setPage, refetch } = usePaginatedOrders({
    runnerId: user?.id,
    excludeDeliveredAndFailed: true,
    searchQuery: serverSearch || undefined,
    runnerStatus: filters.runnerStatus as any,
    areaFilter: filters.area,
    driverId: filters.driverId,
    reconciliationStatus: filters.reconciliationStatus as any,
  }, 50);

  const handleSearchChange = useCallback((q: string) => setServerSearch(q), []);

  // Stats
  const assignedCount = useMemo(() => orders.filter(o => o.runner_status === 'ASSIGNED').length, [orders]);
  const takenCount = useMemo(() => orders.filter(o => o.runner_status === 'TAKEN').length, [orders]);
  const unassignedDriverCount = useMemo(() => orders.filter(o => !o.driver_id).length, [orders]);

  const canBulkClaim = useMemo(() => {
    if (selectedRows.length === 0) return false;
    return selectedRows.every(id => {
      const order = orders?.find(o => o.id === id);
      return order && order.runner_status === 'DELIVERED' && order.reconciliation_status === 'NOT_CLAIMED';
    });
  }, [selectedRows, orders]);

  const claimableOrders = useMemo(() => {
    return orders?.filter(o => 
      selectedRows.includes(o.id) && 
      o.runner_status === 'DELIVERED' && 
      o.reconciliation_status === 'NOT_CLAIMED'
    ) || [];
  }, [selectedRows, orders]);

  const handleBulkTake = () => {
    bulkUpdateOrders.mutate({ ids: selectedRows, updates: { runner_status: 'TAKEN' } });
    setSelectedRows([]);
  };

  const handleBulkClaimSubmit = async (exchangeRate: number, note?: string) => {
    await submitBulkClaim.mutateAsync({ orderIds: selectedRows, note, exchangeRate });
    setSelectedRows([]);
    setBulkClaimDialogOpen(false);
  };

  const handleExport = () => {
    if (selectedRows.length === 0) {
      toast({ variant: 'destructive', title: 'No orders selected', description: 'Please select at least 1 order to export.' });
      return;
    }
    const success = exportSelectedRunnerOrderLines(orders || [], selectedRows, 'runner_delivery_list');
    if (success) {
      toast({ title: 'Export complete', description: `Exported ${selectedRows.length} order(s)` });
    }
  };

  const handleRowClick = (order: Order) => {
    setEditingOrder(order);
    setEditorOpen(true);
  };

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Page Hero */}
        <PageHero
          icon={<Package className="h-6 w-6 text-primary" />}
          title="Runner Inbox"
          subtitle="Manage your assigned deliveries"
          image={capybaraRunner}
          imageAlt="Runner Capybara"
          actions={
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleExport} className="rounded-full">
                <Download className="h-4 w-4 mr-1" />
                Export
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="rounded-full">
                Refresh
              </Button>
            </div>
          }
        />

        {/* Status Summary Cards */}
        <DispatchStatusCards
          totalReady={pagination.totalCount || orders.length}
          unassigned={assignedCount}
          assigned={takenCount}
          codOrders={unassignedDriverCount}
          labels={{
            total: 'Active Orders',
            unassigned: 'Assigned',
            assigned: 'Taken',
            fourth: 'No Driver',
          }}
          icons={{
            fourth: <Clock className="h-4 w-4" />,
          }}
        />

        {/* Search + Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by order ref, customer, area..."
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
          showRunnerStatus
          showDriverStatus={false}
          showOrderStatus={false}
          showReconciliationStatus
        />

        {/* Bulk Actions */}
        {selectedRows.length > 0 && (
          <Card className="p-3 border-primary/30 bg-primary/5 rounded-xl">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-bold text-primary">
                {selectedRows.length} order{selectedRows.length !== 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" onClick={handleBulkTake} className="rounded-full">
                  <Truck className="h-4 w-4 mr-1" />
                  Take Jobs
                </Button>
                {canBulkClaim && (
                  <Button size="sm" variant="secondary" onClick={() => setBulkClaimDialogOpen(true)} disabled={submitBulkClaim.isPending} className="rounded-full">
                    {submitBulkClaim.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <DollarSign className="h-4 w-4 mr-1" />}
                    Claim Selected
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={handleExport} className="rounded-full">Export</Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedRows([])} className="ml-auto text-muted-foreground">Clear</Button>
            </div>
          </Card>
        )}

        {/* Dispatch Board - visual card rows */}
        <DispatchBoard
          orders={orders}
          loading={isLoading}
          selectedRows={selectedRows}
          onSelectionChange={setSelectedRows}
          onRowClick={handleRowClick}
          selectable
          page={pagination.page}
          pageSize={pagination.pageSize}
          totalCount={pagination.totalCount}
          totalPages={pagination.totalPages}
          onPageChange={setPage}
          isFetching={isFetching}
        />
      </div>

      <OrderEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        order={editingOrder}
        mode="edit"
      />

      <CreateClaimDialog
        order={selectedOrder}
        open={claimDialogOpen}
        onOpenChange={setClaimDialogOpen}
      />

      <FailedDeliveryDialog
        order={selectedOrder}
        open={failedDialogOpen}
        onOpenChange={setFailedDialogOpen}
      />

      <BulkClaimDialog
        open={bulkClaimDialogOpen}
        onOpenChange={setBulkClaimDialogOpen}
        orders={claimableOrders}
        onSubmit={handleBulkClaimSubmit}
        isSubmitting={submitBulkClaim.isPending}
      />
    </AppLayout>
  );
}
