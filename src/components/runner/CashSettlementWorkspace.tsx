import { useEffect, useMemo, useState } from 'react';
import { format, isToday, parseISO } from 'date-fns';
import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock3,
  HandCoins,
  Loader2,
  ReceiptText,
  Users,
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import {
  useAcknowledgeCashHandover,
  useCashSettlementAssistants,
  useCreateCashHandover,
  useRunnerCashLiabilities,
  useRunnerSettlementHistory,
  type CashLiability,
  type CashSettlementBatch,
} from '@/hooks/useCashLiabilities';

const currency = new Intl.NumberFormat('en-BN', {
  style: 'currency',
  currency: 'BND',
});

function formatBND(value: number) {
  return currency.format(value || 0).replace('BND', 'BND ');
}

function orderQty(liability: CashLiability) {
  return liability.order?.order_items?.reduce((sum, item) => sum + Number(item.qty || 0), 0) || 0;
}

function dateLabel(date: string | null) {
  if (!date) return '-';
  const parsed = parseISO(date);
  return isToday(parsed) ? `Today, ${format(parsed, 'dd MMM yyyy')}` : format(parsed, 'dd MMM yyyy');
}

type DailyCashSummary = {
  date: string;
  amount: number;
  orderCount: number;
  driverCount: number;
};

function SummaryTile({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: typeof Banknote;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-card p-4">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-xs font-bold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-2xl font-black text-foreground">{value}</p>
      <p className="mt-1 text-xs font-medium text-muted-foreground">{detail}</p>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border/70 bg-muted/20 px-4 py-9 text-center">
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: CashSettlementBatch['status'] }) {
  return status === 'SETTLED' ? (
    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Payment completed</Badge>
  ) : (
    <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Awaiting acknowledgement</Badge>
  );
}

