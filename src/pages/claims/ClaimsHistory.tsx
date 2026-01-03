import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, ExternalLink } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { StatusBadge } from '@/components/StatusBadge';
import { useAuth } from '@/contexts/AuthContext';
import { useRunners } from '@/hooks/useUserDirectory';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { formatBND } from '@/lib/currency';
import type { ReconciliationStatus, OrderStatus, ClaimMethod } from '@/types/database';

interface ClaimWithDetails {
  id: string;
  created_at: string;
  amount: number;
  method: ClaimMethod | null;
  note: string | null;
  proof_url: string | null;
  order_id: string;
  customer_name: string;
  phone: string;
  runner_id: string | null;
  runner_name: string | null;
  order_status: OrderStatus;
  reconciliation_status: ReconciliationStatus;
}

function useSalespersonClaims(filters: {
  dateFrom?: Date;
  dateTo?: Date;
  runnerId?: string;
  reconciliationStatus?: string;
}) {
  const { user } = useAuth();
  
  return useQuery({
    queryKey: ['salesperson-claims', user?.id, filters],
    queryFn: async () => {
      if (!user) return [];
      
      // First get orders for this salesperson
      let ordersQuery = supabase
        .from('orders')
        .select('id, customer_name, phone, runner_id, status, reconciliation_status')
        .eq('salesperson_id', user.id);
      
      if (filters.runnerId && filters.runnerId !== '__all__') {
        ordersQuery = ordersQuery.eq('runner_id', filters.runnerId);
      }
      if (filters.reconciliationStatus && filters.reconciliationStatus !== '__all__') {
        ordersQuery = ordersQuery.eq('reconciliation_status', filters.reconciliationStatus as ReconciliationStatus);
      }
      
      const { data: orders, error: ordersError } = await ordersQuery;
      if (ordersError) throw ordersError;
      if (!orders || orders.length === 0) return [];
      
      const orderIds = orders.map(o => o.id);
      const orderMap = new Map(orders.map(o => [o.id, o]));
      
      // Get claims for these orders
      let claimsQuery = supabase
        .from('claims')
        .select('*')
        .in('order_id', orderIds)
        .order('created_at', { ascending: false });
      
      if (filters.dateFrom) {
        claimsQuery = claimsQuery.gte('created_at', filters.dateFrom.toISOString());
      }
      if (filters.dateTo) {
        const endOfDay = new Date(filters.dateTo);
        endOfDay.setHours(23, 59, 59, 999);
        claimsQuery = claimsQuery.lte('created_at', endOfDay.toISOString());
      }
      
      const { data: claims, error: claimsError } = await claimsQuery;
      if (claimsError) throw claimsError;
      
      // Get runner names
      const runnerIds = [...new Set(orders.filter(o => o.runner_id).map(o => o.runner_id!))];
      const { data: runners } = await supabase
        .from('user_directory')
        .select('id, display_name')
        .in('id', runnerIds.length > 0 ? runnerIds : ['__none__']);
      
      const runnerMap = new Map(runners?.map(r => [r.id, r.display_name]) || []);
      
      // Combine data
      return (claims || []).map(claim => {
        const order = orderMap.get(claim.order_id);
        return {
          id: claim.id,
          created_at: claim.created_at,
          amount: Number(claim.amount),
          method: claim.method,
          note: claim.note,
          proof_url: claim.proof_url,
          order_id: claim.order_id,
          customer_name: order?.customer_name || '',
          phone: order?.phone || '',
          runner_id: order?.runner_id || null,
          runner_name: order?.runner_id ? runnerMap.get(order.runner_id) || null : null,
          order_status: order?.status as OrderStatus,
          reconciliation_status: order?.reconciliation_status as ReconciliationStatus,
        } as ClaimWithDetails;
      });
    },
    enabled: !!user,
  });
}

