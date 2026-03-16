import { useState, useMemo, useCallback } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { PageHero } from '@/components/dashboard/PageHero';
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter';
import { usePaginatedOrders } from '@/hooks/usePaginatedOrders';
import { useAuth } from '@/contexts/AuthContext';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { formatBND } from '@/lib/currency';
import { formatOrderItemsDisplay } from '@/lib/orderItemsDisplay';
import type { Order } from '@/types/database';
import { XCircle, RefreshCw, Calendar, AlertTriangle, Ban } from 'lucide-react';
import { WhatsAppPhoneLink } from '@/components/orders/WhatsAppPhoneLink';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { format, parseISO } from 'date-fns';
import capybaraEmpty from '@/assets/capybara-empty.png';

const statusColors: Record<string, string> = {
  FAILED_DELIVERY: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  CANCELLED: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200',
};

export default function RunnerFailedOrders() {
  const { user } = useAuth();
  const { data: userDirectory = [] } = useUserDirectory();
  const [serverSearch, setServerSearch] = useState('');

  // Server-side paginated query for failed/cancelled orders
  const { data: orders, isLoading, isFetching, pagination, setPage, setPageSize, refetch } = usePaginatedOrders({
    runnerId: user?.id,
    runnerStatusIn: ['FAILED_DELIVERY'] as any[],
    searchQuery: serverSearch || undefined,
  }, 50);

  const handleSearchChange = useCallback((q: string) => setServerSearch(q), []);

  // Separate by type from current page data
  const failedDeliveries = useMemo(() => 
    orders.filter(o => o.runner_status === 'FAILED_DELIVERY'),
    [orders]
  );
  
  const cancelledOrders = useMemo(() => 
    orders.filter(o => o.status === 'CANCELLED'),
    [orders]
  );

  // Fetch reasons for display
  const reasonIds = useMemo(() => 
    [...new Set(orders.map(o => o.runner_failed_reason_id).filter(Boolean))],
    [orders]
  );
  
  const { data: reasons = [] } = useQuery({
    queryKey: ['failed-reasons', reasonIds],
    queryFn: async () => {
      if (reasonIds.length === 0) return [];
      const { data } = await supabase
        .from('reasons')
        .select('id, label')
        .in('id', reasonIds);
      return data || [];
    },
    enabled: reasonIds.length > 0,
  });

  const reasonsMap = useMemo(() => {
    const map: Record<string, string> = {};
    reasons.forEach(r => { map[r.id] = r.label; });
    return map;
  }, [reasons]);

  const userMap = useMemo(() => {
    const map: Record<string, string> = {};
    userDirectory.forEach(u => { map[u.id] = u.display_name; });
    return map;
  }, [userDirectory]);

  const columns: Column<Order>[] = [
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
      render: (order) => order.area || '-',
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
      key: 'runner_status',
      header: 'Status',
      render: (order) => {
        const status = order.status === 'CANCELLED' ? 'CANCELLED' : order.runner_status;
        return (
          <Badge className={statusColors[status] || 'bg-muted text-muted-foreground'}>
            {status === 'FAILED_DELIVERY' ? 'Failed Delivery' : status}
          </Badge>
        );
      },
    },
    {
      key: 'runner_failed_reason_id',
      header: 'Reason',
      render: (order) => {
        const reason = order.runner_failed_reason_id ? reasonsMap[order.runner_failed_reason_id] : null;
        return (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="text-sm truncate block max-w-[150px]">
                {reason || order.runner_comment || '-'}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-[300px]">
              <p className="whitespace-pre-wrap">
                {reason && <span className="font-medium">{reason}</span>}
                {reason && order.runner_comment && <br />}
                {order.runner_comment}
              </p>
            </TooltipContent>
          </Tooltip>
        );
      },
    },
    {
      key: 'next_delivery_date',
      header: 'Next Delivery',
      sortable: true,
      render: (order) => {
        if (!order.next_delivery_date) return <span className="text-muted-foreground">-</span>;
        return (
          <span className="text-sm">
            {format(parseISO(order.next_delivery_date), 'dd MMM yyyy')}
          </span>
        );
      },
    },
    {
      key: 'salesperson_id',
      header: 'Salesperson',
      render: (order) => (
        <span className="text-sm">{order.salesperson?.display_name || userMap[order.salesperson_id] || '-'}</span>
      ),
    },
  ];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <XCircle className="h-8 w-8 text-destructive" />
            <div>
              <h1 className="text-2xl font-bold">Failed & Cancelled Orders</h1>
              <p className="text-muted-foreground">Orders that need attention or have been cancelled</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-destructive/30 bg-gradient-to-br from-destructive/5 to-transparent">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <div>
                  <p className="text-2xl font-bold text-destructive">{failedDeliveries.length}</p>
                  <p className="text-xs text-muted-foreground">Failed Deliveries</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Ban className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{cancelledOrders.length}</p>
                  <p className="text-xs text-muted-foreground">Cancelled</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <Calendar className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-2xl font-bold">
                    {orders.filter(o => o.next_delivery_date).length}
                  </p>
                  <p className="text-xs text-muted-foreground">Rescheduled</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <DataGrid
          data={orders}
          columns={columns}
          loading={isLoading}
          keyField="id"
          onSearchChange={handleSearchChange}
          emptyMessage="No failed or cancelled orders"
          serverPagination={{
            enabled: true,
            page: pagination.page,
            pageSize: pagination.pageSize,
            totalCount: pagination.totalCount,
            totalPages: pagination.totalPages,
            onPageChange: setPage,
            onPageSizeChange: setPageSize,
            isFetching,
          }}
        />
      </div>
    </AppLayout>
  );
}
