import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Archive,
  Banknote,
  Boxes,
  CheckCircle2,
  PackagePlus,
  Pencil,
  RotateCcw,
  Search,
  Trash2,
  Truck,
  Undo2,
  XCircle,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CreatePickupDialog } from '@/components/driver/CreatePickupDialog';
import { DriverActivityHistory } from '@/components/driver/DriverActivityHistory';
import { CashSettlementWorkspace } from '@/components/runner/CashSettlementWorkspace';
import { useMyDrivers } from '@/hooks/useDrivers';
import {
  useCancelPickup,
  useDeletePickup,
  useDriverAllocatedStock,
  useRunnerDriverPickupNeeds,
  useRunnerPickups,
  type DriverPickup,
  type RunnerDriverPickupNeed,
} from '@/hooks/useDriverPickups';
import { useAcknowledgeReturn, useRunnerReturns, type DriverReturn } from '@/hooks/useDriverReturns';
import { useRunnerCashLiabilities } from '@/hooks/useCashLiabilities';
import { getTodayDateKey } from '@/lib/driverOrderScope';

type DriverOption = {
  id: string;
  name: string;
};

type AllocatedStockItem = {
  driver_id: string;
  product_id: string;
  sku_name: string;
  sku_code: string | null;
  allocated_qty: number;
  delivered_qty: number;
  pending_qty: number;
};

type PickupNeedDisplay = RunnerDriverPickupNeed & {
  existingPickup?: DriverPickup;
};

const currency = new Intl.NumberFormat('en-BN', {
  style: 'currency',
  currency: 'BND',
});

function formatBND(value: number) {
  return currency.format(value || 0).replace('BND', 'BND ');
}

function productLabel(item: { product?: { sku_name?: string | null; sku_code?: string | null }; qty: number }) {
  const code = item.product?.sku_code;
  const name = item.product?.sku_name || 'Unknown product';
  return `${code ? `${code}/` : ''}${name} x ${item.qty}`;
}

function pickupStatusLabel(status: DriverPickup['status']) {
  if (status === 'DRIVER_ACKED') return 'Acknowledged';
  if (status === 'COMPLETED') return 'Successful Pickup';
  if (status === 'CANCELLED') return 'Cancelled';
  return 'Pending driver';
}

