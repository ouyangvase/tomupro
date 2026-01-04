import { useState, useMemo } from 'react';
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
import { 
  Search, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown,
  Download,
  Upload,
  Filter,
  X
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

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  sortable?: boolean;
  filterable?: boolean;
  filterOptions?: { label: string; value: string }[];
  render?: (item: T) => React.ReactNode;
  editable?: boolean;
  editType?: 'text' | 'number' | 'select';
  editOptions?: { label: string; value: string }[];
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
}

type SortDirection = 'asc' | 'desc' | null;

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
}: DataGridProps<T>) {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const filteredData = useMemo(() => {
    let result = [...data];

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter((item) =>
        columns.some((col) => {
          const value = item[col.key];
          return value?.toString().toLowerCase().includes(query);
        })
      );
    }

    // Apply column filters
    Object.entries(columnFilters).forEach(([field, filterValue]) => {
      if (filterValue && filterValue !== 'all') {
        result = result.filter((item) => {
          const value = item[field];
          return value?.toString() === filterValue;
        });
      }
    });

    // Apply sorting
    if (sortField && sortDirection) {
      result.sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];
        
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

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onSelectionChange?.(filteredData.map((item) => String(item[keyField])));
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
    if (e.key === 'Enter') {
      handleCellBlur();
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      setEditValue('');
    }
  };

  const isAllSelected = filteredData.length > 0 && 
    filteredData.every((item) => selectedRows.includes(String(item[keyField])));

  const getSortIcon = (field: string) => {
    if (sortField !== field) return <ArrowUpDown className="h-4 w-4 opacity-40" />;
    if (sortDirection === 'asc') return <ArrowUp className="h-4 w-4 text-primary" />;
    return <ArrowDown className="h-4 w-4 text-primary" />;
  };

  const hasActiveFilters = Object.values(columnFilters).some((v) => v && v !== 'all');

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        {/* Column filters */}
        {columns.some((c) => c.filterable && c.filterOptions) && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant={hasActiveFilters ? "default" : "outline"} size="sm">
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
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold">Filters</h4>
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setColumnFilters({})}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Clear all
                    </Button>
                  )}
                </div>
                {columns
                  .filter((c) => c.filterable && c.filterOptions)
                  .map((col) => (
                    <div key={col.key} className="space-y-2">
                      <label className="text-sm font-medium text-muted-foreground">{col.header}</label>
                      <Select
                        value={columnFilters[col.key] || 'all'}
                        onValueChange={(value) =>
                          setColumnFilters((prev) => ({ ...prev, [col.key]: value }))
                        }
                      >
                        <SelectTrigger>
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
            </PopoverContent>
          </Popover>
        )}

        <div className="flex items-center gap-3 ml-auto">
          {selectedRows.length > 0 && bulkActions}
          
          {onImport && (
            <Button variant="outline" size="sm" onClick={onImport}>
              <Upload className="h-4 w-4 mr-2" />
              Import
            </Button>
          )}
          
          {onExport && (
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          )}
        </div>
      </div>

      {/* Selection info */}
      {selectedRows.length > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 bg-primary/10 border border-primary/20 rounded-xl">
          <span className="text-sm font-medium text-primary">
            {selectedRows.length} row{selectedRows.length !== 1 ? 's' : ''} selected
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onSelectionChange?.([])}
            className="text-primary hover:text-primary"
          >
            Clear selection
          </Button>
        </div>
      )}

      {/* Table */}
      <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-secondary/30 hover:bg-secondary/30">
                {selectable && (
                  <TableHead className="w-14">
                    <Checkbox
                      checked={isAllSelected}
                      onCheckedChange={handleSelectAll}
                    />
                  </TableHead>
                )}
                {columns.map((col) => (
                  <TableHead
                    key={col.key}
                    style={{ width: col.width }}
                    className={cn(col.sortable && 'cursor-pointer select-none hover:text-foreground transition-colors')}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <div className="flex items-center gap-2">
                      <span>{col.header}</span>
                      {col.sortable && getSortIcon(col.key)}
                    </div>
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length + (selectable ? 1 : 0)}
                    className="text-center py-12"
                  >
                    <div className="flex items-center justify-center gap-3">
                      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      <span className="text-muted-foreground">Loading...</span>
                    </div>
                  </TableCell>
                </TableRow>
              ) : filteredData.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={columns.length + (selectable ? 1 : 0)}
                    className="text-center py-12 text-muted-foreground"
                  >
                    {emptyMessage}
                  </TableCell>
                </TableRow>
              ) : (
                filteredData.map((item) => {
                  const id = String(item[keyField]);
                  const isSelected = selectedRows.includes(id);

                  return (
                    <TableRow
                      key={id}
                      className={cn(
                        'cursor-pointer transition-colors',
                        isSelected && 'bg-primary/5'
                      )}
                      onClick={() => onRowClick?.(item)}
                    >
                      {selectable && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) =>
                              handleSelectRow(id, checked as boolean)
                            }
                          />
                        </TableCell>
                      )}
                      {columns.map((col) => {
                        const isEditing =
                          editingCell?.id === id && editingCell?.field === col.key;
                        const value = item[col.key];

                        return (
                          <TableCell
                            key={col.key}
                            onDoubleClick={(e) => {
                              e.stopPropagation();
                              handleCellDoubleClick(id, col.key, value);
                            }}
                          >
                            {isEditing ? (
                              <Input
                                type={col.editType === 'number' ? 'number' : 'text'}
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={handleCellBlur}
                                onKeyDown={handleCellKeyDown}
                                autoFocus
                                className="h-10"
                              />
                            ) : col.render ? (
                              col.render(item)
                            ) : (
                              <span>{String(value ?? '')}</span>
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

      {/* Footer */}
      <div className="flex items-center justify-between text-sm text-muted-foreground px-1">
        <span>
          Showing {filteredData.length} of {data.length} rows
        </span>
      </div>
    </div>
  );
}
