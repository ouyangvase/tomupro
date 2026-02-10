import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useClaimBatches } from '@/hooks/useClaimBatches';
import { useRunners } from '@/hooks/useUserDirectory';
import { format, parseISO, getYear, getMonth } from 'date-fns';
import { Receipt, Eye, Download, ExternalLink } from 'lucide-react';
import type { ClaimBatch, ClaimBatchStatus } from '@/types/database';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { exportToCSV } from '@/lib/csv';

const statusColors: Record<ClaimBatchStatus, string> = {
  ADMIN_ACK_PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  CLAIMED: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

const months = [
  { value: '0', label: 'January' },
  { value: '1', label: 'February' },
  { value: '2', label: 'March' },
  { value: '3', label: 'April' },
  { value: '4', label: 'May' },
  { value: '5', label: 'June' },
  { value: '6', label: 'July' },
  { value: '7', label: 'August' },
  { value: '8', label: 'September' },
  { value: '9', label: 'October' },
  { value: '10', label: 'November' },
  { value: '11', label: 'December' },
];

const currentYear = new Date().getFullYear();
const years = Array.from({ length: 5 }, (_, i) => ({
  value: String(currentYear - 2 + i),
  label: String(currentYear - 2 + i),
}));

export default function ClaimBatchesHistory() {
  const { data: batches = [], isLoading } = useClaimBatches(); // All batches for admin
  const { data: runners = [] } = useRunners();
  
  const [selectedBatch, setSelectedBatch] = useState<ClaimBatch | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  
  // Filters
  const [selectedRunnerId, setSelectedRunnerId] = useState<string>('__all__');
  const [selectedStatus, setSelectedStatus] = useState<string>('__all__');
  const [selectedYear, setSelectedYear] = useState<string>('__all__');
  const [selectedMonth, setSelectedMonth] = useState<string>('__all__');

  // Apply filters
  const filteredBatches = useMemo(() => {
    return batches.filter(batch => {
      // Runner filter
      if (selectedRunnerId !== '__all__' && batch.runner_id !== selectedRunnerId) return false;
      
      // Status filter
      if (selectedStatus !== '__all__' && batch.status !== selectedStatus) return false;
      
      // Year filter
      if (selectedYear !== '__all__') {
        const batchYear = getYear(parseISO(batch.submitted_at));
        if (batchYear !== parseInt(selectedYear)) return false;
      }
      
      // Month filter
      if (selectedMonth !== '__all__') {
        const batchMonth = getMonth(parseISO(batch.submitted_at));
        if (batchMonth !== parseInt(selectedMonth)) return false;
      }
      
      return true;
    });
  }, [batches, selectedRunnerId, selectedStatus, selectedYear, selectedMonth]);

  const handleViewDetails = (batch: ClaimBatch) => {
    setSelectedBatch(batch);
    setDetailsOpen(true);
  };

  const handleExportSelected = () => {
    const selectedBatches = filteredBatches.filter(b => selectedRows.includes(b.id));
    // Build full order-level export rows
    const exportRows: Record<string, unknown>[] = [];
    for (const batch of selectedBatches) {
      for (const item of batch.items || []) {
        const order = item.order;
        if (!order) continue;
        // Build items string from order_items
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
          note: batch.note || '',
        });
      }
    }
    exportToCSV(exportRows, [
      { key: 'batch_code', header: 'Batch #' },
      { key: 'submitted_at', header: 'Batch Submitted' },
      { key: 'runner', header: 'Runner' },
      { key: 'batch_status', header: 'Batch Status' },
      { key: 'order_code', header: 'Order Ref' },
      { key: 'order_date', header: 'Order Date' },
      { key: 'customer_name', header: 'Customer' },
      { key: 'area', header: 'Area' },
      { key: 'items', header: 'Items (SKU x Qty)' },
      { key: 'total_qty', header: 'Total Qty' },
      { key: 'amount', header: 'Amount (BND)' },
      { key: 'payment_method', header: 'Payment Method' },
      { key: 'reconciliation_status', header: 'Claim Status' },
      { key: 'note', header: 'Note' },
    ], 'claim_batches_orders_export');
  };

  const clearFilters = () => {
    setSelectedRunnerId('__all__');
    setSelectedStatus('__all__');
    setSelectedYear('__all__');
    setSelectedMonth('__all__');
  };

  // Summary stats
  const stats = useMemo(() => {
    const pending = filteredBatches.filter(b => b.status === 'ADMIN_ACK_PENDING');
    const claimed = filteredBatches.filter(b => b.status === 'CLAIMED');
    return {
      totalBatches: filteredBatches.length,
      pendingCount: pending.length,
      pendingAmount: pending.reduce((sum, b) => sum + Number(b.total_amount), 0),
      claimedCount: claimed.length,
      claimedAmount: claimed.reduce((sum, b) => sum + Number(b.total_amount), 0),
    };
  }, [filteredBatches]);

  const columns: Column<ClaimBatch>[] = [
    {
      key: 'batch_code',
      header: 'Batch #',
      sortable: true,
      render: (batch) => <span className="font-mono font-medium">{(batch as any).batch_code || '-'}</span>,
    },
    {
      key: 'submitted_at',
      header: 'Submitted',
      sortable: true,
      render: (batch) => format(parseISO(batch.submitted_at), 'MMM dd, yyyy HH:mm'),
    },
    {
      key: 'runner',
      header: 'Runner',
      sortable: true,
      render: (batch) => batch.runner?.display_name || '-',
    },
    {
      key: 'items',
      header: 'Orders',
      render: (batch) => batch.items?.length || 0,
    },
    {
      key: 'total_amount',
      header: 'Total Amount',
      sortable: true,
      render: (batch) => <span className="font-medium">${Number(batch.total_amount).toLocaleString()}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      filterable: true,
      render: (batch) => (
        <Badge className={statusColors[batch.status]}>
          {batch.status === 'ADMIN_ACK_PENDING' ? 'Pending' : 'Claimed'}
        </Badge>
      ),
    },
    {
      key: 'admin_ack_at',
      header: 'Acknowledged',
      render: (batch) => batch.admin_ack_at 
        ? format(parseISO(batch.admin_ack_at), 'MMM dd, yyyy HH:mm') 
        : <span className="text-muted-foreground">-</span>,
    },
    {
      key: 'note',
      header: 'Note',
      render: (batch) => (
        <span className="truncate max-w-[150px] block" title={batch.note || ''}>
          {batch.note || '-'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (batch) => (
        <Button size="sm" variant="outline" onClick={() => handleViewDetails(batch)}>
          <Eye className="h-4 w-4 mr-1" />
          Details
        </Button>
      ),
    },
  ];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Receipt className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Claim Batches History</h1>
            <p className="text-muted-foreground">Complete history of all runner claim batches</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 bg-muted rounded-lg">
            <p className="text-sm text-muted-foreground">Total Batches</p>
            <p className="text-2xl font-bold">{stats.totalBatches}</p>
          </div>
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
            <p className="text-sm text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold">{stats.pendingCount}</p>
            <p className="text-sm text-muted-foreground">${stats.pendingAmount.toLocaleString()}</p>
          </div>
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
            <p className="text-sm text-muted-foreground">Claimed</p>
            <p className="text-2xl font-bold">{stats.claimedCount}</p>
            <p className="text-sm text-muted-foreground">${stats.claimedAmount.toLocaleString()}</p>
          </div>
          <div className="p-4 bg-primary/10 rounded-lg">
            <p className="text-sm text-muted-foreground">Total Amount</p>
            <p className="text-2xl font-bold">${(stats.pendingAmount + stats.claimedAmount).toLocaleString()}</p>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-4 p-4 bg-muted/50 rounded-lg">
          <Select value={selectedRunnerId} onValueChange={setSelectedRunnerId}>
            <SelectTrigger className="w-[180px]">
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

          <Select value={selectedStatus} onValueChange={setSelectedStatus}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Statuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Statuses</SelectItem>
              <SelectItem value="ADMIN_ACK_PENDING">Pending</SelectItem>
              <SelectItem value="CLAIMED">Claimed</SelectItem>
            </SelectContent>
          </Select>

          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[120px]">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Years</SelectItem>
              {years.map((year) => (
                <SelectItem key={year.value} value={year.value}>
                  {year.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Month" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">All Months</SelectItem>
              {months.map((month) => (
                <SelectItem key={month.value} value={month.value}>
                  {month.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear Filters
          </Button>
        </div>

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
            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Total Orders</p>
                <p className="text-2xl font-bold">{selectedBatch?.items?.length || 0}</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Total Amount</p>
                <p className="text-2xl font-bold">${Number(selectedBatch?.total_amount || 0).toLocaleString()}</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge className={statusColors[selectedBatch?.status || 'ADMIN_ACK_PENDING']} >
                  {selectedBatch?.status === 'ADMIN_ACK_PENDING' ? 'Pending' : 'Claimed'}
                </Badge>
              </div>
            </div>

            {/* Timeline */}
            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-3">Timeline</h3>
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="h-2 w-2 rounded-full bg-blue-500" />
                  <div className="text-sm">
                    <span className="font-medium">Submitted:</span>{' '}
                    {selectedBatch && format(parseISO(selectedBatch.submitted_at), 'MMM dd, yyyy HH:mm')}
                  </div>
                </div>
                {selectedBatch?.admin_ack_at && (
                  <div className="flex items-center gap-3">
                    <div className="h-2 w-2 rounded-full bg-green-500" />
                    <div className="text-sm">
                      <span className="font-medium">Acknowledged:</span>{' '}
                      {format(parseISO(selectedBatch.admin_ack_at), 'MMM dd, yyyy HH:mm')}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Note */}
            {selectedBatch?.note && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Note</p>
                <p>{selectedBatch.note}</p>
              </div>
            )}

            {/* Included Orders */}
            <div>
              <h3 className="font-semibold mb-2">Included Orders</h3>
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
                  {selectedBatch?.items?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-sm">
                        {item.order?.order_code || '-'}
                      </TableCell>
                      <TableCell>
                        {item.order && format(new Date(item.order.order_date), 'MMM dd')}
                      </TableCell>
                      <TableCell>{item.order?.customer_name}</TableCell>
                      <TableCell>{item.order?.area || '-'}</TableCell>
                      <TableCell>${Number(item.order?.total_amount || 0).toLocaleString()}</TableCell>
                      <TableCell>{item.order?.payment_method}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {item.order?.reconciliation_status?.replace(/_/g, ' ')}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