function returnStatusLabel(status: DriverReturn['status']) {
  if (status === 'RUNNER_ACKED') return 'Acknowledged';
  if (status === 'CANCELLED') return 'Cancelled';
  return 'Pending return';
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-10 text-center">
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function PickupNeedsPanel({
  needs,
  isLoading,
  onCreatePickup,
}: {
  needs: PickupNeedDisplay[];
  isLoading: boolean;
  onCreatePickup: (need: PickupNeedDisplay) => void;
}) {
  return (
    <Card className="mb-3 rounded-3xl border-primary/20 bg-primary/5">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-lg">
            <PackagePlus className="h-5 w-5 text-primary" />
            Pickup Suggestions
          </CardTitle>
          <Badge variant="secondary" className="rounded-full">
            {needs.length} driver(s)
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <EmptyState title="Loading pickup needs" description="Checking active driver-app delivery orders." />
        ) : needs.length === 0 ? (
          <EmptyState
            title="No pickup needed"
            description="No active assigned or out-for-delivery driver orders need stock under the current filter."
          />
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {needs.map((need) => (
              <Card key={need.driver_id} className="rounded-2xl border-border/60 bg-card">
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-lg font-black text-foreground">{need.driver_name}</p>
                      <p className="text-sm font-semibold text-muted-foreground">
                        {need.order_count} active order(s) - {need.total_qty} item qty
                      </p>
                    </div>
                    <Button size="sm" className="shrink-0 rounded-xl" onClick={() => onCreatePickup(need)}>
                      {need.existingPickup ? <Pencil className="mr-1 h-4 w-4" /> : <Truck className="mr-1 h-4 w-4" />}
                      {need.existingPickup ? 'Edit pickup' : 'Pickup'}
                    </Button>
                  </div>

                  {need.overdue_order_count > 0 && (
                    <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
                      {need.overdue_order_count} overdue active order(s) need return if not delivered by end of day.
                    </div>
                  )}

                  <div>
                    <p className="mb-1 text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Items needed</p>
                    <div className="flex flex-wrap gap-1.5">
                      {need.items.map((item) => (
                        <Badge key={item.product_id} variant="secondary" className="rounded-full">
                          {item.sku_code ? `${item.sku_code}/` : ''}{item.sku_name} x {item.required_qty}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  <p className="text-xs font-semibold text-muted-foreground">
                    Orders: {need.order_codes.slice(0, 8).join(', ')}
                    {need.order_codes.length > 8 ? ` +${need.order_codes.length - 8} more` : ''}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

type RunnerDriverStockWorkspaceProps = {
  runnerIdOverride?: string;
  hideCashSettlement?: boolean;
  hideDriverStock?: boolean;
};

export default function RunnerDriverStockWorkspace({
  runnerIdOverride,
  hideCashSettlement = false,
  hideDriverStock = false,
}: RunnerDriverStockWorkspaceProps = {}) {
  const [activeTab, setActiveTab] = useState(hideDriverStock ? 'cash' : 'pickups');
  const [driverFilter, setDriverFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [pickupStatusFilter, setPickupStatusFilter] = useState('all');
  const [quickPickupDriverId, setQuickPickupDriverId] = useState<string | null>(null);
  const [pickupDialogOpen, setPickupDialogOpen] = useState(false);
  const [editingPickup, setEditingPickup] = useState<DriverPickup | null>(null);
  const todayDate = getTodayDateKey();
  const { data: drivers, isLoading: loadingDrivers } = useMyDrivers(runnerIdOverride);
  const { data: pickups, isLoading: loadingPickups } = useRunnerPickups(runnerIdOverride);
  const { data: returns, isLoading: loadingReturns } = useRunnerReturns(runnerIdOverride);
  const { data: allocatedStock, isLoading: loadingStock } = useDriverAllocatedStock(
    driverFilter === 'all' ? 'all' : driverFilter,
    runnerIdOverride,
  );
  const { data: pickupNeeds, isLoading: loadingPickupNeeds } = useRunnerDriverPickupNeeds(runnerIdOverride);
  const { data: cashLiabilities } = useRunnerCashLiabilities(runnerIdOverride);
  const cancelPickup = useCancelPickup();
  const deletePickup = useDeletePickup();
  const acknowledgeReturn = useAcknowledgeReturn();

  useEffect(() => {
    if (hideCashSettlement && activeTab === 'cash') {
      setActiveTab('pickups');
    } else if (hideDriverStock && activeTab !== 'cash') {
      setActiveTab('cash');
    }
  }, [activeTab, hideCashSettlement, hideDriverStock]);

  useEffect(() => {
    if (!editingPickup) return;
    const latestPickup = (pickups || []).find((pickup) => pickup.id === editingPickup.id);
    if (!latestPickup || latestPickup.status !== 'PENDING_DRIVER_ACK') {
      setEditingPickup(null);
    }
  }, [editingPickup, pickups]);

  const driverOptions: DriverOption[] = useMemo(
    () =>
      (drivers || []).map((item) => ({
        id: item.driver_id,
        name: item.driver?.display_name || item.driver?.email || 'Unknown Driver',
      })),
    [drivers],
  );

  const driverNameById = useMemo(() => {
    const map = new Map<string, string>();
    driverOptions.forEach((driver) => map.set(driver.id, driver.name));
    return map;
  }, [driverOptions]);

  const normalizedQuery = query.trim().toLowerCase();
  const filteredPickups = useMemo(() => {
    return (pickups || []).filter((pickup) => {
      if (driverFilter !== 'all' && pickup.driver_id !== driverFilter) return false;
      if (pickupStatusFilter !== 'all' && pickup.status !== pickupStatusFilter) return false;
      if (!normalizedQuery) return true;
      const haystack = [
        pickup.driver?.display_name,
        pickup.status,
        pickup.notes,
        ...(pickup.items || []).map(productLabel),
      ].join(' ').toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [driverFilter, normalizedQuery, pickupStatusFilter, pickups]);

  const todayPickups = useMemo(
    () => filteredPickups.filter((pickup) =>
      pickup.pickup_date.slice(0, 10) === todayDate
      && (pickup.status === 'PENDING_DRIVER_ACK' || pickup.status === 'DRIVER_ACKED')),
    [filteredPickups, todayDate],
  );
  const pickupHistory = useMemo(
    () => filteredPickups.filter((pickup) => pickup.status === 'COMPLETED'),
    [filteredPickups],
  );
  const pickupHistoryGroups = useMemo(() => {
    const groups = new Map<string, DriverPickup[]>();
    pickupHistory.forEach((pickup) => {
      const date = pickup.pickup_date.slice(0, 10);
      groups.set(date, [...(groups.get(date) || []), pickup]);
    });
    return Array.from(groups.entries());
  }, [pickupHistory]);

  const quickPickupNeed = useMemo(
    () => (pickupNeeds || []).find((need) => need.driver_id === quickPickupDriverId) || null,
    [pickupNeeds, quickPickupDriverId],
  );

  const filteredReturns = useMemo(() => {
    return (returns || []).filter((item) => {
      if (driverFilter !== 'all' && item.driver_id !== driverFilter) return false;
      if (!normalizedQuery) return true;
      const haystack = [
        item.driver?.display_name,
        item.status,
        item.notes,
        ...(item.items || []).map(productLabel),
      ].join(' ').toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [driverFilter, normalizedQuery, returns]);
  const pendingFilteredReturns = useMemo(
    () => filteredReturns.filter((item) => item.status === 'PENDING_RUNNER_ACK'),
    [filteredReturns],
  );
  const returnHistory = useMemo(
    () => filteredReturns.filter((item) => item.status === 'RUNNER_ACKED'),
    [filteredReturns],
  );
  const returnHistoryGroups = useMemo(() => {
    const groups = new Map<string, DriverReturn[]>();
    returnHistory.forEach((item) => {
      const date = item.created_at.slice(0, 10);
      groups.set(date, [...(groups.get(date) || []), item]);
    });
    return Array.from(groups.entries());
  }, [returnHistory]);

  const stockItems = useMemo(() => (allocatedStock || []) as AllocatedStockItem[], [allocatedStock]);
  const filteredStock = useMemo(() => {
    return stockItems.filter((item) => {
      if (!normalizedQuery) return true;
      return [item.sku_code, item.sku_name, driverNameById.get(item.driver_id)]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [driverNameById, normalizedQuery, stockItems]);

  const unscheduledPickupNeeds = useMemo<PickupNeedDisplay[]>(() => {
    const editableToday = (pickups || []).filter((pickup) =>
      pickup.pickup_date.slice(0, 10) === todayDate
      && pickup.status === 'PENDING_DRIVER_ACK');

    return (pickupNeeds || []).map((need) => ({
      ...need,
      existingPickup: editableToday.find((pickup) => pickup.driver_id === need.driver_id),
    }));
  }, [pickupNeeds, pickups, todayDate]);

  const filteredPickupNeeds = useMemo(() => {
    return unscheduledPickupNeeds.filter((need) => {
      if (driverFilter !== 'all' && need.driver_id !== driverFilter) return false;
      if (!normalizedQuery) return true;

      const haystack = [
        need.driver_name,
        need.driver_email,
        ...need.order_codes,
        ...need.items.flatMap((item) => [item.sku_code, item.sku_name]),
      ].join(' ').toLowerCase();

      return haystack.includes(normalizedQuery);
    });
  }, [driverFilter, normalizedQuery, unscheduledPickupNeeds]);

  const pendingPickups = (pickups || []).filter(
    (pickup) => pickup.pickup_date.slice(0, 10) === todayDate && pickup.status === 'PENDING_DRIVER_ACK',
  ).length;
  const pendingReturns = (returns || []).filter((item) => item.status === 'PENDING_RUNNER_ACK').length;
  const totalAllocated = stockItems.reduce((sum, item) => sum + Number(item.allocated_qty || 0), 0);
  const totalPendingStock = stockItems.reduce((sum, item) => sum + Number(item.pending_qty || 0), 0);
  const activePickupOrderCount = unscheduledPickupNeeds.reduce((sum, need) => sum + need.order_count, 0);
  const totalCash = Number(cashLiabilities?.totalOpenAmount || 0);
  const totalOpenCashOrders = Number(cashLiabilities?.totalOpen || 0);

  return (
    <div className="space-y-4 pb-28 md:pb-4">
      <div className="rounded-3xl border border-border/60 bg-card p-4 shadow-sm md:p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.22em] text-primary">
              {hideDriverStock ? 'Cash Settlement' : 'Driver Stock Desk'}
            </p>
            <h1 className="mt-2 text-2xl font-black leading-tight text-foreground md:text-3xl">
              {hideDriverStock ? 'Driver Cash Reconciliation' : 'Pickups, Returns, Stock and Cash'}
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {hideDriverStock
                ? 'Reconcile cash from Driver deliveries after Runner acceptance.'
                : 'One workspace for driver pickup scheduling, return acknowledgement, allocated stock and cash settlement.'}
            </p>
          </div>
          {!hideDriverStock && (
            <>
              <CreatePickupDialog
                open={pickupDialogOpen}
                onOpenChange={(open) => {
                  setPickupDialogOpen(open);
                  if (!open) setQuickPickupDriverId(null);
                }}
                defaultDriverId={quickPickupDriverId || ''}
                defaultItems={quickPickupNeed?.items}
                defaultOrderIds={quickPickupNeed?.order_ids}
                defaultOrderCodes={quickPickupNeed?.order_codes}
                runnerIdOverride={runnerIdOverride}
                trigger={
                  <Button onClick={() => {
                    setQuickPickupDriverId(null);
                    setPickupDialogOpen(true);
                  }}>
                    <PackagePlus className="mr-2 h-4 w-4" />
                    Create Pickup
                  </Button>
                }
              />
              {editingPickup && (
                <CreatePickupDialog
                  open
                  onOpenChange={(open) => {
                    if (!open) setEditingPickup(null);
                  }}
                  pickup={editingPickup}
                  runnerIdOverride={runnerIdOverride}
                />
              )}
            </>
          )}
        </div>

        <div className={`mt-4 grid grid-cols-2 gap-2 ${hideDriverStock ? 'md:grid-cols-1' : hideCashSettlement ? 'md:grid-cols-3' : 'md:grid-cols-4'}`}>
          {!hideDriverStock && <Card className="rounded-2xl border-border/60">
            <CardContent className="p-3">
              <PackagePlus className="mb-2 h-4 w-4 text-primary" />
              <p className="text-2xl font-black">{pendingPickups}</p>
              <p className="text-xs font-semibold text-muted-foreground">{activePickupOrderCount} active order(s)</p>
            </CardContent>
          </Card>}
          {!hideDriverStock && <Card className="rounded-2xl border-border/60">
            <CardContent className="p-3">
              <Undo2 className="mb-2 h-4 w-4 text-primary" />
              <p className="text-2xl font-black">{pendingReturns}</p>
              <p className="text-xs font-semibold text-muted-foreground">Pending returns</p>
            </CardContent>
          </Card>}
          {!hideDriverStock && <Card className="rounded-2xl border-border/60">
            <CardContent className="p-3">
              <Boxes className="mb-2 h-4 w-4 text-primary" />
              <p className="text-2xl font-black">{totalPendingStock}</p>
              <p className="text-xs font-semibold text-muted-foreground">{totalAllocated} allocated</p>
            </CardContent>
          </Card>}
          {!hideCashSettlement && (
            <Card className="rounded-2xl border-border/60">
              <CardContent className="p-3">
                <Banknote className="mb-2 h-4 w-4 text-primary" />
                <p className="text-2xl font-black">{formatBND(totalCash)}</p>
                <p className="text-xs font-semibold text-muted-foreground">{totalOpenCashOrders} cash order(s) open</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className={activeTab === 'cash' ? '' : 'grid gap-3 md:grid-cols-[220px_minmax(0,1fr)]'}>
        {activeTab !== 'cash' && <div className="space-y-3">
          <Select value={driverFilter} onValueChange={setDriverFilter}>
            <SelectTrigger className="h-11 rounded-2xl bg-card">
              <SelectValue placeholder="All drivers" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All drivers</SelectItem>
              {driverOptions.map((driver) => (
                <SelectItem key={driver.id} value={driver.id}>{driver.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {activeTab === 'pickups' && (
            <Select value={pickupStatusFilter} onValueChange={setPickupStatusFilter}>
              <SelectTrigger className="h-11 rounded-2xl bg-card">
                <SelectValue placeholder="All pickup statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All pickup statuses</SelectItem>
                <SelectItem value="PENDING_DRIVER_ACK">Pending acknowledgement</SelectItem>
                <SelectItem value="DRIVER_ACKED">Acknowledged</SelectItem>
                <SelectItem value="COMPLETED">Completed</SelectItem>
                <SelectItem value="CANCELLED">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search driver, item, order..."
              className="h-11 rounded-2xl bg-card pl-9"
            />
          </div>
        </div>}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="min-w-0">
          <div className="overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <TabsList className="inline-flex h-11 w-max min-w-max justify-start rounded-2xl bg-secondary/40">
              {!hideDriverStock && <TabsTrigger value="pickups" className="shrink-0 gap-2 rounded-xl px-3 whitespace-nowrap">
                <Truck className="h-4 w-4" /> Pickups
              </TabsTrigger>}
              {!hideDriverStock && <TabsTrigger value="returns" className="shrink-0 gap-2 rounded-xl px-3 whitespace-nowrap">
                <RotateCcw className="h-4 w-4" /> Returns
              </TabsTrigger>}
              {!hideDriverStock && <TabsTrigger value="stock" className="shrink-0 gap-2 rounded-xl px-3 whitespace-nowrap">
                <Archive className="h-4 w-4" /> Allocated Stock
              </TabsTrigger>}
              {!hideCashSettlement && (
                <TabsTrigger value="cash" className="shrink-0 gap-2 rounded-xl px-3 whitespace-nowrap">
                  <Banknote className="h-4 w-4" /> Cash Settlement
                </TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent value="pickups" className="mt-3">
            <PickupNeedsPanel
              needs={filteredPickupNeeds}
              isLoading={loadingPickupNeeds}
              onCreatePickup={(need) => {
                if (need.existingPickup) {
                  setEditingPickup(need.existingPickup);
                } else {
                  setQuickPickupDriverId(need.driver_id);
                  setPickupDialogOpen(true);
                }
              }}
            />

            <Card className="rounded-3xl border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Truck className="h-5 w-5 text-primary" />
                  Today's Pickup Schedule
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingPickups ? (
                  <EmptyState title="Loading pickups" description="Checking driver pickup records." />
                ) : todayPickups.length === 0 ? (
                  <EmptyState title="No pickup scheduled today" description="Create today’s pickup when a driver needs stock for today’s deliveries." />
                ) : (
                  <>
                  <div className="space-y-2 md:hidden">
                    {todayPickups.map((pickup) => (
                      <div key={pickup.id} className="rounded-2xl border border-border/70 bg-card p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-black uppercase tracking-[0.14em] text-muted-foreground">Driver</p>
                            <p className="mt-1 break-words text-base font-black text-foreground">
                              {pickup.driver?.display_name || 'Unknown driver'}
                            </p>
                            <p className="mt-1 text-sm font-semibold text-muted-foreground">
                              {format(new Date(pickup.pickup_date), 'dd MMM yyyy')}
                            </p>
                          </div>
                          <Badge
                            variant={pickup.status === 'COMPLETED' ? 'default' : pickup.status === 'CANCELLED' ? 'destructive' : 'outline'}
                            className="shrink-0 rounded-full"
                          >
                            {pickupStatusLabel(pickup.status)}
                          </Badge>
                        </div>

                        <div className="mt-3 space-y-2 border-y border-border/60 py-3">
                          {(pickup.items || []).map((item) => (
                            <div key={item.id} className="flex items-center justify-between gap-3 text-sm">
                              <span className="min-w-0 break-words font-semibold">{productLabel(item)}</span>
                              <span className="shrink-0 text-muted-foreground">
                                {item.collected_qty ?? 0}/{item.qty} collected
                              </span>
                            </div>
                          ))}
                        </div>

                        <div className="mt-3 text-xs text-muted-foreground">
                          <p>Created {format(new Date(pickup.created_at), 'dd MMM, HH:mm')} by {pickup.creator?.display_name || 'Runner'}</p>
                          {pickup.completed_at && <p>Completed {format(new Date(pickup.completed_at), 'dd MMM, HH:mm')}</p>}
                          {pickup.source_order_codes?.length ? <p>Orders: {pickup.source_order_codes.join(', ')}</p> : null}
                          {pickup.notes && <p className="mt-1 break-words">Notes: {pickup.notes}</p>}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {pickup.status === 'PENDING_DRIVER_ACK' && (
                            <Button size="sm" variant="outline" onClick={() => setEditingPickup(pickup)}>
                              <Pencil className="mr-1 h-4 w-4" /> Edit
                            </Button>
                          )}
                          {pickup.status === 'PENDING_DRIVER_ACK' && (
                            <Button size="sm" variant="outline" onClick={() => cancelPickup.mutate(pickup.id)}>
                              <XCircle className="mr-1 h-4 w-4" /> Cancel
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="hidden overflow-x-auto md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Driver</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Items</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {todayPickups.map((pickup) => (
                          <TableRow key={pickup.id}>
                            <TableCell className="font-semibold">{pickup.driver?.display_name || 'Unknown'}</TableCell>
                            <TableCell className="min-w-[180px]">
                              <p className="font-semibold">{format(new Date(pickup.pickup_date), 'dd MMM yyyy')}</p>
                              <p className="mt-1 text-xs text-muted-foreground">
                                Created {format(new Date(pickup.created_at), 'dd MMM, HH:mm')} by {pickup.creator?.display_name || 'Runner'}
                              </p>
                              {pickup.completed_at && (
                                <p className="text-xs text-muted-foreground">
                                  Completed {format(new Date(pickup.completed_at), 'dd MMM, HH:mm')}
                                </p>
                              )}
                            </TableCell>
                            <TableCell className="min-w-[260px]">
                              {(pickup.items || []).length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {(pickup.items || []).map((item) => (
                                    <Badge key={item.id} variant="secondary" className="rounded-full font-semibold">
                                      {productLabel(item)} · {item.collected_qty ?? 0}/{item.qty} collected
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">No items</span>
                              )}
                              {pickup.source_order_codes?.length ? (
                                <p className="mt-2 text-xs text-muted-foreground">Orders: {pickup.source_order_codes.join(', ')}</p>
                              ) : null}
                              {pickup.notes && <p className="mt-1 text-xs text-muted-foreground">Notes: {pickup.notes}</p>}
                            </TableCell>
                            <TableCell>
                              <Badge variant={pickup.status === 'DRIVER_ACKED' ? 'default' : pickup.status === 'CANCELLED' ? 'destructive' : 'outline'}>
                                {pickupStatusLabel(pickup.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-2">
                                {pickup.status === 'PENDING_DRIVER_ACK' && (
                                  <Button size="sm" variant="outline" onClick={() => setEditingPickup(pickup)}>
                                    <Pencil className="mr-1 h-4 w-4" /> Edit
                                  </Button>
                                )}
                                {pickup.status === 'PENDING_DRIVER_ACK' && (
                                  <Button size="sm" variant="outline" onClick={() => cancelPickup.mutate(pickup.id)}>
                                    <XCircle className="mr-1 h-4 w-4" /> Cancel
                                  </Button>
                                )}
                                <Button size="sm" variant="ghost" onClick={() => deletePickup.mutate(pickup.id)}>
                                  <Trash2 className="mr-1 h-4 w-4" /> Delete
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  </>
                )}
              </CardContent>
            </Card>

            {pickupHistoryGroups.length > 0 && (
              <div className="mt-3">
                <DriverActivityHistory
                  title="Pickup history"
                  summary={`${pickupHistory.length} completed pickup(s)`}
                >
                  {pickupHistoryGroups.map(([date, group]) => (
                    <div key={date} className="space-y-2">
                      <p className="text-sm font-bold text-muted-foreground">
                        {format(new Date(`${date}T00:00:00`), 'dd MMM yyyy')}
                      </p>
                      {group.map((pickup) => (
                        <div key={pickup.id} className="rounded-lg border border-border/70 bg-background p-3">
                          <div className="flex items-start justify-between gap-3">
                            <p className="font-semibold">{pickup.driver?.display_name || 'Unknown driver'}</p>
                            <Badge variant="outline" className="shrink-0">{pickupStatusLabel(pickup.status)}</Badge>
                          </div>
                          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                            {(pickup.items || []).map((item) => (
                              <p key={item.id} className="break-words">{productLabel(item)}</p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </DriverActivityHistory>
              </div>
            )}
          </TabsContent>

          <TabsContent value="returns" className="mt-3">
            <Card className="rounded-3xl border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <RotateCcw className="h-5 w-5 text-primary" />
                  Pending Driver Returns
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingReturns ? (
                  <EmptyState title="Loading returns" description="Checking return requests." />
                ) : pendingFilteredReturns.length === 0 ? (
                  <EmptyState title="No pending returns" description="New driver return requests will appear here for acknowledgement." />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Driver</TableHead>
                          <TableHead>Created</TableHead>
                          <TableHead>Items</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="text-right">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pendingFilteredReturns.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-semibold">{item.driver?.display_name || 'Unknown'}</TableCell>
                            <TableCell>{format(new Date(item.created_at), 'dd MMM, HH:mm')}</TableCell>
                            <TableCell className="min-w-[260px]">
                              {(item.items || []).length > 0 ? (
                                <div className="flex flex-wrap gap-1.5">
                                  {(item.items || []).map((returnItem) => (
                                    <Badge key={returnItem.id} variant="secondary" className="rounded-full font-semibold">
                                      {productLabel(returnItem)}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-muted-foreground">No items</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Badge variant={item.status === 'RUNNER_ACKED' ? 'default' : item.status === 'CANCELLED' ? 'destructive' : 'outline'}>
                                {returnStatusLabel(item.status)}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              {item.status === 'PENDING_RUNNER_ACK' ? (
                                <Button size="sm" onClick={() => acknowledgeReturn.mutate(item.id)}>
                                  <CheckCircle2 className="mr-1 h-4 w-4" /> Acknowledge
                                </Button>
                              ) : (
                                <span className="text-sm text-muted-foreground">Done</span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {returnHistoryGroups.length > 0 && (
              <div className="mt-3">
                <DriverActivityHistory
                  title="Return history"
                  summary={`${returnHistory.length} acknowledged return(s)`}
                >
                  {returnHistoryGroups.map(([date, group]) => (
                    <div key={date} className="space-y-2">
                      <p className="text-sm font-bold text-muted-foreground">
                        {format(new Date(`${date}T00:00:00`), 'dd MMM yyyy')}
                      </p>
                      {group.map((item) => (
                        <div key={item.id} className="rounded-lg border border-border/70 bg-background p-3">
                          <div className="flex items-start justify-between gap-3">
                            <p className="font-semibold">{item.driver?.display_name || 'Unknown driver'}</p>
                            <Badge variant="outline" className="shrink-0">{returnStatusLabel(item.status)}</Badge>
                          </div>
                          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                            {(item.items || []).map((returnItem) => (
                              <p key={returnItem.id} className="break-words">{productLabel(returnItem)}</p>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </DriverActivityHistory>
              </div>
            )}
          </TabsContent>

          <TabsContent value="stock" className="mt-3">
            <Card className="rounded-3xl border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Boxes className="h-5 w-5 text-primary" />
                  Allocated Stock
                </CardTitle>
              </CardHeader>
              <CardContent>
                {loadingDrivers || loadingStock ? (
                  <EmptyState title="Loading stock" description="Checking driver allocated stock." />
                ) : filteredStock.length === 0 ? (
                  <EmptyState
                    title="No allocated stock"
                    description="Only active driver-app delivery orders appear here. Delivered, missing and cancelled orders are excluded."
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Driver</TableHead>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-right">Allocated</TableHead>
                          <TableHead className="text-right">Delivered</TableHead>
                          <TableHead className="text-right">Pending</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredStock.map((item) => (
                          <TableRow key={`${item.driver_id}-${item.product_id}`}>
                            <TableCell className="font-semibold">{driverNameById.get(item.driver_id) || 'Unknown'}</TableCell>
                            <TableCell>
                              <div className="font-semibold">{item.sku_name}</div>
                              {item.sku_code && <div className="text-xs text-muted-foreground">{item.sku_code}</div>}
                            </TableCell>
                            <TableCell className="text-right font-semibold">{item.allocated_qty}</TableCell>
                            <TableCell className="text-right text-green-700">{item.delivered_qty}</TableCell>
                            <TableCell className="text-right text-amber-700">{item.pending_qty}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {!hideCashSettlement && (
            <TabsContent value="cash" className="mt-3">
              <CashSettlementWorkspace runnerIdOverride={runnerIdOverride} />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </div>
  );
}
