import { useState, useMemo, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { useUpdateOrder, useBulkUpdateOrders } from '@/hooks/useOrders';
import { usePaginatedOrders } from '@/hooks/usePaginatedOrders';
import { useCancelOrders } from '@/hooks/useCancelOrder';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import { Plus, Clock, Search, X, Upload, Download, ShoppingBag, ArrowRight, CalendarClock, UserX, UserCheck, Filter } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PageHero } from '@/components/dashboard/PageHero';
import { DispatchStatusCards } from '@/components/orders/DispatchStatusCards';
import { DispatchBoard } from '@/components/orders/DispatchBoard';
import capybaraDispatcher from '@/assets/capybara-dispatcher.png';
import { OrderEditor } from '@/components/orders/OrderEditor';
import { CancelOrderDialog } from '@/components/orders/CancelOrderDialog';
import { ImportOrdersDialog } from '@/components/orders/ImportOrdersDialog';
import { RescheduleOrderDialog } from '@/components/sales/RescheduleOrderDialog';
import { TeamViewToggle, useTeamViewState } from '@/components/filters/TeamViewToggle';
import { OrderFiltersPanel, OrderFilters, applyOrderFilters } from '@/components/filters/OrderFiltersPanel';
import { MobileOrderCard, MobileSelectAllCard } from '@/components/mobile/MobileOrderCard';
import { MobileBulkActionsBar } from '@/components/mobile/MobileBulkActionsBar';
import { exportOrderLines, exportSelectedOrderLines } from '@/lib/csv';
import { formatBND } from '@/lib/currency';
import { formatOrderItemsDisplay } from '@/lib/orderItemsDisplay';
import { useIsMobile } from '@/hooks/use-mobile';
import type { Order } from '@/types/database';
import { useToast } from '@/hooks/use-toast';

