import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { StatusBadge } from '@/components/StatusBadge';
import { useOrders, useUpdateOrder } from '@/hooks/useOrders';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import type { Order } from '@/types/database';

export default function CancelledSales() {
  const { profile } = useAuth();
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  
  const { data: orders = [], isLoading } = useOrders({ 
    status: 'CANCELLED',
    salespersonId: profile?.role === 'salesperson' ? profile.id : undefined 
  });
  
  const updateOrder = useUpdateOrder();

  const columns: Column<Order>[] = [
    { 
      key: 'order_date', 
      header: 'Date', 
      sortable: true, 
      render: (o) => format(new Date(o.order_date), 'MMM dd, yyyy') 
    },
    { key: 'customer_name', header: 'Customer', sortable: true },
    { key: 'phone', header: 'Phone' },
    { key: 'area', header: 'Area', sortable: true },
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
      key: 'cancel_reason', 
      header: 'Cancel Reason', 
      render: (o) => o.cancel_reason || '—' 
    },
    { 
      key: 'cancel_notes', 
      header: 'Notes', 
      render: (o) => o.cancel_notes || '—' 
    },
    { 
      key: 'status', 
      header: 'Status', 
      render: (o) => <StatusBadge status={o.status} type="order" /> 
    },
  ];

  const handleRestoreToBooking = () => {
    selectedRows.forEach(id => {
      updateOrder.mutate({ 
        id, 
        status: 'BOOKING', 
        cancel_reason: null, 
        cancel_notes: null 
      });
    });
    setSelectedRows([]);
  };

  const handleRestoreToReady = () => {
    selectedRows.forEach(id => {
      updateOrder.mutate({ 
        id, 
        status: 'READY', 
        cancel_reason: null, 
        cancel_notes: null 
      });
    });
    setSelectedRows([]);
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
          selectable
          selectedRows={selectedRows}
          onSelectionChange={setSelectedRows}
          loading={isLoading}
          emptyMessage="No cancelled orders"
          onExport={() => {}}
          bulkActions={
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={handleRestoreToBooking}>
                Restore to Booking
              </Button>
              <Button size="sm" onClick={handleRestoreToReady}>
                Restore to Ready
              </Button>
            </div>
          }
        />
      </div>
    </AppLayout>
  );
}
