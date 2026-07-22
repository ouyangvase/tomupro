import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO, isToday, isThisWeek, isThisMonth, differenceInDays } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { buildWhatsAppUrl } from '@/lib/phone';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { usePaginatedOrders } from '@/hooks/usePaginatedOrders';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { TeamViewToggle, useTeamViewState } from '@/components/filters/TeamViewToggle';
import { ActionResolutionDialog } from '@/components/sales/ActionResolutionDialog';
import { BulkActionResolutionDialog } from '@/components/sales/BulkActionResolutionDialog';
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter';
import { CapybaraState } from '@/components/dashboard/CapybaraState';
import { WhatsAppPhoneLinkCompact } from '@/components/orders/WhatsAppPhoneLink';
import { MobileOrderCard, MobileSelectAllCard } from '@/components/mobile/MobileOrderCard';
import { useIsMobile } from '@/hooks/use-mobile';
import capybaraCommandCenter from '@/assets/capybara-command-center.png';
import {
  AlertCircle, MessageSquare, Search, CalendarClock,
  Play, ListChecks, XCircle, Calendar, AlertTriangle, Flame,
  Phone, MapPin, User, ChevronRight, ChevronLeft, Clock,
  ShieldAlert, Eye, PhoneCall, CalendarPlus,
  UserPlus, CheckCircle2, HelpCircle, Lightbulb, Image as ImageIcon,
  Target, TrendingUp, Zap, Download
} from 'lucide-react';
import type { Order } from '@/types/database';
import { cn } from '@/lib/utils';
import { exportOrderLines } from '@/lib/csv';
import { toast } from 'sonner';
import { getSignedStorageUrl } from '@/lib/storageUrls';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

// ── Action source types & helpers ──
type ActionRequiredSource = 'FAILED_DELIVERY' | 'RESCHEDULED' | 'RUNNER_FLAGGED' | 'MANUAL';

const sourceColors: Record<ActionRequiredSource, string> = {
  FAILED_DELIVERY: 'bg-destructive/10 text-destructive border-destructive/20',
  RESCHEDULED: 'bg-[hsl(var(--status-pending)/0.1)] text-[hsl(var(--status-pending))] border-[hsl(var(--status-pending)/0.2)]',
  RUNNER_FLAGGED: 'bg-primary/10 text-primary border-primary/20',
  MANUAL: 'bg-[hsl(var(--status-neutral)/0.1)] text-[hsl(var(--status-neutral))] border-[hsl(var(--status-neutral)/0.2)]',
};

const sourceLabels: Record<ActionRequiredSource, string> = {
  FAILED_DELIVERY: 'Failed Delivery',
  RESCHEDULED: 'Rescheduled',
  RUNNER_FLAGGED: 'Runner Note',
  MANUAL: 'Manual Flag',
};

function getActionSource(order: Order): ActionRequiredSource | null {
  const runnerStatus = order.runner_status as string;
  if (runnerStatus === 'FAILED_DELIVERY') return 'FAILED_DELIVERY';
  if (order.next_delivery_date) return 'RESCHEDULED';
  if (order.runner_failed_reason_id || order.runner_comment) return 'RUNNER_FLAGGED';
  return 'MANUAL';
}

function needsSalespersonAction(order: Order): boolean {
  if (order.salesperson_action_required === true) return true;
  const runnerStatus = order.runner_status as string;
  const orderStatus = order.status as string;
  if (runnerStatus === 'FAILED_DELIVERY' && orderStatus !== 'CANCELLED') return true;
  return false;
}

function getOrderPriority(order: Order): 'high' | 'medium' | 'low' {
  // Priority based on how many days the order has been pending action
  const refDate = order.updated_at || order.created_at;
  const daysPending = differenceInDays(new Date(), new Date(refDate));
  if (daysPending >= 7) return 'high';
  if (daysPending >= 3) return 'medium';
  return 'low';
}

const priorityConfig = {
  high: { label: 'Over 7 days', color: 'bg-destructive/10 text-destructive border-destructive/30', dot: 'bg-destructive' },
  medium: { label: 'Over 3 days', color: 'bg-[hsl(var(--status-warning)/0.1)] text-[hsl(var(--status-warning))] border-[hsl(var(--status-warning)/0.3)]', dot: 'bg-[hsl(var(--status-warning))]' },
  low: { label: 'Under 3 days', color: 'bg-primary/10 text-primary border-primary/30', dot: 'bg-primary' },
};

type TimeFilter = 'all' | 'today' | 'week' | 'month';

// ── Workflow step component ──
interface DeliveryProof {
  id: string;
  order_id: string | null;
  signedUrl: string;
  uploaded_at: string;
}

