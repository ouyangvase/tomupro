import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, parseISO } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useOrders } from '@/hooks/useOrders';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import { TeamViewToggle, useTeamViewState } from '@/components/filters/TeamViewToggle';
import { ActionResolutionDialog } from '@/components/sales/ActionResolutionDialog';
import { BulkActionResolutionDialog } from '@/components/sales/BulkActionResolutionDialog';
import { 
  AlertCircle, MessageSquare, User, 
  CalendarClock, Loader2, RefreshCw, Play, ListChecks, XCircle, Calendar, AlertTriangle
} from 'lucide-react';
import type { Order } from '@/types/database';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileOrderCard, MobileSelectAllCard } from '@/components/mobile/MobileOrderCard';
import { WhatsAppPhoneLink, WhatsAppPhoneLinkCompact } from '@/components/orders/WhatsAppPhoneLink';

// Reason types for action required
type ActionRequiredSource = 'FAILED_DELIVERY' | 'RESCHEDULED' | 'RUNNER_FLAGGED' | 'MANUAL';

const sourceColors: Record<ActionRequiredSource, string> = {
  FAILED_DELIVERY: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  RESCHEDULED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  RUNNER_FLAGGED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  MANUAL: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
};

const sourceLabels: Record<ActionRequiredSource, string> = {
  FAILED_DELIVERY: 'Failed Delivery',
  RESCHEDULED: 'Rescheduled',
  RUNNER_FLAGGED: 'Runner Note',
  MANUAL: 'Manual Flag',
};

const outcomeLabels: Record<string, string> = {
  CONFIRM_DELIVERED: 'Confirmed Delivered',
  CONFIRM_FAILED: 'Confirmed Failed',
  RESCHEDULE: 'Rescheduled',
  NEED_SALESPERSON_FOLLOWUP: 'Needs Followup',
};

// Determine why an order requires action (for display purposes only)
function getActionSource(order: Order): ActionRequiredSource | null {
  const runnerStatus = order.runner_status as string;
  
  // Rule 1: Check for failed delivery status
  if (runnerStatus === 'FAILED_DELIVERY') {
    return 'FAILED_DELIVERY';
  }
  
  // Rule 2: Check for reschedule date pending (next_delivery_date exists)
  if (order.next_delivery_date) {
    return 'RESCHEDULED';
  }
  
  // Rule 3: Check for runner failed reason or remark note (runner flagged)
  if (order.runner_failed_reason_id || order.runner_comment) {
    return 'RUNNER_FLAGGED';
  }
  
  // Rule 4: Manual flag
  return 'MANUAL';
}

// SINGLE SOURCE OF TRUTH: Check if order needs salesperson action
// Orders are shown if explicitly marked OR if runner_status is FAILED_DELIVERY
function needsSalespersonAction(order: Order): boolean {
  // Show if explicitly marked as action required
  if (order.salesperson_action_required === true) return true;
  
  // Also show if runner marked as failed delivery (even if flag not set)
  // Exclude cancelled orders
  const runnerStatus = order.runner_status as string;
  const orderStatus = order.status as string;
  if (runnerStatus === 'FAILED_DELIVERY' && orderStatus !== 'CANCELLED') {
    return true;
  }
  
  return false;
}

