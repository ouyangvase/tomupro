import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useOrders, useBulkUpdateOrders } from '@/hooks/useOrders';
import { useUserDirectory, useRunners } from '@/hooks/useUserDirectory';
import { OrderFiltersPanel, OrderFilters, applyOrderFilters } from '@/components/filters/OrderFiltersPanel';
import { FailedDeliveryInfo } from '@/components/orders/FailedDeliveryInfo';
import { exportSelectedOrderLines } from '@/lib/csv';
import { useToast } from '@/hooks/use-toast';
import type { Order, RunnerStatus, ReconciliationStatus } from '@/types/database';
import { Inbox, MessageCircle, UserPlus } from 'lucide-react';
import { generateWhatsAppUrl, formatPhoneDisplay } from '@/lib/whatsapp';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

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
  { label: 'Unassigned', value: 'UNASSIGNED' },
  { label: 'Assigned', value: 'ASSIGNED' },
  { label: 'Taken', value: 'TAKEN' },
  { label: 'Delivered', value: 'DELIVERED' },
  { label: 'Failed Delivery', value: 'FAILED_DELIVERY' },
];

const reconciliationStatusOptions = [
  { label: 'Not Claimed', value: 'NOT_CLAIMED' },
  { label: 'SP Pending', value: 'SP_ACK_PENDING' },
  { label: 'Admin Pending', value: 'ADMIN_ACK_PENDING' },
  { label: 'Claimed', value: 'CLAIMED' },
  { label: 'Settled', value: 'SETTLED' },
  { label: 'Dispute', value: 'DISPUTE' },
];

