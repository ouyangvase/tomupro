import { useState, useMemo, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatusBadge } from '@/components/StatusBadge';
import { useUpdateOrder, useBulkUpdateOrders } from '@/hooks/useOrders';
import { usePaginatedOrders, useAllOrderIds } from '@/hooks/usePaginatedOrders';
import { useCancelOrders } from '@/hooks/useCancelOrder';
import { useBindings } from '@/hooks/useBindings';
import { useManagerRunnerBindings } from '@/hooks/useManagerRunnerBindings';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useAuth } from '@/contexts/AuthContext';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { format } from 'date-fns';
import { Plus, UserCheck, Search, X, Upload, Download, ShoppingCart, Zap, Loader2 } from 'lucide-react';
import { PageHero } from '@/components/dashboard/PageHero';
import { DispatchStatusCards } from '@/components/orders/DispatchStatusCards';
import { DispatchBoard } from '@/components/orders/DispatchBoard';
import capybaraSales from '@/assets/capybara-sales.png';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { OrderEditor } from '@/components/orders/OrderEditor';
import { CancelOrderDialog } from '@/components/orders/CancelOrderDialog';
import { ImportOrdersDialog } from '@/components/orders/ImportOrdersDialog';
import { OrderFiltersPanel, OrderFilters, applyOrderFilters } from '@/components/filters/OrderFiltersPanel';
import { TeamViewToggle, useTeamViewState } from '@/components/filters/TeamViewToggle';
import { exportOrderLines } from '@/lib/csv';
import { fetchOrdersForExport, ExportError } from '@/lib/exportFetcher';
import { useReadyOrderStats } from '@/hooks/useReadyOrderStats';
import { formatBND } from '@/lib/currency';
import { formatOrderItemsDisplay } from '@/lib/orderItemsDisplay';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileOrderCard, MobileSelectAllCard } from '@/components/mobile/MobileOrderCard';
import { cn } from '@/lib/utils';
import type { Order } from '@/types/database';

