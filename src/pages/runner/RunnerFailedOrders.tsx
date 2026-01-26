import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { useOrders } from '@/hooks/useOrders';
import { useAuth } from '@/contexts/AuthContext';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatBND } from '@/lib/currency';
import { formatOrderItemsDisplay } from '@/lib/orderItemsDisplay';
import type { Order } from '@/types/database';
import { XCircle, RefreshCw, Calendar, AlertTriangle, Ban } from 'lucide-react';
import { WhatsAppPhoneLink } from '@/components/orders/WhatsAppPhoneLink';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { format, parseISO } from 'date-fns';

const statusColors: Record<string, string> = {
  FAILED_DELIVERY: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  CANCELLED: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

export default function RunnerFailedOrders() {
  const { user } = useAuth();
  const { data: orders, isLoading, refetch } = useOrders({ runnerId: user?.id });
  const { data: userDirectory = [] } = useUserDirectory();

  // Filter to show only failed delivery and cancelled orders
  const failedOrders = useMemo(() => {
    if (!orders) return [];
    return orders.filter(order => {
      const status = order.status as string;
      const runnerStatus = order.runner_status as string;
      
      // Show failed delivery orders
      if (runnerStatus === 'FAILED_DELIVERY') return true;
      
      // Show cancelled orders that were previously assigned to this runner
      if (status === 'CANCELLED') return true;
      
      return false;
    });
  }, [orders]);

  // Separate by type
  const failedDeliveries = useMemo(() => 
    failedOrders.filter(o => o.runner_status === 'FAILED_DELIVERY'),
    [failedOrders]
  );
  
  const cancelledOrders = useMemo(() => 
    failedOrders.filter(o => o.status === 'CANCELLED'),
    [failedOrders]
  );

  // Fetch reasons for display
  const reasonIds = useMemo(() => 
    [...new Set(failedOrders.map(o => o.runner_failed_reason_id).filter(Boolean))],
    [failedOrders]
  );

  const { data: reasons = [] } = useQuery({
    queryKey: ['reasons-batch', reasonIds],
    queryFn: async () => {
      if (reasonIds.length === 0) return [];
      const { data, error } = await supabase
        .from('reasons')
        .select('id, label')
        .in('id', reasonIds);
      if (error) return [];
      return data;
    },
    enabled: reasonIds.length > 0,
  });

  const reasonsMap = useMemo(() => {
    const map: Record<string, string> = {};
    reasons.forEach(r => { map[r.id] = r.label; });
    return map;
  }, [reasons]);

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
      render: (order) => <WhatsAppPhoneLink order={order} />,
    },
    {
      key: 'area',
      header: 'Area',
      sortable: true,
    },
    {
      key: 'address',
      header: 'Address',
      render: (order) => (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-sm truncate max-w-[200px] block cursor-help">
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
      render: (order) => {
        const { displayText, fullText, hasError, errorMessage } = formatOrderItemsDisplay(order.order_items);
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={`text-sm font-medium cursor-help ${hasError ? 'text-destructive' : ''}`}>
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
      header: 'Amount',
      sortable: true,
      render: (order) => <span className="font-medium">{formatBND(order.total_amount)}</span>,
    },
    {
      key: 'status_type',
      header: 'Status',
      render: (order) => {
        const isCancelled = order.status === 'CANCELLED';
        const isFailed = order.runner_status === 'FAILED_DELIVERY';
        
        return (
          <div className="space-y-1">
            {isFailed && (
              <Badge className={statusColors.FAILED_DELIVERY}>
                <XCircle className="h-3 w-3 mr-1" />
                Failed Delivery
              </Badge>
            )}
            {isCancelled && (
              <Badge className={statusColors.CANCELLED}>
                <Ban className="h-3 w-3 mr-1" />
                Cancelled
              </Badge>
            )}
          </div>
        );
      },
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (order) => {
        const isCancelled = order.status === 'CANCELLED';
        
        if (isCancelled && order.cancel_reason) {
          return (
            <div className="text-sm">
              <span className="text-muted-foreground">{order.cancel_reason}</span>
              {order.cancel_notes && (
                <div className="text-xs text-muted-foreground italic mt-0.5">
                  "{order.cancel_notes}"
                </div>
              )}
            </div>
          );
        }
        
        if (order.runner_failed_reason_id) {
          return (
            <div className="text-sm">
              <span className="text-red-600">{reasonsMap[order.runner_failed_reason_id] || '-'}</span>
              {order.runner_comment && (
                <div className="text-xs text-muted-foreground italic mt-0.5">
                  "{order.runner_comment}"
                </div>
              )}
            </div>
          );
        }
        
        return <span className="text-muted-foreground">-</span>;
      },
    },
    {
      key: 'next_delivery_date',
      header: 'Next Date',
      render: (order) => {
        if (!order.next_delivery_date) return <span className="text-muted-foreground">-</span>;
        return (
          <div className="flex items-center gap-1 text-sm">
            <Calendar className="h-3 w-3" />
            {format(parseISO(order.next_delivery_date), 'dd MMM yyyy')}
          </div>
        );
      },
    },
    {
      key: 'salesperson_id',
      header: 'Salesperson',
      render: (order) => order.salesperson?.display_name || '-',
    },
  ];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <XCircle className="h-8 w-8 text-red-500" />
            <div>
              <h1 className="text-2xl font-bold">Failed Orders</h1>
              <p className="text-muted-foreground">Orders that failed delivery or were cancelled</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-orange-200 bg-orange-50 dark:bg-orange-900/10">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-orange-600">{failedOrders.length}</div>
              <div className="text-sm text-muted-foreground">Total Failed/Cancelled</div>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50 dark:bg-red-900/10">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-red-500" />
              <div>
                <div className="text-2xl font-bold text-red-600">{failedDeliveries.length}</div>
                <div className="text-sm text-muted-foreground">Failed Deliveries</div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-gray-200 bg-gray-50 dark:bg-gray-900/10">
            <CardContent className="p-4 flex items-center gap-3">
              <Ban className="h-5 w-5 text-gray-500" />
              <div>
                <div className="text-2xl font-bold text-gray-600">{cancelledOrders.length}</div>
                <div className="text-sm text-muted-foreground">Cancelled</div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Info Banner */}
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-900/10">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="h-5 w-5 text-blue-500 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-blue-700 dark:text-blue-300">These orders require Salesperson action</p>
                <p className="text-blue-600 dark:text-blue-400">
                  Failed orders will be rescheduled or cancelled by the Salesperson. Cancelled orders are final.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Grid */}
        <DataGrid
          data={failedOrders}
          columns={columns}
          keyField="id"
          loading={isLoading}
          selectable={false}
          emptyMessage="No failed or cancelled orders"
        />
      </div>
    </AppLayout>
  );
}
