import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHero } from '@/components/dashboard/PageHero';
import { DispatchStatusCards } from '@/components/orders/DispatchStatusCards';
import capybaraDriver from '@/assets/capybara-driver.png';
import capybaraEmpty from '@/assets/capybara-empty.png';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useRunnerDriverOrders, useMyDrivers, useBulkAssignOrdersToDriver, useUnassignDriverFromOrder, useRunnerAcceptDelivery, useRunnerRejectDelivery, useBulkRunnerAcceptDelivery, useDriverOrderCount } from '@/hooks/useDrivers';
import { useManualReopenOrder } from '@/hooks/useRescheduleHistory';
import { useRevertDelivery } from '@/hooks/useRevertDelivery';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { 
  Truck, Users, CheckCircle, XCircle, Clock, Package, 
  Calendar, Loader2, RefreshCw, User, ExternalLink, ArrowRight, 
  ClipboardCheck, RotateCcw, History, Undo2, Search, Phone
} from 'lucide-react';
import { RunnerReviewModal } from '@/components/runner/RunnerReviewModal';
import { RevertDeliveryDialog } from '@/components/admin/RevertDeliveryDialog';
import { WhatsAppPhoneLink } from '@/components/orders/WhatsAppPhoneLink';
import { toast } from 'sonner';
import { formatOrderItemsDisplay } from '@/lib/orderItemsDisplay';
import { formatBND } from '@/lib/currency';
import { cn } from '@/lib/utils';
import type { Order } from '@/types/database';

const driverStatusColors: Record<string, string> = {
  UNASSIGNED: 'bg-muted text-muted-foreground',
  ASSIGNED: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  OUT_FOR_DELIVERY: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  DRIVER_DELIVERED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  DRIVER_FAILED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  RETURN_REQUIRED: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
};

