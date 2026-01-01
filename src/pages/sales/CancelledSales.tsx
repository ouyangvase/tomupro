import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { StatusBadge } from '@/components/StatusBadge';
import { useOrders, useBulkUpdateOrders } from '@/hooks/useOrders';
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
import { format } from 'date-fns';
import { RotateCcw } from 'lucide-react';
import { exportToCSV } from '@/lib/csv';
import type { Order, OrderStatus } from '@/types/database';

export default function CancelledSales() {
  const { profile, role } = useAuth();
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<OrderStatus>('BOOKING');
  
  const { data: orders = [], isLoading } = useOrders({ 
    status: 'CANCELLED',
    salespersonId: role === 'salesperson' ? profile?.id : undefined 
  });
  
  const bulkUpdateOrders = useBulkUpdateOrders();

  const isEditable = role === 'admin' || role === 'salesperson';

  const columns: Column<Order>[] = [
    { 
      key: 'order_date', 
      header: 'Order Date', 
      sortable: true, 
      width: '100px',
      render: (o) => format(new Date(o.order_date), 'MMM dd, yyyy') 
    },
    { key: 'customer_name', header: 'Customer', sortable: true },
    { key: 'phone', header: 'Phone' },
    { 
      key: 'area', 
      header: 'Area', 
      sortable: true,
      filterable: true, 
      filterOptions: [...new Set(orders.map(o => o.area).filter(Boolean))].map(a => ({ label: a!, value: a! })) 
    },
    { 
      key: 'total_qty', 
      header: 'Qty', 
      width: '80px',
      render: (o) => <Badge variant="secondary">{o.total_qty}</Badge> 
    },
    { 
      key: 'total_amount', 
      header: 'Amount', 
      sortable: true, 
      render: (o) => `$${Number(o.total_amount).toFixed(2)}` 
    },
    { 
      key: 'cancel_reason', 
      header: 'Cancel Reason',
      filterable: true,
      filterOptions: [...new Set(orders.map(o => o.cancel_reason).filter(Boolean))].map(r => ({ label: r!, value: r! })),
      render: (o) => (
        <Badge variant="destructive" className="font-normal">
          {o.cancel_reason || 'No reason'}
        </Badge>
      )
    },
    { 
      key: 'cancel_notes', 
      header: 'Notes', 
      render: (o) => (
        <span className="text-sm text-muted-foreground max-w-[200px] truncate block">
          {o.cancel_notes || '—'}
        </span>
      )
    },
    { 
      key: 'updated_at', 
      header: 'Cancelled At', 
      sortable: true,
      render: (o) => format(new Date(o.updated_at), 'MMM dd, HH:mm') 
    },
    { 
      key: 'status', 
      header: 'Status', 
      width: '100px',
      render: (o) => <StatusBadge status={o.status} type="order" /> 
    },
  ];

  const handleRestore = () => {
    bulkUpdateOrders.mutate({
      ids: selectedRows,
      updates: { 
        status: restoreTarget, 
        cancel_reason: null, 
        cancel_notes: null 
      },
    });
    setRestoreDialogOpen(false);
    setSelectedRows([]);
  };

  const handleExport = () => {
    const exportColumns = [
      { key: 'order_date', header: 'Order Date' },
      { key: 'customer_name', header: 'Customer Name' },
      { key: 'phone', header: 'Phone' },
      { key: 'address', header: 'Address' },
      { key: 'area', header: 'Area' },
      { key: 'total_qty', header: 'Total Qty' },
      { key: 'total_amount', header: 'Total Amount' },
      { key: 'cancel_reason', header: 'Cancel Reason' },
      { key: 'cancel_notes', header: 'Cancel Notes' },
      { key: 'updated_at', header: 'Cancelled At' },
    ];
    exportToCSV(orders as any, exportColumns, 'cancelled_orders');
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Cancelled Sales</h1>
            <p className="text-muted-foreground">Orders that have been cancelled</p>
          </div>
        </div>

        <DataGrid
          data={orders}
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
