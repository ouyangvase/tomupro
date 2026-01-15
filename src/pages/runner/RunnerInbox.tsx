import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useOrders, useBulkUpdateOrders } from '@/hooks/useOrders';
import { useAuth } from '@/contexts/AuthContext';
import { logAudit } from '@/hooks/useAuditLogs';
import { CreateClaimDialog } from '@/components/runner/CreateClaimDialog';
import { FailedDeliveryDialog } from '@/components/runner/FailedDeliveryDialog';
import { BulkClaimDialog } from '@/components/runner/BulkClaimDialog';
import { FailedDeliveryInfo } from '@/components/orders/FailedDeliveryInfo';
import { OrderFiltersPanel, OrderFilters, applyOrderFilters } from '@/components/filters/OrderFiltersPanel';
import { useSubmitBulkClaim } from '@/hooks/useClaimBatches';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { useMyDrivers, useAssignOrderToDriver } from '@/hooks/useDrivers';
import { exportSelectedRunnerOrderLines } from '@/lib/csv';
import { formatBND } from '@/lib/currency';
import { formatOrderItemsDisplay } from '@/lib/orderItemsDisplay';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';
import type { Order, RunnerStatus, ReconciliationStatus } from '@/types/database';
import { Package, CheckCircle, XCircle, DollarSign, Truck, Loader2, User } from 'lucide-react';
import { generateWhatsAppUrl, formatPhoneDisplay } from '@/lib/whatsapp';
import { WhatsAppPhoneLink } from '@/components/orders/WhatsAppPhoneLink';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useMarkDeliveredFast } from '@/hooks/useDeliveredOrders';

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

const reconciliationStatusOptions = [
  { label: 'Not Claimed', value: 'NOT_CLAIMED' },
  { label: 'Admin Pending', value: 'ADMIN_ACK_PENDING' },
  { label: 'Claimed', value: 'CLAIMED' },
  { label: 'Dispute', value: 'DISPUTE' },
];

