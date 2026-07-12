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
import { Check, X, MapPin, Package, User, Calendar, Loader2, Truck, Navigation, ChevronDown, ChevronUp, Search, RefreshCw, Clock, AlertTriangle } from 'lucide-react';
import { WhatsAppPhoneLink } from '@/components/orders/WhatsAppPhoneLink';
import LocationTracker from '@/components/driver/LocationTracker';
import { DeliveryPaymentDialog } from '@/components/driver/DeliveryPaymentDialog';
import { MobileActionSheet } from '@/components/mobile/MobileActionSheet';
import { AddressActions } from '@/components/driver/AddressActions';
import { RouteSuggestionBadge } from '@/components/driver/RouteSuggestionBadge';
import { DriverRemarkSelector } from '@/components/driver/DriverRemarkSelector';
import { DraggableOrderList } from '@/components/driver/DraggableOrderList';
import { RemarkStatusDot } from '@/components/driver/RemarkStatusDot';
import { format, isToday, isTomorrow, parseISO } from 'date-fns';
import { formatBND } from '@/lib/currency';
import { cn } from '@/lib/utils';

const driverStatusConfig: Record<string, { label: string; className: string }> = {
  ASSIGNED: { label: 'Assigned', className: 'status-neutral' },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', className: 'status-pending' },
  DRIVER_DELIVERED: { label: 'Delivered', className: 'status-success' },
  DRIVER_FAILED: { label: 'Failed', className: 'status-error' },
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
      return ['ASSIGNED', 'OUT_FOR_DELIVERY', 'DRIVER_DELIVERED', 'DRIVER_FAILED'].includes(order.driver_status || '');
    });
    
    if (!searchQuery.trim()) return statusFiltered;
    
    const query = searchQuery.toLowerCase().trim();
    return statusFiltered.filter(order => {
      const orderCode = (order.order_code || '').toLowerCase();
      const customerName = (order.customer_name || '').toLowerCase();
      return orderCode.includes(query) || customerName.includes(query);
    });
  }, [myOrders, searchQuery]);

  const pendingOrders = filteredOrders.filter(o => 
    o.driver_status === 'ASSIGNED' || o.driver_status === 'OUT_FOR_DELIVERY'
  );
  const deliveredPendingAcceptance = filteredOrders.filter(o => 
    o.driver_status === 'DRIVER_DELIVERED' && o.runner_accept_status !== 'ACCEPTED'
  );
  const failedOrdersList = filteredOrders.filter(o => o.driver_status === 'DRIVER_FAILED');

  const pendingOrderIds = useMemo(() => pendingOrders.map(o => o.id), [pendingOrders]);

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

  const { remarks, upsertRemark, deleteRemark } = useDriverRemarks(pendingOrderIds);
  const { priorities, hasManualPriority, updatePriorities, clearPriorities } = useDriverOrderPriority(pendingOrderIds);

  const sortedPendingOrders = useMemo(() => {
    const ordersCopy = [...pendingOrders];
    
    ordersCopy.sort((a, b) => {
      const priorityA = priorities[a.id];
      const priorityB = priorities[b.id];
      
      if (priorityA !== undefined && priorityB !== undefined) {
        return priorityA - priorityB;
      }
      if (priorityA !== undefined) return -1;
      if (priorityB !== undefined) return 1;
      
      const suggestionA = suggestions.get(a.id);
      const suggestionB = suggestions.get(b.id);
      
      if (suggestionA && suggestionB) {
        return suggestionA.rank - suggestionB.rank;
      }
      if (suggestionA) return -1;
      if (suggestionB) return 1;
      
      return getDeliveryDate(a).getTime() - getDeliveryDate(b).getTime();
    });
    
    return ordersCopy;
  }, [pendingOrders, priorities, suggestions]);

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
        price: item.line_total || item.price, // price IS the final sales amount
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
    const displayPosition = index + 1;
    const statusConfig = driverStatusConfig[order.driver_status || 'ASSIGNED'];

    return (
      <div
        className={cn(
          "glass-card overflow-hidden transition-all duration-300",
          isDragging && "opacity-60 scale-[0.98]",
        )}
      >
        {/* Card Header — Collapsed View */}
        <div
          className="p-4 cursor-pointer active:bg-muted/20 transition-colors"
          onClick={() => toggleCardExpanded(order.id)}
        >
          <div className="flex justify-between items-start gap-3">
            {/* Left: Status Dot + Code + Date */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5">
                <RemarkStatusDot remarkType={remark?.remark_type} />
                <span className="text-base font-bold tracking-tight truncate">
                  {order.order_code}
                </span>
                <Badge variant="secondary" className="text-[10px] font-medium px-2 py-0 h-5 rounded-full flex-shrink-0">
                  {getDateLabel(order)}
                </Badge>
                {(order as any).order_source === 'RUNNER_PICKUP' && (
                  <Badge variant="outline" className="text-[10px] font-medium px-2 py-0 h-5 rounded-full bg-violet-500/10 text-violet-700 dark:text-violet-400 border-violet-500/30 flex-shrink-0">
                    Pickup
                  </Badge>
                )}
              </div>

              {/* Route badge + Status */}
              <div className="flex gap-2 mt-2 items-center flex-wrap">
                {(hasSuggestions || hasManualPriority) && (
                  <RouteSuggestionBadge
                    rank={displayPosition}
                    distance={suggestion?.distance}
                    showDistance={!!suggestion}
                  />
                )}
                <Badge variant="outline" className={cn("text-[10px] px-2 py-0 h-5 rounded-full border", statusConfig.className)}>
                  {statusConfig.label}
                </Badge>
                {order.driver_status === 'ASSIGNED' && (
                  <Button
                    size="sm"
                    className="h-7 text-xs rounded-full bg-primary/90 hover:bg-primary text-primary-foreground shadow-sm px-3"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleOutForDelivery(order.id, order.driver_status || 'ASSIGNED');
                    }}
                  >
                    <Truck className="h-3 w-3 mr-1" />
                    Start
                  </Button>
                )}
                {order.driver_status === 'OUT_FOR_DELIVERY' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs rounded-full"
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

            {/* Right: Amount + Chevron */}
            <div className="text-right flex-shrink-0 flex flex-col items-end">
              <div className="text-lg font-bold tabular-nums tracking-tight">
                {formatBND(order.total_amount)}
              </div>
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                {order.payment_method}
              </span>
              <ChevronDown className={cn(
                "h-4 w-4 mt-1 text-muted-foreground transition-transform duration-300",
                isExpanded && "rotate-180"
              )} />
            </div>
          </div>
        </div>

        {/* Expanded Content */}
        <div className={cn(
          "overflow-hidden transition-all duration-300",
          isExpanded ? "max-h-[2000px] opacity-100" : "max-h-0 opacity-0"
        )}>
          <div className="px-4 pb-4 space-y-3 border-t border-border/30 pt-3">
            {/* Customer Info */}
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <User className="h-4 w-4 text-primary" />
              </div>
              <span className="font-semibold text-sm">{order.customer_name}</span>
            </div>
            
            {/* Phone - WhatsApp */}
            <WhatsAppPhoneLink order={order} />
            
            {/* Address Block */}
            <div className="rounded-xl bg-secondary/40 border border-border/30 overflow-hidden">
              <div className="border-l-[3px] border-primary/60 p-3">
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-primary/70 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm break-words whitespace-pre-wrap leading-relaxed">{order.address}</p>
                    {order.area && (
                      <Badge variant="outline" className="text-[10px] mt-1.5 rounded-full">{order.area}</Badge>
                    )}
                  </div>
                </div>
                <AddressActions address={order.address} area={order.area} />
              </div>
            </div>
            
            {/* Order Items */}
            {items.length > 0 && (
              <div className="rounded-xl bg-secondary/20 border border-border/20 p-3">
                <div className="flex items-center gap-2 text-sm mb-2">
                  <Package className="h-4 w-4 text-muted-foreground" />
                  <span className="font-semibold text-xs uppercase tracking-wider text-muted-foreground">Order Items</span>
                </div>
                <div className="space-y-1.5">
                  {items.map((item, idx) => (
                    <div key={idx} className={cn(
                      "flex justify-between items-center text-sm py-1.5 px-2 rounded-lg",
                      idx % 2 === 0 ? "bg-background/50" : ""
                    )}>
                      <div className="min-w-0">
                        <span className="font-mono text-xs font-medium">{item.displayLabel}</span>
                        <span className="text-muted-foreground ml-1.5">× {item.qty}</span>
                      </div>
                      <span className="font-semibold text-sm tabular-nums ml-2">{formatBND(item.price)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Driver Remark */}
            <DriverRemarkSelector
              orderId={order.id}
              currentRemark={remark}
              onSave={upsertRemark}
              onDelete={deleteRemark}
            />
            
            {/* Action Buttons */}
            <div className="flex gap-3 pt-3">
              <Button 
                className="flex-1 h-12 min-h-[48px] text-sm font-semibold rounded-xl shadow-sm" 
                variant="default"
                onClick={() => handleOpenDeliveredDialog(order)}
                disabled={markDelivered.isPending}
              >
                <Check className="h-5 w-5 mr-2" />
                Delivered
              </Button>
              <Button 
                className="flex-1 h-12 min-h-[48px] text-sm font-semibold rounded-xl shadow-sm" 
                variant="destructive"
                onClick={() => handleOpenFailedDialog(order)}
              >
                <X className="h-5 w-5 mr-2" />
                Failed
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }, [suggestions, remarks, expandedCards, hasSuggestions, hasManualPriority, markDelivered.isPending, upsertRemark, deleteRemark]);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
          <p className="text-sm text-muted-foreground">Loading deliveries...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-4xl mx-auto space-y-4">
        {/* ─── Gradient Header Banner ─── */}
        <div className="relative rounded-2xl overflow-hidden bg-gradient-to-br from-primary via-primary/90 to-primary/70 p-5 shadow-lg">
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_hsl(38_70%_70%/0.3),transparent_70%)]" />
          <div className="relative z-10">
            <h1 className="text-2xl font-bold text-primary-foreground tracking-tight">
              My Deliveries
            </h1>
            {parentRunner && (
              <p className="text-primary-foreground/70 text-sm mt-0.5">
                Runner: {parentRunner.display_name}
              </p>
            )}
          </div>
        </div>

        {/* ─── Location Tracker ─── */}
        <LocationTracker />

        {/* ─── Stats Pills ─── */}
        <div className="grid grid-cols-3 gap-2.5">
          {/* Pending */}
          <div className="glass-card p-3 text-center">
            <div className="text-3xl font-bold tabular-nums tracking-tight">{pendingOrders.length}</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mt-0.5">
              Pending
            </div>
          </div>
          {/* Delivered */}
          <div className="glass-card p-3 text-center border-[hsl(var(--status-pending)/0.3)]">
            <div className="text-3xl font-bold tabular-nums tracking-tight text-[hsl(var(--status-pending))]">
              {deliveredPendingAcceptance.length}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mt-0.5">
              Delivered
            </div>
          </div>
          {/* Failed */}
          <div className="glass-card p-3 text-center border-[hsl(var(--status-error)/0.3)]">
            <div className="text-3xl font-bold tabular-nums tracking-tight text-[hsl(var(--status-error))]">
              {failedOrdersList.length}
            </div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold mt-0.5">
              Failed
            </div>
          </div>
        </div>

        {/* ─── Search Bar ─── */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search order or customer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 h-11 rounded-full bg-secondary/40 border-border/30 shadow-sm"
          />
          {searchQuery && (
            <Button
              variant="ghost"
              size="icon"
              className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 rounded-full"
              onClick={() => setSearchQuery('')}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>

        {/* ─── Route Suggestion Status ─── */}
        {pendingOrders.length > 0 && (
          <div className="glass-card flex items-center justify-between p-3">
            <div className="flex items-center gap-2.5 text-sm flex-1 min-w-0">
              {isGeocoding ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary flex-shrink-0" />
              ) : hasSuggestions ? (
                <span className="relative flex h-2.5 w-2.5 flex-shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-50" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
                </span>
              ) : (
                <MapPin className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              )}
              <span className="truncate text-sm">
                {hasTimedOut ? (
                  <span className="text-[hsl(var(--status-error))]">
                    Route unavailable — tap refresh
                  </span>
                ) : routeError && !isGeocoding ? (
                  <span className="text-muted-foreground">{routeError}</span>
                ) : isGeocoding ? (
                  <span className="text-muted-foreground">
                    Calculating ({ordersProcessed}/{totalOrders})...
                  </span>
                ) : hasSuggestions ? (
                  <span className="text-primary font-medium">Route active</span>
                ) : driverLocation ? (
                  <span className="text-muted-foreground">No route data</span>
                ) : (
                  <span className="text-muted-foreground">Enable location for routes</span>
                )}
              </span>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={refreshLocation}
              className="h-8 w-8 rounded-full flex-shrink-0"
              title="Refresh route"
            >
              <RefreshCw className={cn("h-4 w-4", isGeocoding && "animate-spin")} />
            </Button>
          </div>
        )}

        {/* ─── Pending Orders with Drag & Drop ─── */}
        {sortedPendingOrders.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">
              Pending Deliveries ({sortedPendingOrders.length})
            </h2>
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

        {/* ─── Delivered (Pending Acceptance) ─── */}
        {deliveredPendingAcceptance.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">
              Pending Acceptance ({deliveredPendingAcceptance.length})
            </h2>
            <div className="space-y-2.5">
              {deliveredPendingAcceptance.map(order => {
                const items = formatOrderItems(order.order_items || []);
                return (
                  <div key={order.id} className="glass-card overflow-hidden border-l-[3px] border-l-[hsl(var(--status-pending))]">
                    <div className="p-4 space-y-2.5">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-bold text-sm">{order.order_code}</div>
                          <div className="text-xs text-muted-foreground">{order.customer_name}</div>
                        </div>
                        <Badge className="status-pending text-[10px] rounded-full px-2 h-5 border">
                          Awaiting
                        </Badge>
                      </div>
                      <WhatsAppPhoneLink order={order} />
                      
                      {/* Address */}
                      <div className="rounded-xl bg-secondary/40 border border-border/30 overflow-hidden">
                        <div className="border-l-[3px] border-primary/40 p-3">
                          <div className="flex items-start gap-2">
                            <MapPin className="h-3.5 w-3.5 text-primary/70 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs break-words whitespace-pre-wrap">{order.address}</p>
                              {order.area && (
                                <Badge variant="outline" className="text-[10px] mt-1 rounded-full">{order.area}</Badge>
                              )}
                            </div>
                          </div>
                          <AddressActions address={order.address} area={order.area} />
                        </div>
                      </div>
                      
                      {items.length > 0 && (
                        <div className="text-xs space-y-0.5 pt-2 border-t border-border/30">
                          {items.map((item, idx) => (
                            <div key={idx} className="flex justify-between">
                              <span><span className="font-mono">{item.displayLabel}</span> × {item.qty}</span>
                              <span className="font-semibold tabular-nums">{formatBND(item.price)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        Delivered {order.driver_delivered_at && format(new Date(order.driver_delivered_at), 'dd MMM HH:mm')}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Failed Orders ─── */}
        {failedOrdersList.length > 0 && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 px-1">
              Failed Deliveries ({failedOrdersList.length})
            </h2>
            <div className="space-y-2.5">
              {failedOrdersList.map(order => {
                const items = formatOrderItems(order.order_items || []);
                return (
                  <div key={order.id} className="glass-card overflow-hidden border-l-[3px] border-l-[hsl(var(--status-error))]">
                    <div className="p-4 space-y-2.5">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-bold text-sm">{order.order_code}</div>
                          <div className="text-xs text-muted-foreground">{order.customer_name}</div>
                        </div>
                        {order.driver_next_delivery_date && (
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(order.driver_next_delivery_date), 'dd MMM')}
                          </div>
                        )}
                      </div>
                      <WhatsAppPhoneLink order={order} />
                      
                      {/* Address */}
                      <div className="rounded-xl bg-secondary/40 border border-border/30 overflow-hidden">
                        <div className="border-l-[3px] border-[hsl(var(--status-error)/0.5)] p-3">
                          <div className="flex items-start gap-2">
                            <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs break-words whitespace-pre-wrap">{order.address}</p>
                              {order.area && (
                                <Badge variant="outline" className="text-[10px] mt-1 rounded-full">{order.area}</Badge>
                              )}
                            </div>
                          </div>
                          <AddressActions address={order.address} area={order.area} />
                        </div>
                      </div>
                      
                      {items.length > 0 && (
                        <div className="text-xs space-y-0.5 pt-2 border-t border-border/30">
                          {items.map((item, idx) => (
                            <div key={idx} className="flex justify-between">
                              <span><span className="font-mono">{item.displayLabel}</span> × {item.qty}</span>
                              <span className="font-semibold tabular-nums">{formatBND(item.price)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--status-error))]">
                        <AlertTriangle className="h-3 w-3" />
                        {order.driver_failed_reason}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Empty State ─── */}
        {filteredOrders.length === 0 && (
          <div className="text-center py-16">
            <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Package className="h-8 w-8 text-primary/60" />
            </div>
            <h3 className="text-lg font-semibold">No deliveries assigned</h3>
            <p className="text-muted-foreground text-sm mt-1">
              Wait for your runner to assign orders
            </p>
          </div>
        )}

        {/* ─── Dialogs ─── */}
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
