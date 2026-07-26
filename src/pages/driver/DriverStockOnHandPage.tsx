import { Boxes, PackageCheck, RotateCcw, Truck } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useDriverAllocatedStock } from '@/hooks/useDriverPickups';

export default function DriverStockOnHandPage() {
  const {
    data: stock = [],
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useDriverAllocatedStock();
  const totalOnHand = stock.reduce((sum, item) => sum + item.allocated_qty, 0);

  return (
    <AppLayout>
      <div className="mx-auto w-full min-w-0 max-w-2xl space-y-4 overflow-x-hidden pb-24">
        <header>
          <p className="text-xs font-bold uppercase text-primary">Driver stock</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold">
            <Boxes className="h-6 w-6" />
            Stock on Hand
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Current stock in your custody.</p>
        </header>

        <section className="rounded-lg bg-primary px-4 py-5 text-primary-foreground">
          <p className="text-sm font-medium text-primary-foreground/80">Total on hand</p>
          <p className="mt-1 text-4xl font-bold">{isLoading ? '...' : totalOnHand}</p>
        </section>

        {isLoading ? (
          <Card>
            <CardContent className="py-10 text-center text-muted-foreground">
              Loading stock...
            </CardContent>
          </Card>
        ) : isError ? (
          <Card>
            <CardContent className="space-y-3 py-8 text-center">
              <p className="text-muted-foreground">Stock on hand could not be loaded.</p>
              <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
                Try again
              </Button>
            </CardContent>
          </Card>
        ) : stock.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <PackageCheck className="mx-auto mb-3 h-10 w-10 text-emerald-600" />
              <p className="font-semibold">No stock on hand</p>
              <p className="mt-1 text-sm text-muted-foreground">Your current balance is 0.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {stock.map((item) => (
              <Card key={item.product_id} className="rounded-lg border-border/70">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="break-words font-bold">{item.sku_name}</p>
                      {item.sku_code && (
                        <p className="mt-0.5 text-sm text-muted-foreground">{item.sku_code}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-3xl font-bold">{item.allocated_qty}</p>
                      <p className="text-xs font-semibold uppercase text-muted-foreground">On hand</p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-3 text-center">
                    <div>
                      <Truck className="mx-auto h-4 w-4 text-primary" />
                      <p className="mt-1 text-sm font-bold">{item.pickup_qty}</p>
                      <p className="text-xs text-muted-foreground">Picked up</p>
                    </div>
                    <div>
                      <PackageCheck className="mx-auto h-4 w-4 text-emerald-600" />
                      <p className="mt-1 text-sm font-bold">{item.delivered_qty}</p>
                      <p className="text-xs text-muted-foreground">Delivered</p>
                    </div>
                    <div>
                      <RotateCcw className="mx-auto h-4 w-4 text-amber-600" />
                      <p className="mt-1 text-sm font-bold">{item.returned_qty}</p>
                      <p className="text-xs text-muted-foreground">Returned</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
