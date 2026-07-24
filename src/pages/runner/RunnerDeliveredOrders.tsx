import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { useMyDrivers } from '@/hooks/useDrivers';
import { useProducts } from '@/hooks/useProducts';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { useRevertDelivery } from '@/hooks/useRevertDelivery';
import { useValidAreas } from '@/hooks/useValidAreas';
import { formatBND } from '@/lib/currency';
import { useDeliveredOrdersFastAll, useVisibleOwnerIds, type DeliveredOrder } from '@/hooks/useDeliveredOrders';
import { Skeleton } from '@/components/ui/skeleton';
import { formatOrderItemsDisplay } from '@/lib/orderItemsDisplay';
import { format } from 'date-fns';
import type { Order, ReconciliationStatus } from '@/types/database';
import { CheckCircle, Search, Send, Loader2, ChevronDown, Package, Users, Phone, Download, Undo2, AlertTriangle, DollarSign, FileCheck, Banknote } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DateRangePresets, useDateRangeState, type DateRange } from '@/components/filters/DateRangePresets';
import { PageHero } from '@/components/dashboard/PageHero';
import { DataScopeSelector } from '@/components/data-sharing/DataScopeSelector';
import type { DataViewMode } from '@/types/data-sharing';
import capybaraRunner from '@/assets/capybara-runner.png';
import { CapybaraState } from '@/components/dashboard/CapybaraState';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
  PaginationEllipsis,
} from '@/components/ui/pagination';

// Pagination constants
const PAGE_SIZE = 50;

// Helper function for page number display
function getPageNumbers(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  
  if (current <= 3) {
    return [1, 2, 3, 4, 5, '...', total];
  }
  
  if (current >= total - 2) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  }
  
  return [1, '...', current - 1, current, current + 1, '...', total];
}

function getClaimErrorMessage(
  error: unknown,
  fallback = 'Claim batch submission failed. Please try again or contact admin.',
): string {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>;
    for (const key of ['message', 'error_description', 'error', 'details', 'hint']) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) return value;
    }
    try {
      return JSON.stringify(error);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

interface FreshClaimOrder {
  id: string;
  order_code: string | null;
  customer_name: string | null;
  area: string | null;
  runner_status: string | null;
  reconciliation_status: string | null;
  runner_id: string | null;
  delivered_at: string | null;
}
import { exportDeliveredOrderLines } from '@/lib/csv';
import { useActiveDeliveryCharges } from '@/hooks/useDeliveryCharges';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { WhatsAppPhoneLink } from '@/components/orders/WhatsAppPhoneLink';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BulkClaimDialog } from '@/components/runner/BulkClaimDialog';
import { UserGroupedBulkClaimDialog, type ClaimGroupSubmission, type ClaimBatchResult } from '@/components/runner/UserGroupedBulkClaimDialog';
import { RevertDeliveryDialog } from '@/components/admin/RevertDeliveryDialog';
import { TeamViewToggle, useTeamViewState } from '@/components/filters/TeamViewToggle';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useClaimBatches } from '@/hooks/useClaimBatches';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileOrderCard, MobileSelectAllCard } from '@/components/mobile/MobileOrderCard';
import { useNavigate } from 'react-router-dom';
import { useDeliveryCharges as useApprovedChargeMap } from '@/hooks/useDeliveryChargePreview';
import { RunnerEarningsDashboard } from '@/components/runner/RunnerEarningsDashboard';
import { AutoClaimSuggestion } from '@/components/runner/AutoClaimSuggestion';
import { EarningsChart } from '@/components/runner/EarningsChart';
import { ClaimBatchTimeline } from '@/components/runner/ClaimBatchTimeline';
import { useRunnerEarnings } from '@/hooks/useRunnerEarnings';

// Claim status filter options for the dropdown
type ClaimStatusFilter = 'all' | 'NOT_CLAIMED' | 'CLAIM_SUBMITTED' | 'APPROVED' | 'REJECTED';

// Map claim status filter to actual reconciliation_status values
const claimStatusToReconciliation: Record<ClaimStatusFilter, string[] | null> = {
  all: null,
  NOT_CLAIMED: ['NOT_CLAIMED'],
  CLAIM_SUBMITTED: ['ADMIN_ACK_PENDING', 'SP_ACK_PENDING'],
  APPROVED: ['CLAIMED', 'SETTLED'],
  REJECTED: ['DISPUTE'],
};

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

// Enhanced claim status badge that differentiates NOT_CLAIMED sub-states
function ClaimEligibilityBadge({ order, approvedChargeMap, canClaim }: { order: Order; approvedChargeMap: Record<string, number>; canClaim: boolean }) {
  const status = order.reconciliation_status;

  // Non-NOT_CLAIMED statuses use the standard label/color
  if (status !== 'NOT_CLAIMED') {
    return (
      <Badge className={claimStatusColors[status]}>
        {claimStatusLabels[status]}
      </Badge>
    );
  }

  // NOT_CLAIMED sub-states (only differentiate for runners who can claim)
  if (!canClaim) {
    return (
      <Badge className={claimStatusColors.NOT_CLAIMED}>
        {claimStatusLabels.NOT_CLAIMED}
      </Badge>
    );
  }

  // Check area and charge rate
  if (!order.area || order.area.trim() === '') {
    return (
      <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
        Missing Area
      </Badge>
    );
  }

  // Check delivered_at
  if (!order.delivered_at) {
    return (
      <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
        No Delivery Time
      </Badge>
    );
  }

  const area = order.area.toLowerCase();
  if (approvedChargeMap[area] === undefined) {
    return (
      <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
        No Charge Rate
      </Badge>
    );
  }

  // Fully claimable
  return (
    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
      <CheckCircle className="h-3 w-3 mr-1" />
      Claimable
    </Badge>
  );
}

