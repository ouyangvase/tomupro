import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { AddressActions } from '@/components/driver/AddressActions';
import LocationTracker from '@/components/driver/LocationTracker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverRouteOptimization } from '@/hooks/useRouteOptimization';
import { ChevronRight, Navigation, Package } from 'lucide-react';

export default function DriverRoutePage() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: routeData, isLoading } = useDriverRouteOptimization(profile?.id);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl py-16 text-center text-sm font-semibold text-muted-foreground">
          Loading today's route...
        </div>
      </AppLayout>
    );
  }

  if (!routeData || routeData.totalOrders === 0) {
    return (
      <AppLayout>
        <div className="mx-auto max-w-2xl py-16 text-center">
          <Navigation className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-4 text-xl font-bold">Route is clear</h2>
          <p className="mt-1 text-sm text-muted-foreground">No active delivery assignments for today.</p>
        </div>
      </AppLayout>
    );
  }

  const nextOrder = routeData.suggestedOrder[0]?.orders[0];

  return (
    <AppLayout>
      <div className="mx-auto max-w-2xl space-y-5 pb-24">
        <header className="border-b border-border pb-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold uppercase text-primary">Today's route</p>
              <h1 className="mt-1 text-2xl font-bold">{routeData.totalOrders} stops</h1>
              <p className="text-sm text-muted-foreground">{routeData.totalAreas} delivery areas</p>
            </div>
            <Badge variant="secondary">{routeData.totalOrders} remaining</Badge>
          </div>
        </header>

        {nextOrder && (
          <section className="border-b border-border pb-5">
            <p className="text-xs font-bold uppercase text-muted-foreground">Next stop</p>
            <div className="mt-3 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <Navigation className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <p className="font-bold">{nextOrder.customer_name || nextOrder.order_code}</p>
                <p className="mt-1 break-words text-sm text-muted-foreground">{nextOrder.address}</p>
                <AddressActions address={nextOrder.address || ''} area={nextOrder.area} />
              </div>
            </div>
          </section>
        )}

        <LocationTracker />

        <div className="space-y-6">
          {routeData.suggestedOrder.map((group, groupIndex) => (
            <section key={group.area || 'unknown'}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
                    {groupIndex + 1}
                  </span>
                  <h2 className="truncate font-bold">{group.area || 'Area not set'}</h2>
                </div>
                <span className="shrink-0 text-sm text-muted-foreground">{group.orders.length} stops</span>
              </div>

              <div className="divide-y divide-border border-y border-border">
                {group.orders.map((order, orderIndex) => (
                  <div key={order.id} className="py-3">
                    <div className="flex items-start gap-3">
                      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-bold">
                        {orderIndex + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold">{order.customer_name || 'Customer'}</p>
                            <p className="text-xs text-muted-foreground">{order.order_code}</p>
                          </div>
                          <Package className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </div>
                        <p className="mt-2 break-words text-sm text-muted-foreground">{order.address}</p>
                        <AddressActions address={order.address || ''} area={order.area} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <Button className="h-11 w-full" onClick={() => navigate('/delivery?tab=inbox')}>
          Open delivery jobs
          <ChevronRight className="ml-2 h-4 w-4" />
        </Button>
      </div>
    </AppLayout>
  );
}
