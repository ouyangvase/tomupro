import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrders, useUpdateOrder } from '@/hooks/useOrders';
import { useDriverMarkDelivered, useDriverMarkFailed, useDriverParentRunner } from '@/hooks/useDrivers';
import { useReasons } from '@/hooks/useReasons';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Check, X, Phone, MapPin, Package, User, Calendar, Loader2, Truck, Filter } from 'lucide-react';
import { format, isToday, isTomorrow, isYesterday, parseISO } from 'date-fns';

const driverStatusColors: Record<string, string> = {
  ASSIGNED: 'bg-blue-100 text-blue-800 border-blue-200',
  OUT_FOR_DELIVERY: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  DRIVER_DELIVERED: 'bg-green-100 text-green-800 border-green-200',
  DRIVER_FAILED: 'bg-red-100 text-red-800 border-red-200',
};

export default function DriverInbox() {
  const { profile } = useAuth();
  const { data: orders = [], isLoading } = useOrders();
  const { data: parentRunner } = useDriverParentRunner();
  const { data: failedReasons = [] } = useReasons('FAILED_DELIVERY');
  const markDelivered = useDriverMarkDelivered();
  const markFailed = useDriverMarkFailed();
  const updateOrder = useUpdateOrder();

  const [failedDialogOpen, setFailedDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [failedReason, setFailedReason] = useState('');
  const [failedRemark, setFailedRemark] = useState('');
  const [nextDeliveryDate, setNextDeliveryDate] = useState('');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | 'tomorrow' | 'past'>('today');

  // Filter orders assigned to this driver
  const myOrders = useMemo(() => {
    return orders.filter(order => order.driver_id === profile?.id);
  }, [orders, profile?.id]);

  // Apply date filter
  const filteredOrders = useMemo(() => {
    return myOrders.filter(order => {
      if (dateFilter === 'all') return true;
      const orderDate = order.order_date ? parseISO(order.order_date) : new Date();
      if (dateFilter === 'today') return isToday(orderDate);
      if (dateFilter === 'tomorrow') return isTomorrow(orderDate);
      if (dateFilter === 'past') return orderDate < new Date() && !isToday(orderDate);
      return true;
    });
  }, [myOrders, dateFilter]);

  const pendingOrders = filteredOrders.filter(o => 
    o.driver_status === 'ASSIGNED' || o.driver_status === 'OUT_FOR_DELIVERY'
  );
  const deliveredOrders = filteredOrders.filter(o => o.driver_status === 'DRIVER_DELIVERED');
  const failedOrdersList = filteredOrders.filter(o => o.driver_status === 'DRIVER_FAILED');

  const handleMarkDelivered = async (orderId: string) => {
    await markDelivered.mutateAsync(orderId);
  };

  const handleToggleOutForDelivery = async (orderId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ASSIGNED' ? 'OUT_FOR_DELIVERY' : 'ASSIGNED';
    await updateOrder.mutateAsync({
      id: orderId,
      driver_status: newStatus,
    });
  };

  const handleOpenFailedDialog = (orderId: string) => {
    setSelectedOrder(orderId);
    setFailedReason('');
    setFailedRemark('');
    setNextDeliveryDate('');
    setFailedDialogOpen(true);
  };

  const handleSubmitFailed = async () => {
    if (!selectedOrder || !failedReason) return;
    
    await markFailed.mutateAsync({
      orderId: selectedOrder,
      reason: failedReason,
      remark: failedRemark,
      nextDeliveryDate: nextDeliveryDate || undefined,
    });
    
    setFailedDialogOpen(false);
    setSelectedOrder(null);
  };

  const getDateLabel = (dateStr: string) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'dd MMM');
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
      <div className="space-y-6">
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-bold">My Deliveries</h1>
        {parentRunner && (
          <p className="text-muted-foreground text-sm">
            Runner: {parentRunner.display_name}
          </p>
        )}
      </div>

      {/* Date Filter */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
        <Button
          size="sm"
          variant={dateFilter === 'today' ? 'default' : 'outline'}
          onClick={() => setDateFilter('today')}
        >
          Today
        </Button>
        <Button
          size="sm"
          variant={dateFilter === 'tomorrow' ? 'default' : 'outline'}
          onClick={() => setDateFilter('tomorrow')}
        >
          Tomorrow
        </Button>
        <Button
          size="sm"
          variant={dateFilter === 'past' ? 'default' : 'outline'}
          onClick={() => setDateFilter('past')}
        >
          Past
        </Button>
        <Button
          size="sm"
          variant={dateFilter === 'all' ? 'default' : 'outline'}
          onClick={() => setDateFilter('all')}
        >
          All
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        <Card className="p-3">
          <div className="text-2xl font-bold text-center">{pendingOrders.length}</div>
          <div className="text-xs text-center text-muted-foreground">Pending</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold text-center text-green-600">{deliveredOrders.length}</div>
          <div className="text-xs text-center text-muted-foreground">Delivered</div>
        </Card>
        <Card className="p-3">
          <div className="text-2xl font-bold text-center text-red-600">{failedOrdersList.length}</div>
          <div className="text-xs text-center text-muted-foreground">Failed</div>
        </Card>
      </div>

      {/* Pending Orders */}
      {pendingOrders.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Pending Deliveries</h2>
          <div className="space-y-3">
            {pendingOrders.map(order => (
              <Card key={order.id} className="overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-base flex items-center gap-2">
                        {order.order_code}
                        <span className="text-xs text-muted-foreground font-normal">
                          {getDateLabel(order.order_date)}
                        </span>
                      </CardTitle>
                      <div className="flex gap-2 mt-1">
                        <Badge className={driverStatusColors[order.driver_status || 'ASSIGNED']}>
                          {order.driver_status?.replace('_', ' ')}
                        </Badge>
                        {order.driver_status === 'ASSIGNED' && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 text-xs"
                            onClick={() => handleToggleOutForDelivery(order.id, order.driver_status || 'ASSIGNED')}
                          >
                            <Truck className="h-3 w-3 mr-1" />
                            Start Delivery
                          </Button>
                        )}
                        {order.driver_status === 'OUT_FOR_DELIVERY' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs"
                            onClick={() => handleToggleOutForDelivery(order.id, order.driver_status || 'ASSIGNED')}
                          >
                            Reset
                          </Button>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">RM {order.total_amount}</div>
                      <div className="text-xs text-muted-foreground">{order.payment_method}</div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{order.customer_name}</span>
                  </div>
                  <a href={`tel:${order.phone}`} className="flex items-center gap-2 text-sm text-primary">
                    <Phone className="h-4 w-4" />
                    <span>{order.phone}</span>
                  </a>
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                    <span className="flex-1">{order.address}</span>
                  </div>
                  {order.area && (
                    <Badge variant="outline" className="text-xs">{order.area}</Badge>
                  )}
                  {order.order_items && order.order_items.length > 0 && (
                    <div className="flex items-start gap-2 text-sm border-t pt-2 mt-2">
                      <Package className="h-4 w-4 text-muted-foreground mt-0.5" />
                      <div className="flex-1">
                        {order.order_items.map(item => (
                          <div key={item.id} className="text-xs">
                            {item.sku_label || 'Item'} x{item.qty}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {/* Action Buttons */}
                  <div className="flex gap-2 pt-3 border-t mt-3">
                    <Button 
                      className="flex-1" 
                      variant="default"
                      onClick={() => handleMarkDelivered(order.id)}
                      disabled={markDelivered.isPending}
                    >
                      <Check className="h-4 w-4 mr-1" />
                      Delivered
                    </Button>
                    <Button 
                      className="flex-1" 
                      variant="destructive"
                      onClick={() => handleOpenFailedDialog(order.id)}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Failed
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Delivered Orders (Pending Acceptance) */}
      {deliveredOrders.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Pending Runner Acceptance</h2>
          <div className="space-y-3">
            {deliveredOrders.map(order => (
              <Card key={order.id} className="overflow-hidden border-green-200 bg-green-50">
                <CardContent className="p-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <div className="font-medium">{order.order_code}</div>
                      <div className="text-sm text-muted-foreground">{order.customer_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {order.driver_delivered_at && format(new Date(order.driver_delivered_at), 'dd MMM HH:mm')}
                      </div>
                    </div>
                    <Badge className="bg-yellow-100 text-yellow-800">
                      Awaiting Acceptance
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Failed Orders */}
      {failedOrdersList.length > 0 && (
        <div className="mb-6">
          <h2 className="text-lg font-semibold mb-3">Failed Deliveries</h2>
          <div className="space-y-3">
            {failedOrdersList.map(order => (
              <Card key={order.id} className="overflow-hidden border-red-200 bg-red-50">
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{order.order_code}</div>
                      <div className="text-sm text-muted-foreground">{order.customer_name}</div>
                      <div className="text-xs text-red-600 mt-1">
                        {order.driver_failed_reason}
                      </div>
                    </div>
                    {order.driver_next_delivery_date && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(order.driver_next_delivery_date), 'dd MMM')}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {filteredOrders.length === 0 && (
        <div className="text-center py-12">
          <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h3 className="text-lg font-medium">No deliveries {dateFilter !== 'all' ? `for ${dateFilter}` : ''}</h3>
          <p className="text-muted-foreground text-sm">
            {dateFilter !== 'all' ? 'Try a different filter or ' : ''}Wait for your runner to assign orders
          </p>
        </div>
      )}

      {/* Failed Dialog */}
      <Dialog open={failedDialogOpen} onOpenChange={setFailedDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Delivery Failed</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Reason *</Label>
              <Select value={failedReason} onValueChange={setFailedReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {failedReasons.map(r => (
                    <SelectItem key={r.id} value={r.label}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Remark</Label>
              <Textarea 
                value={failedRemark} 
                onChange={e => setFailedRemark(e.target.value)}
                placeholder="Additional details..."
              />
            </div>
            <div>
              <Label>Next Delivery Date</Label>
              <Input 
                type="date" 
                value={nextDeliveryDate}
                onChange={e => setNextDeliveryDate(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFailedDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={handleSubmitFailed}
              disabled={!failedReason || markFailed.isPending}
            >
              {markFailed.isPending ? 'Submitting...' : 'Submit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </AppLayout>
  );
}
