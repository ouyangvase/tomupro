import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO, isToday, isThisWeek, isThisMonth } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOrders } from '@/hooks/useOrders';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { TeamViewToggle, useTeamViewState } from '@/components/filters/TeamViewToggle';
import { ActionResolutionDialog } from '@/components/sales/ActionResolutionDialog';
import { BulkActionResolutionDialog } from '@/components/sales/BulkActionResolutionDialog';
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter';
import { PageHero } from '@/components/dashboard/PageHero';
import { CapybaraState } from '@/components/dashboard/CapybaraState';
import { WhatsAppPhoneLink, WhatsAppPhoneLinkCompact } from '@/components/orders/WhatsAppPhoneLink';
import { MobileOrderCard, MobileSelectAllCard } from '@/components/mobile/MobileOrderCard';
import { useIsMobile } from '@/hooks/use-mobile';
import capybaraRunner from '@/assets/capybara-runner.png';
import { 
  AlertCircle, MessageSquare, Search, CalendarClock, RefreshCw, 
  Play, ListChecks, XCircle, Calendar, AlertTriangle, Flame,
  Phone, MapPin, User, ArrowUpRight, ChevronRight, Clock,
  ShieldAlert, TrendingUp, Filter
} from 'lucide-react';
import type { Order } from '@/types/database';
import { cn } from '@/lib/utils';

// Reason types for action required
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

// Determine why an order requires action
function getActionSource(order: Order): ActionRequiredSource | null {
  const runnerStatus = order.runner_status as string;
  if (runnerStatus === 'FAILED_DELIVERY') return 'FAILED_DELIVERY';
  if (order.next_delivery_date) return 'RESCHEDULED';
  if (order.runner_failed_reason_id || order.runner_comment) return 'RUNNER_FLAGGED';
  return 'MANUAL';
}

// Check if order needs salesperson action
function needsSalespersonAction(order: Order): boolean {
  if (order.salesperson_action_required === true) return true;
  const runnerStatus = order.runner_status as string;
  const orderStatus = order.status as string;
  if (runnerStatus === 'FAILED_DELIVERY' && orderStatus !== 'CANCELLED') return true;
  return false;
}

// Priority scoring
function getOrderPriority(order: Order): 'high' | 'medium' | 'low' {
  const source = getActionSource(order);
  if (source === 'FAILED_DELIVERY') return 'high';
  if (source === 'RESCHEDULED' && order.next_delivery_date) {
    const nextDate = parseISO(order.next_delivery_date);
    if (isToday(nextDate) || nextDate < new Date()) return 'high';
    return 'medium';
  }
  return 'low';
}

const priorityConfig = {
  high: { label: 'High', color: 'bg-destructive/10 text-destructive border-destructive/30', dot: 'bg-destructive' },
  medium: { label: 'Medium', color: 'bg-[hsl(var(--status-warning)/0.1)] text-[hsl(var(--status-warning))] border-[hsl(var(--status-warning)/0.3)]', dot: 'bg-[hsl(var(--status-warning))]' },
  low: { label: 'Low', color: 'bg-primary/10 text-primary border-primary/30', dot: 'bg-primary' },
};

type TimeFilter = 'all' | 'today' | 'week' | 'month';

