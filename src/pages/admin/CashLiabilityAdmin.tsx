import { useState, useMemo } from 'react';
import { ResponsiveLayout } from '@/components/layout/ResponsiveLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAdminCashLiabilities, useAdminCashLiabilitySummary, useAdminSettlementBatches } from '@/hooks/useCashLiabilities';
import { useUsers } from '@/hooks/useUsers';
import { formatBND } from '@/lib/currency';
import { format, parseISO, subDays } from 'date-fns';
import { Users, Clock, CheckCircle, Search, AlertTriangle, TrendingUp } from 'lucide-react';

export default function CashLiabilityAdmin() {
  const [runnerId, setRunnerId] = useState<string>('all');
  const [status, setStatus] = useState<'OPEN' | 'SETTLED' | 'all'>('all');
  const [startDate, setStartDate] = useState<string>(format(subDays(new Date(), 30), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [search, setSearch] = useState('');

  const { data: summary, isLoading: summaryLoading } = useAdminCashLiabilitySummary();
  const { data: liabilities, isLoading: liabilitiesLoading } = useAdminCashLiabilities({
    runnerId: runnerId === 'all' ? undefined : runnerId,
    status,
    startDate,
    endDate,
  });
  const { data: batches, isLoading: batchesLoading } = useAdminSettlementBatches(
    runnerId === 'all' ? undefined : runnerId
  );
  const { data: users } = useUsers();

  const runners = useMemo(() => {
    return users?.filter(u => u.role === 'runner' && u.is_active) || [];
  }, [users]);

  const runnerMap = useMemo(() => {
    const map = new Map<string, string>();
    runners.forEach(r => map.set(r.id, r.display_name));
    return map;
  }, [runners]);

  const filteredLiabilities = useMemo(() => {
    if (!liabilities) return [];
    if (!search) return liabilities;
    const q = search.toLowerCase();
    return liabilities.filter(l => 
      l.order_code.toLowerCase().includes(q) ||
      l.customer_name?.toLowerCase().includes(q)
    );
  }, [liabilities, search]);

  return (
    <ResponsiveLayout>
      <div className="container max-w-6xl mx-auto py-6 px-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Cash Liabilities</h1>
          <p className="text-muted-foreground">Monitor and audit cash held by runners</p>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="border-primary/30">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                Total Outstanding
              </CardDescription>
              <CardTitle className="text-2xl text-primary">
                {summaryLoading ? <Skeleton className="h-8 w-24" /> : formatBND(summary?.totalOutstanding || 0)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {summary?.openCount || 0} orders
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <TrendingUp className="h-4 w-4" />
                Settled Today
              </CardDescription>
              <CardTitle className="text-2xl text-[hsl(var(--status-success))]">
                {summaryLoading ? <Skeleton className="h-8 w-24" /> : formatBND(summary?.settledToday || 0)}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <Users className="h-4 w-4" />
                Runners with Open
              </CardDescription>
              <CardTitle className="text-2xl">
                {summaryLoading ? <Skeleton className="h-8 w-12" /> : summary?.runnersWithOpenLiabilities || 0}
              </CardTitle>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                Open Orders
              </CardDescription>
              <CardTitle className="text-2xl">
                {summaryLoading ? <Skeleton className="h-8 w-12" /> : summary?.openCount || 0}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div className="space-y-1">
                <Label>Runner</Label>
                <Select value={runnerId} onValueChange={setRunnerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Runners" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Runners</SelectItem>
                    {runners.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.display_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="OPEN">Open</SelectItem>
                    <SelectItem value="SETTLED">Settled</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>From Date</Label>
                <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label>To Date</Label>
                <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
              </div>

              <div className="space-y-1">
                <Label>Search</Label>
                <div className="relative">
                  <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input 
                    className="pl-8" 
                    placeholder="Order code..." 
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="liabilities">
          <TabsList>
            <TabsTrigger value="liabilities">Liabilities</TabsTrigger>
            <TabsTrigger value="batches">Settlement Batches</TabsTrigger>
          </TabsList>

          <TabsContent value="liabilities">
            <Card>
              <CardContent className="pt-4">
                {liabilitiesLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : filteredLiabilities.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No liabilities found matching your filters.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Runner</TableHead>
                        <TableHead>Order</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Delivered</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredLiabilities.map((liability) => (
                        <TableRow key={liability.id}>
                          <TableCell>{runnerMap.get(liability.runner_id) || 'Unknown'}</TableCell>
                          <TableCell className="font-medium">{liability.order_code}</TableCell>
                          <TableCell>{liability.customer_name || '-'}</TableCell>
                          <TableCell>{format(parseISO(liability.delivered_at), 'dd MMM HH:mm')}</TableCell>
                          <TableCell>
                            {liability.status === 'OPEN' ? (
                              <Badge variant="outline" className="bg-[hsl(var(--status-warning))]/20 text-[hsl(var(--status-warning))] border-[hsl(var(--status-warning))]/30">
                                <Clock className="h-3 w-3 mr-1" /> Open
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="bg-[hsl(var(--status-success))]/20 text-[hsl(var(--status-success))] border-[hsl(var(--status-success))]/30">
                                <CheckCircle className="h-3 w-3 mr-1" /> Settled
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatBND(Number(liability.cash_amount))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="batches">
            <Card>
              <CardContent className="pt-4">
                {batchesLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                  </div>
                ) : !batches || batches.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No settlement batches found.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Runner</TableHead>
                        <TableHead>Settled At</TableHead>
                        <TableHead>Orders</TableHead>
                        <TableHead>Note</TableHead>
                        <TableHead className="text-right">Total Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {batches.map((batch) => (
                        <TableRow key={batch.id}>
                          <TableCell>{runnerMap.get(batch.runner_id) || 'Unknown'}</TableCell>
                          <TableCell>{format(parseISO(batch.settled_at), 'dd MMM yyyy HH:mm')}</TableCell>
                          <TableCell>{batch.order_count} orders</TableCell>
                          <TableCell className="max-w-xs truncate">{batch.note || '-'}</TableCell>
                          <TableCell className="text-right font-semibold text-[hsl(var(--status-success))]">
                            {formatBND(Number(batch.total_amount))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </ResponsiveLayout>
  );
}
