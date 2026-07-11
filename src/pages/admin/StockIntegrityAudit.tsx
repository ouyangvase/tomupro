import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Database, CheckCircle, AlertCircle, RefreshCw, Package,
  ArrowDownToLine, ArrowUpFromLine, Truck, Settings2
} from 'lucide-react';
import {
  useInboundSources, useDeliveredSources,
  useTransferSources, useAdjustmentSources,
} from '@/hooks/useAuditSourceRecords';
import { 
  useFullStockIntegrityAudit, 
  useStockIntegritySummary,
  computeIntegritySummary,
  FullStockIntegrityRow
} from '@/hooks/useFullStockIntegrity';
import { useUsers } from '@/hooks/useUsers';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function StockIntegrityAudit() {
  const { profile } = useAuth();
  const { data: users = [] } = useUsers();
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'MISMATCH' | 'NEGATIVE' | 'OK'>('all');
  const [selectedRow, setSelectedRow] = useState<FullStockIntegrityRow | null>(null);
  
  const { data: summaryData } = useStockIntegritySummary();
  const { data: auditData = [], isLoading, refetch } = useFullStockIntegrityAudit(
    ownerFilter === 'all' ? null : ownerFilter,
    statusFilter === 'all' ? null : statusFilter
  );
  
  // Filter options - only users with stock
  const ownerOptions = useMemo(() => {
    const ownerIds = new Set(auditData.map(r => r.owner_user_id));
    return users.filter(u => ownerIds.has(u.id) || u.role === 'salesperson' || u.role === 'manager');
  }, [users, auditData]);
  
  // Apply local search filter
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return auditData;
    
    const q = searchQuery.toLowerCase();
    return auditData.filter(r => 
      r.sku_code?.toLowerCase().includes(q) ||
      r.sku_name?.toLowerCase().includes(q) ||
      r.owner_name?.toLowerCase().includes(q)
    );
  }, [auditData, searchQuery]);
  
  const localSummary = computeIntegritySummary(filteredData);
  
  // Restrict to admin and runner only
  if (profile?.role !== 'admin' && profile?.role !== 'runner') {
    return (
      <AppLayout>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>Only administrators and runners can access the Stock Integrity Audit.</AlertDescription>
          </Alert>
        </div>
      </AppLayout>
    );
  }
  
  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Database className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Stock Integrity Audit</h1>
            <p className="text-muted-foreground">
              Reconcile inbound vs delivered quantities. Computed from stock_movements ledger.
            </p>
          </div>
        </div>
        
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total SKUs</p>
              <p className="text-2xl font-bold">{summaryData?.total_skus ?? filteredData.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Healthy</p>
              <p className="text-2xl font-bold text-primary">{summaryData?.healthy_count ?? localSummary.healthyCount}</p>
            </CardContent>
          </Card>
          <Card className={(summaryData?.mismatch_count ?? 0) > 0 ? 'border-warning/50' : ''}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Issues</p>
              <p className="text-2xl font-bold text-warning">{summaryData?.mismatch_count ?? localSummary.mismatchCount}</p>
            </CardContent>
          </Card>
          <Card className={(summaryData?.negative_count ?? 0) > 0 ? 'border-destructive/50' : ''}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Negative Balance</p>
              <p className="text-2xl font-bold text-destructive">{summaryData?.negative_count ?? localSummary.negativeCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Health %</p>
              <p className="text-2xl font-bold">{summaryData?.health_percentage ?? localSummary.healthPercentage}%</p>
            </CardContent>
          </Card>
        </div>
        
        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex-1 min-w-[200px]">
                <Input
                  placeholder="Search SKU code or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-9"
                />
              </div>
              
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="w-[180px] h-9">
                  <SelectValue placeholder="All Owners" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Owners</SelectItem>
                  {ownerOptions.map(u => (
                    <SelectItem key={u.id} value={u.id}>{u.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="MISMATCH">Mismatch</SelectItem>
                  <SelectItem value="NEGATIVE">Negative Balance</SelectItem>
                  <SelectItem value="OK">OK Only</SelectItem>
                </SelectContent>
              </Select>
              
              <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
                <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>
        
        {/* Results Table */}
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 border-b">
                  <tr>
                    <th className="p-3 text-left font-medium">Owner</th>
                    <th className="p-3 text-left font-medium">Warehouse</th>
                    <th className="p-3 text-left font-medium">SKU</th>
                    <th className="p-3 text-right font-medium">Inbound</th>
                    <th className="p-3 text-right font-medium">Adjust</th>
                    <th className="p-3 text-right font-medium">Transfer In</th>
                    <th className="p-3 text-right font-medium">Transfer Out</th>
                    <th className="p-3 text-right font-medium">Delivered</th>
                    <th className="p-3 text-right font-medium">Balance</th>
                    <th className="p-3 text-center font-medium">Status</th>
                    <th className="p-3 text-left font-medium">Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredData.length === 0 && (
                    <tr>
                      <td colSpan={11} className="p-8 text-center text-muted-foreground">
                        {isLoading ? 'Loading...' : 'No data found'}
                      </td>
                    </tr>
                  )}
                  {filteredData.map((row, idx) => (
                    <tr 
                      key={`${row.warehouse_id}-${row.product_id}-${idx}`}
                      className={cn(
                        "border-b hover:bg-muted/30 cursor-pointer transition-colors",
                        row.computed_balance < 0 && "bg-destructive/5"
                      )}
                      onClick={() => setSelectedRow(row)}
                    >
                      <td className="p-3">
                        <Badge variant="outline">{row.owner_name}</Badge>
                      </td>
                      <td className="p-3 text-muted-foreground">{row.warehouse_name}</td>
                      <td className="p-3">
                        <div className="flex flex-col">
                          <span className="font-medium">{row.sku_code || '-'}</span>
                          <span className="text-xs text-muted-foreground">{row.sku_name}</span>
                        </div>
                      </td>
                      <td className="p-3 text-right font-mono text-primary">
                        +{row.inbound_qty}
                      </td>
                      <td className="p-3 text-right font-mono text-muted-foreground">
                        {row.adjustment_qty >= 0 ? '+' : ''}{row.adjustment_qty}
                      </td>
                      <td className="p-3 text-right font-mono text-primary">
                        +{row.transfer_in_qty}
                      </td>
                      <td className="p-3 text-right font-mono text-warning">
                        -{row.transfer_out_qty}
                      </td>
                      <td className="p-3 text-right font-mono text-destructive">
                        -{row.delivered_qty}
                      </td>
                      <td className="p-3 text-right">
                        <Badge variant={row.computed_balance < 0 ? 'destructive' : row.computed_balance === 0 ? 'secondary' : 'default'}>
                          {row.computed_balance}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        {row.status === 'NEGATIVE' ? (
                          <AlertCircle className="h-4 w-4 text-destructive inline" />
                        ) : row.status === 'MISMATCH' ? (
                          <AlertCircle className="h-4 w-4 text-warning inline" />
                        ) : (
                          <CheckCircle className="h-4 w-4 text-primary inline" />
                        )}
                      </td>
                      <td className="p-3">
                        {row.issue_label && (
                          <span className="text-xs text-warning">{row.issue_label}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        
        {/* Drilldown Dialog */}
        <DrilldownDialog 
          row={selectedRow} 
          onClose={() => setSelectedRow(null)} 
        />
      </div>
    </AppLayout>
  );
}

function DrilldownDialog({ row, onClose }: { row: FullStockIntegrityRow | null; onClose: () => void }) {
  const { data: inboundRecords = [], isLoading: loadingInbound } = useInboundSources(row?.warehouse_id, row?.product_id);
  const { data: deliveredRecords = [], isLoading: loadingDelivered } = useDeliveredSources(row?.product_id, row?.owner_user_id);
  const { data: transferRecords = [], isLoading: loadingTransfers } = useTransferSources(row?.warehouse_id, row?.product_id);
  const { data: adjustmentRecords = [], isLoading: loadingAdjustments } = useAdjustmentSources(row?.warehouse_id, row?.product_id);

  // Compute totals from source records
  const totals = useMemo(() => {
    const inbound = inboundRecords.reduce((s, r) => s + r.qty, 0);
    const delivered = deliveredRecords.reduce((s, r) => s + r.qty, 0);
    const transferIn = transferRecords.filter(r => r.direction === 'IN').reduce((s, r) => s + r.qty, 0);
    const transferOut = transferRecords.filter(r => r.direction === 'OUT').reduce((s, r) => s + Math.abs(r.qty), 0);
    const positiveAdj = adjustmentRecords.filter(r => r.qty > 0).reduce((s, r) => s + r.qty, 0);
    const negativeAdj = adjustmentRecords.filter(r => r.qty < 0).reduce((s, r) => s + Math.abs(r.qty), 0);
    const balance = inbound + transferIn + positiveAdj - delivered - transferOut - negativeAdj;
    return { inbound, delivered, transferIn, transferOut, positiveAdj, negativeAdj, balance };
  }, [inboundRecords, deliveredRecords, transferRecords, adjustmentRecords]);

  const totalDeduct = totals.delivered + totals.transferOut + totals.negativeAdj;
  const anyLoading = loadingInbound || loadingDelivered || loadingTransfers || loadingAdjustments;
  const dataReady = !anyLoading && (inboundRecords.length > 0 || deliveredRecords.length > 0 || transferRecords.length > 0 || adjustmentRecords.length > 0);

  if (!row) return null;

  const hasReconciliationMismatch = dataReady && row.stored_balance !== totals.balance;

  return (
    <Dialog open={!!row} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-5xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Stock Audit: {row.sku_code} / {row.sku_name}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Owner/Warehouse info */}
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>Owner: <strong className="text-foreground">{row.owner_name}</strong></span>
            <span>Warehouse: <strong className="text-foreground">{row.warehouse_name}</strong></span>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/30">
              <p className="text-xs text-muted-foreground">Inbound</p>
              <p className="text-xl font-bold text-primary">+{anyLoading ? '...' : totals.inbound}</p>
            </div>
            <div className="p-3 rounded-lg bg-blue-500/10 border border-blue-500/30">
              <p className="text-xs text-muted-foreground">Transfer In</p>
              <p className="text-xl font-bold text-blue-600">+{anyLoading ? '...' : totals.transferIn}</p>
            </div>
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
              <p className="text-xs text-muted-foreground">Total Deduct</p>
              <p className="text-xl font-bold text-destructive">-{anyLoading ? '...' : totalDeduct}</p>
            </div>
            <div className={cn(
              "p-3 rounded-lg border",
              totals.balance < 0 ? "bg-destructive/10 border-destructive/30" : "bg-primary/10 border-primary/30"
            )}>
              <p className="text-xs text-muted-foreground">Current Balance</p>
              <p className={cn("text-xl font-bold", totals.balance < 0 ? "text-destructive" : "text-primary")}>
                {anyLoading ? '...' : totals.balance}
              </p>
            </div>
          </div>

          {/* Balance Calculation Breakdown */}
          {dataReady && (
            <Card className="border-dashed">
              <CardHeader className="p-3 pb-1">
                <CardTitle className="text-sm font-semibold">Balance Calculation</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-1">
                <div className="space-y-1 font-mono text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Inbound</span><span className="text-primary font-medium">+{totals.inbound}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Transfer In</span><span className="text-blue-600 font-medium">+{totals.transferIn}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Positive Adjustment</span><span className="text-primary font-medium">+{totals.positiveAdj}</span></div>
                  <div className="border-t my-1" />
                  <div className="flex justify-between"><span className="text-muted-foreground">Delivered</span><span className="text-destructive font-medium">-{totals.delivered}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Transfer Out</span><span className="text-warning font-medium">-{totals.transferOut}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Negative Adjustment</span><span className="text-destructive font-medium">-{totals.negativeAdj}</span></div>
                  <div className="border-t border-foreground/30 my-1" />
                  <div className="flex justify-between font-bold">
                    <span>Current Balance</span>
                    <span className={totals.balance < 0 ? "text-destructive" : "text-primary"}>= {totals.balance}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Reconciliation Check */}
          {dataReady && (
            <div className={cn(
              "rounded-lg border p-3 flex items-start gap-3",
              hasReconciliationMismatch
                ? "bg-destructive/10 border-destructive/40"
                : "bg-primary/5 border-primary/30"
            )}>
              {hasReconciliationMismatch ? (
                <AlertCircle className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
              ) : (
                <CheckCircle className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              )}
              <div className="text-sm">
                <p className="font-semibold">
                  {hasReconciliationMismatch ? 'Reconciliation Mismatch' : 'Reconciliation OK'}
                </p>
                <div className="text-muted-foreground mt-1 space-y-0.5">
                  <p>Calculated Balance (from source records): <strong className="text-foreground">{totals.balance}</strong></p>
                  <p>Stored Inventory Balance: <strong className="text-foreground">{row.stored_balance}</strong></p>
                  {hasReconciliationMismatch && (
                    <p className="text-destructive font-semibold mt-1">
                      Variance: {totals.balance - row.stored_balance > 0 ? '+' : ''}{totals.balance - row.stored_balance}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ===== SOURCE RECORD SECTIONS ===== */}

          {/* Inbound History Source */}
          <SourceSection
            title="Inbound History Source"
            icon={<ArrowDownToLine className="h-4 w-4 text-primary" />}
            count={inboundRecords.length}
            total={totals.inbound}
            totalLabel="Total Inbound"
            totalColor="text-primary"
            isLoading={loadingInbound}
          >
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Tracking</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-left">Created By</th>
                </tr>
              </thead>
              <tbody>
                {inboundRecords.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2 text-muted-foreground">{format(new Date(r.inbound_date), 'MMM dd, HH:mm')}</td>
                    <td className="p-2 text-muted-foreground">{r.tracking_no}</td>
                    <td className="p-2 text-right font-mono text-primary">+{r.qty}</td>
                    <td className="p-2 text-muted-foreground">{r.created_by_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SourceSection>

          {/* Delivered Orders Source */}
          <SourceSection
            title="Delivered Orders Source"
            icon={<Truck className="h-4 w-4 text-destructive" />}
            count={deliveredRecords.length}
            total={totals.delivered}
            totalLabel="Total Delivered"
            totalColor="text-destructive"
            isLoading={loadingDelivered}
          >
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left">Delivered Date</th>
                  <th className="p-2 text-left">Order ID</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-left">Customer</th>
                  <th className="p-2 text-left">Delivered By</th>
                </tr>
              </thead>
              <tbody>
                {deliveredRecords.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2 text-muted-foreground">{r.delivered_at ? format(new Date(r.delivered_at), 'MMM dd, HH:mm') : '-'}</td>
                    <td className="p-2 font-medium">{r.order_code}</td>
                    <td className="p-2 text-right font-mono text-destructive">-{r.qty}</td>
                    <td className="p-2 text-muted-foreground">{r.customer_name}</td>
                    <td className="p-2 text-muted-foreground">{r.delivered_by_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SourceSection>

          {/* Transfer Source */}
          <SourceSection
            title="Transfer Source"
            icon={<ArrowUpFromLine className="h-4 w-4 text-blue-500" />}
            count={transferRecords.length}
            total={null}
            totalLabel=""
            totalColor=""
            isLoading={loadingTransfers}
          >
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Direction</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-left">From / To</th>
                  <th className="p-2 text-left">Created By</th>
                </tr>
              </thead>
              <tbody>
                {transferRecords.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2 text-muted-foreground">{format(new Date(r.transfer_date), 'MMM dd, HH:mm')}</td>
                    <td className="p-2">
                      <Badge variant={r.direction === 'IN' ? 'default' : 'secondary'} className="text-xs">
                        {r.direction === 'IN' ? 'Transfer In' : 'Transfer Out'}
                      </Badge>
                    </td>
                    <td className={cn("p-2 text-right font-mono", r.direction === 'IN' ? "text-blue-600" : "text-warning")}>
                      {r.direction === 'IN' ? '+' : ''}{r.qty}
                    </td>
                    <td className="p-2 text-muted-foreground">{r.counterpart_name}</td>
                    <td className="p-2 text-muted-foreground">{r.created_by_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SourceSection>

          {/* Adjustment Source */}
          <SourceSection
            title="Adjustment Source"
            icon={<Settings2 className="h-4 w-4 text-amber-500" />}
            count={adjustmentRecords.length}
            total={null}
            totalLabel=""
            totalColor=""
            isLoading={loadingAdjustments}
          >
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Type</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-left">Created By</th>
                </tr>
              </thead>
              <tbody>
                {adjustmentRecords.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="p-2 text-muted-foreground">{format(new Date(r.adjustment_date), 'MMM dd, HH:mm')}</td>
                    <td className="p-2">
                      <Badge variant="outline" className="text-xs">{r.movement_type}</Badge>
                    </td>
                    <td className={cn("p-2 text-right font-mono", r.qty > 0 ? "text-primary" : "text-destructive")}>
                      {r.qty > 0 ? '+' : ''}{r.qty}
                    </td>
                    <td className="p-2 text-muted-foreground">{r.created_by_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </SourceSection>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Collapsible source section wrapper */
function SourceSection({
  title, icon, count, total, totalLabel, totalColor, isLoading, children,
}: {
  title: string;
  icon: React.ReactNode;
  count: number;
  total: number | null;
  totalLabel: string;
  totalColor: string;
  isLoading: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);

  return (
    <Card>
      <button
        className="w-full flex items-center justify-between p-3 hover:bg-muted/30 transition-colors rounded-t-lg"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2 text-sm font-semibold">
          {icon}
          {title}
          <Badge variant="outline" className="ml-1 text-xs">{count} records</Badge>
        </div>
        <div className="flex items-center gap-3">
          {total !== null && (
            <span className={cn("text-sm font-mono font-bold", totalColor)}>
              {totalLabel}: {total}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{open ? '▼' : '▶'}</span>
        </div>
      </button>
      {open && (
        <CardContent className="p-0 border-t">
          {isLoading ? (
            <div className="flex items-center justify-center py-6">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            </div>
          ) : count === 0 ? (
            <div className="py-4 text-center text-sm text-muted-foreground">No records</div>
          ) : (
            <div className="overflow-x-auto">{children}</div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
