import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useClaimBatches, useClaimBatchDetails } from '@/hooks/useClaimBatches';
import { useRunners } from '@/hooks/useUserDirectory';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format, parseISO, getYear, getMonth } from 'date-fns';
import { Receipt, Eye, DollarSign, Clock, CheckCircle, AlertCircle, Calculator, ArrowRight } from 'lucide-react';
import type { ClaimBatch, ClaimBatchStatus } from '@/types/database';
import { PageHero } from '@/components/dashboard/PageHero';
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter';
import { formatBND } from '@/lib/currency';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { exportToCSV } from '@/lib/csv';

const statusColors: Record<ClaimBatchStatus, string> = {
  ADMIN_ACK_PENDING: 'bg-[hsl(var(--status-warning)/0.15)] text-[hsl(var(--status-warning))] border-[hsl(var(--status-warning)/0.3)]',
  CLAIMED: 'bg-[hsl(var(--status-success)/0.15)] text-[hsl(var(--status-success))] border-[hsl(var(--status-success)/0.3)]',
};

const months = [
  { value: '0', label: 'January' }, { value: '1', label: 'February' },
  { value: '2', label: 'March' }, { value: '3', label: 'April' },
  { value: '4', label: 'May' }, { value: '5', label: 'June' },
  { value: '6', label: 'July' }, { value: '7', label: 'August' },
  { value: '8', label: 'September' }, { value: '9', label: 'October' },
  { value: '10', label: 'November' }, { value: '11', label: 'December' },
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => ({
  value: String(currentYear - 2 + i),
  label: String(currentYear - 2 + i),
}));

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function ClaimBatchesHistory() {
  const { user, profile } = useAuth();
  const role = profile?.role;
  const isRunner = role === 'runner';

  // Runner: always filter to own batches; Admin: fetch all
  const batchFilters = useMemo(() => {
    if (isRunner && user?.id) return { runnerId: user.id };
    return undefined;
  }, [isRunner, user?.id]);

  const { data: batches = [], isLoading } = useClaimBatches(batchFilters);
  const { data: runners = [] } = useRunners();
  
  const [selectedBatch, setSelectedBatch] = useState<ClaimBatch | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [exchangeRate, setExchangeRate] = useState<string>('3.40');

  // Fetch order details on demand when a batch is selected for viewing
  const { data: batchDetails = [], isLoading: detailsLoading } = useClaimBatchDetails(
    detailsOpen ? selectedBatch?.id : undefined
  );
  
  const [selectedRunnerId, setSelectedRunnerId] = useState<string>('__all__');
  const [selectedStatus, setSelectedStatus] = useState<string>('__all__');
  const [selectedYear, setSelectedYear] = useState<string>('__all__');
  const [selectedMonth, setSelectedMonth] = useState<string>('__all__');

  const filteredBatches = useMemo(() => {
    return batches.filter(batch => {
      if (selectedRunnerId !== '__all__' && batch.runner_id !== selectedRunnerId) return false;
      if (selectedStatus !== '__all__' && batch.status !== selectedStatus) return false;
      if (selectedYear !== '__all__') {
        if (getYear(parseISO(batch.submitted_at)) !== parseInt(selectedYear)) return false;
      }
      if (selectedMonth !== '__all__') {
        if (getMonth(parseISO(batch.submitted_at)) !== parseInt(selectedMonth)) return false;
      }
      return true;
    });
  }, [batches, selectedRunnerId, selectedStatus, selectedYear, selectedMonth]);

  const handleViewDetails = (batch: ClaimBatch) => {
    setSelectedBatch(batch);
    setDetailsOpen(true);
  };

  const handleExportSelected = async () => {
    const selectedBatches = filteredBatches.filter(b => selectedRows.includes(b.id));
    const exportRows: Record<string, unknown>[] = [];

    // Fetch order details for all selected batches
    for (const batch of selectedBatches) {
      const orderIds = (batch.items || []).map((i: any) => i.order_id);
      if (orderIds.length === 0) continue;

      const { data: orders } = await supabase
        .from('orders')
        .select('id, order_code, order_date, customer_name, area, total_amount, payment_method, reconciliation_status, order_items(*, product:products(sku_code, sku_name))')
        .in('id', orderIds);

      for (const order of orders || []) {
        const orderItems = (order as any).order_items || [];
        const itemsStr = orderItems.map((oi: any) => {
          const sku = oi.product?.sku_code || oi.sku_label || '-';
          return `${sku} x ${oi.qty}`;
        }).join('; ');
        const totalQty = orderItems.reduce((sum: number, oi: any) => sum + (oi.qty || 0), 0);
        exportRows.push({
          batch_code: (batch as any).batch_code || '',
          submitted_at: format(parseISO(batch.submitted_at), 'yyyy-MM-dd HH:mm'),
          runner: batch.runner?.display_name || '',
          batch_status: batch.status === 'ADMIN_ACK_PENDING' ? 'Pending' : 'Claimed',
          order_code: order.order_code || '',
          order_date: order.order_date ? format(new Date(order.order_date), 'yyyy-MM-dd') : '',
          customer_name: order.customer_name || '',
          area: order.area || '',
          items: itemsStr,
          total_qty: totalQty,
          amount: Number(order.total_amount || 0),
          payment_method: order.payment_method || '',
          reconciliation_status: order.reconciliation_status?.replace(/_/g, ' ') || '',
          earned: Number(batch.delivery_charges_bnd) || 0,
        });
      }
    }
    exportToCSV(exportRows, [
      { key: 'batch_code', header: 'Batch #' }, { key: 'submitted_at', header: 'Batch Submitted' },
      { key: 'runner', header: 'Runner' }, { key: 'batch_status', header: 'Batch Status' },
      { key: 'order_code', header: 'Order Ref' }, { key: 'order_date', header: 'Order Date' },
      { key: 'customer_name', header: 'Customer' }, { key: 'area', header: 'Area' },
      { key: 'items', header: 'Items (SKU x Qty)' }, { key: 'total_qty', header: 'Total Qty' },
      { key: 'amount', header: 'Amount (BND)' }, { key: 'payment_method', header: 'Payment Method' },
      { key: 'reconciliation_status', header: 'Claim Status' }, { key: 'earned', header: 'Earned (BND)' },
    ], 'claim_batches_orders_export');
  };

  const clearFilters = () => {
    setSelectedRunnerId('__all__');
    setSelectedStatus('__all__');
    setSelectedYear('__all__');
    setSelectedMonth('__all__');
  };

  const stats = useMemo(() => {
    const pending = filteredBatches.filter(b => b.status === 'ADMIN_ACK_PENDING');
    const claimed = filteredBatches.filter(b => b.status === 'CLAIMED');
    return {
      totalBatches: filteredBatches.length,
      pendingCount: pending.length,
      pendingAmount: pending.reduce((sum, b) => sum + Number(b.total_amount), 0),
      claimedCount: claimed.length,
      claimedAmount: claimed.reduce((sum, b) => sum + Number(b.total_amount), 0),
      totalEarned: filteredBatches.reduce((sum, b) => sum + (Number(b.delivery_charges_bnd) || 0), 0),
    };
  }, [filteredBatches]);

  const columns: Column<ClaimBatch>[] = useMemo(() => {
    const cols: Column<ClaimBatch>[] = [
      {
        key: 'batch_code', header: 'Batch #', sortable: true,
        render: (batch) => <span className="font-mono font-medium text-primary">{(batch as any).batch_code || '-'}</span>,
      },
      {
        key: 'submitted_at', header: 'Submitted', sortable: true,
        render: (batch) => (
          <span className="text-sm">{format(parseISO(batch.submitted_at), 'MMM dd, yyyy HH:mm')}</span>
        ),
      },
    ];

    // Only show Runner column for non-runner roles (admin sees all runners)
    if (!isRunner) {
      cols.push({
        key: 'runner', header: 'Runner', sortable: true,
        render: (batch) => {
          const name = batch.runner?.display_name || '-';
          return (
            <div className="flex items-center gap-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="text-xs bg-primary/10 text-primary">{getInitials(name)}</AvatarFallback>
              </Avatar>
              <span className="text-sm font-medium">{name}</span>
            </div>
          );
        },
      });
    }

    cols.push(
      { key: 'items', header: 'Orders', render: (batch) => batch.items?.length || 0 },
      {
        key: 'total_amount', header: 'Total Amount', sortable: true,
        render: (batch) => <span className="font-semibold">{formatBND(Number(batch.total_amount))}</span>,
      },
      {
        key: 'status', header: 'Status', filterable: true,
        render: (batch) => (
          <Badge className={cn("border", statusColors[batch.status])}>
            {batch.status === 'ADMIN_ACK_PENDING' ? 'Pending' : 'Claimed'}
          </Badge>
        ),
      },
      {
        key: 'admin_ack_at', header: 'Acknowledged',
        render: (batch) => batch.admin_ack_at
          ? format(parseISO(batch.admin_ack_at), 'MMM dd, yyyy HH:mm')
          : <span className="text-muted-foreground">-</span>,
      },
      {
        key: 'delivery_charges_bnd', header: 'Earned', sortable: true,
        render: (batch) => {
          const earned = Number(batch.delivery_charges_bnd) || 0;
          return earned > 0
            ? <span className="font-medium text-green-600 dark:text-green-400">{formatBND(earned)}</span>
            : <span className="text-muted-foreground">-</span>;
        },
      },
      {
        key: 'actions', header: 'Actions',
        render: (batch) => (
          <Button size="sm" variant="outline" onClick={() => handleViewDetails(batch)} className="rounded-lg">
            <Eye className="h-4 w-4 mr-1" /> Details
          </Button>
        ),
      },
    );

    return cols;
  }, [isRunner]);

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Hero */}
        <PageHero
          icon={<Receipt className="h-6 w-6 text-primary" />}
          title="Claim Batches History"
          subtitle={isRunner ? "Your claim batch history" : "Complete history of all runner claim batches"}
        />

        {/* Financial Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <Card className="relative overflow-hidden border-border/50">
            <div className="absolute top-0 right-0 w-16 h-16 bg-primary/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <CardContent className="pt-5 pb-4 relative">
              <div className="flex items-center gap-2 mb-1">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                <p className="text-xs font-medium text-muted-foreground">Total Batches</p>
              </div>
              <p className="text-3xl font-bold"><AnimatedCounter value={stats.totalBatches} /></p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-[hsl(var(--status-warning)/0.3)] bg-[hsl(var(--status-warning)/0.03)]">
            <div className="absolute top-0 right-0 w-16 h-16 bg-[hsl(var(--status-warning)/0.1)] rounded-full -translate-y-1/2 translate-x-1/2" />
            <CardContent className="pt-5 pb-4 relative">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-[hsl(var(--status-warning))]" />
                <p className="text-xs font-medium text-muted-foreground">Pending</p>
              </div>
              <p className="text-3xl font-bold text-[hsl(var(--status-warning))]"><AnimatedCounter value={stats.pendingCount} /></p>
              <p className="text-sm text-muted-foreground mt-1">{formatBND(stats.pendingAmount)}</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-[hsl(var(--status-success)/0.3)] bg-[hsl(var(--status-success)/0.03)]">
            <div className="absolute top-0 right-0 w-16 h-16 bg-[hsl(var(--status-success)/0.1)] rounded-full -translate-y-1/2 translate-x-1/2" />
            <CardContent className="pt-5 pb-4 relative">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="h-4 w-4 text-[hsl(var(--status-success))]" />
                <p className="text-xs font-medium text-muted-foreground">Claimed</p>
              </div>
              <p className="text-3xl font-bold text-[hsl(var(--status-success))]"><AnimatedCounter value={stats.claimedCount} /></p>
              <p className="text-sm text-muted-foreground mt-1">{formatBND(stats.claimedAmount)}</p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-green-500/30 bg-green-500/5">
            <div className="absolute top-0 right-0 w-16 h-16 bg-green-500/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <CardContent className="pt-5 pb-4 relative">
              <div className="flex items-center gap-2 mb-1">
                <Receipt className="h-4 w-4 text-green-600" />
                <p className="text-xs font-medium text-muted-foreground">Total Earned</p>
              </div>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                <AnimatedCounter value={stats.totalEarned} formatter={(v) => formatBND(v)} />
              </p>
            </CardContent>
          </Card>

          <Card className="relative overflow-hidden border-primary/30 bg-primary/5">
            <div className="absolute top-0 right-0 w-16 h-16 bg-primary/10 rounded-full -translate-y-1/2 translate-x-1/2" />
            <CardContent className="pt-5 pb-4 relative">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-primary" />
                <p className="text-xs font-medium text-muted-foreground">Total Amount</p>
              </div>
              <p className="text-3xl font-bold text-primary">
                <AnimatedCounter value={stats.pendingAmount + stats.claimedAmount} formatter={(v) => formatBND(v)} />
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3 p-4 bg-secondary/30 rounded-xl border border-border/30">
          {!isRunner && (
            <Select value={selectedRunnerId} onValueChange={setSelectedRunnerId}>
              <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Runners" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">All Runners</SelectItem>
                {runners.map((runner) => (
                  <SelectItem key={runner.id} value={runner.id}>{runner.display_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="All Statuses" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Statuses</SelectItem>
              <SelectItem value="ADMIN_ACK_PENDING">Pending</SelectItem>
              <SelectItem value="CLAIMED">Claimed</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[120px]"><SelectValue placeholder="Year" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Years</SelectItem>
              {years.map((year) => (
                <SelectItem key={year.value} value={year.value}>{year.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[140px]"><SelectValue placeholder="Month" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Months</SelectItem>
              {months.map((month) => (
                <SelectItem key={month.value} value={month.value}>{month.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="ghost" size="sm" onClick={clearFilters}>Clear Filters</Button>
        </div>

        {/* BND → RM Calculator */}
        {selectedRows.length > 0 && (() => {
          const selected = filteredBatches.filter(b => selectedRows.includes(b.id));
          const totalBND = selected.reduce((sum, b) => sum + Number(b.total_amount), 0);
          const totalOrders = selected.reduce((sum, b) => sum + (b.items?.length || 0), 0);
          const rate = parseFloat(exchangeRate) || 0;
          const totalRM = totalBND * rate;
          return (
            <Card className="border-primary/40 bg-gradient-to-r from-primary/5 to-blue-50/50">
              <CardContent className="py-4">
                <div className="flex items-center gap-2 mb-3">
                  <Calculator className="h-4 w-4 text-primary" />
                  <span className="text-sm font-semibold">Currency Calculator</span>
                  <Badge variant="outline" className="ml-auto text-xs">{selectedRows.length} batch{selectedRows.length > 1 ? 'es' : ''} selected &middot; {totalOrders} orders</Badge>
                </div>
                <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                  {/* BND Total */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground mb-1">Total BND</p>
                    <p className="text-2xl font-bold text-primary">{formatBND(totalBND)}</p>
                  </div>

                  {/* Rate Input */}
                  <div className="flex items-center gap-2">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Rate (BND → RM)</p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground font-medium">×</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={exchangeRate}
                          onChange={(e) => setExchangeRate(e.target.value)}
                          className="w-24 h-9 text-center font-semibold"
                        />
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground mt-5" />
                  </div>

                  {/* RM Total */}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground mb-1">Total RM</p>
                    <p className="text-2xl font-bold text-emerald-600">RM {totalRM.toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })()}

        <DataGrid
          data={filteredBatches}
          columns={columns}
          loading={isLoading}
          keyField="id"
          selectable
          selectedRows={selectedRows}
          onSelectionChange={setSelectedRows}
          onExport={handleExportSelected}
          emptyMessage="No claim batches found"
        />
      </div>

      {/* Batch Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Claim Batch {(selectedBatch as any)?.batch_code || ''} Details</DialogTitle>
            <DialogDescription>
              Submitted by {selectedBatch?.runner?.display_name} on{' '}
              {selectedBatch && format(parseISO(selectedBatch.submitted_at), 'MMM dd, yyyy HH:mm')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-secondary/30 rounded-xl">
                <p className="text-sm text-muted-foreground">Total Orders</p>
                <p className="text-2xl font-bold">{batchDetails.length || selectedBatch?.items?.length || 0}</p>
              </div>
              <div className="p-4 bg-secondary/30 rounded-xl">
                <p className="text-sm text-muted-foreground">Total Amount</p>
                <p className="text-2xl font-bold">{formatBND(Number(selectedBatch?.total_amount || 0))}</p>
              </div>
              <div className="p-4 bg-secondary/30 rounded-xl">
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge className={cn("border mt-1", statusColors[selectedBatch?.status || 'ADMIN_ACK_PENDING'])}>
                  {selectedBatch?.status === 'ADMIN_ACK_PENDING' ? 'Pending' : 'Claimed'}
                </Badge>
              </div>
            </div>

            <div className="border rounded-xl p-4">
              <h3 className="font-semibold mb-3">Timeline</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--status-pending))]" />
                  <div className="text-sm">
                    <span className="font-medium">Submitted:</span>{' '}
                    {selectedBatch && format(parseISO(selectedBatch.submitted_at), 'MMM dd, yyyy HH:mm')}
                  </div>
                </div>
                {selectedBatch?.admin_ack_at && (
                  <div className="flex items-center gap-3">
                    <div className="h-2.5 w-2.5 rounded-full bg-[hsl(var(--status-success))]" />
                    <div className="text-sm">
                      <span className="font-medium">Acknowledged:</span>{' '}
                      {format(parseISO(selectedBatch.admin_ack_at), 'MMM dd, yyyy HH:mm')}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {selectedBatch?.note && (
              <div className="p-4 bg-secondary/30 rounded-xl">
                <p className="text-sm text-muted-foreground">Note</p>
                <p>{selectedBatch.note}</p>
              </div>
            )}

            <div>
              <h3 className="font-semibold mb-2">Included Orders</h3>
              {detailsLoading ? (
                <div className="text-center py-4 text-muted-foreground">Loading order details...</div>
              ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order Ref</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Area</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Payment</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batchDetails.map((item: any) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-sm">{item.order?.order_code || '-'}</TableCell>
                      <TableCell>{item.order?.order_date ? format(new Date(item.order.order_date), 'MMM dd') : '-'}</TableCell>
                      <TableCell>{item.order?.customer_name || '-'}</TableCell>
                      <TableCell>{item.order?.area || '-'}</TableCell>
                      <TableCell>{formatBND(Number(item.order?.total_amount || 0))}</TableCell>
                      <TableCell>{item.order?.payment_method || '-'}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.order?.reconciliation_status?.replace(/_/g, ' ') || '-'}</Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
