import { useState } from 'react';
import { ResponsiveLayout } from '@/components/layout/ResponsiveLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useRunnerCashLiabilities, useRunnerSettlementHistory, useSettleCash } from '@/hooks/useCashLiabilities';
import { formatBND } from '@/lib/currency';
import { format, parseISO } from 'date-fns';
import { DollarSign, ChevronDown, ChevronRight, CheckCircle, Clock, AlertTriangle, History } from 'lucide-react';

export default function RunnerCashSettlement() {
  const { data: liabilities, isLoading: liabilitiesLoading } = useRunnerCashLiabilities();
  const { data: history, isLoading: historyLoading } = useRunnerSettlementHistory();
  const settleMutation = useSettleCash();
  const [note, setNote] = useState('');
  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set(['today']));

  const toggleExpand = (key: string) => {
    const newExpanded = new Set(expandedDates);
    if (newExpanded.has(key)) {
      newExpanded.delete(key);
    } else {
      newExpanded.add(key);
    }
    setExpandedDates(newExpanded);
  };

  const handleSettle = () => {
    settleMutation.mutate({ note: note || undefined });
    setNote('');
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

  return (
    <ResponsiveLayout>
      <div className="container max-w-4xl mx-auto py-6 px-4 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Cash Settlement</h1>
            <p className="text-muted-foreground">Manage cash collected from deliveries</p>
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
            </div>
          </CardContent>
        </Card>

        {/* Settlement Action */}
        {totalOrders > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Confirm Cash Return</CardTitle>
              <CardDescription>
                Mark all outstanding cash as returned to the company
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="note">Note (optional)</Label>
                <Textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Add any notes about this settlement..."
                  rows={2}
                />
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button className="w-full gap-2" size="lg" disabled={settleMutation.isPending}>
                    <CheckCircle className="h-5 w-5" />
                    Confirm Cash Received ({formatBND(totalAmount)})
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Cash Settlement</AlertDialogTitle>
                    <AlertDialogDescription>
                      You are confirming that <strong>{formatBND(totalAmount)}</strong> from{' '}
                      <strong>{totalOrders} order{totalOrders !== 1 ? 's' : ''}</strong> has been 
                      returned to the company. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleSettle}>
                      Confirm Settlement
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        )}

        {/* No outstanding cash */}
        {totalOrders === 0 && (
          <Card className="border-[hsl(var(--status-success))]/30">
            <CardContent className="py-8 text-center">
              <CheckCircle className="h-12 w-12 text-[hsl(var(--status-success))] mx-auto mb-3" />
              <h3 className="font-semibold text-lg">All Clear!</h3>
              <p className="text-muted-foreground">You have no outstanding cash liabilities.</p>
            </CardContent>
          </Card>
        )}

        {/* Today's Cash */}
        {liabilities?.today && liabilities.today.length > 0 && (
          <Collapsible open={expandedDates.has('today')} onOpenChange={() => toggleExpand('today')}>
            <Card>
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-secondary/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {expandedDates.has('today') ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <CardTitle className="text-lg">Today</CardTitle>
                      <Badge variant="outline">{liabilities.today.length}</Badge>
                    </div>
                    <span className="font-semibold text-primary">
                      {formatBND(liabilities.today.reduce((sum, l) => sum + Number(l.cash_amount), 0))}
                    </span>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
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
                      {liabilities.today.map((liability) => (
                        <TableRow key={liability.id}>
                          <TableCell className="font-medium">{liability.order_code}</TableCell>
                          <TableCell>{liability.customer_name || '-'}</TableCell>
                          <TableCell>{format(parseISO(liability.delivered_at), 'HH:mm')}</TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatBND(Number(liability.cash_amount))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
        )}

        {/* Previous Days */}
        {liabilities?.previous.map(({ date, liabilities: dayLiabilities }) => (
          <Collapsible key={date} open={expandedDates.has(date)} onOpenChange={() => toggleExpand(date)}>
            <Card className="border-[hsl(var(--status-warning))]/30">
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-secondary/30 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {expandedDates.has(date) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <AlertTriangle className="h-4 w-4 text-[hsl(var(--status-warning))]" />
                      <CardTitle className="text-lg">{format(parseISO(date), 'dd MMM yyyy')}</CardTitle>
                      <Badge variant="secondary" className="bg-[hsl(var(--status-warning))]/20 text-[hsl(var(--status-warning))]">
                        {dayLiabilities.length} overdue
                      </Badge>
                    </div>
                    <span className="font-semibold text-[hsl(var(--status-warning))]">
                      {formatBND(dayLiabilities.reduce((sum, l) => sum + Number(l.cash_amount), 0))}
                    </span>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <CardContent className="pt-0">
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
                      {dayLiabilities.map((liability) => (
                        <TableRow key={liability.id}>
                          <TableCell className="font-medium">{liability.order_code}</TableCell>
                          <TableCell>{liability.customer_name || '-'}</TableCell>
                          <TableCell>{format(parseISO(liability.delivered_at), 'HH:mm')}</TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatBND(Number(liability.cash_amount))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
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