export function CashSettlementWorkspace({ runnerIdOverride }: { runnerIdOverride?: string }) {
  const { user } = useAuth();
  const runnerScopeId = runnerIdOverride || user?.id;
  const isAssistantView = Boolean(runnerIdOverride);
  const { data: cash, isLoading: loadingCash } = useRunnerCashLiabilities(runnerIdOverride);
  const { data: batches = [], isLoading: loadingBatches } = useRunnerSettlementHistory(runnerIdOverride);
  const { data: assistants = [], isLoading: loadingAssistants } = useCashSettlementAssistants(
    isAssistantView ? undefined : runnerScopeId,
  );
  const createHandover = useCreateCashHandover();
  const acknowledgeHandover = useAcknowledgeCashHandover();
  const [selectedAssistantId, setSelectedAssistantId] = useState('');
  const [confirmedDates, setConfirmedDates] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!selectedAssistantId && assistants.length > 0) {
      setSelectedAssistantId(assistants[0].assistant_id);
    }
  }, [assistants, selectedAssistantId]);

  const openLiabilities = useMemo(() => cash?.liabilities || [], [cash?.liabilities]);
  const dailySummaries = useMemo(() => {
    const groups = new Map<string, { amount: number; orderCount: number; drivers: Set<string> }>();
    openLiabilities.forEach((liability) => {
      const date = format(new Date(liability.delivered_at), 'yyyy-MM-dd');
      const group = groups.get(date) || { amount: 0, orderCount: 0, drivers: new Set<string>() };
      group.amount += Number(liability.cash_amount || 0);
      group.orderCount += 1;
      group.drivers.add(liability.driver_id || 'unknown');
      groups.set(date, group);
    });
    return Array.from(groups.entries())
      .map(([date, group]) => ({
        date,
        amount: group.amount,
        orderCount: group.orderCount,
        driverCount: group.drivers.size,
      }))
      .sort((a, b) => b.date.localeCompare(a.date)) as DailyCashSummary[];
  }, [openLiabilities]);

  const pendingBatches = batches.filter((batch) => batch.status === 'PENDING_ACK');
  const completedBatches = batches.filter((batch) => batch.status === 'SETTLED');
  const pendingAmount = pendingBatches.reduce((sum, batch) => sum + Number(batch.total_amount || 0), 0);

  const submitDailyHandover = async (summary: DailyCashSummary) => {
    if (!selectedAssistantId) return;
    await createHandover.mutateAsync({
      assistantId: selectedAssistantId,
      settlementDate: summary.date,
    });
    setConfirmedDates((current) => {
      const next = new Set(current);
      next.delete(summary.date);
      return next;
    });
  };

  if (isAssistantView) {
    return (
      <div className="space-y-4">
        <section>
          <div className="mb-3">
            <p className="text-xs font-black uppercase text-primary">Driver cash desk</p>
            <h2 className="mt-1 text-xl font-black text-foreground">Cash to collect</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Accepted cash deliveries from Driver Operations, before handover to the runner.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <SummaryTile
              label="To collect"
              value={formatBND(cash?.totalOpenAmount || 0)}
              detail={`${cash?.totalOpen || 0} order(s)`}
              icon={Banknote}
            />
            <SummaryTile
              label="Drivers"
              value={String(cash?.driverCount || 0)}
              detail="owing cash"
              icon={Users}
            />
            <SummaryTile
              label="Needs acknowledgement"
              value={String(pendingBatches.length)}
              detail={formatBND(pendingAmount)}
              icon={Clock3}
            />
            <SummaryTile
              label="Completed"
              value={String(completedBatches.length)}
              detail="confirmed handovers"
              icon={CheckCircle2}
            />
          </div>
        </section>

        {pendingBatches.length > 0 && (
          <section className="rounded-lg border border-amber-300 bg-amber-50/70 p-4">
            <div className="mb-3 flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                <HandCoins className="h-4 w-4" />
              </div>
              <div>
                <h3 className="font-black text-foreground">Runner receipt awaiting your acknowledgement</h3>
                <p className="text-sm text-muted-foreground">
                  Confirm only after the amount and daily order total match your handover.
                </p>
              </div>
            </div>
            <div className="space-y-2">
              {pendingBatches.map((batch) => {
                const batchLiabilities = (cash?.pendingHandover || []).filter(
                  (liability) => liability.settlement_batch_id === batch.id,
                );
                return (
                  <div key={batch.id} className="space-y-3 rounded-lg border border-amber-200 bg-card p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-muted-foreground">{dateLabel(batch.settlement_date)}</p>
                        <p className="mt-1 text-2xl font-black text-foreground">{formatBND(Number(batch.total_amount))}</p>
                        <p className="text-sm text-muted-foreground">{batch.order_count} accepted cash order(s)</p>
                      </div>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button className="w-full sm:w-auto" disabled={acknowledgeHandover.isPending}>
                            {acknowledgeHandover.isPending ? (
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="mr-2 h-4 w-4" />
                            )}
                            Acknowledge
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Acknowledge this cash handover?</AlertDialogTitle>
                            <AlertDialogDescription>
                              You confirm that the runner received {formatBND(Number(batch.total_amount))} for{' '}
                              {batch.order_count} order(s). This completes the payment record.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => acknowledgeHandover.mutate(batch.id)}>
                              Confirm acknowledgement
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                    {batchLiabilities.length > 0 && (
                      <div className="overflow-hidden rounded-lg border border-border/60">
                        <div className="divide-y divide-border/60 md:hidden">
                          {batchLiabilities.map((liability) => (
                            <div key={liability.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                              <div className="min-w-0">
                                <p className="truncate font-bold">{liability.driver?.display_name || 'Unknown Driver'}</p>
                                <p className="truncate text-muted-foreground">{liability.order_code} · Qty {orderQty(liability)}</p>
                              </div>
                              <p className="shrink-0 font-black">{formatBND(Number(liability.cash_amount))}</p>
                            </div>
                          ))}
                        </div>
                        <div className="hidden md:block">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Driver</TableHead>
                                <TableHead>Order</TableHead>
                                <TableHead className="text-right">Qty</TableHead>
                                <TableHead className="text-right">Cash</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {batchLiabilities.map((liability) => (
                                <TableRow key={liability.id}>
                                  <TableCell className="font-bold">{liability.driver?.display_name || 'Unknown Driver'}</TableCell>
                                  <TableCell>{liability.order_code}</TableCell>
                                  <TableCell className="text-right">{orderQty(liability)}</TableCell>
                                  <TableCell className="text-right font-black">{formatBND(Number(liability.cash_amount))}</TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="rounded-lg border border-border/60 bg-card">
          <div className="border-b border-border/60 p-4">
            <h3 className="flex items-center gap-2 font-black text-foreground">
              <ReceiptText className="h-4 w-4 text-primary" />
              Accepted cash orders
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">Amount, driver, date, order and item quantity.</p>
          </div>
          {loadingCash ? (
            <div className="p-4">
              <EmptyState title="Loading cash orders" description="Checking accepted Driver Operations records." />
            </div>
          ) : openLiabilities.length === 0 ? (
            <div className="p-4">
              <EmptyState title="No cash to collect" description="New accepted cash deliveries will appear here." />
            </div>
          ) : (
            <>
              <div className="divide-y divide-border/60 md:hidden">
                {openLiabilities.map((liability) => (
                  <div key={liability.id} className="space-y-3 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-black text-foreground">{liability.driver?.display_name || 'Unknown Driver'}</p>
                        <p className="text-sm text-muted-foreground">{liability.order_code}</p>
                      </div>
                      <p className="shrink-0 text-lg font-black text-primary">{formatBND(Number(liability.cash_amount))}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <p className="text-xs font-bold uppercase text-muted-foreground">Accepted</p>
                        <p className="mt-1 font-semibold">{format(new Date(liability.delivered_at), 'dd MMM yyyy')}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold uppercase text-muted-foreground">Order qty</p>
                        <p className="mt-1 font-semibold">{orderQty(liability)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="hidden overflow-x-auto md:block">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Order</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Cash amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {openLiabilities.map((liability) => (
                      <TableRow key={liability.id}>
                        <TableCell className="whitespace-nowrap">{format(new Date(liability.delivered_at), 'dd MMM yyyy')}</TableCell>
                        <TableCell className="font-bold">{liability.driver?.display_name || 'Unknown Driver'}</TableCell>
                        <TableCell>{liability.order_code}</TableCell>
                        <TableCell className="text-right">{orderQty(liability)}</TableCell>
                        <TableCell className="text-right font-black">{formatBND(Number(liability.cash_amount))}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </section>

        <SettlementHistory batches={completedBatches} isLoading={loadingBatches} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <section>
        <div className="mb-3">
          <p className="text-xs font-black uppercase text-primary">Daily cash handover</p>
          <h2 className="mt-1 text-xl font-black text-foreground">Cash received from assistant</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirm a daily lump sum after the assistant gives the collected Driver cash back to you.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <SummaryTile
            label="Open daily cash"
            value={formatBND(cash?.totalOpenAmount || 0)}
            detail={`${cash?.totalOpen || 0} order(s)`}
            icon={Banknote}
          />
          <SummaryTile
            label="Awaiting assistant"
            value={formatBND(pendingAmount)}
            detail={`${pendingBatches.length} handover(s)`}
            icon={Clock3}
          />
          <SummaryTile
            label="Completed"
            value={String(completedBatches.length)}
            detail="acknowledged payments"
            icon={CheckCircle2}
          />
          <SummaryTile
            label="Cash assistants"
            value={String(assistants.length)}
            detail="available for handover"
            icon={Users}
          />
        </div>
      </section>

      <section className="rounded-lg border border-border/60 bg-card p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 font-black text-foreground">
              <CalendarDays className="h-4 w-4 text-primary" />
              Daily totals
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">Tick only after you receive the full amount shown.</p>
          </div>
          <div className="w-full sm:w-64">
            <p className="mb-1.5 text-xs font-bold uppercase text-muted-foreground">Handed over by</p>
            <Select value={selectedAssistantId} onValueChange={setSelectedAssistantId} disabled={loadingAssistants}>
              <SelectTrigger>
                <SelectValue placeholder="Select assistant" />
              </SelectTrigger>
              <SelectContent>
                {assistants.map((binding) => (
                  <SelectItem key={binding.assistant_id} value={binding.assistant_id}>
                    {binding.assistant?.display_name || binding.assistant?.email || 'Assistant'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {loadingCash ? (
          <EmptyState title="Loading daily cash" description="Preparing accepted cash totals." />
        ) : dailySummaries.length === 0 ? (
          <EmptyState title="No open daily cash" description="All available cash is pending acknowledgement or completed." />
        ) : assistants.length === 0 ? (
          <EmptyState title="No Cash Settlement assistant" description="Enable Cash Settlement access for an assigned assistant first." />
        ) : (
          <div className="space-y-3">
            {dailySummaries.map((summary) => {
              const checked = confirmedDates.has(summary.date);
              return (
                <Card key={summary.date} className="rounded-lg border-border/60 shadow-none">
                  <CardContent className="p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-muted-foreground">{dateLabel(summary.date)}</p>
                        <p className="mt-1 text-3xl font-black text-foreground">{formatBND(summary.amount)}</p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {summary.orderCount} order(s) from {summary.driverCount} driver(s)
                        </p>
                      </div>
                      <div className="w-full max-w-xl rounded-lg border border-border/60 bg-muted/20 p-3 lg:w-auto lg:min-w-[430px]">
                        <label className="flex cursor-pointer items-start gap-3">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => {
                              setConfirmedDates((current) => {
                                const next = new Set(current);
                                if (value) next.add(summary.date);
                                else next.delete(summary.date);
                                return next;
                              });
                            }}
                            className="mt-0.5"
                          />
                          <span className="text-sm font-semibold leading-5 text-foreground">
                            I received the full {formatBND(summary.amount)} daily cash total from the selected assistant.
                          </span>
                        </label>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button className="mt-3 w-full" disabled={!checked || !selectedAssistantId || createHandover.isPending}>
                              {createHandover.isPending ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              ) : (
                                <HandCoins className="mr-2 h-4 w-4" />
                              )}
                              Send for acknowledgement
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Confirm daily cash received?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This records that you received {formatBND(summary.amount)} for {summary.orderCount} order(s).
                                The selected assistant will be notified to acknowledge before payment is completed.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => submitDailyHandover(summary)}>
                                Confirm and notify
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border/60 bg-card p-4">
        <div className="mb-3">
          <h3 className="flex items-center gap-2 font-black text-foreground">
            <Clock3 className="h-4 w-4 text-amber-600" />
            Awaiting assistant acknowledgement
          </h3>
        </div>
        {loadingBatches ? (
          <EmptyState title="Loading handovers" description="Checking pending confirmations." />
        ) : pendingBatches.length === 0 ? (
          <EmptyState title="No pending acknowledgement" description="New confirmed receipts will appear here until the assistant acknowledges." />
        ) : (
          <div className="space-y-2">
            {pendingBatches.map((batch) => (
              <div key={batch.id} className="flex flex-col gap-2 rounded-lg border border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-black text-foreground">{dateLabel(batch.settlement_date)}</p>
                  <p className="text-sm text-muted-foreground">
                    {batch.order_count} order(s) · {batch.assistant?.display_name || 'Assistant'}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-xl font-black text-foreground">{formatBND(Number(batch.total_amount))}</p>
                  <StatusBadge status={batch.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <SettlementHistory batches={completedBatches} isLoading={loadingBatches} />
    </div>
  );
}

function SettlementHistory({ batches, isLoading }: { batches: CashSettlementBatch[]; isLoading: boolean }) {
  return (
    <section className="rounded-lg border border-border/60 bg-card p-4">
      <div className="mb-3">
        <h3 className="flex items-center gap-2 font-black text-foreground">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          Payment completed
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">Both Runner receipt and assistant acknowledgement are recorded.</p>
      </div>
      {isLoading ? (
        <EmptyState title="Loading payment history" description="Checking completed cash handovers." />
      ) : batches.length === 0 ? (
        <EmptyState title="No completed payments" description="Fully acknowledged handovers will appear here." />
      ) : (
        <div className="space-y-2">
          {batches.slice(0, 12).map((batch) => (
            <div key={batch.id} className="flex flex-col gap-2 rounded-lg border border-border/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-black text-foreground">{dateLabel(batch.settlement_date)}</p>
                <p className="text-sm text-muted-foreground">
                  {batch.order_count} order(s)
                  {batch.assistant?.display_name ? ` · ${batch.assistant.display_name}` : ''}
                </p>
              </div>
              <div className="sm:text-right">
                <p className="text-xl font-black text-foreground">{formatBND(Number(batch.total_amount))}</p>
                <StatusBadge status={batch.status} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
