import { useState, useMemo, useCallback, useEffect, type ReactNode } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHero } from '@/components/dashboard/PageHero';
import capybaraRunner from '@/assets/capybara-runner.png';
import capybaraEmpty from '@/assets/capybara-empty.png';
import capybaraLoading from '@/assets/capybara-loading.png';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useBulkUpdateOrders } from '@/hooks/useOrders';
import { useMarkDeliveredFast } from '@/hooks/useDeliveredOrders';
import { RunnerDeliverConfirmDialog } from '@/components/runner/RunnerDeliverConfirmDialog';
import { ReceiptConfirmDialog } from '@/components/runner/ReceiptConfirmDialog';
import { usePaginatedOrders } from '@/hooks/usePaginatedOrders';
import { useRunnerInboxStats } from '@/hooks/useRunnerInboxStats';
import { useStockBalance } from '@/hooks/useInventory';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { CreateClaimDialog } from '@/components/runner/CreateClaimDialog';
import { FailedDeliveryDialog } from '@/components/runner/FailedDeliveryDialog';
import { BulkClaimDialog } from '@/components/runner/BulkClaimDialog';
import { AssignToDriverDialog } from '@/components/runner/AssignToDriverDialog';
import { useSubmitBulkClaim } from '@/hooks/useClaimBatches';
import { useMyDrivers } from '@/hooks/useDrivers';
import { exportRunnerOrderLines } from '@/lib/csv';
import { fetchOrdersForExport, ExportError } from '@/lib/exportFetcher';
import { useToast } from '@/hooks/use-toast';
import { useValidAreas } from '@/hooks/useValidAreas';
import { formatBND } from '@/lib/currency';
import type { Order } from '@/types/database';
import { Package, Truck, Loader2, DollarSign, Search, Download, Upload, Clock, Eye, ChevronLeft, ChevronRight, Phone, AlertTriangle, Calendar, CheckCircle, UserPlus, ImageIcon } from 'lucide-react';
import { OrderEditor } from '@/components/orders/OrderEditor';
import { OrderFiltersPanel, type OrderFilters } from '@/components/filters/OrderFiltersPanel';
import { MobileBulkActionsBar } from '@/components/mobile/MobileBulkActionsBar';
import { BulkImportDeliveryDialog } from '@/components/runner/BulkImportDeliveryDialog';
import { WhatsAppPhoneLinkCompact } from '@/components/orders/WhatsAppPhoneLink';
import { format, startOfDay, subDays, startOfWeek, endOfDay } from 'date-fns';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useMyAssistantBinding } from '@/hooks/useRunnerAssistants';
import { StockStatusBadge } from '@/components/orders/StockStatusBadge';

interface RunnerInboxProps {
  initialSearch?: string;
  highlightOrderId?: string | null;
  duplicateOrdersAction?: ReactNode;
  duplicateOrdersPanel?: ReactNode;
}

