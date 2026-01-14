import { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Filter, Download, Upload, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { OrdersTableFixed } from './OrdersTableFixed';
import { OrdersCards } from './OrdersCards';
import type { ResponsiveColumn, ResponsiveListProps, ExportDialogState } from './types';

export function OrdersResponsiveList<T extends object>({
  data,
  columns,
  keyField,
  selectable = false,
  selectedRows = [],
  onSelectionChange,
  onRowClick,
  rowActions,
  bulkActions,
  enableExport = true,
  onExport,
  onExportSelected,
  onImport,
  loading = false,
  emptyMessage = 'No data available',
  defaultSort,
}: ResponsiveListProps<T>) {
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<string | null>(defaultSort?.field || null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc' | null>(
    defaultSort?.direction || null
  );
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [exportDialog, setExportDialog] = useState<ExportDialogState>({
    open: false,
    mode: 'selected',
  });

  // Filter and sort data
  const filteredData = useMemo(() => {
    let result = [...data];

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((item) =>
        columns.some((col) => {
          const value = (item as any)[col.key];
          return value?.toString().toLowerCase().includes(query);
        })
      );
    }

    // Apply column filters
    Object.entries(columnFilters).forEach(([field, filterValue]) => {
      if (filterValue && filterValue !== 'all') {
        result = result.filter((item) => {
          const value = (item as any)[field];
          return value?.toString() === filterValue;
        });
      }
    });

    // Apply sorting
    if (sortField && sortDirection) {
      result.sort((a, b) => {
        const aVal = (a as any)[sortField];
        const bVal = (b as any)[sortField];

        if (aVal === null || aVal === undefined) return 1;
        if (bVal === null || bVal === undefined) return -1;

        let comparison = 0;
        if (typeof aVal === 'string' && typeof bVal === 'string') {
          comparison = aVal.localeCompare(bVal);
        } else if (typeof aVal === 'number' && typeof bVal === 'number') {
          comparison = aVal - bVal;
        } else {
          comparison = String(aVal).localeCompare(String(bVal));
        }

        return sortDirection === 'asc' ? comparison : -comparison;
      });
    }

    return result;
  }, [data, searchQuery, sortField, sortDirection, columnFilters, columns]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortDirection === 'asc') {
        setSortDirection('desc');
      } else if (sortDirection === 'desc') {
        setSortField(null);
        setSortDirection(null);
      }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const hasActiveFilters = Object.values(columnFilters).some((v) => v && v !== 'all');
  const filterableColumns = columns.filter((c) => c.filterable && c.filterOptions);

  const handleExport = () => {
    if (exportDialog.mode === 'selected') {
      onExportSelected?.();
    } else {
      onExport?.();
    }
    setExportDialog({ open: false, mode: 'selected' });
  };

  // Filter content for both mobile sheet and desktop popover
  const filterContent = (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">Filters</h4>
        {hasActiveFilters && (
          <Button variant="ghost" size="sm" onClick={() => setColumnFilters({})}>
            <X className="h-4 w-4 mr-1" />
            Clear all
          </Button>
        )}
      </div>
      {filterableColumns.map((col) => (
        <div key={col.key} className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">{col.header}</label>
          <Select
            value={columnFilters[col.key] || 'all'}
            onValueChange={(value) =>
              setColumnFilters((prev) => ({ ...prev, [col.key]: value }))
            }
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {col.filterOptions?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-4">
        {/* Search */}
        <div className="relative flex-1 min-w-0 lg:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-10"
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Filters */}
          {filterableColumns.length > 0 &&
            (isMobile ? (
              <Sheet>
                <SheetTrigger asChild>
                  <Button
                    variant={hasActiveFilters ? 'default' : 'outline'}
                    size="sm"
                    className="h-10"
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    Filters
                    {hasActiveFilters && (
                      <Badge variant="secondary" className="ml-2">
                        {Object.values(columnFilters).filter((v) => v && v !== 'all').length}
                      </Badge>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[80vh] rounded-t-2xl flex flex-col">
                  <SheetHeader>
                    <SheetTitle>Filters</SheetTitle>
                  </SheetHeader>
                  <ScrollArea className="flex-1 py-4">{filterContent}</ScrollArea>
                </SheetContent>
              </Sheet>
            ) : (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={hasActiveFilters ? 'default' : 'outline'}
                    size="sm"
                    className="h-9"
                  >
                    <Filter className="h-4 w-4 mr-2" />
                    Filters
                    {hasActiveFilters && (
                      <Badge variant="secondary" className="ml-2">
                        {Object.values(columnFilters).filter((v) => v && v !== 'all').length}
                      </Badge>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="start">
                  {filterContent}
                </PopoverContent>
              </Popover>
            ))}

          <div className="flex items-center gap-2 ml-auto">
            {onImport && (
              <Button variant="outline" size="sm" onClick={onImport} className="h-9">
                <Upload className="h-4 w-4 lg:mr-2" />
                <span className="hidden lg:inline">Import</span>
              </Button>
            )}

            {enableExport && (onExport || onExportSelected) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExportDialog({ open: true, mode: 'selected' })}
                className="h-9"
              >
                <Download className="h-4 w-4 lg:mr-2" />
                <span className="hidden lg:inline">Export</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Bulk actions - Desktop */}
      {!isMobile && selectedRows.length > 0 && bulkActions && (
        <Card className="p-3 border-primary/30 bg-primary/5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-primary">
              {selectedRows.length} selected
            </span>
            <div className="flex items-center gap-2 flex-wrap">{bulkActions}</div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSelectionChange?.([])}
              className="text-primary hover:text-primary ml-auto"
            >
              Clear
            </Button>
          </div>
        </Card>
      )}

      {/* Bulk actions - Mobile sticky bar */}
      {isMobile && selectedRows.length > 0 && bulkActions && (
        <Card className="fixed bottom-0 left-0 right-0 z-50 p-3 rounded-none border-t shadow-lg bg-background">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-sm font-medium text-primary shrink-0">
              {selectedRows.length} selected
            </span>
            <div className="flex items-center gap-2">{bulkActions}</div>
          </div>
        </Card>
      )}

      {/* Content */}
      {isMobile ? (
        <OrdersCards
          data={filteredData}
          columns={columns}
          keyField={keyField}
          selectable={selectable}
          selectedRows={selectedRows}
          onSelectionChange={onSelectionChange}
          onRowClick={onRowClick}
          rowActions={rowActions}
          loading={loading}
          emptyMessage={emptyMessage}
        />
      ) : (
        <OrdersTableFixed
          data={filteredData}
          columns={columns}
          keyField={keyField}
          selectable={selectable}
          selectedRows={selectedRows}
          onSelectionChange={onSelectionChange}
          onRowClick={onRowClick}
          rowActions={rowActions}
          loading={loading}
          emptyMessage={emptyMessage}
          sortField={sortField}
          sortDirection={sortDirection}
          onSort={handleSort}
        />
      )}

      {/* Export Dialog */}
      <Dialog
        open={exportDialog.open}
        onOpenChange={(open) => setExportDialog({ ...exportDialog, open })}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Export Orders</DialogTitle>
            <DialogDescription>Choose what to export</DialogDescription>
          </DialogHeader>
          <RadioGroup
            value={exportDialog.mode}
            onValueChange={(value) =>
              setExportDialog({ ...exportDialog, mode: value as 'selected' | 'all' })
            }
            className="space-y-3"
          >
            <div className="flex items-center space-x-3">
              <RadioGroupItem value="selected" id="export-selected" />
              <Label htmlFor="export-selected" className="cursor-pointer">
                Export selected ({selectedRows.length} orders)
              </Label>
            </div>
            <div className="flex items-center space-x-3">
              <RadioGroupItem value="all" id="export-all" />
              <Label htmlFor="export-all" className="cursor-pointer">
                Export all filtered ({filteredData.length} orders)
              </Label>
            </div>
          </RadioGroup>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportDialog({ open: false, mode: 'selected' })}>
              Cancel
            </Button>
            <Button
              onClick={handleExport}
              disabled={exportDialog.mode === 'selected' && selectedRows.length === 0}
            >
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
