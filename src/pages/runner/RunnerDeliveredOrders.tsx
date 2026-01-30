import { useState, useMemo, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useOrders } from '@/hooks/useOrders';
import { useAuth } from '@/contexts/AuthContext';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { useMyDrivers } from '@/hooks/useDrivers';
import { useProducts } from '@/hooks/useProducts';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useRevertDelivery } from '@/hooks/useRevertDelivery';
import { formatBND } from '@/lib/currency';
import { formatOrderItemsDisplay } from '@/lib/orderItemsDisplay';
import { format } from 'date-fns';
import type { Order, ReconciliationStatus } from '@/types/database';
import { CheckCircle, Search, Send, Loader2, ChevronDown, ChevronUp, Package, Users, Phone, Download, Undo2 } from 'lucide-react';
import { exportOrderLines, exportSelectedOrderLines } from '@/lib/csv';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { WhatsAppPhoneLink } from '@/components/orders/WhatsAppPhoneLink';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BulkClaimDialog } from '@/components/runner/BulkClaimDialog';
import { RevertDeliveryDialog } from '@/components/admin/RevertDeliveryDialog';
import { TeamViewToggle, useTeamViewState } from '@/components/filters/TeamViewToggle';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useClaimBatches } from '@/hooks/useClaimBatches';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileOrderCard, MobileSelectAllCard } from '@/components/mobile/MobileOrderCard';

// Claim status filter options for the dropdown
type ClaimStatusFilter = 'all' | 'NOT_CLAIMED' | 'CLAIM_SUBMITTED' | 'APPROVED' | 'REJECTED';

