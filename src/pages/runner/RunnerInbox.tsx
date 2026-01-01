import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useOrders, useUpdateOrder, useBulkUpdateOrders } from '@/hooks/useOrders';
import { useAuth } from '@/contexts/AuthContext';
import { logAudit } from '@/hooks/useAuditLogs';
import { CreateClaimDialog } from '@/components/runner/CreateClaimDialog';
import { FailedDeliveryDialog } from '@/components/runner/FailedDeliveryDialog';
import { exportOrderLines } from '@/lib/csv';
import type { Order, RunnerStatus, ReconciliationStatus } from '@/types/database';
import { Package, CheckCircle, XCircle, DollarSign, Truck } from 'lucide-react';

const runnerStatusColors: Record<RunnerStatus, string> = {
  UNASSIGNED: 'bg-muted text-muted-foreground',
  ASSIGNED: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  TAKEN: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  DELIVERED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  FAILED_DELIVERY: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

const reconciliationColors: Record<ReconciliationStatus, string> = {
  NOT_CLAIMED: 'bg-muted text-muted-foreground',
  CLAIMED: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  SP_ACK_PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  ADMIN_ACK_PENDING: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  SETTLED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  DISPUTE: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
};

export default function RunnerInbox() {
  const { user } = useAuth();
  const { data: orders, isLoading } = useOrders({ runnerId: user?.id });
  const updateOrder = useUpdateOrder();

  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [failedDialogOpen, setFailedDialogOpen] = useState(false);
  
  const bulkUpdateOrders = useBulkUpdateOrders();

  const handleBulkTake = () => {
    bulkUpdateOrders.mutate({
      ids: selectedRows,
      updates: { runner_status: 'TAKEN' },
    });
    setSelectedRows([]);
  };

  const handleExport = () => {
    exportOrderLines(orders || [], 'runner_inbox');
  };

  const handleTakeJob = async (order: Order) => {
    const beforeStatus = order.runner_status;
    await updateOrder.mutateAsync({
      id: order.id,
      runner_status: 'TAKEN',
    });
    await logAudit({
      entity_type: 'order',
      entity_id: order.id,
      action: 'JOB_TAKEN',
      before_json: { runner_status: beforeStatus },
      after_json: { runner_status: 'TAKEN' },
    });
  };

  const handleMarkDelivered = async (order: Order) => {
    const beforeStatus = order.runner_status;
    await updateOrder.mutateAsync({
      id: order.id,
      runner_status: 'DELIVERED',
      delivered_at: new Date().toISOString(),
    });
    await logAudit({
      entity_type: 'order',
      entity_id: order.id,
      action: 'ORDER_DELIVERED',
      before_json: { runner_status: beforeStatus },
      after_json: { runner_status: 'DELIVERED', delivered_at: new Date().toISOString() },
    });
    // TODO: Create notification for salesperson
  };

  const handleOpenFailedDialog = (order: Order) => {
    setSelectedOrder(order);
    setFailedDialogOpen(true);
  };

  const handleOpenClaimDialog = (order: Order) => {
    setSelectedOrder(order);
    setClaimDialogOpen(true);
  };

  const columns: Column<Order>[] = [
    {
      key: 'order_date',
      header: 'Date',
      sortable: true,
      render: (order) => new Date(order.order_date).toLocaleDateString(),
    },
    {
      key: 'customer_name',
      header: 'Customer',
      sortable: true,
      filterable: true,
    },
    {
      key: 'address',
      header: 'Address',
      render: (order) => (
        <span className="text-sm">{order.address}</span>
      ),
    },
    {
      key: 'area',
      header: 'Area',
      sortable: true,
      filterable: true,
    },
    {
      key: 'total_amount',
      header: 'Amount',
      sortable: true,
      render: (order) => order.total_amount.toLocaleString(),
    },
    {
      key: 'payment_method',
      header: 'Payment',
      filterable: true,
    },
    {
      key: 'runner_status',
      header: 'Status',
      filterable: true,
      render: (order) => (
        <Badge className={runnerStatusColors[order.runner_status]}>
          {order.runner_status.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'reconciliation_status',
      header: 'Reconciliation',
      filterable: true,
      render: (order) => (
        <Badge className={reconciliationColors[order.reconciliation_status]}>
          {order.reconciliation_status.replace('_', ' ')}
        </Badge>
      ),
    },
    {
      key: 'salesperson',
      header: 'Salesperson',
      render: (order) => order.salesperson?.display_name || '-',
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (order) => (
        <div className="flex gap-1">
          {order.runner_status === 'ASSIGNED' && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => {
                e.stopPropagation();
                handleTakeJob(order);
              }}
            >
              <Truck className="h-4 w-4 mr-1" />
              Take Job
            </Button>
          )}
          {order.runner_status === 'TAKEN' && (
            <>
              <Button
                size="sm"
                variant="default"
                onClick={(e) => {
                  e.stopPropagation();
                  handleMarkDelivered(order);
                }}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                Delivered
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenFailedDialog(order);
                }}
              >
                <XCircle className="h-4 w-4 mr-1" />
                Failed
              </Button>
            </>
          )}
          {order.runner_status === 'DELIVERED' && order.reconciliation_status === 'NOT_CLAIMED' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenClaimDialog(order);
              }}
            >
              <DollarSign className="h-4 w-4 mr-1" />
              Claim
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Package className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Runner Inbox</h1>
            <p className="text-muted-foreground">Manage your assigned deliveries</p>
          </div>
        </div>

        <DataGrid
          data={orders || []}
          columns={columns}
          loading={isLoading}
          keyField="id"
          selectable
          selectedRows={selectedRows}
          onSelectionChange={setSelectedRows}
          onExport={handleExport}
          bulkActions={
            selectedRows.length > 0 ? (
              <Button size="sm" onClick={handleBulkTake}>
                <Truck className="h-4 w-4 mr-2" />
                Take Jobs ({selectedRows.length})
              </Button>
            ) : undefined
          }
        />
      </div>

      <CreateClaimDialog
        order={selectedOrder}
        open={claimDialogOpen}
        onOpenChange={setClaimDialogOpen}
      />

      <FailedDeliveryDialog
        order={selectedOrder}
        open={failedDialogOpen}
        onOpenChange={setFailedDialogOpen}
      />
    </AppLayout>
  );
}
