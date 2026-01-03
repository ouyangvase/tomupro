import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { CalendarIcon, FileText, TrendingUp, DollarSign, Users, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DateRange } from 'react-day-picker';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface RunnerDeliveryFeesSummary {
  runner_id: string;
  runner_name: string;
  total_orders: number;
  total_gross_amount: number;
  total_delivery_fees: number;
  total_net_amount: number;
}

interface ClaimDetail {
  id: string;
  gross_amount: number;
  delivery_fee: number;
  net_claim_amount: number;
  created_at: string;
  order: {
    id: string;
    order_code: string;
    customer_name: string;
    area: string | null;
    delivered_at: string | null;
    payment_method: string;
  };
}

export default function DeliveryFeesReport() {
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date()),
  });
  const [selectedRunner, setSelectedRunner] = useState<RunnerDeliveryFeesSummary | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const { data: reportData = [], isLoading } = useQuery({
    queryKey: ['delivery-fees-report', dateRange?.from, dateRange?.to],
    queryFn: async () => {
      if (!dateRange?.from || !dateRange?.to) return [];

      const { data: claims, error } = await supabase
        .from('claims')
        .select(`
          id,
          gross_amount,
          delivery_fee,
          net_claim_amount,
          created_at,
          order:orders!inner(
            id,
            runner_id,
            delivered_at
          )
        `)
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());

      if (error) throw error;

      const runnerIds = [...new Set(claims?.map(c => c.order?.runner_id).filter(Boolean) as string[])];
      
      const { data: runners } = await supabase
        .from('user_directory')
        .select('id, display_name')
        .in('id', runnerIds);

      const runnerMap = new Map(runners?.map(r => [r.id, r.display_name]) || []);

      const aggregated = new Map<string, RunnerDeliveryFeesSummary>();

      claims?.forEach(claim => {
        const runnerId = claim.order?.runner_id;
        if (!runnerId) return;

        const existing = aggregated.get(runnerId) || {
          runner_id: runnerId,
          runner_name: runnerMap.get(runnerId) || 'Unknown',
          total_orders: 0,
          total_gross_amount: 0,
          total_delivery_fees: 0,
          total_net_amount: 0,
        };

        existing.total_orders += 1;
        existing.total_gross_amount += Number(claim.gross_amount || 0);
        existing.total_delivery_fees += Number(claim.delivery_fee || 0);
        existing.total_net_amount += Number(claim.net_claim_amount || 0);

        aggregated.set(runnerId, existing);
      });

      return Array.from(aggregated.values()).sort((a, b) => b.total_delivery_fees - a.total_delivery_fees);
    },
    enabled: !!dateRange?.from && !!dateRange?.to,
  });

  // Fetch detailed claims for selected runner
  const { data: runnerClaims = [], isLoading: isLoadingDetails } = useQuery({
    queryKey: ['runner-claims-detail', selectedRunner?.runner_id, dateRange?.from, dateRange?.to],
    queryFn: async () => {
      if (!selectedRunner || !dateRange?.from || !dateRange?.to) return [];

      const { data, error } = await supabase
        .from('claims')
        .select(`
          id,
          gross_amount,
          delivery_fee,
          net_claim_amount,
          created_at,
          order:orders!inner(
            id,
            order_code,
            customer_name,
            area,
            delivered_at,
            payment_method,
            runner_id
          )
        `)
        .eq('order.runner_id', selectedRunner.runner_id)
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString())
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as ClaimDetail[];
    },
    enabled: !!selectedRunner && !!dateRange?.from && !!dateRange?.to,
  });

  const totals = useMemo(() => {
    return reportData.reduce(
      (acc, row) => ({
        orders: acc.orders + row.total_orders,
        gross: acc.gross + row.total_gross_amount,
        fees: acc.fees + row.total_delivery_fees,
        net: acc.net + row.total_net_amount,
      }),
      { orders: 0, gross: 0, fees: 0, net: 0 }
    );
  }, [reportData]);

  const handleRowClick = (row: RunnerDeliveryFeesSummary) => {
    setSelectedRunner(row);
    setDetailsOpen(true);
  };

  const columns: Column<RunnerDeliveryFeesSummary>[] = [
    {
      key: 'runner_name',
      header: 'Runner',
      sortable: true,
      render: (row) => (
        <div className="flex items-center gap-2">
          <span>{row.runner_name}</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      ),
    },
    {
      key: 'total_orders',
      header: 'Orders',
      sortable: true,
      render: (row) => row.total_orders.toLocaleString(),
    },
    {
      key: 'total_gross_amount',
      header: 'Gross Amount',
      sortable: true,
      render: (row) => `RM ${row.total_gross_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    },
    {
      key: 'total_delivery_fees',
      header: 'Delivery Fees',
      sortable: true,
      render: (row) => (
        <span className="font-medium text-primary">
          RM {row.total_delivery_fees.toLocaleString(undefined, { minimumFractionDigits: 2 })}
        </span>
      ),
    },
    {
      key: 'total_net_amount',
      header: 'Net Amount',
      sortable: true,
      render: (row) => `RM ${row.total_net_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`,
    },
    {
      key: 'avg_fee',
      header: 'Avg Fee/Order',
      render: (row) => {
        const avg = row.total_orders > 0 ? row.total_delivery_fees / row.total_orders : 0;
        return `RM ${avg.toFixed(2)}`;
      },
    },
  ];

  const handleQuickSelect = (months: number) => {
    const now = new Date();
    const start = startOfMonth(subMonths(now, months - 1));
    const end = endOfMonth(now);
    setDateRange({ from: start, to: end });
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <FileText className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">Delivery Fees Report</h1>
              <p className="text-muted-foreground">Total delivery fees collected per runner</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handleQuickSelect(1)}>
              This Month
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleQuickSelect(3)}>
              Last 3 Months
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'justify-start text-left font-normal',
                    !dateRange && 'text-muted-foreground'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, 'LLL dd, y')} - {format(dateRange.to, 'LLL dd, y')}
                      </>
                    ) : (
                      format(dateRange.from, 'LLL dd, y')
                    )
                  ) : (
                    <span>Pick a date range</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={2}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Runners</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{reportData.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{totals.orders.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Gross Amount</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                RM {totals.gross.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>
          <Card className="border-primary/50">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Delivery Fees</CardTitle>
              <DollarSign className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-primary">
                RM {totals.fees.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Data Grid */}
        <DataGrid
          data={reportData}
          columns={columns}
          loading={isLoading}
          keyField="runner_id"
          emptyMessage="No delivery fees data for the selected period"
          onExport={() => {}}
          onRowClick={handleRowClick}
        />
      </div>

      {/* Runner Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-5xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Delivery Fees Details - {selectedRunner?.runner_name}</DialogTitle>
            <DialogDescription>
              {dateRange?.from && dateRange?.to && (
                <>
                  {format(dateRange.from, 'LLL dd, y')} - {format(dateRange.to, 'LLL dd, y')}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {/* Runner Summary */}
          {selectedRunner && (
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Orders</p>
                <p className="text-xl font-bold">{selectedRunner.total_orders}</p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Gross Amount</p>
                <p className="text-xl font-bold">RM {selectedRunner.total_gross_amount.toFixed(2)}</p>
              </div>
              <div className="p-3 bg-primary/10 rounded-lg">
                <p className="text-xs text-muted-foreground">Delivery Fees</p>
                <p className="text-xl font-bold text-primary">RM {selectedRunner.total_delivery_fees.toFixed(2)}</p>
              </div>
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">Net Amount</p>
                <p className="text-xl font-bold">RM {selectedRunner.total_net_amount.toFixed(2)}</p>
              </div>
            </div>
          )}

          {/* Orders Table */}
          {isLoadingDetails ? (
            <div className="flex items-center justify-center p-8">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Order</TableHead>
                  <TableHead>Customer</TableHead>
                  <TableHead>Area</TableHead>
                  <TableHead>Payment</TableHead>
                  <TableHead className="text-right">Gross</TableHead>
                  <TableHead className="text-right">Delivery Fee</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runnerClaims.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      No orders found
                    </TableCell>
                  </TableRow>
                ) : (
                  runnerClaims.map((claim) => (
                    <TableRow key={claim.id}>
                      <TableCell className="text-sm">
                        {claim.order?.delivered_at 
                          ? format(new Date(claim.order.delivered_at), 'MMM dd, HH:mm')
                          : format(new Date(claim.created_at), 'MMM dd, HH:mm')
                        }
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        ORD-{claim.order?.order_code}
                      </TableCell>
                      <TableCell>{claim.order?.customer_name}</TableCell>
                      <TableCell>{claim.order?.area || '-'}</TableCell>
                      <TableCell>{claim.order?.payment_method}</TableCell>
                      <TableCell className="text-right font-mono">
                        RM {Number(claim.gross_amount || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-primary font-medium">
                        RM {Number(claim.delivery_fee || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right font-mono font-medium">
                        RM {Number(claim.net_claim_amount || 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
