import { useState } from 'react';
import { ResponsiveLayout } from '@/components/layout/ResponsiveLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useRunnerCashLiabilities, useRunnerSettlementHistory, useSettleDriverCash, DriverGroupedLiabilities } from '@/hooks/useCashLiabilities';
import { formatBND } from '@/lib/currency';
import { format, parseISO } from 'date-fns';
import { DollarSign, ChevronDown, ChevronRight, CheckCircle, Clock, Car, History, Loader2, Users } from 'lucide-react';

export default function RunnerCashSettlement() {
  const { data: liabilities, isLoading: liabilitiesLoading } = useRunnerCashLiabilities();
  const { data: history, isLoading: historyLoading } = useRunnerSettlementHistory();
  const settleDriverMutation = useSettleDriverCash();
  const [expandedDrivers, setExpandedDrivers] = useState<Set<string>>(new Set());
  const [settlingDriverId, setSettlingDriverId] = useState<string | null>(null);

  const toggleExpand = (driverId: string) => {
    const newExpanded = new Set(expandedDrivers);
    if (newExpanded.has(driverId)) {
      newExpanded.delete(driverId);
    } else {
      newExpanded.add(driverId);
    }
    setExpandedDrivers(newExpanded);
  };

  const handleSettleDriver = async (driverId: string) => {
    setSettlingDriverId(driverId);
    try {
      await settleDriverMutation.mutateAsync({ driverId });
    } finally {
      setSettlingDriverId(null);
    }
  };

  if (liabilitiesLoading) {
    return (
      <ResponsiveLayout>
        <div className="container max-w-4xl mx-auto py-6 px-4 space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-60 w-full" />
        </div>
      </ResponsiveLayout>
    );
  }

  const totalAmount = liabilities?.totalOpenAmount || 0;
  const totalOrders = liabilities?.totalOpen || 0;
  const driverCount = liabilities?.driverCount || 0;

  return (
    <ResponsiveLayout>
      <div className="container max-w-4xl mx-auto py-6 px-4 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Cash to Collect</h1>
            <p className="text-muted-foreground">Cash collected by drivers that needs to be handed to you</p>
          </div>
        </div>

        {/* Summary Card */}
        <Card className="border-primary/30 bg-gradient-to-br from-primary/10 to-transparent">
          <CardHeader className="pb-2">
            <CardDescription>Total Outstanding Cash</CardDescription>
            <CardTitle className="text-4xl font-bold text-primary flex items-center gap-2">
              <DollarSign className="h-8 w-8" />
              {formatBND(totalAmount)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                {totalOrders} order{totalOrders !== 1 ? 's' : ''} pending
              </span>
              <span className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                {driverCount} driver{driverCount !== 1 ? 's' : ''}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* No outstanding cash */}
        {totalOrders === 0 && (
          <Card className="border-[hsl(var(--status-success))]/30">
            <CardContent className="py-8 text-center">
              <CheckCircle className="h-12 w-12 text-[hsl(var(--status-success))] mx-auto mb-3" />
              <h3 className="font-semibold text-lg">All Clear!</h3>
              <p className="text-muted-foreground">No drivers owe you cash.</p>
            </CardContent>
          </Card>
        )}

        {/* Cash by Driver */}
        {liabilities?.byDriver.map((driverGroup) => (
          <DriverCashCard
            key={driverGroup.driverId}
            driverGroup={driverGroup}
            isExpanded={expandedDrivers.has(driverGroup.driverId)}
            onToggle={() => toggleExpand(driverGroup.driverId)}
            onSettle={() => handleSettleDriver(driverGroup.driverId)}
            isSettling={settlingDriverId === driverGroup.driverId}
          />
        ))}

        {/* Settlement History */}
        {history && history.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <History className="h-5 w-5 text-muted-foreground" />
                <CardTitle className="text-lg">Settlement History</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.slice(0, 10).map((batch) => (
                    <TableRow key={batch.id}>
                      <TableCell>{format(parseISO(batch.settled_at), 'dd MMM yyyy HH:mm')}</TableCell>
                      <TableCell>{batch.order_count} orders</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatBND(Number(batch.total_amount))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </ResponsiveLayout>
  );
}

interface DriverCashCardProps {
  driverGroup: DriverGroupedLiabilities;
  isExpanded: boolean;
  onToggle: () => void;
  onSettle: () => void;
  isSettling: boolean;
}

function DriverCashCard({ driverGroup, isExpanded, onToggle, onSettle, isSettling }: DriverCashCardProps) {
  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <Card className="overflow-hidden">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-secondary/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <div className="p-2 rounded-full bg-primary/10">
                  <Car className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">{driverGroup.driverName}</CardTitle>
                  <CardDescription>
                    {driverGroup.liabilities.length} order{driverGroup.liabilities.length !== 1 ? 's' : ''}
                  </CardDescription>
                </div>
              </div>
              <div className="text-right">
                <span className="font-bold text-xl text-primary">
                  {formatBND(driverGroup.totalAmount)}
                </span>
              </div>
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {/* Order breakdown */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {driverGroup.liabilities.map((liability) => (
                  <TableRow key={liability.id}>
                    <TableCell className="font-medium">{liability.order_code}</TableCell>
                    <TableCell>{liability.customer_name || '-'}</TableCell>
                    <TableCell>{format(parseISO(liability.delivered_at), 'dd MMM HH:mm')}</TableCell>
                    <TableCell className="text-right font-semibold">
                      {formatBND(Number(liability.cash_amount))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Settle button */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button className="w-full gap-2" size="lg" disabled={isSettling}>
                  {isSettling ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" />
                      Settling...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-5 w-5" />
                      Confirm Cash Received ({formatBND(driverGroup.totalAmount)})
                    </>
                  )}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Confirm Cash Received</AlertDialogTitle>
                  <AlertDialogDescription>
                    You are confirming that <strong>{driverGroup.driverName}</strong> has handed you{' '}
                    <strong>{formatBND(driverGroup.totalAmount)}</strong> from{' '}
                    <strong>{driverGroup.liabilities.length} order{driverGroup.liabilities.length !== 1 ? 's' : ''}</strong>.
                    <br /><br />
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onSettle}>
                    Confirm Settlement
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
