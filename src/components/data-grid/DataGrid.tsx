import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Search, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown,
  Download,
  Upload,
  Filter,
  X,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { cn } from '@/lib/utils';
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
import { useIsMobile } from '@/hooks/use-mobile';

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  // Responsive width configuration
  minWidth?: string;
  maxWidth?: string;
  preferredWidth?: string;
  sortable?: boolean;
  filterable?: boolean;
  filterOptions?: { label: string; value: string }[];
  render?: (item: T) => React.ReactNode;
  editable?: boolean;
  editType?: 'text' | 'number' | 'select';
  editOptions?: { label: string; value: string }[];
  // Mobile priority: 'primary' (always visible), 'secondary' (visible in collapsed), 'expanded' (only in expanded view)
  mobilePriority?: 'primary' | 'secondary' | 'expanded';
}

interface DataGridProps<T extends object> {
  data: T[];
  columns: Column<T>[];
  keyField: keyof T;
  selectable?: boolean;
  selectedRows?: string[];
  onSelectionChange?: (ids: string[]) => void;
  onRowClick?: (item: T) => void;
  onCellEdit?: (id: string, field: string, value: unknown) => void;
  loading?: boolean;
  emptyMessage?: string;
  bulkActions?: React.ReactNode;
  onExport?: () => void;
  onImport?: () => void;
  // Pagination options
  enablePagination?: boolean;
  headerHeight?: number;
}

type SortDirection = 'asc' | 'desc' | null;

// Hook for responsive pagination
function useResponsivePagination(totalItems: number, headerHeight = 200) {
  const [currentPage, setCurrentPage] = useState(1);
  const [dimensions, setDimensions] = useState({ width: 1920, height: 900 });

  // Calculate row height based on screen width
  const rowHeight = useMemo(() => {
    if (dimensions.width >= 1600) return 56;
    if (dimensions.width < 1280) return 44;
    return 52;
  }, [dimensions.width]);

  // Calculate page size based on available height
  const pageSize = useMemo(() => {
    const footerHeight = 60;
    const availableHeight = dimensions.height - headerHeight - footerHeight;
    const calculatedSize = Math.floor(availableHeight / rowHeight);
    return Math.max(5, Math.min(30, calculatedSize));
  }, [dimensions.height, headerHeight, rowHeight]);

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        setDimensions({ width: window.innerWidth, height: window.innerHeight });
      }, 150);
    };

    setDimensions({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, []);

  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [currentPage, totalPages]);

  const paginatedData = useCallback(
    <T,>(data: T[]): T[] => {
      const startIndex = (currentPage - 1) * pageSize;
      return data.slice(startIndex, startIndex + pageSize);
    },
    [currentPage, pageSize]
  );

  return { pageSize, currentPage, setCurrentPage, totalPages, paginatedData, rowHeight };
}

