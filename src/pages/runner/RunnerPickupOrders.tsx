import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Skeleton } from '@/components/ui/skeleton';
import { usePaginatedOrders } from '@/hooks/usePaginatedOrders';
import { useUpdatePickupStatus, type PickupOperationalStatus } from '@/hooks/usePickupOrders';
import { useMyDrivers } from '@/hooks/useDrivers';
import { useAuth } from '@/contexts/AuthContext';
import { CreatePickupOrderDialog } from '@/components/runner/CreatePickupOrderDialog';
import { formatBND } from '@/lib/currency';
import { format } from 'date-fns';
import { WhatsAppPhoneLink } from '@/components/orders/WhatsAppPhoneLink';
import {
  Search, Package, Truck, Clock, CheckCircle,
  ArrowRight, Loader2, Filter, ChevronDown, ChevronUp, User,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PICKUP_PENDING: { label: 'Pending', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30', icon: <Clock className="h-3 w-3" /> },
  PICKUP_ASSIGNED: { label: 'Assigned', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30', icon: <Truck className="h-3 w-3" /> },
  PICKED_UP: { label: 'Picked Up', color: 'bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30', icon: <Package className="h-3 w-3" /> },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', color: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30', icon: <Truck className="h-3 w-3" /> },
  DELIVERED: { label: 'Delivered', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30', icon: <CheckCircle className="h-3 w-3" /> },
};

const ALL_STEPS: PickupOperationalStatus[] = ['PICKUP_PENDING', 'PICKUP_ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'];

function MiniTimeline({ currentStatus }: { currentStatus: string }) {
  const currentIndex = ALL_STEPS.indexOf(currentStatus as PickupOperationalStatus);
  return (
    <div className="flex items-center gap-0.5 w-full">
      {ALL_STEPS.map((_, i) => (
        <div key={i} className={cn('h-1 flex-1 rounded-full', i <= currentIndex ? 'bg-primary' : 'bg-muted')} />
      ))}
    </div>
  );
}

export default function RunnerPickupOrders() {
  const { user } = useAuth();
  const { data: myDrivers = [] } = useMyDrivers();
  const updateStatus = useUpdatePickupStatus();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const driverOptions = useMemo(() =>
    myDrivers.map(d => ({ label: d.driver?.display_name || 'Unknown', value: d.driver_id })),
    [myDrivers]
  );

  const { data: allOrders = [], isLoading } = usePaginatedOrders({
    runnerId: user?.id,
    sortField: 'created_at',
    sortDirection: 'desc',
  }, 200);

  const pickupOrders = useMemo(() => {
    let filtered = allOrders.filter((o: any) => o.order_source === 'RUNNER_PICKUP');
    if (statusFilter && statusFilter !== 'all') {
      filtered = filtered.filter((o: any) => o.operational_status === statusFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((o: any) =>
        (o.order_code || '').toLowerCase().includes(q) ||
        (o.customer_name || '').toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [allOrders, statusFilter, search]);

  const stats = useMemo(() => {
    const all = allOrders.filter((o: any) => o.order_source === 'RUNNER_PICKUP');
    return {
      total: all.length,
      pending: all.filter((o: any) => o.operational_status === 'PICKUP_PENDING').length,
      inProgress: all.filter((o: any) => ['PICKUP_ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(o.operational_status)).length,
      delivered: all.filter((o: any) => o.operational_status === 'DELIVERED').length,
      totalFees: all.reduce((sum: number, o: any) => sum + (Number(o.pickup_fee) || 0), 0),
    };
  }, [allOrders]);

  const toggleCard = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleAssignDriver = (orderId: string, driverId: string) => {
    updateStatus.mutate({ orderId, status: 'PICKUP_ASSIGNED', driverId });
  };

  const handleAdvanceStatus = (orderId: string, currentStatus: string) => {
    const nextMap: Record<string, PickupOperationalStatus> = {
      PICKUP_ASSIGNED: 'PICKED_UP',
      PICKED_UP: 'OUT_FOR_DELIVERY',
      OUT_FOR_DELIVERY: 'DELIVERED',
    };
    const next = nextMap[currentStatus];
    if (next) updateStatus.mutate({ orderId, status: next });
  };

  const handleMarkDelivered = (orderId: string) => {
    updateStatus.mutate({ orderId, status: 'DELIVERED' });
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats - compact 2x2 grid on mobile */}
      <div className="grid grid-cols-4 gap-2">
        <Card className="border-amber-500/20">
          <CardContent className="p-2.5 text-center">
            <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{stats.pending}</p>
            <p className="text-[10px] text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card className="border-blue-500/20">
          <CardContent className="p-2.5 text-center">
            <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{stats.inProgress}</p>
            <p className="text-[10px] text-muted-foreground">In Progress</p>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20">
          <CardContent className="p-2.5 text-center">
            <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{stats.delivered}</p>
            <p className="text-[10px] text-muted-foreground">Delivered</p>
          </CardContent>
        </Card>
        <Card className="border-green-500/20">
          <CardContent className="p-2.5 text-center">
            <p className="text-lg font-bold text-green-600 dark:text-green-400">{formatBND(stats.totalFees)}</p>
            <p className="text-[10px] text-muted-foreground">Fees</p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar - stacked on mobile */}
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-8 h-9 text-sm"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[120px] h-9 text-xs">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {ALL_STEPS.map(s => (
                <SelectItem key={s} value={s}>{statusConfig[s].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <CreatePickupOrderDialog />
      </div>

      {/* Orders List */}
      {pickupOrders.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">No pickup orders yet</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {pickupOrders.map((order: any) => {
            const expanded = expandedCards.has(order.id);
            const cfg = statusConfig[order.operational_status] || statusConfig.PICKUP_PENDING;
            const canAssign = order.operational_status === 'PICKUP_PENDING';
            const canAdvance = ['PICKUP_ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(order.operational_status);
            const isDelivered = order.operational_status === 'DELIVERED';
            const canMarkDelivered = !isDelivered && order.operational_status !== 'PICKUP_PENDING';

            return (
              <Card key={order.id} className="overflow-hidden">
                <div className="p-3">
                  {/* Row 1: Code + Status + Fee */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1">
                      <span className="font-mono font-semibold text-xs truncate">{order.order_code}</span>
                      <Badge variant="outline" className={cn('gap-0.5 text-[10px] px-1.5 py-0 h-5 shrink-0', cfg.color)}>
                        {cfg.icon} {cfg.label}
                      </Badge>
                    </div>
                    {Number(order.pickup_fee) > 0 && (
                      <Badge variant="secondary" className="text-[10px] bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20 shrink-0">
                        {formatBND(order.pickup_fee)}
                      </Badge>
                    )}
                  </div>

                  {/* Row 2: Mini timeline */}
                  <div className="mt-2">
                    <MiniTimeline currentStatus={order.operational_status} />
                  </div>

                  {/* Row 3: Customer + Owner */}
                  <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="flex items-center gap-1 truncate">
                      <User className="h-3 w-3 shrink-0" />
                      {order.customer_name}
                    </span>
                    {order.salesperson?.display_name && (
                      <span className="text-[10px] truncate ml-2">
                        Owner: {order.salesperson.display_name}
                      </span>
                    )}
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0 ml-1" onClick={() => toggleCard(order.id)}>
                      {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    </Button>
                  </div>

                  {/* Expanded */}
                  {expanded && (
                    <div className="mt-2 pt-2 border-t border-border space-y-2 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-muted-foreground text-[10px]">Phone</span>
                          <div><WhatsAppPhoneLink order={order} /></div>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-[10px]">Payment</span>
                          <p className="font-medium">{order.payment_method}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-[10px]">Amount</span>
                          <p className="font-medium">{formatBND(order.total_amount)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-[10px]">Created</span>
                          <p className="font-medium">{format(new Date(order.created_at), 'dd MMM, HH:mm')}</p>
                        </div>
                      </div>
                      {order.address && (
                        <div>
                          <span className="text-muted-foreground text-[10px]">Address</span>
                          <p>{order.address}</p>
                        </div>
                      )}
                      {order.notes && (
                        <div>
                          <span className="text-muted-foreground text-[10px]">Notes</span>
                          <p>{order.notes}</p>
                        </div>
                      )}
                      {order.driver && (
                        <div>
                          <span className="text-muted-foreground text-[10px]">Driver</span>
                          <p className="font-medium">{order.driver.display_name || order.driver.email}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions - always visible */}
                  {!isDelivered && (
                    <div className="mt-2 flex gap-2 items-center flex-wrap">
                      {canAssign && (
                        <SearchableSelect
                          options={driverOptions}
                          value=""
                          onValueChange={(driverId) => handleAssignDriver(order.id, driverId)}
                          placeholder="Assign driver..."
                          className="flex-1 min-w-[140px]"
                        />
                      )}
                      {canAdvance && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1 text-xs h-8"
                          onClick={() => handleAdvanceStatus(order.id, order.operational_status)}
                          disabled={updateStatus.isPending}
                        >
                          <ArrowRight className="h-3 w-3" />
                          {order.operational_status === 'PICKUP_ASSIGNED' && 'Picked Up'}
                          {order.operational_status === 'PICKED_UP' && 'Out for Delivery'}
                          {order.operational_status === 'OUT_FOR_DELIVERY' && 'Delivered'}
                        </Button>
                      )}
                      {canMarkDelivered && order.operational_status !== 'OUT_FOR_DELIVERY' && (
                        <Button
                          size="sm"
                          className="gap-1 text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white ml-auto"
                          onClick={() => handleMarkDelivered(order.id)}
                          disabled={updateStatus.isPending}
                        >
                          {updateStatus.isPending ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <CheckCircle className="h-3 w-3" />
                          )}
                          Delivered
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
