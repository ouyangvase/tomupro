import { useState, useMemo, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrders, useUpdateOrder } from '@/hooks/useOrders';
import { useDriverMarkDelivered, useDriverMarkFailed, useDriverParentRunner } from '@/hooks/useDrivers';
import { useReasons } from '@/hooks/useReasons';
import { useRouteSuggestion } from '@/hooks/useRouteSuggestion';
import { useDriverRemarks } from '@/hooks/useDriverRemarks';
import { useDriverOrderPriority } from '@/hooks/useDriverOrderPriority';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Check, X, MapPin, Package, User, Calendar, Loader2, Truck, Navigation, ChevronDown, ChevronUp, Search, RefreshCw } from 'lucide-react';
import { WhatsAppPhoneLink } from '@/components/orders/WhatsAppPhoneLink';
import LocationTracker from '@/components/driver/LocationTracker';
import { DeliveryPaymentDialog } from '@/components/driver/DeliveryPaymentDialog';
import { MobileActionSheet } from '@/components/mobile/MobileActionSheet';
import { AddressActions } from '@/components/driver/AddressActions';
import { RouteSuggestionBadge } from '@/components/driver/RouteSuggestionBadge';
import { DriverRemarkSelector } from '@/components/driver/DriverRemarkSelector';
import { DraggableOrderList } from '@/components/driver/DraggableOrderList';
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
  const [searchQuery, setSearchQuery] = useState('');

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

  // Get ALL assigned driver orders (no date filtering) with search
  const filteredOrders = useMemo(() => {
    const statusFiltered = myOrders.filter(order => {
      // Only show orders with active driver statuses
      return ['ASSIGNED', 'OUT_FOR_DELIVERY', 'DRIVER_DELIVERED', 'DRIVER_FAILED'].includes(order.driver_status || '');
    });
    
    // Apply search filter if query exists
    if (!searchQuery.trim()) return statusFiltered;
    
    const query = searchQuery.toLowerCase().trim();
    return statusFiltered.filter(order => {
      const orderCode = (order.order_code || '').toLowerCase();
      const customerName = (order.customer_name || '').toLowerCase();
      return orderCode.includes(query) || customerName.includes(query);
    });
  }, [myOrders, searchQuery]);

  // Count stats for selected tab
  const pendingOrders = filteredOrders.filter(o => 
    o.driver_status === 'ASSIGNED' || o.driver_status === 'OUT_FOR_DELIVERY'
  );
  const deliveredPendingAcceptance = filteredOrders.filter(o => 
    o.driver_status === 'DRIVER_DELIVERED' && o.runner_accept_status !== 'ACCEPTED'
  );
  const failedOrdersList = filteredOrders.filter(o => o.driver_status === 'DRIVER_FAILED');

  // Extract order IDs for hooks
  const pendingOrderIds = useMemo(() => pendingOrders.map(o => o.id), [pendingOrders]);

  // Route suggestion hook
  const ordersForSuggestion = useMemo(() => 
    pendingOrders.map(o => ({
      id: o.id,
      order_code: o.order_code,
      customer_name: o.customer_name,
      address: o.address,
      area: o.area,
      driver_id: o.driver_id,
    })), 
    [pendingOrders]
  );
  const { 
    suggestions, 
    hasSuggestions, 
    isGeocoding, 
    hasTimedOut, 
    error: routeError,
    refreshLocation, 
    driverLocation,
    ordersProcessed,
    totalOrders,
  } = useRouteSuggestion(ordersForSuggestion);

  // Driver remarks hook
  const { remarks, upsertRemark, deleteRemark } = useDriverRemarks(pendingOrderIds);

  // Driver order priority hook
  const { priorities, hasManualPriority, updatePriorities, clearPriorities } = useDriverOrderPriority(pendingOrderIds);

  // Sort pending orders based on manual priority > suggestion > date
  const sortedPendingOrders = useMemo(() => {
    const ordersCopy = [...pendingOrders];
    
    ordersCopy.sort((a, b) => {
      // First: Manual priority (if exists)
      const priorityA = priorities[a.id];
      const priorityB = priorities[b.id];
      
      if (priorityA !== undefined && priorityB !== undefined) {
        return priorityA - priorityB;
      }
      if (priorityA !== undefined) return -1;
      if (priorityB !== undefined) return 1;
      
      // Second: Route suggestion (if available)
      const suggestionA = suggestions.get(a.id);
      const suggestionB = suggestions.get(b.id);
      
      if (suggestionA && suggestionB) {
        return suggestionA.rank - suggestionB.rank;
      }
      if (suggestionA) return -1;
      if (suggestionB) return 1;
      
      // Third: Delivery date
      return getDeliveryDate(a).getTime() - getDeliveryDate(b).getTime();
    });
    
    return ordersCopy;
  }, [pendingOrders, priorities, suggestions]);

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

  const handleMarkDelivered = async (orderId: string, paymentMethod: 'CASH' | 'TRANSFER') => {
    await markDelivered.mutateAsync({ orderId, paymentMethod });
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

  // Render order card content
  const renderOrderCard = useCallback((order: any, index: number, isDragging: boolean) => {
    const items = formatOrderItems(order.order_items || []);
    const suggestion = suggestions.get(order.id);
    const remark = remarks[order.id];
    const isExpanded = expandedCards.has(order.id);

    return (
      <Card className={cn("overflow-hidden transition-all", isDragging && "opacity-60")}>
        <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleCardExpanded(order.id)}>
          <div className="flex justify-between items-start">
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                {order.order_code}
                <span className="text-xs text-muted-foreground font-normal">
                  {getDateLabel(order)}
                </span>
                {/* Route Suggestion Badge */}
                {hasSuggestions && suggestion && !hasManualPriority && (
                  <RouteSuggestionBadge rank={suggestion.rank} distance={suggestion.distance} />
                )}
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
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleOutForDelivery(order.id, order.driver_status || 'ASSIGNED');
                    }}
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
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleOutForDelivery(order.id, order.driver_status || 'ASSIGNED');
                    }}
                  >
                    Reset
                  </Button>
                )}
              </div>
            </div>
            <div className="text-right flex-shrink-0 ml-2">
              <div className="font-bold">{formatBND(order.total_amount)}</div>
              <div className="text-xs text-muted-foreground">{order.payment_method}</div>
              <ChevronDown className={cn("h-4 w-4 mt-1 mx-auto transition-transform", isExpanded && "rotate-180")} />
            </div>
          </div>
        </CardHeader>
        <CardContent className={cn("space-y-2 transition-all", !isExpanded && "hidden")}>
          {/* Customer Info */}
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{order.customer_name}</span>
          </div>
          
          {/* Phone - WhatsApp click-to-chat */}
          <WhatsAppPhoneLink order={order} />
          
          {/* Full Address Display */}
          <div className="p-3 rounded-lg bg-secondary/30 border border-border/50">
            <div className="flex items-start gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm break-words whitespace-pre-wrap">{order.address}</p>
                {order.area && (
                  <Badge variant="outline" className="text-xs mt-1">{order.area}</Badge>
                )}
              </div>
            </div>
            {/* Address Action Buttons */}
            <AddressActions address={order.address} area={order.area} />
          </div>
          
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

          {/* Driver Private Remark */}
          <DriverRemarkSelector
            orderId={order.id}
            currentRemark={remark}
            onSave={upsertRemark}
            onDelete={deleteRemark}
          />
          
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
  }, [suggestions, remarks, expandedCards, hasSuggestions, hasManualPriority, markDelivered.isPending, upsertRemark, deleteRemark]);

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

        {/* Search Bar */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search by order ref or customer name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-10"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8"
              onClick={() => setSearchQuery('')}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Route Suggestion Status */}
        {pendingOrders.length > 0 && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border/50 mb-4">
            <div className="flex items-center gap-2 text-sm flex-1 min-w-0">
              <MapPin className="h-4 w-4 flex-shrink-0" />
              <span className="truncate">
                {hasTimedOut ? (
                  <span className="text-destructive flex items-center gap-1">
                    Route temporarily unavailable. Tap refresh.
                  </span>
                ) : routeError && !isGeocoding ? (
                  <span className="text-muted-foreground">{routeError}</span>
                ) : isGeocoding ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin flex-shrink-0" />
                    <span className="truncate">
                      Calculating routes ({ordersProcessed}/{totalOrders})...
                    </span>
                  </span>
                ) : hasSuggestions ? (
                  <span className="text-primary">Route suggestions active</span>
                ) : driverLocation ? (
                  <span className="text-muted-foreground">No route data available</span>
                ) : (
                  <span className="text-muted-foreground">Enable location for route suggestions</span>
                )}
              </span>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={refreshLocation}
              className="h-8 flex-shrink-0"
              title="Refresh route"
            >
              <RefreshCw className={cn("h-4 w-4", isGeocoding && "animate-spin")} />
            </Button>
          </div>
        )}

        {/* Pending Orders with Drag & Drop */}
        {sortedPendingOrders.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-semibold mb-3">Pending Deliveries ({sortedPendingOrders.length})</h2>
            <DraggableOrderList
              items={sortedPendingOrders}
              getItemId={(order) => order.id}
              renderItem={renderOrderCard}
              onReorder={updatePriorities}
              hasManualPriority={hasManualPriority}
              onClearPriority={clearPriorities}
            />
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
                      
                      {/* Full Address Display */}
                      <div className="p-3 rounded-lg bg-secondary/30 border border-border/50">
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm break-words whitespace-pre-wrap">{order.address}</p>
                            {order.area && (
                              <Badge variant="outline" className="text-xs mt-1">{order.area}</Badge>
                            )}
                          </div>
                        </div>
                        <AddressActions address={order.address} area={order.area} />
                      </div>
                      
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
                      
                      {/* Full Address Display */}
                      <div className="p-3 rounded-lg bg-secondary/30 border border-border/50">
                        <div className="flex items-start gap-2">
                          <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm break-words whitespace-pre-wrap">{order.address}</p>
                            {order.area && (
                              <Badge variant="outline" className="text-xs mt-1">{order.area}</Badge>
                            )}
                          </div>
                        </div>
                        <AddressActions address={order.address} area={order.area} />
                      </div>
                      
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

        {/* Delivered Confirmation Dialog with Payment Method Selection */}
        <DeliveryPaymentDialog
          open={deliveredDialogOpen}
          onOpenChange={setDeliveredDialogOpen}
          order={selectedOrderDetails ? {
            id: selectedOrderDetails.id,
            order_code: selectedOrderDetails.order_code,
            customer_name: selectedOrderDetails.customer_name,
            total_amount: selectedOrderDetails.total_amount,
          } : null}
          onConfirm={handleMarkDelivered}
          isPending={markDelivered.isPending}
        />

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
