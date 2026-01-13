import { format } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePcPackageDetail, usePcPackageLines } from '@/hooks/usePcPackages';

const statusColors: Record<string, string> = {
  WAREHOUSE: 'bg-secondary text-secondary-foreground',
  PACKING: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  WAIT_PAY: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  IN_TRANSIT: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  TRANSIT_STATION: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  DESTINATION: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  try {
    return format(new Date(dateStr), 'yyyy/MM/dd HH:mm');
  } catch {
    return '-';
  }
}

interface PcPackageDetailDialogProps {
  pcPackageId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PcPackageDetailDialog({
  pcPackageId,
  open,
  onOpenChange,
}: PcPackageDetailDialogProps) {
  const { data: pkg, isLoading: pkgLoading } = usePcPackageDetail(pcPackageId);
  const { data: lines = [], isLoading: linesLoading } = usePcPackageLines(pcPackageId);

  const isLoading = pkgLoading || linesLoading;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {isLoading ? (
              <Skeleton className="h-6 w-48" />
            ) : pkg ? (
              <>
                <span className="font-mono">{pkg.tracking_no_cn}</span>
                <Badge className={statusColors[pkg.status] || 'bg-muted'}>
                  {pkg.status.replace(/_/g, ' ')}
                </Badge>
              </>
            ) : (
              'Package Not Found'
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : pkg ? (
          <div className="space-y-6">
            {/* Package Info */}
            <div className="grid grid-cols-2 gap-4">
              <InfoRow label="Owner" value={pkg.owner_name || '-'} />
              <InfoRow label="Destination" value={pkg.destination || '-'} />
              <InfoRow label="Weight" value={pkg.weight_kg ? `${pkg.weight_kg} kg` : '-'} />
              <InfoRow label="Paid (CNY)" value={pkg.total_paid_cny ? `¥${pkg.total_paid_cny}` : '-'} />
              <InfoRow label="Logistics Cost (RM)" value={pkg.log_cost_rm ? `RM ${pkg.log_cost_rm}` : '-'} />
              <InfoRow label="Updated" value={formatDate(pkg.updated_at)} />
              {pkg.arrived_destination_at && (
                <InfoRow label="Arrived At" value={formatDate(pkg.arrived_destination_at)} />
              )}
            </div>

            <Separator />

            {/* SKU Lines */}
            <div>
              <h3 className="font-medium mb-3">Items ({lines.length})</h3>
              {lines.length === 0 ? (
                <p className="text-sm text-muted-foreground">No items in this package.</p>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>SKU</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Price</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lines.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell className="font-mono text-xs">
                            {line.sku_code || line.sku_ref || '-'}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">
                            {line.product_title || '-'}
                          </TableCell>
                          <TableCell className="text-right">{line.qty || '-'}</TableCell>
                          <TableCell className="text-right">
                            {line.unit_price_cny ? `¥${line.unit_price_cny}` : '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground">Package not found or you don't have access.</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-xs text-muted-foreground">{label}</span>
      <p className="font-medium">{value}</p>
    </div>
  );
}