export default function AdminRunnerInbox() {
  const { toast } = useToast();
  const { data: allOrders, isLoading } = useOrders(); // Admin gets all orders
  const { data: userDirectory = [] } = useUserDirectory();
  const { data: runners = [] } = useRunners();
  const bulkUpdateOrders = useBulkUpdateOrders();

  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [panelFilters, setPanelFilters] = useState<OrderFilters>({});
  const [selectedRunnerId, setSelectedRunnerId] = useState<string>('__all__');
  const [bulkAssignRunnerId, setBulkAssignRunnerId] = useState<string>('');

  // Filter to only orders that have runner assignment or are relevant for runner inbox
  const runnerOrders = useMemo(() => {
    if (!allOrders) return [];
    // Include all orders that are in READY status (can be assigned) or already have a runner
    return allOrders.filter(o => 
      o.status === 'READY' && (o.runner_id || o.runner_status !== 'UNASSIGNED' || true)
    );
  }, [allOrders]);

  // Apply runner filter
  const runnerFilteredOrders = useMemo(() => {
    if (!runnerOrders) return [];
    if (selectedRunnerId === '__all__') return runnerOrders;
    if (selectedRunnerId === '__unassigned__') return runnerOrders.filter(o => !o.runner_id);
    return runnerOrders.filter(o => o.runner_id === selectedRunnerId);
  }, [runnerOrders, selectedRunnerId]);

  // Apply panel filters
  const filteredOrders = useMemo(() => {
    return applyOrderFilters(runnerFilteredOrders, panelFilters);
  }, [runnerFilteredOrders, panelFilters]);

  // Extract unique areas for filter dropdown
  const areaOptions = useMemo(() => {
    if (!runnerOrders) return [];
    const uniqueAreas = [...new Set(runnerOrders.map(o => o.area).filter(Boolean))];
    return uniqueAreas.sort().map(area => ({ label: area as string, value: area as string }));
  }, [runnerOrders]);

  // Salesperson filter options
  const salespersonOptions = useMemo(() => {
    const salespersons = userDirectory.filter(u => u.role === 'salesperson');
    return salespersons.map(sp => ({
      label: sp.display_name,
      value: sp.id,
    }));
  }, [userDirectory]);

  const handleExport = () => {
    if (selectedRows.length === 0) {
      toast({ 
        variant: 'destructive', 
        title: 'No orders selected', 
        description: 'Please select at least 1 order to export.' 
      });
      return;
    }
    const success = exportSelectedOrderLines(runnerOrders || [], selectedRows, 'admin_runner_inbox_export');
    if (success) {
      toast({ title: 'Export complete', description: `Exported ${selectedRows.length} order(s)` });
    }
  };

  const handleBulkAssign = () => {
    if (selectedRows.length === 0) {
      toast({ 
        variant: 'destructive', 
        title: 'No orders selected', 
        description: 'Please select at least 1 order to assign.' 
      });
      return;
    }
    if (!bulkAssignRunnerId) {
      toast({ 
        variant: 'destructive', 
        title: 'No runner selected', 
        description: 'Please select a runner to assign orders to.' 
      });
      return;
    }

    bulkUpdateOrders.mutate(
      {
        ids: selectedRows,
        updates: {
          runner_id: bulkAssignRunnerId,
          runner_status: 'ASSIGNED',
        },
      },
      {
        onSuccess: () => {
          const runnerName = runners.find(r => r.id === bulkAssignRunnerId)?.display_name || 'runner';
          toast({ 
            title: 'Orders assigned', 
            description: `Assigned ${selectedRows.length} order(s) to ${runnerName}` 
          });
          setSelectedRows([]);
          setBulkAssignRunnerId('');
        },
      }
    );
  };

  const columns: Column<Order>[] = [
    {
      key: 'order_date',
      header: 'Date',
      sortable: true,
      render: (order) => new Date(order.order_date).toLocaleDateString(),
    },
    {
      key: 'order_code',
      header: 'Order Ref',
      sortable: true,
      render: (order) => <span className="font-mono text-sm">{order.order_code}</span>,
    },
    {
      key: 'customer_name',
      header: 'Customer',
      sortable: true,
      render: (order) => order.customer_name || '-',
    },
    {
      key: 'phone',
      header: 'Phone',
      render: (order) => (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={generateWhatsAppUrl(order)}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1.5 text-green-600 hover:text-green-700 hover:underline font-medium"
              >
                <MessageCircle className="h-4 w-4" />
                {formatPhoneDisplay(order.phone)}
              </a>
            </TooltipTrigger>
            <TooltipContent>
              <p>Chat customer on WhatsApp</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ),
    },
    {
      key: 'area',
      header: 'Area',
      sortable: true,
      filterable: true,
      filterOptions: areaOptions,
      render: (order) => order.area || '-',
    },
    {
      key: 'total_amount',
      header: 'Amount',
      sortable: true,
      render: (order) => <span className="font-medium">${Number(order.total_amount).toFixed(2)}</span>,
    },
    {
      key: 'payment_method',
      header: 'Payment',
      filterable: true,
      render: (order) => <Badge variant="outline">{order.payment_method}</Badge>,
    },
    {
      key: 'runner',
      header: 'Runner',
      sortable: true,
      render: (order) => order.runner?.display_name || <span className="text-muted-foreground">Unassigned</span>,
    },
    {
      key: 'salesperson',
      header: 'Salesperson',
      sortable: true,
      filterable: true,
      filterOptions: salespersonOptions,
      render: (order) => order.salesperson?.display_name || '-',
    },
    {
      key: 'runner_status',
      header: 'Runner Status',
      sortable: true,
      filterable: true,
      filterOptions: runnerStatusOptions,
      render: (order) => (
        <div className="flex items-center gap-2">
          <Badge className={runnerStatusColors[order.runner_status]}>
            {order.runner_status.replace('_', ' ')}
          </Badge>
          {order.runner_status === 'FAILED_DELIVERY' && (
            <FailedDeliveryInfo order={order} compact />
          )}
        </div>
      ),
    },
    {
      key: 'reconciliation_status',
      header: 'Reconciliation',
      filterable: true,
      filterOptions: reconciliationStatusOptions,
      render: (order) => (
        <Badge className={reconciliationColors[order.reconciliation_status]}>
          {order.reconciliation_status.replace(/_/g, ' ')}
        </Badge>
      ),
    },
  ];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Inbox className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Runner Inbox (All)</h1>
            <p className="text-muted-foreground">View all runner assignments across the system</p>
          </div>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Filter Runner:</span>
            <Select value={selectedRunnerId} onValueChange={setSelectedRunnerId}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Runners" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Runners</SelectItem>
                <SelectItem value="__unassigned__">Unassigned Only</SelectItem>
                {runners.map((runner) => (
                  <SelectItem key={runner.id} value={runner.id}>
                    {runner.display_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedRows.length > 0 && (
            <div className="flex items-center gap-2 ml-auto bg-muted/50 px-3 py-2 rounded-lg">
              <span className="text-sm font-medium">{selectedRows.length} selected</span>
              <Select value={bulkAssignRunnerId} onValueChange={setBulkAssignRunnerId}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select runner..." />
                </SelectTrigger>
                <SelectContent>
                  {runners.map((runner) => (
                    <SelectItem key={runner.id} value={runner.id}>
                      {runner.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                onClick={handleBulkAssign} 
                disabled={!bulkAssignRunnerId || bulkUpdateOrders.isPending}
                size="sm"
              >
                <UserPlus className="h-4 w-4 mr-1" />
                Assign
              </Button>
            </div>
          )}
        </div>

        <OrderFiltersPanel
          filters={panelFilters}
          onFiltersChange={setPanelFilters}
          areaOptions={areaOptions}
          salespersonOptions={salespersonOptions}
          showSalespersonFilter={true}
          showOrderStatus={false}
          showRunnerStatus={true}
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
          emptyMessage="No orders found"
        />
      </div>
    </AppLayout>
  );
}