export default function ReadySales({ highlightOrderId }: { highlightOrderId?: string | null }) {
  const { profile, role } = useAuth();
  const { toast } = useToast();
  const { data: userDirectory = [] } = useUserDirectory();
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedRunner, setSelectedRunner] = useState<string>('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [panelFilters, setPanelFilters] = useState<OrderFilters>({});
  const [mobileSearch, setMobileSearch] = useState('');
  const [serverSearch, setServerSearch] = useState('');
  
  const [managerSelectedSalesperson, setManagerSelectedSalesperson] = useState<string>('');
  
  const { viewMode, setViewMode, selectedMember, setSelectedMember, salespersonIds, isManager } = useTeamViewState('team');

  const orderFilters = useMemo(() => ({
    status: 'READY' as const,
    salespersonIds: isManager ? salespersonIds : undefined,
    salespersonId: role === 'salesperson' ? profile?.id : undefined,
    searchQuery: serverSearch || undefined,
  }), [isManager, salespersonIds, role, profile?.id, serverSearch]);

  const { data: orders, isLoading, isFetching, pagination, setPage, setPageSize } = usePaginatedOrders(orderFilters, 50);

  // Fetch ALL matching IDs for cross-page "Select All"
  const { data: allOrderIds = [] } = useAllOrderIds(orderFilters);

  // Server-side stats for summary cards (avoids per-page count bug)
  const { data: readyStats } = useReadyOrderStats(
    isManager ? salespersonIds : undefined,
    role === 'salesperson' ? profile?.id : undefined
  );

  const handleSearchChange = useCallback((q: string) => setServerSearch(q), []);

  const filteredOrders = useMemo(() => {
    return applyOrderFilters(orders, panelFilters);
  }, [orders, panelFilters]);

  const areaOptions = useMemo(() => {
    const uniqueAreas = [...new Set(orders.map(o => o.area).filter(Boolean))];
    return uniqueAreas.sort().map(area => ({ label: area as string, value: area as string }));
  }, [orders]);

  const { data: teamMembers = [] } = useTeamMembers();
  const teamMemberIds = useMemo(() => teamMembers.map(m => m.id), [teamMembers]);

  const salespersonOptions = useMemo(() => {
    if (role === 'manager') {
      const teamIds = [profile?.id, ...teamMemberIds];
      return userDirectory
        .filter(u => teamIds.includes(u.id))
        .map(sp => ({
          label: sp.id === profile?.id ? `${sp.display_name} (Me)` : sp.display_name,
          value: sp.id,
        }));
    }
    const salespersons = userDirectory.filter(u => u.role === 'salesperson' || u.role === 'manager');
    return salespersons.map(sp => ({
      label: sp.display_name,
      value: sp.id,
    }));
  }, [userDirectory, role, profile?.id, teamMemberIds]);
  
  const selectedOrdersData = orders.filter((o) => selectedRows.includes(o.id));
  
  const uniqueSalespersonIds = useMemo(() => {
    return [...new Set(selectedOrdersData.map(o => o.salesperson_id))];
  }, [selectedOrdersData]);
  
  const hasMixedSalespersons = uniqueSalespersonIds.length > 1;
  const autoDetectedSalespersonId = uniqueSalespersonIds.length === 1 ? uniqueSalespersonIds[0] : undefined;
  
  const teamSalespersons = useMemo(() => {
    if (role !== 'manager' && role !== 'admin') return [];
    const spIds = [...new Set(orders.map(o => o.salesperson_id))];
    return userDirectory.filter(u => spIds.includes(u.id));
  }, [orders, userDirectory, role]);
  
  const getBindingSalespersonId = () => {
    if (role === 'salesperson') return profile?.id;
    if (managerSelectedSalesperson) return managerSelectedSalesperson;
    if (autoDetectedSalespersonId) return autoDetectedSalespersonId;
    return undefined;
  };
  
  const bindingSalespersonId = getBindingSalespersonId();

  const bindingOwner = useMemo(() => {
    if (!bindingSalespersonId) return undefined;
    return userDirectory.find(u => u.id === bindingSalespersonId);
  }, [bindingSalespersonId, userDirectory]);

  const bindingOwnerIsManager = bindingOwner?.role === 'manager';

  const { data: bindings = [], isLoading: bindingsLoading } = useBindings(
    bindingSalespersonId && !bindingOwnerIsManager
      ? { salespersonId: bindingSalespersonId, active: true }
      : undefined
  );

  const { data: managerRunnerBindings = [], isLoading: managerRunnerBindingsLoading } = useManagerRunnerBindings(
    bindingSalespersonId && bindingOwnerIsManager
      ? { managerId: bindingSalespersonId }
      : undefined
  );

  const runnerOptions = useMemo(() => {
    const source = bindingOwnerIsManager ? managerRunnerBindings : bindings;
    return source.map((b: any) => ({
      id: b.runner_id as string,
      label: b.runner?.display_name || b.runner?.email || 'Unknown Runner',
    }));
  }, [bindingOwnerIsManager, managerRunnerBindings, bindings]);

  const runnersLoading = bindingOwnerIsManager ? managerRunnerBindingsLoading : bindingsLoading;

  const updateOrder = useUpdateOrder();
  const bulkUpdateOrders = useBulkUpdateOrders();
  const cancelOrders = useCancelOrders();

  const isEditable = role === 'admin' || role === 'salesperson' || role === 'manager';

  const handleRowClick = (order: Order) => {
    if (!isEditable) return;
    setEditingOrder(order);
    setEditorOpen(true);
  };

  const handleAssignRunner = () => {
    if (!selectedRunner || selectedRows.length === 0) return;
    bulkUpdateOrders.mutate({
      ids: selectedRows,
      updates: { runner_id: selectedRunner, runner_status: 'ASSIGNED' },
    });
    setAssignDialogOpen(false);
    setSelectedRunner('');
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
      exportOrderLines(allOrders, 'ready_orders');
      toast({ title: `Exported ${allOrders.length} order(s)` });
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
      exportOrderLines(allOrders, 'ready_orders_selected');
      toast({ title: `Exported ${allOrders.length} order(s)` });
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

  // Stats — use server-side counts, fall back to per-page counts
  const unassignedCount = readyStats?.unassignedCount ?? orders.filter(o => o.runner_status === 'UNASSIGNED').length;
  const assignedCount = readyStats?.assignedCount ?? orders.filter(o => o.runner_status !== 'UNASSIGNED').length;
  const codCount = readyStats?.codCount ?? orders.filter(o => o.payment_method === 'COD').length;

  const isMobile = useIsMobile();

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

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Page Hero - Dispatch Board Header */}
        <PageHero
          icon={<ShoppingCart className="h-6 w-6 text-primary" />}
          title="Ready Orders"
          subtitle="Operations Dispatch Board"
          image={capybaraSales}
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
                  <Button onClick={handleCreateNew} size={isMobile ? "sm" : "default"}>
                    <Plus className="h-4 w-4 mr-2" />
                    {isMobile ? 'New' : 'New Order'}
                  </Button>
                  <Button onClick={handleExport} variant="outline" size={isMobile ? "sm" : "default"} disabled={exporting}>
                    {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                    {isMobile ? '' : 'Export'}
                  </Button>
                </div>
              )}
            </div>
          }
        />

        {/* Status Summary Cards */}
        <DispatchStatusCards
          totalReady={readyStats?.totalReady ?? pagination.totalCount ?? orders.length}
          unassigned={unassignedCount}
          assigned={assignedCount}
          codOrders={codCount}
        />

        {/* Smart Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative min-w-[200px] flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
              value={serverSearch}
              onChange={(e) => handleSearchChange(e.target.value)}
              className="pl-9 h-10 rounded-full border-border/60 bg-card"
            />
          </div>

          <OrderFiltersPanel
            filters={panelFilters}
            onFiltersChange={setPanelFilters}
            areaOptions={areaOptions}
            salespersonOptions={salespersonOptions}
            showSalespersonFilter={role === 'admin' || role === 'manager'}
            showOrderStatus={false}
            showRunnerStatus={true}
            showReconciliationStatus={true}
          />

          {isEditable && (
            <Button onClick={() => setImportDialogOpen(true)} variant="outline" size="sm" className="rounded-full">
              <Upload className="h-4 w-4 mr-1" />
              Import
            </Button>
          )}
        </div>

        {/* Bulk Actions Bar */}
        {selectedRows.length > 0 && isEditable && (
          <Card className="p-3 border-primary/30 bg-primary/5 rounded-xl">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-bold text-primary">
                {selectedRows.length} order{selectedRows.length !== 1 ? 's' : ''} selected
              </span>
              <div className="flex items-center gap-2 flex-wrap">
                <Button size="sm" onClick={() => setAssignDialogOpen(true)} className="rounded-full">
                  <UserCheck className="h-4 w-4 mr-1" />
                  Assign Runner
                </Button>
                <Button size="sm" variant="outline" onClick={handleExportSelected} className="rounded-full" disabled={exporting}>
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

        {/* Orders Board */}
        {isMobile ? (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search order, customer, phone, area..."
                value={mobileSearch}
                onChange={(e) => setMobileSearch(e.target.value)}
                className="pl-9 pr-9"
              />
              {mobileSearch && (
                <button
                  onClick={() => setMobileSearch('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {isEditable && filteredOrders.length > 0 && (
              <MobileSelectAllCard
                isAllSelected={isAllSelected}
                onSelectAll={handleSelectAll}
                selectedCount={selectedRows.length}
                totalCount={allOrderIds.length || pagination.totalCount}
              />
            )}

            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No ready orders</div>
            ) : (
              filteredOrders.map((order) => {
                const { displayText } = formatOrderItemsDisplay(order.order_items);
                return (
                  <MobileOrderCard
                    key={order.id}
                    id={order.id}
                    orderRef={order.order_code}
                    areaBadge={order.area ? <Badge variant="outline" className="text-xs">{order.area}</Badge> : undefined}
                    statusBadge={<StatusBadge status={order.runner_status} type="runner" />}
                    selectable={isEditable}
                    isSelected={selectedRows.includes(order.id)}
                    onSelectionChange={(checked) => toggleSelection(order.id, checked)}
                    onClick={() => handleRowClick(order)}
                    primaryFields={[
                      { label: 'Imported', value: format(new Date(order.created_at), 'MMM dd, HH:mm') },
                      { label: 'Items', value: displayText },
                      { label: 'Amount', value: formatBND(order.total_amount) },
                      { label: 'Runner', value: order.runner?.display_name || 'Unassigned' },
                    ]}
                    expandedFields={[
                      { label: 'Customer', value: order.customer_name },
                      { label: 'Phone', value: order.phone },
                      { label: 'Payment', value: order.payment_method },
                      { label: 'Reconciliation', value: <StatusBadge status={order.reconciliation_status} type="reconciliation" /> },
                      { label: 'Address', value: order.address || '-', fullWidth: true },
                      ...(order.runner_comment ? [{ label: 'Runner Note', value: order.runner_comment, fullWidth: true }] : []),
                      ...(order.next_delivery_date ? [{ label: 'Next Delivery', value: format(new Date(order.next_delivery_date), 'dd MMM yyyy') }] : []),
                    ]}
                  />
                );
              })
            )}
          </div>
        ) : (
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
        )}
      </div>

      <OrderEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        order={editingOrder}
        mode={editingOrder ? 'edit' : 'create'}
        defaultStatus="READY"
      />

      <ImportOrdersDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        defaultStatus="READY"
      />

      <CancelOrderDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        orderCount={selectedRows.length}
        onConfirm={handleCancelConfirm}
        loading={cancelOrders.isPending}
      />

      {/* Assign Runner Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={(open) => {
        setAssignDialogOpen(open);
        if (!open) {
          setManagerSelectedSalesperson('');
          setSelectedRunner('');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Runner</DialogTitle>
            <DialogDescription>
              Select a runner to assign to {selectedRows.length} order{selectedRows.length !== 1 ? 's' : ''}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            {(role === 'manager' || role === 'admin') && hasMixedSalespersons && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-destructive">
                  Selected orders belong to different salespersons. Please select a salesperson to filter runners:
                </label>
                <Select value={managerSelectedSalesperson} onValueChange={(value) => {
                  setManagerSelectedSalesperson(value);
                  setSelectedRunner('');
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select salesperson..." />
                  </SelectTrigger>
                  <SelectContent>
                    {teamSalespersons.map((sp) => (
                      <SelectItem key={sp.id} value={sp.id}>
                        {sp.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            
            {(role === 'manager' || role === 'admin') && !hasMixedSalespersons && autoDetectedSalespersonId && (
              <div className="text-sm text-muted-foreground">
                Showing runners bound to: <span className="font-medium text-foreground">
                  {userDirectory.find(u => u.id === autoDetectedSalespersonId)?.display_name || 'Unknown'}
                </span>
              </div>
            )}
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Runner</label>
              <Select value={selectedRunner} onValueChange={setSelectedRunner}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a runner..." />
                </SelectTrigger>
                <SelectContent>
                {runnersLoading ? (
                  <div className="p-2 text-sm text-muted-foreground">Loading runners...</div>
                ) : !bindingSalespersonId ? (
                  <div className="p-2 text-sm text-muted-foreground">
                    {hasMixedSalespersons
                      ? 'Select a salesperson first to see available runners.'
                      : 'Select orders first to see available runners.'}
                  </div>
                ) : runnerOptions.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground">
                    {role === 'salesperson'
                      ? 'No runners bound to your account. Contact admin to set up bindings.'
                      : bindingOwnerIsManager
                        ? 'No runners bound to this manager. Set up bindings in Settings > Bindings > My Runners.'
                        : 'No runners bound to this salesperson. Set up bindings in Settings > Bindings.'}
                  </div>
                ) : (
                  runnerOptions.map((opt) => (
                    <SelectItem key={opt.id} value={opt.id}>
                      {opt.label}
                    </SelectItem>
                  ))
                )}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAssignRunner} 
              disabled={!selectedRunner || bulkUpdateOrders.isPending}
            >
              {bulkUpdateOrders.isPending ? 'Assigning...' : 'Assign Runner'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
