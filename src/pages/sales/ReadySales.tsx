import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { StatusBadge } from '@/components/StatusBadge';
import { useOrders, useUpdateOrder, useBulkUpdateOrders } from '@/hooks/useOrders';
import { useBindings } from '@/hooks/useBindings';
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
import { Truck, UserCheck } from 'lucide-react';
import { OrderEditor } from '@/components/orders/OrderEditor';
import { CancelOrderDialog } from '@/components/orders/CancelOrderDialog';
import { exportToCSV } from '@/lib/csv';
import type { Order } from '@/types/database';

export default function ReadySales() {
  const { profile, role } = useAuth();
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedRunner, setSelectedRunner] = useState<string>('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  
  const { data: orders = [], isLoading } = useOrders({ 
    status: 'READY',
    salespersonId: role === 'salesperson' ? profile?.id : undefined 
  });
  
  const { data: bindings = [] } = useBindings(profile?.id);
  const updateOrder = useUpdateOrder();
  const bulkUpdateOrders = useBulkUpdateOrders();

  const isEditable = role === 'admin' || role === 'salesperson';

  const columns: Column<Order>[] = [
    { 
      key: 'order_date', 
      header: 'Date', 
      sortable: true, 
      width: '100px',
      render: (o) => format(new Date(o.order_date), 'MMM dd') 
    },
    { key: 'customer_name', header: 'Customer', sortable: true },
    { 
      key: 'area', 
      header: 'Area', 
      sortable: true, 
      filterable: true, 
      filterOptions: [...new Set(orders.map(o => o.area).filter(Boolean))].map(a => ({ label: a!, value: a! })) 
    },
    { 
      key: 'items_summary', 
      header: 'Items', 
      render: (o) => {
        const itemCount = o.order_items?.length || 0;
        return (
          <div className="text-sm">
            <span className="font-medium">{itemCount} SKU</span>
            <span className="text-muted-foreground"> · {o.total_qty} units</span>
          </div>
        );
      }
    },
    { 
      key: 'total_amount', 
      header: 'Amount', 
      sortable: true, 
      render: (o) => <span className="font-medium">${Number(o.total_amount).toFixed(2)}</span>
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
      filterable: true,
      filterOptions: bindings.map(b => ({ label: b.runner?.display_name || 'Unknown', value: b.runner_id })),
      render: (o) => {
        if (!o.runner) return <span className="text-muted-foreground">Unassigned</span>;
        return (
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-muted-foreground" />
            <span>{o.runner.display_name}</span>
          </div>
        );
      }
    },
    { 
      key: 'runner_status', 
      header: 'Delivery', 
      width: '120px',
      filterable: true,
      filterOptions: [
        { label: 'Unassigned', value: 'UNASSIGNED' },
        { label: 'Assigned', value: 'ASSIGNED' },
        { label: 'Taken', value: 'TAKEN' },
        { label: 'Delivered', value: 'DELIVERED' },
        { label: 'Failed', value: 'FAILED_DELIVERY' },
      ],
      render: (o) => <StatusBadge status={o.runner_status} type="runner" /> 
    },
    { 
      key: 'reconciliation_status', 
      header: 'Reconciliation', 
      width: '140px',
      filterable: true,
      filterOptions: [
        { label: 'Not Claimed', value: 'NOT_CLAIMED' },
        { label: 'Claimed', value: 'CLAIMED' },
        { label: 'SP Ack Pending', value: 'SP_ACK_PENDING' },
        { label: 'Admin Ack Pending', value: 'ADMIN_ACK_PENDING' },
        { label: 'Settled', value: 'SETTLED' },
        { label: 'Dispute', value: 'DISPUTE' },
      ],
      render: (o) => <StatusBadge status={o.reconciliation_status} type="reconciliation" /> 
    },
  ];

  const handleRowClick = (order: Order) => {
    if (!isEditable) return;
    setEditingOrder(order);
    setEditorOpen(true);
  };

  const handleAssignRunner = () => {
    if (!selectedRunner || selectedRows.length === 0) return;
    
    bulkUpdateOrders.mutate({
      ids: selectedRows,
      updates: {
        runner_id: selectedRunner,
        runner_status: 'ASSIGNED',
      },
    });
    
    setAssignDialogOpen(false);
    setSelectedRunner('');
    setSelectedRows([]);
  };

  const handleCancelConfirm = (reason: string, notes: string) => {
    bulkUpdateOrders.mutate({
      ids: selectedRows,
      updates: { 
        status: 'CANCELLED', 
        cancel_reason: reason, 
        cancel_notes: notes 
      },
    });
    setCancelDialogOpen(false);
    setSelectedRows([]);
  };

  const handleDispute = () => {
    bulkUpdateOrders.mutate({
      ids: selectedRows,
      updates: { reconciliation_status: 'DISPUTE' },
    });
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
      { key: 'payment_method', header: 'Payment Method' },
      { key: 'runner_status', header: 'Runner Status' },
      { key: 'reconciliation_status', header: 'Reconciliation Status' },
    ];
    exportToCSV(orders as any, exportColumns, 'ready_orders');
  };

  const unassignedCount = orders.filter(o => o.runner_status === 'UNASSIGNED').length;

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Ready Sales</h1>
            <p className="text-muted-foreground">
              Orders ready for delivery • {unassignedCount} awaiting runner assignment
            </p>
          </div>
        </div>

        <DataGrid
          data={orders}
          columns={columns}
          keyField="id"
          selectable={isEditable}
          selectedRows={selectedRows}
          onSelectionChange={setSelectedRows}
          onRowClick={handleRowClick}
          loading={isLoading}
          emptyMessage="No ready orders"
          onExport={handleExport}
          bulkActions={
            isEditable && selectedRows.length > 0 ? (
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  onClick={() => setAssignDialogOpen(true)}
                >
                  <UserCheck className="h-4 w-4 mr-2" />
                  Assign Runner
                </Button>
                <Button size="sm" variant="outline" onClick={handleDispute}>
                  Mark Dispute
                </Button>
                <Button 
                  size="sm" 
                  variant="destructive" 
                  onClick={() => setCancelDialogOpen(true)}
                >
                  Cancel
                </Button>
              </div>
            ) : undefined
          }
        />
      </div>

      <OrderEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        order={editingOrder}
        mode="edit"
      />

      <CancelOrderDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        orderCount={selectedRows.length}
        onConfirm={handleCancelConfirm}
        loading={bulkUpdateOrders.isPending}
      />

      {/* Assign Runner Dialog */}
      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Runner</DialogTitle>
            <DialogDescription>
              Select a runner to assign to {selectedRows.length} order{selectedRows.length !== 1 ? 's' : ''}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            <Select value={selectedRunner} onValueChange={setSelectedRunner}>
              <SelectTrigger>
                <SelectValue placeholder="Select a runner..." />
              </SelectTrigger>
              <SelectContent>
                {bindings.length === 0 ? (
                  <div className="p-2 text-sm text-muted-foreground">
                    No runners bound to your account. Contact admin to set up bindings.
                  </div>
                ) : (
                  bindings.map((binding) => (
                    <SelectItem key={binding.runner_id} value={binding.runner_id}>
                      {binding.runner?.display_name || 'Unknown Runner'}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleAssignRunner} 
              disabled={!selectedRunner || bulkUpdateOrders.isPending}
            >
              {bulkUpdateOrders.isPending ? 'Assigning...' : 'Assign Runner'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