export default function RunnerInbox({
  initialSearch = '',
  highlightOrderId = null,
  duplicateOrdersAction = null,
  duplicateOrdersPanel = null,
}: RunnerInboxProps) {
  const { user, profile, role } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const { data: assistantBinding, isLoading: assistantLoading } = useMyAssistantBinding();
  const isAssistant = role === 'runner_assistant' || Boolean(assistantBinding?.runner_id);
  const effectiveRunnerId = isAssistant ? assistantBinding?.runner_id : (profile?.id || user?.id);
  const { data: myDrivers = [] } = useMyDrivers(isAssistant ? effectiveRunnerId : undefined);
  const { data: validAreas = [] } = useValidAreas();
  const { data: stockBalances = [] } = useStockBalance();

  // Build a map of product_id → balance_qty for the current runner's warehouse
  const runnerStockMap = useMemo(() => {
    if (!effectiveRunnerId) return new Map<string, number>();
    const map = new Map<string, number>();
    stockBalances
      .filter(b => b.owner_user_id === effectiveRunnerId)
      .forEach(b => map.set(b.product_id, b.balance_qty));
    return map;
  }, [stockBalances, effectiveRunnerId]);

  // Runner Assistant binding

  // Permission helpers for assistant (must be defined before useMemo that references them)
  const canDeliver = !isAssistant || !!assistantBinding?.can_deliver;
  const canConfirmReceipt = !isAssistant || !!assistantBinding?.can_confirm_receipt;
  const hasNoDeliveryAccess = isAssistant && !assistantBinding?.can_deliver;
  const isReceiptOnlyAssistant = hasNoDeliveryAccess;
  const canReviewReceipts = canConfirmReceipt || isReceiptOnlyAssistant;

  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [failedDialogOpen, setFailedDialogOpen] = useState(false);
  const [bulkClaimDialogOpen, setBulkClaimDialogOpen] = useState(false);
  const [assignDriverDialogOpen, setAssignDriverDialogOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [serverSearch, setServerSearch] = useState('');
  const [filters, setFilters] = useState<OrderFilters>({});
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'yesterday' | 'this_week'>('all');

  const bulkUpdateOrders = useBulkUpdateOrders();
  const submitBulkClaim = useSubmitBulkClaim();
  const markDelivered = useMarkDeliveredFast();

  const [deliverConfirmOpen, setDeliverConfirmOpen] = useState(false);
  const [pendingDeliverId, setPendingDeliverId] = useState<string | null>(null);
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [receiptOrder, setReceiptOrder] = useState<Order | null>(null);

  const areaOptions = useMemo(() => validAreas.map(a => ({ label: a, value: a })), [validAreas]);
  const driverOptions = useMemo(() => myDrivers.map(d => ({ label: d.driver?.display_name || 'Unknown', value: d.driver_id })), [myDrivers]);

  // Compute date range from preset
  const assignedDateRange = useMemo(() => {
    const now = new Date();
    if (datePreset === 'today') {
      return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() };
    }
    if (datePreset === 'yesterday') {
      const yd = subDays(now, 1);
      return { from: startOfDay(yd).toISOString(), to: endOfDay(yd).toISOString() };
    }
    if (datePreset === 'this_week') {
      return { from: startOfWeek(now, { weekStartsOn: 1 }).toISOString(), to: endOfDay(now).toISOString() };
    }
    return { from: undefined, to: undefined };
  }, [datePreset]);

  const orderFilters = useMemo(() => ({
    runnerId: effectiveRunnerId,
    excludeDeliveredAndFailed: true as const,
    searchQuery: serverSearch || undefined,
    runnerStatus: filters.runnerStatus as any,
    areaFilter: filters.area,
    driverId: filters.driverId,
    reconciliationStatus: filters.reconciliationStatus as any,
    paymentMethod: isReceiptOnlyAssistant ? 'TRANSFER' : filters.paymentMethod,
    receiptStatus: filters.receiptStatus,
    sortField: 'runner_assigned_at',
    sortDirection: 'desc' as const,
    assignedDateFrom: assignedDateRange.from,
    assignedDateTo: assignedDateRange.to,
  }), [effectiveRunnerId, serverSearch, filters.runnerStatus, filters.area, filters.driverId, filters.reconciliationStatus, filters.paymentMethod, filters.receiptStatus, assignedDateRange.from, assignedDateRange.to, isReceiptOnlyAssistant]);

  const { data: orders, isLoading, isFetching, pagination, setPage } = usePaginatedOrders(orderFilters, 50);

  // Server-side stats for summary cards (not affected by pagination)
  const { data: inboxStats } = useRunnerInboxStats(effectiveRunnerId);

  const handleSearchChange = useCallback((q: string) => setServerSearch(q), []);

  useEffect(() => {
    if (initialSearch) {
      setServerSearch(initialSearch);
    }
  }, [initialSearch]);

  useEffect(() => {
    if (!highlightOrderId) return;
    const timeout = window.setTimeout(() => {
      const el = document.querySelector(`[data-order-id="${highlightOrderId}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [highlightOrderId, orders]);

  // Stats from server-side counts (accurate across all pages)
  const assignedCount = inboxStats?.assignedCount ?? 0;
  const takenCount = inboxStats?.takenCount ?? 0;
  const noDriverCount = inboxStats?.noDriverCount ?? 0;
  const totalActive = inboxStats?.totalActive ?? pagination.totalCount;

  // How many selected orders are NOT on the current page?
  const offPageSelectedCount = useMemo(() => {
    const onPageIds = new Set(orders.map(o => o.id));
    return selectedRows.filter(id => !onPageIds.has(id)).length;
  }, [selectedRows, orders]);

  const canBulkClaim = useMemo(() => {
    if (selectedRows.length === 0) return false;
    // Only enable claim when ALL selected orders are on current page and claimable
    // (We can't validate off-page order statuses)
    if (offPageSelectedCount > 0) return false;
    return selectedRows.every(id => {
      const order = orders?.find(o => o.id === id);
      return order && order.runner_status === 'DELIVERED' && order.reconciliation_status === 'NOT_CLAIMED';
    });
  }, [selectedRows, orders, offPageSelectedCount]);

  const selectedReceiptReviewOrder = useMemo(() => {
    if (selectedRows.length !== 1 || !canReviewReceipts || canDeliver) return null;
    const order = orders.find(o => o.id === selectedRows[0]);
    if (!order || order.payment_method !== 'TRANSFER') return null;
    if (order.receipt_status === 'confirmed' || order.receipt_status === 'rejected') return null;
    return order;
  }, [selectedRows, orders, canReviewReceipts, canDeliver]);

  const claimableOrders = useMemo(() => {
    return orders?.filter(o =>
      selectedRows.includes(o.id) &&
      o.runner_status === 'DELIVERED' &&
      o.reconciliation_status === 'NOT_CLAIMED'
    ) || [];
  }, [selectedRows, orders]);

  const handleBulkTake = () => {
    const orderIds = [...selectedRows];
    bulkUpdateOrders.mutate(
      { ids: orderIds, updates: { runner_status: 'TAKEN' } },
      {
        onSuccess: () => {
          import('@/hooks/useAuditLogs').then(({ logAudit }) => {
            for (const id of orderIds) {
              logAudit({ entity_type: 'order', entity_id: id, action: 'taken', after_json: { runner_status: 'TAKEN' } });
            }
          });
        },
      }
    );
    setSelectedRows([]);
  };

  const handleBulkClaimSubmit = async (exchangeRate: number, note?: string) => {
    await submitBulkClaim.mutateAsync({ orderIds: selectedRows, note, exchangeRate });
    setSelectedRows([]);
    setBulkClaimDialogOpen(false);
  };

  const [exporting, setExporting] = useState(false);
  const [exportingMsg, setExportingMsg] = useState('');

  const handleExport = async () => {
    if (selectedRows.length === 0) {
      toast({ variant: 'destructive', title: 'No orders selected', description: 'Please select at least 1 order to export.' });
      return;
    }
    setExporting(true);
    setExportingMsg(`Exporting ${selectedRows.length} orders...`);
    try {
      const allOrders = await fetchOrdersForExport(orderFilters, selectedRows, 'runner', (phase, fetched, total) => {
        if (phase === 'data') setExportingMsg(`Fetching orders... ${fetched}/${total}`);
      });
      setExportingMsg('Generating CSV...');
      exportRunnerOrderLines(allOrders, 'runner_delivery_list');
      toast({ title: 'Export complete', description: `Exported ${allOrders.length} order(s)` });
    } catch (err) {
      const detail = err instanceof ExportError ? err.detail : (err instanceof Error ? err.message : 'Unknown error');
      toast({ variant: 'destructive', title: 'Export failed', description: detail });
    } finally {
      setExporting(false);
      setExportingMsg('');
    }
  };

  const handleSingleDeliver = (orderId: string) => {
    // Check if this is a TRANSFER order that needs receipt confirmation first
    const order = orders.find(o => o.id === orderId);
    if (order?.payment_method === 'TRANSFER' && order.receipt_status !== 'confirmed') {
      setReceiptOrder(order);
      setReceiptDialogOpen(true);
      return;
    }
    setPendingDeliverId(orderId);
    setDeliverConfirmOpen(true);
  };

  const confirmDeliver = () => {
    if (!pendingDeliverId) return;
    markDelivered.mutate(pendingDeliverId, {
      onSettled: () => {
        setDeliverConfirmOpen(false);
        setPendingDeliverId(null);
      },
    });
  };

  const handleRowClick = (order: Order) => {
    setEditingOrder(order);
    setEditorOpen(true);
  };

  const toggleSelect = (id: string) => {
    setSelectedRows(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const isAllSelected = orders.length > 0 && selectedRows.length >= pagination.totalCount;
  const [selectAllLoading, setSelectAllLoading] = useState(false);

  const handleSelectAll = async (checked: boolean) => {
    if (checked) {
      // If only one page, just select current page
      if (pagination.totalPages <= 1) {
        setSelectedRows(orders.map(o => o.id));
        return;
      }
      // Fetch ALL order IDs matching current filters (no pagination limit)
      setSelectAllLoading(true);
      try {
        let query = supabase
          .from('orders')
          .select('id')
          .eq('runner_id', user!.id)
          .eq('status', 'READY')
          .neq('runner_status', 'DELIVERED')
          .neq('runner_status', 'FAILED_DELIVERY')
          .neq('runner_status', 'UNASSIGNED')
          .neq('status', 'CANCELLED');

        if (serverSearch?.trim()) {
          const term = `${serverSearch.trim().toUpperCase().replace(/\s+/g, '')}%`;
          query = query.ilike('order_code', term);
        }
        if (filters.runnerStatus) query = query.eq('runner_status', filters.runnerStatus);
        if (filters.area && filters.area !== 'all') query = query.eq('area', filters.area);
        if (filters.driverId && filters.driverId !== 'all') query = query.eq('driver_id', filters.driverId);
        if (filters.reconciliationStatus) query = query.eq('reconciliation_status', filters.reconciliationStatus);

        const { data: allOrders } = await query.limit(2000);
        if (allOrders) {
          setSelectedRows(allOrders.map((o: { id: string }) => o.id));
        }
      } catch {
        // Fallback to current page
        setSelectedRows(orders.map(o => o.id));
      } finally {
        setSelectAllLoading(false);
      }
    } else {
      setSelectedRows([]);
    }
  };

  // Runner Assistant: show loading or not-assigned state
  if (isAssistant && assistantLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[300px]">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  if (isAssistant && !assistantBinding) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center px-4 space-y-3">
          <Package className="h-12 w-12 text-muted-foreground/40" />
          <h2 className="text-lg font-semibold">Not Assigned</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            You are not assigned to any runner yet. Please contact your administrator to set up your runner assignment.
          </p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-4 pb-24 md:pb-4">
        {/* Page Hero */}
        <PageHero
          icon={<Package className="h-6 w-6 text-primary" />}
          title={hasNoDeliveryAccess ? "Receipt Inbox" : "Runner Inbox"}
          subtitle={hasNoDeliveryAccess ? "Confirm transfer receipts for your runner" : "Manage your assigned deliveries"}
          image={capybaraRunner}
          imageAlt="Runner Capybara"
          actions={!hasNoDeliveryAccess ? (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setBulkImportOpen(true)} className="rounded-full">
                <Upload className="h-4 w-4 mr-1" /> Import
              </Button>
              <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting} className="rounded-full">
                {exporting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />} Export
              </Button>
            </div>
          ) : undefined}
        />

        {/* Compact Stats */}
        {!hasNoDeliveryAccess && (
          <div className="grid grid-cols-4 gap-2">
            {[
              { label: 'Active', value: totalActive, color: 'text-foreground' },
              { label: 'Assigned', value: assignedCount, color: 'text-[hsl(var(--status-success))]' },
              { label: 'Taken', value: takenCount, color: 'text-primary' },
              { label: 'No Driver', value: noDriverCount, color: 'text-[hsl(var(--status-warning))]' },
            ].map(s => (
              <Card key={s.label} className="p-2.5 text-center">
                <p className={cn("text-lg font-bold tabular-nums", s.color)}>{s.value}</p>
                <p className="text-[10px] text-muted-foreground font-medium">{s.label}</p>
              </Card>
            ))}
          </div>
        )}
        {hasNoDeliveryAccess && (
          <Card className="p-3 text-center">
            <p className="text-lg font-bold tabular-nums">{pagination.totalCount}</p>
            <p className="text-[10px] text-muted-foreground font-medium">Transfer Orders</p>
          </Card>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search order code..."
            value={serverSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 h-10 rounded-full border-border/60 bg-card"
          />
        </div>

        {/* Filters */}
        {!hasNoDeliveryAccess && (
          <>
            <div className="flex flex-col gap-2 md:flex-row md:items-start">
              <div className="min-w-0 flex-1">
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
              </div>
              {duplicateOrdersAction && (
                <div className="flex shrink-0 justify-end">
                  {duplicateOrdersAction}
                </div>
              )}
            </div>
            {duplicateOrdersPanel}
          </>
        )}

        {/* Assigned date quick filters */}
        {!hasNoDeliveryAccess && (
          <div className="flex items-center gap-2 flex-wrap">
            <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground font-medium shrink-0">Assigned:</span>
            {([
              { id: 'all', label: 'All' },
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'this_week', label: 'This Week' },
            ] as const).map(p => (
              <Button
                key={p.id}
                size="sm"
                variant={datePreset === p.id ? 'default' : 'outline'}
                onClick={() => setDatePreset(p.id)}
                className={cn('rounded-full h-7 text-xs px-3', datePreset === p.id && 'shadow-sm')}
              >
                {p.label}
              </Button>
            ))}
          </div>
        )}

        {/* Desktop Bulk Actions */}
        {!isMobile && !hasNoDeliveryAccess && selectedRows.length > 0 && (
          <Card className="p-3 border-primary/30 bg-primary/5 rounded-xl">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-bold text-primary">
                {selectedRows.length} order{selectedRows.length !== 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" variant="secondary" onClick={handleBulkTake} className="rounded-full">
                  <Truck className="h-4 w-4 mr-1" /> Take {selectedRows.length} Jobs
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setAssignDriverDialogOpen(true)} className="rounded-full">
                  <UserPlus className="h-4 w-4 mr-1" /> Assign Driver
                </Button>
                {canBulkClaim && (
                  <Button size="sm" variant="secondary" onClick={() => setBulkClaimDialogOpen(true)} disabled={submitBulkClaim.isPending} className="rounded-full">
                    {submitBulkClaim.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <DollarSign className="h-4 w-4 mr-1" />}
                    Claim Selected
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting} className="rounded-full">
                  {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Export'}</Button>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedRows([])} className="ml-auto text-muted-foreground">Clear</Button>
            </div>
          </Card>
        )}

        {/* Order List */}
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <img src={capybaraLoading} alt="Loading" className="h-20 w-20 object-contain opacity-50 animate-pulse" />
            <div className="flex items-center gap-2">
              <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-sm text-muted-foreground font-medium">Loading orders...</span>
            </div>
          </div>
        ) : orders.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <img src={capybaraEmpty} alt="No orders" className="h-24 w-24 object-contain opacity-60" />
            <p className="text-base font-semibold text-foreground">No active orders</p>
            <p className="text-sm text-muted-foreground">All clear! Check back later.</p>
          </div>
        ) : (
          <div className={cn('space-y-1.5', isFetching && 'opacity-50 pointer-events-none transition-opacity')}>
            {/* Select all header */}
            <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-secondary/50 border border-border">
              <Checkbox checked={isAllSelected} onCheckedChange={handleSelectAll} disabled={selectAllLoading} className="h-4 w-4" />
              <span className="text-xs font-medium text-muted-foreground flex-1">
                {selectAllLoading ? 'Selecting all...' : selectedRows.length > 0 ? `${selectedRows.length} selected` : `Select all (${pagination.totalCount})`}
              </span>
              {selectedReceiptReviewOrder && (
                <Button
                  size="sm"
                  onClick={() => {
                    setReceiptOrder(selectedReceiptReviewOrder);
                    setReceiptDialogOpen(true);
                  }}
                  className="h-8 rounded-full px-3 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                >
                  <CheckCircle className="h-4 w-4 mr-1" /> Accept Receipt
                </Button>
              )}
            </div>

            {/* Orders */}
            {orders.map(order => (
              <RunnerOrderCard
                key={order.id}
                order={order}
                isSelected={selectedRows.includes(order.id)}
                onSelect={() => toggleSelect(order.id)}
                onDeliver={() => handleSingleDeliver(order.id)}
                onReject={() => { setSelectedOrder(order); setFailedDialogOpen(true); }}
                onView={() => handleRowClick(order)}
                onViewReceipt={() => { setReceiptOrder(order); setReceiptDialogOpen(true); }}
                isMobile={isMobile}
                canDeliver={canDeliver}
                canConfirmReceipt={canReviewReceipts}
                stockMap={runnerStockMap}
              />
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-1 pt-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              {(pagination.page - 1) * pagination.pageSize + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.totalCount)} of {pagination.totalCount}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="sm" onClick={() => setPage(pagination.page - 1)} disabled={pagination.page === 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs px-2 tabular-nums font-medium">{pagination.page}/{pagination.totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(pagination.page + 1)} disabled={pagination.page === pagination.totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Mobile Bulk Actions Bar */}
      {isMobile && !hasNoDeliveryAccess && selectedRows.length > 0 && (
        <MobileBulkActionsBar selectedCount={selectedRows.length} onClearSelection={() => setSelectedRows([])}>
          <Button size="sm" variant="secondary" onClick={handleBulkTake} className="rounded-full flex-1">
            <Truck className="h-4 w-4 mr-1" /> Take
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setAssignDriverDialogOpen(true)} className="rounded-full flex-1">
            <UserPlus className="h-4 w-4 mr-1" /> Assign Driver
          </Button>
          <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting} className="rounded-full">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          </Button>
        </MobileBulkActionsBar>
      )}

      {/* Dialogs */}
      <OrderEditor open={editorOpen} onOpenChange={setEditorOpen} order={editingOrder} mode="edit" />
      <CreateClaimDialog order={selectedOrder} open={claimDialogOpen} onOpenChange={setClaimDialogOpen} />
      <FailedDeliveryDialog order={selectedOrder} open={failedDialogOpen} onOpenChange={setFailedDialogOpen} />
      <BulkClaimDialog
        open={bulkClaimDialogOpen}
        onOpenChange={setBulkClaimDialogOpen}
        orders={claimableOrders}
        onSubmit={handleBulkClaimSubmit}
        isSubmitting={submitBulkClaim.isPending}
      />
      <BulkImportDeliveryDialog open={bulkImportOpen} onOpenChange={setBulkImportOpen} />
      <RunnerDeliverConfirmDialog
        open={deliverConfirmOpen}
        onOpenChange={setDeliverConfirmOpen}
        count={1}
        onConfirm={confirmDeliver}
        isLoading={markDelivered.isPending}
      />
      <ReceiptConfirmDialog
        open={receiptDialogOpen}
        onOpenChange={setReceiptDialogOpen}
        order={receiptOrder}
        readOnly={!canReviewReceipts}
        onConfirmed={() => {
          // After receipt is confirmed, auto-open deliver dialog only if user has delivery access
          if (receiptOrder && canDeliver) {
            setPendingDeliverId(receiptOrder.id);
            setDeliverConfirmOpen(true);
          }
          setReceiptOrder(null);
        }}
      />
      <AssignToDriverDialog
        open={assignDriverDialogOpen}
        onOpenChange={setAssignDriverDialogOpen}
        orderIds={selectedRows}
        onSuccess={() => setSelectedRows([])}
      />
    </AppLayout>
  );
}

// ─── Order Card ────────────────────────────────────────────────

function StatusBadgeInline({ status }: { status: string }) {
  const config: Record<string, { label: string; className: string }> = {
    ASSIGNED: { label: 'Assigned', className: 'bg-[hsl(var(--status-success)/0.1)] text-[hsl(var(--status-success))] border-[hsl(var(--status-success)/0.2)]' },
    TAKEN: { label: 'Taken', className: 'bg-primary/10 text-primary border-primary/20' },
    DELIVERED: { label: 'Delivered', className: 'bg-[hsl(210_60%_50%/0.1)] text-[hsl(210_60%_50%)] border-[hsl(210_60%_50%/0.2)]' },
    FAILED_DELIVERY: { label: 'Failed', className: 'bg-[hsl(var(--status-error)/0.1)] text-[hsl(var(--status-error))] border-[hsl(var(--status-error)/0.2)]' },
  };
  const c = config[status] || { label: status, className: 'bg-secondary text-secondary-foreground' };
  return (
    <Badge variant="outline" className={cn('text-[10px] font-semibold px-2 py-0 border', c.className)}>
      {c.label}
    </Badge>
  );
}

interface RunnerOrderCardProps {
  order: Order;
  isSelected: boolean;
  onSelect: () => void;
  onDeliver: () => void;
  onReject: () => void;
  onView: () => void;
  onViewReceipt?: () => void;
  isMobile: boolean;
  canDeliver: boolean;
  canConfirmReceipt: boolean;
  stockMap: Map<string, number>;
}

function RunnerOrderCard({ order, isSelected, onSelect, onDeliver, onReject, onView, onViewReceipt, isMobile, canDeliver, canConfirmReceipt, stockMap }: RunnerOrderCardProps) {
  const isReceiptBlocked = order.payment_method === 'TRANSFER' && order.receipt_status !== 'confirmed';
  const canAcceptReceipt = canConfirmReceipt && !canDeliver && order.payment_method === 'TRANSFER' && order.receipt_status !== 'confirmed' && order.receipt_status !== 'rejected';

  const isMobileRejected = order.payment_method === 'TRANSFER' && order.receipt_status === 'rejected';

  // Check out-of-stock items
  const outOfStockItems = useMemo(() => {
    if (!order.order_items || stockMap.size === 0) return [];
    return order.order_items.filter(item => {
      if (!item.product_id) return false;
      const stock = stockMap.get(item.product_id) ?? 0;
      return stock <= 0;
    });
  }, [order.order_items, stockMap]);

  const hasOutOfStock = outOfStockItems.length > 0;

  if (isMobile) {
    return (
      <Card data-order-id={order.id} className={cn(
        'overflow-hidden transition-all',
        isSelected && 'ring-2 ring-primary/30 border-primary/20',
        isMobileRejected && 'border-red-300 dark:border-red-800/60 bg-red-50/30 dark:bg-red-950/10'
      )}>
        <div className="p-3 space-y-2.5">
          {/* Row 1: Checkbox + Order Ref + Status */}
          <div className="flex items-center gap-2.5">
            <div onClick={e => e.stopPropagation()}>
              <Checkbox checked={isSelected} onCheckedChange={onSelect} className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold font-mono text-foreground">{order.order_code}</span>
            {order.area && (
              <Badge variant="outline" className="text-[9px] px-1.5 py-0">{order.area}</Badge>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              {stockMap.size > 0 && (
                <StockStatusBadge
                  status={
                    !order.order_items?.length ? 'NOT_CALCULATED'
                    : hasOutOfStock && outOfStockItems.length === order.order_items.filter(i => i.product_id).length ? 'OUT_OF_STOCK'
                    : hasOutOfStock ? 'PARTIAL_STOCK'
                    : 'STOCK_READY'
                  }
                />
              )}
              <StatusBadgeInline status={order.runner_status} />
            </div>
          </div>

          {/* Row 2: Customer info */}
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-foreground truncate">{order.customer_name || 'No name'}</p>
            {order.phone && (
              <div className="text-xs" onClick={e => e.stopPropagation()}>
                <WhatsAppPhoneLinkCompact order={order} className="text-xs" />
              </div>
            )}
            <p className="text-xs text-muted-foreground truncate">{order.address || 'No address'}</p>
          </div>

          {/* Row 3: Amount + Payment + Assigned date */}
          <div className="flex items-center gap-2 text-xs flex-wrap">
            <span className="font-bold tabular-nums text-foreground text-sm">{formatBND(order.total_amount)}</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{order.payment_method}</Badge>
            {order.payment_method === 'TRANSFER' && (
              <Badge variant="outline" className={`text-xs px-2.5 py-0.5 font-semibold ${
                order.receipt_status === 'confirmed' ? 'bg-green-500/15 text-green-700 border-green-500/30' :
                order.receipt_status === 'rejected' ? 'bg-red-500/15 text-red-700 border-red-500/30' :
                'bg-yellow-500/15 text-yellow-700 border-yellow-500/30'
              }`}>
                {order.receipt_status === 'confirmed' ? 'Receipt Confirmed' : order.receipt_status === 'rejected' ? 'Receipt Rejected' : 'Receipt Pending'}
              </Badge>
            )}
            <span className="text-muted-foreground ml-auto flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {order.runner_assigned_at
                ? format(new Date(order.runner_assigned_at), 'dd MMM HH:mm')
                : '-'}
            </span>
          </div>

          {/* Out of Stock indicator */}
          {hasOutOfStock && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800 text-[10px] px-2 py-0.5 font-semibold">
                <AlertTriangle className="h-3 w-3 mr-1" />
                Out of Stock
              </Badge>
              <span className="text-[10px] text-orange-600 dark:text-orange-400 truncate">
                {outOfStockItems.map(i => i.product?.sku_code || i.sku_label || 'Unknown').join(', ')}
              </span>
            </div>
          )}

          {/* Row 4: Actions - full width */}
          <div className="flex gap-2 pt-1 flex-wrap">
            <StatusBadgeInline status={order.runner_status} />
            {canDeliver && (order.runner_status === 'ASSIGNED' || order.runner_status === 'TAKEN') && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => { e.stopPropagation(); onDeliver(); }}
                  disabled={isReceiptBlocked}
                  className={cn("rounded-full h-9 px-3", isReceiptBlocked
                    ? "opacity-50 cursor-not-allowed"
                    : "border-primary/40 text-primary hover:bg-primary/10"
                  )}
                  title={isReceiptBlocked ? "Receipt must be confirmed before delivery" : undefined}
                >
                  <CheckCircle className="h-4 w-4 mr-1" /> Delivered
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={(e) => { e.stopPropagation(); onReject(); }}
                  className="rounded-full h-9 px-3 border-destructive/40 text-destructive hover:bg-destructive/10"
                >
                  <AlertTriangle className="h-4 w-4 mr-1" /> Reject
                </Button>
              </>
            )}
            {order.payment_method === 'TRANSFER' && order.receipt_url && !canAcceptReceipt && (
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => { e.stopPropagation(); onViewReceipt?.(); }}
                className="rounded-full h-9 px-3"
              >
                <ImageIcon className="h-4 w-4 mr-1" /> Receipt
              </Button>
            )}
            {canAcceptReceipt && (
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); onViewReceipt?.(); }}
                className="rounded-full h-10 px-4 flex-1 min-w-[160px] bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
              >
                <CheckCircle className="h-4 w-4 mr-1" /> Accept Receipt
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => { e.stopPropagation(); onView(); }}
              className="rounded-full h-9 px-3 ml-auto"
            >
              <Eye className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  // Desktop row
  const isRejectedReceipt = order.payment_method === 'TRANSFER' && order.receipt_status === 'rejected';
  return (
    <Card
      data-order-id={order.id}
      className={cn(
        'cursor-pointer hover:shadow-sm hover:border-primary/15 transition-all',
        isSelected && 'ring-2 ring-primary/20 border-primary/20 bg-primary/[0.02]',
        isRejectedReceipt && 'border-red-300 dark:border-red-800/60 bg-red-50/30 dark:bg-red-950/10'
      )}
      onClick={onView}
    >
      <div className="px-4 py-3 flex items-center gap-4">
        {/* Checkbox */}
        <div className="shrink-0" onClick={e => e.stopPropagation()}>
          <Checkbox checked={isSelected} onCheckedChange={onSelect} className="h-4 w-4" />
        </div>

        {/* Order ID + Area */}
        <div className="w-[110px] shrink-0">
          <span className="text-sm font-bold font-mono text-foreground">{order.order_code}</span>
          {order.area && (
            <div className="mt-0.5">
              <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0">{order.area}</Badge>
            </div>
          )}
        </div>

        {/* Customer */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-foreground truncate">{order.customer_name || 'No name'}</p>
            {order.phone && (
              <div className="shrink-0" onClick={e => e.stopPropagation()}>
                <WhatsAppPhoneLinkCompact order={order} className="text-xs" />
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{order.address || 'No address'}</p>
          {hasOutOfStock && (
            <div className="flex items-center gap-1.5 mt-1">
              <Badge variant="outline" className="bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-950/30 dark:text-orange-400 dark:border-orange-800 text-[10px] px-1.5 py-0 font-semibold">
                <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                Out of Stock
              </Badge>
              <span className="text-[10px] text-orange-600 dark:text-orange-400 truncate">
                {outOfStockItems.map(i => i.product?.sku_code || i.sku_label || '?').join(', ')}
              </span>
            </div>
          )}
        </div>

        {/* Amount */}
        <div className="w-[120px] shrink-0 text-right">
          <span className="text-sm font-bold tabular-nums">{formatBND(order.total_amount)}</span>
          <div className="mt-0.5 text-[10px] text-muted-foreground">{order.payment_method}</div>
          {order.payment_method === 'TRANSFER' && (
            <Badge variant="outline" className={`mt-1 text-[11px] px-2 py-0.5 font-semibold ${
              order.receipt_status === 'confirmed' ? 'bg-green-500/15 text-green-700 border-green-500/30' :
              order.receipt_status === 'rejected' ? 'bg-red-500/15 text-red-700 border-red-500/30' :
              'bg-yellow-500/15 text-yellow-700 border-yellow-500/30'
            }`}>
              {order.receipt_status === 'confirmed' ? 'Receipt OK' : order.receipt_status === 'rejected' ? 'Receipt Rejected' : 'Receipt Pending'}
            </Badge>
          )}
        </div>

        {/* Status */}
        <div className="w-[90px] shrink-0 text-right">
          <StatusBadgeInline status={order.runner_status} />
        </div>

        {/* Assigned Date */}
        <div className="w-[80px] shrink-0 text-right hidden xl:block">
          {order.runner_assigned_at ? (
            <div>
              <span className="text-xs text-muted-foreground">{format(new Date(order.runner_assigned_at), 'dd MMM')}</span>
              <div className="text-[10px] text-muted-foreground/70">{format(new Date(order.runner_assigned_at), 'HH:mm')}</div>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">-</span>
          )}
        </div>

        {/* Actions */}
        <div className="w-[280px] shrink-0 flex items-center gap-1.5 justify-end flex-wrap" onClick={e => e.stopPropagation()}>
          {canDeliver && (order.runner_status === 'ASSIGNED' || order.runner_status === 'TAKEN') && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={onDeliver}
                disabled={isReceiptBlocked}
                className={cn("rounded-full h-8 text-xs px-2.5", isReceiptBlocked
                  ? "opacity-50 cursor-not-allowed"
                  : "border-primary/40 text-primary hover:bg-primary/10"
                )}
                title={isReceiptBlocked ? "Receipt must be confirmed before delivery" : undefined}
              >
                <CheckCircle className="h-3.5 w-3.5 mr-1" /> Delivered
              </Button>
              <Button size="sm" variant="outline" onClick={onReject} className="rounded-full h-8 text-xs px-2.5 border-destructive/40 text-destructive hover:bg-destructive/10">
                <AlertTriangle className="h-3.5 w-3.5 mr-1" /> Reject
              </Button>
            </>
          )}
          {canAcceptReceipt && (
            <Button
              size="sm"
              onClick={() => onViewReceipt?.()}
              className="rounded-full h-8 px-3 text-xs bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
            >
              <CheckCircle className="h-3.5 w-3.5 mr-1" /> Accept Receipt
            </Button>
          )}
          {order.payment_method === 'TRANSFER' && order.receipt_url && !canAcceptReceipt && (
            <Button size="sm" variant="outline" onClick={() => onViewReceipt?.()} className="rounded-full h-8 px-2.5 text-xs">
              <ImageIcon className="h-3.5 w-3.5 mr-1" /> Receipt
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={onView} className="rounded-full h-8 px-2.5">
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
