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
  CalendarClock, Loader2, RefreshCw, Play, ListChecks 
} from 'lucide-react';
import type { Order } from '@/types/database';

const actionTypeColors: Record<string, string> = {
  FOLLOWUP_CUSTOMER: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  RESCHEDULE_DELIVERY: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  UPDATE_ADDRESS: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300',
  CANCEL_ORDER: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

const actionTypeLabels: Record<string, string> = {
  FOLLOWUP_CUSTOMER: 'Followup Customer',
  RESCHEDULE_DELIVERY: 'Reschedule Delivery',
  UPDATE_ADDRESS: 'Update Address',
  CANCEL_ORDER: 'Cancel Order',
};

const outcomeLabels: Record<string, string> = {
  CONFIRM_DELIVERED: 'Confirmed Delivered',
  CONFIRM_FAILED: 'Confirmed Failed',
  RESCHEDULE: 'Rescheduled',
  NEED_SALESPERSON_FOLLOWUP: 'Needs Followup',
};

export default function SalespersonActionInbox() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: allOrders = [], isLoading, refetch } = useOrders();
  
  const [actionTypeFilter, setActionTypeFilter] = useState<string>('all');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [actionDialogOpen, setActionDialogOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);

  // Filter orders requiring salesperson action (for current salesperson)
  const actionRequiredOrders = useMemo(() => {
    let filtered = allOrders.filter(order => 
      order.salesperson_action_required === true &&
      order.salesperson_id === profile?.id
    );

    if (actionTypeFilter !== 'all') {
      filtered = filtered.filter(o => o.salesperson_action_type === actionTypeFilter);
    }

    return filtered;
  }, [allOrders, profile?.id, actionTypeFilter]);

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
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">
                {actionRequiredOrders.filter(o => o.salesperson_action_type === 'FOLLOWUP_CUSTOMER').length}
              </div>
              <div className="text-sm text-muted-foreground">Followup</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">
                {actionRequiredOrders.filter(o => o.salesperson_action_type === 'RESCHEDULE_DELIVERY').length}
              </div>
              <div className="text-sm text-muted-foreground">Reschedule</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">
                {actionRequiredOrders.filter(o => o.salesperson_action_type === 'UPDATE_ADDRESS').length}
              </div>
              <div className="text-sm text-muted-foreground">Update Address</div>
            </CardContent>
          </Card>
        </div>

        {/* Filter + Bulk Actions */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <Label className="text-xs">Action Type</Label>
                <Select value={actionTypeFilter} onValueChange={setActionTypeFilter}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="FOLLOWUP_CUSTOMER">Followup Customer</SelectItem>
                    <SelectItem value="RESCHEDULE_DELIVERY">Reschedule Delivery</SelectItem>
                    <SelectItem value="UPDATE_ADDRESS">Update Address</SelectItem>
                    <SelectItem value="CANCEL_ORDER">Cancel Order</SelectItem>
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
                  <TableHead>Action Type</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Runner Comment</TableHead>
                  <TableHead>Due Date</TableHead>
                  <TableHead>Reviewed By</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {actionRequiredOrders.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
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
                        {order.salesperson_action_type && (
                          <Badge className={actionTypeColors[order.salesperson_action_type] || ''}>
                            {actionTypeLabels[order.salesperson_action_type] || order.salesperson_action_type}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {order.runner_final_outcome && (
                          <span className="text-sm">
                            {outcomeLabels[order.runner_final_outcome] || order.runner_final_outcome}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-red-600">
                        {order.runner_failed_reason_id ? reasonsMap[order.runner_failed_reason_id] || '-' : '-'}
                      </TableCell>
                      <TableCell className="max-w-[200px]">
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
                        {order.salesperson_action_due_date ? (
                          <div className="flex items-center gap-1 text-sm">
                            <CalendarClock className="h-3 w-3" />
                            {format(parseISO(order.salesperson_action_due_date), 'dd MMM')}
                          </div>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <User className="h-3 w-3" />
                          {order.runner_reviewed_by ? reviewersMap[order.runner_reviewed_by] || '-' : '-'}
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