export default function BookingSales() {
  const { profile, role } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [rescheduleOrder, setRescheduleOrder] = useState<Order | null>(null);
  const [mobileSearch, setMobileSearch] = useState('');
  const [serverSearch, setServerSearch] = useState('');

  const { viewMode, setViewMode, selectedMember, setSelectedMember, salespersonIds, isManager } = useTeamViewState('my');

  const { data: orders, isLoading, isFetching, pagination, setPage, setPageSize } = usePaginatedOrders({
    status: 'BOOKING',
    salespersonIds: isManager ? salespersonIds : undefined,
    salespersonId: role === 'salesperson' ? profile?.id : undefined,
    searchQuery: serverSearch || undefined,
  }, 50);

  const handleSearchChange = useCallback((q: string) => setServerSearch(q), []);
  
  const updateOrder = useUpdateOrder();
  const bulkUpdateOrders = useBulkUpdateOrders();
  const cancelOrders = useCancelOrders();

  const isEditable = role === 'admin' || role === 'salesperson' || role === 'manager';

  const handleRowClick = (order: Order) => {
    if (!isEditable) return;
    setEditingOrder(order);
    setEditorOpen(true);
  };

  const handleConvertToReady = () => {
    bulkUpdateOrders.mutate({
      ids: selectedRows,
      updates: { status: 'READY' },
    });
    setSelectedRows([]);
  };

  const handleCancelConfirm = (reason: string, notes: string) => {
    cancelOrders.mutate({
      orderIds: selectedRows,
      cancelReason: reason,
      cancelNotes: notes,
    }, {
      onSuccess: () => {
        setCancelDialogOpen(false);
        setSelectedRows([]);
      }
    });
  };

  const handleDispute = () => {
    bulkUpdateOrders.mutate({
      ids: selectedRows,
      updates: { reconciliation_status: 'DISPUTE' },
    });
    setSelectedRows([]);
  };

  const handleExport = () => exportOrderLines(orders, 'booking_orders');

  const handleExportSelected = () => {
    if (selectedRows.length === 0) {
      toast({ title: 'Please select at least 1 order to export', variant: 'destructive' });
      return;
    }
    exportSelectedOrderLines(orders, selectedRows, 'booking_orders_selected');
  };

  const handleCreateNew = () => {
    setEditingOrder(null);
    setEditorOpen(true);
  };

  // Stats
  const unassignedCount = orders.filter(o => o.runner_status === 'UNASSIGNED').length;
  const assignedCount = orders.filter(o => o.runner_status !== 'UNASSIGNED').length;
  const scheduledCount = orders.filter(o => o.next_delivery_date).length;

  const toggleSelection = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedRows(prev => [...prev, id]);
    } else {
      setSelectedRows(prev => prev.filter(r => r !== id));
    }
  };

  const isAllSelected = orders.length > 0 && selectedRows.length === orders.length;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows(orders.map(o => o.id));
    } else {
      setSelectedRows([]);
    }
  };

  // Mobile view
  if (isMobile) {
    return (
      <AppLayout>
        <div className="space-y-4 pb-20">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="h-5 w-5 text-primary" />
              <div>
                <h1 className="text-xl font-bold">Booking Sales</h1>
                <p className="text-xs text-muted-foreground">{orders.length} orders</p>
              </div>
            </div>
            {isEditable && (
              <div className="flex gap-2">
                <Button size="sm" onClick={handleCreateNew}>
                  <Plus className="h-4 w-4 mr-1" />
                  New
                </Button>
                <Button size="sm" variant="outline" onClick={() => setImportDialogOpen(true)}>
                  <Upload className="h-4 w-4 mr-1" />
                  Import
                </Button>
              </div>
            )}
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
              value={mobileSearch}
              onChange={(e) => setMobileSearch(e.target.value)}
              className="pl-9 h-11"
            />
          </div>

          {isEditable && orders.length > 0 && (
            <MobileSelectAllCard
              isAllSelected={isAllSelected}
              onSelectAll={handleSelectAll}
              selectedCount={selectedRows.length}
              totalCount={orders.length}
            />
          )}

          {isLoading ? (
            <div className="flex items-center justify-center gap-3 py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-muted-foreground">Loading...</span>
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              {mobileSearch ? "No orders match your search" : "No booking orders"}
            </div>
          ) : (
            <div className="space-y-3">
              {orders.map((order) => {
                const { displayText } = formatOrderItemsDisplay(order.order_items);
                return (
                  <MobileOrderCard
                    key={order.id}
                    id={order.id}
                    orderRef={order.order_code}
                    areaBadge={order.area && <Badge variant="outline">{order.area}</Badge>}
                    statusBadge={<StatusBadge status={order.runner_status} type="runner" />}
                    primaryFields={[
                      { label: 'Customer', value: order.customer_name || '-' },
                      { label: 'Amount', value: formatBND(order.total_amount) },
                      { label: 'Imported', value: format(new Date(order.created_at), 'MMM dd, HH:mm') },
                      { label: 'Items', value: displayText },
                    ]}
                    expandedFields={[
                      { label: 'Address', value: order.address || '-', fullWidth: true },
                      { label: 'Phone', value: order.phone || '-' },
                      { label: 'Payment', value: order.payment_method },
                      { label: 'Next Delivery', value: order.next_delivery_date ? format(new Date(order.next_delivery_date), 'MMM dd') : 'Not scheduled' },
                    ]}
                    selectable={isEditable}
                    isSelected={selectedRows.includes(order.id)}
                    onSelectionChange={(checked) => toggleSelection(order.id, checked)}
                    onClick={() => handleRowClick(order)}
                    primaryAction={
                      <Button size="sm" onClick={(e) => { e.stopPropagation(); handleRowClick(order); }}>
                        View Details
                      </Button>
                    }
                  />
                );
              })}
            </div>
          )}

          {isEditable && (
            <MobileBulkActionsBar
              selectedCount={selectedRows.length}
              onClearSelection={() => setSelectedRows([])}
            >
              <Button size="sm" onClick={handleConvertToReady}>
                Convert to Ready
              </Button>
              <Button size="sm" variant="destructive" onClick={() => setCancelDialogOpen(true)}>
                Cancel
              </Button>
            </MobileBulkActionsBar>
          )}
        </div>

        <OrderEditor
          open={editorOpen}
          onOpenChange={setEditorOpen}
          order={editingOrder}
          mode={editingOrder ? 'edit' : 'create'}
        />
        <CancelOrderDialog
          open={cancelDialogOpen}
          onOpenChange={setCancelDialogOpen}
          orderCount={selectedRows.length}
          onConfirm={handleCancelConfirm}
          loading={cancelOrders.isPending}
        />
        <ImportOrdersDialog
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
        />
        <RescheduleOrderDialog
          open={rescheduleDialogOpen}
          onOpenChange={setRescheduleDialogOpen}
          order={rescheduleOrder}
        />
      </AppLayout>
    );
  }

  // Desktop view — Dispatch Board style
  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Page Hero */}
        <PageHero
          icon={<ShoppingBag className="h-6 w-6 text-primary" />}
          title="Booking Sales"
          subtitle="Pending Pickup Confirmation Board"
          image={capybaraDispatcher}
          imageAlt="Capybara dispatcher"
          actions={
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <TeamViewToggle
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                selectedMember={selectedMember}
                onMemberChange={setSelectedMember}
              />
              {isEditable && (
                <div className="flex gap-2">
                  <Button onClick={handleCreateNew}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Order
                  </Button>
                  <Button onClick={handleExport} variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Export
                  </Button>
                </div>
              )}
            </div>
          }
        />

        {/* Status Summary Cards */}
        <DispatchStatusCards
          totalReady={pagination.totalCount || orders.length}
          unassigned={unassignedCount}
          assigned={assignedCount}
          codOrders={scheduledCount}
          labels={{
            total: 'Booking Orders',
            unassigned: 'Unassigned',
            assigned: 'Assigned',
            fourth: 'Scheduled',
          }}
          icons={{
            fourth: <CalendarClock className="h-5 w-5" />,
          }}
        />

        {/* Search + Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
              value={serverSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 h-10 rounded-full border-border/60 bg-card"
            />
          </div>
          {isEditable && (
            <Button onClick={() => setImportDialogOpen(true)} variant="outline" size="sm" className="rounded-full">
              <Upload className="h-4 w-4 mr-1" />
              Import
            </Button>
          )}
        </div>

        {/* Bulk Actions */}
        {selectedRows.length > 0 && isEditable && (
          <Card className="p-3 border-primary/30 bg-primary/5 rounded-xl">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-bold text-primary">
                {selectedRows.length} order{selectedRows.length !== 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" onClick={handleConvertToReady} className="rounded-full">
                  <ArrowRight className="h-4 w-4 mr-1" />
                  Convert to Ready
                </Button>
                {selectedRows.length === 1 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-full"
                    onClick={() => {
                      const order = orders.find(o => o.id === selectedRows[0]);
                      if (order) {
                        setRescheduleOrder(order);
                        setRescheduleDialogOpen(true);
                      }
                    }}
                  >
                    <Clock className="h-3 w-3 mr-1" />
                    Reschedule
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={handleExportSelected} className="rounded-full">
                  Export
                </Button>
                {role !== 'manager' && role !== 'salesperson' && (
                  <Button size="sm" variant="outline" onClick={handleDispute} className="rounded-full">
                    Dispute
                  </Button>
                )}
                <Button size="sm" variant="destructive" onClick={() => setCancelDialogOpen(true)} className="rounded-full">
                  Cancel
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedRows([])}
                className="ml-auto text-muted-foreground"
              >
                Clear
              </Button>
            </div>
          </Card>
        )}

        {/* Dispatch Board */}
        <DispatchBoard
          orders={orders}
          loading={isLoading}
          selectedRows={selectedRows}
          onSelectionChange={setSelectedRows}
          onRowClick={handleRowClick}
          selectable={isEditable}
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
        mode={editingOrder ? 'edit' : 'create'}
      />
      <CancelOrderDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        orderCount={selectedRows.length}
        onConfirm={handleCancelConfirm}
        loading={cancelOrders.isPending}
      />
      <ImportOrdersDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
      />
      <RescheduleOrderDialog
        open={rescheduleDialogOpen}
        onOpenChange={setRescheduleDialogOpen}
        order={rescheduleOrder}
      />
    </AppLayout>
  );
}
