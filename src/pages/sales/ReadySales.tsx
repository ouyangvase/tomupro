import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { StatusBadge } from '@/components/StatusBadge';
import { useUpdateOrder, useBulkUpdateOrders } from '@/hooks/useOrders';
import { useTeamOrders } from '@/hooks/useTeamOrders';
import { useCancelOrders } from '@/hooks/useCancelOrder';
import { useBindings } from '@/hooks/useBindings';
import { useManagerRunnerBindings } from '@/hooks/useManagerRunnerBindings';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useAuth } from '@/contexts/AuthContext';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Truck, UserCheck, Lock, Plus, AlertTriangle, ChevronDown, ChevronUp, Send, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { OrderEditor } from '@/components/orders/OrderEditor';
import { CancelOrderDialog } from '@/components/orders/CancelOrderDialog';
import { ImportOrdersDialog } from '@/components/orders/ImportOrdersDialog';
import { FailedDeliveryInfo } from '@/components/orders/FailedDeliveryInfo';
import { OrderFiltersPanel, OrderFilters, applyOrderFilters } from '@/components/filters/OrderFiltersPanel';
import { TeamViewToggle, useTeamViewState } from '@/components/filters/TeamViewToggle';
import { exportOrderLines, exportSelectedOrderLines } from '@/lib/csv';
import { formatBND } from '@/lib/currency';
import { formatOrderItemsDisplay } from '@/lib/orderItemsDisplay';
import { useToast } from '@/hooks/use-toast';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileOrderCard, MobileSelectAllCard } from '@/components/mobile/MobileOrderCard';
import { cn } from '@/lib/utils';
import type { Order } from '@/types/database';

