import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { StatusBadge } from '@/components/StatusBadge';
import { useOrders, useBulkUpdateOrders } from '@/hooks/useOrders';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { useReasons } from '@/hooks/useReasons';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { format, startOfMonth, endOfMonth, subMonths, startOfYear } from 'date-fns';
import { RotateCcw, Calendar, Filter } from 'lucide-react';
import { exportToCSV } from '@/lib/csv';
import { formatBND } from '@/lib/currency';
import { formatOrderItemsDisplay } from '@/lib/orderItemsDisplay';
import type { Order, OrderStatus } from '@/types/database';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

export default function CancelledSales() {
  const { profile, role } = useAuth();
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<OrderStatus>('BOOKING');
  
  // Filter states
  const [filterMonth, setFilterMonth] = useState<string>('all');
  const [filterReason, setFilterReason] = useState<string>('all');
  const [filterSalesperson, setFilterSalesperson] = useState<string>('all');
  const [filterArea, setFilterArea] = useState<string>('all');
  
  const { data: allOrders = [], isLoading } = useOrders({ 
    status: 'CANCELLED',
    salespersonId: role === 'salesperson' ? profile?.id : undefined 
  });
  
  const { data: userDirectory = [] } = useUserDirectory();
  const { data: cancelReasons = [] } = useReasons('CANCEL', false);
  
  const bulkUpdateOrders = useBulkUpdateOrders();

  const isEditable = role === 'admin' || role === 'salesperson';

  // Build users map for display
  const usersMap = useMemo(() => {
    const map: Record<string, string> = {};
    userDirectory.forEach(u => {
      map[u.id] = u.display_name;
    });
    return map;
  }, [userDirectory]);

  // Generate month options for filter
  const monthOptions = useMemo(() => {
    const options = [{ label: 'All Time', value: 'all' }];
    const now = new Date();
    for (let i = 0; i < 12; i++) {
      const date = subMonths(now, i);
      options.push({
        label: format(date, 'MMMM yyyy'),
        value: format(date, 'yyyy-MM'),
      });
    }
    return options;
  }, []);

  // Get unique values for filter dropdowns
  const uniqueReasons = useMemo(() => 
    [...new Set(allOrders.map(o => o.cancel_reason).filter(Boolean))],
    [allOrders]
  );
  
  const uniqueAreas = useMemo(() => 
    [...new Set(allOrders.map(o => o.area).filter(Boolean))].sort(),
    [allOrders]
  );
  
  const salespersonOptions = useMemo(() => 
    userDirectory.filter(u => u.role === 'salesperson'),
    [userDirectory]
  );

  // Apply filters
  const filteredOrders = useMemo(() => {
    return allOrders.filter(order => {
      // Month filter
      if (filterMonth !== 'all') {
        const orderDate = new Date(order.cancelled_at || order.created_at);
        const [year, month] = filterMonth.split('-');
        const filterStart = new Date(parseInt(year), parseInt(month) - 1, 1);
        const filterEnd = endOfMonth(filterStart);
        if (orderDate < filterStart || orderDate > filterEnd) return false;
      }
      
      // Reason filter
      if (filterReason !== 'all' && order.cancel_reason !== filterReason) return false;
      
      // Salesperson filter
      if (filterSalesperson !== 'all' && order.salesperson_id !== filterSalesperson) return false;
      
      // Area filter
      if (filterArea !== 'all' && order.area !== filterArea) return false;
      
      return true;
    });
  }, [allOrders, filterMonth, filterReason, filterSalesperson, filterArea]);

  const columns: Column<Order>[] = [
    { 
      key: 'cancelled_at', 
      header: 'Cancelled', 
      sortable: true, 
      width: '120px',
      render: (o) => {
        const date = o.cancelled_at || o.updated_at;
        return (
          <div className="text-sm">
            <div>{format(new Date(date), 'MMM dd, yyyy')}</div>
            <div className="text-muted-foreground text-xs">{format(new Date(date), 'HH:mm')}</div>
          </div>
        );
      }
    },
    { 
      key: 'order_code', 
      header: 'Order Ref', 
      sortable: true,
      render: (o) => <span className="font-mono text-sm">{o.order_code}</span>
    },
    { 
      key: 'customer_name', 
      header: 'Customer', 
      sortable: true,
      render: (o) => (
        <div className="text-sm">
          <div className="font-medium">{o.customer_name}</div>
          <div className="text-muted-foreground text-xs">{o.phone}</div>
        </div>
      )
    },
    { 
      key: 'area', 
      header: 'Area', 
      sortable: true,
    },
    { 
      key: 'address', 
      header: 'Address', 
      render: (o) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-sm truncate max-w-[180px] block cursor-help">
              {o.address || '-'}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-[400px]">
            <p className="whitespace-pre-wrap">{o.address || 'No address'}</p>
          </TooltipContent>
        </Tooltip>
      )
    },
    {
      key: 'order_items',
      header: 'Items',
      render: (o) => {
        const { displayText, fullText, hasError } = formatOrderItemsDisplay(o.order_items);
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`text-sm cursor-help ${hasError ? 'text-destructive' : ''}`}>
                {displayText}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[400px]">
              <p className="whitespace-pre-wrap">{fullText}</p>
            </TooltipContent>
          </Tooltip>
        );
      },
    },
    { 
      key: 'total_amount', 
      header: 'Amount (BND)', 
      sortable: true, 
      render: (o) => <span className="font-medium">{formatBND(o.total_amount)}</span>
    },
    { 
      key: 'payment_method', 
      header: 'Payment', 
      width: '80px',
      render: (o) => <Badge variant="outline">{o.payment_method}</Badge> 
    },
    { 
      key: 'runner_id', 
      header: 'Runner', 
      render: (o) => {
        if (!o.runner) return <span className="text-muted-foreground">—</span>;
        return <span>{o.runner.display_name}</span>;
      }
    },
    { 
      key: 'cancel_reason', 
      header: 'Cancel Reason',
      width: '180px',
      render: (o) => (
        <Badge variant="destructive" className="font-normal">
          {o.cancel_reason || 'No reason'}
        </Badge>
      )
    },
    { 
      key: 'cancel_notes', 
      header: 'Comment',
      width: '200px',
      render: (o) => {
        if (!o.cancel_notes) return <span className="text-muted-foreground">—</span>;
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm truncate max-w-[180px] block cursor-help">
                {o.cancel_notes}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[300px]">
              <p>{o.cancel_notes}</p>
            </TooltipContent>
          </Tooltip>
        );
      }
    },
    { 
      key: 'cancelled_by', 
      header: 'Cancelled By',
      width: '140px',
      render: (o) => {
        const cancellerName = o.cancelled_by ? usersMap[o.cancelled_by] : null;
        if (!cancellerName) return <span className="text-muted-foreground">—</span>;
        return <span className="text-sm">{cancellerName}</span>;
      }
    },
  ];

  const handleRestore = () => {
    bulkUpdateOrders.mutate({
      ids: selectedRows,
      updates: { 
        status: restoreTarget, 
        cancel_reason: null, 
        cancel_notes: null,
        cancelled_by: null,
        cancelled_at: null,
      } as any,
    });
    setRestoreDialogOpen(false);
    setSelectedRows([]);
  };

  const handleExport = () => {
    const exportData = filteredOrders.map(order => ({
      order_ref: order.order_code,
      order_date: order.order_date,
      customer_name: order.customer_name,
      phone: order.phone,
      address: order.address,
      area: order.area || '',
      total_amount: order.total_amount,
      payment_method: order.payment_method,
      salesperson: order.salesperson?.display_name || '',
      runner: order.runner?.display_name || '',
      cancel_reason: order.cancel_reason || '',
      cancel_comment: order.cancel_notes || '',
      cancelled_by: order.cancelled_by ? usersMap[order.cancelled_by] || '' : '',
      cancelled_at: order.cancelled_at ? format(new Date(order.cancelled_at), 'yyyy-MM-dd HH:mm:ss') : '',
    }));

    const columns = [
      { key: 'order_ref', header: 'Order Ref' },
      { key: 'order_date', header: 'Order Date' },
      { key: 'customer_name', header: 'Customer' },
      { key: 'phone', header: 'Phone' },
      { key: 'address', header: 'Address' },
      { key: 'area', header: 'Area' },
      { key: 'total_amount', header: 'Amount (BND)' },
      { key: 'payment_method', header: 'Payment' },
      { key: 'salesperson', header: 'Salesperson' },
      { key: 'runner', header: 'Runner' },
      { key: 'cancel_reason', header: 'Cancel Reason' },
      { key: 'cancel_comment', header: 'Cancel Comment' },
      { key: 'cancelled_by', header: 'Cancelled By' },
      { key: 'cancelled_at', header: 'Cancelled At' },
    ];

    exportToCSV(exportData as any, columns, 'cancelled_orders');
  };

  const clearFilters = () => {
    setFilterMonth('all');
    setFilterReason('all');
    setFilterSalesperson('all');
    setFilterArea('all');
  };

  const hasActiveFilters = filterMonth !== 'all' || filterReason !== 'all' || 
    filterSalesperson !== 'all' || filterArea !== 'all';

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Cancelled Sales</h1>
            <p className="text-muted-foreground">
              {filteredOrders.length} cancelled order{filteredOrders.length !== 1 ? 's' : ''}
              {hasActiveFilters && ` (filtered from ${allOrders.length} total)`}
            </p>
          </div>
        </div>

        {/* Filter Panel */}
        <div className="flex flex-wrap gap-4 p-4 border rounded-lg bg-muted/30">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters:</span>
          </div>
          
          <div className="flex flex-wrap gap-3">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Month</Label>
              <Select value={filterMonth} onValueChange={setFilterMonth}>
                <SelectTrigger className="w-[160px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Reason</Label>
              <Select value={filterReason} onValueChange={setFilterReason}>
                <SelectTrigger className="w-[180px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Reasons</SelectItem>
                  {uniqueReasons.map(r => (
                    <SelectItem key={r} value={r!}>{r}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {(role === 'admin' || role === 'manager') && (
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">Salesperson</Label>
                <Select value={filterSalesperson} onValueChange={setFilterSalesperson}>
                  <SelectTrigger className="w-[160px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Salespersons</SelectItem>
                    {salespersonOptions.map(sp => (
                      <SelectItem key={sp.id} value={sp.id}>{sp.display_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Area</Label>
              <Select value={filterArea} onValueChange={setFilterArea}>
                <SelectTrigger className="w-[140px] h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Areas</SelectItem>
                  {uniqueAreas.map(a => (
                    <SelectItem key={a} value={a!}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-5">
                Clear
              </Button>
            )}
          </div>
        </div>

        <DataGrid
          data={filteredOrders}
          columns={columns}
          keyField="id"
          selectable={isEditable}
          selectedRows={selectedRows}
          onSelectionChange={setSelectedRows}
          loading={isLoading}
          emptyMessage="No cancelled orders"
          onExport={handleExport}
          bulkActions={
            isEditable && selectedRows.length > 0 ? (
              <Button size="sm" onClick={() => setRestoreDialogOpen(true)}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Restore
              </Button>
            ) : undefined
          }
        />
      </div>

      {/* Restore Dialog */}
      <Dialog open={restoreDialogOpen} onOpenChange={setRestoreDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore Order{selectedRows.length > 1 ? 's' : ''}</DialogTitle>
            <DialogDescription>
              Choose where to restore {selectedRows.length} order{selectedRows.length !== 1 ? 's' : ''} to.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Select value={restoreTarget} onValueChange={(v) => setRestoreTarget(v as OrderStatus)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="BOOKING">
                  <div className="flex items-center gap-2">
                    <StatusBadge status="BOOKING" type="order" />
                    <span>Restore to Booking</span>
                  </div>
                </SelectItem>
                <SelectItem value="READY">
                  <div className="flex items-center gap-2">
                    <StatusBadge status="READY" type="order" />
                    <span>Restore to Ready</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setRestoreDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleRestore} 
              disabled={bulkUpdateOrders.isPending}
            >
              {bulkUpdateOrders.isPending ? 'Restoring...' : 'Restore Orders'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
