import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useClaimBatches, useApproveClaimBatch, useRejectClaimBatch, useClaimBatchDetails } from '@/hooks/useClaimBatches';
import { format } from 'date-fns';
import { CheckCircle, Receipt, Loader2, XCircle, TrendingDown, Clock, DollarSign, Users } from 'lucide-react';
import { formatBND, formatRM, formatExchangeRate } from '@/lib/currency';
import { Separator } from '@/components/ui/separator';
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter';
import { ClaimBatchTimeline } from '@/components/runner/ClaimBatchTimeline';
import { PageHero } from '@/components/dashboard/PageHero';
import type { ClaimBatch } from '@/types/database';
import { cn } from '@/lib/utils';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';

export default function ClaimBatchesAdmin() {
  const { data: batches = [], isLoading } = useClaimBatches({ status: 'ADMIN_ACK_PENDING' });
  const approveClaimBatch = useApproveClaimBatch();
  const rejectClaimBatch = useRejectClaimBatch();
  const [selectedBatch, setSelectedBatch] = useState<ClaimBatch | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [bulkApproving, setBulkApproving] = useState(false);

  // Fetch order details on demand when a batch is selected
  const { data: batchDetails = [], isLoading: detailsLoading } = useClaimBatchDetails(
    detailsOpen ? selectedBatch?.id : undefined
  );

  const stats = useMemo(() => ({
    totalPending: batches.length,
    totalOrders: batches.reduce((sum, b) => sum + (b.items?.length || 0), 0),
    totalAmount: batches.reduce((sum, b) => sum + Number(b.net_bnd || b.total_amount || 0), 0),
    uniqueRunners: new Set(batches.map(b => b.runner_id)).size,
  }), [batches]);

  const handleViewDetails = (batch: ClaimBatch) => {
    setSelectedBatch(batch);
    setDetailsOpen(true);
  };

  const handleApprove = async (batch: ClaimBatch) => {
    await approveClaimBatch.mutateAsync(batch.id);
    setDetailsOpen(false);
    setSelectedBatch(null);
  };

  const handleBulkApprove = async () => {
    if (selectedRows.length === 0) return;
    setBulkApproving(true);
    let success = 0;
    let failed = 0;
    for (const batchId of selectedRows) {
      try {
        await approveClaimBatch.mutateAsync(batchId);
        success++;
      } catch {
        failed++;
      }
    }
    setBulkApproving(false);
    setSelectedRows([]);
    toast.success(`Approved ${success} batch(es)${failed > 0 ? `, ${failed} failed` : ''}`);
  };

  const handleRejectClick = (batch: ClaimBatch) => {
    setSelectedBatch(batch);
    setRejectDialogOpen(true);
  };

  const handleConfirmReject = async () => {
    if (!selectedBatch) return;
    await rejectClaimBatch.mutateAsync({
      batchId: selectedBatch.id,
      rejectionReason: rejectionReason || undefined,
    });
    setRejectDialogOpen(false);
    setDetailsOpen(false);
    setSelectedBatch(null);
    setRejectionReason('');
  };

  const columns: Column<ClaimBatch>[] = [
    {
      key: 'batch_code', header: 'Batch #', sortable: true,
      render: (batch) => (
        <span className="font-mono font-semibold text-primary">
          {(batch as any).batch_code || '-'}
        </span>
      ),
    },
    {
      key: 'submitted_at', header: 'Submitted', sortable: true,
      render: (batch) => (
        <span className="text-sm">{format(new Date(batch.submitted_at), 'MMM dd, yyyy HH:mm')}</span>
      ),
    },
    {
      key: 'runner', header: 'Runner',
      render: (batch) => (
        <span className="font-medium">{batch.runner?.display_name || '-'}</span>
      ),
    },
    {
      key: 'items', header: 'Orders',
      render: (batch) => <span className="font-semibold">{batch.items?.length || 0}</span>,
    },
    {
      key: 'gross_bnd', header: 'Gross (BND)', sortable: true,
      render: (batch) => formatBND(batch.gross_bnd || batch.total_bnd || batch.total_amount),
    },
    {
      key: 'delivery_charges_bnd', header: 'Charges',
      render: (batch) => (
        <span className="text-destructive">-{formatBND(batch.delivery_charges_bnd || 0)}</span>
      ),
    },
    {
      key: 'net_bnd', header: 'Net (BND)', sortable: true,
      render: (batch) => (
        <span className="font-bold text-primary">
          {formatBND(batch.net_bnd || batch.total_bnd || batch.total_amount)}
        </span>
      ),
    },
    {
      key: 'net_rm', header: 'Net (RM)', sortable: true,
      render: (batch) => (
        <span className="font-semibold">
          {batch.net_rm ? formatRM(batch.net_rm) : batch.total_rm ? formatRM(batch.total_rm) : '-'}
        </span>
      ),
    },
    {
      key: 'timeline', header: 'Status',
      render: (batch) => (
        <ClaimBatchTimeline
          status={batch.status}
          submittedAt={batch.submitted_at}
          acknowledgedAt={batch.admin_ack_at}
        />
      ),
    },
    {
      key: 'actions', header: 'Actions',
      render: (batch) => (
        <div className="flex gap-1.5">
          <Button size="sm" variant="outline" onClick={() => handleViewDetails(batch)} className="text-xs">
            View
          </Button>
          <Button 
            size="sm" 
            onClick={() => handleApprove(batch)}
            disabled={approveClaimBatch.isPending}
            className="bg-[hsl(var(--status-success))] hover:bg-[hsl(var(--status-success)/0.9)] text-white"
          >
            {approveClaimBatch.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button 
            size="sm"
            variant="destructive"
            onClick={() => handleRejectClick(batch)}
            disabled={rejectClaimBatch.isPending}
          >
            {rejectClaimBatch.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <XCircle className="h-3.5 w-3.5" />
            )}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <div className="space-y-6">
        <PageHero
          icon={<Receipt className="h-6 w-6 text-primary" />}
          title="Claim Batches"
          subtitle="Review and approve/reject runner claim batches"
          actions={
            selectedRows.length > 0 ? (
              <Button
                onClick={handleBulkApprove}
                disabled={bulkApproving}
                className="bg-[hsl(var(--status-success))] hover:bg-[hsl(var(--status-success)/0.9)] text-white"
              >
                {bulkApproving ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <CheckCircle className="h-4 w-4 mr-2" />
                )}
                Bulk Approve ({selectedRows.length})
              </Button>
            ) : undefined
          }
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Card className="border-[hsl(var(--status-warning)/0.3)] bg-[hsl(var(--status-warning)/0.03)]">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-[hsl(var(--status-warning))]" />
                <span className="text-[11px] font-medium text-muted-foreground uppercase">Pending Batches</span>
              </div>
              <p className="text-3xl font-extrabold text-[hsl(var(--status-warning))]">
                <AnimatedCounter value={stats.totalPending} />
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Receipt className="h-4 w-4 text-muted-foreground" />
                <span className="text-[11px] font-medium text-muted-foreground uppercase">Total Orders</span>
              </div>
              <p className="text-3xl font-extrabold"><AnimatedCounter value={stats.totalOrders} /></p>
            </CardContent>
          </Card>
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="h-4 w-4 text-primary" />
                <span className="text-[11px] font-medium text-muted-foreground uppercase">Total Amount</span>
              </div>
              <p className="text-2xl font-extrabold text-primary">
                <AnimatedCounter value={stats.totalAmount} formatter={(v) => formatBND(v)} />
              </p>
            </CardContent>
          </Card>
          <Card className="border-border/50">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-[11px] font-medium text-muted-foreground uppercase">Runners</span>
              </div>
              <p className="text-3xl font-extrabold"><AnimatedCounter value={stats.uniqueRunners} /></p>
            </CardContent>
          </Card>
        </div>

        <DataGrid
          data={batches}
          columns={columns}
          loading={isLoading}
          keyField="id"
          selectable
          selectedRows={selectedRows}
          onSelectionChange={setSelectedRows}
          emptyMessage="No pending claim batches 🎉"
          onExport={() => {}}
        />
      </div>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Claim Batch {(selectedBatch as any)?.batch_code || ''} Details
            </DialogTitle>
            <DialogDescription>
              Submitted by {selectedBatch?.runner?.display_name} on{' '}
              {selectedBatch && format(new Date(selectedBatch.submitted_at), 'MMM dd, yyyy HH:mm')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Timeline */}
            {selectedBatch && (
              <div className="flex justify-center py-2">
                <ClaimBatchTimeline
                  status={selectedBatch.status}
                  submittedAt={selectedBatch.submitted_at}
                  acknowledgedAt={selectedBatch.admin_ack_at}
                />
              </div>
            )}

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Total Orders</p>
                <p className="text-2xl font-bold">{selectedBatch?.items?.length || 0}</p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">FX Rate</p>
                <p className="text-2xl font-bold font-mono">
                  {selectedBatch?.exchange_rate_to_rm ? formatExchangeRate(selectedBatch.exchange_rate_to_rm) : '-'}
                </p>
              </div>
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Status</p>
                <Badge className="mt-1 bg-[hsl(var(--status-warning)/0.15)] text-[hsl(var(--status-warning))]">
                  Pending Approval
                </Badge>
              </div>
            </div>

            {/* BND Breakdown */}
            <div className="p-4 bg-muted rounded-lg space-y-3">
              <p className="font-medium">BND Breakdown</p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Gross Total</span>
                  <span className="font-medium">{formatBND(selectedBatch?.gross_bnd || selectedBatch?.total_bnd || selectedBatch?.total_amount)}</span>
                </div>
                <div className="flex justify-between text-sm text-destructive">
                  <span className="flex items-center gap-1">
                    <TrendingDown className="h-3 w-3" />
                    Delivery Charges
                  </span>
                  <span>-{formatBND(selectedBatch?.delivery_charges_bnd || 0)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold">
                  <span>Net Claim (BND)</span>
                  <span className="text-lg">{formatBND(selectedBatch?.net_bnd || selectedBatch?.total_bnd || selectedBatch?.total_amount)}</span>
                </div>
              </div>
            </div>

            {/* RM Breakdown */}
            {selectedBatch?.exchange_rate_to_rm && (
              <div className="p-4 border border-primary/20 bg-primary/5 rounded-lg space-y-3">
                <p className="font-medium text-primary">RM Conversion</p>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Gross Total (RM)</span>
                    <span className="font-medium">{formatRM(selectedBatch?.gross_rm || 0)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-destructive">
                    <span className="flex items-center gap-1">
                      <TrendingDown className="h-3 w-3" />
                      Delivery Charges (RM)
                    </span>
                    <span>-{formatRM(selectedBatch?.delivery_charges_rm || 0)}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between font-bold text-primary">
                    <span>Net Claim (RM)</span>
                    <span className="text-lg">{formatRM(selectedBatch?.net_rm || selectedBatch?.total_rm || 0)}</span>
                  </div>
                </div>
              </div>
            )}

            {selectedBatch?.note && (
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Note</p>
                <p>{selectedBatch.note}</p>
              </div>
            )}

            <div>
              <h3 className="font-semibold mb-2">Included Orders ({selectedBatch?.items?.length || 0})</h3>
              {detailsLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin mr-2" />
                  <span className="text-sm text-muted-foreground">Loading order details...</span>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Order Ref</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Area</TableHead>
                      <TableHead className="text-right">Amount (BND)</TableHead>
                      <TableHead>Payment</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(batchDetails as any[])?.map((item: any) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          {item.order && format(new Date(item.order.order_date), 'MMM dd')}
                        </TableCell>
                        <TableCell className="font-mono text-sm">
                          {item.order?.order_code}
                        </TableCell>
                        <TableCell>{item.order?.customer_name}</TableCell>
                        <TableCell>{item.order?.area || '-'}</TableCell>
                        <TableCell className="text-right font-mono font-medium">
                          {formatBND(item.order?.total_amount)}
                        </TableCell>
                        <TableCell>{item.order?.payment_method}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDetailsOpen(false)}>
              Close
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedBatch && handleRejectClick(selectedBatch)}
              disabled={rejectClaimBatch.isPending}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Reject
            </Button>
            <Button
              onClick={() => selectedBatch && handleApprove(selectedBatch)}
              disabled={approveClaimBatch.isPending}
              className="bg-[hsl(var(--status-success))] hover:bg-[hsl(var(--status-success)/0.9)] text-white"
            >
              {approveClaimBatch.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle className="h-4 w-4 mr-2" />
              )}
              Approve Batch
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Confirmation Dialog */}
      <AlertDialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Claim Batch?</AlertDialogTitle>
            <AlertDialogDescription>
              This will reject the claim batch and revert all {selectedBatch?.items?.length || 0} orders 
              back to "NOT CLAIMED" status. The runner will be notified.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-2 py-4">
            <Label htmlFor="rejectionReason">Rejection Reason (Optional)</Label>
            <Textarea
              id="rejectionReason"
              placeholder="Enter reason for rejection..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              maxLength={500}
            />
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setRejectionReason('')}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmReject}
              className="bg-destructive hover:bg-destructive/90"
              disabled={rejectClaimBatch.isPending}
            >
              {rejectClaimBatch.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              Confirm Reject
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