const claimStatusFilterOptions: { label: string; value: ClaimStatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Not Claimed', value: 'NOT_CLAIMED' },
  { label: 'Claim Submitted', value: 'CLAIM_SUBMITTED' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
];

// Claim status display mapping (user-friendly labels)
const claimStatusLabels: Record<ReconciliationStatus, string> = {
  NOT_CLAIMED: 'NOT CLAIMED',
  ADMIN_ACK_PENDING: 'CLAIM SUBMITTED',
  CLAIMED: 'APPROVED',
  SP_ACK_PENDING: 'CLAIM SUBMITTED',
  SETTLED: 'APPROVED',
  DISPUTE: 'DISPUTE',
};

const claimStatusColors: Record<ReconciliationStatus, string> = {
  NOT_CLAIMED: 'bg-muted text-muted-foreground',
  ADMIN_ACK_PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  CLAIMED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  SP_ACK_PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  SETTLED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  DISPUTE: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export default function RunnerDeliveredOrders() {
  const { user, profile, role } = useAuth();
  const queryClient = useQueryClient();
  
  // Team view state for managers
  const { viewMode, setViewMode, selectedMember, setSelectedMember, salespersonIds, isManager: isManagerRole, teamMembers } = useTeamViewState('my');
  const teamMemberIds = useMemo(() => teamMembers.map(m => m.id), [teamMembers]);
  
  // Check if user is admin, manager, or salesperson
  const isAdmin = role === 'admin';
  const isManager = role === 'manager';
  const isAdminOrManager = isAdmin || isManager;
  
  // Filter states - declared before ordersFilter memo since salespersonFilter is used server-side
  const [searchQuery, setSearchQuery] = useState('');
  const [areaFilter, setAreaFilter] = useState('all');
  const [driverFilter, setDriverFilter] = useState('all');
  const [salespersonFilter, setSalespersonFilter] = useState('all');
  const [skuFilter, setSkuFilter] = useState('all');
  const [claimStatusFilter, setClaimStatusFilter] = useState<ClaimStatusFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportSelectedIds, setExportSelectedIds] = useState<Set<string>>(new Set());
  const [bulkClaimOpen, setBulkClaimOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Fetch orders based on role and view mode:
  // - Runner: fetch their own orders (runner_id = user.id), with optional salesperson filter
  // - Salesperson: fetch their own orders (salesperson_id = user.id)
  // - Manager: fetch based on view mode (my data vs team data)
  // - Admin: fetch all orders
  const ordersFilter = useMemo(() => {
    // Always filter for DELIVERED status at database level for performance
    const baseFilter = { runnerStatus: 'DELIVERED' as const };
    
    if (role === 'runner') {
      // Apply salesperson filter server-side to avoid response truncation on large datasets
      const runnerFilter = { ...baseFilter, runnerId: user?.id };
      if (salespersonFilter !== 'all') {
        return { ...runnerFilter, salespersonIds: [salespersonFilter] };
      }
      return runnerFilter;
    }
    if (role === 'salesperson') {
      return { ...baseFilter, salespersonId: user?.id };
    }
    if (role === 'manager' && salespersonIds && salespersonIds.length > 0) {
      // Use filtered salesperson IDs from team view state
      return { ...baseFilter, salespersonIds };
    }
    return baseFilter; // admin - fetch all delivered
  }, [role, user?.id, salespersonIds, salespersonFilter]);
  
  const { data: orders, isLoading } = useOrders(ordersFilter as any);
  const { data: userDirectory = [] } = useUserDirectory();
  const { data: myDrivers = [] } = useMyDrivers();
  const { data: products = [] } = useProducts();
  // Only fetch claim batches for runner role (they're the ones who claim)
  const { data: claimBatches = [] } = useClaimBatches(role === 'runner' ? { runnerId: user?.id } : undefined);
  
  // Determine if current user can claim orders (only runners can claim)
  const canClaim = role === 'runner';
  
  // Revert delivery state for admin
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [revertOrder, setRevertOrder] = useState<Order | null>(null);
  const revertDelivery = useRevertDelivery();

  // Helper function to check if order matches claim status filter
  const matchesClaimStatusFilter = (status: ReconciliationStatus, filter: ClaimStatusFilter): boolean => {
    if (filter === 'all') return true;
    if (filter === 'NOT_CLAIMED') return status === 'NOT_CLAIMED';
    if (filter === 'CLAIM_SUBMITTED') return status === 'ADMIN_ACK_PENDING' || status === 'SP_ACK_PENDING';
    if (filter === 'APPROVED') return status === 'CLAIMED' || status === 'SETTLED';
    if (filter === 'REJECTED') return status === 'DISPUTE';
    return true;
  };

  // Filter to only delivered orders
  const deliveredOrders = useMemo(() => {
    if (!orders) return [];
    
    let filtered = orders.filter(order => 
      order.runner_status === 'DELIVERED' && order.status !== 'CANCELLED'
    );

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(order =>
        order.order_code.toLowerCase().includes(query) ||
        order.customer_name?.toLowerCase().includes(query) ||
        order.area?.toLowerCase().includes(query)
      );
    }

    // Apply area filter
    if (areaFilter !== 'all') {
      filtered = filtered.filter(order => order.area === areaFilter);
    }

    // Apply driver filter
    if (driverFilter !== 'all') {
      filtered = filtered.filter(order => order.driver_id === driverFilter);
    }

    // Apply salesperson filter (only for non-runner roles - runners use server-side filtering)
    if (salespersonFilter !== 'all' && role !== 'runner') {
      filtered = filtered.filter(order => order.salesperson_id === salespersonFilter);
    }

    // Apply SKU filter
    if (skuFilter !== 'all') {
      filtered = filtered.filter(order => 
        order.order_items?.some(item => item.product_id === skuFilter)
      );
    }

    // Apply claim status filter
    if (claimStatusFilter !== 'all') {
      filtered = filtered.filter(order => matchesClaimStatusFilter(order.reconciliation_status, claimStatusFilter));
    }

    return filtered;
  }, [orders, searchQuery, areaFilter, driverFilter, salespersonFilter, skuFilter, claimStatusFilter]);

  // Orders eligible for claiming (DELIVERED + NOT_CLAIMED) - only relevant for runners
  const claimableOrders = useMemo(() => {
    if (!canClaim) return [];
    return deliveredOrders.filter(o => o.reconciliation_status === 'NOT_CLAIMED');
  }, [deliveredOrders, canClaim]);

  // Selected orders that are claimable
  const selectedClaimableOrders = useMemo(() => {
    return claimableOrders.filter(o => selectedIds.has(o.id));
  }, [claimableOrders, selectedIds]);

  // Toggle single selection
  const toggleSelection = useCallback((orderId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  }, []);

  // Select all claimable orders
  const toggleSelectAll = useCallback(() => {
    if (selectedIds.size === claimableOrders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(claimableOrders.map(o => o.id)));
    }
  }, [claimableOrders, selectedIds.size]);

  // Export selection handlers (for admin/manager)
  const toggleExportSelection = useCallback((orderId: string) => {
    setExportSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  }, []);

  const toggleExportSelectAll = useCallback(() => {
    if (exportSelectedIds.size === deliveredOrders.length) {
      setExportSelectedIds(new Set());
    } else {
      setExportSelectedIds(new Set(deliveredOrders.map(o => o.id)));
    }
  }, [deliveredOrders, exportSelectedIds.size]);

  // Export handlers
  const handleExportSelected = useCallback(() => {
    if (exportSelectedIds.size === 0) {
      toast.error('No orders selected for export');
      return;
    }
    const success = exportSelectedOrderLines(deliveredOrders, Array.from(exportSelectedIds), 'delivered_orders_selected');
    if (success) {
      toast.success(`Exported ${exportSelectedIds.size} order(s)`);
    }
  }, [deliveredOrders, exportSelectedIds]);

  const handleExportAll = useCallback(() => {
    if (deliveredOrders.length === 0) {
      toast.error('No orders to export');
      return;
    }
    exportOrderLines(deliveredOrders, 'delivered_orders_all');
    toast.success(`Exported ${deliveredOrders.length} order(s)`);
  }, [deliveredOrders]);

  // Handle bulk claim submission
  const handleBulkClaimSubmit = async (exchangeRate: number, note?: string) => {
    if (selectedClaimableOrders.length === 0) return;
    
    setIsSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('submit-bulk-claim', {
        body: {
          orderIds: selectedClaimableOrders.map(o => o.id),
          exchangeRate,
          note,
        },
      });

      if (response.error) throw response.error;
      if (!response.data?.success) throw new Error(response.data?.error || 'Failed to submit claim');

      toast.success(`Successfully claimed ${selectedClaimableOrders.length} order(s)`);
      setSelectedIds(new Set());
      setBulkClaimOpen(false);
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    } catch (error) {
      console.error('Bulk claim error:', error);
      throw error;
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle single order claim
  const handleSingleClaim = (order: Order) => {
    setSelectedIds(new Set([order.id]));
    setBulkClaimOpen(true);
  };

  // Handle revert delivery (admin only)
  const handleOpenRevertDialog = (order: Order) => {
    setRevertOrder(order);
    setRevertDialogOpen(true);
  };

  const handleRevertConfirm = (reason: string) => {
    if (!revertOrder) return;
    revertDelivery.mutate(
      { orderId: revertOrder.id, reason },
      {
        onSuccess: () => {
          setRevertDialogOpen(false);
          setRevertOrder(null);
        },
      }
    );
  };

  // Extract unique areas for filter
  const areaOptions = useMemo(() => {
    if (!orders) return [];
    const uniqueAreas = [...new Set(orders.filter(o => o.runner_status === 'DELIVERED').map(o => o.area).filter(Boolean))];
    return uniqueAreas.sort().map(area => ({ label: area as string, value: area as string }));
  }, [orders]);

  // Salesperson filter options - scoped based on role
  const salespersonOptions = useMemo(() => {
    if (isManager) {
      // Manager sees: Me + Team members
      const options = [
        { label: `${profile?.display_name} (Me)`, value: user?.id || '', searchLabel: profile?.display_name || '' },
        ...teamMembers.map(tm => ({
          label: tm.display_name,
          value: tm.id,
          searchLabel: tm.display_name,
        }))
      ];
      return options;
    }
    // Admin and Runner see all salespersons
    const salespersons = userDirectory.filter(u => u.role === 'salesperson' || u.role === 'manager');
    return salespersons.map(sp => ({
      label: sp.display_name,
      value: sp.id,
      searchLabel: sp.display_name,
    }));
  }, [userDirectory, isManager, teamMembers, profile, user?.id]);

  // Driver filter options
  const driverOptions = useMemo(() => {
    return myDrivers.map(d => ({
      label: d.driver?.display_name || 'Unknown',
      value: d.driver_id,
    }));
  }, [myDrivers]);

  // SKU filter options (for all roles)
  const skuOptions = useMemo(() => {
    return products.map(p => ({
      label: `${p.sku_code || ''}${p.sku_code ? ' / ' : ''}${p.sku_name}`,
      value: p.id,
      searchLabel: `${p.sku_code || ''} ${p.sku_name}`,
    }));
  }, [products]);

  // SKU Summary - calculate total delivered qty for selected SKU
  const skuSummary = useMemo(() => {
    if (skuFilter === 'all') return null;
    
    let totalQty = 0;
    let totalOrders = 0;
    let totalAmount = 0;
    
    deliveredOrders.forEach(order => {
      const matchingItems = order.order_items?.filter(item => item.product_id === skuFilter) || [];
      if (matchingItems.length > 0) {
        totalOrders++;
        matchingItems.forEach(item => {
          totalQty += item.qty || 0;
          totalAmount += item.line_total || 0;
        });
      }
    });
    
    const selectedProduct = products.find(p => p.id === skuFilter);
    
    return {
      skuName: selectedProduct ? `${selectedProduct.sku_code || selectedProduct.sku_name}` : 'Selected SKU',
      totalQty,
      totalOrders,
      totalAmount,
    };
  }, [skuFilter, deliveredOrders, products]);

  const allClaimableSelected = claimableOrders.length > 0 && selectedIds.size === claimableOrders.length;

  // Build a map of order_id -> batch reference for showing claim batch info
  const orderToBatchRef = useMemo(() => {
    const map = new Map<string, { batchId: string; submittedAt: string }>();
    for (const batch of claimBatches) {
      for (const item of batch.items || []) {
        map.set(item.order_id, {
          batchId: batch.id.slice(0, 8).toUpperCase(),
          submittedAt: batch.submitted_at,
        });
      }
    }
    return map;
  }, [claimBatches]);

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

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle className="h-8 w-8 text-green-600" />
            <div>
              <h1 className="text-2xl font-bold">Delivered Orders</h1>
              <p className="text-muted-foreground">
                View all orders that have been successfully delivered
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {(isAdminOrManager || role === 'runner') && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-2" />
                    Export
                    <ChevronDown className="h-4 w-4 ml-1" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleExportSelected} disabled={exportSelectedIds.size === 0}>
                    Export Selected ({exportSelectedIds.size})
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleExportAll}>
                    Export All ({deliveredOrders.length})
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <TeamViewToggle
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              selectedMember={selectedMember}
              onMemberChange={setSelectedMember}
            />
          </div>
        </div>

        {/* Stats */}
        <div className="grid gap-4 grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Delivered</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{deliveredOrders.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Claim</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {deliveredOrders.filter(o => o.reconciliation_status === 'NOT_CLAIMED').length}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Value</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {formatBND(deliveredOrders.reduce((sum, o) => sum + (o.total_amount || 0), 0))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:gap-4">
              <div className="flex-1 min-w-0 md:min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search order code, customer, area..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9 h-10"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap md:gap-4">
                <Select value={areaFilter} onValueChange={setAreaFilter}>
                  <SelectTrigger className="w-full md:w-[150px] h-10">
                    <SelectValue placeholder="All Areas" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Areas</SelectItem>
                    {areaOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={claimStatusFilter} onValueChange={(v) => setClaimStatusFilter(v as ClaimStatusFilter)}>
                  <SelectTrigger className="w-full md:w-[160px] h-10">
                    <SelectValue placeholder="Claim Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {claimStatusFilterOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                {/* User filter - All roles (Admin/Manager/Runner) */}
                <SearchableSelect
                  options={salespersonOptions}
                  value={salespersonFilter}
                  onValueChange={setSalespersonFilter}
                  placeholder="All Users"
                  searchPlaceholder="Search users..."
                  allOption={{ label: 'All Users', value: 'all' }}
                  className="w-full md:w-[180px]"
                />
                
                {/* SKU filter - All roles */}
                <SearchableSelect
                  options={skuOptions}
                  value={skuFilter}
                  onValueChange={setSkuFilter}
                  placeholder="All SKUs"
                  searchPlaceholder="Search SKU..."
                  allOption={{ label: 'All SKUs', value: 'all' }}
                  className="w-full md:w-[200px]"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* SKU Summary Card - Only shown when SKU filter is active */}
        {skuSummary && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base font-medium">
                <Package className="h-4 w-4 text-primary" />
                SKU Analysis: {skuSummary.skuName}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Delivered Qty</p>
                  <p className="text-2xl font-bold text-primary">{skuSummary.totalQty}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Orders</p>
                  <p className="text-2xl font-bold">{skuSummary.totalOrders}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Total Amount</p>
                  <p className="text-2xl font-bold">{formatBND(skuSummary.totalAmount)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Bar - only for runners who can claim */}
        {canClaim && selectedClaimableOrders.length > 0 && (
          <Card className="border-primary/50 bg-primary/5">
            <CardContent className="p-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <span className="text-sm font-medium">
                {selectedClaimableOrders.length} order(s) selected • Total: {formatBND(selectedClaimableOrders.reduce((sum, o) => sum + o.total_amount, 0))}
              </span>
              <Button onClick={() => setBulkClaimOpen(true)} disabled={isSubmitting}>
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Send className="h-4 w-4 mr-2" />
                )}
                Bulk Claim ({selectedClaimableOrders.length})
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Mobile Card View */}
        {isMobile ? (
          <div className="space-y-3">
            {canClaim && claimableOrders.length > 0 && (
              <MobileSelectAllCard
                isAllSelected={allClaimableSelected}
                onSelectAll={(checked) => {
                  if (checked) {
                    setSelectedIds(new Set(claimableOrders.map(o => o.id)));
                  } else {
                    setSelectedIds(new Set());
                  }
                }}
                selectedCount={selectedIds.size}
                totalCount={claimableOrders.length}
              />
            )}

            {isLoading ? (
              <div className="text-center py-8">
                <Loader2 className="h-6 w-6 animate-spin mx-auto" />
              </div>
            ) : deliveredOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No delivered orders found
              </div>
            ) : (
              deliveredOrders.map((order) => {
                const isClaimable = canClaim && order.reconciliation_status === 'NOT_CLAIMED';
                const isSelected = selectedIds.has(order.id);
                const { displayText } = formatOrderItemsDisplay(order.order_items);
                const batchRef = orderToBatchRef.get(order.id);
                // Use snapshot name if profile is missing/inactive
                const salespersonDisplayName = order.salesperson?.display_name || (order as any).created_by_name_snapshot || 'Deleted User';

                return (
                  <MobileOrderCard
                    key={order.id}
                    id={order.id}
                    orderRef={order.order_code}
                    areaBadge={order.area ? <Badge variant="outline" className="text-xs">{order.area}</Badge> : undefined}
                    statusBadge={
                      <Badge className={claimStatusColors[order.reconciliation_status]}>
                        {claimStatusLabels[order.reconciliation_status]}
                      </Badge>
                    }
                    selectable={canClaim && isClaimable}
                    isSelected={isSelected}
                    onSelectionChange={(checked) => {
                      if (checked) {
                        setSelectedIds(prev => new Set([...prev, order.id]));
                      } else {
                        setSelectedIds(prev => {
                          const next = new Set(prev);
                          next.delete(order.id);
                          return next;
                        });
                      }
                    }}
                    primaryFields={[
                      { label: 'Imported', value: format(new Date(order.created_at), 'MMM dd, HH:mm') },
                      { label: 'Items', value: displayText },
                      { label: 'Amount', value: formatBND(order.total_amount) },
                      { label: 'Delivered', value: order.delivered_at ? format(new Date(order.delivered_at), 'MMM dd, HH:mm') : '-' },
                    ]}
                    expandedFields={[
                      { label: 'Customer', value: order.customer_name || '-' },
                      { label: 'Phone', value: <WhatsAppPhoneLink order={order} showIcon={false} /> },
                      { label: 'Address', value: order.address || '-', fullWidth: true },
                      { label: 'Payment', value: order.payment_method },
                      { label: 'Runner', value: order.runner?.display_name || '-' },
                      { label: 'Driver', value: order.driver?.display_name || '-' },
                      { label: 'Salesperson', value: salespersonDisplayName },
                      ...(batchRef ? [{ label: 'Batch Ref', value: batchRef.batchId }] : []),
                    ]}
                    primaryAction={
                      isClaimable ? (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSingleClaim(order);
                          }}
                        >
                          Claim
                        </Button>
                      ) : undefined
                    }
                    secondaryActions={
                      isAdmin ? (
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-orange-300 text-orange-600"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenRevertDialog(order);
                          }}
                          disabled={revertDelivery.isPending}
                        >
                          <Undo2 className="h-4 w-4 mr-1" />
                          Reverse
                        </Button>
                      ) : undefined
                    }
                  />
                );
              })
            )}
          </div>
        ) : (
          /* Desktop Table View */
          <Card>
            <CardContent className="p-0">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {isAdminOrManager && (
                        <TableHead className="w-12">
                          <Checkbox
                            checked={exportSelectedIds.size === deliveredOrders.length && deliveredOrders.length > 0}
                            onCheckedChange={toggleExportSelectAll}
                            disabled={deliveredOrders.length === 0}
                          />
                        </TableHead>
                      )}
                      {canClaim && (
                        <TableHead className="w-12">
                          <Checkbox
                            checked={allClaimableSelected}
                            onCheckedChange={toggleSelectAll}
                            disabled={claimableOrders.length === 0}
                          />
                        </TableHead>
                      )}
                      <TableHead>Imported</TableHead>
                      <TableHead>Order Ref</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Area</TableHead>
                      <TableHead>Address</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Amount (BND)</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Runner</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Salesperson</TableHead>
                      <TableHead>Delivered</TableHead>
                      <TableHead>Claim Status</TableHead>
                      {canClaim && <TableHead>Claim Batch Ref</TableHead>}
                      {canClaim && <TableHead>Action</TableHead>}
                      {isAdmin && <TableHead>Admin</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={15 + (isAdminOrManager ? 1 : 0) + (canClaim ? 3 : 0) + (isAdmin ? 1 : 0)} className="text-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : deliveredOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={15 + (isAdminOrManager ? 1 : 0) + (canClaim ? 3 : 0) + (isAdmin ? 1 : 0)} className="text-center py-8 text-muted-foreground">
                          No delivered orders found
                        </TableCell>
                      </TableRow>
                    ) : (
                      deliveredOrders.map((order) => {
                        const isClaimable = canClaim && order.reconciliation_status === 'NOT_CLAIMED';
                        const isSelected = selectedIds.has(order.id);
                        const isExportSelected = exportSelectedIds.has(order.id);
                        const { displayText, fullText, hasError, errorMessage } = formatOrderItemsDisplay(order.order_items);
                        // Use snapshot name if profile is missing/inactive
                        const salespersonDisplayName = order.salesperson?.display_name || (order as any).created_by_name_snapshot || 'Deleted User';

                        return (
                          <TableRow key={order.id} className={isSelected || isExportSelected ? 'bg-primary/5' : ''}>
                            {isAdminOrManager && (
                              <TableCell>
                                <Checkbox
                                  checked={isExportSelected}
                                  onCheckedChange={() => toggleExportSelection(order.id)}
                                />
                              </TableCell>
                            )}
                            {canClaim && (
                              <TableCell>
                                {isClaimable ? (
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => toggleSelection(order.id)}
                                  />
                                ) : (
                                  <Checkbox disabled checked={false} className="opacity-30" />
                                )}
                              </TableCell>
                            )}
                            <TableCell>{format(new Date(order.created_at), 'MMM dd, HH:mm')}</TableCell>
                            <TableCell><span className="font-mono text-sm">{order.order_code}</span></TableCell>
                            <TableCell>{order.customer_name || '-'}</TableCell>
                            <TableCell><WhatsAppPhoneLink order={order} /></TableCell>
                            <TableCell><Badge variant="outline">{order.area || '-'}</Badge></TableCell>
                            <TableCell>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-sm truncate max-w-[180px] block cursor-help">
                                      {order.address || '-'}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-[400px]">
                                    <p className="whitespace-pre-wrap">{order.address || 'No address'}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableCell>
                            <TableCell>
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className={`text-sm font-medium cursor-help ${hasError ? 'text-destructive' : ''}`}>
                                      {displayText}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-[400px]">
                                    <p className="whitespace-pre-wrap">{hasError ? errorMessage : fullText}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableCell>
                            <TableCell><span className="font-medium">{formatBND(order.total_amount)}</span></TableCell>
                            <TableCell><Badge variant="outline">{order.payment_method}</Badge></TableCell>
                            <TableCell>{order.runner?.display_name || '-'}</TableCell>
                            <TableCell>{order.driver?.display_name || '-'}</TableCell>
                            <TableCell>{salespersonDisplayName}</TableCell>
                            <TableCell>
                              {order.delivered_at 
                                ? format(new Date(order.delivered_at), 'dd MMM yyyy HH:mm')
                                : '-'}
                            </TableCell>
                            <TableCell>
                              <Badge className={claimStatusColors[order.reconciliation_status]}>
                                {claimStatusLabels[order.reconciliation_status]}
                              </Badge>
                            </TableCell>
                            {canClaim && (
                              <TableCell>
                                {orderToBatchRef.has(order.id) ? (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <span className="font-mono text-xs bg-muted px-2 py-1 rounded cursor-help">
                                          {orderToBatchRef.get(order.id)?.batchId}
                                        </span>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Submitted: {format(new Date(orderToBatchRef.get(order.id)!.submittedAt), 'dd MMM yyyy HH:mm')}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                            )}
                            {canClaim && (
                              <TableCell>
                                {isClaimable && (
                                  <Button 
                                    size="sm" 
                                    variant="outline"
                                    onClick={() => handleSingleClaim(order)}
                                  >
                                    Claim
                                  </Button>
                                )}
                              </TableCell>
                            )}
                            {isAdmin && (
                              <TableCell>
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="border-orange-300 text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                                        onClick={() => handleOpenRevertDialog(order)}
                                        disabled={revertDelivery.isPending}
                                      >
                                        <Undo2 className="h-4 w-4" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Reverse Delivered</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bulk Claim Dialog */}
        <BulkClaimDialog
          open={bulkClaimOpen}
          onOpenChange={setBulkClaimOpen}
          orders={selectedClaimableOrders}
          onSubmit={handleBulkClaimSubmit}
          isSubmitting={isSubmitting}
        />

        {/* Revert Delivery Dialog (Admin only) */}
        <RevertDeliveryDialog
          open={revertDialogOpen}
          onOpenChange={setRevertDialogOpen}
          order={revertOrder}
          onConfirm={handleRevertConfirm}
          isPending={revertDelivery.isPending}
        />
      </div>
    </AppLayout>
  );
}