export default function RunnerInbox() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: orders, isLoading } = useOrders({ runnerId: user?.id });
  const { data: userDirectory = [] } = useUserDirectory();
  const { data: myDrivers = [] } = useMyDrivers();
  const assignOrderToDriver = useAssignOrderToDriver();

  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [claimDialogOpen, setClaimDialogOpen] = useState(false);
  const [failedDialogOpen, setFailedDialogOpen] = useState(false);
  const [bulkClaimDialogOpen, setBulkClaimDialogOpen] = useState(false);
  const [panelFilters, setPanelFilters] = useState<OrderFilters>({});
  
  const bulkUpdateOrders = useBulkUpdateOrders();
  const submitBulkClaim = useSubmitBulkClaim();
  const markDeliveredFast = useMarkDeliveredFast();

  // Apply panel filters to orders
  // Runner Inbox should ONLY show orders that:
  // - Are READY status
  // - Are assigned to this runner
  // - Are pending delivery (NOT failed, NOT cancelled)
  // Runner Inbox should ONLY show active orders (not delivered, not failed, not cancelled)
  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    
    // Filter to only show active delivery orders
    const activeOrders = orders.filter(order => {
      const status = order.status as string;
      const runnerStatus = order.runner_status as string;
      
      // Exclude cancelled orders
      if (status === 'CANCELLED') return false;
      
      // Exclude failed delivery orders - they go to Failed Orders page
      if (runnerStatus === 'FAILED_DELIVERY') return false;
      
      // Exclude delivered orders - they go to Delivered Orders page
      if (runnerStatus === 'DELIVERED') return false;
      
      // Include only active orders (UNASSIGNED, ASSIGNED, TAKEN)
      return true;
    });
    
    return applyOrderFilters(activeOrders, panelFilters);
  }, [orders, panelFilters]);

  // Extract unique areas for filter dropdown
  const areaOptions = useMemo(() => {
    if (!orders) return [];
    const uniqueAreas = [...new Set(orders.map(o => o.area).filter(Boolean))];
    return uniqueAreas.sort().map(area => ({ label: area as string, value: area as string }));
  }, [orders]);

  // Salesperson filter options
  const salespersonOptions = useMemo(() => {
    const salespersons = userDirectory.filter(u => u.role === 'salesperson');
    return salespersons.map(sp => ({
      label: `${sp.display_name} (${sp.email})`,
      value: sp.id,
    }));
  }, [userDirectory]);

  // Driver filter options
  const driverOptions = useMemo(() => {
    return myDrivers.map(d => ({
      label: d.driver?.display_name || 'Unknown',
      value: d.driver_id,
    }));
  }, [myDrivers]);

  // Handle driver assignment
  const handleAssignDriver = (orderId: string, driverId: string) => {
    assignOrderToDriver.mutate({ orderId, driverId });
  };

  // Check if selected orders can be bulk claimed
  const canBulkClaim = useMemo(() => {
    if (selectedRows.length === 0) return false;
    return selectedRows.every(id => {
      const order = orders?.find(o => o.id === id);
      return order && 
        order.runner_status === 'DELIVERED' && 
        order.reconciliation_status === 'NOT_CLAIMED';
    });
  }, [selectedRows, orders]);

  // Get orders that can be claimed for the dialog
  const claimableOrders = useMemo(() => {
    return orders?.filter(o => 
      selectedRows.includes(o.id) && 
      o.runner_status === 'DELIVERED' && 
      o.reconciliation_status === 'NOT_CLAIMED'
    ) || [];
  }, [selectedRows, orders]);

  const handleBulkTake = () => {
    bulkUpdateOrders.mutate({
      ids: selectedRows,
      updates: { runner_status: 'TAKEN' },
    });
    setSelectedRows([]);
  };

  const handleOpenBulkClaimDialog = () => {
    setBulkClaimDialogOpen(true);
  };

  const handleBulkClaimSubmit = async (exchangeRate: number, note?: string) => {
    await submitBulkClaim.mutateAsync({ orderIds: selectedRows, note, exchangeRate });
    setSelectedRows([]);
    setBulkClaimDialogOpen(false);
  };

  const handleExport = () => {
    if (selectedRows.length === 0) {
      toast({ 
        variant: 'destructive', 
        title: 'No orders selected', 
        description: 'Please select at least 1 order to export.' 
      });
      return;
    }
    // Runner uses simplified export format with one row per item
    // Use filteredOrders to respect current filters/search
    const success = exportSelectedRunnerOrderLines(filteredOrders || [], selectedRows, 'runner_delivery_list');
    if (success) {
      toast({ title: 'Export complete', description: `Exported ${selectedRows.length} order(s)` });
    }
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
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to take job' });
    }
  };

  // Use optimistic mutation for instant UI feedback
  const handleMarkDelivered = (order: Order) => {
    markDeliveredFast.mutate(order.id);
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
      minWidth: '70px',
      maxWidth: '90px',
      preferredWidth: '5vw',
      render: (order) => (
        <span className="text-xs whitespace-nowrap">
          {new Date(order.order_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
        </span>
      ),
    },
    {
      key: 'order_code',
      header: 'Ref',
      sortable: true,
      minWidth: '70px',
      maxWidth: '100px',
      preferredWidth: '6vw',
      render: (order) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="font-mono text-xs truncate block">{order.order_code}</span>
          </TooltipTrigger>
          <TooltipContent>{order.order_code}</TooltipContent>
        </Tooltip>
      ),
    },
    {
      key: 'customer_name',
      header: 'Customer',
      sortable: true,
      minWidth: '80px',
      maxWidth: '140px',
      preferredWidth: '8vw',
      render: (order) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-xs truncate block">{order.customer_name || '-'}</span>
          </TooltipTrigger>
          <TooltipContent>{order.customer_name || 'No name'}</TooltipContent>
        </Tooltip>
      ),
    },
    {
      key: 'phone',
      header: 'Phone',
      minWidth: '80px',
      maxWidth: '110px',
      preferredWidth: '7vw',
      render: (order) => <WhatsAppPhoneLink order={order} />,
    },
    {
      key: 'area',
      header: 'Area',
      sortable: true,
      filterable: true,
      filterOptions: areaOptions,
      minWidth: '60px',
      maxWidth: '100px',
      preferredWidth: '5vw',
      render: (order) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-xs truncate block">{order.area || '-'}</span>
          </TooltipTrigger>
          <TooltipContent>{order.area || 'No area'}</TooltipContent>
        </Tooltip>
      ),
    },
    {
      key: 'address',
      header: 'Address',
      minWidth: '100px',
      maxWidth: '180px',
      preferredWidth: '10vw',
      render: (order) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-xs truncate block cursor-help">
              {order.address || '-'}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-[400px]">
            <p className="whitespace-pre-wrap">{order.address || 'No address'}</p>
          </TooltipContent>
        </Tooltip>
      ),
    },
    {
      key: 'items_summary',
      header: 'Items',
      minWidth: '80px',
      maxWidth: '150px',
      preferredWidth: '8vw',
      render: (order) => {
        const { displayText, fullText, hasError, errorMessage } = formatOrderItemsDisplay(order.order_items);
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`text-xs font-medium cursor-help truncate block ${hasError ? 'text-destructive' : ''}`}>
                {displayText}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[400px]">
              <p className="whitespace-pre-wrap">{hasError ? errorMessage : fullText}</p>
            </TooltipContent>
          </Tooltip>
        );
      },
    },
    {
      key: 'total_amount',
      header: 'Amt',
      sortable: true,
      minWidth: '60px',
      maxWidth: '90px',
      preferredWidth: '5vw',
      render: (order) => <span className="text-xs font-medium whitespace-nowrap">{formatBND(order.total_amount)}</span>,
    },
    {
      key: 'payment_method',
      header: 'Pay',
      filterable: true,
      minWidth: '50px',
      maxWidth: '70px',
      preferredWidth: '4vw',
      render: (order) => (
        <Badge variant="outline" className="text-[10px] px-1 py-0">
          {String(order.payment_method) === 'CASH' ? 'Cash' : String(order.payment_method) === 'TRANSFER' ? 'TF' : order.payment_method}
        </Badge>
      ),
    },
    {
      key: 'runner_status',
      header: 'Status',
      sortable: true,
      filterable: true,
      filterOptions: runnerStatusOptions,
      minWidth: '80px',
      maxWidth: '130px',
      preferredWidth: '7vw',
      render: (order) => (
        <div className="space-y-0.5">
          <Badge className={cn(runnerStatusColors[order.runner_status], 'text-[10px] px-1 py-0')}>
            {order.runner_status.replace('_', ' ')}
          </Badge>
          {order.runner_status === 'FAILED_DELIVERY' && (
            <FailedDeliveryInfo order={order} compact />
          )}
          {order.next_delivery_date && (
            <div className="text-[10px] text-muted-foreground">
              Next: {new Date(order.next_delivery_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'driver_id',
      header: 'Driver',
      filterable: true,
      filterOptions: driverOptions,
      minWidth: '90px',
      maxWidth: '130px',
      preferredWidth: '7vw',
      render: (order) => (
        <div onClick={(e) => e.stopPropagation()}>
          <Select
            value={order.driver_id || ''}
            onValueChange={(value) => handleAssignDriver(order.id, value)}
            disabled={order.runner_status === 'DELIVERED'}
          >
            <SelectTrigger className="w-full h-7 text-xs px-2">
              <SelectValue placeholder="Assign">
                {order.driver?.display_name ? (
                  <span className="flex items-center gap-1 truncate">
                    <User className="h-3 w-3 flex-shrink-0" />
                    <span className="truncate">{order.driver.display_name}</span>
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">-</span>
                )}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {myDrivers.map((d) => (
                <SelectItem key={d.driver_id} value={d.driver_id}>
                  {d.driver?.display_name || 'Unknown'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ),
    },
    {
      key: 'reconciliation_status',
      header: 'Recon',
      filterable: true,
      filterOptions: reconciliationStatusOptions,
      minWidth: '70px',
      maxWidth: '100px',
      preferredWidth: '5vw',
      render: (order) => (
        <Badge className={cn(reconciliationColors[order.reconciliation_status], 'text-[10px] px-1 py-0 whitespace-nowrap')}>
          {order.reconciliation_status === 'NOT_CLAIMED' ? 'Not Claimed' : 
           order.reconciliation_status === 'ADMIN_ACK_PENDING' ? 'Admin Pend' :
           order.reconciliation_status === 'SP_ACK_PENDING' ? 'SP Pend' :
           order.reconciliation_status.replace(/_/g, ' ')}
        </Badge>
      ),
    },
    {
      key: 'salesperson_id',
      header: 'SP',
      filterable: true,
      filterOptions: salespersonOptions,
      minWidth: '70px',
      maxWidth: '110px',
      preferredWidth: '6vw',
      render: (order) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-xs truncate block">{order.salesperson?.display_name || '-'}</span>
          </TooltipTrigger>
          <TooltipContent>{order.salesperson?.display_name || 'Unknown'}</TooltipContent>
        </Tooltip>
      ),
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
                disabled={markDeliveredFast.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  handleMarkDelivered(order);
                }}
              >
                {markDeliveredFast.isPending ? (
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

        <OrderFiltersPanel
          filters={panelFilters}
          onFiltersChange={setPanelFilters}
          areaOptions={areaOptions}
          salespersonOptions={salespersonOptions}
          driverOptions={driverOptions}
          showSalespersonFilter={true}
          showDriverFilter={true}
          showOrderStatus={false}
          showRunnerStatus={true}
          showDriverStatus={true}
          showReconciliationStatus={true}
        />

        <DataGrid
          data={filteredOrders}
          columns={columns}
          loading={isLoading}
          keyField="id"
          selectable
          selectedRows={selectedRows}
          onSelectionChange={setSelectedRows}
          onExport={handleExport}
          bulkActions={
            selectedRows.length > 0 ? (
              <div className="flex gap-2">
                <Button size="sm" onClick={handleBulkTake}>
                  <Truck className="h-4 w-4 mr-2" />
                  Take Jobs ({selectedRows.length})
                </Button>
                {canBulkClaim && (
                  <Button 
                    size="sm" 
                    variant="secondary"
                    onClick={handleOpenBulkClaimDialog}
                    disabled={submitBulkClaim.isPending}
                  >
                    {submitBulkClaim.isPending ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <DollarSign className="h-4 w-4 mr-2" />
                    )}
                    Claim Selected ({selectedRows.length})
                  </Button>
                )}
              </div>
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

      <BulkClaimDialog
        open={bulkClaimDialogOpen}
        onOpenChange={setBulkClaimDialogOpen}
        orders={claimableOrders}
        onSubmit={handleBulkClaimSubmit}
        isSubmitting={submitBulkClaim.isPending}
      />
    </AppLayout>
  );
}
