import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  ClipboardCheck,
  Package,
  Check,
  X,
  ArrowRight,
  Loader2,
  AlertCircle,
  Clock,
  KeyRound
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import {
  usePendingApprovals,
  useApproveTransfer,
  useRejectTransfer
} from '@/hooks/useOffboarding';
import {
  usePasswordResetRequests,
  useApprovePasswordReset,
  useRejectPasswordReset,
} from '@/hooks/usePasswordResetRequests';
import type { StockTransfer } from '@/types/stock-visibility';

const TEMPORARY_PASSWORD = 'Tomu@12345678';

export default function PendingStockApprovals() {
  const { data: pendingTransfers = [], isLoading } = usePendingApprovals();
  const approveTransfer = useApproveTransfer();
  const rejectTransfer = useRejectTransfer();

  const { data: resetRequests = [], isLoading: resetLoading } = usePasswordResetRequests();
  const approveReset = useApprovePasswordReset();
  const rejectReset = useRejectPasswordReset();
  const [confirmResetId, setConfirmResetId] = useState<string | null>(null);
  
  const [selectedTransfer, setSelectedTransfer] = useState<StockTransfer | null>(null);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);

  const handleApprove = async () => {
    if (!selectedTransfer) return;
    
    await approveTransfer.mutateAsync(selectedTransfer.id);
    setConfirmApproveOpen(false);
    setSelectedTransfer(null);
  };

  const handleReject = async () => {
    if (!selectedTransfer || !rejectReason.trim()) return;
    
    await rejectTransfer.mutateAsync({
      transferId: selectedTransfer.id,
      reason: rejectReason.trim(),
    });
    
    setRejectDialogOpen(false);
    setRejectReason('');
    setSelectedTransfer(null);
  };

  const openApproveConfirm = (transfer: StockTransfer) => {
    setSelectedTransfer(transfer);
    setConfirmApproveOpen(true);
  };

  const openRejectDialog = (transfer: StockTransfer) => {
    setSelectedTransfer(transfer);
    setRejectDialogOpen(true);
  };

  const getTotalQty = (transfer: StockTransfer) => {
    return transfer.items?.reduce((sum, item) => sum + item.qty, 0) || 0;
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <ClipboardCheck className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Pending Stock Approvals</h1>
            <p className="text-muted-foreground">
              Review and approve stock transfers from offboarded users
            </p>
          </div>
        </div>

        {/* Password Reset Requests */}
        {!resetLoading && resetRequests.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2">
                    <KeyRound className="h-5 w-5" />
                    Password Reset Requests
                  </CardTitle>
                  <CardDescription>Users requesting password resets</CardDescription>
                </div>
                <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                  {resetRequests.length} pending
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {resetRequests.map((req) => (
                  <div key={req.id} className="flex items-center justify-between p-3 rounded-lg border bg-amber-50/50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{req.display_name}</p>
                      <p className="text-sm text-muted-foreground truncate">{req.email}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        <Clock className="h-3 w-3 inline mr-1" />
                        {formatDistanceToNow(new Date(req.requested_at), { addSuffix: true })}
                      </p>
                    </div>
                    <div className="flex gap-2 shrink-0 ml-3">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => rejectReset.mutate(req.id)}
                        disabled={rejectReset.isPending}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => setConfirmResetId(req.id)}
                        disabled={approveReset.isPending}
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Approve Password Reset Confirmation Dialog */}
        <Dialog open={!!confirmResetId} onOpenChange={(open) => !open && setConfirmResetId(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm Password Reset</DialogTitle>
              <DialogDescription>
                Are you sure you want to approve this password reset? This will:
              </DialogDescription>
            </DialogHeader>
            <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground py-2">
              <li>Reset the user's password to <code className="bg-muted px-1.5 py-0.5 rounded font-mono text-xs">{TEMPORARY_PASSWORD}</code></li>
              <li>Force the user to change their password on next login</li>
            </ul>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmResetId(null)}>
                Cancel
              </Button>
              <Button
                className="bg-green-600 hover:bg-green-700"
                onClick={() => {
                  if (confirmResetId) {
                    approveReset.mutate(confirmResetId);
                    setConfirmResetId(null);
                  }
                }}
                disabled={approveReset.isPending}
              >
                {approveReset.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Approving...</>
                ) : (
                  'Approve Reset'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : pendingTransfers.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Check className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No Pending Approvals</h3>
              <p className="text-muted-foreground text-sm">
                All stock transfers have been reviewed
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {pendingTransfers.map((transfer) => (
              <Card key={transfer.id}>
                <CardHeader className="p-4 md:p-6">
                  <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 space-y-1">
                      <CardTitle className="flex min-w-0 items-start gap-2 text-base md:text-lg">
                        <Package className="mt-0.5 h-5 w-5 shrink-0" />
                        <span className="min-w-0 break-words">Stock Transfer from {transfer.from_owner?.display_name}</span>
                      </CardTitle>
                      <CardDescription className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:gap-4">
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {format(new Date(transfer.created_at), 'MMM d, yyyy h:mm a')}
                        </span>
                        <Badge variant="outline" className="bg-amber-500/10 text-amber-600 border-amber-500/30">
                          <AlertCircle className="h-3 w-3 mr-1" />
                          Pending Approval
                        </Badge>
                      </CardDescription>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:flex">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openRejectDialog(transfer)}
                        disabled={rejectTransfer.isPending}
                        className="w-full sm:w-auto"
                      >
                        <X className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => openApproveConfirm(transfer)}
                        disabled={approveTransfer.isPending}
                        className="w-full sm:w-auto"
                      >
                        <Check className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
                  {/* Transfer Summary */}
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 rounded-lg bg-muted/30 px-2 py-4 mb-4 sm:gap-6">
                    <div className="min-w-0 text-center">
                      <div className="break-words font-medium">{transfer.from_owner?.display_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {transfer.from_warehouse?.name}
                      </div>
                    </div>
                    <ArrowRight className="h-5 w-5 text-muted-foreground" />
                    <div className="min-w-0 text-center">
                      <div className="break-words font-medium">{transfer.to_owner?.display_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {transfer.to_warehouse?.name}
                      </div>
                    </div>
                  </div>

                  {/* Quick Stats */}
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="rounded-lg border p-3 text-center">
                      <div className="text-2xl font-bold">{transfer.items?.length || 0}</div>
                      <div className="text-sm text-muted-foreground">SKUs</div>
                    </div>
                    <div className="rounded-lg border p-3 text-center">
                      <div className="text-2xl font-bold">{getTotalQty(transfer)}</div>
                      <div className="text-sm text-muted-foreground">Total Units</div>
                    </div>
                  </div>

                  {/* Notes if any */}
                  {transfer.notes && (
                    <div className="rounded-lg bg-muted/50 p-3 mb-4">
                      <div className="text-sm font-medium mb-1">Notes:</div>
                      <div className="text-sm text-muted-foreground">{transfer.notes}</div>
                    </div>
                  )}

                  {/* Expandable Item List */}
                  <Accordion type="single" collapsible>
                    <AccordionItem value="items" className="border-none">
                      <AccordionTrigger className="py-2 text-sm">
                        View all {transfer.items?.length} items
                      </AccordionTrigger>
                      <AccordionContent>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>SKU</TableHead>
                              <TableHead>Product</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {transfer.items?.map((item) => (
                              <TableRow key={item.id}>
                                <TableCell className="font-mono text-sm">
                                  {item.product?.sku_code || '-'}
                                </TableCell>
                                <TableCell>{item.product?.sku_name}</TableCell>
                                <TableCell className="text-right font-medium">
                                  {item.qty}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Approve Confirmation Dialog */}
      <Dialog open={confirmApproveOpen} onOpenChange={setConfirmApproveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Transfer Approval</DialogTitle>
            <DialogDescription>
              Are you sure you want to approve this stock transfer? This action will:
            </DialogDescription>
          </DialogHeader>
          <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground py-2">
            <li>Deduct all items from {selectedTransfer?.from_owner?.display_name}'s warehouse</li>
            <li>Add all items to your warehouse</li>
            <li>This action cannot be undone</li>
          </ul>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmApproveOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={approveTransfer.isPending}>
              {approveTransfer.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Approving...
                </>
              ) : (
                'Approve Transfer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Stock Transfer</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this transfer.
              The admin will be notified.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Enter rejection reason..."
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!rejectReason.trim() || rejectTransfer.isPending}
            >
              {rejectTransfer.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Rejecting...
                </>
              ) : (
                'Reject Transfer'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
