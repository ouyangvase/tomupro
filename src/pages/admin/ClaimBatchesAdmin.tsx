import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { DataGrid, Column } from '@/components/data-grid/DataGrid';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { useClaimBatches, useApproveClaimBatch, useRejectClaimBatch, useClaimBatchDetails, useRemoveOrderFromBatch, useOrderBatchLookup, useClaimIntegrityCheck, useRepairOrder } from '@/hooks/useClaimBatches';
import { format } from 'date-fns';
import { CheckCircle, Receipt, Loader2, XCircle, TrendingDown, Clock, DollarSign, Users, Search, Trash2, AlertTriangle, Wrench, ShieldCheck } from 'lucide-react';
import { formatBND, formatRM, formatExchangeRate } from '@/lib/currency';
import { Input } from '@/components/ui/input';
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
  const { data: batches = [], isLoading } = useClaimBatches({ status: 'ADMIN_ACK_PENDING', includeOwners: true });
  const approveClaimBatch = useApproveClaimBatch();
  const rejectClaimBatch = useRejectClaimBatch();
  const removeOrderFromBatch = useRemoveOrderFromBatch();
  const [selectedBatch, setSelectedBatch] = useState<ClaimBatch | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [orderSearchQuery, setOrderSearchQuery] = useState('');
  const [orderSearchInput, setOrderSearchInput] = useState('');
  const [showIntegrityPanel, setShowIntegrityPanel] = useState(false);

  // Integrity check & repair
  const integrityCheck = useClaimIntegrityCheck();
  const repairOrder = useRepairOrder();

  // Order-to-batch lookup
  const { data: lookupResult, isLoading: lookupLoading } = useOrderBatchLookup(orderSearchQuery);

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
      key: 'owner_names', header: 'Owner',
      render: (batch) => (
        <span className="font-medium break-words">{batch.owner_names?.join(', ') || '-'}</span>
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
      minWidth: '180px',
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

        {/* Order-to-Batch Lookup */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 flex items-center gap-2">
                <Input
                  placeholder="Search order by code (e.g. XT409)..."
                  value={orderSearchInput}
                  onChange={(e) => setOrderSearchInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setOrderSearchQuery(orderSearchInput); }}
                  className="max-w-xs h-9"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setOrderSearchQuery(orderSearchInput)}
                  disabled={!orderSearchInput.trim()}
                >
                  Find Batch
                </Button>
                {orderSearchQuery && (
                  <Button size="sm" variant="ghost" onClick={() => { setOrderSearchQuery(''); setOrderSearchInput(''); }}>
                    Clear
                  </Button>
                )}
              </div>
            </div>

            {/* Lookup result */}
            {lookupLoading && orderSearchQuery && (
              <div className="flex items-center gap-2 mt-3 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Searching...
              </div>
            )}
            {!lookupLoading && orderSearchQuery && lookupResult === null && (
              <p className="text-sm text-muted-foreground mt-3">No order found with code "{orderSearchQuery}"</p>
            )}
            {!lookupLoading && lookupResult?.order && (
              <div className="mt-3 p-3 rounded-lg border bg-muted/30 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-sm">{lookupResult.order.order_code}</span>
                    <span className="text-sm text-muted-foreground">{lookupResult.order.customer_name}</span>
                    {lookupResult.order.area && <Badge variant="outline" className="text-xs">{lookupResult.order.area}</Badge>}
                    <Badge className={cn(
                      'text-xs',
                      lookupResult.order.reconciliation_status === 'NOT_CLAIMED' ? 'bg-muted text-muted-foreground' :
                      lookupResult.order.reconciliation_status === 'ADMIN_ACK_PENDING' ? 'bg-yellow-100 text-yellow-800' :
                      lookupResult.order.reconciliation_status === 'CLAIMED' ? 'bg-green-100 text-green-800' :
                      'bg-red-100 text-red-800'
                    )}>
                      {lookupResult.order.reconciliation_status}
                    </Badge>
                  </div>
                  <span className="text-sm font-semibold">{formatBND(lookupResult.order.total_amount)}</span>
                </div>
                {lookupResult.batch ? (
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground">In batch:</span>
                      <span className="font-mono font-semibold text-primary">{(lookupResult.batch as any).batch_code}</span>
                      <span className="text-muted-foreground">
                        ({lookupResult.batch.status}) &middot; Submitted {format(new Date(lookupResult.batch.submitted_at), 'MMM dd, yyyy HH:mm')}
                      </span>
                      {(lookupResult.batch as any).runner?.display_name && (
                        <span className="text-muted-foreground">by {(lookupResult.batch as any).runner.display_name}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          const batch = batches.find(b => b.id === lookupResult.batch?.id);
                          if (batch) handleViewDetails(batch);
                        }}
                      >
                        View Batch
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (lookupResult.batch && confirm(`Remove order ${lookupResult.order.order_code} from batch ${(lookupResult.batch as any).batch_code}?`)) {
                            removeOrderFromBatch.mutate({
                              batchId: lookupResult.batch.id,
                              orderId: lookupResult.order.id,
                            });
                            setOrderSearchQuery('');
                            setOrderSearchInput('');
                          }
                        }}
                        disabled={removeOrderFromBatch.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5 mr-1" />
                        Remove from Batch
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Not in any claim batch.{(lookupResult as any).claim ? ' (Has orphan claim record)' : ''}</p>
                )}
                {/* Show extra diagnostics */}
                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1 flex-wrap">
                  <span>Runner: {(lookupResult.order as any).runner_status}</span>
                  <span>Delivered: {(lookupResult.order as any).delivered_at ? format(new Date((lookupResult.order as any).delivered_at), 'MMM dd, yyyy HH:mm') : 'N/A'}</span>
                  {(lookupResult as any).claim && <span>Claim: {format(new Date((lookupResult as any).claim.created_at), 'MMM dd, yyyy HH:mm')}</span>}
                  {/* Repair button for stuck orders */}
                  {(lookupResult.order.reconciliation_status !== 'NOT_CLAIMED' && !lookupResult.batch) && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                      onClick={() => {
                        if (confirm(`Repair order ${lookupResult.order.order_code}? This will reset it to NOT_CLAIMED and remove any orphan claim/batch references.`)) {
                          repairOrder.mutate(lookupResult.order.id);
                          setOrderSearchQuery('');
                          setOrderSearchInput('');
                        }
                      }}
                      disabled={repairOrder.isPending}
                    >
                      <Wrench className="h-3 w-3 mr-1" /> Repair
                    </Button>
                  )}
                  {(lookupResult.batch && lookupResult.order.reconciliation_status === 'NOT_CLAIMED') && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                      onClick={() => {
                        if (confirm(`Repair order ${lookupResult.order.order_code}? This will remove it from batch and clear any claim references.`)) {
                          repairOrder.mutate(lookupResult.order.id);
                          setOrderSearchQuery('');
                          setOrderSearchInput('');
                        }
                      }}
                      disabled={repairOrder.isPending}
                    >
                      <Wrench className="h-3 w-3 mr-1" /> Repair (Stuck)
                    </Button>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Integrity Check Panel */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm font-medium">Claim Integrity Check</span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant={showIntegrityPanel ? 'default' : 'outline'}
                  onClick={() => {
                    setShowIntegrityPanel(!showIntegrityPanel);
                    if (!showIntegrityPanel && !integrityCheck.data) {
                      integrityCheck.refetch();
                    }
                  }}
                >
                  {showIntegrityPanel ? 'Hide' : 'Run Check'}
                </Button>
              </div>
            </div>

            {showIntegrityPanel && (
              <div className="mt-3 space-y-3">
                {integrityCheck.isLoading || integrityCheck.isFetching ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Scanning for integrity issues...
                  </div>
                ) : integrityCheck.data ? (
                  <>
                    {integrityCheck.data.totalIssues === 0 ? (
                      <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                        <CheckCircle className="h-4 w-4" />
                        No integrity issues found. All claim batch links are valid.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-sm text-orange-700 dark:text-orange-400">
                          <AlertTriangle className="h-4 w-4" />
                          Found {integrityCheck.data.totalIssues} order(s) with integrity issues
                        </div>
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="text-xs">Order</TableHead>
                              <TableHead className="text-xs">Customer</TableHead>
                              <TableHead className="text-xs">Status</TableHead>
                              <TableHead className="text-xs">Delivered</TableHead>
                              <TableHead className="text-xs">Batch</TableHead>
                              <TableHead className="text-xs">Issues</TableHead>
                              <TableHead className="text-xs">Action</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {integrityCheck.data.issues.map((issue) => (
                              <TableRow key={issue.order_id}>
                                <TableCell className="font-mono text-xs font-bold">{issue.order_code}</TableCell>
                                <TableCell className="text-xs">{issue.customer_name}</TableCell>
                                <TableCell className="text-xs">
                                  <Badge variant="outline" className="text-[10px]">{issue.runner_status}</Badge>
                                  <Badge variant="outline" className="text-[10px] ml-1">{issue.reconciliation_status}</Badge>
                                </TableCell>
                                <TableCell className="text-xs">{issue.delivered_at ? format(new Date(issue.delivered_at), 'MMM dd HH:mm') : 'N/A'}</TableCell>
                                <TableCell className="text-xs font-mono">{issue.batch_code || '-'}</TableCell>
                                <TableCell className="text-xs">
                                  {issue.issue_types.map(t => (
                                    <Badge key={t} variant="destructive" className="text-[9px] mr-1 mb-0.5">{t.replace(/_/g, ' ')}</Badge>
                                  ))}
                                </TableCell>
                                <TableCell>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-6 text-xs border-orange-300 text-orange-700 hover:bg-orange-50"
                                    onClick={() => {
                                      if (confirm(`Repair order ${issue.order_code}? This will remove batch link, delete claim, and reset to NOT_CLAIMED.`)) {
                                        repairOrder.mutate(issue.order_id);
                                      }
                                    }}
                                    disabled={repairOrder.isPending}
                                  >
                                    <Wrench className="h-3 w-3 mr-1" /> Repair
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => integrityCheck.refetch()}
                          disabled={integrityCheck.isFetching}
                        >
                          Re-scan
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => integrityCheck.refetch()}>
                    Run Integrity Check
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

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
                      <TableHead></TableHead>
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
                        <TableCell>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => {
                              if (selectedBatch && confirm(`Remove order ${item.order?.order_code} from this batch?`)) {
                                removeOrderFromBatch.mutate({
                                  batchId: selectedBatch.id,
                                  orderId: item.order_id,
                                });
                              }
                            }}
                            disabled={removeOrderFromBatch.isPending}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Remove
                          </Button>
                        </TableCell>
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
