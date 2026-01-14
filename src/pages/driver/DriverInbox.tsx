import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrders, useUpdateOrder } from '@/hooks/useOrders';
import { useDriverMarkDelivered, useDriverMarkFailed, useDriverParentRunner } from '@/hooks/useDrivers';
import { useReasons } from '@/hooks/useReasons';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Check, X, MapPin, Package, User, Calendar, Loader2, Truck, Navigation, ChevronDown, ChevronUp } from 'lucide-react';
import { WhatsAppPhoneLink } from '@/components/orders/WhatsAppPhoneLink';
import LocationTracker from '@/components/driver/LocationTracker';
import { MobileActionSheet } from '@/components/mobile/MobileActionSheet';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { formatBND } from '@/lib/currency';
import { cn } from '@/lib/utils';

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
  const [deliveredDialogOpen, setDeliveredDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [selectedOrderDetails, setSelectedOrderDetails] = useState<any>(null);
  const [failedReason, setFailedReason] = useState('');
  const [failedRemark, setFailedRemark] = useState('');
  const [nextDeliveryDate, setNextDeliveryDate] = useState('');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  // Filter orders assigned to this driver
  const myOrders = useMemo(() => {
    return orders.filter(order => order.driver_id === profile?.id);
  }, [orders, profile?.id]);

  // Get delivery date for an order (use next_delivery_date if set, else expected_pickup_date, else order_date)
  const getDeliveryDate = (order: any): Date => {
    if (order.next_delivery_date) return parseISO(order.next_delivery_date);
    if (order.expected_pickup_date) return parseISO(order.expected_pickup_date);
    if (order.order_date) return parseISO(order.order_date);
    return new Date();
  };

  // Get ALL assigned driver orders (no date filtering)
  const filteredOrders = useMemo(() => {
    return myOrders.filter(order => {
      // Only show orders with active driver statuses
      return ['ASSIGNED', 'OUT_FOR_DELIVERY', 'DRIVER_DELIVERED', 'DRIVER_FAILED'].includes(order.driver_status || '');
    });
  }, [myOrders]);

  // Open Google Maps with address
  const openGoogleMaps = (address: string) => {
    const encodedAddress = encodeURIComponent(address);
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodedAddress}`, '_blank');
  };

  // Format order items to show SKU codes with product names
  const formatOrderItems = (orderItems: any[]) => {
    if (!orderItems || orderItems.length === 0) return [];
    return orderItems.map(item => {
      const skuCode = item.product?.sku_code || item.sku_label || 'UNKNOWN';
      const skuName = item.product?.sku_name || 'UNKNOWN';
      return {
        skuCode,
        skuName,
        displayLabel: `${skuCode}/${skuName}`,
        qty: item.qty,
        price: item.line_total || item.price * item.qty,
      };
    });
  };

  // Count stats for selected tab
  const pendingOrders = filteredOrders.filter(o => 
    o.driver_status === 'ASSIGNED' || o.driver_status === 'OUT_FOR_DELIVERY'
  );
  const deliveredPendingAcceptance = filteredOrders.filter(o => 
    o.driver_status === 'DRIVER_DELIVERED' && o.runner_accept_status !== 'ACCEPTED'
  );
  const failedOrdersList = filteredOrders.filter(o => o.driver_status === 'DRIVER_FAILED');

  const handleMarkDelivered = async (orderId: string) => {
    await markDelivered.mutateAsync(orderId);
    setDeliveredDialogOpen(false);
    setSelectedOrder(null);
    setSelectedOrderDetails(null);
  };

  const handleOpenDeliveredDialog = (order: any) => {
    setSelectedOrder(order.id);
    setSelectedOrderDetails(order);
    setDeliveredDialogOpen(true);
  };
  const handleToggleOutForDelivery = async (orderId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'ASSIGNED' ? 'OUT_FOR_DELIVERY' : 'ASSIGNED';
    await updateOrder.mutateAsync({
      id: orderId,
      driver_status: newStatus,
    });
  };

  const handleOpenFailedDialog = (order: any) => {
    setSelectedOrder(order.id);
    setSelectedOrderDetails(order);
    setFailedReason('');
    setFailedRemark('');
    setNextDeliveryDate('');
    setFailedDialogOpen(true);
  };

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

  const getDateLabel = (order: any) => {
    const date = getDeliveryDate(order);
    if (isToday(date)) return 'Today';
    if (isTomorrow(date)) return 'Tomorrow';
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
        {/* Location Tracker - shows location sharing status */}
        <LocationTracker />

        {/* Header */}
        <div className="mb-4">
          <h1 className="text-2xl font-bold">My Deliveries</h1>
          {parentRunner && (
            <p className="text-muted-foreground text-sm">
              Runner: {parentRunner.display_name}
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <Card className="p-3">
            <div className="text-2xl font-bold text-center">{pendingOrders.length}</div>
            <div className="text-xs text-center text-muted-foreground">Pending</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-center text-amber-600">{deliveredPendingAcceptance.length}</div>
            <div className="text-xs text-center text-muted-foreground">Delivered (Pending)</div>
          </Card>
          <Card className="p-3">
            <div className="text-2xl font-bold text-center text-red-600">{failedOrdersList.length}</div>
            <div className="text-xs text-center text-muted-foreground">Failed</div>
          </Card>
        </div>

        {/* Pending Orders */}
        {pendingOrders.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">Pending Deliveries ({pendingOrders.length})</h2>
            <div className="space-y-3">
              {pendingOrders.map(order => {
                const items = formatOrderItems(order.order_items || []);
                return (
                  <Card key={order.id} className="overflow-hidden">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            {order.order_code}
                            <span className="text-xs text-muted-foreground font-normal">
                              {getDateLabel(order)}
                            </span>
                          </CardTitle>
                          <div className="flex gap-2 mt-1 flex-wrap">
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
                          <div className="font-bold">{formatBND(order.total_amount)}</div>
                          <div className="text-xs text-muted-foreground">{order.payment_method}</div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {/* Customer Info */}
                      <div className="flex items-center gap-2 text-sm">
                        <User className="h-4 w-4 text-muted-foreground" />
                        <span className="font-medium">{order.customer_name}</span>
                      </div>
                      
                      {/* Phone - WhatsApp click-to-chat */}
                      <WhatsAppPhoneLink order={order} />
                      
                      {/* Address with Google Maps button */}
                      <div className="flex items-start gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <span className="flex-1">{order.address}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 flex-shrink-0"
                          onClick={() => openGoogleMaps(order.address)}
                        >
                          <Navigation className="h-3 w-3 mr-1" />
                          Maps
                        </Button>
                      </div>
                      
                      {/* Area */}
                      {order.area && (
                        <Badge variant="outline" className="text-xs">{order.area}</Badge>
                      )}
                      
                      {/* Order Items with full SKU details */}
                      {items.length > 0 && (
                        <div className="border-t pt-2 mt-2">
                          <div className="flex items-center gap-2 text-sm mb-2">
                            <Package className="h-4 w-4 text-muted-foreground" />
                            <span className="font-medium">Order Items</span>
                          </div>
                          <div className="space-y-1 pl-6">
                            {items.map((item, idx) => (
                              <div key={idx} className="flex justify-between items-center text-sm">
                                <div>
                                  <span className="font-mono font-medium">{item.displayLabel}</span>
                                  <span className="text-muted-foreground ml-2">× {item.qty}</span>
                                </div>
                                <span className="font-medium">{formatBND(item.price)}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Action Buttons - Large touch targets */}
                      <div className="flex gap-3 pt-4 border-t mt-3">
                        <Button 
                          className="flex-1 h-12 min-h-[44px] text-base" 
                          variant="default"
                          onClick={() => handleOpenDeliveredDialog(order)}
                          disabled={markDelivered.isPending}
                        >
                          <Check className="h-5 w-5 mr-2" />
                          Delivered
                        </Button>
                        <Button 
                          className="flex-1 h-12 min-h-[44px] text-base" 
                          variant="destructive"
                          onClick={() => handleOpenFailedDialog(order)}
                        >
                          <X className="h-5 w-5 mr-2" />
                          Failed
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Delivered Orders (Pending Runner Acceptance) */}
        {deliveredPendingAcceptance.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">Pending Runner Acceptance ({deliveredPendingAcceptance.length})</h2>
            <div className="space-y-3">
              {deliveredPendingAcceptance.map(order => {
                const items = formatOrderItems(order.order_items || []);
                return (
                  <Card key={order.id} className="overflow-hidden border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">{order.order_code}</div>
                          <div className="text-sm text-muted-foreground">{order.customer_name}</div>
                        </div>
                        <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                          Awaiting Acceptance
                        </Badge>
                      </div>
                      <WhatsAppPhoneLink order={order} />
                      <div className="flex items-start gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <span className="flex-1">{order.address}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 flex-shrink-0"
                          onClick={() => openGoogleMaps(order.address)}
                        >
                          <Navigation className="h-3 w-3" />
                        </Button>
                      </div>
                      {order.area && <Badge variant="outline" className="text-xs">{order.area}</Badge>}
                      {items.length > 0 && (
                          <div className="text-xs space-y-0.5 pt-2 border-t">
                            {items.map((item, idx) => (
                              <div key={idx} className="flex justify-between">
                                <span><span className="font-mono">{item.displayLabel}</span> × {item.qty}</span>
                                <span>{formatBND(item.price)}</span>
                              </div>
                            ))}
                          </div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        Delivered: {order.driver_delivered_at && format(new Date(order.driver_delivered_at), 'dd MMM HH:mm')}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Failed Orders */}
        {failedOrdersList.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">Failed Deliveries ({failedOrdersList.length})</h2>
            <div className="space-y-3">
              {failedOrdersList.map(order => {
                const items = formatOrderItems(order.order_items || []);
                return (
                  <Card key={order.id} className="overflow-hidden border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800">
                    <CardContent className="p-4 space-y-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">{order.order_code}</div>
                          <div className="text-sm text-muted-foreground">{order.customer_name}</div>
                        </div>
                        {order.driver_next_delivery_date && (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(order.driver_next_delivery_date), 'dd MMM')}
                          </div>
                        )}
                      </div>
                      <WhatsAppPhoneLink order={order} />
                      <div className="flex items-start gap-2 text-sm">
                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                        <span className="flex-1">{order.address}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 flex-shrink-0"
                          onClick={() => openGoogleMaps(order.address)}
                        >
                          <Navigation className="h-3 w-3" />
                        </Button>
                      </div>
                      {order.area && <Badge variant="outline" className="text-xs">{order.area}</Badge>}
                      {items.length > 0 && (
                          <div className="text-xs space-y-0.5 pt-2 border-t">
                            {items.map((item, idx) => (
                              <div key={idx} className="flex justify-between">
                                <span><span className="font-mono">{item.displayLabel}</span> × {item.qty}</span>
                                <span>{formatBND(item.price)}</span>
                              </div>
                            ))}
                          </div>
                      )}
                      <div className="text-xs text-red-600 mt-1">
                        Reason: {order.driver_failed_reason}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {filteredOrders.length === 0 && (
          <div className="text-center py-12">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <h3 className="text-lg font-medium">No deliveries assigned</h3>
            <p className="text-muted-foreground text-sm">
              Wait for your runner to assign orders
            </p>
          </div>
        )}

        {/* Delivered Confirmation Sheet */}
        <MobileActionSheet
          open={deliveredDialogOpen}
          onOpenChange={setDeliveredDialogOpen}
          title="Confirm Delivery"
          description={selectedOrderDetails ? `Mark ${selectedOrderDetails.order_code} as delivered?` : 'Confirm delivery'}
          confirmLabel={markDelivered.isPending ? 'Marking...' : 'Confirm Delivered'}
          confirmVariant="default"
          onConfirm={() => selectedOrder && handleMarkDelivered(selectedOrder)}
          isLoading={markDelivered.isPending}
        >
          {selectedOrderDetails && (
            <div className="space-y-3 py-2">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Customer</span>
                <span className="font-medium">{selectedOrderDetails.customer_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium">{formatBND(selectedOrderDetails.total_amount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Payment</span>
                <Badge variant="outline">{selectedOrderDetails.payment_method}</Badge>
              </div>
            </div>
          )}
        </MobileActionSheet>

        {/* Failed Dialog - Bottom Sheet on Mobile */}
        <MobileActionSheet
          open={failedDialogOpen}
          onOpenChange={setFailedDialogOpen}
          title="Mark Delivery Failed"
          description="Please select a reason and provide details"
          confirmLabel={markFailed.isPending ? 'Submitting...' : 'Submit Failed'}
          confirmVariant="destructive"
          onConfirm={handleSubmitFailed}
          isLoading={markFailed.isPending}
          confirmDisabled={!failedReason || !failedRemark}
        >
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Reason *</Label>
              <Select value={failedReason} onValueChange={setFailedReason}>
                <SelectTrigger className="h-12 min-h-[44px]">
                  <SelectValue placeholder="Select reason" />
                </SelectTrigger>
                <SelectContent>
                  {failedReasons.map(r => (
                    <SelectItem key={r.id} value={r.label}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Remark *</Label>
              <Textarea 
                value={failedRemark} 
                onChange={e => setFailedRemark(e.target.value)}
                placeholder="Additional details..."
                className="min-h-[100px]"
              />
            </div>
            <div className="space-y-2">
              <Label>Next Delivery Date (Optional)</Label>
              <Input 
                type="date" 
                value={nextDeliveryDate}
                onChange={e => setNextDeliveryDate(e.target.value)}
                className="h-12 min-h-[44px]"
              />
            </div>
          </div>
        </MobileActionSheet>
      </div>
    </AppLayout>
  );
}