export default function SalespersonActionInbox() {
  const navigate = useNavigate();
  const { profile, role } = useAuth();
  const { data: allOrders = [], isLoading, refetch } = useOrders();
  const isMobile = useIsMobile();
  
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [salespersonFilter, setSalespersonFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [viewMode2, setViewMode2] = useState<'cards' | 'table'>('table');
  
  // Team view state for managers
  const { viewMode, setViewMode, selectedMember, setSelectedMember, isManager } = useTeamViewState('my');
  const { data: teamMembers = [] } = useTeamMembers();
  const teamMemberIds = useMemo(() => teamMembers.map(m => m.id), [teamMembers]);
  
  // Fetch visible owner IDs from server
  const { data: visibleIds, isLoading: visibleIdsLoading } = useQuery({
    queryKey: ['visible-owner-ids', profile?.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_visible_owner_ids');
      if (error) { console.error('Failed to fetch visible owner IDs:', error); return null; }
      return data;
    },
    enabled: !!profile?.id,
  });

  const canViewAll = role === 'admin';
  const canViewGroup = role === 'manager';

  // Filter orders requiring action based on role and view mode
  const actionRequiredOrders = useMemo(() => {
    if (visibleIdsLoading && !canViewAll) return [];

    let filtered = allOrders.filter(order => needsSalespersonAction(order));

    // Role-based view mode filtering
    if (canViewAll) {
      // Admin sees all
    } else if (canViewGroup) {
      if (viewMode === 'my') {
        filtered = filtered.filter(order => order.salesperson_id === profile?.id);
      } else {
        if (selectedMember !== 'all') {
          filtered = filtered.filter(order => order.salesperson_id === selectedMember);
        } else {
          const accessibleIds = [profile?.id, ...teamMemberIds].filter(Boolean) as string[];
          if (accessibleIds.length > 0) {
            filtered = filtered.filter(order => accessibleIds.includes(order.salesperson_id));
          }
        }
      }
    } else {
      filtered = filtered.filter(order => order.salesperson_id === profile?.id);
    }

    if (salespersonFilter !== 'all') {
      filtered = filtered.filter(o => o.salesperson_id === salespersonFilter);
    }
    if (sourceFilter !== 'all') {
      filtered = filtered.filter(o => getActionSource(o) === sourceFilter);
    }
    if (priorityFilter !== 'all') {
      filtered = filtered.filter(o => getOrderPriority(o) === priorityFilter);
    }

    // Time filter
    if (timeFilter !== 'all') {
      filtered = filtered.filter(o => {
        const date = new Date(o.created_at);
        if (timeFilter === 'today') return isToday(date);
        if (timeFilter === 'week') return isThisWeek(date);
        if (timeFilter === 'month') return isThisMonth(date);
        return true;
      });
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(o => 
        o.order_code?.toLowerCase().includes(q) ||
        o.customer_name?.toLowerCase().includes(q) ||
        o.address?.toLowerCase().includes(q) ||
        o.phone?.toLowerCase().includes(q)
      );
    }

    // Sort by priority: high first, then medium, then low
    return filtered.sort((a, b) => {
      const pOrder = { high: 0, medium: 1, low: 2 };
      return pOrder[getOrderPriority(a)] - pOrder[getOrderPriority(b)];
    });
  }, [allOrders, profile?.id, sourceFilter, salespersonFilter, searchQuery, canViewAll, canViewGroup, viewMode, selectedMember, teamMemberIds, visibleIdsLoading, timeFilter, priorityFilter]);

  // Salesperson info for filter dropdown
  const salespersonIds = useMemo(() => {
    return [...new Set(allOrders.filter(o => needsSalespersonAction(o)).map(o => o.salesperson_id))];
  }, [allOrders]);

  const { data: salespersons = [] } = useQuery({
    queryKey: ['salespersons-for-filter', salespersonIds],
    queryFn: async () => {
      if (salespersonIds.length === 0) return [];
      const { data, error } = await supabase.from('user_directory').select('id, display_name').in('id', salespersonIds);
      if (error) return [];
      return data;
    },
    enabled: (role === 'admin' || role === 'manager') && salespersonIds.length > 0,
  });

  // Fetch reasons
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

  // Stats computed from filtered data
  const stats = useMemo(() => {
    const all = allOrders.filter(o => needsSalespersonAction(o));
    return {
      total: actionRequiredOrders.length,
      failed: actionRequiredOrders.filter(o => getActionSource(o) === 'FAILED_DELIVERY').length,
      rescheduled: actionRequiredOrders.filter(o => getActionSource(o) === 'RESCHEDULED').length,
      flagged: actionRequiredOrders.filter(o => getActionSource(o) === 'RUNNER_FLAGGED' || getActionSource(o) === 'MANUAL').length,
      highPriority: actionRequiredOrders.filter(o => getOrderPriority(o) === 'high').length,
    };
  }, [actionRequiredOrders, allOrders]);

  // Priority queue - top 5 high priority items
  const priorityQueue = useMemo(() => {
    return actionRequiredOrders.filter(o => getOrderPriority(o) === 'high').slice(0, 5);
  }, [actionRequiredOrders]);

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

  if (isLoading) {
    return (
      <AppLayout>
        <CapybaraState type="loading" title="Loading operations..." description="Scanning for orders that need your attention" />
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-5">
        {/* ── Hero Command Panel ── */}
        <PageHero
          icon={<ShieldAlert className="h-6 w-6 text-destructive" />}
          title="Operations Alert Center"
          subtitle={`${stats.total} order${stats.total !== 1 ? 's' : ''} require immediate attention`}
          image={capybaraRunner}
          imageAlt="Alert capybara"
          actions={
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <TeamViewToggle
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                selectedMember={selectedMember}
                onMemberChange={setSelectedMember}
              />
              <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                <span className="hidden md:inline">Refresh</span>
              </Button>
            </div>
          }
        />

        {/* ── Urgency Metrics ── */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Total Issues */}
          <Card className="border-[hsl(var(--status-warning)/0.3)] bg-gradient-to-br from-[hsl(var(--status-warning)/0.08)] to-transparent">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[hsl(var(--status-warning)/0.15)]">
                  <AlertCircle className="h-5 w-5 text-[hsl(var(--status-warning))]" />
                </div>
                <div>
                  <AnimatedCounter value={stats.total} className="text-2xl font-bold text-[hsl(var(--status-warning))]" />
                  <p className="text-xs text-muted-foreground">Total Issues</p>
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Failed Deliveries */}
          <Card className="border-destructive/30 bg-gradient-to-br from-destructive/5 to-transparent">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-destructive/10">
                  <XCircle className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <AnimatedCounter value={stats.failed} className="text-2xl font-bold text-destructive" />
                  <p className="text-xs text-muted-foreground">Failed Deliveries</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Rescheduled */}
          <Card className="border-[hsl(var(--status-pending)/0.3)] bg-gradient-to-br from-[hsl(var(--status-pending)/0.08)] to-transparent">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-[hsl(var(--status-pending)/0.15)]">
                  <Calendar className="h-5 w-5 text-[hsl(var(--status-pending))]" />
                </div>
                <div>
                  <AnimatedCounter value={stats.rescheduled} className="text-2xl font-bold text-[hsl(var(--status-pending))]" />
                  <p className="text-xs text-muted-foreground">Rescheduled</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Flagged Notes */}
          <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-primary/10">
                  <MessageSquare className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <AnimatedCounter value={stats.flagged} className="text-2xl font-bold text-primary" />
                  <p className="text-xs text-muted-foreground">Runner Notes</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* High Priority */}
          <Card className="border-destructive/40 bg-gradient-to-br from-destructive/8 to-transparent col-span-2 lg:col-span-1">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-destructive/15">
                  <Flame className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <AnimatedCounter value={stats.highPriority} className="text-2xl font-bold text-destructive" />
                  <p className="text-xs text-muted-foreground">High Priority</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Priority Queue ── */}
        {priorityQueue.length > 0 && (
          <Card className="border-destructive/20 bg-gradient-to-br from-destructive/3 to-transparent">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Flame className="h-4 w-4 text-destructive" />
                Priority Queue
                <Badge variant="destructive" className="ml-1 text-xs">{priorityQueue.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {priorityQueue.map(order => {
                  const source = getActionSource(order);
                  return (
                    <Card 
                      key={order.id} 
                      className="border-destructive/15 hover:border-destructive/30 transition-all cursor-pointer hover:shadow-md group"
                      onClick={() => handleActionClick(order)}
                    >
                      <CardContent className="p-4 space-y-3">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-sm font-semibold">{order.order_code}</span>
                          {source && (
                            <Badge className={cn('text-xs border', sourceColors[source])}>
                              {sourceLabels[source]}
                            </Badge>
                          )}
                        </div>

                        {/* Customer info */}
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-2 text-sm font-medium">
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
                              <span className="line-clamp-1">{order.address}</span>
                            </div>
                          )}
                        </div>

                        {/* Reason & action */}
                        <div className="flex items-center justify-between pt-1 border-t border-border/50">
                          <span className="text-xs text-destructive font-medium truncate max-w-[60%]">
                            {order.failed_reason || order.runner_comment || 'Needs attention'}
                          </span>
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

        {/* ── Smart Filters ── */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4">
              {/* Time filter tabs */}
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
                    <Badge variant="secondary" className="text-sm">
                      {selectedRows.size} selected
                    </Badge>
                    <Button size="sm" onClick={() => setBulkDialogOpen(true)} className="gap-1">
                      <ListChecks className="h-4 w-4" />
                      Bulk Action
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedRows(new Set())}>
                      Clear
                    </Button>
                  </div>
                )}
              </div>

              {/* Filter row */}
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:gap-4">
                {/* Search */}
                <div className="flex-1 md:max-w-xs">
                  <Label className="text-xs text-muted-foreground">Search</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Order ID, customer, address..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-9"
                    />
                  </div>
                </div>
                
                {/* User filter */}
                {(canViewAll || canViewGroup) && salespersons.length > 0 && (
                  <div className="flex-1 md:flex-none">
                    <Label className="text-xs text-muted-foreground">User</Label>
                    <Select value={salespersonFilter} onValueChange={setSalespersonFilter}>
                      <SelectTrigger className="w-full md:w-[160px] h-9">
                        <SelectValue placeholder="All Users" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Users</SelectItem>
                        {salespersons.map(sp => (
                          <SelectItem key={sp.id} value={sp.id}>{sp.display_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Issue type */}
                <div className="flex-1 md:flex-none">
                  <Label className="text-xs text-muted-foreground">Issue Type</Label>
                  <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger className="w-full md:w-[160px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sources</SelectItem>
                      <SelectItem value="FAILED_DELIVERY">Failed Delivery</SelectItem>
                      <SelectItem value="RESCHEDULED">Rescheduled</SelectItem>
                      <SelectItem value="RUNNER_FLAGGED">Runner Notes</SelectItem>
                      <SelectItem value="MANUAL">Manual Flag</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Priority */}
                <div className="flex-1 md:flex-none">
                  <Label className="text-xs text-muted-foreground">Priority</Label>
                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger className="w-full md:w-[140px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priority</SelectItem>
                      <SelectItem value="high">🔴 High</SelectItem>
                      <SelectItem value="medium">🟠 Medium</SelectItem>
                      <SelectItem value="low">🔵 Low</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ── Orders List ── */}
        {actionRequiredOrders.length === 0 ? (
          <CapybaraState type="empty" title="All clear!" description="No orders requiring action right now. Great job! 🎉" />
        ) : isMobile ? (
          /* Mobile Card View */
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
          /* Desktop Table View */
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-10">
                      <Checkbox 
                        checked={isAllSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                        className={isSomeSelected ? "data-[state=checked]:bg-primary/50" : ""}
                      />
                    </TableHead>
                    <TableHead className="w-[60px]">Priority</TableHead>
                    <TableHead>Order Ref</TableHead>
                    {(canViewAll || canViewGroup) && <TableHead>User</TableHead>}
                    <TableHead>Customer</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Next Date</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Runner Comment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actionRequiredOrders.map(order => {
                    const source = getActionSource(order);
                    const priority = getOrderPriority(order);
                    return (
                      <TableRow 
                        key={order.id} 
                        className={cn(
                          selectedRows.has(order.id) ? "bg-muted/50" : "",
                          priority === 'high' && "bg-destructive/[0.02]"
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
                            <span className={cn("h-2 w-2 rounded-full shrink-0", priorityConfig[priority].dot)} />
                            <span className="text-xs text-muted-foreground">{priorityConfig[priority].label}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-sm font-medium">{order.order_code}</TableCell>
                        {(canViewAll || canViewGroup) && (
                          <TableCell className="text-sm">
                            {salespersons.find(sp => sp.id === order.salesperson_id)?.display_name || '-'}
                          </TableCell>
                        )}
                        <TableCell>
                          <div>
                            <div className="font-medium text-sm">{order.customer_name}</div>
                            <WhatsAppPhoneLinkCompact order={order} className="text-xs" />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="text-sm truncate max-w-[180px] block cursor-help">{order.address || '-'}</span>
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
                        <TableCell className="text-sm text-destructive max-w-[120px]">
                          {order.failed_reason ? (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="truncate block cursor-help">{order.failed_reason}</span>
                              </TooltipTrigger>
                              <TooltipContent>{order.failed_reason}</TooltipContent>
                            </Tooltip>
                          ) : '-'}
                        </TableCell>
                        <TableCell className="max-w-[180px]">
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
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="text-xs w-fit">{order.status}</Badge>
                            {order.runner_status && order.runner_status !== 'UNASSIGNED' && (
                              <span className="text-xs text-muted-foreground">{order.runner_status}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" className="h-7 gap-1" onClick={() => handleActionClick(order)}>
                            <Play className="h-3.5 w-3.5" />
                            Action
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
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