export default function SalespersonActionInbox() {
  const navigate = useNavigate();
  const { profile, role } = useAuth();
  const { data: allOrders = [], isLoading, refetch } = useOrders({ 
    actionRequiredOnly: true,
    limit: 1000  // Higher limit since these are specifically action-required
  });
  
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [salespersonFilter, setSalespersonFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  
  // Team view state for managers
  const { viewMode, setViewMode, selectedMember, setSelectedMember, isManager } = useTeamViewState('my');
  
  // Use team members hook directly
  const { data: teamMembers = [] } = useTeamMembers();
  const teamMemberIds = useMemo(() => teamMembers.map(m => m.id), [teamMembers]);

  // Determine if user can view all (admin), group members (manager), or just own (salesperson)
  const canViewAll = role === 'admin';
  const canViewGroup = role === 'manager';

  // Filter orders requiring salesperson action based on role and view mode
  const actionRequiredOrders = useMemo(() => {
    let filtered = allOrders.filter(order => needsSalespersonAction(order));

    // Role-based filtering
    if (canViewAll) {
      // Admin sees all - no additional filter
    } else if (canViewGroup) {
      // Manager - apply view mode filtering
      if (viewMode === 'my') {
        filtered = filtered.filter(order => order.salesperson_id === profile?.id);
      } else {
        // Team mode
        const teamIds = [profile?.id, ...teamMemberIds];
        if (selectedMember !== 'all') {
          filtered = filtered.filter(order => order.salesperson_id === selectedMember);
        } else {
          filtered = filtered.filter(order => teamIds.includes(order.salesperson_id));
        }
      }
    } else {
      // Salesperson sees only their own
      filtered = filtered.filter(order => order.salesperson_id === profile?.id);
    }

    // Apply salesperson filter (for admin)
    if (salespersonFilter !== 'all' && canViewAll) {
      filtered = filtered.filter(o => o.salesperson_id === salespersonFilter);
    }

    // Apply source filter
    if (sourceFilter !== 'all') {
      filtered = filtered.filter(o => getActionSource(o) === sourceFilter);
    }

    return filtered;
  }, [allOrders, profile?.id, sourceFilter, salespersonFilter, canViewAll, canViewGroup, teamMemberIds, viewMode, selectedMember]);

  // Fetch salesperson info for ALL orders in the filtered list (not just team members)
  const salespersonIds = useMemo(() => {
    // Get ALL unique salesperson IDs from the filtered action required orders
    const idsFromOrders = [...new Set(allOrders.filter(o => needsSalespersonAction(o)).map(o => o.salesperson_id))];
    return idsFromOrders;
  }, [allOrders]);

  const { data: salespersons = [] } = useQuery({
    queryKey: ['salespersons-for-filter', salespersonIds],
    queryFn: async () => {
      if (salespersonIds.length === 0) return [];
      const { data, error } = await supabase
        .from('user_directory')
        .select('id, display_name')
        .in('id', salespersonIds);
      if (error) return [];
      return data;
    },
    enabled: (role === 'admin' || role === 'manager') && salespersonIds.length > 0,
  });

  // Fetch reasons for failed orders
  const reasonIds = useMemo(() => 
    [...new Set(actionRequiredOrders.map(o => o.runner_failed_reason_id).filter(Boolean))],
    [actionRequiredOrders]
  );

  const { data: reasons = [] } = useQuery({
    queryKey: ['reasons-batch', reasonIds],
    queryFn: async () => {
      if (reasonIds.length === 0) return [];
      const { data, error } = await supabase
        .from('reasons')
        .select('id, label')
        .in('id', reasonIds);
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

  // Fetch reviewer names
  const reviewerIds = useMemo(() =>
    [...new Set(actionRequiredOrders.map(o => o.runner_reviewed_by).filter(Boolean))],
    [actionRequiredOrders]
  );

  const { data: reviewers = [] } = useQuery({
    queryKey: ['reviewers-batch', reviewerIds],
    queryFn: async () => {
      if (reviewerIds.length === 0) return [];
      const { data, error } = await supabase
        .from('user_directory')
        .select('id, display_name')
        .in('id', reviewerIds);
      if (error) return [];
      return data;
    },
    enabled: reviewerIds.length > 0,
  });

  const reviewersMap = useMemo(() => {
    const map: Record<string, string> = {};
    reviewers.forEach(r => { map[r.id] = r.display_name; });
    return map;
  }, [reviewers]);

  const handleActionClick = (order: Order) => {
    setSelectedOrder(order);
    setActionDialogOpen(true);
  };

  // Selection handlers
  const toggleRow = (orderId: string) => {
    setSelectedRows(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) {
        next.delete(orderId);
      } else {
        next.add(orderId);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === actionRequiredOrders.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(actionRequiredOrders.map(o => o.id)));
    }
  };

  const isAllSelected = actionRequiredOrders.length > 0 && selectedRows.size === actionRequiredOrders.length;
  const isSomeSelected = selectedRows.size > 0 && selectedRows.size < actionRequiredOrders.length;

  const selectedOrders = useMemo(() => 
    actionRequiredOrders.filter(o => selectedRows.has(o.id)),
    [actionRequiredOrders, selectedRows]
  );

  const handleBulkSuccess = () => {
    setSelectedRows(new Set());
    refetch();
  };

  const isMobile = useIsMobile();

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-6 w-6 md:h-8 md:w-8 text-orange-500" />
            <div>
              <h1 className="text-xl md:text-2xl font-bold">Action Required</h1>
              <p className="text-sm text-muted-foreground">Orders requiring your attention</p>
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <TeamViewToggle
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              selectedMember={selectedMember}
              onMemberChange={setSelectedMember}
            />
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">Refresh</span>
            </Button>
          </div>
        </div>

        {/* Stats - responsive grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <Card className="border-orange-200 bg-orange-50 dark:bg-orange-900/10">
            <CardContent className="p-3 md:p-4">
              <div className="text-xl md:text-2xl font-bold text-orange-600">{actionRequiredOrders.length}</div>
              <div className="text-xs md:text-sm text-muted-foreground">Total Pending</div>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50 dark:bg-red-900/10">
            <CardContent className="p-3 md:p-4 flex items-center gap-2">
              <XCircle className="h-4 w-4 md:h-5 md:w-5 text-red-500" />
              <div>
                <div className="text-xl md:text-2xl font-bold text-red-600">
                  {actionRequiredOrders.filter(o => getActionSource(o) === 'FAILED_DELIVERY').length}
                </div>
                <div className="text-xs md:text-sm text-muted-foreground">Failed</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10">
            <CardContent className="p-3 md:p-4 flex items-center gap-2">
              <Calendar className="h-4 w-4 md:h-5 md:w-5 text-yellow-500" />
              <div>
                <div className="text-xl md:text-2xl font-bold text-yellow-600">
                  {actionRequiredOrders.filter(o => getActionSource(o) === 'RESCHEDULED').length}
                </div>
                <div className="text-xs md:text-sm text-muted-foreground">Rescheduled</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/10">
            <CardContent className="p-3 md:p-4 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 md:h-5 md:w-5 text-blue-500" />
              <div>
                <div className="text-xl md:text-2xl font-bold text-blue-600">
                  {actionRequiredOrders.filter(o => 
                    getActionSource(o) === 'RUNNER_FLAGGED' || getActionSource(o) === 'MANUAL'
                  ).length}
                </div>
                <div className="text-xs md:text-sm text-muted-foreground">Notes</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter + Bulk Actions */}
        <Card>
          <CardContent className="p-3 md:p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between md:gap-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
                {/* Salesperson Filter - only for admin/manager */}
                {(canViewAll || canViewGroup) && salespersons.length > 0 && (
                  <div className="flex-1 md:flex-none">
                    <Label className="text-xs">User</Label>
                    <Select value={salespersonFilter} onValueChange={setSalespersonFilter}>
                      <SelectTrigger className="w-full md:w-[180px] h-10">
                        <SelectValue placeholder="All Users" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Users</SelectItem>
                        {salespersons.map(sp => (
                          <SelectItem key={sp.id} value={sp.id}>
                            {sp.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="flex-1 md:flex-none">
                  <Label className="text-xs">Action Type</Label>
                  <Select value={sourceFilter} onValueChange={setSourceFilter}>
                    <SelectTrigger className="w-full md:w-[180px] h-10">
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
              </div>
              
              {selectedRows.size > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" className="text-sm">
                    {selectedRows.size} selected
                  </Badge>
                  <Button size="sm" onClick={() => setBulkDialogOpen(true)}>
                    <ListChecks className="h-4 w-4 mr-1" />
                    Bulk Action
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setSelectedRows(new Set())}
                  >
                    Clear
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Mobile Card View */}
        {isMobile ? (
          <div className="space-y-3">
            <MobileSelectAllCard
              isAllSelected={isAllSelected}
              onSelectAll={(checked) => {
                if (checked) {
                  setSelectedRows(new Set(actionRequiredOrders.map(o => o.id)));
                } else {
                  setSelectedRows(new Set());
                }
              }}
              selectedCount={selectedRows.size}
              totalCount={actionRequiredOrders.length}
            />

            {actionRequiredOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No orders requiring action
              </div>
            ) : (
              actionRequiredOrders.map(order => {
                const source = getActionSource(order);
                const isSelected = selectedRows.has(order.id);

                return (
                  <MobileOrderCard
                    key={order.id}
                    id={order.id}
                    orderRef={order.order_code}
                    areaBadge={order.area ? <Badge variant="outline" className="text-xs">{order.area}</Badge> : undefined}
                    statusBadge={
                      source ? (
                        <Badge className={sourceColors[source]}>
                          {sourceLabels[source]}
                        </Badge>
                      ) : undefined
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
                      <Button
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleActionClick(order);
                        }}
                      >
                        <Play className="h-3.5 w-3.5 mr-1" />
                        Resolve
                      </Button>
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox 
                        checked={isAllSelected}
                        onCheckedChange={toggleSelectAll}
                        aria-label="Select all"
                        className={isSomeSelected ? "data-[state=checked]:bg-primary/50" : ""}
                      />
                    </TableHead>
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
                  {actionRequiredOrders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={(canViewAll || canViewGroup) ? 11 : 10} className="text-center py-8 text-muted-foreground">
                        No orders requiring action
                      </TableCell>
                    </TableRow>
                  ) : (
                    actionRequiredOrders.map(order => (
                      <TableRow key={order.id} className={selectedRows.has(order.id) ? "bg-muted/50" : ""}>
                        <TableCell>
                          <Checkbox 
                            checked={selectedRows.has(order.id)}
                            onCheckedChange={() => toggleRow(order.id)}
                            aria-label={`Select ${order.order_code}`}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm">{order.order_code}</TableCell>
                        {(canViewAll || canViewGroup) && (
                          <TableCell>
                            <span className="text-sm">
                              {salespersons.find(sp => sp.id === order.salesperson_id)?.display_name || '-'}
                            </span>
                          </TableCell>
                        )}
                        <TableCell>
                          <div>
                            <div className="font-medium">{order.customer_name}</div>
                            <WhatsAppPhoneLinkCompact order={order} className="text-xs" />
                          </div>
                        </TableCell>
                        <TableCell>
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
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const source = getActionSource(order);
                            if (!source) return '-';
                            return (
                              <Badge className={sourceColors[source]}>
                                {sourceLabels[source]}
                              </Badge>
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          {order.next_delivery_date ? (
                            <div className="flex items-center gap-1 text-sm">
                              <CalendarClock className="h-3 w-3" />
                              {format(parseISO(order.next_delivery_date), 'dd MMM yyyy')}
                            </div>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell className="text-sm text-red-600 max-w-[120px]">
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
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant="outline" className="text-xs w-fit">
                              {order.status}
                            </Badge>
                            {order.runner_status && order.runner_status !== 'UNASSIGNED' && (
                              <span className="text-xs text-muted-foreground">{order.runner_status}</span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            className="h-7"
                            onClick={() => handleActionClick(order)}
                          >
                            <Play className="h-3.5 w-3.5 mr-1" />
                            Action
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Single Action Resolution Dialog */}
      <ActionResolutionDialog
        order={selectedOrder}
        open={actionDialogOpen}
        onOpenChange={setActionDialogOpen}
        onSuccess={() => refetch()}
      />

      {/* Bulk Action Resolution Dialog */}
      <BulkActionResolutionDialog
        orders={selectedOrders}
        open={bulkDialogOpen}
        onOpenChange={setBulkDialogOpen}
        onSuccess={handleBulkSuccess}
      />
    </AppLayout>
  );
}
