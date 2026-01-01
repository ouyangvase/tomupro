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

export default function BookingSales() {
  const { profile } = useAuth();
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const { data: orders = [], isLoading } = useOrders({ 
    status: 'BOOKING',
    salespersonId: profile?.role === 'salesperson' ? profile.id : undefined 
  });
  const updateOrder = useUpdateOrder();

  const columns: Column<Order>[] = [
    { key: 'order_date', header: 'Date', sortable: true, render: (o) => format(new Date(o.order_date), 'MMM dd, yyyy') },
    { key: 'customer_name', header: 'Customer', sortable: true },
    { key: 'phone', header: 'Phone' },
    { key: 'area', header: 'Area', sortable: true, filterable: true, filterOptions: [...new Set(orders.map(o => o.area).filter(Boolean))].map(a => ({ label: a!, value: a! })) },
    { key: 'channel', header: 'Channel', filterable: true, filterOptions: [...new Set(orders.map(o => o.channel).filter(Boolean))].map(c => ({ label: c!, value: c! })) },
    { key: 'expected_pickup_date', header: 'Expected Date', sortable: true, editable: true, render: (o) => o.expected_pickup_date ? format(new Date(o.expected_pickup_date), 'MMM dd') : '-' },
    { key: 'total_qty', header: 'Qty', render: (o) => <Badge variant="secondary">{o.total_qty}</Badge> },
    { key: 'total_amount', header: 'Amount', sortable: true, render: (o) => `$${Number(o.total_amount).toFixed(2)}` },
    { key: 'payment_method', header: 'Payment', render: (o) => <Badge variant="outline">{o.payment_method}</Badge> },
    { key: 'status', header: 'Status', render: (o) => <StatusBadge status={o.status} type="order" /> },
  ];

  const handleConvertToReady = () => {
    selectedRows.forEach(id => {
      updateOrder.mutate({ id, status: 'READY' });
    });
    setSelectedRows([]);
  };

  const handleCancel = () => {
    selectedRows.forEach(id => {
      updateOrder.mutate({ id, status: 'CANCELLED', cancel_reason: 'Cancelled by user' });
    });
    setSelectedRows([]);
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Booking Sales</h1>
            <p className="text-muted-foreground">Orders pending pickup confirmation</p>
          </div>
          <Button>+ New Order</Button>
        </div>

        <DataGrid
          data={orders}
          columns={columns}
          keyField="id"
          selectable
          selectedRows={selectedRows}
          onSelectionChange={setSelectedRows}
          loading={isLoading}
          emptyMessage="No booking orders"
          onExport={() => {}}
          bulkActions={
            <div className="flex gap-2">
              <Button size="sm" onClick={handleConvertToReady}>Convert to Ready</Button>
              <Button size="sm" variant="destructive" onClick={handleCancel}>Cancel</Button>
            </div>
          }
        />
      </div>
    </AppLayout>
  );
}
