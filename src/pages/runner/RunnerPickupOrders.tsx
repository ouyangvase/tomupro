import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  Search, Package, Truck, MapPin, Phone, User, Clock, CheckCircle, CircleDot,
  ArrowRight, Loader2, Filter, X, ChevronDown, ChevronUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  PICKUP_PENDING: { label: 'Pickup Pending', color: 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30', icon: <Clock className="h-3.5 w-3.5" /> },
  PICKUP_ASSIGNED: { label: 'Assigned', color: 'bg-blue-500/15 text-blue-700 dark:text-blue-400 border-blue-500/30', icon: <Truck className="h-3.5 w-3.5" /> },
  PICKED_UP: { label: 'Picked Up', color: 'bg-violet-500/15 text-violet-700 dark:text-violet-400 border-violet-500/30', icon: <Package className="h-3.5 w-3.5" /> },
  OUT_FOR_DELIVERY: { label: 'Out for Delivery', color: 'bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-500/30', icon: <Truck className="h-3.5 w-3.5" /> },
  DELIVERED: { label: 'Delivered', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30', icon: <CheckCircle className="h-3.5 w-3.5" /> },
};

const ALL_STEPS: PickupOperationalStatus[] = ['PICKUP_PENDING', 'PICKUP_ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY', 'DELIVERED'];

function PickupTimeline({ currentStatus }: { currentStatus: string }) {
  const currentIndex = ALL_STEPS.indexOf(currentStatus as PickupOperationalStatus);

  return (
    <div className="flex items-center gap-1 w-full">
      {ALL_STEPS.map((step, i) => {
        const done = i <= currentIndex;
        const active = i === currentIndex;
        const cfg = statusConfig[step];
        return (
          <div key={step} className="flex items-center gap-1 flex-1">
            <div className={cn(
              'flex items-center justify-center rounded-full w-6 h-6 text-xs font-bold shrink-0 transition-all',
              done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              active && 'ring-2 ring-primary/50 ring-offset-1 ring-offset-background'
            )}>
              {i + 1}
            </div>
            {i < ALL_STEPS.length - 1 && (
              <div className={cn('h-0.5 flex-1 rounded', done ? 'bg-primary' : 'bg-muted')} />
            )}
          </div>
        );
      })}
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

  // Fetch pickup orders for this runner
  const { data: allOrders = [], isLoading, refetch } = usePaginatedOrders({
    runnerId: user?.id,
    sortField: 'created_at',
    sortDirection: 'desc',
  }, 200);

  // Filter to only pickup orders
  const pickupOrders = useMemo(() => {
    let filtered = allOrders.filter((o: any) => o.order_source === 'RUNNER_PICKUP');

    if (statusFilter && statusFilter !== 'all') {
      filtered = filtered.filter((o: any) => o.operational_status === statusFilter);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      filtered = filtered.filter((o: any) =>
        (o.order_code || '').toLowerCase().includes(q) ||
        (o.customer_name || '').toLowerCase().includes(q) ||
        (o.area || '').toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [allOrders, statusFilter, search]);

  // Stats
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

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.pending}</p>
            <p className="text-xs text-muted-foreground">Pending</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.inProgress}</p>
            <p className="text-xs text-muted-foreground">In Progress</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border-emerald-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.delivered}</p>
            <p className="text-xs text-muted-foreground">Delivered</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-primary">{stats.total}</p>
            <p className="text-xs text-muted-foreground">Total</p>
          </CardContent>
        </Card>
        <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-500/20">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-green-600 dark:text-green-400">{formatBND(stats.totalFees)}</p>
            <p className="text-xs text-muted-foreground">Total Fees</p>
          </CardContent>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        <div className="flex gap-2 flex-1 w-full sm:w-auto">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search orders..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <Filter className="h-4 w-4 mr-1" />
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
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
          <CardContent className="py-16 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-muted-foreground">No pickup orders yet</p>
            <p className="text-sm text-muted-foreground/70 mt-1">Create your first pickup order using the button above</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {pickupOrders.map((order: any) => {
            const expanded = expandedCards.has(order.id);
            const cfg = statusConfig[order.operational_status] || statusConfig.PICKUP_PENDING;
            const canAssign = order.operational_status === 'PICKUP_PENDING';
            const canAdvance = ['PICKUP_ASSIGNED', 'PICKED_UP', 'OUT_FOR_DELIVERY'].includes(order.operational_status);

            return (
              <Card key={order.id} className="overflow-hidden hover:shadow-md transition-shadow">
                <div className="p-4">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-semibold text-sm">{order.order_code}</span>
                        <Badge variant="outline" className={cn('gap-1 text-xs', cfg.color)}>
                          {cfg.icon} {cfg.label}
                        </Badge>
                        {Number(order.pickup_fee) > 0 && (
                          <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20">
                            Fee: {formatBND(order.pickup_fee)}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><User className="h-3.5 w-3.5" />{order.customer_name}</span>
                        <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{order.area || 'N/A'}</span>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="shrink-0" onClick={() => toggleCard(order.id)}>
                      {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                  </div>

                  {/* Timeline */}
                  <div className="mt-3">
                    <PickupTimeline currentStatus={order.operational_status} />
                    <div className="flex justify-between mt-1">
                      {ALL_STEPS.map(s => (
                        <span key={s} className="text-[10px] text-muted-foreground text-center flex-1 truncate">
                          {statusConfig[s].label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {expanded && (
                    <div className="mt-4 pt-3 border-t border-border space-y-3">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-muted-foreground text-xs">Phone</span>
                          <div className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                            <WhatsAppPhoneLink order={order} />
                          </div>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Payment</span>
                          <p className="font-medium">{order.payment_method}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Amount</span>
                          <p className="font-medium">{formatBND(order.total_amount)}</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground text-xs">Created</span>
                          <p className="font-medium">{format(new Date(order.created_at), 'dd MMM yyyy, HH:mm')}</p>
                        </div>
                      </div>

                      {order.address && (
                        <div>
                          <span className="text-muted-foreground text-xs">Address</span>
                          <p className="text-sm">{order.address}</p>
                        </div>
                      )}

                      {order.notes && (
                        <div>
                          <span className="text-muted-foreground text-xs">Notes</span>
                          <p className="text-sm">{order.notes}</p>
                        </div>
                      )}

                      {order.driver && (
                        <div>
                          <span className="text-muted-foreground text-xs">Driver</span>
                          <p className="text-sm font-medium">{order.driver.display_name || order.driver.email}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-3 flex gap-2 flex-wrap">
                    {canAssign && (
                      <div className="flex gap-2 items-center">
                        <SearchableSelect
                          options={driverOptions}
                          value=""
                          onValueChange={(driverId) => handleAssignDriver(order.id, driverId)}
                          placeholder="Assign driver..."
                          className="w-[180px]"
                        />
                      </div>
                    )}
                    {canAdvance && (
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => handleAdvanceStatus(order.id, order.operational_status)}
                        disabled={updateStatus.isPending}
                      >
                        {updateStatus.isPending ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ArrowRight className="h-3.5 w-3.5" />
                        )}
                        {order.operational_status === 'PICKUP_ASSIGNED' && 'Mark Picked Up'}
                        {order.operational_status === 'PICKED_UP' && 'Out for Delivery'}
                        {order.operational_status === 'OUT_FOR_DELIVERY' && 'Mark Delivered'}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
