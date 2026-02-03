import { useState, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { Car, DollarSign, CreditCard, Package } from 'lucide-react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useDriverDeliveriesToday } from '@/hooks/useCashLiabilities';
import { formatBND } from '@/lib/currency';
import { cn } from '@/lib/utils';

export default function RunnerCashDriver() {
  const [driverFilter, setDriverFilter] = useState<string>('all');
  const { data: deliveries, isLoading } = useDriverDeliveriesToday(driverFilter);

  // Calculate summary stats
  const stats = useMemo(() => {
    if (!deliveries) return { totalOrders: 0, cashAmount: 0, transferAmount: 0 };
    
    return deliveries.reduce((acc, order) => {
      const amount = Number(order.total_amount) || 0;
      return {
        totalOrders: acc.totalOrders + 1,
        cashAmount: acc.cashAmount + (order.driver_payment_method === 'CASH' ? amount : 0),
        transferAmount: acc.transferAmount + (order.driver_payment_method === 'TRANSFER' ? amount : 0),
      };
    }, { totalOrders: 0, cashAmount: 0, transferAmount: 0 });
  }, [deliveries]);

  // Get unique drivers for filter
  const uniqueDrivers = useMemo(() => {
    if (!deliveries) return [];
    const driverMap = new Map<string, string>();
    deliveries.forEach(order => {
      if (order.driver_id && order.driver?.display_name) {
        driverMap.set(order.driver_id, order.driver.display_name);
      }
    });
    return Array.from(driverMap.entries()).map(([id, name]) => ({ id, name }));
  }, [deliveries]);

  // Calculate totals for footer
  const totals = useMemo(() => {
    if (!deliveries) return { totalAmount: 0, cashToCollect: 0 };
    return deliveries.reduce((acc, order) => {
      const amount = Number(order.total_amount) || 0;
      return {
        totalAmount: acc.totalAmount + amount,
        cashToCollect: acc.cashToCollect + (order.driver_payment_method === 'CASH' ? amount : 0),
      };
    }, { totalAmount: 0, cashToCollect: 0 });
  }, [deliveries]);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Car className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Cash Driver</h1>
            <p className="text-sm text-muted-foreground">Today's deliveries by driver</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex items-center gap-4">
          <Select value={driverFilter} onValueChange={setDriverFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by driver" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Drivers</SelectItem>
              {uniqueDrivers.map(driver => (
                <SelectItem key={driver.id} value={driver.id}>
                  {driver.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="bg-gradient-to-br from-secondary/50 to-secondary/20 border-border/50">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Orders</CardTitle>
              <Package className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <p className="text-2xl font-bold">{stats.totalOrders}</p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-[hsl(var(--status-warning))]/20 to-[hsl(var(--status-warning))]/5 border-[hsl(var(--status-warning))]/30">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Cash to Collect</CardTitle>
              <DollarSign className="h-4 w-4 text-[hsl(var(--status-warning))]" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-28" />
              ) : (
                <p className="text-2xl font-bold text-[hsl(var(--status-warning))]">
                  {formatBND(stats.cashAmount)}
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-primary/20 to-primary/5 border-primary/30">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Transfer Orders</CardTitle>
              <CreditCard className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-8 w-28" />
              ) : (
                <p className="text-2xl font-bold text-primary">{formatBND(stats.transferAmount)}</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Excel-style Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-secondary/30">
                    <TableHead className="font-bold">Driver</TableHead>
                    <TableHead className="font-bold">Order Code</TableHead>
                    <TableHead className="font-bold">Customer</TableHead>
                    <TableHead className="font-bold">Delivered</TableHead>
                    <TableHead className="font-bold text-right">Total Amount</TableHead>
                    <TableHead className="font-bold text-center">Payment</TableHead>
                    <TableHead className="font-bold text-right">Cash to Collect</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-12" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-6 w-16" /></TableCell>
                        <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                      </TableRow>
                    ))
                  ) : deliveries && deliveries.length > 0 ? (
                    deliveries.map((order) => {
                      const isCash = order.driver_payment_method === 'CASH';
                      const amount = Number(order.total_amount) || 0;
                      
                      return (
                        <TableRow 
                          key={order.id}
                          className={cn(
                            isCash && "bg-[hsl(var(--status-warning))]/10"
                          )}
                        >
                          <TableCell className="font-medium">
                            {order.driver?.display_name || 'Unknown'}
                          </TableCell>
                          <TableCell className="font-mono text-sm">
                            {order.order_code}
                          </TableCell>
                          <TableCell>{order.customer_name || '-'}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {order.driver_delivered_at 
                              ? format(parseISO(order.driver_delivered_at), 'HH:mm')
                              : '-'
                            }
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatBND(amount)}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge 
                              variant={isCash ? "default" : "secondary"}
                              className={cn(
                                isCash 
                                  ? "bg-[hsl(var(--status-warning))] text-[hsl(var(--status-warning-foreground))]" 
                                  : "bg-primary/20 text-primary"
                              )}
                            >
                              {order.driver_payment_method || 'N/A'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            {isCash ? (
                              <span className="font-bold text-[hsl(var(--status-warning))]">
                                {formatBND(amount, false)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">0.00</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  ) : (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No deliveries today
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
                {deliveries && deliveries.length > 0 && (
                  <TableFooter>
                    <TableRow className="bg-secondary/50 font-bold">
                      <TableCell colSpan={4}>TOTAL</TableCell>
                      <TableCell className="text-right">
                        {formatBND(totals.totalAmount)}
                      </TableCell>
                      <TableCell></TableCell>
                      <TableCell className="text-right text-[hsl(var(--status-warning))]">
                        {formatBND(totals.cashToCollect, false)}
                      </TableCell>
                    </TableRow>
                  </TableFooter>
                )}
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
