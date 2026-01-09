import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useClaimBatches, useApproveClaimBatch, useRejectClaimBatch } from '@/hooks/useClaimBatches';
import { format } from 'date-fns';
import { CheckCircle, Receipt, Loader2, XCircle, TrendingDown } from 'lucide-react';
import { formatBND, formatRM, formatExchangeRate } from '@/lib/currency';
import { Separator } from '@/components/ui/separator';
import type { ClaimBatch } from '@/types/database';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function ClaimBatchesAdmin() {
  const { data: batches = [], isLoading } = useClaimBatches({ status: 'ADMIN_ACK_PENDING' });
  const approveClaimBatch = useApproveClaimBatch();
  const rejectClaimBatch = useRejectClaimBatch();
  const [selectedBatch, setSelectedBatch] = useState<ClaimBatch | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');

  const handleViewDetails = (batch: ClaimBatch) => {
    setSelectedBatch(batch);
    setDetailsOpen(true);
  };

  const handleApprove = async (batch: ClaimBatch) => {
    await approveClaimBatch.mutateAsync(batch.id);
    setDetailsOpen(false);
    setSelectedBatch(null);
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
      key: 'submitted_at',
      header: 'Submitted',
      sortable: true,
      render: (batch) => format(new Date(batch.submitted_at), 'MMM dd, yyyy HH:mm'),
    },
    {
      key: 'runner',
      header: 'Runner',
      render: (batch) => batch.runner?.display_name || '-',
    },
    {
      key: 'items',
      header: 'Orders',
      render: (batch) => batch.items?.length || 0,
    },
    {
      key: 'gross_bnd',
      header: 'Gross (BND)',
      sortable: true,
      render: (batch) => formatBND(batch.gross_bnd || batch.total_bnd || batch.total_amount),
    },
    {
      key: 'delivery_charges_bnd',
      header: 'Charges',
      render: (batch) => (
        <span className="text-destructive">
          -{formatBND(batch.delivery_charges_bnd || 0)}
        </span>
      ),
    },
    {
      key: 'net_bnd',
      header: 'Net (BND)',
      sortable: true,
      render: (batch) => (
        <span className="font-bold">
          {formatBND(batch.net_bnd || batch.total_bnd || batch.total_amount)}
        </span>
      ),
    },
    {
      key: 'net_rm',
      header: 'Net (RM)',
      sortable: true,
      render: (batch) => (
        <span className="font-bold text-primary">
          {batch.net_rm ? formatRM(batch.net_rm) : batch.total_rm ? formatRM(batch.total_rm) : '-'}
        </span>
      ),
    },
    {
      key: 'note',
      header: 'Note',
      render: (batch) => batch.note || '-',
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (batch) => (
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => handleViewDetails(batch)}>
            View
          </Button>
          <Button 
            size="sm" 
            onClick={() => handleApprove(batch)}
            disabled={approveClaimBatch.isPending}
            className="bg-green-600 hover:bg-green-700"
          >
            {approveClaimBatch.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle className="h-4 w-4" />
            )}
          </Button>
          <Button 
            size="sm"
            variant="destructive"
            onClick={() => handleRejectClick(batch)}
            disabled={rejectClaimBatch.isPending}
          >
            {rejectClaimBatch.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Receipt className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Claim Batches</h1>
            <p className="text-muted-foreground">Review and approve/reject runner claim batches</p>
          </div>
        </div>

        <DataGrid
          data={batches}
          columns={columns}
          loading={isLoading}
          keyField="id"
          emptyMessage="No pending claim batches"
          onExport={() => {}}
        />
      </div>

      {/* Details Dialog */}
      <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Claim Batch Details</DialogTitle>
            <DialogDescription>
              Submitted by {selectedBatch?.runner?.display_name} on{' '}
              {selectedBatch && format(new Date(selectedBatch.submitted_at), 'MMM dd, yyyy HH:mm')}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
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
                <Badge className="mt-1 bg-yellow-100 text-yellow-800">Pending Approval</Badge>
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
              <h3 className="font-semibold mb-2">Included Orders</h3>
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
                  {selectedBatch?.items?.map((item) => (
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
              className="bg-green-600 hover:bg-green-700"
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
