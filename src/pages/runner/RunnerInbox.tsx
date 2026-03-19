import { useState, useMemo, useCallback } from 'react';
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
import { formatBND } from '@/lib/currency';
import type { Order } from '@/types/database';
import { Package, Truck, Loader2, DollarSign, Search, Download, Clock, CheckCircle, Eye, ChevronLeft, ChevronRight, Phone, AlertTriangle } from 'lucide-react';
import { OrderEditor } from '@/components/orders/OrderEditor';
import { OrderFiltersPanel, type OrderFilters } from '@/components/filters/OrderFiltersPanel';
import { MobileBulkActionsBar } from '@/components/mobile/MobileBulkActionsBar';
import { RunnerDeliverConfirmDialog } from '@/components/runner/RunnerDeliverConfirmDialog';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

export default function RunnerInbox() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
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
  const [deliverConfirmOpen, setDeliverConfirmOpen] = useState(false);
  const [pendingDeliverIds, setPendingDeliverIds] = useState<string[]>([]);

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
  const noDriverCount = useMemo(() => orders.filter(o => !o.driver_id).length, [orders]);

  // Can this order be marked delivered?
  const canDeliver = (order: Order) => {
    const rs = order.runner_status;
    return rs === 'ASSIGNED' || rs === 'TAKEN';
  };

  // Single deliver
  const handleSingleDeliver = (orderId: string) => {
    setPendingDeliverIds([orderId]);
    setDeliverConfirmOpen(true);
  };

  // Bulk deliver
  const deliverableSelected = useMemo(() => {
    return selectedRows.filter(id => {
      const order = orders.find(o => o.id === id);
      return order && canDeliver(order);
    });
  }, [selectedRows, orders]);

  const handleBulkDeliver = () => {
    if (deliverableSelected.length === 0) return;
    setPendingDeliverIds(deliverableSelected);
    setDeliverConfirmOpen(true);
  };

  const confirmDeliver = async () => {
    try {
      await bulkUpdateOrders.mutateAsync({
        ids: pendingDeliverIds,
        updates: {
          runner_status: 'DELIVERED',
          delivered_at: new Date().toISOString(),
        } as any,
      });
      const count = pendingDeliverIds.length;
      if (count === 1) {
        const order = orders.find(o => o.id === pendingDeliverIds[0]);
        toast({ title: `Order ${order?.order_code || ''} marked as Delivered` });
      } else {
        toast({ title: `${count} orders marked as Delivered` });
      }
      setSelectedRows(prev => prev.filter(id => !pendingDeliverIds.includes(id)));
    } catch {
      toast({ variant: 'destructive', title: 'Failed to mark as delivered', description: 'Please refresh and try again.' });
    } finally {
      setDeliverConfirmOpen(false);
      setPendingDeliverIds([]);
    }
  };

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

  const toggleSelect = (id: string) => {
    setSelectedRows(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const isAllSelected = orders.length > 0 && orders.every(o => selectedRows.includes(o.id));
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const newIds = [...new Set([...selectedRows, ...orders.map(o => o.id)])];
      setSelectedRows(newIds);
    } else {
      const pageIds = new Set(orders.map(o => o.id));
      setSelectedRows(selectedRows.filter(id => !pageIds.has(id)));
    }
  };

  return (
    <AppLayout>
      <div className="space-y-4 pb-24 md:pb-4">
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
                <Download className="h-4 w-4 mr-1" /> Export
              </Button>
              <Button variant="outline" size="sm" onClick={() => refetch()} className="rounded-full">
                Refresh
              </Button>
            </div>
          }
        />

        {/* Compact Stats */}
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Active', value: pagination.totalCount || orders.length, color: 'text-foreground' },
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

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search order ref, customer, area..."
            value={serverSearch}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 h-10 rounded-full border-border/60 bg-card"
          />
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

        {/* Desktop Bulk Actions */}
        {!isMobile && selectedRows.length > 0 && (
          <Card className="p-3 border-primary/30 bg-primary/5 rounded-xl">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-bold text-primary">
                {selectedRows.length} order{selectedRows.length !== 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                {deliverableSelected.length > 0 && (
                  <Button size="sm" onClick={handleBulkDeliver} className="rounded-full">
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Mark {deliverableSelected.length} Delivered
                  </Button>
                )}
                <Button size="sm" variant="secondary" onClick={handleBulkTake} className="rounded-full">
                  <Truck className="h-4 w-4 mr-1" /> Take Jobs
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
              <Checkbox checked={isAllSelected} onCheckedChange={handleSelectAll} className="h-4 w-4" />
              <span className="text-xs font-medium text-muted-foreground">
                {selectedRows.length > 0 ? `${selectedRows.length} selected` : `Select all (${pagination.totalCount})`}
              </span>
            </div>

            {/* Orders */}
            {orders.map(order => (
              <RunnerOrderCard
                key={order.id}
                order={order}
                isSelected={selectedRows.includes(order.id)}
                onSelect={() => toggleSelect(order.id)}
                onDeliver={() => handleSingleDeliver(order.id)}
                onView={() => handleRowClick(order)}
                isMobile={isMobile}
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
      {isMobile && selectedRows.length > 0 && (
        <MobileBulkActionsBar selectedCount={selectedRows.length} onClearSelection={() => setSelectedRows([])}>
          {deliverableSelected.length > 0 && (
            <Button size="sm" onClick={handleBulkDeliver} className="rounded-full flex-1">
              <CheckCircle className="h-4 w-4 mr-1" />
              Deliver ({deliverableSelected.length})
            </Button>
          )}
          <Button size="sm" variant="secondary" onClick={handleBulkTake} className="rounded-full flex-1">
            <Truck className="h-4 w-4 mr-1" /> Take
          </Button>
          <Button size="sm" variant="outline" onClick={handleExport} className="rounded-full">
            <Download className="h-4 w-4" />
          </Button>
        </MobileBulkActionsBar>
      )}

      {/* Dialogs */}
      <RunnerDeliverConfirmDialog
        open={deliverConfirmOpen}
        onOpenChange={setDeliverConfirmOpen}
        count={pendingDeliverIds.length}
        onConfirm={confirmDeliver}
        isLoading={bulkUpdateOrders.isPending}
      />

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
  onView: () => void;
  isMobile: boolean;
}

function RunnerOrderCard({ order, isSelected, onSelect, onDeliver, onView, isMobile }: RunnerOrderCardProps) {
  const deliverable = order.runner_status === 'ASSIGNED' || order.runner_status === 'TAKEN';

  if (isMobile) {
    return (
      <Card className={cn(
        'overflow-hidden transition-all',
        isSelected && 'ring-2 ring-primary/30 border-primary/20'
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
            <div className="ml-auto">
              <StatusBadgeInline status={order.runner_status} />
            </div>
          </div>

          {/* Row 2: Customer info */}
          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-foreground truncate">{order.customer_name || 'No name'}</p>
            {order.phone && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Phone className="h-3 w-3" /> {order.phone}
              </p>
            )}
            <p className="text-xs text-muted-foreground truncate">{order.address || 'No address'}</p>
          </div>

          {/* Row 3: Amount + Payment + Runner */}
          <div className="flex items-center gap-3 text-xs">
            <span className="font-bold tabular-nums text-foreground text-sm">{formatBND(order.total_amount)}</span>
            <Badge variant="outline" className="text-[9px] px-1.5 py-0">{order.payment_method}</Badge>
            {order.runner && (
              <span className="text-muted-foreground ml-auto truncate max-w-[100px]">{order.runner.display_name}</span>
            )}
          </div>

          {/* Row 4: Actions - full width */}
          <div className="flex gap-2 pt-1">
            {deliverable ? (
              <Button
                size="sm"
                onClick={(e) => { e.stopPropagation(); onDeliver(); }}
                className="flex-1 rounded-full h-9"
              >
                <CheckCircle className="h-4 w-4 mr-1" /> Mark Delivered
              </Button>
            ) : (
              <Badge className="bg-[hsl(210_60%_50%/0.1)] text-[hsl(210_60%_50%)] border-[hsl(210_60%_50%/0.2)] text-xs px-3 py-1.5">
                <CheckCircle className="h-3 w-3 mr-1" /> Delivered
              </Badge>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => { e.stopPropagation(); onView(); }}
              className="rounded-full h-9 px-3"
            >
              <Eye className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </Card>
    );
  }

  // Desktop row
  return (
    <Card
      className={cn(
        'cursor-pointer hover:shadow-sm hover:border-primary/15 transition-all',
        isSelected && 'ring-2 ring-primary/20 border-primary/20 bg-primary/[0.02]'
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
              <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                <Phone className="h-3 w-3" /> {order.phone}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 truncate">{order.address || 'No address'}</p>
        </div>

        {/* Amount */}
        <div className="w-[90px] shrink-0 text-right">
          <span className="text-sm font-bold tabular-nums">{formatBND(order.total_amount)}</span>
          <div className="mt-0.5 text-[10px] text-muted-foreground">{order.payment_method}</div>
        </div>

        {/* Status */}
        <div className="w-[90px] shrink-0 text-right">
          <StatusBadgeInline status={order.runner_status} />
        </div>

        {/* Date */}
        <div className="w-[60px] shrink-0 text-right hidden xl:block">
          <span className="text-xs text-muted-foreground">{format(new Date(order.created_at), 'MMM dd')}</span>
        </div>

        {/* Actions */}
        <div className="w-[160px] shrink-0 flex items-center gap-1.5 justify-end" onClick={e => e.stopPropagation()}>
          {deliverable ? (
            <Button size="sm" onClick={onDeliver} className="rounded-full h-8 text-xs px-3">
              <CheckCircle className="h-3.5 w-3.5 mr-1" /> Delivered
            </Button>
          ) : (
            <Badge className="bg-[hsl(210_60%_50%/0.1)] text-[hsl(210_60%_50%)] text-[10px] px-2 py-1">
              Delivered
            </Badge>
          )}
          <Button size="sm" variant="outline" onClick={onView} className="rounded-full h-8 px-2.5">
            <Eye className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
