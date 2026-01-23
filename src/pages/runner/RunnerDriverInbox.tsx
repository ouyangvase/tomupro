import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useRunnerDriverOrders, useMyDrivers, useBulkAssignOrdersToDriver, useUnassignDriverFromOrder, useRunnerAcceptDelivery, useRunnerRejectDelivery, useDriverOrderCount } from '@/hooks/useDrivers';
import { useManualReopenOrder } from '@/hooks/useRescheduleHistory';
import { useRevertDelivery } from '@/hooks/useRevertDelivery';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { 
  Truck, Users, CheckCircle, XCircle, Clock, Package, 
  MapPin, Calendar,
  Loader2, RefreshCw, User, ExternalLink, ArrowRight, ClipboardCheck, RotateCcw, History, Undo2
} from 'lucide-react';
import { RunnerReviewModal } from '@/components/runner/RunnerReviewModal';
import { RevertDeliveryDialog } from '@/components/admin/RevertDeliveryDialog';
import { WhatsAppPhoneLink } from '@/components/orders/WhatsAppPhoneLink';
import { toast } from 'sonner';
import { formatOrderItemsDisplay } from '@/lib/orderItemsDisplay';
import type { Order } from '@/types/database';

const driverStatusColors: Record<string, string> = {
  UNASSIGNED: 'bg-muted text-muted-foreground',
  ASSIGNED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  OUT_FOR_DELIVERY: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  DRIVER_DELIVERED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  DRIVER_FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  RETURN_REQUIRED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
};

const runnerAcceptColors: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  ACCEPTED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
};

