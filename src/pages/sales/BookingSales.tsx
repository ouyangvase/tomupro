import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { StatusBadge } from '@/components/StatusBadge';
import { useOrders, useUpdateOrder, useBulkUpdateOrders } from '@/hooks/useOrders';
import { useCancelOrders } from '@/hooks/useCancelOrder';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { Plus, AlertTriangle, Clock } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { OrderEditor } from '@/components/orders/OrderEditor';
import { CancelOrderDialog } from '@/components/orders/CancelOrderDialog';
import { ImportOrdersDialog } from '@/components/orders/ImportOrdersDialog';
import { RescheduleOrderDialog } from '@/components/sales/RescheduleOrderDialog';
import { exportOrderLines, exportSelectedOrderLines } from '@/lib/csv';
import { formatBND } from '@/lib/currency';
import { formatOrderItemsDisplay } from '@/lib/orderItemsDisplay';
import { calculateReminderState, getReminderBadgeProps } from '@/lib/reminders';
import type { Order } from '@/types/database';
import { useToast } from '@/hooks/use-toast';

export default function BookingSales() {
  const { profile, role } = useAuth();
  const { toast } = useToast();
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [rescheduleOrder, setRescheduleOrder] = useState<Order | null>(null);

  const { data: orders = [], isLoading } = useOrders({ 
    status: 'BOOKING',
    salespersonId: role === 'salesperson' ? profile?.id : undefined 
  });
  
  const updateOrder = useUpdateOrder();
  const bulkUpdateOrders = useBulkUpdateOrders();
  const cancelOrders = useCancelOrders();

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
      key: 'order_code', 
      header: 'Order Ref', 
      sortable: true,
      render: (o) => <span className="font-mono text-sm">{o.order_code}</span>
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
      key: 'address', 
      header: 'Address', 
      render: (o) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-sm truncate max-w-[200px] block cursor-help">
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
      key: 'items_summary', 
      header: 'Items', 
      render: (o) => {
        const { displayText, fullText, hasError, errorMessage } = formatOrderItemsDisplay(o.order_items);
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`text-sm cursor-help ${hasError ? 'text-destructive' : ''}`}>
                {hasError && <AlertTriangle className="h-3 w-3 inline mr-1" />}
                <span className="font-medium">{displayText}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-[400px]">
              <p className="whitespace-pre-wrap">{hasError ? errorMessage : fullText}</p>
            </TooltipContent>
          </Tooltip>
        );
      }
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
      key: 'next_delivery_date',
      header: 'Next Schedule',
      width: '160px',
      sortable: true,
      render: (o) => {
        const isAutoReschedule = o.operational_status === 'BOOKING_AUTO_RESCHEDULE';
        if (!o.next_delivery_date) {
          return (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={(e) => {
                e.stopPropagation();
                setRescheduleOrder(o);
                setRescheduleDialogOpen(true);
              }}
            >
              <Clock className="h-3 w-3 mr-1" />
              Schedule
            </Button>
          );
        }
        return (
          <div className="flex items-center gap-1">
            {isAutoReschedule && (
              <Badge variant="secondary" className="text-xs px-1">
                Auto
              </Badge>
            )}
            <span className="text-sm text-muted-foreground">
              {format(new Date(o.next_delivery_date), 'dd MMM')}
            </span>
          </div>
        );
      }
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
    cancelOrders.mutate({
      orderIds: selectedRows,
      cancelReason: reason,
      cancelNotes: notes,
    }, {
      onSuccess: () => {
        setCancelDialogOpen(false);
        setSelectedRows([]);
      }
    });
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

  const handleExportSelected = () => {
    if (selectedRows.length === 0) {
      toast({ title: 'Please select at least 1 order to export', variant: 'destructive' });
      return;
    }
    exportSelectedOrderLines(orders, selectedRows, 'booking_orders_selected');
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
                    {selectedRows.length === 1 && (
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => {
                          const order = orders.find(o => o.id === selectedRows[0]);
                          if (order) {
                            setRescheduleOrder(order);
                            setRescheduleDialogOpen(true);
                          }
                        }}
                      >
                        <Clock className="h-3 w-3 mr-1" />
                        Reschedule
                      </Button>
                    )}
                    <Button size="sm" variant="outline" onClick={handleExportSelected}>
                      Export Selected
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
        loading={cancelOrders.isPending}
      />

      <ImportOrdersDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
      />

      <RescheduleOrderDialog
        open={rescheduleDialogOpen}
        onOpenChange={setRescheduleDialogOpen}
        order={rescheduleOrder}
      />
    </AppLayout>
  );
}
