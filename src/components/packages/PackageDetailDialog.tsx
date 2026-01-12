import { Package as PackageIcon, X, Box, Hash, Truck, Scale } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePackageDetail, usePackageSkus } from '@/hooks/usePackages';
import { format } from 'date-fns';

const statusColors: Record<string, string> = {
  WAREHOUSE: 'bg-slate-500',
  PACKING: 'bg-amber-500',
  WAIT_PAY: 'bg-orange-500',
  IN_TRANSIT: 'bg-blue-500',
  TRANSIT_STATION: 'bg-indigo-500',
  DESTINATION: 'bg-green-500',
};

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '-';
  try {
    return format(new Date(dateStr), 'yyyy/MM/dd');
  } catch {
    return '-';
  }
}

interface PackageDetailDialogProps {
  packageId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PackageDetailDialog({
  packageId,
  open,
  onOpenChange,
}: PackageDetailDialogProps) {
  const { data: pkg, isLoading: loadingPackage } = usePackageDetail(packageId);
  const { data: skus = [], isLoading: loadingSkus } = usePackageSkus(packageId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageIcon className="h-5 w-5" />
            Package Details
          </DialogTitle>
        </DialogHeader>

        {loadingPackage ? (
          <div className="space-y-3">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        ) : pkg ? (
          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-4">
              {/* Tracking & Status */}
              <div className="flex items-center justify-between">
                <span className="font-mono text-lg font-bold">{pkg.tracking_no}</span>
                <Badge className={`${statusColors[pkg.status] || 'bg-gray-500'} text-white`}>
                  {pkg.status.replace('_', ' ')}
                </Badge>
              </div>

              {/* Package Info */}
              <Card>
                <CardContent className="p-4 space-y-3">
                  <InfoRow label="Owner" value={pkg.owner_name} />
                  <InfoRow
                    label="Batch ID"
                    value={pkg.batch_id || '-'}
                    mono
                  />
                  <InfoRow
                    label="Intl Order ID"
                    value={pkg.intl_order_id || '-'}
                    mono
                  />
                  <InfoRow
                    label="Weight"
                    value={pkg.weight_kg ? `${pkg.weight_kg} kg` : '-'}
                  />
                  <InfoRow
                    label="Total Paid"
                    value={pkg.total_paid_cny ? `¥${pkg.total_paid_cny.toFixed(2)}` : '-'}
                  />
                  <InfoRow
                    label="Paid At"
                    value={formatDate(pkg.latest_paid_at)}
                  />
                  <InfoRow
                    label="Last Updated"
                    value={formatDate(pkg.last_updated_at)}
                  />
                </CardContent>
              </Card>

              {/* SKU List */}
              <div>
                <h3 className="font-medium mb-2 flex items-center gap-2">
                  <Box className="h-4 w-4" />
                  SKU Items ({skus.length})
                </h3>
                {loadingSkus ? (
                  <div className="space-y-2">
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-16 w-full" />
                  </div>
                ) : skus.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No SKU items</p>
                ) : (
                  <div className="space-y-2">
                    {skus.map((sku) => (
                      <Card key={sku.id}>
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex-1 min-w-0">
                              <div className="font-mono text-sm font-medium truncate">
                                {sku.sku_code || 'No SKU'}
                              </div>
                              {sku.product_title && (
                                <div className="text-sm text-muted-foreground truncate">
                                  {sku.product_title}
                                </div>
                              )}
                              {sku.sku_ref && (
                                <div className="text-xs text-muted-foreground">
                                  Ref: {sku.sku_ref}
                                </div>
                              )}
                            </div>
                            <div className="text-right shrink-0">
                              <div className="font-medium">
                                x{sku.qty || 0}
                              </div>
                              {sku.unit_price_cny && (
                                <div className="text-sm text-muted-foreground">
                                  ¥{sku.unit_price_cny.toFixed(2)}
                                </div>
                              )}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Package not found
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? 'font-mono' : ''}>{value}</span>
    </div>
  );
}
