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
import type { Order } from '@/types/database';

export default function ReadySales() {
  const { profile } = useAuth();
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedRunner, setSelectedRunner] = useState<string>('');
  
  const { data: orders = [], isLoading } = useOrders({ 
    status: 'READY',
    salespersonId: profile?.role === 'salesperson' ? profile.id : undefined 
  });
  
  const { data: bindings = [] } = useBindings(profile?.id);
  const updateOrder = useUpdateOrder();
  const bulkUpdateOrders = useBulkUpdateOrders();

  const columns: Column<Order>[] = [
    { 
      key: 'order_date', 
      header: 'Date', 
      sortable: true, 
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
      render: (o) => <Badge variant="secondary">{o.total_qty}</Badge> 
    },
    { 
      key: 'total_amount', 
      header: 'Amount', 
      sortable: true, 
      render: (o) => `$${Number(o.total_amount).toFixed(2)}` 
    },
    { 
      key: 'payment_method', 
      header: 'Payment', 
      render: (o) => <Badge variant="outline">{o.payment_method}</Badge> 
    },
    { 
      key: 'runner_id', 
      header: 'Runner', 
      filterable: true,
      filterOptions: bindings.map(b => ({ label: b.runner?.display_name || 'Unknown', value: b.runner_id })),
      render: (o) => {
        if (!o.runner) return <span className="text-muted-foreground">—</span>;
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
      header: 'Delivery Status', 
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

  const handleCancel = () => {
    selectedRows.forEach(id => {
      updateOrder.mutate({ id, status: 'CANCELLED', cancel_reason: 'Cancelled by user' });
    });
    setSelectedRows([]);
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
          selectable
          selectedRows={selectedRows}
          onSelectionChange={setSelectedRows}
          loading={isLoading}
          emptyMessage="No ready orders"
          onExport={() => {}}
          bulkActions={
            <div className="flex gap-2">
              <Button 
                size="sm" 
                onClick={() => setAssignDialogOpen(true)}
                disabled={selectedRows.length === 0}
              >
                <UserCheck className="h-4 w-4 mr-2" />
                Assign Runner
              </Button>
              <Button size="sm" variant="destructive" onClick={handleCancel}>
                Cancel
              </Button>
            </div>
          }
        />
      </div>

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
