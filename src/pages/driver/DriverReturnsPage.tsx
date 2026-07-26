import { useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { AlertTriangle, ArrowRight, CheckCircle, Clock, PackageCheck, Plus, RotateCcw } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { CreateReturnDialog } from '@/components/driver/CreateReturnDialog';
import { DriverActivityHistory } from '@/components/driver/DriverActivityHistory';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useDriverParentRunnerId } from '@/hooks/useDrivers';
import { useDriverReturnRequired } from '@/hooks/useDriverReturnRequired';
import { useCreateReturn, useDriverReturns, type DriverReturn } from '@/hooks/useDriverReturns';

function ReturnDetails({ driverReturn }: { driverReturn: DriverReturn }) {
  const pending = driverReturn.status === 'PENDING_RUNNER_ACK';

  return (
    <section className="rounded-lg border border-border/70 bg-background p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{driverReturn.runner?.display_name || 'Runner'}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {format(new Date(driverReturn.created_at), 'dd MMM yyyy, HH:mm')}
          </p>
        </div>
        <Badge
          variant="outline"
          className={pending
            ? 'shrink-0 border-amber-300 bg-amber-50 text-amber-800'
            : 'shrink-0 border-emerald-200 bg-emerald-50 text-emerald-700'}
        >
          {pending ? 'Pending runner' : 'Acknowledged'}
        </Badge>
      </div>

      <div className="mt-3 space-y-2 border-y border-border/60 py-3">
        {(driverReturn.items || []).map((item) => (
          <div key={item.id} className="flex items-start justify-between gap-3 text-sm">
            <span className="min-w-0 break-words font-medium">
              {item.product?.sku_code || 'N/A'} / {item.product?.sku_name || 'Unknown'}
            </span>
            <span className="shrink-0 font-bold">x {item.qty}</span>
          </div>
        ))}
      </div>

      {pending ? (
        <p className="mt-3 flex items-center gap-2 text-sm font-medium text-amber-700">
          <Clock className="h-4 w-4" /> Waiting for runner acknowledgement
        </p>
      ) : (
        <p className="mt-3 flex items-center gap-2 text-sm font-medium text-emerald-700">
          <CheckCircle className="h-4 w-4" /> Return accepted by runner
        </p>
      )}
      {driverReturn.notes && (
        <p className="mt-2 break-words text-sm text-muted-foreground">Notes: {driverReturn.notes}</p>
      )}
    </section>
  );
}

export default function DriverReturnsPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { data: returns = [], isLoading, isError, refetch, isFetching } = useDriverReturns();
  const { data: returnRequired } = useDriverReturnRequired();
  const { data: parentRunnerId, isLoading: isLoadingRunnerId } = useDriverParentRunnerId();
  const createReturn = useCreateReturn();
  const pendingReturn = returns.find((driverReturn) => driverReturn.status === 'PENDING_RUNNER_ACK');
  const history = useMemo(
    () => returns.filter((driverReturn) => driverReturn.status === 'RUNNER_ACKED'),
    [returns],
  );
  const historyGroups = useMemo(() => {
    const groups = new Map<string, DriverReturn[]>();
    history.forEach((driverReturn) => {
      const key = driverReturn.created_at.slice(0, 10);
      groups.set(key, [...(groups.get(key) || []), driverReturn]);
    });
    return Array.from(groups.entries());
  }, [history]);

  const handleQuickReturn = async () => {
    if (!parentRunnerId || !returnRequired?.items.length) return;
    await createReturn.mutateAsync({
      runner_id: parentRunnerId,
      notes: 'Return of stock not covered by runner-accepted deliveries',
      items: returnRequired.items.map((item) => ({
        product_id: item.product_id,
        qty: item.available_qty,
      })),
    });
  };

  return (
    <AppLayout>
      <div className="mx-auto w-full min-w-0 max-w-2xl space-y-4 overflow-x-hidden pb-24">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-2xl font-bold">
              <RotateCcw className="h-6 w-6" />
              My Returns
            </h1>
            <p className="text-sm text-muted-foreground">Return stock not covered by accepted deliveries.</p>
          </div>
          {!pendingReturn && (
            <Button size="sm" className="shrink-0" onClick={() => setCreateDialogOpen(true)}>
              <Plus className="mr-1 h-4 w-4" />
              New
            </Button>
          )}
        </div>

        {pendingReturn && (
          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Waiting for runner</h2>
            <ReturnDetails driverReturn={pendingReturn} />
          </div>
        )}

        {!pendingReturn && returnRequired?.isReturnRequired && returnRequired.items.length > 0 && (
          <Card className="border-destructive/40 bg-destructive/5">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="flex items-center gap-2 text-base text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Return required
              </CardTitle>
              <CardDescription>All stock below remains after runner-accepted deliveries are deducted.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 p-4 pt-2">
              <div className="space-y-2 rounded-lg border border-destructive/20 bg-background p-3">
                {returnRequired.items.map((item) => (
                  <div key={item.product_id} className="flex items-start justify-between gap-3 text-sm">
                    <span className="min-w-0 break-words font-medium">
                      {item.sku_code || 'N/A'} / {item.sku_name}
                    </span>
                    <Badge variant="destructive" className="shrink-0">x {item.available_qty}</Badge>
                  </div>
                ))}
              </div>
              <Button
                className="w-full"
                onClick={handleQuickReturn}
                disabled={createReturn.isPending || isLoadingRunnerId || !parentRunnerId}
              >
                <PackageCheck className="mr-2 h-4 w-4" />
                {createReturn.isPending ? 'Submitting...' : 'Submit return'}
                {!createReturn.isPending && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            </CardContent>
          </Card>
        )}

        {!pendingReturn && returnRequired && !returnRequired.isReturnRequired && (
          <Alert className="border-primary/40 bg-primary/5">
            <PackageCheck className="h-4 w-4" />
            <AlertTitle>No return needed</AlertTitle>
            <AlertDescription>No collected stock is waiting to be returned.</AlertDescription>
          </Alert>
        )}

        {isLoading ? (
          <Card><CardContent className="py-10 text-center text-muted-foreground">Loading returns...</CardContent></Card>
        ) : isError ? (
          <Card>
            <CardContent className="space-y-3 py-8 text-center">
              <p className="text-muted-foreground">Return records could not be loaded.</p>
              <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>Try again</Button>
            </CardContent>
          </Card>
        ) : historyGroups.length > 0 ? (
          <DriverActivityHistory title="Return history" summary={`${history.length} acknowledged return(s)`}>
            {historyGroups.map(([dateKey, group]) => (
              <div key={dateKey} className="space-y-2">
                <p className="text-sm font-bold text-muted-foreground">{format(parseISO(dateKey), 'dd MMM yyyy')}</p>
                {group.map((driverReturn) => <ReturnDetails key={driverReturn.id} driverReturn={driverReturn} />)}
              </div>
            ))}
          </DriverActivityHistory>
        ) : !pendingReturn && !returnRequired?.isReturnRequired ? (
          <Card>
            <CardContent className="py-8 text-center">
              <RotateCcw className="mx-auto mb-3 h-9 w-9 text-muted-foreground" />
              <p className="font-semibold">No return history</p>
            </CardContent>
          </Card>
        ) : null}

        {!pendingReturn && <CreateReturnDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />}
      </div>
    </AppLayout>
  );
}