function DeliveryProofPreview({ proofs, compact = false }: { proofs: DeliveryProof[]; compact?: boolean }) {
  if (proofs.length === 0) {
    return <span className="text-xs text-muted-foreground">-</span>;
  }

  if (compact) {
    return (
      <div className="flex items-center gap-1.5">
        {proofs.slice(0, 2).map((proof) => (
          <a
            key={proof.id}
            href={proof.signedUrl}
            target="_blank"
            rel="noreferrer"
            className="block h-10 w-10 overflow-hidden rounded-lg border bg-muted"
            onClick={(event) => event.stopPropagation()}
            title="Open delivery proof"
          >
            <img src={proof.signedUrl} alt="Delivery proof" className="h-full w-full object-cover" />
          </a>
        ))}
        {proofs.length > 2 && (
          <span className="text-xs font-medium text-muted-foreground">+{proofs.length - 2}</span>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <ImageIcon className="h-3.5 w-3.5" />
        Driver proof
      </div>
      <div className="grid grid-cols-3 gap-2">
        {proofs.slice(0, 3).map((proof) => (
          <a
            key={proof.id}
            href={proof.signedUrl}
            target="_blank"
            rel="noreferrer"
            className="block aspect-square overflow-hidden rounded-xl border bg-muted"
            onClick={(event) => event.stopPropagation()}
          >
            <img src={proof.signedUrl} alt="Delivery proof" className="h-full w-full object-cover" />
          </a>
        ))}
      </div>
    </div>
  );
}

function WorkflowStep({ step, icon, title, desc, active }: { step: number; icon: React.ReactNode; title: string; desc: string; active?: boolean }) {
  return (
    <div className={cn(
      "flex items-start gap-3 p-3 rounded-xl border transition-all",
      active ? "border-primary/40 bg-primary/5 shadow-sm" : "border-border/50 bg-card"
    )}>
      <div className={cn(
        "flex items-center justify-center h-8 w-8 rounded-full text-sm font-bold shrink-0",
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      )}>
        {step}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-sm font-semibold">{title}</span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

// ── Main component ──
export default function SalespersonActionInbox({ highlightOrderId }: { highlightOrderId?: string | null }) {
  const navigate = useNavigate();
  const { profile, role } = useAuth();
  const isMobile = useIsMobile();
  const containerRef = useRef<HTMLDivElement>(null);

  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [salespersonFilter, setSalespersonFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [showGuide, setShowGuide] = useState(false);

  // Scroll to highlighted order and auto-select it
  useEffect(() => {
    if (highlightOrderId) {
      const timer = setTimeout(() => {
        const el = containerRef.current?.querySelector(`[data-order-id="${highlightOrderId}"]`)
          || document.querySelector(`[data-order-id="${highlightOrderId}"]`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        // Auto-select the highlighted order
        setSelectedRows(new Set([highlightOrderId]));
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [highlightOrderId]);

  const { viewMode, setViewMode, selectedMember, setSelectedMember, isManager } = useTeamViewState(
    // Default to 'team' for managers so OCC matches Team Alerts count
    role === 'manager' ? 'team' : 'my'
  );
  const { data: teamMembers = [] } = useTeamMembers();
  const teamMemberIds = useMemo(() => teamMembers.map(m => m.id), [teamMembers]);

  // Fetch visible owner IDs for managers (shared cache)
  const { data: visibleOwnerIds } = useQuery({
    queryKey: ['visible-owner-ids', profile?.id],
    queryFn: async () => {
      const { getVisibleOwnerIdsCached } = await import('@/lib/visibleOwnerIdsCache');
      return getVisibleOwnerIdsCached();
    },
    enabled: !!profile?.id && role === 'manager',
    staleTime: 60000,
  });

  // Build server-side filters for action-required orders
  const orderFilters = useMemo(() => {
    const filters: Parameters<typeof usePaginatedOrders>[0] = { actionRequired: true };

    // For salesperson: explicitly filter server-side
    if (role === 'salesperson' && profile?.id) {
      filters.salespersonId = profile.id;
    } else if (role === 'manager' && profile?.id) {
      // Manager: use explicit salesperson filter based on view mode
      if (viewMode === 'my') {
        filters.salespersonIds = [profile.id];
      } else if (selectedMember !== 'all') {
        filters.salespersonIds = [selectedMember];
      } else if (salespersonFilter !== 'all') {
        filters.salespersonIds = [salespersonFilter];
      } else if (visibleOwnerIds && visibleOwnerIds.length > 0) {
        filters.salespersonIds = visibleOwnerIds;
      }
    } else if (role === 'admin' && salespersonFilter !== 'all') {
      filters.salespersonId = salespersonFilter;
    }
    // Admin: no salesperson filter needed (sees all)

    // Pass search to server-side
    if (searchQuery.trim()) {
      filters.searchQuery = searchQuery.trim();
    }

    return filters;
  }, [role, profile?.id, viewMode, selectedMember, salespersonFilter, visibleOwnerIds, searchQuery]);

  const { data: allOrders = [], isFetching, pagination, setPage, setPageSize, refetch } = usePaginatedOrders(orderFilters, 50);

  const canViewAll = role === 'admin';
  const canViewGroup = role === 'manager';

  // ── Server-side stats query (accurate totals across all pages) ──
  // Uses head:true count queries — no row limit, no client-side iteration
  const { data: serverStats } = useQuery({
    queryKey: ['action-required-stats', orderFilters.salespersonId, orderFilters.salespersonIds],
    queryFn: async () => {
      // Helper: build a base query with the action-required filter + salesperson scope
      const buildBase = () => {
        let q = supabase.from('orders').select('id', { count: 'exact', head: true });
        q = q.or('and(salesperson_action_required.eq.true,runner_status.neq.DELIVERED),and(runner_status.eq.FAILED_DELIVERY,status.eq.READY)');
        q = q.neq('status', 'CANCELLED');
        if (orderFilters.salespersonId) q = q.eq('salesperson_id', orderFilters.salespersonId);
        if (orderFilters.salespersonIds && orderFilters.salespersonIds.length > 0) q = q.in('salesperson_id', orderFilters.salespersonIds);
        return q;
      };

      // Run all count queries in parallel
      const [totalRes, failedRes, rescheduledRes, flaggedRes, highPriorityRes] = await Promise.all([
        // Total action-required
        buildBase().then(r => r.count || 0),
        // Failed deliveries (runner_status=FAILED_DELIVERY AND status=READY)
        (() => {
          let q = supabase.from('orders').select('id', { count: 'exact', head: true });
          q = q.eq('runner_status', 'FAILED_DELIVERY').eq('status', 'READY');
          if (orderFilters.salespersonId) q = q.eq('salesperson_id', orderFilters.salespersonId);
          if (orderFilters.salespersonIds && orderFilters.salespersonIds.length > 0) q = q.in('salesperson_id', orderFilters.salespersonIds);
          return q.then(r => r.count || 0);
        })(),
        // Rescheduled (has next_delivery_date, action required, not failed delivery)
        (() => {
          let q = supabase.from('orders').select('id', { count: 'exact', head: true });
          q = q.eq('salesperson_action_required', true).neq('runner_status', 'DELIVERED').neq('runner_status', 'FAILED_DELIVERY');
          q = q.neq('status', 'CANCELLED').not('next_delivery_date', 'is', null);
          if (orderFilters.salespersonId) q = q.eq('salesperson_id', orderFilters.salespersonId);
          if (orderFilters.salespersonIds && orderFilters.salespersonIds.length > 0) q = q.in('salesperson_id', orderFilters.salespersonIds);
          return q.then(r => r.count || 0);
        })(),
        // Runner flagged (has runner comment/reason, not failed delivery, not rescheduled)
        (() => {
          let q = supabase.from('orders').select('id', { count: 'exact', head: true });
          q = q.eq('salesperson_action_required', true).neq('runner_status', 'DELIVERED').neq('runner_status', 'FAILED_DELIVERY');
          q = q.neq('status', 'CANCELLED').is('next_delivery_date', null);
          q = q.or('runner_failed_reason_id.not.is.null,runner_comment.not.is.null');
          if (orderFilters.salespersonId) q = q.eq('salesperson_id', orderFilters.salespersonId);
          if (orderFilters.salespersonIds && orderFilters.salespersonIds.length > 0) q = q.in('salesperson_id', orderFilters.salespersonIds);
          return q.then(r => r.count || 0);
        })(),
        // Over 7 days (updated_at >= 7 days ago)
        (() => {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
          let q = supabase.from('orders').select('id', { count: 'exact', head: true });
          q = q.or('and(salesperson_action_required.eq.true,runner_status.neq.DELIVERED),and(runner_status.eq.FAILED_DELIVERY,status.eq.READY)');
          q = q.neq('status', 'CANCELLED').lte('updated_at', sevenDaysAgo.toISOString());
          if (orderFilters.salespersonId) q = q.eq('salesperson_id', orderFilters.salespersonId);
          if (orderFilters.salespersonIds && orderFilters.salespersonIds.length > 0) q = q.in('salesperson_id', orderFilters.salespersonIds);
          return q.then(r => r.count || 0);
        })(),
      ]);

      return {
        total: totalRes as number,
        failed: failedRes as number,
        rescheduled: rescheduledRes as number,
        flagged: flaggedRes as number,
        highPriority: highPriorityRes as number,
      };
    },
    staleTime: 30000,
  });

  const stats = serverStats || { total: pagination.totalCount || 0, failed: 0, rescheduled: 0, flagged: 0, highPriority: 0 };

  // ── Filter orders (page-level filters only, no redundant re-filtering) ──
  const actionRequiredOrders = useMemo(() => {
    let filtered = [...allOrders];

    if (sourceFilter !== 'all') filtered = filtered.filter(o => getActionSource(o) === sourceFilter);
    if (priorityFilter !== 'all') filtered = filtered.filter(o => getOrderPriority(o) === priorityFilter);

    if (timeFilter !== 'all') {
      filtered = filtered.filter(o => {
        const date = new Date(o.created_at);
        if (timeFilter === 'today') return isToday(date);
        if (timeFilter === 'week') return isThisWeek(date);
        if (timeFilter === 'month') return isThisMonth(date);
        return true;
      });
    }

    return filtered.sort((a, b) => {
      const pOrder = { high: 0, medium: 1, low: 2 };
      return pOrder[getOrderPriority(a)] - pOrder[getOrderPriority(b)];
    });
  }, [allOrders, sourceFilter, timeFilter, priorityFilter]);

  // ── Salesperson filter data ──
  const actionOrderIds = useMemo(
    () => actionRequiredOrders.map((order) => order.id).sort(),
    [actionRequiredOrders]
  );

  const { data: deliveryProofs = [] } = useQuery({
    queryKey: ['action-required-delivery-proofs', actionOrderIds],
    queryFn: async () => {
      if (actionOrderIds.length === 0) return [];

      const { data, error } = await supabase
        .from('attachments')
        .select('id, order_id, url, uploaded_at')
        .in('order_id', actionOrderIds)
        .eq('type', 'delivery_photo')
        .order('uploaded_at', { ascending: false });

      if (error) throw error;

      return Promise.all((data || []).map(async (proof) => ({
        id: proof.id,
        order_id: proof.order_id,
        uploaded_at: proof.uploaded_at,
        signedUrl: await getSignedStorageUrl(proof.url, 'delivery-photos'),
      })));
    },
    enabled: actionOrderIds.length > 0,
    staleTime: 30000,
  });

  const deliveryProofsByOrder = useMemo(() => {
    return deliveryProofs.reduce<Record<string, DeliveryProof[]>>((acc, proof) => {
      if (!proof.order_id) return acc;
      if (!acc[proof.order_id]) acc[proof.order_id] = [];
      acc[proof.order_id].push(proof);
      return acc;
    }, {});
  }, [deliveryProofs]);

  const { data: salespersons = [] } = useQuery({
    queryKey: ['salespersons-for-action-filter', role, profile?.id, viewMode, selectedMember, visibleOwnerIds],
    queryFn: async () => {
      let query = supabase
        .from('orders')
        .select('salesperson_id')
        .or('and(salesperson_action_required.eq.true,runner_status.neq.DELIVERED),and(runner_status.eq.FAILED_DELIVERY,status.eq.READY)')
        .neq('status', 'CANCELLED')
        .not('salesperson_id', 'is', null)
        .limit(10000);

      if (role === 'salesperson' && profile?.id) {
        query = query.eq('salesperson_id', profile.id);
      } else if (role === 'manager' && profile?.id) {
        if (viewMode === 'my') {
          query = query.eq('salesperson_id', profile.id);
        } else if (selectedMember !== 'all') {
          query = query.eq('salesperson_id', selectedMember);
        } else if (visibleOwnerIds && visibleOwnerIds.length > 0) {
          query = query.in('salesperson_id', visibleOwnerIds);
        }
      }

      const { data: orderOwners, error: ownersError } = await query;
      if (ownersError || !orderOwners?.length) return [];

      const counts = orderOwners.reduce<Record<string, number>>((acc, order) => {
        if (order.salesperson_id) {
          acc[order.salesperson_id] = (acc[order.salesperson_id] || 0) + 1;
        }
        return acc;
      }, {});
      const ids = Object.keys(counts);
      if (ids.length === 0) return [];

      const { data, error } = await supabase
        .from('user_directory')
        .select('id, display_name')
        .in('id', ids);
      if (error) return [];

      return data
        .map(user => ({ ...user, action_count: counts[user.id] || 0 }))
        .sort((a, b) => a.display_name.localeCompare(b.display_name));
    },
    enabled: role === 'admin' || role === 'manager',
    staleTime: 30000,
  });
  const salespersonFilterTotal = useMemo(
    () => salespersons.reduce((total, user) => total + user.action_count, 0),
    [salespersons]
  );

  // ── Reasons ──
  const reasonIds = useMemo(() => [...new Set(actionRequiredOrders.map(o => o.runner_failed_reason_id).filter(Boolean))], [actionRequiredOrders]);
  const { data: reasons = [] } = useQuery({
    queryKey: ['reasons-batch', reasonIds],
    queryFn: async () => {
      if (reasonIds.length === 0) return [];
      const { data, error } = await supabase.from('reasons').select('id, label').in('id', reasonIds);
      if (error) return [];
      return data;
    },
    enabled: reasonIds.length > 0,
  });
  const reasonsMap = useMemo(() => {
    const map: Record<string, string> = {};
    reasons.forEach(r => { map[r.id] = r.label; });
    return map;
  }, [reasons]);

  const priorityQueue = useMemo(() => allOrders.filter(o => getOrderPriority(o) === 'high').slice(0, 6), [allOrders]);

  // ── Selection handlers ──
  const handleActionClick = (order: Order) => { setSelectedOrder(order); setActionDialogOpen(true); };
  const toggleRow = (orderId: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId); else next.add(orderId);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedRows.size === actionRequiredOrders.length) setSelectedRows(new Set());
    else setSelectedRows(new Set(actionRequiredOrders.map(o => o.id)));
  };
  const isAllSelected = actionRequiredOrders.length > 0 && selectedRows.size === actionRequiredOrders.length;
  const isSomeSelected = selectedRows.size > 0 && selectedRows.size < actionRequiredOrders.length;
  const selectedOrders = useMemo(() => actionRequiredOrders.filter(o => selectedRows.has(o.id)), [actionRequiredOrders, selectedRows]);
  const handleBulkSuccess = () => { setSelectedRows(new Set()); refetch(); };

  // Export handlers
  const handleExportSelected = useCallback(() => {
    if (selectedRows.size === 0) {
      toast.error('No orders selected for export');
      return;
    }
    const selected = actionRequiredOrders.filter(o => selectedRows.has(o.id));
    exportOrderLines(selected, 'action_required_selected');
    toast.success(`Exported ${selected.length} order(s)`);
  }, [actionRequiredOrders, selectedRows]);

  const handleExportAll = useCallback(() => {
    if (actionRequiredOrders.length === 0) {
      toast.error('No orders to export');
      return;
    }
    exportOrderLines(actionRequiredOrders, 'action_required_all');
    toast.success(`Exported ${actionRequiredOrders.length} order(s)`);
  }, [actionRequiredOrders]);

  // ── Mission progress ──
  const resolvedToday = 0; // placeholder — would need resolved count from DB
  const failedProgress = stats.failed > 0 ? Math.round((resolvedToday / stats.failed) * 100) : 100;

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6">

        {/* ════════════════════════════════════════════
            1. OPERATIONS COMMAND CENTER HEADER
            ════════════════════════════════════════════ */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-card via-card to-primary/5 p-6 md:p-8">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-destructive/60 to-primary/30" />
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />

          <div className="relative flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between xl:gap-6">
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-start gap-3">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-destructive/15 to-destructive/5 border border-destructive/20">
                  <ShieldAlert className="h-7 w-7 text-destructive" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-2xl md:text-3xl font-extrabold leading-tight tracking-tight text-foreground text-balance">
                    Operations Command Center
                  </h1>
                  <p className="text-sm md:text-base text-muted-foreground mt-0.5 max-w-[56ch]">
                    {stats.total} order{stats.total !== 1 ? 's' : ''} requiring attention
                  </p>
                </div>
              </div>
            </div>

            <div className="grid w-full min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center xl:w-auto xl:max-w-[min(760px,62vw)] xl:shrink-0">
              <TeamViewToggle
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                selectedMember={selectedMember}
                onMemberChange={setSelectedMember}
                className="w-full"
              />
              <div className="flex min-w-0 flex-wrap items-center gap-2 lg:justify-end">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="shrink-0 gap-2">
                      <Download className="h-4 w-4" />
                      <span className="hidden md:inline">Export</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={handleExportSelected} disabled={selectedRows.size === 0}>
                      Export Selected ({selectedRows.size})
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleExportAll}>
                      Export All ({actionRequiredOrders.length})
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button variant="ghost" size="sm" onClick={() => setShowGuide(!showGuide)} className="shrink-0 gap-1.5">
                  <HelpCircle className="h-4 w-4" />
                  <span className="hidden md:inline">Guide</span>
                </Button>
              </div>
              <div className="hidden 2xl:block">
                <img
                  src={capybaraCommandCenter}
                  alt="Operations Capybara"
                  className="h-20 w-20 object-contain drop-shadow-md"
                />
              </div>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════
            ACTION WORKFLOW GUIDE (collapsible)
            ════════════════════════════════════════════ */}
        {showGuide && (
          <Card className="border-primary/20 bg-gradient-to-br from-primary/3 to-transparent">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-primary" />
                  <CardTitle className="text-base">How to Resolve Issues</CardTitle>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setShowGuide(false)} className="text-xs">
                  Dismiss
                </Button>
              </div>
              <CardDescription>Follow these steps to efficiently handle each issue</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <WorkflowStep step={1} active icon={<Eye className="h-3.5 w-3.5 text-primary" />} title="Check Issue" desc="Review the failure reason and runner comments" />
                <WorkflowStep step={2} icon={<PhoneCall className="h-3.5 w-3.5 text-muted-foreground" />} title="Contact Customer" desc="Call or WhatsApp to confirm delivery details" />
                <WorkflowStep step={3} icon={<CalendarPlus className="h-3.5 w-3.5 text-muted-foreground" />} title="Update Plan" desc="Reschedule delivery or update the address" />
                <WorkflowStep step={4} icon={<CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />} title="Mark Resolved" desc="Click Resolve to clear the issue from queue" />
              </div>
            </CardContent>
          </Card>
        )}

        {/* ════════════════════════════════════════════
            2. DAILY MISSION PANEL
            ════════════════════════════════════════════ */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Failed Deliveries */}
          <Card className="border-destructive/30 bg-gradient-to-br from-destructive/5 to-transparent hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSourceFilter('FAILED_DELIVERY')}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-destructive/10">
                  <XCircle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <AnimatedCounter value={stats.failed} className="text-2xl font-bold text-destructive" />
                  <p className="text-xs text-muted-foreground">Failed Deliveries</p>
                </div>
              </div>
              <Progress value={failedProgress} className="h-1.5 bg-destructive/10" />
              <p className="text-[10px] text-muted-foreground mt-1">{resolvedToday} resolved today</p>
            </CardContent>
          </Card>

          {/* Rescheduled */}
          <Card className="border-[hsl(var(--status-pending)/0.3)] bg-gradient-to-br from-[hsl(var(--status-pending)/0.08)] to-transparent hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSourceFilter('RESCHEDULED')}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-[hsl(var(--status-pending)/0.15)]">
                  <Calendar className="h-5 w-5 text-[hsl(var(--status-pending))]" />
                </div>
                <div>
                  <AnimatedCounter value={stats.rescheduled} className="text-2xl font-bold text-[hsl(var(--status-pending))]" />
                  <p className="text-xs text-muted-foreground">Rescheduled</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">Pending re-delivery scheduling</p>
            </CardContent>
          </Card>

          {/* Runner Notes */}
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent hover:shadow-md transition-shadow cursor-pointer" onClick={() => setSourceFilter('RUNNER_FLAGGED')}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-primary/10">
                  <MessageSquare className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <AnimatedCounter value={stats.flagged} className="text-2xl font-bold text-primary" />
                  <p className="text-xs text-muted-foreground">Runner Notes</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">Issues flagged by runners</p>
            </CardContent>
          </Card>

          {/* High Priority */}
          <Card className="border-destructive/40 bg-gradient-to-br from-destructive/8 to-transparent hover:shadow-md transition-shadow cursor-pointer" onClick={() => setPriorityFilter('high')}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-destructive/15">
                  <Flame className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <AnimatedCounter value={stats.highPriority} className="text-2xl font-bold text-destructive" />
                  <p className="text-xs text-muted-foreground">Over 7 Days</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">Needs immediate attention</p>
            </CardContent>
          </Card>

          {/* Total Issues */}
          <Card className="border-[hsl(var(--status-warning)/0.3)] bg-gradient-to-br from-[hsl(var(--status-warning)/0.08)] to-transparent col-span-2 lg:col-span-1 hover:shadow-md transition-shadow cursor-pointer" onClick={() => { setSourceFilter('all'); setPriorityFilter('all'); }}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 rounded-xl bg-[hsl(var(--status-warning)/0.15)]">
                  <Target className="h-5 w-5 text-[hsl(var(--status-warning))]" />
                </div>
                <div>
                  <AnimatedCounter value={stats.total} className="text-2xl font-bold text-[hsl(var(--status-warning))]" />
                  <p className="text-xs text-muted-foreground">Total Issues</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">All unresolved orders</p>
            </CardContent>
          </Card>
        </div>

        {/* ════════════════════════════════════════════
            3. PRIORITY QUEUE (task cards)
            ════════════════════════════════════════════ */}
        {priorityQueue.length > 0 && (
          <Card className="border-destructive/15 bg-gradient-to-br from-destructive/[0.02] to-transparent">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Flame className="h-4 w-4 text-destructive" />
                  Overdue Orders
                  <Badge variant="destructive" className="ml-1 text-xs">{priorityQueue.length}</Badge>
                </CardTitle>
                <p className="text-xs text-muted-foreground">Orders pending over 7 days — needs immediate action</p>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {priorityQueue.map(order => {
                  const source = getActionSource(order);
                  const reason = order.runner_failed_reason_id ? reasonsMap[order.runner_failed_reason_id] : null;
                  return (
                    <Card
                      key={order.id}
                      className="border-destructive/15 hover:border-destructive/30 transition-all cursor-pointer hover:shadow-lg group bg-card"
                      onClick={() => handleActionClick(order)}
                    >
                      <CardContent className="p-4 space-y-3">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm font-bold tracking-wide">{order.order_code}</span>
                          {source && (
                            <Badge className={cn('text-xs border', sourceColors[source])}>
                              {sourceLabels[source]}
                            </Badge>
                          )}
                        </div>

                        {/* Customer info */}
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <User className="h-3.5 w-3.5 text-muted-foreground" />
                            {order.customer_name}
                          </div>
                          {order.phone && (
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <Phone className="h-3 w-3" />
                              <WhatsAppPhoneLinkCompact order={order} className="text-xs" />
                            </div>
                          )}
                          {order.address && (
                            <div className="flex items-start gap-2 text-xs text-muted-foreground">
                              <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                              <span className="line-clamp-2">{order.address}</span>
                            </div>
                          )}
                        </div>

                        {/* Reason */}
                        {(reason || order.failed_reason || order.runner_comment) && (
                          <div className="px-2.5 py-1.5 rounded-lg bg-destructive/5 border border-destructive/10">
                            <p className="text-xs text-destructive font-medium line-clamp-2">
                              {reason || order.failed_reason || order.runner_comment}
                            </p>
                          </div>
                        )}

                        {/* Actions row */}
                        <div className="flex items-center gap-2 pt-1 border-t border-border/50">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (order.phone) { const url = buildWhatsAppUrl(order.phone); if (url) window.open(url, '_blank'); }
                            }}
                          >
                            <PhoneCall className="h-3 w-3" />
                            Call
                          </Button>
                          <div className="flex-1" />
                          <Button size="sm" className="h-7 text-xs gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                            <Play className="h-3 w-3" />
                            Resolve
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ════════════════════════════════════════════
            4. SMART FILTERS
            ════════════════════════════════════════════ */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4">
              {/* Time filter + bulk actions */}
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <Tabs value={timeFilter} onValueChange={(v) => setTimeFilter(v as TimeFilter)} className="w-full md:w-auto">
                  <TabsList className="grid grid-cols-4 h-9">
                    <TabsTrigger value="all" className="text-xs px-3">All Time</TabsTrigger>
                    <TabsTrigger value="today" className="text-xs px-3">Today</TabsTrigger>
                    <TabsTrigger value="week" className="text-xs px-3">This Week</TabsTrigger>
                    <TabsTrigger value="month" className="text-xs px-3">This Month</TabsTrigger>
                  </TabsList>
                </Tabs>

                {selectedRows.size > 0 && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="secondary" className="text-sm">{selectedRows.size} selected</Badge>
                    <Button size="sm" onClick={() => setBulkDialogOpen(true)} className="gap-1">
                      <ListChecks className="h-4 w-4" />
                      Bulk Action
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedRows(new Set())}>Clear</Button>
                  </div>
                )}
              </div>

              {/* Filter row */}
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
                <div className="flex-1 md:max-w-xs">
                  <Label className="text-xs text-muted-foreground">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Order ID, customer, address, phone..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-9"
                    />
                  </div>
                </div>

                {(canViewAll || canViewGroup) && salespersons.length > 0 && (
                  <div className="flex-1 md:flex-none">
                    <Label className="text-xs text-muted-foreground">User</Label>
                    <Select value={salespersonFilter} onValueChange={setSalespersonFilter}>
                      <SelectTrigger className="w-full md:w-[160px] h-9"><SelectValue placeholder="All Users" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Users ({salespersonFilterTotal})</SelectItem>
                        {salespersons.map(sp => (
                          <SelectItem key={sp.id} value={sp.id}>
                            {sp.display_name} ({sp.action_count})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="flex-1 md:flex-none">
                  <Label className="text-xs text-muted-foreground">Issue Type</Label>
                  <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger className="w-full md:w-[160px] h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sources</SelectItem>
                      <SelectItem value="FAILED_DELIVERY">Failed Delivery</SelectItem>
                      <SelectItem value="RESCHEDULED">Rescheduled</SelectItem>
                      <SelectItem value="RUNNER_FLAGGED">Runner Notes</SelectItem>
                      <SelectItem value="MANUAL">Manual Flag</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex-1 md:flex-none">
                  <Label className="text-xs text-muted-foreground">Overdue</Label>
                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger className="w-full md:w-[160px] h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Orders</SelectItem>
                      <SelectItem value="high">Over 7 days</SelectItem>
                      <SelectItem value="medium">Over 3 days</SelectItem>
                      <SelectItem value="low">Under 3 days</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ════════════════════════════════════════════
            5. ISSUE TABLE / MOBILE LIST
            ════════════════════════════════════════════ */}
        {actionRequiredOrders.length === 0 ? (
          <CapybaraState type="empty" title="All clear!" description="No orders requiring action right now. Great job! 🎉" />
        ) : isMobile ? (
          <div className="space-y-3">
            <MobileSelectAllCard
              isAllSelected={isAllSelected}
              onSelectAll={(checked) => {
                if (checked) setSelectedRows(new Set(actionRequiredOrders.map(o => o.id)));
                else setSelectedRows(new Set());
              }}
              selectedCount={selectedRows.size}
              totalCount={actionRequiredOrders.length}
            />
            {actionRequiredOrders.map(order => {
              const source = getActionSource(order);
              const priority = getOrderPriority(order);
              const isSelected = selectedRows.has(order.id);
              const proofs = deliveryProofsByOrder[order.id] || [];
              return (
                <MobileOrderCard
                  key={order.id}
                  id={order.id}
                  orderRef={order.order_code}
                  areaBadge={
                    <Badge className={cn('text-xs border', priorityConfig[priority].color)}>
                      {priorityConfig[priority].label}
                    </Badge>
                  }
                  statusBadge={
                    source ? <Badge className={cn('text-xs border', sourceColors[source])}>{sourceLabels[source]}</Badge> : undefined
                  }
                  selectable={true}
                  isSelected={isSelected}
                  onSelectionChange={() => toggleRow(order.id)}
                  primaryFields={[
                    ...((canViewAll || canViewGroup) ? [{ label: 'User', value: salespersons.find(sp => sp.id === order.salesperson_id)?.display_name || '-' }] : []),
                    { label: 'Customer', value: order.customer_name },
                    { label: 'Phone', value: <WhatsAppPhoneLinkCompact order={order} /> },
                    ...(order.next_delivery_date ? [{ label: 'Next Date', value: format(parseISO(order.next_delivery_date), 'dd MMM') }] : []),
                  ]}
                  expandedFields={[
                    { label: 'Address', value: order.address || '-', fullWidth: true },
                    ...(order.failed_reason ? [{ label: 'Reason', value: order.failed_reason }] : []),
                    ...(order.failed_remark || order.runner_comment ? [{ label: 'Runner Comment', value: order.failed_remark || order.runner_comment || '-', fullWidth: true }] : []),
                    ...(proofs.length > 0 ? [{ label: 'Proof', value: <DeliveryProofPreview proofs={proofs} />, fullWidth: true }] : []),
                    { label: 'Order Status', value: order.status },
                    { label: 'Runner Status', value: order.runner_status || '-' },
                  ]}
                  primaryAction={
                    <Button size="sm" onClick={(e) => { e.stopPropagation(); handleActionClick(order); }} className="gap-1">
                      <Play className="h-3.5 w-3.5" />
                      Resolve
                    </Button>
                  }
                />
              );
            })}
          </div>
        ) : (
          /* ── Desktop Table ── */
          <Card className="overflow-hidden">
            <CardHeader className="py-3 px-4 border-b border-border/50 bg-muted/30">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                  Issue Queue
                  <Badge variant="secondary" className="text-xs">{actionRequiredOrders.length}</Badge>
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent bg-muted/20">
                    <TableHead className="w-10">
                      <Checkbox
                        checked={isAllSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                        className={isSomeSelected ? "data-[state=checked]:bg-primary/50" : ""}
                      />
                    </TableHead>
                    <TableHead className="w-[60px]">Priority</TableHead>
                    <TableHead className="w-[100px]">Order Ref</TableHead>
                    {(canViewAll || canViewGroup) && <TableHead className="w-[100px]">User</TableHead>}
                    <TableHead className="w-[200px]">Customer</TableHead>
                    <TableHead className="min-w-[200px]">Address</TableHead>
                    <TableHead className="w-[110px]">Issue</TableHead>
                    <TableHead className="w-[100px]">Next Date</TableHead>
                    <TableHead className="w-[130px]">Reason</TableHead>
                    <TableHead className="w-[160px]">Runner Comment</TableHead>
                    <TableHead className="w-[110px]">Proof</TableHead>
                    <TableHead className="w-[100px]">Status</TableHead>
                    <TableHead className="text-right w-[180px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actionRequiredOrders.map(order => {
                    const source = getActionSource(order);
                    const priority = getOrderPriority(order);
                    const proofs = deliveryProofsByOrder[order.id] || [];
                    return (
                      <TableRow
                        key={order.id}
                        data-order-id={order.id}
                        className={cn(
                          "transition-colors",
                          selectedRows.has(order.id) ? "bg-muted/50" : "",
                          priority === 'high' && "bg-destructive/[0.02]",
                          highlightOrderId === order.id && "ring-2 ring-yellow-400/60 bg-yellow-50/50 dark:bg-yellow-900/10 animate-pulse"
                        )}
                      >
                        <TableCell>
                          <Checkbox
                            checked={selectedRows.has(order.id)}
                            onCheckedChange={() => toggleRow(order.id)}
                            aria-label={`Select ${order.order_code}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className={cn("h-2.5 w-2.5 rounded-full shrink-0 ring-2 ring-background", priorityConfig[priority].dot)} />
                            <span className="text-xs font-medium text-muted-foreground">{priorityConfig[priority].label}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm font-bold tracking-wide">{order.order_code}</TableCell>
                        {(canViewAll || canViewGroup) && (
                          <TableCell className="text-sm">{salespersons.find(sp => sp.id === order.salesperson_id)?.display_name || '-'}</TableCell>
                        )}
                        <TableCell>
                          <div className="space-y-0.5">
                            <div className="font-semibold text-sm">{order.customer_name}</div>
                            <WhatsAppPhoneLinkCompact order={order} className="text-xs" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm truncate max-w-[200px] block cursor-help">{order.address || '-'}</span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[400px]">
                              <p className="whitespace-pre-wrap">{order.address || 'No address'}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TableCell>
                        <TableCell>
                          {source && (
                            <Badge className={cn('text-xs border', sourceColors[source])}>
                              {sourceLabels[source]}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {order.next_delivery_date ? (
                            <div className="flex items-center gap-1 text-sm">
                              <CalendarClock className="h-3 w-3" />
                              {format(parseISO(order.next_delivery_date), 'dd MMM yyyy')}
                            </div>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="text-sm text-destructive max-w-[130px]">
                          {order.failed_reason ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="truncate block cursor-help">{order.failed_reason}</span>
                              </TooltipTrigger>
                              <TooltipContent>{order.failed_reason}</TooltipContent>
                            </Tooltip>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="max-w-[160px]">
                          {order.failed_remark || order.runner_comment ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex items-start gap-1 cursor-help">
                                  <MessageSquare className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                                  <span className="text-sm truncate">{order.failed_remark || order.runner_comment}</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-[300px]">
                                <p className="whitespace-pre-wrap">{order.failed_remark || order.runner_comment}</p>
                              </TooltipContent>
                            </Tooltip>
                          ) : '-'}
                        </TableCell>
                        <TableCell>
                          <DeliveryProofPreview proofs={proofs} compact />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="text-xs w-fit">{order.status}</Badge>
                            {order.runner_status && order.runner_status !== 'UNASSIGNED' && (
                              <span className="text-[10px] text-muted-foreground">{order.runner_status}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (order.phone) { const url = buildWhatsAppUrl(order.phone); if (url) window.open(url, '_blank'); }
                                  }}
                                >
                                  <PhoneCall className="h-3.5 w-3.5" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Contact Customer</TooltipContent>
                            </Tooltip>
                            <Button size="sm" className="h-7 gap-1 text-xs" onClick={() => handleActionClick(order)}>
                              <Play className="h-3.5 w-3.5" />
                              Resolve
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* ════════════════════════════════════════════
            6. PAGINATION CONTROLS
            ════════════════════════════════════════════ */}
        {pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-1">
            <span className="text-sm text-muted-foreground tabular-nums">
              {(pagination.page - 1) * pagination.pageSize + 1}–{Math.min(pagination.page * pagination.pageSize, pagination.totalCount)} of {pagination.totalCount}
            </span>
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(pagination.page - 1)}
                disabled={pagination.page === 1 || isFetching}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm px-3 tabular-nums font-medium">
                {pagination.page} / {pagination.totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(pagination.page + 1)}
                disabled={pagination.page === pagination.totalPages || isFetching}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Dialogs */}
      <ActionResolutionDialog
        order={selectedOrder}
        open={actionDialogOpen}
        onOpenChange={setActionDialogOpen}
        onSuccess={() => refetch()}
      />
      <BulkActionResolutionDialog
        orders={selectedOrders}
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        onSuccess={handleBulkSuccess}
      />
    </AppLayout>
  );
}
