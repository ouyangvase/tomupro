import { useState } from 'react';
import { Package as PackageIcon, Search, Filter, X } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsMobile } from '@/hooks/use-mobile';
import { useMyPackages, useAccessibleOwners, PACKAGE_STATUSES, type Package } from '@/hooks/usePackages';
import { PackageDetailDialog } from '@/components/packages/PackageDetailDialog';
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

function formatSkuCodes(skuCodes: string[]): { display: string; hasMore: boolean; moreCount: number } {
  if (!skuCodes || skuCodes.length === 0) {
    return { display: '-', hasMore: false, moreCount: 0 };
  }
  const first3 = skuCodes.slice(0, 3).join(', ');
  const hasMore = skuCodes.length > 3;
  const moreCount = skuCodes.length - 3;
  return { display: first3, hasMore, moreCount };
}

export default function MyPackagesPage() {
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(null);

  const { data: packages = [], isLoading } = useMyPackages({
    search: debouncedSearch,
    status: statusFilter !== 'all' ? statusFilter : undefined,
    ownerId: ownerFilter !== 'all' ? ownerFilter : undefined,
  });

  const { data: owners = [] } = useAccessibleOwners();

  const handleSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      setDebouncedSearch(search);
    }
  };

  const handleSearchClick = () => {
    setDebouncedSearch(search);
  };

  const clearFilters = () => {
    setSearch('');
    setDebouncedSearch('');
    setStatusFilter('all');
    setOwnerFilter('all');
  };

  const hasActiveFilters = debouncedSearch || statusFilter !== 'all' || ownerFilter !== 'all';

  return (
    <AppLayout>
      <div className="container mx-auto p-4 md:p-6 space-y-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <PackageIcon className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold">My Packages</h1>
        </div>

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by tracking no or SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                className="pl-10"
              />
            </div>
            <Button onClick={handleSearchClick} variant="secondary">
              Search
            </Button>
          </div>

          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                {PACKAGE_STATUSES.map((status) => (
                  <SelectItem key={status} value={status}>
                    {status.replace('_', ' ')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={ownerFilter} onValueChange={setOwnerFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Owner" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Owners</SelectItem>
                {owners.map((owner) => (
                  <SelectItem key={owner.owner_id} value={owner.owner_id}>
                    {owner.owner_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {hasActiveFilters && (
              <Button variant="ghost" size="icon" onClick={clearFilters}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Results Count */}
        <div className="text-sm text-muted-foreground">
          {isLoading ? 'Loading...' : `${packages.length} package(s) found`}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : packages.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <PackageIcon className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No packages found</h3>
              <p className="text-muted-foreground text-sm mt-1">
                {hasActiveFilters
                  ? 'Try adjusting your search or filters'
                  : 'You don\'t have access to any packages yet'}
              </p>
            </CardContent>
          </Card>
        ) : isMobile ? (
          <MobilePackageList packages={packages} onSelect={setSelectedPackageId} />
        ) : (
          <DesktopPackageTable packages={packages} onSelect={setSelectedPackageId} />
        )}
      </div>

      <PackageDetailDialog
        packageId={selectedPackageId}
        open={!!selectedPackageId}
        onOpenChange={(open) => !open && setSelectedPackageId(null)}
      />
    </AppLayout>
  );
}

function MobilePackageList({
  packages,
  onSelect,
}: {
  packages: Package[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {packages.map((pkg) => {
        const { display: skuDisplay, hasMore, moreCount } = formatSkuCodes(pkg.sku_codes);
        return (
          <Card
            key={pkg.id}
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => onSelect(pkg.id)}
          >
            <CardContent className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono font-medium">{pkg.tracking_no}</span>
                <Badge className={`${statusColors[pkg.status] || 'bg-gray-500'} text-white`}>
                  {pkg.status.replace('_', ' ')}
                </Badge>
              </div>
              <div className="text-sm text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Owner:</span>
                  <span className="font-medium text-foreground">{pkg.owner_name}</span>
                </div>
                <div className="flex justify-between">
                  <span>Weight:</span>
                  <span>{pkg.weight_kg ? `${pkg.weight_kg} kg` : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Last Updated:</span>
                  <span>{formatDate(pkg.last_updated_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span>SKUs:</span>
                  <span className="text-right truncate max-w-[180px]">
                    {skuDisplay}
                    {hasMore && <span className="text-primary ml-1">+{moreCount}</span>}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function DesktopPackageTable({
  packages,
  onSelect,
}: {
  packages: Package[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tracking No</TableHead>
            <TableHead>Owner</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Batch ID</TableHead>
            <TableHead>Intl Order ID</TableHead>
            <TableHead>Weight</TableHead>
            <TableHead>Last Updated</TableHead>
            <TableHead>SKU Codes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {packages.map((pkg) => {
            const { display: skuDisplay, hasMore, moreCount } = formatSkuCodes(pkg.sku_codes);
            return (
              <TableRow
                key={pkg.id}
                className="cursor-pointer hover:bg-muted/50"
                onClick={() => onSelect(pkg.id)}
              >
                <TableCell className="font-mono font-medium">{pkg.tracking_no}</TableCell>
                <TableCell>{pkg.owner_name}</TableCell>
                <TableCell>
                  <Badge className={`${statusColors[pkg.status] || 'bg-gray-500'} text-white`}>
                    {pkg.status.replace('_', ' ')}
                  </Badge>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {pkg.batch_id ? pkg.batch_id.slice(0, 8) : '-'}
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {pkg.intl_order_id ? pkg.intl_order_id.slice(0, 8) : '-'}
                </TableCell>
                <TableCell>{pkg.weight_kg ? `${pkg.weight_kg} kg` : '-'}</TableCell>
                <TableCell>{formatDate(pkg.last_updated_at)}</TableCell>
                <TableCell className="max-w-[200px]">
                  <span className="truncate block">
                    {skuDisplay}
                    {hasMore && <span className="text-primary ml-1">+{moreCount}</span>}
                  </span>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