export default function ClaimsHistory() {
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [runnerId, setRunnerId] = useState<string>('');
  const [reconciliationStatus, setReconciliationStatus] = useState<string>('');
  
  const { data: runners = [] } = useRunners();
  const { data: claims = [], isLoading } = useSalespersonClaims({
    dateFrom,
    dateTo,
    runnerId: runnerId || undefined,
    reconciliationStatus: reconciliationStatus || undefined,
  });
  
  const statusOptions = useMemo(() => [
    { value: 'NOT_CLAIMED', label: 'Not Claimed' },
    { value: 'CLAIMED', label: 'Claimed' },
    { value: 'SP_ACK_PENDING', label: 'SP Ack Pending' },
    { value: 'ADMIN_ACK_PENDING', label: 'Admin Ack Pending' },
    { value: 'DISPUTE', label: 'Dispute' },
    { value: 'SETTLED', label: 'Settled' },
  ], []);
  
  const columns: Column<ClaimWithDetails>[] = [
    {
      key: 'created_at',
      header: 'Claim Date',
      sortable: true,
      render: (claim) => format(new Date(claim.created_at), 'MMM dd, yyyy HH:mm'),
    },
    {
      key: 'customer_name',
      header: 'Customer',
      sortable: true,
      render: (claim) => (
        <div>
          <div className="font-medium">{claim.customer_name}</div>
          <div className="text-xs text-muted-foreground">{claim.phone}</div>
        </div>
      ),
    },
    {
      key: 'runner_name',
      header: 'Runner',
      sortable: true,
      render: (claim) => claim.runner_name || '-',
    },
    {
      key: 'amount',
      header: 'Amount (BND)',
      sortable: true,
      render: (claim) => formatBND(claim.amount),
    },
    {
      key: 'method',
      header: 'Method',
      sortable: true,
      render: (claim) => claim.method || '-',
    },
    {
      key: 'note',
      header: 'Note',
      render: (claim) => (
        <span className="truncate max-w-[150px] block" title={claim.note || ''}>
          {claim.note || '-'}
        </span>
      ),
    },
    {
      key: 'proof_url',
      header: 'Proof',
      render: (claim) => claim.proof_url ? (
        <a 
          href={claim.proof_url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-primary hover:underline inline-flex items-center gap-1"
        >
          View <ExternalLink className="h-3 w-3" />
        </a>
      ) : '-',
    },
    {
      key: 'order_status',
      header: 'Order Status',
      render: (claim) => <StatusBadge status={claim.order_status} type="order" />,
    },
    {
      key: 'reconciliation_status',
      header: 'Reconciliation',
      render: (claim) => <StatusBadge status={claim.reconciliation_status} type="reconciliation" />,
    },
  ];
  
  const clearFilters = () => {
    setDateFrom(undefined);
    setDateTo(undefined);
    setRunnerId('');
    setReconciliationStatus('');
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Claims History</h1>
          <p className="text-muted-foreground">View all claims for your orders</p>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">From:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[140px] justify-start text-left font-normal",
                    !dateFrom && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateFrom ? format(dateFrom, "MMM dd, yyyy") : "Start date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateFrom}
                  onSelect={setDateFrom}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">To:</span>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-[140px] justify-start text-left font-normal",
                    !dateTo && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateTo ? format(dateTo, "MMM dd, yyyy") : "End date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={dateTo}
                  onSelect={setDateTo}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          
          <Select value={runnerId} onValueChange={setRunnerId}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="All Runners" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Runners</SelectItem>
              {runners.map((runner) => (
                <SelectItem key={runner.id} value={runner.id}>
                  {runner.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Select value={reconciliationStatus} onValueChange={setReconciliationStatus}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Statuses</SelectItem>
              {statusOptions.map((status) => (
                <SelectItem key={status.value} value={status.value}>
                  {status.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear Filters
          </Button>
        </div>

        {/* Data Grid */}
        <DataGrid
          data={claims}
          columns={columns}
          keyField="id"
          loading={isLoading}
        />
        
        {/* Summary */}
        <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg">
          <div className="text-sm text-muted-foreground">
            Total Claims: <span className="font-medium text-foreground">{claims.length}</span>
          </div>
          <div className="text-sm text-muted-foreground">
            Total Amount: <span className="font-medium text-foreground">
              {formatBND(claims.reduce((sum, c) => sum + c.amount, 0))}
            </span>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
