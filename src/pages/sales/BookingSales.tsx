import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { StatusBadge } from '@/components/StatusBadge';
import { useOrders, useUpdateOrder, useBulkUpdateOrders } from '@/hooks/useOrders';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Plus, AlertCircle, Lock } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { OrderEditor } from '@/components/orders/OrderEditor';
import { CancelOrderDialog } from '@/components/orders/CancelOrderDialog';
import { ImportOrdersDialog } from '@/components/orders/ImportOrdersDialog';
import { exportOrderLines } from '@/lib/csv';
import { calculateReminderState, getReminderBadgeProps } from '@/lib/reminders';
import type { Order } from '@/types/database';

export default function BookingSales() {
  const { profile, role } = useAuth();
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const { data: orders = [], isLoading } = useOrders({ 
    status: 'BOOKING',
    salespersonId: role === 'salesperson' ? profile?.id : undefined 
  });
  
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
    { 
      key: 'customer_name', 
      header: 'Customer', 
      sortable: true,
      editable: isEditable,
    },
    { 
      key: 'phone', 
      header: 'Phone',
      editable: isEditable,
    },
    { 
      key: 'area', 
      header: 'Area', 
      sortable: true,
      editable: isEditable,
      filterable: true, 
      filterOptions: [...new Set(orders.map(o => o.area).filter(Boolean))].map(a => ({ label: a!, value: a! })) 
    },
    { 
      key: 'channel', 
      header: 'Channel', 
      filterable: true,
      editable: isEditable, 
      filterOptions: [...new Set(orders.map(o => o.channel).filter(Boolean))].map(c => ({ label: c!, value: c! })) 
    },
    { 
      key: 'expected_pickup_date', 
      header: 'Expected', 
      sortable: true,
      width: '100px',
      render: (o) => o.expected_pickup_date ? format(new Date(o.expected_pickup_date), 'MMM dd') : '—' 
    },
    { 
      key: 'items_summary', 
      header: 'Items', 
      render: (o) => {
        const itemCount = o.order_items?.length || 0;
        return (
          <div className="text-sm">
            <span className="font-medium">{itemCount} SKU</span>
            <span className="text-muted-foreground"> · {o.total_qty} units · ${Number(o.total_amount).toFixed(0)}</span>
          </div>
        );
      }
    },
    { 
      key: 'payment_method', 
      header: 'Payment', 
      width: '80px',
      render: (o) => <Badge variant="outline">{o.payment_method}</Badge> 
    },
    { 
      key: 'reminder_state', 
      header: 'Reminder', 
      width: '100px',
      render: (o) => {
        const state = calculateReminderState(o);
        const props = getReminderBadgeProps(state);
        if (!props) return <span className="text-muted-foreground text-sm">—</span>;
        return (
          <Badge variant={props.variant} className="flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {props.text}
          </Badge>
        );
      }
    },
    { 
      key: 'status', 
      header: 'Status', 
      width: '100px',
      render: (o) => <StatusBadge status={o.status} type="order" /> 
    },
  ];

  const handleRowClick = (order: Order) => {
    if (!isEditable) return;
    setEditingOrder(order);
    setEditorOpen(true);
  };

  const handleCellEdit = (id: string, field: string, value: unknown) => {
    updateOrder.mutate({ id, [field]: value } as any);
  };

  const handleConvertToReady = () => {
    bulkUpdateOrders.mutate({
      ids: selectedRows,
      updates: { status: 'READY' },
    });
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
    exportOrderLines(orders, 'booking_orders');
  };

  const handleCreateNew = () => {
    setEditingOrder(null);
    setEditorOpen(true);
  };

  return (
    <AppLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Booking Sales</h1>
            <p className="text-muted-foreground">Orders pending pickup confirmation</p>
          </div>
          {isEditable && (
            <Button onClick={handleCreateNew}>
              <Plus className="h-4 w-4 mr-2" />
              New Order
            </Button>
          )}
        </div>

        <DataGrid
          data={orders}
          columns={columns}
          keyField="id"
          selectable={isEditable}
          selectedRows={selectedRows}
          onSelectionChange={setSelectedRows}
          onRowClick={handleRowClick}
          onCellEdit={isEditable ? handleCellEdit : undefined}
          loading={isLoading}
          emptyMessage="No booking orders"
          onExport={handleExport}
          onImport={isEditable ? () => setImportDialogOpen(true) : undefined}
          bulkActions={
            isEditable && selectedRows.length > 0 ? (
              (() => {
                const selectedOrdersInfo = orders.filter(o => selectedRows.includes(o.id));
                const hasDeliveredOrders = selectedOrdersInfo.some(o => o.runner_status === 'DELIVERED');
                const isAdmin = role === 'admin';
                const canCancel = isAdmin || !hasDeliveredOrders;
                
                return (
                  <div className="flex gap-2 items-center">
                    <Button size="sm" onClick={handleConvertToReady}>
                      Convert to Ready
                    </Button>
                    <Button size="sm" variant="outline" onClick={handleDispute}>
                      Mark Dispute
                    </Button>
                    {canCancel ? (
                      <Button 
                        size="sm" 
                        variant="destructive" 
                        onClick={() => setCancelDialogOpen(true)}
                      >
                        Cancel
                      </Button>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span>
                            <Button 
                              size="sm" 
                              variant="destructive" 
                              disabled
                            >
                              Cancel
                            </Button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Delivered order is locked. Only admin can modify.</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {hasDeliveredOrders && !isAdmin && (
                      <Badge variant="secondary" className="ml-2">
                        Selection includes delivered orders
                      </Badge>
                    )}
                  </div>
                );
              })()
            ) : undefined
          }
        />
      </div>

      <OrderEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        order={editingOrder}
        mode={editingOrder ? 'edit' : 'create'}
      />

      <CancelOrderDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        orderCount={selectedRows.length}
        onConfirm={handleCancelConfirm}
        loading={bulkUpdateOrders.isPending}
      />

      <ImportOrdersDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
      />
    </AppLayout>
  );
}