export default function RunnerDeliveredOrders({ initialSearch = '', highlightOrderId }: { initialSearch?: string; highlightOrderId?: string | null }) {
  const { user, profile, role } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Scroll to highlighted order
  useEffect(() => {
    if (highlightOrderId) {
      const timer = setTimeout(() => {
        const el = tableContainerRef.current?.querySelector(`[data-order-id="${highlightOrderId}"]`)
          || document.querySelector(`[data-order-id="${highlightOrderId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [highlightOrderId]);
  
  // Approved delivery charges map for the runner (area -> charge_amount)
  const { data: approvedChargeMap = {} } = useApprovedChargeMap();
  
  // Team view state for managers
  const { viewMode, setViewMode, selectedMember, setSelectedMember, salespersonIds, isManager: isManagerRole, teamMembers } = useTeamViewState('team');
  const teamMemberIds = useMemo(() => teamMembers.map(m => m.id), [teamMembers]);

  // Data sharing view mode (for DataScopeSelector)
  const [dataSharingView, setDataSharingView] = useState<DataViewMode>('my_data');
  
  // Check if user is admin, manager, or salesperson
  const isAdmin = role === 'admin';
  const isManager = role === 'manager';
  const isAdminOrManager = isAdmin || isManager;
  const canExport = isAdmin || isManager || role === 'salesperson';
  
  // Filter states - declared before ordersFilter memo since salespersonFilter is used server-side
  const [searchQuery, setSearchQuery] = useState('');
  const [areaFilter, setAreaFilter] = useState('all');
  const [driverFilter, setDriverFilter] = useState('all');
  const [salespersonFilters, setSalespersonFilters] = useState<string[]>([]);
  const [skuFilter, setSkuFilter] = useState('all');
  const [claimStatusFilter, setClaimStatusFilter] = useState<ClaimStatusFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportSelectedIds, setExportSelectedIds] = useState<Set<string>>(new Set());
  const [bulkClaimOpen, setBulkClaimOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { dateRange, setDateRange } = useDateRangeState();

  useEffect(() => {
    if (initialSearch) {
      setSearchQuery(initialSearch);
    }
  }, [initialSearch]);
  
  // ---------- Unified RPC path for ALL roles (bypasses RLS via SECURITY DEFINER) ----------
  const isRunnerRole = role === 'runner';

  // Get visible owner IDs for role-scoping (admin=null=all, manager/salesperson=team IDs)
  const { data: visibleOwnerIds } = useVisibleOwnerIds();

  // Compute the effective salesperson scope for the RPC based on role + filters
  const rpcSalespersonIds = useMemo((): string[] | undefined => {
    // User explicitly selected salesperson filters — use those
    if (salespersonFilters.length > 0) return salespersonFilters;

    // Role-based defaults
    if (role === 'admin') return undefined; // admin sees all
    if (role === 'runner') return undefined; // runner uses runner_id filter, not salesperson
    if (role === 'salesperson') return user?.id ? [user.id] : undefined;

    // Manager: use team view state
    if (role === 'manager') {
      if (salespersonIds && salespersonIds.length > 0) {
        return salespersonIds; // specific member selected
      }
      // "All Team" mode — use the visible owner IDs from the DB RPC
      if (visibleOwnerIds && Array.isArray(visibleOwnerIds) && visibleOwnerIds.length > 0) {
        return visibleOwnerIds;
      }
      // Still loading visible IDs — return undefined to prevent showing global data
      // The query will be disabled until we have the IDs
      return undefined;
    }

    return undefined;
  }, [role, user?.id, salespersonFilters, salespersonIds, visibleOwnerIds]);

  // For non-admin/non-runner roles, wait for visible owner IDs before fetching
  const rpcEnabled = useMemo(() => {
    if (!user?.id) return false;
    if (role === 'admin' || role === 'runner') return true;
    // Manager/salesperson: must have scoped IDs
    return rpcSalespersonIds !== undefined && rpcSalespersonIds.length > 0;
  }, [user?.id, role, rpcSalespersonIds]);

  // Use the batch-loading RPC for ALL roles
  const { data: rpcOrders = [], isLoading: rpcLoading } = useDeliveredOrdersFastAll({
    runnerId: isRunnerRole ? user?.id : undefined,
    salespersonIds: rpcSalespersonIds,
    enabled: rpcEnabled,
  });

  // Map DeliveredOrder → Order-compatible shape for ALL roles
  const rpcOrdersMapped = useMemo(() => {
    return rpcOrders.map((d: DeliveredOrder) => ({
      id: d.id,
      order_code: d.order_code,
      created_at: d.order_date,
      customer_name: d.customer_name,
      phone: d.phone,
      area: d.area,
      address: d.address,
      total_amount: d.total_amount,
      total_qty: d.total_qty,
      payment_method: d.payment_method,
      runner_status: d.runner_status,
      reconciliation_status: d.reconciliation_status,
      delivered_at: d.delivered_at,
      salesperson_id: d.salesperson_id,
      runner_id: d.runner_id,
      driver_id: d.driver_id,
      status: d.status || 'READY',
      salesperson: d.salesperson_name ? { id: d.salesperson_id, display_name: d.salesperson_name, email: null } : null,
      runner: d.runner_name ? { id: d.runner_id || '', display_name: d.runner_name, email: null } : null,
      driver: d.driver_name ? { id: d.driver_id || '', display_name: d.driver_name, email: null } : null,
      order_items: d.items_json?.map(item => ({
        id: item.id,
        product_id: item.product_id,
        sku_label: item.sku_label || (item.sku_code ? `${item.sku_code}/${item.sku_name || ''}` : null),
        qty: item.qty,
        price: item.price,
        line_total: item.line_total,
        product: item.product_id ? { id: item.product_id, sku_code: item.sku_code, sku_name: item.sku_name } : null,
      })) || [],
    })) as any[];
  }, [rpcOrders]);

  // Apply client-side filters for ALL roles (unified RPC data path)
  const filteredOrders = useMemo(() => {
    let filtered = rpcOrdersMapped;

    // Search
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toUpperCase().replace(/\s+/g, '');
      filtered = filtered.filter(o =>
        (o.order_code || '').toUpperCase().replace(/\s+/g, '').startsWith(q)
      );
    }
    // Area
    if (areaFilter !== 'all') {
      filtered = filtered.filter(o => o.area === areaFilter);
    }
    // Date range
    if (dateRange.from) {
      const from = dateRange.from.getTime();
      filtered = filtered.filter(o => o.delivered_at && new Date(o.delivered_at).getTime() >= from);
    }
    if (dateRange.to) {
      const to = dateRange.to.getTime();
      filtered = filtered.filter(o => o.delivered_at && new Date(o.delivered_at).getTime() <= to);
    }
    // Driver
    if (driverFilter !== 'all') {
      filtered = filtered.filter(o => o.driver_id === driverFilter);
    }
    // Salesperson (explicit user filter dropdown — applies on top of role-scoping)
    if (salespersonFilters.length > 0) {
      filtered = filtered.filter(o => salespersonFilters.includes(o.salesperson_id));
    }
    // Claim status
    const reconStatuses = claimStatusToReconciliation[claimStatusFilter];
    if (reconStatuses) {
      filtered = filtered.filter(o => reconStatuses.includes(o.reconciliation_status));
    }
    // SKU filter (moved here so pagination count matches visible rows)
    if (skuFilter !== 'all') {
      const normalizedSku = skuFilter.trim().toUpperCase();
      filtered = filtered.filter(order =>
        order.order_items?.some((item: any) => {
          const itemCode = (item.product?.sku_code || item.sku_label?.split(/[\/-]/)[0] || '').trim().toUpperCase();
          return itemCode === normalizedSku;
        })
      );
    }

    return filtered;
  }, [rpcOrdersMapped, searchQuery, areaFilter, dateRange, driverFilter, salespersonFilters, claimStatusFilter, skuFilter]);

  // Client-side pagination for ALL roles (unified RPC data)
  const [currentPage, setCurrentPage] = useState(1);
  const totalFilteredCount = filteredOrders.length;
  const totalPages = Math.ceil(totalFilteredCount / PAGE_SIZE) || 1;
  const pageData = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredOrders.slice(start, start + PAGE_SIZE);
  }, [filteredOrders, currentPage]);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, areaFilter, dateRange, driverFilter, salespersonFilters, claimStatusFilter, skuFilter]);

  // ---------- Unified interface ----------
  const isLoading = rpcLoading;
  const isFetching = rpcLoading;
  const pagination = { page: currentPage, pageSize: PAGE_SIZE, totalCount: totalFilteredCount, totalPages };
  const rawOrders = pageData;

  // Alias for compatibility - orders on current page
  const orders = rawOrders;
  
  // Apply SKU filter client-side on current page (already applied in filteredOrders above)
  const deliveredOrders = orders;

  // Current page orders (already paginated server-side)
  const paginatedOrders = deliveredOrders;

  const { data: userDirectory = [] } = useUserDirectory();
  const { data: myDrivers = [] } = useMyDrivers();
  const { data: products = [] } = useProducts();
  const { data: claimBatches = [] } = useClaimBatches(role === 'runner' ? { runnerId: user?.id } : {});

  // Runner earnings dashboard data
  const { data: runnerEarnings, isLoading: earningsLoading } = useRunnerEarnings(
    role === 'runner' ? user?.id : undefined
  );

  // Fetch active delivery charges for runner (for export)
  const { data: activeCharges = [] } = useActiveDeliveryCharges(
    role === 'runner' ? user?.id : undefined
  );

  // Build delivery charges lookup map: "runnerId:area" -> charge_amount
  const deliveryChargesMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const charge of activeCharges) {
      map.set(`${charge.runner_id}:${charge.area}`, charge.charge_amount);
    }
    return map;
  }, [activeCharges]);

  // Compute summary from client-side filtered data — placed after allFilteredOrders definition below.
  // (clientSummary and displaySummary are declared further down)

  const canClaim = role === 'runner';

  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [revertOrder, setRevertOrder] = useState<Order | null>(null);
  const revertDelivery = useRevertDelivery();

  // Detect if any filters are active
  const hasActiveFilters = useMemo(() => {
    return (
      searchQuery.trim() !== '' ||
      areaFilter !== 'all' ||
      driverFilter !== 'all' ||
      salespersonFilters.length > 0 ||
      skuFilter !== 'all' ||
      claimStatusFilter !== 'all' ||
      dateRange.from !== null
    );
  }, [searchQuery, areaFilter, driverFilter, salespersonFilters, skuFilter, claimStatusFilter, dateRange]);

  // Clear filters helper
  const clearAllFilters = useCallback(() => {
    setSearchQuery('');
    setAreaFilter('all');
    setDriverFilter('all');
    setSalespersonFilters([]);
    setSkuFilter('all');
    setClaimStatusFilter('all');
    setDateRange({ from: null, to: null, label: 'Lifetime' });
  }, [setDateRange]);

  // Pagination helpers for UI
  const startIndex = (currentPage - 1) * PAGE_SIZE;

  // Check if an order has a valid approved delivery charge for its area
  const orderHasValidAreaRate = useCallback((order: Order): boolean => {
    if (!order.area || order.area.trim() === '') return false;
    const area = order.area.toLowerCase();
    return approvedChargeMap[area] !== undefined;
  }, [approvedChargeMap]);

  const isOrderClaimable = useCallback((order: Order): boolean => {
    return Boolean(
      canClaim &&
      order.runner_status === 'DELIVERED' &&
      order.reconciliation_status === 'NOT_CLAIMED' &&
      order.delivered_at &&
      orderHasValidAreaRate(order)
    );
  }, [canClaim, orderHasValidAreaRate]);

  // Full filtered dataset (all pages) — SKU filter already applied in filteredOrders
  const allFilteredOrders = filteredOrders;

  // Compute summary from client-side filtered data to guarantee consistency with list count.
  // Server-side RPC lacks date range filtering, which causes card vs list mismatch.
  const clientSummary = useMemo(() => {
    return {
      total_delivered: allFilteredOrders.length,
      pending_claim: allFilteredOrders.filter(o => o.reconciliation_status === 'NOT_CLAIMED').length,
      total_amount: allFilteredOrders.reduce((sum, o) => sum + (Number(o.total_amount) || 0), 0),
    };
  }, [allFilteredOrders]);

  const displaySummary = clientSummary;
  const displaySummaryLoading = rpcLoading;

  // Orders eligible for claiming (DELIVERED + NOT_CLAIMED + delivered_at exists + valid area rate) - uses FULL dataset for runners
  const claimableOrders = useMemo(() => {
    if (!canClaim) return [];
    return allFilteredOrders.filter(isOrderClaimable);
  }, [allFilteredOrders, canClaim, isOrderClaimable]);

  // Orders that are NOT_CLAIMED but have invalid area or missing delivered_at (for display purposes)
  const invalidAreaOrders = useMemo(() => {
    if (!canClaim) return [];
    return allFilteredOrders.filter(o =>
      o.runner_status === 'DELIVERED' &&
      o.reconciliation_status === 'NOT_CLAIMED' &&
      (!orderHasValidAreaRate(o) || !o.delivered_at)
    );
  }, [allFilteredOrders, canClaim, orderHasValidAreaRate]);

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
    if (claimableOrders.length > 0 && selectedClaimableOrders.length === claimableOrders.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(claimableOrders.map(o => o.id)));
    }
  }, [claimableOrders, selectedClaimableOrders.length]);

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
    if (exportSelectedIds.size === allFilteredOrders.length) {
      setExportSelectedIds(new Set());
    } else {
      setExportSelectedIds(new Set(allFilteredOrders.map(o => o.id)));
    }
  }, [allFilteredOrders, exportSelectedIds.size]);

  // Export handlers
  const handleExportSelected = useCallback(() => {
    if (exportSelectedIds.size === 0) {
      toast.error('No orders selected for export');
      return;
    }
    const selectedOrders = allFilteredOrders.filter(o => exportSelectedIds.has(o.id));
    exportDeliveredOrderLines(selectedOrders, deliveryChargesMap, 'delivered_orders_selected');
    toast.success(`Exported ${selectedOrders.length} order(s)`);
  }, [allFilteredOrders, exportSelectedIds, deliveryChargesMap]);

  const handleExportAll = useCallback(() => {
    if (allFilteredOrders.length === 0) {
      toast.error('No orders to export');
      return;
    }
    exportDeliveredOrderLines(allFilteredOrders, deliveryChargesMap, 'delivered_orders_all');
    toast.success(`Exported ${allFilteredOrders.length} order(s)`);
  }, [allFilteredOrders, deliveryChargesMap]);

  // Handle bulk claim submission (grouped — supports multiple batches)
  const handleGroupedClaimSubmit = async (groups: ClaimGroupSubmission[]): Promise<ClaimBatchResult> => {
    if (groups.length === 0) return { success_count: 0, failed_count: 0, failed_orders: [] };

    setIsSubmitting(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      // Build a lookup map from locally known orders for enriching error entries
      const orderLookup = new Map<string, { order_code: string; customer_name: string; area: string | null }>();
      for (const o of allFilteredOrders) {
        orderLookup.set(o.id, { order_code: o.order_code, customer_name: o.customer_name || '?', area: o.area || null });
      }

      const requestedOrderIds = Array.from(new Set(groups.flatMap(group => group.orderIds)));
      const freshOrders: FreshClaimOrder[] = [];
      const FRESH_ORDER_QUERY_CHUNK = 200;
      for (let i = 0; i < requestedOrderIds.length; i += FRESH_ORDER_QUERY_CHUNK) {
        const chunk = requestedOrderIds.slice(i, i + FRESH_ORDER_QUERY_CHUNK);
        if (chunk.length === 0) continue;
        const { data: chunkOrders, error: freshOrdersError } = await supabase
          .from('orders')
          .select('id, order_code, customer_name, area, runner_status, reconciliation_status, runner_id, delivered_at')
          .in('id', chunk);

        if (freshOrdersError) throw freshOrdersError;
        if (chunkOrders) freshOrders.push(...chunkOrders);
      }

      const freshOrderMap = new Map(freshOrders.map(order => [order.id, order]));
      const eligibleOrderIds = new Set<string>();
      const allSkippedOrders: ClaimBatchResult['skipped_orders'] = [];
      const precheckFailedOrders: ClaimBatchResult['failed_orders'] = [];
      const submittedStatuses = new Set(['ADMIN_ACK_PENDING', 'SP_ACK_PENDING', 'CLAIMED', 'SETTLED']);

      for (const orderId of requestedOrderIds) {
        const local = orderLookup.get(orderId);
        const fresh = freshOrderMap.get(orderId);
        const base = {
          order_id: orderId,
          order_code: fresh?.order_code || local?.order_code || '?',
          customer_name: fresh?.customer_name || local?.customer_name || '?',
          area: fresh?.area || local?.area || null,
        };

        if (!fresh) {
          precheckFailedOrders.push({ ...base, reason: 'Order not found' });
          continue;
        }

        if (fresh.runner_id !== user?.id) {
          precheckFailedOrders.push({ ...base, reason: 'Not authorized - runner mismatch' });
          continue;
        }

        if (fresh.reconciliation_status !== 'NOT_CLAIMED') {
          const reason = `Already claimed or submitted (status: ${fresh.reconciliation_status})`;
          if (submittedStatuses.has(fresh.reconciliation_status || '')) {
            allSkippedOrders.push({ ...base, reason });
          } else {
            precheckFailedOrders.push({ ...base, reason });
          }
          continue;
        }

        if (fresh.runner_status !== 'DELIVERED') {
          precheckFailedOrders.push({ ...base, reason: `Status is not DELIVERED (current: ${fresh.runner_status || 'unknown'})` });
          continue;
        }

        if (!fresh.delivered_at) {
          precheckFailedOrders.push({ ...base, reason: 'Order has no delivery timestamp - delivery not confirmed' });
          continue;
        }

        const areaKey = fresh.area?.trim().toLowerCase();
        if (!areaKey || approvedChargeMap[areaKey] === undefined) {
          precheckFailedOrders.push({
            ...base,
            reason: fresh.area
              ? `No approved delivery charge for area: ${fresh.area}`
              : 'Order has no delivery area set - contact admin to assign an area',
          });
          continue;
        }

        eligibleOrderIds.add(orderId);
      }

      const sanitizedGroups = groups
        .map(group => ({
          ...group,
          orderIds: group.orderIds.filter(orderId => eligibleOrderIds.has(orderId)),
        }))
        .filter(group => group.orderIds.length > 0);

      const isAlreadySubmittedFailure = (failure: ClaimBatchResult['failed_orders'][number]) =>
        /Already claimed or submitted|Already in batch/i.test(failure.reason || '');

      let totalSuccess = 0;
      const allFailedOrders: ClaimBatchResult['failed_orders'] = [...precheckFailedOrders];

      if (sanitizedGroups.length === 0) {
        queryClient.invalidateQueries({ queryKey: ['orders-paginated'] });
        queryClient.invalidateQueries({ queryKey: ['orders'] });
        queryClient.invalidateQueries({ queryKey: ['delivered-orders-fast-all'] });
        queryClient.invalidateQueries({ queryKey: ['delivered-summary'] });
        queryClient.invalidateQueries({ queryKey: ['delivered-summary-filtered'] });
        queryClient.invalidateQueries({ queryKey: ['claim-batches'] });

        if (allSkippedOrders.length > 0 && allFailedOrders.length === 0) {
          setSelectedIds(new Set());
          toast.info(`${allSkippedOrders.length} order(s) already submitted and were removed from the claim selection`);
        } else if (allFailedOrders.length > 0) {
          toast.error('No selected orders are currently claimable');
        }

        return {
          success_count: 0,
          skipped_count: allSkippedOrders.length,
          skipped_orders: allSkippedOrders,
          failed_count: allFailedOrders.length,
          failed_orders: allFailedOrders,
          error: allFailedOrders.length > 0 && allSkippedOrders.length === 0 ? 'No selected orders are currently claimable' : undefined,
        };
      }

      for (const group of sanitizedGroups) {
        const response = await supabase.functions.invoke('submit-bulk-claim', {
          body: {
            orderIds: group.orderIds,
            exchangeRate: group.exchangeRate,
            note: group.note,
          },
        });

        // Parse error response — supabase.functions.invoke may wrap non-2xx
        let data = response.data;
        if (response.error && !data) {
          // Try to extract JSON from FunctionsHttpError context
          try {
            const ctx = (response.error as any)?.context;
            if (ctx && typeof ctx.json === 'function') {
              data = await ctx.json();
            } else if (ctx && typeof ctx.text === 'function') {
              const text = await ctx.text();
              try { data = JSON.parse(text); } catch { /* not JSON */ }
            }
          } catch {
            // Fall through to generic error
          }
        }

        if (data?.success || data?.success_count > 0) {
          totalSuccess += data.success_count || data.orderCount || 0;
        }
        if (data?.failed_orders?.length > 0) {
          const responseFailures = data.failed_orders as ClaimBatchResult['failed_orders'];
          allSkippedOrders.push(...responseFailures.filter(isAlreadySubmittedFailure));
          allFailedOrders.push(...responseFailures.filter(failure => !isAlreadySubmittedFailure(failure)));
        }
        if (data?.skipped_orders?.length > 0) {
          allSkippedOrders.push(...(data.skipped_orders as ClaimBatchResult['skipped_orders']));
        }
        // If we got an error but no structured data at all
        if (!data?.success && !data?.failed_orders && (response.error || data?.error)) {
          const errorMsg = data?.error || getClaimErrorMessage(response.error, 'Failed to submit batch');
          // Enrich with local order data instead of showing "?"
          for (const oid of group.orderIds) {
            const local = orderLookup.get(oid);
            allFailedOrders.push({
              order_id: oid,
              order_code: local?.order_code || '?',
              customer_name: local?.customer_name || '?',
              area: local?.area || null,
              reason: errorMsg,
            });
          }
        }
      }

      // Invalidate queries regardless
      queryClient.invalidateQueries({ queryKey: ['orders-paginated'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      queryClient.invalidateQueries({ queryKey: ['delivered-orders-fast-all'] });
      queryClient.invalidateQueries({ queryKey: ['delivered-summary'] });
      queryClient.invalidateQueries({ queryKey: ['delivered-summary-filtered'] });
      queryClient.invalidateQueries({ queryKey: ['claim-batches'] });

      // Show summary toast
      if (totalSuccess > 0) {
        toast.success(`${totalSuccess} order(s) claimed successfully`);
      }
      if (allSkippedOrders.length > 0) {
        toast.info(`${allSkippedOrders.length} already-submitted order(s) were skipped`);
      }
      if ((totalSuccess > 0 || allSkippedOrders.length > 0) && allFailedOrders.length === 0) {
        // Full success — clear selection and close dialog
        setSelectedIds(new Set());
      }

      return {
        success_count: totalSuccess,
        skipped_count: allSkippedOrders.length,
        skipped_orders: allSkippedOrders,
        failed_count: allFailedOrders.length,
        failed_orders: allFailedOrders,
      };
    } catch (error) {
      console.error('Grouped bulk claim error:', error);
      return {
        success_count: 0,
        failed_count: 0,
        failed_orders: [],
        error: getClaimErrorMessage(error),
      };
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

  // Use valid areas from database for filter options
  const { data: validAreas = [] } = useValidAreas();
  const areaOptions = useMemo(() => {
    return validAreas.sort().map(area => ({ label: area, value: area }));
  }, [validAreas]);

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

  // --- SKU Code Helpers ---
  // Normalize SKU code for consistent comparison
  const normalizeSku = useCallback((code: string | null | undefined): string => {
    return (code || '').trim().toUpperCase();
  }, []);

  // Extract SKU code from sku_label like "TY01/ROSE" -> "TY01"
  const extractSkuCodeFromLabel = useCallback((label: string | null | undefined): string => {
    if (!label) return '';
    // Split by "/" or " / " or " - " and take first part
    const parts = label.split(/[\/-]/);
    return parts[0]?.trim() || label.trim();
  }, []);

  // Get normalized SKU code from an order item
  const getItemSkuCode = useCallback((item: any): string => {
    // Prefer product.sku_code, fallback to extracting from sku_label
    const code = item.product?.sku_code || extractSkuCodeFromLabel(item.sku_label);
    return normalizeSku(code);
  }, [normalizeSku, extractSkuCodeFromLabel]);

  // Build SKU code -> display name map from products AND delivered order items
  const skuCodeMap = useMemo(() => {
    const map = new Map<string, string>(); // skuCode -> display name

    // Add from products catalog
    products.forEach(p => {
      const code = normalizeSku(p.sku_code);
      if (code && !map.has(code)) {
        map.set(code, p.sku_name || code);
      }
    });

    // Also extract from delivered order items (in case product not in catalog)
    rpcOrdersMapped?.filter(o => o.runner_status === 'DELIVERED').forEach(order => {
      order.order_items?.forEach(item => {
        const code = getItemSkuCode(item);
        if (code && !map.has(code)) {
          // Use sku_label as display name if available
          map.set(code, item.sku_label || code);
        }
      });
    });

    return map;
  }, [products, rpcOrdersMapped, normalizeSku, getItemSkuCode]);

  // SKU filter options - deduped by SKU code (not product ID)
  const skuOptions = useMemo(() => {
    const options: { label: string; value: string; searchLabel: string }[] = [];
    
    skuCodeMap.forEach((displayName, skuCode) => {
      options.push({
        label: `${skuCode}${displayName && displayName !== skuCode ? ' / ' + displayName : ''}`,
        value: skuCode, // Use SKU code as value, not UUID
        searchLabel: `${skuCode} ${displayName}`,
      });
    });

    // Sort by SKU code
    return options.sort((a, b) => a.value.localeCompare(b.value));
  }, [skuCodeMap]);

  // Auto-reset invalid SKU filter (e.g., old UUID from previous session)
  useEffect(() => {
    if (skuFilter !== 'all' && skuOptions.length > 0) {
      const normalizedFilter = normalizeSku(skuFilter);
      const isValidOption = skuOptions.some(opt => opt.value === normalizedFilter);
      
      // If filter looks like a UUID (36 chars) or not in options, reset it
      const looksLikeUUID = skuFilter.length === 36 && skuFilter.includes('-');
      if (!isValidOption || looksLikeUUID) {
        setSkuFilter('all');
      }
    }
  }, [skuFilter, skuOptions, normalizeSku]);

  // SKU Summary - calculate total delivered qty for selected SKU (by SKU code)
  const skuSummary = useMemo(() => {
    if (skuFilter === 'all') return null;

    const normalizedFilter = normalizeSku(skuFilter);
    let totalQty = 0;
    let totalOrders = 0;
    let totalAmount = 0;

    allFilteredOrders.forEach(order => {
      const matchingItems = order.order_items?.filter(item =>
        getItemSkuCode(item) === normalizedFilter
      ) || [];
      if (matchingItems.length > 0) {
        totalOrders++;
        matchingItems.forEach(item => {
          totalQty += item.qty || 0;
          totalAmount += item.line_total || 0;
        });
      }
    });

    const displayName = skuCodeMap.get(normalizedFilter);

    return {
      skuName: displayName ? `${normalizedFilter} / ${displayName}` : normalizedFilter,
      totalQty,
      totalOrders,
      totalAmount,
    };
  }, [skuFilter, allFilteredOrders, skuCodeMap, normalizeSku, getItemSkuCode]);

  const allClaimableSelected = claimableOrders.length > 0 && selectedClaimableOrders.length === claimableOrders.length;

  // Build a map of order_id -> batch reference for showing claim batch info
  const orderToBatchRef = useMemo(() => {
    const map = new Map<string, { batchCode: string; submittedAt: string }>();
    for (const batch of claimBatches) {
      for (const item of batch.items || []) {
        map.set(item.order_id, {
          batchCode: (batch as any).batch_code || batch.id.slice(0, 8).toUpperCase(),
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
      <div className="space-y-5">
        {/* Hero Header */}
        <PageHero
          icon={<CheckCircle className="h-6 w-6 text-[hsl(var(--status-success))]" />}
          title="Delivered Orders"
          subtitle={`${dateRange.label} • ${pagination.totalCount.toLocaleString()} orders total`}
          image={capybaraRunner}
          imageAlt="Runner capybara"
          actions={
            <div className="flex w-full min-w-0 flex-col gap-3 md:w-auto md:flex-row md:flex-wrap md:items-center md:gap-2">
              {(canExport || role === 'runner') && (
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
                      Export All ({allFilteredOrders.length})
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <TeamViewToggle
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                selectedMember={selectedMember}
                onMemberChange={setSelectedMember}
                className="w-full md:w-auto"
              />
              <DataScopeSelector value={dataSharingView} onChange={setDataSharingView} scope="delivered_orders" />
            </div>
          }
        >
          {/* Date Range Presets inside hero */}
          <DateRangePresets value={dateRange} onChange={setDateRange} />
        </PageHero>


        {/* Runner Earnings Dashboard - only for runners */}
        {role === 'runner' && (
          <RunnerEarningsDashboard
            earnings={runnerEarnings}
            isLoading={earningsLoading}
          />
        )}

        {/* Non-runner KPI Cards (Admin/Manager/Salesperson) */}
        {role !== 'runner' && (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            <Card className="relative overflow-hidden border-[hsl(var(--status-success)/0.3)] bg-gradient-to-br from-[hsl(var(--status-success)/0.1)] to-transparent">
              <div className="absolute top-0 right-0 w-20 h-20 bg-[hsl(var(--status-success)/0.08)] rounded-full -translate-y-1/2 translate-x-1/2" />
              <CardContent className="pt-5 pb-4 relative">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Total Delivered {hasActiveFilters && <span>(filtered)</span>}
                    </p>
                    {displaySummaryLoading ? (
                      <Skeleton className="h-9 w-20 mt-1" />
                    ) : (
                      <p className="text-3xl font-extrabold text-[hsl(var(--status-success))] tracking-tight mt-1">
                        {displaySummary?.total_delivered ?? 0}
                      </p>
                    )}
                  </div>
                  <div className="p-2.5 rounded-xl bg-[hsl(var(--status-success)/0.15)]">
                    <CheckCircle className="h-6 w-6 text-[hsl(var(--status-success))]" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-primary/30 bg-gradient-to-br from-primary/10 to-transparent">
              <div className="absolute top-0 right-0 w-20 h-20 bg-primary/8 rounded-full -translate-y-1/2 translate-x-1/2" />
              <CardContent className="pt-5 pb-4 relative">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Pending Claim {hasActiveFilters && <span>(filtered)</span>}
                    </p>
                    {displaySummaryLoading ? (
                      <Skeleton className="h-9 w-16 mt-1" />
                    ) : (
                      <p className="text-3xl font-extrabold text-primary tracking-tight mt-1">
                        {displaySummary?.pending_claim ?? 0}
                      </p>
                    )}
                  </div>
                  <div className="p-2.5 rounded-xl bg-primary/15">
                    <FileCheck className="h-6 w-6 text-primary" />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="relative overflow-hidden border-border/50 hover:border-primary/30 transition-colors">
              <div className="absolute top-0 right-0 w-20 h-20 bg-secondary/50 rounded-full -translate-y-1/2 translate-x-1/2" />
              <CardContent className="pt-5 pb-4 relative">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Total Value {hasActiveFilters && <span>(filtered)</span>}
                    </p>
                    {displaySummaryLoading ? (
                      <Skeleton className="h-9 w-28 mt-1" />
                    ) : (
                      <p className="text-3xl font-extrabold tracking-tight mt-1">
                        {formatBND(displaySummary?.total_amount ?? 0)}
                      </p>
                    )}
                  </div>
                  <div className="p-2.5 rounded-xl bg-secondary/50">
                    <DollarSign className="h-6 w-6 text-muted-foreground" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Auto Claim Suggestion - only for runners */}
        {canClaim && claimableOrders.length > 0 && (
          <AutoClaimSuggestion
            claimableOrders={claimableOrders}
            invalidAreaOrders={invalidAreaOrders}
            approvedChargeMap={approvedChargeMap}
            onClaimAll={() => {
              setSelectedIds(new Set(claimableOrders.map(o => o.id)));
              setBulkClaimOpen(true);
            }}
          />
        )}

        {/* Earnings Chart - only for runners, collapsible */}
        {role === 'runner' && (
          <Collapsible defaultOpen={false}>
            <CollapsibleTrigger asChild>
              <Card className="cursor-pointer hover:bg-muted/30 transition-colors">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-primary" />
                    <span className="text-sm font-semibold">Earnings Overview Chart</span>
                  </div>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <EarningsChart runnerId={user?.id} />
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:gap-4">
              <div className="flex-1 min-w-0 md:min-w-[200px]">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search order code..."
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
                
                {/* User filter - All roles (Admin/Manager/Runner) - Multi-select */}
                <SearchableMultiSelect
                  options={salespersonOptions}
                  values={salespersonFilters}
                  onValuesChange={setSalespersonFilters}
                  placeholder="All Users"
                  searchPlaceholder="Search users..."
                  allLabel="All Users"
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
              {/* Warning when no results found and no user selected - SKU filter is client-side limited */}
              {skuSummary.totalOrders === 0 && salespersonFilters.length === 0 && isAdminOrManager && (
                <div className="mt-4 flex items-start gap-2 p-3 rounded-md bg-amber-500/10 border border-amber-500/30 text-sm">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <span className="text-muted-foreground">
                    No matching orders found in current view. Try selecting a specific user to see their orders with this SKU.
                  </span>
                </div>
              )}
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
                selectedCount={selectedClaimableOrders.length}
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
              paginatedOrders.map((order) => {
                const isClaimable = isOrderClaimable(order);
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
                    areaBadge={
                      <div className="flex items-center gap-1">
                        {order.area && <Badge variant="outline" className="text-xs">{order.area}</Badge>}
                        {order.status === 'CANCELLED' && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Cancelled</Badge>}
                      </div>
                    }
                    statusBadge={
                      <ClaimEligibilityBadge order={order} approvedChargeMap={approvedChargeMap} canClaim={canClaim} />
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
                      ...(canClaim ? [{
                        label: 'Earning',
                        value: (() => {
                          const area = order.area?.toLowerCase() || '';
                          const fee = approvedChargeMap[area];
                          return fee !== undefined ? formatBND(fee) : '-';
                        })(),
                      }] : []),
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
                      ...(batchRef ? [{ label: 'Batch Ref', value: batchRef.batchCode }] : []),
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
                      {canExport && (
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
                      {canClaim && <TableHead>Earning</TableHead>}
                      <TableHead>Payment</TableHead>
                      <TableHead>Runner</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Salesperson</TableHead>
                      <TableHead>Delivered</TableHead>
                      <TableHead>Claim Batch</TableHead>
                      <TableHead>Claim Status</TableHead>
                      {canClaim && <TableHead>Action</TableHead>}
                      {isAdmin && <TableHead>Admin</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={16 + (canExport ? 1 : 0) + (canClaim ? 2 : 0) + (isAdmin ? 1 : 0)} className="text-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : deliveredOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={16 + (canExport ? 1 : 0) + (canClaim ? 2 : 0) + (isAdmin ? 1 : 0)} className="text-center py-8 text-muted-foreground">
                          <div className="flex flex-col items-center gap-2">
                            <span>No delivered orders found</span>
                            {hasActiveFilters && (
                              <Button 
                                variant="outline" 
                                size="sm"
                                onClick={clearAllFilters}
                              >
                                Clear All Filters
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      paginatedOrders.map((order) => {
                        const isClaimable = isOrderClaimable(order);
                        const isInvalidArea = canClaim && order.reconciliation_status === 'NOT_CLAIMED' && (!orderHasValidAreaRate(order) || !order.delivered_at);
                        const isSelected = selectedIds.has(order.id);
                        const isExportSelected = exportSelectedIds.has(order.id);
                        const { displayText, fullText, hasError, errorMessage } = formatOrderItemsDisplay(order.order_items);
                        // Use snapshot name if profile is missing/inactive
                        const salespersonDisplayName = order.salesperson?.display_name || (order as any).created_by_name_snapshot || 'Deleted User';

                        return (
                          <TableRow key={order.id} data-order-id={order.id} className={cn(
                            isSelected || isExportSelected ? 'bg-primary/5' : '',
                            highlightOrderId === order.id && 'ring-2 ring-yellow-400/60 bg-yellow-50/50 dark:bg-yellow-900/10 animate-pulse'
                          )}>
                            {canExport && (
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
                                ) : isInvalidArea ? (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <div className="flex flex-col items-center gap-0.5">
                                          <Checkbox disabled checked={false} className="opacity-30" />
                                          <span className="text-[10px] text-destructive leading-tight whitespace-nowrap">No rate</span>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>No approved delivery charge for area "{order.area}". Submit a delivery charge proposal first.</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                ) : (
                                  <Checkbox disabled checked={false} className="opacity-30" />
                                )}
                              </TableCell>
                            )}
                            <TableCell>{format(new Date(order.created_at), 'MMM dd, HH:mm')}</TableCell>
                            <TableCell>
                              <span className="font-mono text-sm">{order.order_code}</span>
                              {order.status === 'CANCELLED' && (
                                <Badge variant="destructive" className="ml-1.5 text-[10px] px-1.5 py-0">Cancelled</Badge>
                              )}
                            </TableCell>
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
                            {canClaim && (
                              <TableCell>
                                {(() => {
                                  const area = order.area?.toLowerCase() || '';
                                  const fee = approvedChargeMap[area];
                                  return fee !== undefined ? (
                                    <Badge className="bg-[hsl(var(--status-success)/0.15)] text-[hsl(var(--status-success))] border border-[hsl(var(--status-success)/0.3)] font-semibold">
                                      <Banknote className="h-3 w-3 mr-1" />
                                      {formatBND(fee, false)}
                                    </Badge>
                                  ) : (
                                    <span className="text-xs text-muted-foreground">-</span>
                                  );
                                })()}
                              </TableCell>
                            )}
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
                              {orderToBatchRef.has(order.id) ? (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="font-mono text-xs bg-muted px-2 py-1 rounded cursor-help">
                                        {orderToBatchRef.get(order.id)?.batchCode}
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
                            <TableCell>
                              <ClaimEligibilityBadge order={order} approvedChargeMap={approvedChargeMap} canClaim={canClaim} />
                            </TableCell>
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

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <Card className="mt-4">
            <CardContent className="py-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-muted-foreground">
                  Showing {startIndex + 1}–{Math.min(startIndex + deliveredOrders.length, pagination.totalCount)} of {pagination.totalCount.toLocaleString()} orders
                </p>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                        className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                    {getPageNumbers(currentPage, totalPages).map((page, i) => (
                      page === '...' ? (
                        <PaginationItem key={`ellipsis-${i}`}>
                          <PaginationEllipsis />
                        </PaginationItem>
                      ) : (
                        <PaginationItem key={page}>
                          <PaginationLink
                            onClick={() => setCurrentPage(page as number)}
                            isActive={currentPage === page}
                            className="cursor-pointer"
                          >
                            {page}
                          </PaginationLink>
                        </PaginationItem>
                      )
                    ))}
                    <PaginationItem>
                      <PaginationNext
                        onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                        className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bulk Claim Dialog — User-Grouped */}
        <UserGroupedBulkClaimDialog
          open={bulkClaimOpen}
          onOpenChange={setBulkClaimOpen}
          orders={selectedClaimableOrders}
          onSubmitBatches={handleGroupedClaimSubmit}
          isSubmitting={isSubmitting}
          onRemoveInvalidOrders={(invalidIds) => {
            setSelectedIds(prev => {
              const next = new Set(prev);
              invalidIds.forEach(id => next.delete(id));
              return next;
            });
          }}
          onNavigateToCharges={() => navigate('/runner/delivery-charges')}
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