// Visual order card row used across all tabs
function OrderCardRow({ 
  order, 
  isSelected, 
  selectable, 
  onSelect,
  actions 
}: { 
  order: any; 
  isSelected?: boolean; 
  selectable?: boolean; 
  onSelect?: (checked: boolean) => void;
  actions?: React.ReactNode;
}) {
  const { displayText } = formatOrderItemsDisplay(order.order_items);
  
  return (
    <div className={cn(
      'group rounded-lg border bg-card transition-all',
      'hover:shadow-sm hover:border-primary/15',
      isSelected && 'ring-2 ring-primary/20 border-primary/20 bg-primary/[0.02]'
    )}>
      <div className="px-4 py-3">
        {/* Line 1 */}
        <div className="flex items-center gap-4">
          {selectable && (
            <div className="shrink-0" onClick={e => e.stopPropagation()}>
              <Checkbox checked={isSelected} onCheckedChange={onSelect} className="h-4 w-4" />
            </div>
          )}

          {/* Order ID + Area */}
          <div className="w-[100px] shrink-0">
            <span className="text-sm font-bold font-mono text-foreground">{order.order_code}</span>
            <div className="mt-0.5">
              {order.area && <Badge variant="outline" className="text-[10px] font-medium px-1.5 py-0">{order.area}</Badge>}
            </div>
          </div>

          {/* Customer Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3">
              <p className="text-sm font-semibold text-foreground truncate max-w-[180px]">{order.customer_name || 'No name'}</p>
              {order.phone && (
                <span className="text-xs text-muted-foreground flex items-center gap-1 shrink-0">
                  <Phone className="h-3 w-3" />
                  {order.phone}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{order.address || 'No address'}</p>
          </div>

          {/* Amount */}
          <div className="w-[90px] shrink-0 text-right">
            <span className="text-sm font-bold tabular-nums">{formatBND(order.total_amount)}</span>
            <div className="mt-0.5">
              <span className="text-[10px] text-muted-foreground font-medium">{order.payment_method}</span>
            </div>
          </div>

          {/* Driver */}
          <div className="w-[100px] shrink-0">
            {order.driver?.display_name ? (
              <div className="flex items-center gap-1.5">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-[10px] font-bold text-primary shrink-0">
                  {order.driver.display_name.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-medium truncate">{order.driver.display_name}</span>
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">No driver</span>
            )}
          </div>

          {/* Status + Actions */}
          <div className="shrink-0 flex items-center gap-2">
            {order.driver_status && (
              <Badge className={cn(driverStatusColors[order.driver_status] || 'bg-muted', 'text-[10px] px-1.5 py-0')}>
                {(order.driver_status || '').replace(/_/g, ' ')}
              </Badge>
            )}
            {!order.driver_status && order.runner_status && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {order.runner_status.replace(/_/g, ' ')}
              </Badge>
            )}
          </div>
        </div>

        {/* Line 2: Items + actions */}
        <div className={cn("flex items-center justify-between gap-4 mt-1.5", selectable && "pl-8")}>
          <div className="flex items-center gap-3">
            <div className="w-[100px] shrink-0" />
            <p className="text-xs text-muted-foreground/70 truncate">{displayText}</p>
            {order.next_delivery_date && (
              <span className="text-[10px] text-primary flex items-center gap-1 shrink-0">
                <Calendar className="h-3 w-3" />
                Next: {format(parseISO(order.next_delivery_date), 'dd MMM')}
              </span>
            )}
          </div>
          {actions && (
            <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
              {actions}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

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
  const bulkAcceptDelivery = useBulkRunnerAcceptDelivery();
  const manualReopen = useManualReopenOrder();
  const revertDelivery = useRevertDelivery();

  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [selectedPendingRows, setSelectedPendingRows] = useState<string[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string>('');
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectOrderId, setRejectOrderId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [reviewOrder, setReviewOrder] = useState<any>(null);
  const [revertDialogOpen, setRevertDialogOpen] = useState(false);
  const [revertOrderData, setRevertOrderData] = useState<any>(null);
  const [driverFilter, setDriverFilter] = useState<string>('all');
  const [driverStatusFilter, setDriverStatusFilter] = useState<string>('all');
  const [areaFilter, setAreaFilter] = useState<string>('all');
  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [assignAreaFilter, setAssignAreaFilter] = useState<string>('all');
  const { data: selectedDriverOrderCount } = useDriverOrderCount(selectedDriver || undefined);

  useEffect(() => {
    const channel = supabase
      .channel('runner-driver-inbox')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        queryClient.invalidateQueries({ queryKey: ['runner-driver-orders'] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [queryClient]);

  // TAB A: Assignable orders
  const assignableOrders = useMemo(() => {
    let filtered = orders.filter(order => {
      return order.runner_status !== 'DELIVERED' &&
        order.status !== 'CANCELLED' &&
        (order.driver_id === null || order.driver_status === 'UNASSIGNED' || order.driver_status === 'DRIVER_FAILED' ||
          order.operational_status === 'DRIVER_FAILED' || order.operational_status === 'RESCHEDULED' || order.operational_status === 'NEW');
    });
    if (assignAreaFilter !== 'all') {
      filtered = filtered.filter(o => o.area === assignAreaFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(o =>
        o.order_code?.toLowerCase().includes(q) ||
        o.customer_name?.toLowerCase().includes(q) ||
        o.area?.toLowerCase().includes(q) ||
        o.phone?.includes(q)
      );
    }
    return filtered;
  }, [orders, searchQuery, assignAreaFilter]);

  // TAB B: Driver updates
  const driverUpdatesOrders = useMemo(() => {
    let filtered = orders.filter(order => order.driver_id !== null && order.status !== 'CANCELLED');
    if (driverFilter !== 'all') filtered = filtered.filter(o => o.driver_id === driverFilter);
    if (driverStatusFilter !== 'all') filtered = filtered.filter(o => o.driver_status === driverStatusFilter);
    if (areaFilter !== 'all') filtered = filtered.filter(o => o.area === areaFilter);
    if (reviewStatusFilter !== 'all') {
      if (reviewStatusFilter === 'REVIEWED') filtered = filtered.filter(o => o.runner_review_status === 'REVIEWED');
      else if (reviewStatusFilter === 'PENDING') filtered = filtered.filter(o => !o.runner_review_status || o.runner_review_status === 'NOT_REVIEWED');
    }
    return filtered;
  }, [orders, driverFilter, driverStatusFilter, areaFilter, reviewStatusFilter]);

  // TAB C: Pending acceptance
  const pendingAcceptanceOrders = useMemo(() => {
    return orders.filter(order => order.driver_status === 'DRIVER_DELIVERED' && order.runner_accept_status === 'PENDING');
  }, [orders]);

  const assignAreaOptions = useMemo(() => [...new Set(orders.map(o => o.area).filter(Boolean))].sort(), [orders]);

  // Active orders = non-delivered, non-cancelled (real count for stats)
  const activeOrdersCount = useMemo(() => orders.filter(o => o.runner_status !== 'DELIVERED' && o.status !== 'CANCELLED').length, [orders]);

  // Handlers
  const handleSelectAll = (checked: boolean) => setSelectedRows(checked ? assignableOrders.map(o => o.id) : []);
  const handleSelectRow = (id: string, checked: boolean) => setSelectedRows(prev => checked ? [...prev, id] : prev.filter(x => x !== id));
  const handleBulkAssign = () => {
    if (!selectedDriver || selectedRows.length === 0) return;
    bulkAssign.mutate({ orderIds: selectedRows, driverId: selectedDriver }, { onSuccess: () => setSelectedRows([]) });
  };
  const handleSelectAllPending = (checked: boolean) => setSelectedPendingRows(checked ? pendingAcceptanceOrders.map(o => o.id) : []);
  const handleSelectPendingRow = (id: string, checked: boolean) => setSelectedPendingRows(prev => checked ? [...prev, id] : prev.filter(x => x !== id));
  const handleBulkAccept = () => {
    if (selectedPendingRows.length === 0) return;
    bulkAcceptDelivery.mutate(selectedPendingRows, { onSuccess: () => setSelectedPendingRows([]) });
  };
  const handleAccept = (orderId: string) => acceptDelivery.mutate(orderId);
  const handleOpenRejectDialog = (orderId: string) => { setRejectOrderId(orderId); setRejectReason(''); setRejectDialogOpen(true); };
  const handleSubmitReject = () => {
    if (!rejectOrderId || !rejectReason.trim()) return;
    rejectDelivery.mutate({ orderId: rejectOrderId, reason: rejectReason }, { onSuccess: () => setRejectDialogOpen(false) });
  };
  const handleOpenReviewModal = (order: any) => { setReviewOrder(order); setReviewModalOpen(true); };
  const handleManualReopen = (orderId: string) => {
    manualReopen.mutate(orderId, {
      onSuccess: () => toast.success('Order reopened and ready for assignment'),
      onError: (error) => toast.error(`Failed to reopen: ${error.message}`),
    });
  };
  const handleOpenRevertDialog = (order: any) => { setRevertOrderData(order); setRevertDialogOpen(true); };
  const handleRevertConfirm = (reason: string) => {
    if (!revertOrderData) return;
    revertDelivery.mutate({ orderId: revertOrderData.id, reason }, { onSuccess: () => { setRevertDialogOpen(false); setRevertOrderData(null); } });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Loading driver inbox...</span>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-5">
        {/* Header */}
        <PageHero
          icon={<Truck className="h-6 w-6 text-primary" />}
          title="Driver Inbox"
          subtitle="Assign orders & track driver updates"
          image={capybaraDriver}
          imageAlt="Driver Capybara"
          actions={
            <Button variant="outline" size="sm" onClick={() => refetch()} className="rounded-full">
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
          }
        />

        {/* Stats Cards */}
        <DispatchStatusCards
          totalReady={activeOrdersCount}
          unassigned={assignableOrders.length}
          assigned={driverUpdatesOrders.length}
          codOrders={pendingAcceptanceOrders.length}
          labels={{
            total: 'Total Orders',
            unassigned: 'To Assign',
            assigned: 'With Drivers',
            fourth: 'Pending Accept',
          }}
          icons={{
            fourth: <Clock className="h-4 w-4" />,
          }}
        />

        <Tabs defaultValue="assign">
          <TabsList className="grid w-full grid-cols-3 rounded-xl">
            <TabsTrigger value="assign" className="rounded-lg">
              <Package className="h-4 w-4 mr-2" />
              Assign ({assignableOrders.length})
            </TabsTrigger>
            <TabsTrigger value="updates" className="rounded-lg">
              <Users className="h-4 w-4 mr-2" />
              Updates ({driverUpdatesOrders.length})
            </TabsTrigger>
            <TabsTrigger value="pending" className="rounded-lg">
              <Clock className="h-4 w-4 mr-2" />
              Pending ({pendingAcceptanceOrders.length})
            </TabsTrigger>
          </TabsList>

          {/* TAB A: Assign Orders */}
          <TabsContent value="assign" className="space-y-4">
            {/* Assignment Bar */}
            <Card className="border-primary/20 bg-primary/[0.02]">
              <CardContent className="p-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <Select value={selectedDriver} onValueChange={setSelectedDriver}>
                    <SelectTrigger className="w-[180px] rounded-lg">
                      <SelectValue placeholder="Select driver..." />
                    </SelectTrigger>
                    <SelectContent>
                      {myDrivers.map(d => (
                        <SelectItem key={d.driver_id} value={d.driver_id}>{d.driver?.display_name || 'Unknown'}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {selectedDriver && (
                    <Badge variant="outline" className="rounded-full">
                      Load: {selectedDriverOrderCount || 0} orders
                    </Badge>
                  )}
                  <Select value={assignAreaFilter} onValueChange={setAssignAreaFilter}>
                    <SelectTrigger className="w-[140px] rounded-lg">
                      <SelectValue placeholder="All Areas" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Areas</SelectItem>
                      {assignAreaOptions.map(a => (
                        <SelectItem key={a as string} value={a as string}>{a}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={handleBulkAssign} disabled={selectedRows.length === 0 || !selectedDriver || bulkAssign.isPending} className="rounded-full">
                    {bulkAssign.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Truck className="h-4 w-4 mr-1" />}
                    Assign {selectedRows.length} Order(s)
                  </Button>
                  <div className="relative flex-1 min-w-[180px] max-w-sm ml-auto">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search orders..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-9 rounded-full border-border/60 bg-card"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Select All Header */}
            {assignableOrders.length > 0 && (
              <div className="flex items-center gap-3 px-4 py-2 rounded-lg bg-secondary/50 border border-border">
                <Checkbox
                  checked={selectedRows.length === assignableOrders.length && assignableOrders.length > 0}
                  onCheckedChange={handleSelectAll}
                  className="h-4 w-4"
                />
                <span className="text-sm font-medium text-muted-foreground">
                  {selectedRows.length > 0 ? `${selectedRows.length} selected` : `Select all (${assignableOrders.length})`}
                </span>
              </div>
            )}

            {/* Order Card Rows */}
            <div className="space-y-1">
              {assignableOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <img src={capybaraEmpty} alt="No orders" className="h-20 w-20 object-contain opacity-60" />
                  <p className="text-sm font-semibold">No orders to assign</p>
                  <p className="text-xs text-muted-foreground">All orders have been assigned to drivers</p>
                </div>
              ) : (
                assignableOrders.map(order => (
                  <OrderCardRow
                    key={order.id}
                    order={order}
                    isSelected={selectedRows.includes(order.id)}
                    selectable
                    onSelect={(checked) => handleSelectRow(order.id, !!checked)}
                    actions={
                      order.driver_id ? (
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => unassignDriver.mutate(order.id)}>
                          <XCircle className="h-3.5 w-3.5 mr-1" /> Remove
                        </Button>
                      ) : undefined
                    }
                  />
                ))
              )}
            </div>
          </TabsContent>

          {/* TAB B: Driver Updates */}
          <TabsContent value="updates" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap gap-3">
                  <Select value={driverFilter} onValueChange={setDriverFilter}>
                    <SelectTrigger className="w-[150px] rounded-lg"><SelectValue placeholder="All Drivers" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Drivers</SelectItem>
                      {myDrivers.map(d => <SelectItem key={d.driver_id} value={d.driver_id}>{d.driver?.display_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={driverStatusFilter} onValueChange={setDriverStatusFilter}>
                    <SelectTrigger className="w-[160px] rounded-lg"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Statuses</SelectItem>
                      <SelectItem value="ASSIGNED">Assigned</SelectItem>
                      <SelectItem value="OUT_FOR_DELIVERY">Out for Delivery</SelectItem>
                      <SelectItem value="DRIVER_DELIVERED">Delivered</SelectItem>
                      <SelectItem value="DRIVER_FAILED">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={areaFilter} onValueChange={setAreaFilter}>
                    <SelectTrigger className="w-[130px] rounded-lg"><SelectValue placeholder="All Areas" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Areas</SelectItem>
                      {assignAreaOptions.map(a => <SelectItem key={a as string} value={a as string}>{a}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={reviewStatusFilter} onValueChange={setReviewStatusFilter}>
                    <SelectTrigger className="w-[140px] rounded-lg"><SelectValue placeholder="Review" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="PENDING">Pending</SelectItem>
                      <SelectItem value="REVIEWED">Reviewed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Update Card Rows */}
            <div className="space-y-1">
              {driverUpdatesOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <img src={capybaraEmpty} alt="" className="h-20 w-20 object-contain opacity-60" />
                  <p className="text-sm text-muted-foreground">No driver orders found</p>
                </div>
              ) : (
                driverUpdatesOrders.map(order => (
                  <OrderCardRow
                    key={order.id}
                    order={order}
                    actions={
                      <div className="flex items-center gap-1">
                        {order.reschedule_cycle_no && order.reschedule_cycle_no > 0 && (
                          <Badge variant="outline" className="text-[10px] mr-1">
                            <History className="h-3 w-3 mr-0.5" />{order.reschedule_cycle_no}x
                          </Badge>
                        )}
                        {order.runner_review_status === 'REVIEWED' && (
                          <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300 text-[10px]">
                            <ClipboardCheck className="h-3 w-3 mr-0.5" />Done
                          </Badge>
                        )}
                        {(order.operational_status === 'RESCHEDULED' || 
                          (order.runner_review_status === 'REVIEWED' && order.runner_final_outcome === 'RESCHEDULE' && order.next_delivery_date)) && (
                          <Button variant="outline" size="sm" className="h-7 px-2" onClick={() => handleManualReopen(order.id)} disabled={manualReopen.isPending}>
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {isAdmin && (order.driver_status === 'DRIVER_DELIVERED' || order.runner_status === 'DELIVERED') && (
                          <Button variant="outline" size="sm" className="h-7 px-2 border-orange-300 text-orange-600 hover:bg-orange-50" onClick={() => handleOpenRevertDialog(order)} disabled={revertDelivery.isPending}>
                            <Undo2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {(!order.runner_review_status || order.runner_review_status === 'NOT_REVIEWED') && (
                          <Button size="sm" className="h-7 px-3" onClick={() => handleOpenReviewModal(order)}>
                            NEXT <ArrowRight className="h-3.5 w-3.5 ml-1" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => navigate(`/order/${order.id}`)}>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    }
                  />
                ))
              )}
            </div>
          </TabsContent>

          {/* TAB C: Pending Acceptance */}
          <TabsContent value="pending" className="space-y-4">
            {pendingAcceptanceOrders.length > 0 && (
              <Card className="border-primary/20 bg-primary/[0.02]">
                <CardContent className="p-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Checkbox
                        checked={selectedPendingRows.length === pendingAcceptanceOrders.length && pendingAcceptanceOrders.length > 0}
                        onCheckedChange={handleSelectAllPending}
                      />
                      <span className="text-sm font-medium">
                        {selectedPendingRows.length > 0 ? `${selectedPendingRows.length} selected` : 'Select All'}
                      </span>
                    </div>
                    <Button onClick={handleBulkAccept} disabled={selectedPendingRows.length === 0 || bulkAcceptDelivery.isPending} className="bg-green-600 hover:bg-green-700 rounded-full">
                      {bulkAcceptDelivery.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-1" />}
                      Accept {selectedPendingRows.length > 0 ? `(${selectedPendingRows.length})` : 'Selected'}
                    </Button>
                    {selectedPendingRows.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setSelectedPendingRows([])}>Clear</Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="space-y-1">
              {pendingAcceptanceOrders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                  <CheckCircle className="h-12 w-12 text-muted-foreground/30" />
                  <p className="text-sm text-muted-foreground">No deliveries pending acceptance</p>
                </div>
              ) : (
                pendingAcceptanceOrders.map(order => (
                  <OrderCardRow
                    key={order.id}
                    order={order}
                    isSelected={selectedPendingRows.includes(order.id)}
                    selectable
                    onSelect={(checked) => handleSelectPendingRow(order.id, !!checked)}
                    actions={
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50" onClick={() => handleAccept(order.id)} disabled={acceptDelivery.isPending}>
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleOpenRejectDialog(order.id)}>
                          <XCircle className="h-4 w-4" />
                        </Button>
                      </div>
                    }
                  />
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Reject Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Delivery</DialogTitle>
              <DialogDescription>Please provide a reason for rejecting this delivery.</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Rejection Reason *</Label>
                <Textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="Enter reason..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleSubmitReject} disabled={!rejectReason.trim() || rejectDelivery.isPending}>
                {rejectDelivery.isPending ? 'Rejecting...' : 'Reject'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <RunnerReviewModal open={reviewModalOpen} onOpenChange={setReviewModalOpen} order={reviewOrder} />
        <RevertDeliveryDialog open={revertDialogOpen} onOpenChange={setRevertDialogOpen} order={revertOrderData} onConfirm={handleRevertConfirm} isPending={revertDelivery.isPending} />
      </div>
    </AppLayout>
  );
}
