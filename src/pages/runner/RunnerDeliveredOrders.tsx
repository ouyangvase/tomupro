import { useState, useMemo, useCallback, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { SearchableMultiSelect } from '@/components/ui/searchable-multi-select';
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
import { useDeliveredSummaryFiltered } from '@/hooks/useDeliveredOrders';
import { Skeleton } from '@/components/ui/skeleton';
import { formatOrderItemsDisplay } from '@/lib/orderItemsDisplay';
import { format } from 'date-fns';
import type { Order, ReconciliationStatus } from '@/types/database';
import { CheckCircle, Search, Send, Loader2, ChevronDown, ChevronUp, Package, Users, Phone, Download, Undo2, AlertTriangle, Shield, DollarSign, FileCheck } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DateRangePresets, useDateRangeState, type DateRange } from '@/components/filters/DateRangePresets';
import { PageHero } from '@/components/dashboard/PageHero';
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
const PAGE_SIZE = 30;

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
  const navigate = useNavigate();
  
  // Approved delivery charges map for the runner (area -> charge_amount)
  const { data: approvedChargeMap = {} } = useApprovedChargeMap();
  
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
  const [salespersonFilters, setSalespersonFilters] = useState<string[]>([]);
  const [skuFilter, setSkuFilter] = useState('all');
  const [claimStatusFilter, setClaimStatusFilter] = useState<ClaimStatusFilter>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [exportSelectedIds, setExportSelectedIds] = useState<Set<string>>(new Set());
  const [bulkClaimOpen, setBulkClaimOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [integrityPanelOpen, setIntegrityPanelOpen] = useState(false);
  const { dateRange, setDateRange } = useDateRangeState();
  
  // Fetch orders based on role and view mode:
  // - Runner: fetch their own orders (runner_id = user.id), with optional salesperson filter
  // - Salesperson: fetch their own orders (salesperson_id = user.id)
  // - Manager: fetch based on view mode (my data vs team data)
  // - Admin: fetch all orders, with optional salesperson filter applied SERVER-SIDE
  // CRITICAL: Admin must filter server-side to avoid 2000 row truncation bug
  // NOTE: Search and area are now applied server-side to work across all orders, not just first 2000
  const ordersFilter = useMemo(() => {
    // Always filter for DELIVERED status at database level for performance
    const baseFilter: { 
      runnerStatus: 'DELIVERED'; 
      searchQuery?: string;
      areaFilter?: string;
    } = { 
      runnerStatus: 'DELIVERED' as const 
    };
    
    // Apply search server-side for better filtering on large datasets
    if (searchQuery.trim()) {
      baseFilter.searchQuery = searchQuery.trim();
    }
    
    // Apply area filter server-side
    if (areaFilter !== 'all') {
      baseFilter.areaFilter = areaFilter;
    }
    
    if (role === 'runner') {
      const runnerFilter = { ...baseFilter, runnerId: user?.id };
      if (salespersonFilters.length > 0) {
        return { ...runnerFilter, salespersonIds: salespersonFilters };
      }
      return runnerFilter;
    }
    if (role === 'salesperson') {
      return { ...baseFilter, salespersonId: user?.id };
    }
    if (role === 'manager') {
      if (salespersonFilters.length > 0) {
        return { ...baseFilter, salespersonIds: salespersonFilters };
      }
      if (salespersonIds && salespersonIds.length > 0) {
        return { ...baseFilter, salespersonIds };
      }
      return baseFilter;
    }
    // Admin: apply salesperson filter SERVER-SIDE to avoid truncation bug
    if (role === 'admin' && salespersonFilters.length > 0) {
      return { ...baseFilter, salespersonIds: salespersonFilters };
    }
    return baseFilter; // admin no filter - fetch all delivered
  }, [role, user?.id, salespersonIds, salespersonFilters, searchQuery, areaFilter]);
  
  const { data: orders, isLoading } = useOrders(ordersFilter as any);
  const { data: userDirectory = [] } = useUserDirectory();
  const { data: myDrivers = [] } = useMyDrivers();
  const { data: products = [] } = useProducts();
  // Only fetch claim batches for runner role (they're the ones who claim)
  // Fetch claim batches for all roles - batch ref column is visible to everyone
  const { data: claimBatches = [] } = useClaimBatches(role === 'runner' ? { runnerId: user?.id } : {});
  
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
  
  // Build server-side summary params that include ALL active filters
  // This ensures KPIs are always accurate, even beyond the 2000-row table limit
  const summaryParams = useMemo(() => {
    const params: {
      runnerId?: string;
      salespersonId?: string;
      salespersonIds?: string[];
      search?: string;
      area?: string;
      claimStatus?: string;
      driverId?: string;
      skuCode?: string;
    } = {};

    // Role-based filters
    if (role === 'runner') {
      params.runnerId = user?.id;
    } else if (role === 'salesperson') {
      params.salespersonId = user?.id;
    } else if (role === 'manager') {
      if (salespersonFilters.length > 0) {
        params.salespersonIds = salespersonFilters;
      } else if (salespersonIds && salespersonIds.length > 0) {
        params.salespersonIds = salespersonIds;
      }
    } else if (role === 'admin' && salespersonFilters.length > 0) {
      params.salespersonIds = salespersonFilters;
    }

    // Runner role salesperson filter (applied server-side)
    if (role === 'runner' && salespersonFilters.length > 0) {
      params.salespersonIds = salespersonFilters;
    }

    // All filter params for accurate server-side aggregation
    if (searchQuery.trim()) params.search = searchQuery.trim();
    if (areaFilter !== 'all') params.area = areaFilter;
    if (claimStatusFilter !== 'all') params.claimStatus = claimStatusFilter;
    if (driverFilter !== 'all') params.driverId = driverFilter;
    if (skuFilter !== 'all') params.skuCode = skuFilter;

    return params;
  }, [role, user?.id, salespersonIds, salespersonFilters, searchQuery, areaFilter, claimStatusFilter, driverFilter, skuFilter]);
  
  // Fetch accurate summary stats from server with ALL filters applied
  const { data: summary, isLoading: summaryLoading } = useDeliveredSummaryFiltered(summaryParams);
  
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
  // NOTE: Search and area filters are now server-side for performance
  const deliveredOrders = useMemo(() => {
    if (!orders) return [];
    
    let filtered = orders.filter(order => 
      order.runner_status === 'DELIVERED' && order.status !== 'CANCELLED'
    );

    // Search and area are now filtered server-side - no need to duplicate here

    // Apply driver filter (still client-side as it's less critical)
    if (driverFilter !== 'all') {
      filtered = filtered.filter(order => order.driver_id === driverFilter);
    }

    // Apply salesperson filter client-side ONLY for runner role
    // (admin and manager now filter server-side to avoid truncation)
    if (salespersonFilters.length > 0 && role === 'runner') {
      filtered = filtered.filter(order => order.salesperson_id && salespersonFilters.includes(order.salesperson_id));
    }

    // Apply SKU filter (by SKU code, not product ID)
    // Note: SKU filter is still client-side as it requires order_items join
    if (skuFilter !== 'all') {
      const normalizedFilter = skuFilter.trim().toUpperCase();
      filtered = filtered.filter(order => 
        order.order_items?.some(item => {
          // Get SKU code from product or extract from sku_label
          const itemCode = (item.product?.sku_code || item.sku_label?.split(/[\/-]/)[0] || '').trim().toUpperCase();
          return itemCode === normalizedFilter;
        })
      );
    }

    // Apply claim status filter
    if (claimStatusFilter !== 'all') {
      filtered = filtered.filter(order => matchesClaimStatusFilter(order.reconciliation_status, claimStatusFilter));
    }

    return filtered;
  }, [orders, driverFilter, salespersonFilters, skuFilter, claimStatusFilter, role]);

  // Detect if any filters are active (for UI labels)
  const hasActiveFilters = useMemo(() => {
    return (
      searchQuery.trim() !== '' ||
      areaFilter !== 'all' ||
      driverFilter !== 'all' ||
      salespersonFilters.length > 0 ||
      skuFilter !== 'all' ||
      claimStatusFilter !== 'all'
    );
  }, [searchQuery, areaFilter, driverFilter, salespersonFilters, skuFilter, claimStatusFilter]);

  // Detect if data might be truncated by the 2000-row query limit
  const QUERY_LIMIT = 2000;
  const isDataTruncated = useMemo(() => {
    if (!orders) return false;
    return orders.length >= QUERY_LIMIT;
  }, [orders]);

  // Always use server-side summary for KPIs (accurate, no truncation)
  const displaySummary = summary;
  const displaySummaryLoading = summaryLoading;

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(deliveredOrders.length / PAGE_SIZE));
  const startIndex = (currentPage - 1) * PAGE_SIZE;
  const endIndex = startIndex + PAGE_SIZE;
  const paginatedOrders = deliveredOrders.slice(startIndex, endIndex);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, areaFilter, driverFilter, salespersonFilters, skuFilter, claimStatusFilter]);

  // Clear filters helper
  const clearAllFilters = useCallback(() => {
    setSearchQuery('');
    setAreaFilter('all');
    setDriverFilter('all');
    setSalespersonFilters([]);
    setSkuFilter('all');
    setClaimStatusFilter('all');
  }, []);

  // Clamp current page if it exceeds total pages
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [currentPage, totalPages]);

  // Check if an order has a valid approved delivery charge for its area
  const orderHasValidAreaRate = useCallback((order: Order): boolean => {
    if (!order.area) return true; // No area = no charge needed
    const area = order.area.toLowerCase();
    return approvedChargeMap[area] !== undefined;
  }, [approvedChargeMap]);

  // Orders eligible for claiming (DELIVERED + NOT_CLAIMED + valid area rate) - only relevant for runners
  const claimableOrders = useMemo(() => {
    if (!canClaim) return [];
    return deliveredOrders.filter(o => 
      o.reconciliation_status === 'NOT_CLAIMED' && orderHasValidAreaRate(o)
    );
  }, [deliveredOrders, canClaim, orderHasValidAreaRate]);

  // Orders that are NOT_CLAIMED but have invalid area (for display purposes)
  const invalidAreaOrders = useMemo(() => {
    if (!canClaim) return [];
    return deliveredOrders.filter(o => 
      o.reconciliation_status === 'NOT_CLAIMED' && !orderHasValidAreaRate(o)
    );
  }, [deliveredOrders, canClaim, orderHasValidAreaRate]);

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
    const selectedOrders = deliveredOrders.filter(o => exportSelectedIds.has(o.id));
    exportDeliveredOrderLines(selectedOrders, deliveryChargesMap, 'delivered_orders_selected');
    toast.success(`Exported ${exportSelectedIds.size} order(s)`);
  }, [deliveredOrders, exportSelectedIds, deliveryChargesMap]);

  const handleExportAll = useCallback(() => {
    if (deliveredOrders.length === 0) {
      toast.error('No orders to export');
      return;
    }
    exportDeliveredOrderLines(deliveredOrders, deliveryChargesMap, 'delivered_orders_all');
    toast.success(`Exported ${deliveredOrders.length} order(s)`);
  }, [deliveredOrders, deliveryChargesMap]);

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
    orders?.filter(o => o.runner_status === 'DELIVERED').forEach(order => {
      order.order_items?.forEach(item => {
        const code = getItemSkuCode(item);
        if (code && !map.has(code)) {
          // Use sku_label as display name if available
          map.set(code, item.sku_label || code);
        }
      });
    });

    return map;
  }, [products, orders, normalizeSku, getItemSkuCode]);

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
    
    deliveredOrders.forEach(order => {
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
  }, [skuFilter, deliveredOrders, skuCodeMap, normalizeSku, getItemSkuCode]);

  const allClaimableSelected = claimableOrders.length > 0 && selectedIds.size === claimableOrders.length;

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

  // Admin Integrity Check - count orders with missing salesperson_id
  const integrityStats = useMemo(() => {
    if (role !== 'admin' || !orders) return null;
    
    const allDelivered = orders.filter(o => o.runner_status === 'DELIVERED');
    const missingLink = allDelivered.filter(o => !o.salesperson_id);
    
    // Calculate what filter should return
    let selectedUserName = 'All Users';
    let expectedCount = allDelivered.length;
    
    if (salespersonFilters.length > 0) {
      const selectedUsers = salespersonOptions.filter(sp => salespersonFilters.includes(sp.value));
      selectedUserName = selectedUsers.map(u => u.label).join(', ') || salespersonFilters.join(', ');
      expectedCount = allDelivered.filter(o => o.salesperson_id && salespersonFilters.includes(o.salesperson_id)).length;
    }
    
    return {
      totalDelivered: allDelivered.length,
      missingLink: missingLink.length,
      filteredCount: deliveredOrders.length,
      expectedCount,
      selectedUserName,
      isMatch: deliveredOrders.length === expectedCount,
    };
  }, [role, orders, salespersonFilters, salespersonOptions, deliveredOrders]);

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

        {/* Data truncation warning - table may show fewer rows than KPI totals */}
        {isDataTruncated && (
          <Card className="border-yellow-500/50 bg-yellow-50 dark:bg-yellow-950/20">
            <CardContent className="p-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400 shrink-0" />
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                Table shows up to {QUERY_LIMIT} rows. KPI totals reflect all {summary?.total_delivered ?? '2000+'} delivered orders.
                Apply filters to narrow results.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Stats - Server-side aggregation with ALL filters for accurate totals */}
        <div className="grid gap-4 grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Delivered {hasActiveFilters && <span className="text-xs">(filtered)</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {displaySummaryLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold text-green-600">{displaySummary?.total_delivered ?? 0}</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Pending Claim {hasActiveFilters && <span className="text-xs">(filtered)</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {displaySummaryLoading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-2xl font-bold">{displaySummary?.pending_claim ?? 0}</div>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Value {hasActiveFilters && <span className="text-xs">(filtered)</span>}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {displaySummaryLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="text-2xl font-bold">{formatBND(displaySummary?.total_amount ?? 0)}</div>
              )}
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

        {/* Admin Data Integrity Panel - Only for Admin role */}
        {isAdmin && integrityStats && (
          <Collapsible open={integrityPanelOpen} onOpenChange={setIntegrityPanelOpen}>
            <Card className={`border ${integrityStats.missingLink > 0 ? 'border-destructive/50 bg-destructive/5' : 'border-muted'}`}>
              <CollapsibleTrigger asChild>
                <CardHeader className="pb-2 cursor-pointer hover:bg-muted/50 transition-colors">
                  <CardTitle className="flex items-center justify-between text-sm font-medium">
                    <span className="flex items-center gap-2">
                      <Shield className="h-4 w-4" />
                      Data Integrity Check
                      {integrityStats.missingLink > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {integrityStats.missingLink} unlinked
                        </Badge>
                      )}
                    </span>
                    {integrityPanelOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </CardTitle>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Total Delivered (DB)</p>
                      <p className="text-lg font-semibold">{integrityStats.totalDelivered}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Missing salesperson_id</p>
                      <p className={`text-lg font-semibold ${integrityStats.missingLink > 0 ? 'text-destructive' : 'text-green-600'}`}>
                        {integrityStats.missingLink}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Filter: {integrityStats.selectedUserName}</p>
                      <p className="text-lg font-semibold">{integrityStats.filteredCount} orders</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Filter Status</p>
                      {integrityStats.isMatch ? (
                        <p className="text-lg font-semibold text-green-600 flex items-center gap-1">
                          <CheckCircle className="h-4 w-4" /> Match
                        </p>
                      ) : (
                        <p className="text-lg font-semibold text-destructive flex items-center gap-1">
                          <AlertTriangle className="h-4 w-4" /> Mismatch
                        </p>
                      )}
                    </div>
                  </div>
                  {integrityStats.missingLink > 0 && (
                    <div className="mt-4 p-3 bg-destructive/10 rounded-md flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                      <div className="text-sm">
                        <p className="font-medium text-destructive">Unlinked orders detected</p>
                        <p className="text-muted-foreground">
                          {integrityStats.missingLink} delivered order(s) are missing salesperson_id. 
                          These orders may not appear correctly when filtering by user.
                        </p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
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
              paginatedOrders.map((order) => {
                const isClaimable = canClaim && order.reconciliation_status === 'NOT_CLAIMED' && orderHasValidAreaRate(order);
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
                      <TableHead>Claim Batch</TableHead>
                      <TableHead>Claim Status</TableHead>
                      {canClaim && <TableHead>Action</TableHead>}
                      {isAdmin && <TableHead>Admin</TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={16 + (isAdminOrManager ? 1 : 0) + (canClaim ? 2 : 0) + (isAdmin ? 1 : 0)} className="text-center py-8">
                          <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                        </TableCell>
                      </TableRow>
                    ) : deliveredOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={16 + (isAdminOrManager ? 1 : 0) + (canClaim ? 2 : 0) + (isAdmin ? 1 : 0)} className="text-center py-8 text-muted-foreground">
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
                        const isClaimable = canClaim && order.reconciliation_status === 'NOT_CLAIMED' && orderHasValidAreaRate(order);
                        const isInvalidArea = canClaim && order.reconciliation_status === 'NOT_CLAIMED' && !orderHasValidAreaRate(order);
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
                              <Badge className={claimStatusColors[order.reconciliation_status]}>
                                {claimStatusLabels[order.reconciliation_status]}
                              </Badge>
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
                  Showing {startIndex + 1}-{Math.min(endIndex, deliveredOrders.length)} of {deliveredOrders.length} orders
                </p>
                <Pagination>
                  <PaginationContent>
                    <PaginationItem>
                      <PaginationPrevious
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
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
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                      />
                    </PaginationItem>
                  </PaginationContent>
                </Pagination>
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
