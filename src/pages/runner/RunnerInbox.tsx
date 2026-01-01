import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useOrders, useBulkUpdateOrders } from '@/hooks/useOrders';
import { useAuth } from '@/contexts/AuthContext';
import { logAudit } from '@/hooks/useAuditLogs';
import { CreateClaimDialog } from '@/components/runner/CreateClaimDialog';
import { FailedDeliveryDialog } from '@/components/runner/FailedDeliveryDialog';
import { exportOrderLines } from '@/lib/csv';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import type { Order, RunnerStatus, ReconciliationStatus } from '@/types/database';
import { Package, CheckCircle, XCircle, DollarSign, Truck, Loader2 } from 'lucide-react';

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

const runnerStatusOptions = [
  { label: 'Assigned', value: 'ASSIGNED' },
  { label: 'Taken', value: 'TAKEN' },
  { label: 'Delivered', value: 'DELIVERED' },
  { label: 'Failed Delivery', value: 'FAILED_DELIVERY' },
];

export default function RunnerInbox() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: orders, isLoading } = useOrders({ runnerId: user?.id });

  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [failedDialogOpen, setFailedDialogOpen] = useState(false);
  const [processingDelivery, setProcessingDelivery] = useState<string | null>(null);
  
  const bulkUpdateOrders = useBulkUpdateOrders();

  // Extract unique areas for filter dropdown
  const areaOptions = useMemo(() => {
    if (!orders) return [];
    const uniqueAreas = [...new Set(orders.map(o => o.area).filter(Boolean))];
    return uniqueAreas.sort().map(area => ({ label: area as string, value: area as string }));
  }, [orders]);

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
    try {
      const { error } = await supabase
        .from('orders')
        .update({ runner_status: 'TAKEN' })
        .eq('id', order.id);
      
      if (error) throw error;
      
      await logAudit({
        entity_type: 'order',
        entity_id: order.id,
        action: 'JOB_TAKEN',
        before_json: { runner_status: beforeStatus },
        after_json: { runner_status: 'TAKEN' },
      });
      
      queryClient.invalidateQueries({ queryKey: ['orders'] });
      toast({ title: 'Job taken successfully' });
    } catch (error) {
      console.error('Error taking job:', error);
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to take job' });
    }
  };

  const handleMarkDelivered = async (order: Order) => {
    if (processingDelivery) return;
    
    setProcessingDelivery(order.id);
    
    try {
      const { data, error } = await supabase.functions.invoke('process-delivery', {
        body: { orderId: order.id, runnerId: user?.id },
      });

      if (error) {
        console.error('Edge function error:', error);
        toast({ 
          variant: 'destructive', 
          title: 'Delivery Error', 
          description: error.message || 'Failed to process delivery' 
        });
        return;
      }

      if (data.success) {
        toast({ 
          title: data.alreadyProcessed ? 'Already Processed' : 'Delivered',
          description: data.message,
        });
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      } else {
        toast({ 
          variant: 'destructive', 
          title: 'Delivery Blocked', 
          description: data.error || 'Could not complete delivery',
        });
        // Refresh to show updated dispute status
        queryClient.invalidateQueries({ queryKey: ['orders'] });
      }
    } catch (error) {
      console.error('Error processing delivery:', error);
      toast({ 
        variant: 'destructive', 
        title: 'Error', 
        description: 'Failed to process delivery' 
      });
    } finally {
      setProcessingDelivery(null);
    }
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
      filterOptions: areaOptions,
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
      sortable: true,
      filterable: true,
      filterOptions: runnerStatusOptions,
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
                disabled={processingDelivery === order.id}
                onClick={(e) => {
                  e.stopPropagation();
                  handleMarkDelivered(order);
                }}
              >
                {processingDelivery === order.id ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-1" />
                )}
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
