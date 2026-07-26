import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { CheckCircle2, Clock3, Package, PackageCheck, XCircle } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DriverActivityDateGroup } from '@/components/driver/DriverActivityDateGroup';
import LocationTracker from '@/components/driver/LocationTracker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAcknowledgePickup, useDriverPickups, type DriverPickup } from '@/hooks/useDriverPickups';

const statusDetails = {
  PENDING_DRIVER_ACK: {
    label: 'Acknowledge required',
    className: 'border-amber-300 bg-amber-50 text-amber-800',
  },
  DRIVER_ACKED: {
    label: 'Awaiting collection',
    className: 'border-blue-200 bg-blue-50 text-blue-700',
  },
  COMPLETED: {
    label: 'Completed',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  CANCELLED: {
    label: 'Cancelled',
    className: 'border-border bg-muted text-muted-foreground',
  },
} satisfies Record<DriverPickup['status'], { label: string; className: string }>;

function pickupDateKey(pickup: DriverPickup) {
  return pickup.pickup_date.slice(0, 10);
}

export default function DriverPickupsPage() {
  const { data: pickups = [], isLoading, isError, refetch, isFetching } = useDriverPickups();
  const acknowledgePickup = useAcknowledgePickup();

  const dateGroups = useMemo(() => {
    const groups = new Map<string, DriverPickup[]>();
    pickups.forEach((pickup) => {
      const key = pickupDateKey(pickup);
      groups.set(key, [...(groups.get(key) || []), pickup]);
    });
    return Array.from(groups.entries());
  }, [pickups]);

  return (
    <AppLayout>
      <div className="mx-auto w-full min-w-0 max-w-2xl space-y-4 overflow-x-hidden pb-24">
        <LocationTracker />

        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <Package className="h-6 w-6" />
            My Pickups
          </h1>
          <p className="text-sm text-muted-foreground">Tap a date to view items and actions.</p>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">Loading pickups...</CardContent>
          </Card>
        ) : isError ? (
          <Card>
            <CardContent className="space-y-3 py-8 text-center">
              <p className="text-muted-foreground">Pickup records could not be loaded.</p>
              <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : dateGroups.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <Package className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="font-semibold">No pickups assigned</p>
              <p className="mt-1 text-sm text-muted-foreground">New pickups from your runner will appear here.</p>
            </CardContent>
          </Card>
        ) : (
          <Card className="overflow-hidden">
            {dateGroups.map(([dateKey, group]) => {
              return (
                <DriverActivityDateGroup
                  key={dateKey}
                  date={format(parseISO(dateKey), 'dd MMM yyyy')}
                >
                  {group.map((pickup) => {
                    const status = statusDetails[pickup.status];
                    return (
                      <section key={pickup.id} className="rounded-lg border border-border/70 bg-background p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold">{pickup.runner?.display_name || 'Runner'}</p>
                            <p className="mt-0.5 text-xs text-muted-foreground">
                              Created {format(new Date(pickup.created_at), 'dd MMM, HH:mm')}
                            </p>
                          </div>
                          <Badge variant="outline" className={`shrink-0 ${status.className}`}>{status.label}</Badge>
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
                          {!pickup.items?.length && <p className="text-sm text-muted-foreground">No items listed</p>}
                        </div>

                        {pickup.notes && <p className="mt-3 break-words text-sm text-muted-foreground">Notes: {pickup.notes}</p>}
                        {pickup.source_order_codes?.length > 0 && (
                          <p className="mt-2 break-words text-xs text-muted-foreground">
                            Orders: {pickup.source_order_codes.join(', ')}
                          </p>
                        )}

                        {pickup.status === 'PENDING_DRIVER_ACK' && (
                          <Button
                            className="mt-3 w-full"
                            onClick={() => acknowledgePickup.mutate(pickup.id)}
                            disabled={acknowledgePickup.isPending}
                          >
                            <CheckCircle2 className="mr-2 h-4 w-4" />
                            {acknowledgePickup.isPending ? 'Acknowledging...' : 'Acknowledge pickup'}
                          </Button>
                        )}
                        {pickup.status === 'DRIVER_ACKED' && (
                          <p className="mt-3 flex items-center gap-2 text-sm font-medium text-blue-700">
                            <Clock3 className="h-4 w-4" /> Waiting for runner to complete collection
                          </p>
                        )}
                        {pickup.status === 'COMPLETED' && (
                          <p className="mt-3 flex items-center gap-2 text-sm font-medium text-emerald-700">
                            <PackageCheck className="h-4 w-4" /> Stock collected
                          </p>
                        )}
                        {pickup.status === 'CANCELLED' && (
                          <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                            <XCircle className="h-4 w-4" /> Pickup cancelled
                          </p>
                        )}
                      </section>
                    );
                  })}
                </DriverActivityDateGroup>
              );
            })}
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
