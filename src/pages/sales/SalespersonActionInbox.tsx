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
import { useOrders } from '@/hooks/useOrders';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { ActionResolutionDialog } from '@/components/sales/ActionResolutionDialog';
import { BulkActionResolutionDialog } from '@/components/sales/BulkActionResolutionDialog';
import { 
  AlertCircle, MessageSquare, User, 
  CalendarClock, Loader2, RefreshCw, Play, ListChecks, XCircle, Calendar, AlertTriangle
} from 'lucide-react';
import type { Order } from '@/types/database';

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
// Only orders with salesperson_action_required = true are shown
function needsSalespersonAction(order: Order): boolean {
  // Primary filter: only show if explicitly marked as action required
  return order.salesperson_action_required === true;
}

export default function SalespersonActionInbox() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: allOrders = [], isLoading, refetch } = useOrders();
  
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  // Filter orders requiring salesperson action (for current salesperson)
  const actionRequiredOrders = useMemo(() => {
    let filtered = allOrders.filter(order => 
      order.salesperson_id === profile?.id &&
      needsSalespersonAction(order)
    );

    if (sourceFilter !== 'all') {
      filtered = filtered.filter(o => getActionSource(o) === sourceFilter);
    }

    return filtered;
  }, [allOrders, profile?.id, sourceFilter]);

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
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertCircle className="h-8 w-8 text-orange-500" />
            <div>
              <h1 className="text-2xl font-bold">Action Required</h1>
              <p className="text-muted-foreground">Orders requiring your attention with runner notes</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-4">
          <Card className="border-orange-200 bg-orange-50 dark:bg-orange-900/10">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-orange-600">{actionRequiredOrders.length}</div>
              <div className="text-sm text-muted-foreground">Total Pending</div>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50 dark:bg-red-900/10">
            <CardContent className="p-4 flex items-center gap-3">
              <XCircle className="h-5 w-5 text-red-500" />
              <div>
                <div className="text-2xl font-bold text-red-600">
                  {actionRequiredOrders.filter(o => getActionSource(o) === 'FAILED_DELIVERY').length}
                </div>
                <div className="text-sm text-muted-foreground">Failed Delivery</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-yellow-200 bg-yellow-50 dark:bg-yellow-900/10">
            <CardContent className="p-4 flex items-center gap-3">
              <Calendar className="h-5 w-5 text-yellow-500" />
              <div>
                <div className="text-2xl font-bold text-yellow-600">
                  {actionRequiredOrders.filter(o => getActionSource(o) === 'RESCHEDULED').length}
                </div>
                <div className="text-sm text-muted-foreground">Rescheduled</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/10">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-blue-500" />
              <div>
                <div className="text-2xl font-bold text-blue-600">
                  {actionRequiredOrders.filter(o => 
                    getActionSource(o) === 'RUNNER_FLAGGED' || getActionSource(o) === 'MANUAL'
                  ).length}
                </div>
                <div className="text-sm text-muted-foreground">Runner Notes</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filter + Bulk Actions */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <Label className="text-xs">Action Type</Label>
              <Select value={sourceFilter} onValueChange={setSourceFilter}>
                  <SelectTrigger className="w-[180px]">
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
              
              {selectedRows.size > 0 && (
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="text-sm">
                    Selected: {selectedRows.size}
                  </Badge>
                  <Button size="sm" onClick={() => setBulkDialogOpen(true)}>
                    <ListChecks className="h-4 w-4 mr-2" />
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

        {/* Table */}
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
                  <TableHead>Customer</TableHead>
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
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
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
                      <TableCell>
                        <div>
                          <div className="font-medium">{order.customer_name}</div>
                          <div className="text-xs text-muted-foreground">{order.phone}</div>
                        </div>
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
                        {order.runner_failed_reason_id ? (
                          <span className="truncate block">{reasonsMap[order.runner_failed_reason_id] || '-'}</span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="max-w-[180px]">
                        {order.runner_comment ? (
                          <div className="flex items-start gap-1">
                            <MessageSquare className="h-3 w-3 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <span className="text-sm truncate">{order.runner_comment}</span>
                          </div>
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