export function DataGrid<T extends object>({
  data,
  columns,
  keyField,
  selectable = false,
  selectedRows = [],
  onSelectionChange,
  onRowClick,
  onCellEdit,
  loading = false,
  emptyMessage = 'No data available',
  bulkActions,
  onExport,
  onImport,
  enablePagination = true,
  headerHeight = 200,
}: DataGridProps<T>) {
  const isMobile = useIsMobile();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());

  const filteredData = useMemo(() => {
    let result = [...data];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((item) =>
        columns.some((col) => {
          const value = (item as any)[col.key];
          return value?.toString().toLowerCase().includes(query);
        })
      );
    }

    Object.entries(columnFilters).forEach(([field, filterValue]) => {
      if (filterValue && filterValue !== 'all') {
        result = result.filter((item) => {
          const value = (item as any)[field];
          return value?.toString() === filterValue;
        });
      }
    });

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

  // Use responsive pagination
  const { pageSize, currentPage, setCurrentPage, totalPages, paginatedData, rowHeight } = 
    useResponsivePagination(filteredData.length, headerHeight);

  const displayData = useMemo(() => {
    if (!enablePagination || isMobile) return filteredData;
    return paginatedData(filteredData);
  }, [enablePagination, isMobile, filteredData, paginatedData]);

  const handleSort = (field: string) => {
    if (sortField === field) {
      if (sortDirection === 'asc') setSortDirection('desc');
      else if (sortDirection === 'desc') { setSortField(null); setSortDirection(null); }
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange?.(displayData.map((item) => String(item[keyField])));
    } else {
      onSelectionChange?.([]);
    }
  };

  const handleSelectRow = (id: string, checked: boolean) => {
    if (checked) {
      onSelectionChange?.([...selectedRows, id]);
    } else {
      onSelectionChange?.(selectedRows.filter((rowId) => rowId !== id));
    }
  };

  const handleCellDoubleClick = (id: string, field: string, value: unknown) => {
    const column = columns.find((c) => c.key === field);
    if (column?.editable) {
      setEditingCell({ id, field });
      setEditValue(String(value ?? ''));
    }
  };

  const handleCellBlur = () => {
    if (editingCell) {
      onCellEdit?.(editingCell.id, editingCell.field, editValue);
      setEditingCell(null);
      setEditValue('');
    }
  };

  const handleCellKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleCellBlur();
    else if (e.key === 'Escape') { setEditingCell(null); setEditValue(''); }
  };

  const isAllSelected = displayData.length > 0 && 
    displayData.every((item) => selectedRows.includes(String(item[keyField])));

  const getSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />;
    if (sortDirection === 'asc') return <ArrowUp className="h-3.5 w-3.5 text-primary" />;
    return <ArrowDown className="h-3.5 w-3.5 text-primary" />;
  };

  const hasActiveFilters = Object.values(columnFilters).some((v) => v && v !== 'all');

  const toggleCardExpanded = (id: string) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Mobile column organization
  const primaryColumns = columns.filter(c => !c.mobilePriority || c.mobilePriority === 'primary');
  const secondaryColumns = columns.filter(c => c.mobilePriority === 'secondary');
  const expandedMobileColumns = columns.filter(c => c.mobilePriority === 'expanded');
  const mobileVisibleColumns = [...primaryColumns, ...secondaryColumns].slice(0, 6);
  const mobileExpandedColumns = columns.filter(c => !mobileVisibleColumns.includes(c));

  // Build responsive column width style
  const getColumnStyle = (col: Column<T>) => {
    if (col.width) return { width: col.width, minWidth: col.width, maxWidth: col.width };
    const min = col.minWidth || '80px';
    const max = col.maxWidth || '280px';
    const preferred = col.preferredWidth || '10vw';
    return { width: `clamp(${min}, ${preferred}, ${max})`, minWidth: min, maxWidth: max };
  };

  // Filter content
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
      {columns.filter((c) => c.filterable && c.filterOptions).map((col) => (
        <div key={col.key} className="space-y-2">
          <label className="text-sm font-medium text-muted-foreground">{col.header}</label>
          <Select
            value={columnFilters[col.key] || 'all'}
            onValueChange={(value) => setColumnFilters((prev) => ({ ...prev, [col.key]: value }))}
          >
            <SelectTrigger className="h-10">
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              {col.filterOptions?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
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
        <div className="relative flex-1 min-w-0 lg:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9 h-10"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {columns.some((c) => c.filterable && c.filterOptions) && (
            isMobile ? (
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant={hasActiveFilters ? "default" : "outline"} size="sm" className="h-10">
                    <Filter className="h-4 w-4 mr-2" />
                    Filters
                    {hasActiveFilters && <Badge variant="secondary" className="ml-2">{Object.values(columnFilters).filter((v) => v && v !== 'all').length}</Badge>}
                  </Button>
                </SheetTrigger>
                <SheetContent side="bottom" className="h-[80vh] rounded-t-2xl flex flex-col">
                  <SheetHeader><SheetTitle>Filters</SheetTitle></SheetHeader>
                  <ScrollArea className="flex-1 py-4">{filterContent}</ScrollArea>
                </SheetContent>
              </Sheet>
            ) : (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant={hasActiveFilters ? "default" : "outline"} size="sm" className="h-9">
                    <Filter className="h-4 w-4 mr-2" />
                    Filters
                    {hasActiveFilters && <Badge variant="secondary" className="ml-2">{Object.values(columnFilters).filter((v) => v && v !== 'all').length}</Badge>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-80" align="start">{filterContent}</PopoverContent>
              </Popover>
            )
          )}

          <div className="flex items-center gap-2 ml-auto">
            {onImport && (
              <Button variant="outline" size="sm" onClick={onImport} className="h-9">
                <Upload className="h-4 w-4 lg:mr-2" />
                <span className="hidden lg:inline">Import</span>
              </Button>
            )}
            {onExport && (
              <Button variant="outline" size="sm" onClick={onExport} className="h-9">
                <Download className="h-4 w-4 lg:mr-2" />
                <span className="hidden lg:inline">Export</span>
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Bulk actions - Desktop */}
      {!isMobile && selectedRows.length > 0 && (
        <Card className="p-3 border-primary/30 bg-primary/5">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-sm font-medium text-primary">{selectedRows.length} selected</span>
            <div className="flex items-center gap-2 flex-wrap">{bulkActions}</div>
            <Button variant="ghost" size="sm" onClick={() => onSelectionChange?.([])} className="text-primary hover:text-primary ml-auto">
              Clear
            </Button>
          </div>
        </Card>
      )}

      {/* Content */}
      {isMobile ? (
        // Mobile Card View
        <div className="space-y-3 pb-24">
          {selectable && displayData.length > 0 && (
            <div className="flex items-center gap-3 px-3 py-2.5 bg-secondary/30 rounded-lg border border-border/50">
              <Checkbox checked={isAllSelected} onCheckedChange={handleSelectAll} className="h-5 w-5" />
              <span className="text-sm font-medium">Select all ({displayData.length})</span>
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center gap-3 py-12">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <span className="text-muted-foreground">Loading...</span>
            </div>
          ) : displayData.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">{emptyMessage}</div>
          ) : (
            displayData.map((item) => {
              const id = String(item[keyField]);
              const isSelected = selectedRows.includes(id);
              const isExpanded = expandedCards.has(id);

              return (
                <Card key={id} className={cn('p-3 transition-all', isSelected && 'bg-primary/5 border-primary/30 ring-1 ring-primary/20')}>
                  <div className="flex items-start gap-3">
                    {selectable && (
                      <div className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={isSelected} onCheckedChange={(checked) => handleSelectRow(id, checked as boolean)} className="h-5 w-5" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0" onClick={() => onRowClick?.(item)}>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                        {mobileVisibleColumns.map((col) => (
                          <div key={col.key} className="min-w-0">
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-0.5">{col.header}</span>
                            <div className="text-sm font-medium break-words">
                              {col.render ? col.render(item) : String((item as any)[col.key] ?? '-')}
                            </div>
                          </div>
                        ))}
                      </div>

                      {mobileExpandedColumns.length > 0 && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => { e.stopPropagation(); toggleCardExpanded(id); }}
                            className="w-full mt-2 h-8 text-xs text-muted-foreground hover:text-foreground"
                          >
                            {isExpanded ? <><ChevronUp className="h-3 w-3 mr-1" />Show less</> : <><ChevronDown className="h-3 w-3 mr-1" />Show {mobileExpandedColumns.length} more</>}
                          </Button>
                          {isExpanded && (
                            <div className="mt-3 pt-3 border-t border-border/50 grid grid-cols-2 gap-x-4 gap-y-2">
                              {mobileExpandedColumns.map((col) => (
                                <div key={col.key} className="min-w-0">
                                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground block mb-0.5">{col.header}</span>
                                  <div className="text-sm break-words">{col.render ? col.render(item) : String((item as any)[col.key] ?? '-')}</div>
                                </div>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      ) : (
        // Desktop Fixed Table View
        <div className="space-y-3">
          <div className="border rounded-lg overflow-hidden">
            <div className="overflow-x-hidden">
              <Table className="table-fixed w-full">
                <TableHeader className="bg-muted/50">
                  <TableRow>
                    {selectable && (
                      <TableHead className="w-[44px] px-2">
                        <Checkbox checked={isAllSelected} onCheckedChange={handleSelectAll} />
                      </TableHead>
                    )}
                    {columns.map((col) => (
                      <TableHead
                        key={col.key}
                        style={getColumnStyle(col)}
                        className={cn('px-2 py-2 text-xs font-semibold whitespace-nowrap overflow-hidden text-ellipsis', col.sortable && 'cursor-pointer hover:bg-muted')}
                        onClick={() => col.sortable && handleSort(col.key)}
                      >
                        <div className="flex items-center gap-1 truncate">
                          <span className="truncate">{col.header}</span>
                          {col.sortable && getSortIcon(col.key)}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={columns.length + (selectable ? 1 : 0)} className="h-32 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                          <span className="text-muted-foreground">Loading...</span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : displayData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={columns.length + (selectable ? 1 : 0)} className="h-32 text-center text-muted-foreground">
                        {emptyMessage}
                      </TableCell>
                    </TableRow>
                  ) : (
                    displayData.map((item) => {
                      const id = String(item[keyField]);
                      const isSelected = selectedRows.includes(id);

                      return (
                        <TableRow
                          key={id}
                          style={{ height: `${rowHeight}px` }}
                          className={cn('transition-colors', isSelected && 'bg-primary/5', onRowClick && 'cursor-pointer hover:bg-muted/50')}
                          onClick={() => onRowClick?.(item)}
                        >
                          {selectable && (
                            <TableCell className="px-2" onClick={(e) => e.stopPropagation()}>
                              <Checkbox checked={isSelected} onCheckedChange={(checked) => handleSelectRow(id, checked as boolean)} />
                            </TableCell>
                          )}
                          {columns.map((col) => {
                            const isEditing = editingCell?.id === id && editingCell?.field === col.key;
                            const value = (item as any)[col.key];
                            const renderedValue = col.render ? col.render(item) : String(value ?? '-');
                            const isStringValue = typeof renderedValue === 'string';

                            return (
                              <TableCell
                                key={col.key}
                                style={getColumnStyle(col)}
                                className="px-2 py-1.5 overflow-hidden"
                                onDoubleClick={(e) => { e.stopPropagation(); handleCellDoubleClick(id, col.key, value); }}
                              >
                                {isEditing ? (
                                  <Input
                                    type={col.editType === 'number' ? 'number' : 'text'}
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    onBlur={handleCellBlur}
                                    onKeyDown={handleCellKeyDown}
                                    autoFocus
                                    className="h-8"
                                  />
                                ) : isStringValue ? (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <span className="block truncate text-sm">{renderedValue}</span>
                                    </TooltipTrigger>
                                    <TooltipContent side="top" className="max-w-[400px]">
                                      <p className="whitespace-pre-wrap break-words">{renderedValue}</p>
                                    </TooltipContent>
                                  </Tooltip>
                                ) : (
                                  <div className="truncate text-sm">{renderedValue}</div>
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

          {/* Pagination */}
          {enablePagination && totalPages > 1 && (
            <div className="flex items-center justify-between px-2 text-sm">
              <span className="text-muted-foreground">
                Showing {(currentPage - 1) * pageSize + 1}-{Math.min(currentPage * pageSize, filteredData.length)} of {filteredData.length}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(currentPage - 1)} disabled={currentPage === 1}>
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="px-3">Page {currentPage} of {totalPages}</span>
                <Button variant="outline" size="sm" onClick={() => setCurrentPage(currentPage + 1)} disabled={currentPage === totalPages}>
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Footer for mobile */}
      {isMobile && (
        <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>Showing {displayData.length} of {data.length} rows</span>
        </div>
      )}

      {/* Mobile Bulk Actions - Sticky bar */}
      {isMobile && selectedRows.length > 0 && bulkActions && (
        <Card className="fixed bottom-0 left-0 right-0 z-50 p-3 rounded-none border-t shadow-lg bg-background">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <span className="text-sm font-medium text-primary shrink-0">{selectedRows.length} selected</span>
            <div className="flex items-center gap-2">{bulkActions}</div>
          </div>
        </Card>
      )}
    </div>
  );
}