export default function ReadySales() {
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
  
  // For manager assign dialog: manually selected salesperson
  const [managerSelectedSalesperson, setManagerSelectedSalesperson] = useState<string>('');
  
  // Team view state for managers
  const { viewMode, setViewMode, selectedMember, setSelectedMember, salespersonIds, isManager } = useTeamViewState('my');

  // Use team-aware orders hook
  const { data: orders = [], isLoading } = useTeamOrders({ 
    status: 'READY',
    salespersonIds: isManager ? salespersonIds : undefined,
    salespersonId: role === 'salesperson' ? profile?.id : undefined,
  });

  // Apply panel filters and mobile search to orders
  const filteredOrders = useMemo(() => {
    let result = applyOrderFilters(orders, panelFilters);
    
    // Apply mobile search filter
    if (mobileSearch.trim()) {
      const searchLower = mobileSearch.toLowerCase().trim();
      result = result.filter(order => 
        order.order_code?.toLowerCase().includes(searchLower) ||
        order.customer_name?.toLowerCase().includes(searchLower) ||
        order.phone?.toLowerCase().includes(searchLower) ||
        order.address?.toLowerCase().includes(searchLower) ||
        order.area?.toLowerCase().includes(searchLower) ||
        order.runner?.display_name?.toLowerCase().includes(searchLower)
      );
    }
    
    return result;
  }, [orders, panelFilters, mobileSearch]);

  // Extract unique areas for filter dropdown
  const areaOptions = useMemo(() => {
    const uniqueAreas = [...new Set(orders.map(o => o.area).filter(Boolean))];
    return uniqueAreas.sort().map(area => ({ label: area as string, value: area as string }));
  }, [orders]);

  // Team member IDs for manager visibility
  const { data: teamMembers = [] } = useTeamMembers();
  const teamMemberIds = useMemo(() => teamMembers.map(m => m.id), [teamMembers]);

  // Salesperson filter options - TEAM SCOPED for managers
  const salespersonOptions = useMemo(() => {
    if (role === 'manager') {
      // Manager: only show self + team members
      const teamIds = [profile?.id, ...teamMemberIds];
      return userDirectory
        .filter(u => teamIds.includes(u.id))
        .map(sp => ({
          label: sp.id === profile?.id ? `${sp.display_name} (Me)` : sp.display_name,
          value: sp.id,
        }));
    }
    // Admin sees all salespersons/managers
    const salespersons = userDirectory.filter(u => u.role === 'salesperson' || u.role === 'manager');
    return salespersons.map(sp => ({
      label: sp.display_name,
      value: sp.id,
    }));
  }, [userDirectory, role, profile?.id, teamMemberIds]);
  
  // Determine which salesperson to use for bindings lookup
  const selectedOrdersData = orders.filter((o) => selectedRows.includes(o.id));
  
  // Check if all selected orders belong to the same salesperson
  const uniqueSalespersonIds = useMemo(() => {
    return [...new Set(selectedOrdersData.map(o => o.salesperson_id))];
  }, [selectedOrdersData]);
  
  const hasMixedSalespersons = uniqueSalespersonIds.length > 1;
  const autoDetectedSalespersonId = uniqueSalespersonIds.length === 1 ? uniqueSalespersonIds[0] : undefined;
  
  // Get team salespersons for manager's dropdown
  const teamSalespersons = useMemo(() => {
    if (role !== 'manager' && role !== 'admin') return [];
    // Get unique salespersons from current orders
    const spIds = [...new Set(orders.map(o => o.salesperson_id))];
    return userDirectory.filter(u => spIds.includes(u.id));
  }, [orders, userDirectory, role]);
  
  // Get the salesperson ID for binding lookup
  const getBindingSalespersonId = () => {
    if (role === 'salesperson') {
      return profile?.id;
    }
    // For admin/manager with dialog open and manual selection
    if (managerSelectedSalesperson) {
      return managerSelectedSalesperson;
    }
    // Auto-detect if all selected orders are from same salesperson
    if (autoDetectedSalespersonId) {
      return autoDetectedSalespersonId;
    }
    return undefined;
  };
  
  const bindingSalespersonId = getBindingSalespersonId();

  const bindingOwner = useMemo(() => {
    if (!bindingSalespersonId) return undefined;
    return userDirectory.find(u => u.id === bindingSalespersonId);
  }, [bindingSalespersonId, userDirectory]);

  const bindingOwnerIsManager = bindingOwner?.role === 'manager';

  // Fetch bindings for salesperson-owned orders
  const { data: bindings = [], isLoading: bindingsLoading } = useBindings(
    bindingSalespersonId && !bindingOwnerIsManager
      ? { salespersonId: bindingSalespersonId, active: true }
      : undefined
  );

  // Fetch bindings for manager-owned orders
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

  const columns: Column<Order>[] = [
    { 
      key: 'order_date', 
      header: 'Date', 
      sortable: true, 
      width: '100px',
      render: (o) => format(new Date(o.order_date), 'MMM dd') 
    },
    { 
      key: 'order_code', 
      header: 'Order Ref', 
      sortable: true,
      render: (o) => <span className="font-mono text-sm">{o.order_code}</span>
    },
    { 
      key: 'area', 
      header: 'Area', 
      sortable: true, 
      filterable: true, 
      filterOptions: [...new Set(orders.map(o => o.area).filter(Boolean))].map(a => ({ label: a!, value: a! })) 
    },
    { 
      key: 'address', 
      header: 'Address', 
      render: (o) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-sm truncate max-w-[200px] block cursor-help">
              {o.address || '-'}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-[400px]">
            <p className="whitespace-pre-wrap">{o.address || 'No address'}</p>
          </TooltipContent>
        </Tooltip>
      )
    },
    { 
      key: 'items_summary', 
      header: 'Items', 
      render: (o) => {
        const { displayText, fullText, hasError, errorMessage } = formatOrderItemsDisplay(o.order_items);
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`text-sm cursor-help ${hasError ? 'text-destructive' : ''}`}>
                {hasError && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                <span className="font-medium">{displayText}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-[400px]">
              <p className="whitespace-pre-wrap">{hasError ? errorMessage : fullText}</p>
            </TooltipContent>
          </Tooltip>
        );
      }
    },
    { 
      key: 'total_amount', 
      header: 'Amount (BND)', 
      sortable: true, 
      render: (o) => <span className="font-medium">{formatBND(o.total_amount)}</span>
    },
    { 
      key: 'payment_method', 
      header: 'Payment', 
      width: '80px',
      render: (o) => <Badge variant="outline">{o.payment_method}</Badge> 
    },
    { 
      key: 'runner_id', 
      header: 'Runner', 
      filterable: true,
      filterOptions: runnerOptions.map(o => ({ label: o.label, value: o.id })),
      render: (o) => {
        if (!o.runner) return <span className="text-muted-foreground">Unassigned</span>;
        return (
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" />
            <span>{o.runner.display_name}</span>
          </div>
        );
      }
    },
    { 
      key: 'runner_status', 
      header: 'Delivery', 
      width: '180px',
      filterable: true,
      filterOptions: [
        { label: 'Unassigned', value: 'UNASSIGNED' },
        { label: 'Assigned', value: 'ASSIGNED' },
        { label: 'Taken', value: 'TAKEN' },
        { label: 'Delivered', value: 'DELIVERED' },
        { label: 'Failed', value: 'FAILED_DELIVERY' },
      ],
      render: (o) => (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <StatusBadge status={o.runner_status} type="runner" />
            {o.runner_status === 'FAILED_DELIVERY' && (
              <FailedDeliveryInfo order={o} compact />
            )}
          </div>
          {/* Show runner remark and next delivery date */}
          {(o.runner_comment || o.next_delivery_date) && (
            <div className="text-xs space-y-0.5">
              {o.runner_comment && (
                <div className="text-primary font-medium truncate max-w-[200px]" title={o.runner_comment}>
                  Note: {o.runner_comment}
                </div>
              )}
              {o.next_delivery_date && (
                <div className="text-muted-foreground">
                  Next: {format(new Date(o.next_delivery_date), 'dd MMM')}
                </div>
              )}
            </div>
          )}
        </div>
      )
    },
    { 
      key: 'reconciliation_status', 
      header: 'Reconciliation', 
      width: '140px',
      filterable: true,
      filterOptions: [
        { label: 'Not Claimed', value: 'NOT_CLAIMED' },
        { label: 'Claimed', value: 'CLAIMED' },
        { label: 'SP Ack Pending', value: 'SP_ACK_PENDING' },
        { label: 'Admin Ack Pending', value: 'ADMIN_ACK_PENDING' },
        { label: 'Settled', value: 'SETTLED' },
        { label: 'Dispute', value: 'DISPUTE' },
      ],
      render: (o) => <StatusBadge status={o.reconciliation_status} type="reconciliation" /> 
    },
  ];

  const handleRowClick = (order: Order) => {
    if (!isEditable) return;
    setEditingOrder(order);
    setEditorOpen(true);
  };

  const handleAssignRunner = () => {
    if (!selectedRunner || selectedRows.length === 0) return;
    
    bulkUpdateOrders.mutate({
      ids: selectedRows,
      updates: {
        runner_id: selectedRunner,
        runner_status: 'ASSIGNED',
      },
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

  const handleExport = () => {
    exportOrderLines(orders, 'ready_orders');
  };

  const handleExportSelected = () => {
    if (selectedRows.length === 0) {
      toast({ title: 'Please select at least 1 order to export', variant: 'destructive' });
      return;
    }
    exportSelectedOrderLines(orders, selectedRows, 'ready_orders_selected');
  };

  const handleCreateNew = () => {
    setEditingOrder(null);
    setEditorOpen(true);
  };

  const unassignedCount = orders.filter(o => o.runner_status === 'UNASSIGNED').length;

  const isMobile = useIsMobile();
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const toggleCardExpanded = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelection = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedRows(prev => [...prev, id]);
    } else {
      setSelectedRows(prev => prev.filter(r => r !== id));
    }
  };

  const isAllSelected = filteredOrders.length > 0 && selectedRows.length === filteredOrders.length;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows(filteredOrders.map(o => o.id));
    } else {
      setSelectedRows([]);
    }
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold">Ready Sales</h1>
            <p className="text-muted-foreground">
              Orders ready for delivery • {unassignedCount} awaiting runner assignment
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <TeamViewToggle
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              selectedMember={selectedMember}
              onMemberChange={setSelectedMember}
            />
            {isEditable && (
              <Button onClick={handleCreateNew} size={isMobile ? "sm" : "default"}>
                <Plus className="h-4 w-4 mr-2" />
                {isMobile ? 'New' : 'New Order'}
              </Button>
            )}
          </div>
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

        {/* Bulk Actions - Mobile */}
        {isMobile && isEditable && selectedRows.length > 0 && (
          <Card className="p-3 border-primary/50 bg-primary/5">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium text-primary">
                {selectedRows.length} order{selectedRows.length !== 1 ? 's' : ''} selected
              </span>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => setAssignDialogOpen(true)}>
                  <UserCheck className="h-4 w-4 mr-1" />
                  Assign
                </Button>
                <Button size="sm" variant="outline" onClick={handleExportSelected}>
                  Export
                </Button>
                <Button size="sm" variant="outline" onClick={handleDispute}>
                  Dispute
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setCancelDialogOpen(true)}>
                  Cancel
                </Button>
              </div>
            </div>
          </Card>
        )}

        {/* Mobile Card View */}
        {isMobile ? (
          <div className="space-y-3">
            {/* Mobile Search Bar */}
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
                totalCount={filteredOrders.length}
              />
            )}

            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">No ready orders</div>
            ) : (
              filteredOrders.map((order) => {
                const { displayText } = formatOrderItemsDisplay(order.order_items);
                const isExpanded = expandedCards.has(order.id);
                const isSelected = selectedRows.includes(order.id);

                return (
                  <MobileOrderCard
                    key={order.id}
                    id={order.id}
                    orderRef={order.order_code}
                    areaBadge={order.area ? <Badge variant="outline" className="text-xs">{order.area}</Badge> : undefined}
                    statusBadge={<StatusBadge status={order.runner_status} type="runner" />}
                    selectable={isEditable}
                    isSelected={isSelected}
                    onSelectionChange={(checked) => toggleSelection(order.id, checked)}
                    onClick={() => handleRowClick(order)}
                    primaryFields={[
                      { label: 'Date', value: format(new Date(order.order_date), 'dd MMM') },
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
          /* Desktop Table View */
          <DataGrid
            data={filteredOrders}
            columns={columns}
            keyField="id"
            selectable={isEditable}
            selectedRows={selectedRows}
            onSelectionChange={setSelectedRows}
            onRowClick={handleRowClick}
            loading={isLoading}
            emptyMessage="No ready orders"
            onExport={handleExport}
            onImport={isEditable ? () => setImportDialogOpen(true) : undefined}
            bulkActions={
              isEditable && selectedRows.length > 0 ? (
                (() => {
                  const selectedOrdersInfo = orders.filter(o => selectedRows.includes(o.id));
                  const hasDeliveredOrders = selectedOrdersInfo.some(o => o.runner_status === 'DELIVERED');
                  const isAdmin = role === 'admin';
                  const canCancel = isAdmin || !hasDeliveredOrders;
                  
                  return (
                    <div className="flex gap-2 items-center">
                      <Button 
                        size="sm" 
                        onClick={() => setAssignDialogOpen(true)}
                      >
                        <UserCheck className="h-4 w-4 mr-2" />
                        Assign Runner
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleExportSelected}>
                        Export Selected
                      </Button>
                      <Button size="sm" variant="outline" onClick={handleDispute}>
                        Mark Dispute
                      </Button>
                      {canCancel ? (
                        <Button 
                          size="sm" 
                          variant="destructive" 
                          onClick={() => setCancelDialogOpen(true)}
                        >
                          Cancel
                        </Button>
                      ) : (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <span>
                              <Button 
                                size="sm" 
                                variant="destructive" 
                                disabled
                              >
                                Cancel
                              </Button>
                            </span>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Delivered order is locked. Only admin can modify.</p>
                          </TooltipContent>
                        </Tooltip>
                      )}
                      {hasDeliveredOrders && !isAdmin && (
                        <Badge variant="secondary" className="ml-2">
                          Selection includes delivered orders
                        </Badge>
                      )}
                    </div>
                  );
                })()
              ) : undefined
            }
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
            {/* For manager/admin: Show salesperson selector when orders are from mixed salespersons */}
            {(role === 'manager' || role === 'admin') && hasMixedSalespersons && (
              <div className="space-y-2">
                <label className="text-sm font-medium text-destructive">
                  Selected orders belong to different salespersons. Please select a salesperson to filter runners:
                </label>
                <Select value={managerSelectedSalesperson} onValueChange={(value) => {
                  setManagerSelectedSalesperson(value);
                  setSelectedRunner(''); // Reset runner when salesperson changes
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
            
            {/* Show detected salesperson for manager/admin when all orders are from same salesperson */}
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
                  <div className="p-2 text-sm text-muted-foreground">
                    Loading runners...
                  </div>
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
