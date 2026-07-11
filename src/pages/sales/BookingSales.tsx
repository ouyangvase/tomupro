import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { useUpdateOrder, useBulkUpdateOrders } from '@/hooks/useOrders';
import { usePaginatedOrders, useAllOrderIds } from '@/hooks/usePaginatedOrders';
import { useCancelOrders } from '@/hooks/useCancelOrder';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { format, addDays, startOfDay, endOfDay } from 'date-fns';
import { Plus, Clock, Search, X, Upload, Download, ShoppingBag, ArrowRight, CalendarClock, UserX, UserCheck, Filter, Loader2 } from 'lucide-react';
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
import { exportOrderLines } from '@/lib/csv';
import { fetchOrdersForExport, ExportError } from '@/lib/exportFetcher';
import { formatBND } from '@/lib/currency';
import { formatOrderItemsDisplay } from '@/lib/orderItemsDisplay';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import type { Order } from '@/types/database';
import { useToast } from '@/hooks/use-toast';

export default function BookingSales({ highlightOrderId }: { highlightOrderId?: string | null }) {
  const { profile, role } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { data: userDirectory = [] } = useUserDirectory();
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [rescheduleOrder, setRescheduleOrder] = useState<Order | null>(null);
  const [mobileSearch, setMobileSearch] = useState('');
  const [serverSearch, setServerSearch] = useState('');
  const [panelFilters, setPanelFilters] = useState<OrderFilters>({});
  const [datePreset, setDatePreset] = useState<string>('all');

  // Compute date range from preset
  const dateRange = useMemo(() => {
    const today = startOfDay(new Date());
    switch (datePreset) {
      case 'today':
        return { from: format(today, 'yyyy-MM-dd'), to: format(today, 'yyyy-MM-dd') };
      case 'tomorrow': {
        const tmr = addDays(today, 1);
        return { from: format(tmr, 'yyyy-MM-dd'), to: format(tmr, 'yyyy-MM-dd') };
      }
      case 'next7': {
        return { from: format(today, 'yyyy-MM-dd'), to: format(addDays(today, 6), 'yyyy-MM-dd') };
      }
      case 'next30': {
        return { from: format(today, 'yyyy-MM-dd'), to: format(addDays(today, 29), 'yyyy-MM-dd') };
      }
      default:
        return { from: undefined, to: undefined };
    }
  }, [datePreset]);

  // Debounce mobile search → server search (300ms)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setServerSearch(mobileSearch);
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [mobileSearch]);

  const { viewMode, setViewMode, selectedMember, setSelectedMember, salespersonIds, isManager } = useTeamViewState('team');

  const orderFilters = useMemo(() => ({
    status: 'BOOKING' as const,
    salespersonIds: isManager ? salespersonIds : undefined,
    salespersonId: role === 'salesperson' ? profile?.id : undefined,
    searchQuery: serverSearch || undefined,
    nextDeliveryDateFrom: dateRange.from,
    nextDeliveryDateTo: dateRange.to,
  }), [isManager, salespersonIds, role, profile?.id, serverSearch, dateRange]);

  const { data: orders, isLoading, isFetching, pagination, setPage, setPageSize } = usePaginatedOrders(orderFilters, 50);

  // Fetch ALL matching IDs for cross-page "Select All"
  const { data: allOrderIds = [] } = useAllOrderIds(orderFilters);

  const handleSearchChange = useCallback((q: string) => {
    setMobileSearch(q);
    setServerSearch(q);
  }, []);

  const filteredOrders = useMemo(() => {
    return applyOrderFilters(orders, panelFilters);
  }, [orders, panelFilters]);

  const areaOptions = useMemo(() => {
    const uniqueAreas = [...new Set(orders.map(o => o.area).filter(Boolean))];
    return uniqueAreas.sort().map(area => ({ label: area as string, value: area as string }));
  }, [orders]);

  const salespersonOptions = useMemo(() => {
    if (role === 'manager') {
      return userDirectory
        .filter(u => u.role === 'salesperson' || u.role === 'manager')
        .map(sp => ({
          label: sp.id === profile?.id ? `${sp.display_name} (Me)` : sp.display_name,
          value: sp.id,
        }));
    }
    const salespersons = userDirectory.filter(u => u.role === 'salesperson' || u.role === 'manager');
    return salespersons.map(sp => ({ label: sp.display_name, value: sp.id }));
  }, [userDirectory, role, profile?.id]);

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
    const orderIds = [...selectedRows];
    bulkUpdateOrders.mutate(
      { ids: orderIds, updates: { status: 'READY' } },
      {
        onSuccess: () => {
          import('@/hooks/useAuditLogs').then(({ logAudit }) => {
            for (const id of orderIds) {
              logAudit({ entity_type: 'order', entity_id: id, action: 'status_changed', after_json: { status: 'READY', from_status: 'BOOKING' } });
            }
          });
        },
      }
    );
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

  const [exporting, setExporting] = useState(false);
  const [exportingMsg, setExportingMsg] = useState('');

  const handleExport = async () => {
    setExporting(true);
    setExportingMsg('Fetching all orders...');
    try {
      const allOrders = await fetchOrdersForExport(orderFilters, undefined, role, (phase, fetched, total) => {
        if (phase === 'data') setExportingMsg(`Fetching orders... ${fetched}/${total}`);
      });
      setExportingMsg('Generating CSV...');
      exportOrderLines(allOrders, 'booking_orders');
      toast({ title: `Exported ${allOrders.length} orders` });
    } catch (err) {
      const detail = err instanceof ExportError ? err.detail : (err instanceof Error ? err.message : 'Unknown error');
      toast({ title: 'Export failed', description: detail, variant: 'destructive' });
      console.error('Export error:', err);
    } finally {
      setExporting(false);
      setExportingMsg('');
    }
  };

  const handleExportSelected = async () => {
    if (selectedRows.length === 0) {
      toast({ title: 'Please select at least 1 order to export', variant: 'destructive' });
      return;
    }
    setExporting(true);
    setExportingMsg(`Exporting ${selectedRows.length} orders...`);
    try {
      const allOrders = await fetchOrdersForExport(orderFilters, selectedRows, role, (phase, fetched, total) => {
        if (phase === 'data') setExportingMsg(`Fetching orders... ${fetched}/${total}`);
      });
      setExportingMsg('Generating CSV...');
      exportOrderLines(allOrders, 'booking_orders_selected');
      toast({ title: `Exported ${allOrders.length} orders` });
    } catch (err) {
      const detail = err instanceof ExportError ? err.detail : (err instanceof Error ? err.message : 'Unknown error');
      toast({ title: 'Export failed', description: detail, variant: 'destructive' });
      console.error('Export error:', err);
    } finally {
      setExporting(false);
      setExportingMsg('');
    }
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

  const isAllSelected = allOrderIds.length > 0 && selectedRows.length === allOrderIds.length;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows(allOrderIds);
    } else {
      setSelectedRows([]);
    }
  };

  // Mobile view
  if (isMobile) {
    return (
      <AppLayout>
        <div className="space-y-3 pb-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
                <ShoppingBag className="h-4.5 w-4.5 text-primary" />
              </div>
              <div>
                <h1 className="text-lg font-bold leading-tight">Booking Sales</h1>
                <p className="text-xs text-muted-foreground">{pagination.totalCount || orders.length} orders</p>
              </div>
            </div>
            {isEditable && (
              <div className="flex gap-1.5">
                <Button size="sm" onClick={handleCreateNew} className="h-8 px-2.5 text-xs">
                  <Plus className="h-3.5 w-3.5 mr-1" />
                  New
                </Button>
                <Button size="sm" variant="outline" onClick={() => setImportDialogOpen(true)} className="h-8 px-2.5 text-xs">
                  <Upload className="h-3.5 w-3.5 mr-1" />
                  Import
                </Button>
              </div>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
              value={mobileSearch}
              onChange={(e) => setMobileSearch(e.target.value)}
              className="pl-9 h-10 text-sm"
            />
          </div>

          {/* Date Preset Buttons */}
          <div className="flex items-center gap-1 overflow-x-auto pb-1">
            {[
              { key: 'all', label: 'All' },
              { key: 'today', label: 'Today' },
              { key: 'tomorrow', label: 'Tomorrow' },
              { key: 'next7', label: '7 Days' },
              { key: 'next30', label: '30 Days' },
            ].map(({ key, label }) => (
              <Button
                key={key}
                size="sm"
                variant={datePreset === key ? 'default' : 'outline'}
                onClick={() => setDatePreset(key)}
                className="rounded-full text-xs h-7 shrink-0"
              >
                {label}
              </Button>
            ))}
          </div>

          {/* Sticky Top Bulk Action Bar — appears when orders selected */}
          {selectedRows.length > 0 && isEditable && (
            <div className="sticky top-0 z-40 -mx-4 px-4 py-2.5 bg-primary/5 border-y border-primary/20 backdrop-blur-sm">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-bold text-primary">
                  {selectedRows.length} selected
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedRows([])}
                  className="h-7 px-2 text-xs text-muted-foreground"
                >
                  <X className="h-3.5 w-3.5 mr-1" />
                  Clear
                </Button>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleConvertToReady}
                  className="h-9 flex-1 text-xs font-semibold rounded-lg"
                >
                  <ArrowRight className="h-3.5 w-3.5 mr-1" />
                  Convert to Ready
                </Button>
                {selectedRows.length === 1 && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const order = orders.find(o => o.id === selectedRows[0]);
                      if (order) { setRescheduleOrder(order); setRescheduleDialogOpen(true); }
                    }}
                    className="h-9 text-xs rounded-lg"
                  >
                    <CalendarClock className="h-3.5 w-3.5 mr-1" />
                    Reschedule
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleExportSelected}
                  disabled={exporting}
                  className="h-9 text-xs rounded-lg"
                >
                  {exporting ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Download className="h-3.5 w-3.5 mr-1" />}
                  Export
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => setCancelDialogOpen(true)}
                  className="h-9 text-xs rounded-lg"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Select All */}
          {isEditable && orders.length > 0 && (
            <MobileSelectAllCard
              isAllSelected={isAllSelected}
              onSelectAll={handleSelectAll}
              selectedCount={selectedRows.length}
              totalCount={allOrderIds.length || pagination.totalCount}
            />
          )}

          {/* Order List */}
          {isLoading ? (
            <div className="flex items-center justify-center gap-3 py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-muted-foreground text-sm">Loading...</span>
            </div>
          ) : orders.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              {serverSearch ? `No orders found for "${serverSearch}"` : "No booking orders"}
            </div>
          ) : (
            <div className="space-y-2">
              {orders.map((order) => {
                const { displayText } = formatOrderItemsDisplay(order.order_items);
                return (
                  <MobileOrderCard
                    key={order.id}
                    id={order.id}
                    orderRef={order.order_code}
                    areaBadge={order.area && <Badge variant="outline" className="text-[10px] h-5">{order.area}</Badge>}
                    statusBadge={
                      <>
                        <StatusBadge status={order.runner_status} type="runner" />
                        {order.payment_method === 'TRANSFER' && order.receipt_status === 'rejected' && (
                          <Badge variant="outline" className="text-[10px] font-semibold px-1.5 py-0 bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800">
                            Receipt Rejected
                          </Badge>
                        )}
                      </>
                    }
                    className={order.payment_method === 'TRANSFER' && order.receipt_status === 'rejected' ? 'border-red-300 dark:border-red-800/60 bg-red-50/30 dark:bg-red-950/10' : undefined}
                    primaryFields={[
                      { label: 'Customer', value: order.customer_name || '-' },
                      { label: 'Amount', value: formatBND(order.total_amount) },
                      ...(order.next_delivery_date ? [{ label: 'Ready on', value: format(new Date(order.next_delivery_date), 'MMM dd, yyyy') }] : []),
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
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={(e) => { e.stopPropagation(); handleRowClick(order); }}>
                        View Details
                      </Button>
                    }
                  />
                );
              })}
            </div>
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
                  <Button onClick={handleExport} variant="outline" disabled={exporting}>
                    {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
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

        {/* Search + Date Presets + Filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-[200px] flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
              value={mobileSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 h-10 rounded-full border-border/60 bg-card"
            />
          </div>

          {/* Date Preset Buttons */}
          <div className="flex items-center gap-1">
            {[
              { key: 'all', label: 'All' },
              { key: 'today', label: 'Today' },
              { key: 'tomorrow', label: 'Tomorrow' },
              { key: 'next7', label: 'Next 7 Days' },
              { key: 'next30', label: 'Next 30 Days' },
            ].map(({ key, label }) => (
              <Button
                key={key}
                size="sm"
                variant={datePreset === key ? 'default' : 'outline'}
                onClick={() => setDatePreset(key)}
                className="rounded-full text-xs h-8"
              >
                {label}
              </Button>
            ))}
          </div>

          <OrderFiltersPanel
            filters={panelFilters}
            onFiltersChange={setPanelFilters}
            areaOptions={areaOptions}
            salespersonOptions={salespersonOptions}
            showSalespersonFilter={role === 'admin' || role === 'manager'}
            showOrderStatus={false}
            showRunnerStatus={true}
            showReconciliationStatus={false}
          />

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
                <Button size="sm" variant="outline" onClick={handleExportSelected} disabled={exporting} className="rounded-full">
                  {exporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null}
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
          orders={filteredOrders}
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
          allSelectableIds={allOrderIds}
          highlightOrderId={highlightOrderId}
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
