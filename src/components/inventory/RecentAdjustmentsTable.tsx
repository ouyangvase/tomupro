import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from '@/components/ui/pagination';
import { Search, X } from 'lucide-react';
import { format } from 'date-fns';
import { useRecentAdjustments, useAdjustmentUsers } from '@/hooks/useRecentAdjustments';

const PAGE_SIZE = 10;

export function RecentAdjustmentsTable() {
  const [currentPage, setCurrentPage] = useState(1);
  const [skuFilter, setSkuFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');

  const { data: adjustmentsData, isLoading } = useRecentAdjustments({
    page: currentPage,
    pageSize: PAGE_SIZE,
    skuFilter: skuFilter || undefined,
    userFilter: userFilter || undefined,
  });
  const { data: users } = useAdjustmentUsers();

  const adjustments = adjustmentsData?.data || [];
  const totalPages = adjustmentsData?.totalPages || 1;
  const total = adjustmentsData?.total || 0;

  const handleClearFilters = () => {
    setSkuFilter('');
    setUserFilter('');
    setCurrentPage(1);
  };

  const hasFilters = skuFilter || userFilter;

  // Generate visible page numbers
  const getVisiblePages = () => {
    const pages: number[] = [];
    const maxVisible = 5;
    
    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      let start = Math.max(1, currentPage - 2);
      let end = Math.min(totalPages, start + maxVisible - 1);
      if (end - start < maxVisible - 1) {
        start = Math.max(1, end - maxVisible + 1);
      }
      for (let i = start; i <= end; i++) pages.push(i);
    }
    return pages;
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <CardTitle>Recent Adjustments</CardTitle>
          <span className="text-sm text-muted-foreground">
            {total} record{total !== 1 ? 's' : ''}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filter by SKU code or name..."
              value={skuFilter}
              onChange={(e) => {
                setSkuFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9"
            />
          </div>
          <Select
            value={userFilter}
            onValueChange={(v) => {
              setUserFilter(v === 'all' ? '' : v);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder="Filter by user" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Users</SelectItem>
              {users?.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="icon" onClick={handleClearFilters}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Loading...</div>
        ) : adjustments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {hasFilters ? 'No adjustments match the filters' : 'No recent adjustments'}
          </div>
        ) : (
          <>
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Date</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>By</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adjustments.map((adj) => (
                    <TableRow key={adj.id}>
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(new Date(adj.created_at), 'MMM dd, HH:mm')}
                      </TableCell>
                      <TableCell className="text-sm font-mono">
                        {adj.sku_code || '-'}
                      </TableCell>
                      <TableCell className="text-sm max-w-[180px] truncate" title={adj.sku_name}>
                        {adj.sku_name}
                      </TableCell>
                      <TableCell className="text-sm">
                        {adj.warehouse_name}
                      </TableCell>
                      <TableCell>
                        <Badge variant={adj.movement_type === 'RETURN' ? 'secondary' : 'outline'}>
                          {adj.movement_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm max-w-[120px] truncate" title={adj.created_by_name}>
                        {adj.created_by_name}
                      </TableCell>
                      <TableCell
                        className={`text-right font-medium ${
                          adj.qty_change >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {adj.qty_change > 0 ? '+' : ''}
                        {adj.qty_change}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <Pagination>
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious
                      onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      className={currentPage === 1 ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                  {getVisiblePages().map((pageNum) => (
                    <PaginationItem key={pageNum}>
                      <PaginationLink
                        onClick={() => setCurrentPage(pageNum)}
                        isActive={currentPage === pageNum}
                        className="cursor-pointer"
                      >
                        {pageNum}
                      </PaginationLink>
                    </PaginationItem>
                  ))}
                  <PaginationItem>
                    <PaginationNext
                      onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      className={currentPage === totalPages ? 'pointer-events-none opacity-50' : 'cursor-pointer'}
                    />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
