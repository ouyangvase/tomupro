import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, ShieldCheck, Wrench } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  StockIntegrityRepairResult,
  useStockIntegrityRepair,
} from '@/hooks/useFullStockIntegrity';

function Metric({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'warning' | 'danger' | 'success';
}) {
  const toneClass = {
    default: 'text-foreground',
    warning: 'text-[hsl(var(--status-warning))]',
    danger: 'text-destructive',
    success: 'text-[hsl(var(--status-success))]',
  }[tone];

  return (
    <div className="min-w-0 rounded-lg border bg-background p-3">
      <p className={`text-xl font-bold ${toneClass}`}>{value.toLocaleString()}</p>
      <p className="mt-1 text-xs leading-snug text-muted-foreground">{label}</p>
    </div>
  );
}

function PreviewSummary({ result }: { result: StockIntegrityRepairResult }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Metric
          label="Delivered item rows not recorded in stock ledger"
          value={result.missing_deductions}
          tone={result.missing_deductions > 0 ? 'warning' : 'success'}
        />
        <Metric label="Affected delivered orders" value={result.affected_orders} />
        <Metric label="Total units not deducted" value={result.missing_units} />
        <Metric
          label="Rows safe to repair"
          value={result.repairable_deductions}
          tone={result.repairable_deductions > 0 ? 'danger' : 'success'}
        />
      </div>

      <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg bg-muted/40 p-3">
          <span className="text-muted-foreground">Legacy deductions recognized</span>
          <strong className="float-right">{result.legacy_deductions_recognized.toLocaleString()}</strong>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <span className="text-muted-foreground">Missing warehouse mapping</span>
          <strong className="float-right">{result.unresolved_warehouses.toLocaleString()}</strong>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <span className="text-muted-foreground">Failed queue records</span>
          <strong className="float-right">{result.queue_items.toLocaleString()}</strong>
        </div>
        <div className="rounded-lg bg-muted/40 p-3">
          <span className="text-muted-foreground">SKU scan</span>
          <strong className="float-right">
            {result.ok_count.toLocaleString()} / {result.total_skus_scanned.toLocaleString()} OK
          </strong>
        </div>
      </div>

      {result.unresolved_warehouses > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Some records cannot be repaired</AlertTitle>
          <AlertDescription>
            {result.unresolved_warehouses.toLocaleString()} order lines have no warehouse mapping.
            They will be skipped so stock is never deducted from an arbitrary warehouse.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

export function StockIntegrityPanel() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const integrityRepair = useStockIntegrityRepair();
  const preview = integrityRepair.data?.dry_run ? integrityRepair.data : null;
  const applied = integrityRepair.data && !integrityRepair.data.dry_run ? integrityRepair.data : null;

  return (
    <>
      <Card className="border-primary/25">
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-3">
              <span className="rounded-lg bg-primary/10 p-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
              </span>
              <div>
                <CardTitle className="text-base">Stock Integrity Check</CardTitle>
                <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                  Checks the stock ledger and finds delivered order lines that have no accepted
                  deduction movement. Previewing never changes stock.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="shrink-0"
              onClick={() => integrityRepair.mutate(true)}
              disabled={integrityRepair.isPending}
            >
              <Eye className="mr-2 h-4 w-4" />
              {integrityRepair.isPending ? 'Checking...' : 'Preview Check'}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {integrityRepair.isPending && !preview && (
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <Skeleton key={index} className="h-24 rounded-lg" />
              ))}
            </div>
          )}

          {preview && (
            <>
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>What "missing" means</AlertTitle>
                <AlertDescription>
                  This is the number of delivered <strong>order item rows</strong> that have no
                  recognized deduction in the stock ledger. It is not a SKU count and not a unit
                  count. Affected orders and total units are shown as separate figures.
                </AlertDescription>
              </Alert>
              <PreviewSummary result={preview} />
              <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Existing SALE_DEDUCT, DELIVER_DEDUCT, DELIVERY_ACCEPTED, and legacy order-level
                  references are recognized and will not be duplicated.
                </p>
                <Button
                  variant="destructive"
                  className="shrink-0"
                  onClick={() => setConfirmOpen(true)}
                  disabled={
                    integrityRepair.isPending ||
                    preview.repairable_deductions === 0 ||
                    preview.unresolved_warehouses > 0
                  }
                >
                  <Wrench className="mr-2 h-4 w-4" />
                  Repair Verified Records
                </Button>
              </div>
            </>
          )}

          {applied && (
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Repair completed</AlertTitle>
              <AlertDescription>
                {applied.fixed_deductions.toLocaleString()} deduction records were added and{' '}
                {applied.queue_cleared.toLocaleString()} failed queue records were cleared.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply verified stock deductions?</AlertDialogTitle>
            <AlertDialogDescription className="space-y-3">
              <span className="block">
                This will add {preview?.repairable_deductions.toLocaleString() ?? 0} missing
                deduction movements across {preview?.affected_orders.toLocaleString() ?? 0} orders.
              </span>
              <span className="block font-medium text-foreground">
                Total quantity to deduct: {preview?.missing_units.toLocaleString() ?? 0}
              </span>
              <span className="block">
                The operation is idempotent and skips recognized legacy deductions. This action
                changes live stock balances.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => integrityRepair.mutate(false)}
            >
              Confirm Repair
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
