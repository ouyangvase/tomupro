import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { CheckCircle2, Package, PackageCheck } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DriverActivityHistory } from '@/components/driver/DriverActivityHistory';
import LocationTracker from '@/components/driver/LocationTracker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAcknowledgePickup, useDriverPickups, type DriverPickup } from '@/hooks/useDriverPickups';
import { getTodayDateKey } from '@/lib/driverOrderScope';

function pickupDateKey(pickup: DriverPickup) {
  return pickup.pickup_date.slice(0, 10);
}

function PickupDetails({
  pickup,
  actionable = false,
}: {
  pickup: DriverPickup;
  actionable?: boolean;
}) {
  const acceptPickup = useAcknowledgePickup();

  return (
    <section className="rounded-lg border border-border/70 bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{pickup.runner?.display_name || 'Runner'}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {format(parseISO(pickupDateKey(pickup)), 'dd MMM yyyy')} · Created {format(new Date(pickup.created_at), 'HH:mm')}
          </p>
        </div>
        <Badge
          variant="outline"
          className={actionable
            ? 'shrink-0 border-amber-300 bg-amber-50 text-amber-800'
            : 'shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700'}
        >
          {actionable ? 'Ready' : 'Completed'}
        </Badge>
      </div>

      <div className="mt-3 space-y-2 border-y border-border/60 py-3">
        {(pickup.items || []).map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
            <span className="min-w-0 break-words font-medium">
              {item.product?.sku_code || 'N/A'} / {item.product?.sku_name || 'Unknown'}
            </span>
            <span className="shrink-0 font-bold">x {item.qty}</span>
          </div>
        ))}
      </div>

      {pickup.source_order_codes?.length > 0 && (
        <p className="mt-2 break-words text-xs text-muted-foreground">
          Orders: {pickup.source_order_codes.join(', ')}
        </p>
      )}
      {pickup.notes && <p className="mt-2 break-words text-sm text-muted-foreground">Notes: {pickup.notes}</p>}

      {actionable ? (
        <Button
          className="mt-3 w-full"
          onClick={() => acceptPickup.mutate(pickup.id)}
          disabled={acceptPickup.isPending}
        >
          <CheckCircle2 className="mr-2 h-4 w-4" />
          {acceptPickup.isPending ? 'Accepting...' : 'Accept pickup'}
        </Button>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-sm font-medium text-emerald-700">
          <PackageCheck className="h-4 w-4" /> Stock collected
        </p>
      )}
    </section>
  );
}

export default function DriverPickupsPage() {
  const { data: pickups = [], isLoading, isError, refetch, isFetching } = useDriverPickups();
  const today = getTodayDateKey();

  const currentPickups = useMemo(
    () => pickups.filter((pickup) =>
      pickupDateKey(pickup) === today
      && (pickup.status === 'PENDING_DRIVER_ACK' || pickup.status === 'DRIVER_ACKED')),
    [pickups, today],
  );
  const history = useMemo(
    () => pickups.filter((pickup) => pickup.status === 'COMPLETED'),
    [pickups],
  );
  const historyGroups = useMemo(() => {
    const groups = new Map<string, DriverPickup[]>();
    history.forEach((pickup) => {
      const key = pickupDateKey(pickup);
      groups.set(key, [...(groups.get(key) || []), pickup]);
    });
    return Array.from(groups.entries());
  }, [history]);

  return (
    <AppLayout>
      <div className="mx-auto w-full min-w-0 max-w-2xl space-y-4 overflow-x-hidden pb-24">
        <LocationTracker />

        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Package className="h-6 w-6" />
            My Pickups
          </h1>
          <p className="text-sm text-muted-foreground">Today&apos;s pickup stays open until you accept it.</p>
        </div>

        {isLoading ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">Loading pickups...</CardContent></Card>
        ) : isError ? (
          <Card>
            <CardContent className="space-y-3 py-8 text-center">
              <p className="text-muted-foreground">Pickup records could not be loaded.</p>
              <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>Try again</Button>
            </CardContent>
          </Card>
        ) : (
          <>
            {currentPickups.length > 0 ? (
              <div className="space-y-3">
                <h2 className="text-lg font-semibold">Ready to collect</h2>
                {currentPickups.map((pickup) => <PickupDetails key={pickup.id} pickup={pickup} actionable />)}
              </div>
            ) : (
              <Card>
                <CardContent className="py-8 text-center">
                  <Package className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
                  <p className="font-semibold">No pickup waiting today</p>
                  <p className="mt-1 text-sm text-muted-foreground">A new pickup from your runner will appear here.</p>
                </CardContent>
              </Card>
            )}

            {historyGroups.length > 0 && (
              <DriverActivityHistory title="Pickup history" summary={`${history.length} completed pickup(s)`}>
                {historyGroups.map(([dateKey, group]) => (
                  <div key={dateKey} className="space-y-2">
                    <p className="text-sm font-bold text-muted-foreground">{format(parseISO(dateKey), 'dd MMM yyyy')}</p>
                    {group.map((pickup) => <PickupDetails key={pickup.id} pickup={pickup} />)}
                  </div>
                ))}
              </DriverActivityHistory>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
