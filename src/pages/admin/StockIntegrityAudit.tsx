import { useEffect, useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Database, CheckCircle, AlertCircle, RefreshCw, Package,
  ArrowDownToLine, ArrowUpFromLine, Truck, Settings2,
  Shield, Zap, Eye, Wrench, Search, Activity,
  AlertTriangle, Filter, TrendingDown, ArrowUpDown
} from 'lucide-react';
import {
  useInboundSources, useDeliveredSources,
  useTransferSources, useAdjustmentSources,
} from '@/hooks/useAuditSourceRecords';
import {
  useFullStockIntegrityAudit,
  useStockIntegritySummary,
  useQuickRepair,
  useFullStockRebuild,
  computeIntegritySummary,
  FullStockIntegrityRow
} from '@/hooks/useFullStockIntegrity';
import { useUsers } from '@/hooks/useUsers';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { useVisibleUserIds } from '@/hooks/useTeamVisibility';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

/* ════════════════════════════════════════════════════════════════════
   MAIN COMPONENT — combined Stock Audit + Rebuild
   ════════════════════════════════════════════════════════════════════ */
export default function StockIntegrityAudit() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const isAdmin = profile?.role === 'admin';
  const role = profile?.role;
  const isScopedStockRole = role === 'manager' || role === 'salesperson';
  const canAccessStockAudit = role === 'admin' || role === 'runner' || isScopedStockRole;
  const { data: users = [] } = useUsers();
  const { visibleUserIds, isLoading: visibilityLoading } = useVisibleUserIds('stock');

  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'MISMATCH' | 'NEGATIVE' | 'OK'>('all');
  const [quickFilter, setQuickFilter] = useState<'all' | 'negative' | 'mismatch' | 'problems'>('all');
  const [selectedRow, setSelectedRow] = useState<FullStockIntegrityRow | null>(null);

  const scopedOwnerIds = useMemo(() => {
    if (!profile?.id) return [];
    if (role === 'salesperson') return [profile.id];
    if (role === 'manager') return visibleUserIds ?? [];
    return [];
  }, [profile?.id, role, visibleUserIds]);

  const effectiveOwnerFilter = useMemo<string | string[] | null>(() => {
    if (isScopedStockRole) {
      if (ownerFilter === 'all') return scopedOwnerIds;
      return scopedOwnerIds.includes(ownerFilter) ? ownerFilter : [];
    }

    return ownerFilter === 'all' ? null : ownerFilter;
  }, [isScopedStockRole, ownerFilter, scopedOwnerIds]);

  const { data: summaryData, isLoading: summaryLoading, refetch: refetchSummary } = useStockIntegritySummary(!isScopedStockRole);
  const { data: auditData = [], isLoading, refetch: refetchAudit } = useFullStockIntegrityAudit(
    effectiveOwnerFilter,
    statusFilter === 'all' ? null : statusFilter
  );

  const quickRepair = useQuickRepair();
  const fullRebuild = useFullStockRebuild();

  const handleRefresh = () => {
    if (!isScopedStockRole) refetchSummary();
    refetchAudit();
  };

  useEffect(() => {
    if (!isScopedStockRole || ownerFilter === 'all') return;
    if (!scopedOwnerIds.includes(ownerFilter)) setOwnerFilter('all');
  }, [isScopedStockRole, ownerFilter, scopedOwnerIds]);

  // Filter options
  const ownerOptions = useMemo(() => {
    if (isScopedStockRole) {
      const allowedOwnerIds = new Set(scopedOwnerIds);
      return users.filter(u => allowedOwnerIds.has(u.id));
    }

    const ownerIds = new Set(auditData.map(r => r.owner_user_id));
    return users.filter(u => ownerIds.has(u.id) || u.role === 'salesperson' || u.role === 'manager');
  }, [isScopedStockRole, scopedOwnerIds, users, auditData]);

  // Apply local filters
  const filteredData = useMemo(() => {
    let data = auditData;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      data = data.filter(r =>
        r.sku_code?.toLowerCase().includes(q) ||
        r.sku_name?.toLowerCase().includes(q) ||
        r.owner_name?.toLowerCase().includes(q) ||
        r.warehouse_name?.toLowerCase().includes(q)
      );
    }
    if (quickFilter === 'negative') data = data.filter(r => r.computed_balance < 0);
    else if (quickFilter === 'mismatch') data = data.filter(r => r.status === 'MISMATCH');
    else if (quickFilter === 'problems') data = data.filter(r => r.status !== 'OK');
    return data;
  }, [auditData, searchQuery, quickFilter]);

  const localSummary = computeIntegritySummary(filteredData);
  const scopedSummary = computeIntegritySummary(auditData);
  const visibleSummary = isScopedStockRole
    ? {
        total_skus: scopedSummary.totalSkus,
        healthy_count: scopedSummary.healthyCount,
        mismatch_count: scopedSummary.mismatchCount,
        negative_count: scopedSummary.negativeCount,
        health_percentage: scopedSummary.healthPercentage,
      }
    : summaryData;
  const visibleSummaryLoading = isScopedStockRole ? isLoading || visibilityLoading : summaryLoading;

  // Access control
  if (!canAccessStockAudit) {
    return (
      <AppLayout>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>Only administrators, runners, managers, and salespersons can access Stock Audit.</AlertDescription>
          </Alert>
        </div>
      </AppLayout>
    );
  }

  const healthScore = visibleSummary?.health_percentage ?? 100;
  const healthColor = healthScore >= 90 ? 'text-[hsl(var(--status-success))]' : healthScore >= 70 ? 'text-[hsl(var(--status-warning))]' : 'text-destructive';

  return (
    <AppLayout>
      <div className="w-full max-w-full space-y-4 overflow-hidden pb-24 md:space-y-6 md:p-6 md:pb-6">
        {/* ── Header ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Stock Integrity</h1>
              <p className="text-sm text-muted-foreground">Ledger-based audit, reconciliation, and repair</p>
            </div>
          </div>
        </div>

        {/* ── Section 1: Health Overview ── */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
          <HealthCard
            label="Healthy SKUs"
            value={visibleSummary?.healthy_count}
            total={visibleSummary?.total_skus}
            loading={visibleSummaryLoading}
            color="success"
            icon={<CheckCircle className="h-5 w-5 text-[hsl(var(--status-success))]" />}
          />
          <HealthCard
            label="Issues Found"
            value={(visibleSummary?.mismatch_count ?? 0) + (visibleSummary?.negative_count ?? 0)}
            loading={visibleSummaryLoading}
            color="error"
            icon={<AlertTriangle className="h-5 w-5 text-destructive" />}
          />
          <HealthCard
            label="Mismatch"
            value={visibleSummary?.mismatch_count}
            loading={visibleSummaryLoading}
            color="warning"
            icon={<ArrowUpDown className="h-5 w-5 text-[hsl(var(--status-warning))]" />}
          />
          <Card className="relative overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Health Score</p>
                  {visibleSummaryLoading ? (
                    <Skeleton className="h-10 w-20 mt-1" />
                  ) : (
                    <p className={cn("text-4xl font-bold tracking-tight", healthColor)}>{healthScore}%</p>
                  )}
                </div>
                <Activity className={cn("h-8 w-8", healthColor)} />
              </div>
              <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    healthScore >= 90 ? "bg-[hsl(var(--status-success))]" : healthScore >= 70 ? "bg-[hsl(var(--status-warning))]" : "bg-destructive"
                  )}
                  style={{ width: `${healthScore}%` }}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Section 2: Repair Actions (admin only) ── */}
        {isAdmin && (
          <div className="grid md:grid-cols-2 gap-4">
            {/* Quick Repair */}
            <Card className="border-primary/30">
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary/10">
                    <Zap className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Quick Repair</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Fix missing stock deductions safely. Idempotent.</p>
                  </div>
                </div>
                <Badge variant="outline" className="w-fit text-[10px] mt-2 border-primary/30 text-primary">Recommended</Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => quickRepair.mutate(true)} disabled={quickRepair.isPending}>
                    <Eye className="h-3.5 w-3.5 mr-1.5" />Preview Fix
                  </Button>
                  <Button size="sm" onClick={() => quickRepair.mutate(false, { onSuccess: handleRefresh })} disabled={quickRepair.isPending}>
                    <Wrench className="h-3.5 w-3.5 mr-1.5" />Apply Repair
                  </Button>
                </div>
                {quickRepair.data && (
                  <RepairResultCard
                    dryRun={quickRepair.data.dry_run}
                    stats={[
                      { label: 'Missing', value: quickRepair.data.missing_deductions, color: 'text-[hsl(var(--status-warning))]' },
                      { label: 'Fixed', value: quickRepair.data.fixed_deductions, color: 'text-[hsl(var(--status-success))]' },
                      { label: 'Queue Cleared', value: quickRepair.data.queue_cleared, color: 'text-primary' },
                    ]}
                    allClear={quickRepair.data.dry_run && quickRepair.data.missing_deductions === 0}
                  />
                )}
              </CardContent>
            </Card>

            {/* Full Rebuild */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-secondary">
                    <RefreshCw className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <CardTitle className="text-base">Full System Rebuild</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">Recalculate all warehouse balances from ledger.</p>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => fullRebuild.mutate(true)} disabled={fullRebuild.isPending}>
                    <Search className="h-3.5 w-3.5 mr-1.5" />Preview Rebuild
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => fullRebuild.mutate(false, { onSuccess: handleRefresh })} disabled={fullRebuild.isPending}>
                    <Wrench className="h-3.5 w-3.5 mr-1.5" />Run Full Rebuild
                  </Button>
                </div>
                {fullRebuild.data && (
                  <RepairResultCard
                    dryRun={fullRebuild.data.dry_run}
                    stats={[
                      { label: 'Scanned', value: fullRebuild.data.total_skus_scanned, color: 'text-foreground' },
                      { label: 'OK', value: fullRebuild.data.ok_count, color: 'text-[hsl(var(--status-success))]' },
                      { label: 'Mismatch', value: fullRebuild.data.mismatch_count, color: 'text-[hsl(var(--status-warning))]' },
                      { label: 'Negative', value: fullRebuild.data.negative_count, color: 'text-destructive' },
                      { label: 'Fixed', value: fullRebuild.data.missing_deductions_fixed, color: 'text-primary' },
                    ]}
                  />
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Section 3: Detailed SKU Audit Table ── */}
        <Card className="w-full max-w-full overflow-hidden">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Detailed SKU Audit</CardTitle>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span className="text-[hsl(var(--status-success))] font-medium">{localSummary.healthyCount} OK</span>
                <span>·</span>
                <span className="text-[hsl(var(--status-warning))] font-medium">{localSummary.mismatchCount} Mismatch</span>
                <span>·</span>
                <span className="text-destructive font-medium">{localSummary.negativeCount} Negative</span>
                <span>·</span>
                <span>{filteredData.length} total</span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filter Bar */}
            <div className="flex flex-col gap-3 md:flex-row md:flex-wrap">
              <div className="relative w-full md:min-w-[200px] md:flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search SKU code, name, owner..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="h-9 w-full md:w-[180px]">
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
                <SelectTrigger className="h-9 w-full md:w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="MISMATCH">Mismatch</SelectItem>
                  <SelectItem value="NEGATIVE">Negative Balance</SelectItem>
                  <SelectItem value="OK">OK Only</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Quick Filter Pills */}
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:px-0">
              {[
                { key: 'all' as const, label: 'All SKUs', icon: Filter },
                { key: 'problems' as const, label: 'Problems Only', icon: AlertTriangle },
                { key: 'negative' as const, label: 'Negative Balance', icon: TrendingDown },
                { key: 'mismatch' as const, label: 'Mismatch', icon: ArrowUpDown },
              ].map(f => (
                <Button
                  key={f.key}
                  variant={quickFilter === f.key ? 'default' : 'outline'}
                  size="sm"
                  className="h-9 shrink-0 gap-1.5 rounded-full text-xs md:h-7"
                  onClick={() => setQuickFilter(f.key)}
                >
                  <f.icon className="h-3 w-3" />
                  {f.label}
                </Button>
              ))}
            </div>

            {/* Results Table */}
            {isMobile ? (
              <div className="max-h-[58vh] space-y-3 overflow-y-auto pr-1">
                {isLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i}>
                      <CardContent className="space-y-3 p-4">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                      </CardContent>
                    </Card>
                  ))
                ) : filteredData.length === 0 ? (
                  <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">
                    No data found
                  </div>
                ) : (
                  filteredData.map((row, idx) => (
                    <StockAuditMobileCard
                      key={`${row.warehouse_id}-${row.product_id}-${idx}`}
                      row={row}
                      onClick={() => setSelectedRow(row)}
                    />
                  ))
                )}
              </div>
            ) : (
            <ScrollArea className="h-[520px] border rounded-lg">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 border-b sticky top-0 z-10">
                    <tr>
                      <th className="p-3 text-left font-medium">Owner</th>
                      <th className="p-3 text-left font-medium">Warehouse</th>
                      <th className="p-3 text-left font-medium">SKU</th>
                      <th className="p-3 text-right font-medium">Inbound</th>
                      <th className="p-3 text-right font-medium">Adjust</th>
                      <th className="p-3 text-right font-medium">Xfer In</th>
                      <th className="p-3 text-right font-medium">Xfer Out</th>
                      <th className="p-3 text-right font-medium">Delivered</th>
                      <th className="p-3 text-right font-medium">Balance</th>
                      <th className="p-3 text-center font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {isLoading ? (
                      Array.from({ length: 6 }).map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 10 }).map((_, j) => (
                            <td key={j} className="p-3"><Skeleton className="h-5 w-full" /></td>
                          ))}
                        </tr>
                      ))
                    ) : filteredData.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="p-8 text-center text-muted-foreground">
                          No data found
                        </td>
                      </tr>
                    ) : (
                      filteredData.map((row, idx) => (
                        <tr
                          key={`${row.warehouse_id}-${row.product_id}-${idx}`}
                          className={cn(
                            "border-b hover:bg-muted/30 cursor-pointer transition-colors",
                            row.computed_balance < 0 && "bg-destructive/5",
                            row.status === 'MISMATCH' && "bg-[hsl(var(--status-warning)/0.03)]"
                          )}
                          onClick={() => setSelectedRow(row)}
                        >
                          <td className="p-3">
                            <Badge variant="outline">{row.owner_name}</Badge>
                          </td>
                          <td className="p-3 text-muted-foreground text-xs">{row.warehouse_name}</td>
                          <td className="p-3">
                            <div className="flex flex-col">
                              <span className="font-mono text-sm font-medium">{row.sku_code || '—'}</span>
                              <span className="text-xs text-muted-foreground truncate max-w-[180px]">{row.sku_name}</span>
                            </div>
                          </td>
                          <td className="p-3 text-right font-mono text-[hsl(var(--status-success))]">+{row.inbound_qty}</td>
                          <td className="p-3 text-right font-mono text-muted-foreground">
                            {row.adjustment_qty >= 0 ? '+' : ''}{row.adjustment_qty}
                          </td>
                          <td className="p-3 text-right font-mono text-primary">+{row.transfer_in_qty}</td>
                          <td className="p-3 text-right font-mono text-[hsl(var(--status-warning))]">-{row.transfer_out_qty}</td>
                          <td className="p-3 text-right font-mono text-destructive">-{row.delivered_qty}</td>
                          <td className="p-3 text-right">
                            <Badge variant={row.computed_balance < 0 ? 'destructive' : row.computed_balance === 0 ? 'secondary' : 'default'}>
                              {row.computed_balance}
                            </Badge>
                          </td>
                          <td className="p-3 text-center">
                            {row.status === 'NEGATIVE' ? (
                              <Badge variant="destructive" className="text-[10px]">Negative</Badge>
                            ) : row.status === 'MISMATCH' ? (
                              <Badge variant="outline" className="text-[10px] border-[hsl(var(--status-warning))] text-[hsl(var(--status-warning))]">Mismatch</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] border-[hsl(var(--status-success))] text-[hsl(var(--status-success))]">OK</Badge>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Drilldown Dialog */}
        <DrilldownDialog row={selectedRow} onClose={() => setSelectedRow(null)} />
      </div>
    </AppLayout>
  );
}

/* ════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ════════════════════════════════════════════════════════════════════ */

function StockAuditMobileCard({ row, onClick }: {
  row: FullStockIntegrityRow;
  onClick: () => void;
}) {
  const balanceVariant = row.computed_balance < 0 ? 'destructive' : row.computed_balance === 0 ? 'secondary' : 'default';

  return (
    <Card
      className={cn(
        "w-full cursor-pointer overflow-hidden border-border/70",
        row.computed_balance < 0 && "border-destructive/30 bg-destructive/5",
        row.status === 'MISMATCH' && "border-[hsl(var(--status-warning)/0.35)] bg-[hsl(var(--status-warning)/0.04)]"
      )}
      onClick={onClick}
    >
      <CardContent className="space-y-3 p-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="break-all font-mono text-base font-semibold leading-tight">{row.sku_code || '-'}</p>
            <p className="mt-1 whitespace-normal break-words text-sm leading-snug text-muted-foreground">
              {row.sku_name || 'Unnamed product'}
            </p>
          </div>
          <Badge variant={balanceVariant} className="shrink-0">
            {row.computed_balance}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg bg-muted/40 p-2">
            <p className="text-muted-foreground">Owner</p>
            <p className="mt-0.5 break-words font-medium">{row.owner_name || '-'}</p>
          </div>
          <div className="rounded-lg bg-muted/40 p-2">
            <p className="text-muted-foreground">Warehouse</p>
            <p className="mt-0.5 break-words font-medium">{row.warehouse_name || '-'}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <AuditQty label="Inbound" value={`+${row.inbound_qty}`} className="text-[hsl(var(--status-success))]" />
          <AuditQty label="Transfer" value={`${row.transfer_in_qty - row.transfer_out_qty}`} className="text-primary" />
          <AuditQty label="Delivered" value={`-${row.delivered_qty}`} className="text-destructive" />
        </div>

        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <span className="text-xs text-muted-foreground">Status</span>
          {row.status === 'NEGATIVE' ? (
            <Badge variant="destructive" className="text-[10px]">Negative</Badge>
          ) : row.status === 'MISMATCH' ? (
            <Badge variant="outline" className="border-[hsl(var(--status-warning))] text-[10px] text-[hsl(var(--status-warning))]">Mismatch</Badge>
          ) : (
            <Badge variant="outline" className="border-[hsl(var(--status-success))] text-[10px] text-[hsl(var(--status-success))]">OK</Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function AuditQty({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className="rounded-lg bg-muted/40 p-2">
      <p className={cn("font-mono text-sm font-semibold", className)}>{value}</p>
      <p className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
    </div>
  );
}

function HealthCard({ label, value, total, loading, color, icon }: {
  label: string;
  value?: number;
  total?: number;
  loading: boolean;
  color: 'success' | 'error' | 'warning';
  icon: React.ReactNode;
}) {
  const borderColor = {
    success: 'border-[hsl(var(--status-success)/0.2)]',
    error: 'border-destructive/20',
    warning: 'border-[hsl(var(--status-warning)/0.2)]',
  }[color];

  return (
    <Card className={cn(borderColor)}>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
            {loading ? (
              <Skeleton className="h-10 w-16 mt-1" />
            ) : (
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-3xl font-bold tracking-tight">{value ?? 0}</span>
                {total !== undefined && <span className="text-sm text-muted-foreground">/ {total}</span>}
              </div>
            )}
          </div>
          {icon}
        </div>
      </CardContent>
    </Card>
  );
}

function RepairResultCard({ dryRun, stats, allClear }: {
  dryRun: boolean;
  stats: { label: string; value: number; color: string }[];
  allClear?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
      <Badge variant={dryRun ? 'secondary' : 'default'} className="text-[10px]">
        {dryRun ? 'Preview' : 'Applied'}
      </Badge>
      <div className="grid grid-cols-3 gap-2">
        {stats.map(s => (
          <div key={s.label} className="text-center">
            <p className={cn("text-lg font-bold", s.color)}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground">{s.label}</p>
          </div>
        ))}
      </div>
      {allClear && (
        <div className="flex items-center gap-1.5 text-xs text-[hsl(var(--status-success))]">
          <CheckCircle className="h-3.5 w-3.5" />
          No missing deductions found
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════
   DRILLDOWN DIALOG — source record details
   ════════════════════════════════════════════════════════════════════ */

function DrilldownDialog({ row, onClose }: { row: FullStockIntegrityRow | null; onClose: () => void }) {
  const { data: inboundRecords = [], isLoading: loadingInbound } = useInboundSources(row?.warehouse_id, row?.product_id);
  const { data: deliveredRecords = [], isLoading: loadingDelivered } = useDeliveredSources(row?.product_id, row?.owner_user_id);
  const { data: transferRecords = [], isLoading: loadingTransfers } = useTransferSources(row?.warehouse_id, row?.product_id);
  const { data: adjustmentRecords = [], isLoading: loadingAdjustments } = useAdjustmentSources(row?.warehouse_id, row?.product_id);

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
                  <div className="flex justify-between"><span className="text-muted-foreground">Transfer Out</span><span className="text-[hsl(var(--status-warning))] font-medium">-{totals.transferOut}</span></div>
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
                    <td className={cn("p-2 text-right font-mono", r.direction === 'IN' ? "text-blue-600" : "text-[hsl(var(--status-warning))]")}>
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