export default function RunnerDriverInbox() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';
  const { data: orders = [], isLoading, refetch } = useRunnerDriverOrders();
  const { data: myDrivers = [] } = useMyDrivers();
  const bulkAssign = useBulkAssignOrdersToDriver();
  const unassignDriver = useUnassignDriverFromOrder();
  const acceptDelivery = useRunnerAcceptDelivery();
  const rejectDelivery = useRunnerRejectDelivery();
  const manualReopen = useManualReopenOrder();
  const revertDelivery = useRevertDelivery();

  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string>('');
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectOrderId, setRejectOrderId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  
  // Runner Review Modal state
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewOrder, setReviewOrder] = useState<any>(null);
  
  // Revert Delivery Dialog state (Admin only)
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [revertOrderData, setRevertOrderData] = useState<any>(null);
  
  // Filters for Driver Updates tab
  const [driverFilter, setDriverFilter] = useState<string>('all');
  const [driverStatusFilter, setDriverStatusFilter] = useState<string>('all');
  const [areaFilter, setAreaFilter] = useState<string>('all');
  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>('all');

  // Driver workload info
  const { data: selectedDriverOrderCount } = useDriverOrderCount(selectedDriver || undefined);

  // Set up realtime subscription for live updates
  useEffect(() => {
    const channel = supabase
      .channel('runner-driver-inbox')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['runner-driver-orders'] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  // TAB A: Orders eligible for assignment (includes failed/rescheduled orders that can be re-assigned)
  const assignableOrders = useMemo(() => {
    return orders.filter(order => {
      // Orders that can be assigned to drivers
      // Include: NEW, TAKEN, FAILED, RESCHEDULED orders without active driver
      const isAssignable = 
        order.runner_status !== 'DELIVERED' &&
        order.status !== 'CANCELLED' &&
        (
          order.driver_id === null || 
          order.driver_status === 'UNASSIGNED' ||
          // Allow re-assignment of failed orders
          order.driver_status === 'DRIVER_FAILED' ||
          order.operational_status === 'DRIVER_FAILED' ||
          order.operational_status === 'RESCHEDULED' ||
          order.operational_status === 'NEW'
        );
      return isAssignable;
    });
  }, [orders]);

  // TAB B: All driver-assigned orders for tracking
  const driverUpdatesOrders = useMemo(() => {
    let filtered = orders.filter(order => 
      order.driver_id !== null && 
      order.status !== 'CANCELLED'
    );

    if (driverFilter !== 'all') {
      filtered = filtered.filter(o => o.driver_id === driverFilter);
    }
    if (driverStatusFilter !== 'all') {
      filtered = filtered.filter(o => o.driver_status === driverStatusFilter);
    }
    if (areaFilter !== 'all') {
      filtered = filtered.filter(o => o.area === areaFilter);
    }
    if (reviewStatusFilter !== 'all') {
      if (reviewStatusFilter === 'REVIEWED') {
        filtered = filtered.filter(o => o.runner_review_status === 'REVIEWED');
      } else if (reviewStatusFilter === 'PENDING') {
        filtered = filtered.filter(o => !o.runner_review_status || o.runner_review_status === 'NOT_REVIEWED');
      }
    }

    return filtered;
  }, [orders, driverFilter, driverStatusFilter, areaFilter, reviewStatusFilter]);

  // TAB C: Orders pending runner acceptance
  const pendingAcceptanceOrders = useMemo(() => {
    return orders.filter(order => 
      order.driver_status === 'DRIVER_DELIVERED' &&
      order.runner_accept_status === 'PENDING'
    );
  }, [orders]);

  // Get unique areas for filter
  const areaOptions = useMemo(() => {
    const areas = [...new Set(orders.map(o => o.area).filter(Boolean))];
    return areas.sort();
  }, [orders]);

  // Handle row selection
  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedRows(assignableOrders.map(o => o.id));
    } else {
      setSelectedRows([]);
    }
  };

  const handleSelectRow = (orderId: string, checked: boolean) => {
    if (checked) {
      setSelectedRows([...selectedRows, orderId]);
    } else {
      setSelectedRows(selectedRows.filter(id => id !== orderId));
    }
  };

  // Handle bulk assign
  const handleBulkAssign = () => {
    if (!selectedDriver || selectedRows.length === 0) return;
    bulkAssign.mutate(
      { orderIds: selectedRows, driverId: selectedDriver },
      { onSuccess: () => setSelectedRows([]) }
    );
  };

  // Handle accept delivery
  const handleAccept = (orderId: string) => {
    acceptDelivery.mutate(orderId);
  };

  // Handle reject delivery
  const handleOpenRejectDialog = (orderId: string) => {
    setRejectOrderId(orderId);
    setRejectReason('');
    setRejectDialogOpen(true);
  };

  const handleSubmitReject = () => {
    if (!rejectOrderId || !rejectReason.trim()) return;
    rejectDelivery.mutate(
      { orderId: rejectOrderId, reason: rejectReason },
      { onSuccess: () => setRejectDialogOpen(false) }
    );
  };

  // Handle NEXT button click
  const handleOpenReviewModal = (order: any) => {
    setReviewOrder(order);
    setReviewModalOpen(true);
  };

  // Handle manual reopen
  const handleManualReopen = (orderId: string) => {
    manualReopen.mutate(orderId, {
      onSuccess: () => {
        toast.success('Order reopened and ready for assignment');
      },
      onError: (error) => {
        toast.error(`Failed to reopen order: ${error.message}`);
      }
    });
  };

  // Handle revert delivery (Admin only)
  const handleOpenRevertDialog = (order: any) => {
    setRevertOrderData(order);
    setRevertDialogOpen(true);
  };

  const handleRevertConfirm = (reason: string) => {
    if (!revertOrderData) return;
    revertDelivery.mutate(
      { orderId: revertOrderData.id, reason },
      {
        onSuccess: () => {
          setRevertDialogOpen(false);
          setRevertOrderData(null);
        },
      }
    );
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
            <Truck className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Driver Inbox</h1>
              <p className="text-muted-foreground">Assign orders & track driver updates</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold">{assignableOrders.length}</div>
              <div className="text-sm text-muted-foreground">To Assign</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-blue-600">{driverUpdatesOrders.length}</div>
              <div className="text-sm text-muted-foreground">With Drivers</div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50 dark:bg-amber-900/10">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-amber-600">{pendingAcceptanceOrders.length}</div>
              <div className="text-sm text-muted-foreground">Pending Accept</div>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="assign">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="assign">
              <Package className="h-4 w-4 mr-2" />
              Assign Orders ({assignableOrders.length})
            </TabsTrigger>
            <TabsTrigger value="updates">
              <Users className="h-4 w-4 mr-2" />
              Driver Updates ({driverUpdatesOrders.length})
            </TabsTrigger>
            <TabsTrigger value="pending">
              <Clock className="h-4 w-4 mr-2" />
              Pending Accept ({pendingAcceptanceOrders.length})
            </TabsTrigger>
          </TabsList>

          {/* TAB A: Assign Orders */}
          <TabsContent value="assign" className="space-y-4">
            {/* Bulk Actions */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                    <SelectTrigger className="w-[200px]">
                      <SelectValue placeholder="Select driver..." />
                    </SelectTrigger>
                    <SelectContent>
                      {myDrivers.map(d => (
                        <SelectItem key={d.driver_id} value={d.driver_id}>
                          {d.driver?.display_name || 'Unknown'}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedDriver && (
                    <Badge variant="outline">
                      Outstanding: {selectedDriverOrderCount || 0} orders
                    </Badge>
                  )}
                  <Button
                    onClick={handleBulkAssign}
                    disabled={selectedRows.length === 0 || !selectedDriver || bulkAssign.isPending}
                  >
                    {bulkAssign.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Truck className="h-4 w-4 mr-2" />
                    )}
                    Assign {selectedRows.length} Order(s)
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Orders Table */}
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={selectedRows.length === assignableOrders.length && assignableOrders.length > 0}
                          onCheckedChange={handleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Order Ref</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Area</TableHead>
                      <TableHead>Items</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Payment</TableHead>
                      <TableHead>Runner Status</TableHead>
                      <TableHead>Driver</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignableOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                          No orders to assign
                        </TableCell>
                      </TableRow>
                    ) : (
                      assignableOrders.map(order => (
                        <TableRow key={order.id}>
                          <TableCell>
                            <Checkbox
                              checked={selectedRows.includes(order.id)}
                              onCheckedChange={(checked) => handleSelectRow(order.id, !!checked)}
                            />
                          </TableCell>
                          <TableCell>{format(parseISO(order.order_date), 'dd MMM')}</TableCell>
                          <TableCell className="font-mono text-sm">{order.order_code}</TableCell>
                          <TableCell>{order.customer_name}</TableCell>
                          <TableCell>
                            <WhatsAppPhoneLink order={order} />
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{order.area || '-'}</Badge>
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const { displayText, fullText, hasError, errorMessage } = formatOrderItemsDisplay(order.order_items);
                              return (
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
                              );
                            })()}
                          </TableCell>
                          <TableCell className="font-medium">BND {Number(order.total_amount).toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">{order.payment_method}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={order.runner_status === 'TAKEN' ? 'bg-yellow-100 text-yellow-800' : 'bg-blue-100 text-blue-800'}>
                              {order.runner_status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {order.driver_id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-sm">{order.driver?.display_name}</span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2"
                                  onClick={() => unassignDriver.mutate(order.id)}
                                >
                                  <XCircle className="h-3 w-3" />
                                </Button>
                              </div>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB B: Driver Updates */}
          <TabsContent value="updates" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap gap-4">
                  <div>
                    <Label className="text-xs">Driver</Label>
                    <Select value={driverFilter} onValueChange={setDriverFilter}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Drivers</SelectItem>
                        {myDrivers.map(d => (
                          <SelectItem key={d.driver_id} value={d.driver_id}>
                            {d.driver?.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Driver Status</Label>
                    <Select value={driverStatusFilter} onValueChange={setDriverStatusFilter}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Statuses</SelectItem>
                        <SelectItem value="ASSIGNED">Assigned</SelectItem>
                        <SelectItem value="OUT_FOR_DELIVERY">Out for Delivery</SelectItem>
                        <SelectItem value="DRIVER_DELIVERED">Delivered</SelectItem>
                        <SelectItem value="DRIVER_FAILED">Failed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Area</Label>
                    <Select value={areaFilter} onValueChange={setAreaFilter}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Areas</SelectItem>
                        {areaOptions.map(area => (
                          <SelectItem key={area} value={area as string}>
                            {area}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Review Status</Label>
                    <Select value={reviewStatusFilter} onValueChange={setReviewStatusFilter}>
                      <SelectTrigger className="w-[140px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="PENDING">Pending Review</SelectItem>
                        <SelectItem value="REVIEWED">Reviewed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Updates Table */}
            <Card>
              <CardContent className="p-0">
                <Table>
                <TableHeader>
                    <TableRow>
                      <TableHead>Order Ref</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Driver Status</TableHead>
                      <TableHead>Runner Accept</TableHead>
                      <TableHead>Review Status</TableHead>
                      <TableHead>Reschedules</TableHead>
                      <TableHead>Failed Reason</TableHead>
                      <TableHead>Remark</TableHead>
                      <TableHead>Next Delivery</TableHead>
                      <TableHead>Updated</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {driverUpdatesOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                          No driver orders found
                        </TableCell>
                      </TableRow>
                    ) : (
                      driverUpdatesOrders.map(order => (
                        <TableRow key={order.id}>
                          <TableCell className="font-mono text-sm">{order.order_code}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3 text-muted-foreground" />
                              {order.driver?.display_name || '-'}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={driverStatusColors[order.driver_status || 'UNASSIGNED']}>
                              {order.driver_status?.replace(/_/g, ' ') || 'UNASSIGNED'}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {order.runner_accept_status ? (
                              <Badge className={runnerAcceptColors[order.runner_accept_status] || ''}>
                                {order.runner_accept_status}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {order.runner_review_status === 'REVIEWED' ? (
                              <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                <ClipboardCheck className="h-3 w-3 mr-1" />
                                Reviewed
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">
                                Pending
                              </Badge>
                            )}
                          </TableCell>
                          {/* Reschedule count */}
                          <TableCell>
                            {order.reschedule_cycle_no && order.reschedule_cycle_no > 0 ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Badge variant="outline" className="cursor-pointer">
                                      <History className="h-3 w-3 mr-1" />
                                      {order.reschedule_cycle_no}x
                                    </Badge>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    Rescheduled {order.reschedule_cycle_no} time{order.reschedule_cycle_no > 1 ? 's' : ''}
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-red-600">
                            {order.driver_failed_reason || '-'}
                          </TableCell>
                          <TableCell className="text-sm max-w-[180px]">
                            {/* Show runner comment if reviewed, else driver remark */}
                            {order.runner_comment ? (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="truncate block text-primary font-medium">
                                      {order.runner_comment}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-[300px]">
                                    <p className="font-medium">Runner Remark:</p>
                                    <p>{order.runner_comment}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            ) : order.driver_failed_remark ? (
                              <span className="truncate block text-muted-foreground">{order.driver_failed_remark}</span>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>
                            {(order.next_delivery_date || order.driver_next_delivery_date) ? (
                              <div className="flex items-center gap-1 text-sm">
                                <Calendar className="h-3 w-3" />
                                {format(parseISO(order.next_delivery_date || order.driver_next_delivery_date!), 'dd MMM')}
                              </div>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {order.updated_at ? format(parseISO(order.updated_at), 'dd MMM HH:mm') : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-7 px-2"
                                      onClick={() => navigate(`/order/${order.id}`)}
                                    >
                                      <ExternalLink className="h-3.5 w-3.5" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>View Order</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                              {/* Manual Reopen button for rescheduled orders */}
                              {(order.operational_status === 'RESCHEDULED' || 
                                (order.runner_review_status === 'REVIEWED' && 
                                 order.runner_final_outcome === 'RESCHEDULE' &&
                                 order.next_delivery_date)) && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2"
                                        onClick={() => handleManualReopen(order.id)}
                                        disabled={manualReopen.isPending}
                                      >
                                        <RotateCcw className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Reopen Now (Skip Cron)</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {/* Admin-only Revert Delivery button */}
                              {isAdmin && (order.driver_status === 'DRIVER_DELIVERED' || order.runner_status === 'DELIVERED') && (
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        className="h-7 px-2 border-orange-300 text-orange-600 hover:bg-orange-50"
                                        onClick={() => handleOpenRevertDialog(order)}
                                        disabled={revertDelivery.isPending}
                                      >
                                        <Undo2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Revert Delivery (Admin)</TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>
                              )}
                              {/* NEXT button only shows if NOT_REVIEWED */}
                              {(!order.runner_review_status || order.runner_review_status === 'NOT_REVIEWED') && (
                                <Button
                                  size="sm"
                                  className="h-7 px-3"
                                  onClick={() => handleOpenReviewModal(order)}
                                >
                                  NEXT
                                  <ArrowRight className="h-3.5 w-3.5 ml-1" />
                                </Button>
                              )}
                              {order.runner_review_status === 'REVIEWED' && (
                                <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                  <ClipboardCheck className="h-3 w-3 mr-1" />
                                  Done
                                </Badge>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* TAB C: Pending Acceptance */}
          <TabsContent value="pending" className="space-y-4">
            {pendingAcceptanceOrders.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <CheckCircle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No deliveries pending acceptance</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {pendingAcceptanceOrders.map(order => (
                  <Card key={order.id} className="border-amber-200 bg-amber-50/50 dark:bg-amber-900/10">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg">{order.order_code}</CardTitle>
                          <p className="text-sm text-muted-foreground">
                            Driver: {order.driver?.display_name}
                          </p>
                        </div>
                        <Badge className="bg-amber-100 text-amber-800">
                          Awaiting Accept
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-muted-foreground" />
                        {order.customer_name}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        {order.area || 'No area'}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Package className="h-4 w-4 text-muted-foreground" />
                        {order.order_items?.length || 0} items · BND {Number(order.total_amount).toFixed(2)}
                      </div>
                      {order.driver_delivered_at && (
                        <div className="text-xs text-muted-foreground">
                          Delivered at: {format(parseISO(order.driver_delivered_at), 'dd MMM HH:mm')}
                        </div>
                      )}

                      <div className="flex gap-2 pt-2">
                        <Button
                          className="flex-1"
                          onClick={() => handleAccept(order.id)}
                          disabled={acceptDelivery.isPending}
                        >
                          <CheckCircle className="h-4 w-4 mr-2" />
                          Accept
                        </Button>
                        <Button
                          className="flex-1"
                          variant="destructive"
                          onClick={() => handleOpenRejectDialog(order.id)}
                        >
                          <XCircle className="h-4 w-4 mr-2" />
                          Reject
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Reject Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Delivery</DialogTitle>
              <DialogDescription>
                Please provide a reason for rejecting this delivery. The driver will be notified.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Rejection Reason *</Label>
                <Textarea
                  value={rejectReason}
                  onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Enter reason for rejection..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={handleSubmitReject}
                disabled={!rejectReason.trim() || rejectDelivery.isPending}
              >
                {rejectDelivery.isPending ? 'Rejecting...' : 'Reject'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Runner Review Modal */}
        <RunnerReviewModal
          open={reviewModalOpen}
          onOpenChange={setReviewModalOpen}
          order={reviewOrder}
        />

        {/* Revert Delivery Dialog (Admin only) */}
        <RevertDeliveryDialog
          open={revertDialogOpen}
          onOpenChange={setRevertDialogOpen}
          order={revertOrderData}
          onConfirm={handleRevertConfirm}
          isPending={revertDelivery.isPending}
        />
      </div>
    </AppLayout>
  );
}