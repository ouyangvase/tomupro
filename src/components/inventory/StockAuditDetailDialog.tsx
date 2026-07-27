import { useMemo } from 'react';
import { format } from 'date-fns';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  Package,
  Settings2,
  Truck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  useAdjustmentSources,
  useDeliveredSources,
  useInboundSources,
  useTransferSources,
} from '@/hooks/useAuditSourceRecords';
import type { FullStockIntegrityRow } from '@/hooks/useFullStockIntegrity';
import { cn } from '@/lib/utils';

interface SourceRecord {
  id: string;
  title: string;
  date: string;
  quantity: string;
  quantityClassName: string;
  details: Array<{ label: string; value: string | null | undefined }>;
}

function BalanceLine({
  label,
  value,
  operation = '+',
  tone = 'default',
}: {
  label: string;
  value: number;
  operation?: '+' | '-';
  tone?: 'default' | 'positive' | 'negative';
}) {
  const toneClass = {
    default: 'text-foreground',
    positive: 'text-[hsl(var(--status-success))]',
    negative: 'text-destructive',
  }[tone];

  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('shrink-0 font-mono font-semibold', toneClass)}>
        {operation}{value}
      </span>
    </div>
  );
}

function SourceGroup({
  title,
  icon,
  records,
  loading,
}: {
  title: string;
  icon: React.ReactNode;
  records: SourceRecord[];
  loading: boolean;
}) {
  return (
    <details className="group overflow-hidden rounded-lg border bg-card" open>
      <summary className="flex cursor-pointer list-none items-center gap-2 p-3 font-semibold">
        {icon}
        <span className="min-w-0 flex-1">{title}</span>
        <Badge variant="outline">{records.length}</Badge>
      </summary>
      <div className="border-t">
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : records.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">No records</p>
        ) : (
          <div className="divide-y">
            {records.map((record) => (
              <div key={record.id} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold">{record.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{record.date}</p>
                  <dl className="mt-2 grid gap-1 text-xs">
                    {record.details.map((detail) => (
                      <div
                        key={detail.label}
                        className="grid min-w-0 grid-cols-[92px_minmax(0,1fr)] gap-2"
                      >
                        <dt className="text-muted-foreground">{detail.label}</dt>
                        <dd className="min-w-0 break-words">{detail.value || '-'}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <strong className={cn('font-mono text-base sm:text-right', record.quantityClassName)}>
                  {record.quantity}
                </strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </details>
  );
}

export function StockAuditDetailDialog({
  row,
  onClose,
}: {
  row: FullStockIntegrityRow | null;
  onClose: () => void;
}) {
  const { data: inboundRecords = [], isLoading: loadingInbound } = useInboundSources(
    row?.warehouse_id,
    row?.product_id
  );
  const { data: deliveredRecords = [], isLoading: loadingDelivered } = useDeliveredSources(
    row?.product_id,
    row?.owner_user_id
  );
  const { data: transferRecords = [], isLoading: loadingTransfers } = useTransferSources(
    row?.warehouse_id,
    row?.product_id
  );
  const { data: adjustmentRecords = [], isLoading: loadingAdjustments } = useAdjustmentSources(
    row?.warehouse_id,
    row?.product_id
  );

  const totals = useMemo(() => {
    const inbound = inboundRecords.reduce((sum, record) => sum + record.qty, 0);
    const delivered = deliveredRecords.reduce((sum, record) => sum + record.qty, 0);
    const transferIn = transferRecords
      .filter((record) => record.direction === 'IN')
      .reduce((sum, record) => sum + record.qty, 0);
    const transferOut = transferRecords
      .filter((record) => record.direction === 'OUT')
      .reduce((sum, record) => sum + Math.abs(record.qty), 0);
    const positiveAdjustment = adjustmentRecords
      .filter((record) => record.qty > 0)
      .reduce((sum, record) => sum + record.qty, 0);
    const negativeAdjustment = adjustmentRecords
      .filter((record) => record.qty < 0)
      .reduce((sum, record) => sum + Math.abs(record.qty), 0);
    const calculatedBalance =
      inbound + transferIn + positiveAdjustment - delivered - transferOut - negativeAdjustment;

    return {
      inbound,
      delivered,
      transferIn,
      transferOut,
      positiveAdjustment,
      negativeAdjustment,
      calculatedBalance,
    };
  }, [adjustmentRecords, deliveredRecords, inboundRecords, transferRecords]);

  if (!row) return null;

  const anyLoading =
    loadingInbound || loadingDelivered || loadingTransfers || loadingAdjustments;
  const storedBalance = Number(row.stored_balance) || 0;
  const variance = totals.calculatedBalance - storedBalance;

  const inboundSourceRecords: SourceRecord[] = inboundRecords.map((record) => ({
    id: record.id,
    title: record.tracking_no || 'Inbound receipt',
    date: format(new Date(record.inbound_date), 'MMM dd, yyyy HH:mm'),
    quantity: `+${record.qty}`,
    quantityClassName: 'text-[hsl(var(--status-success))]',
    details: [{ label: 'Created by', value: record.created_by_name }],
  }));
  const deliveredSourceRecords: SourceRecord[] = deliveredRecords.map((record) => ({
    id: record.id,
    title: record.order_code || 'Delivered order',
    date: record.delivered_at
      ? format(new Date(record.delivered_at), 'MMM dd, yyyy HH:mm')
      : '-',
    quantity: `-${record.qty}`,
    quantityClassName: 'text-destructive',
    details: [
      { label: 'Customer', value: record.customer_name },
      { label: 'Delivered by', value: record.delivered_by_name },
    ],
  }));
  const transferSourceRecords: SourceRecord[] = transferRecords.map((record) => ({
    id: record.id,
    title: record.direction === 'IN' ? 'Transfer in' : 'Transfer out',
    date: format(new Date(record.transfer_date), 'MMM dd, yyyy HH:mm'),
    quantity: `${record.direction === 'IN' ? '+' : '-'}${Math.abs(record.qty)}`,
    quantityClassName:
      record.direction === 'IN' ? 'text-primary' : 'text-[hsl(var(--status-warning))]',
    details: [
      { label: 'From / to', value: record.counterpart_name },
      { label: 'Created by', value: record.created_by_name },
    ],
  }));
  const adjustmentSourceRecords: SourceRecord[] = adjustmentRecords.map((record) => ({
    id: record.id,
    title: record.movement_type,
    date: format(new Date(record.adjustment_date), 'MMM dd, yyyy HH:mm'),
    quantity: `${record.qty > 0 ? '+' : ''}${record.qty}`,
    quantityClassName:
      record.qty > 0 ? 'text-[hsl(var(--status-success))]' : 'text-destructive',
    details: [
      { label: 'Remark', value: record.remark || 'No remark recorded' },
      { label: 'Created by', value: record.created_by_name },
    ],
  }));

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[92dvh] w-[calc(100vw-1rem)] max-w-4xl overflow-y-auto p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-2 pr-8 text-left">
            <Package className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <span className="min-w-0 break-words">
              {row.sku_code || 'No SKU'} / {row.sku_name}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
            <p>Owner: <strong className="text-foreground">{row.owner_name}</strong></p>
            <p>Warehouse: <strong className="text-foreground">{row.warehouse_name}</strong></p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Inbound</p><p className="text-xl font-bold text-[hsl(var(--status-success))]">+{anyLoading ? '...' : totals.inbound}</p></CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Transfer In</p><p className="text-xl font-bold text-primary">+{anyLoading ? '...' : totals.transferIn}</p></CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Total Deduct</p><p className="text-xl font-bold text-destructive">-{anyLoading ? '...' : totals.delivered + totals.transferOut + totals.negativeAdjustment}</p></CardContent></Card>
            <Card><CardContent className="p-3"><p className="text-xs text-muted-foreground">Stock Balance</p><p className={cn('text-xl font-bold', storedBalance < 0 ? 'text-destructive' : 'text-primary')}>{storedBalance}</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader className="p-3 pb-2">
              <CardTitle className="text-sm">Balance calculation from source records</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 p-3 pt-0">
              <BalanceLine label="Inbound" value={totals.inbound} tone="positive" />
              <BalanceLine label="Transfer In" value={totals.transferIn} tone="positive" />
              <BalanceLine label="Positive Adjustment" value={totals.positiveAdjustment} tone="positive" />
              <BalanceLine label="Delivered" value={totals.delivered} operation="-" tone="negative" />
              <BalanceLine label="Transfer Out" value={totals.transferOut} operation="-" tone="negative" />
              <BalanceLine label="Negative Adjustment" value={totals.negativeAdjustment} operation="-" tone="negative" />
              <div className="mt-2 flex items-center justify-between border-t pt-2 font-semibold">
                <span>Calculated balance</span>
                <span>{anyLoading ? '...' : totals.calculatedBalance}</span>
              </div>
            </CardContent>
          </Card>

          {!anyLoading && (
            <div className={cn(
              'flex items-start gap-2 rounded-lg border p-3 text-sm',
              variance === 0
                ? 'border-[hsl(var(--status-success)/0.3)] bg-[hsl(var(--status-success)/0.06)]'
                : 'border-destructive/30 bg-destructive/5'
            )}>
              <CheckCircle2 className={cn('mt-0.5 h-4 w-4 shrink-0', variance === 0 ? 'text-[hsl(var(--status-success))]' : 'text-destructive')} />
              <div>
                <p className="font-semibold">{variance === 0 ? 'Reconciliation OK' : 'Reconciliation difference'}</p>
                <p className="text-muted-foreground">
                  Source records: {totals.calculatedBalance}; Stock Balance: {storedBalance}; Difference: {variance > 0 ? '+' : ''}{variance}
                </p>
              </div>
            </div>
          )}

          <SourceGroup title="Inbound History" icon={<ArrowDownToLine className="h-4 w-4 text-[hsl(var(--status-success))]" />} records={inboundSourceRecords} loading={loadingInbound} />
          <SourceGroup title="Delivered Orders" icon={<Truck className="h-4 w-4 text-destructive" />} records={deliveredSourceRecords} loading={loadingDelivered} />
          <SourceGroup title="Transfers" icon={<ArrowUpFromLine className="h-4 w-4 text-primary" />} records={transferSourceRecords} loading={loadingTransfers} />
          <SourceGroup title="Adjustments" icon={<Settings2 className="h-4 w-4 text-[hsl(var(--status-warning))]" />} records={adjustmentSourceRecords} loading={loadingAdjustments} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
