import { useState, useMemo } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import {
  Database, Search, Wrench, CheckCircle, RefreshCw, Zap, Eye,
  AlertTriangle, Shield, ChevronDown, ChevronRight, Activity,
  Filter, TrendingDown, ArrowUpDown
} from 'lucide-react';
import {
  useFullStockIntegrityAudit,
  useStockIntegritySummary,
  useQuickRepair,
  useFullStockRebuild,
  computeIntegritySummary,
  FullStockIntegrityRow
} from '@/hooks/useFullStockIntegrity';
import { useUsers } from '@/hooks/useUsers';
import capybaraEmpty from '@/assets/capybara-empty.png';

export default function StockIntegrityScan() {
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<'all' | 'negative' | 'mismatch' | 'problems'>('all');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const { data: users = [] } = useUsers();
  const owners = users.filter(u => ['salesperson', 'manager', 'runner'].includes(u.role));

  const { data: summaryData, isLoading: summaryLoading, refetch: refetchSummary } = useStockIntegritySummary();
  const { data: auditData = [], isLoading: auditLoading, refetch: refetchAudit } = useFullStockIntegrityAudit(
    ownerFilter === 'all' ? null : ownerFilter,
    statusFilter === 'all' ? null : statusFilter
  );

  const quickRepair = useQuickRepair();
  const fullRebuild = useFullStockRebuild();

  const filteredData = useMemo(() => {
    let data = auditData;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(row =>
        row.sku_code?.toLowerCase().includes(q) ||
        row.sku_name?.toLowerCase().includes(q) ||
        row.owner_name?.toLowerCase().includes(q) ||
        row.warehouse_name?.toLowerCase().includes(q)
      );
    }

    if (quickFilter === 'negative') data = data.filter(r => r.computed_balance < 0);
    else if (quickFilter === 'mismatch') data = data.filter(r => r.status === 'MISMATCH');
    else if (quickFilter === 'problems') data = data.filter(r => r.status !== 'OK');

    return data;
  }, [auditData, searchQuery, quickFilter]);

  const localSummary = computeIntegritySummary(filteredData);

  const handleRefresh = () => { refetchSummary(); refetchAudit(); };

  const toggleRow = (key: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const healthScore = summaryData?.health_percentage ?? 100;
  const healthColor = healthScore >= 90 ? 'text-[hsl(var(--status-success))]' : healthScore >= 70 ? 'text-[hsl(var(--status-warning))]' : 'text-destructive';

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Stock Integrity</h1>
              <p className="text-sm text-muted-foreground">Ledger-based audit and repair system</p>
            </div>
          </div>
        </div>

        {/* ── Section 1: Stock Health Overview ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <HealthCard
            label="Healthy SKUs"
            value={summaryData?.healthy_count}
            total={summaryData?.total_skus}
            loading={summaryLoading}
            color="success"
            icon={<CheckCircle className="h-5 w-5 text-[hsl(var(--status-success))]" />}
          />
          <HealthCard
            label="Issues Found"
            value={(summaryData?.mismatch_count ?? 0) + (summaryData?.negative_count ?? 0)}
            loading={summaryLoading}
            color="error"
            icon={<AlertTriangle className="h-5 w-5 text-destructive" />}
          />
          <HealthCard
            label="Mismatch"
            value={summaryData?.mismatch_count}
            loading={summaryLoading}
            color="warning"
            icon={<ArrowUpDown className="h-5 w-5 text-[hsl(var(--status-warning))]" />}
          />
          <Card className="relative overflow-hidden">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Health Score</p>
                  {summaryLoading ? (
                    <Skeleton className="h-10 w-20 mt-1" />
                  ) : (
                    <p className={cn("text-4xl font-bold tracking-tight", healthColor)}>
                      {healthScore}%
                    </p>
                  )}
                </div>
                <Activity className={cn("h-8 w-8", healthColor)} />
              </div>
              {/* Progress bar */}
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

        {/* ── Section 2: Repair Actions ── */}
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
                  <Eye className="h-3.5 w-3.5 mr-1.5" />
                  Preview Fix
                </Button>
                <Button size="sm" onClick={() => quickRepair.mutate(false, { onSuccess: handleRefresh })} disabled={quickRepair.isPending}>
                  <Wrench className="h-3.5 w-3.5 mr-1.5" />
                  Apply Repair
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
                  <Search className="h-3.5 w-3.5 mr-1.5" />
                  Preview Rebuild
                </Button>
                <Button variant="destructive" size="sm" onClick={() => fullRebuild.mutate(false, { onSuccess: handleRefresh })} disabled={fullRebuild.isPending}>
                  <Wrench className="h-3.5 w-3.5 mr-1.5" />
                  Run Full Rebuild
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

        {/* ── Section 3: SKU Problem Explorer ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">SKU Problem Explorer</CardTitle>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
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
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search SKU code, name, owner..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue placeholder="All Owners" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Owners</SelectItem>
                  {owners.map(o => <SelectItem key={o.id} value={o.id}>{o.display_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px] h-9">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="OK">OK</SelectItem>
                  <SelectItem value="MISMATCH">Mismatch</SelectItem>
                  <SelectItem value="NEGATIVE">Negative</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Quick Filter Pills */}
            <div className="flex gap-2">
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
                  className="h-7 text-xs gap-1.5"
                  onClick={() => setQuickFilter(f.key)}
                >
                  <f.icon className="h-3 w-3" />
                  {f.label}
                </Button>
              ))}
            </div>

            {/* Table */}
            <ScrollArea className="h-[520px] border rounded-lg">
              <Table>
                <TableHeader className="sticky top-0 bg-card z-10">
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-8" />
                    <TableHead>SKU</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead className="text-right text-[hsl(var(--status-success))]">Inbound</TableHead>
                    <TableHead className="text-right text-destructive">Delivered</TableHead>
                    <TableHead className="text-right font-bold">Balance</TableHead>
                    <TableHead>Issue</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {auditLoading ? (
                    Array.from({ length: 8 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <TableCell key={j}><Skeleton className="h-5 w-full" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredData.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="h-60">
                        <div className="flex flex-col items-center justify-center gap-3">
                          <img src={capybaraEmpty} alt="No data" className="h-24 opacity-60" />
                          <p className="text-sm text-muted-foreground">No SKU issues found. Run an audit to scan.</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredData.map((row, i) => {
                      const key = `${row.warehouse_id}-${row.product_id}`;
                      const isExpanded = expandedRows.has(key);
                      return (
                        <Collapsible key={`${key}-${i}`} asChild open={isExpanded} onOpenChange={() => toggleRow(key)}>
                          <>
                            <CollapsibleTrigger asChild>
                              <TableRow className={cn(
                                "cursor-pointer transition-colors",
                                row.status === 'NEGATIVE' && "bg-destructive/[0.03]",
                                row.status === 'MISMATCH' && "bg-[hsl(var(--status-warning)/0.03)]"
                              )}>
                                <TableCell className="w-8 pr-0">
                                  {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
                                </TableCell>
                                <TableCell>
                                  <div>
                                    <span className="font-mono text-sm font-medium">{row.sku_code || '—'}</span>
                                    <p className="text-xs text-muted-foreground truncate max-w-[180px]">{row.sku_name}</p>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <div className="text-sm">
                                    <p className="font-medium truncate max-w-[140px]">{row.owner_name}</p>
                                    <p className="text-xs text-muted-foreground truncate max-w-[140px]">{row.warehouse_name}</p>
                                  </div>
                                </TableCell>
                                <TableCell className="text-right font-mono text-[hsl(var(--status-success))]">+{row.inbound_qty}</TableCell>
                                <TableCell className="text-right font-mono text-destructive">-{row.delivered_qty}</TableCell>
                                <TableCell className={cn("text-right font-mono font-bold", row.computed_balance < 0 && "text-destructive")}>
                                  {row.computed_balance}
                                </TableCell>
                                <TableCell>
                                  <StatusBadgeInline status={row.status} issue={row.issue_label} />
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button variant="ghost" size="sm" className="h-7 text-xs">
                                    <Eye className="h-3 w-3 mr-1" /> Details
                                  </Button>
                                </TableCell>
                              </TableRow>
                            </CollapsibleTrigger>
                            <CollapsibleContent asChild>
                              <TableRow className="bg-muted/30 hover:bg-muted/30">
                                <TableCell colSpan={8} className="py-3">
                                  <div className="grid grid-cols-4 gap-4 px-4">
                                    <DetailStat label="Adjustments" value={row.adjustment_qty} />
                                    <DetailStat label="Transfer In" value={row.transfer_in_qty} positive />
                                    <DetailStat label="Transfer Out" value={row.transfer_out_qty} negative />
                                    <DetailStat label="Driver Allocate" value={row.driver_allocate_qty} negative />
                                  </div>
                                  {row.issue_label && (
                                    <p className="text-xs text-destructive mt-2 px-4 flex items-center gap-1">
                                      <AlertTriangle className="h-3 w-3" />
                                      {row.issue_label}
                                    </p>
                                  )}
                                </TableCell>
                              </TableRow>
                            </CollapsibleContent>
                          </>
                        </Collapsible>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}

/* ── Sub-components ── */

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

function StatusBadgeInline({ status, issue }: { status: string; issue: string | null }) {
  if (status === 'OK') {
    return <Badge variant="success" className="text-[10px]">OK</Badge>;
  }
  if (status === 'NEGATIVE') {
    return <Badge variant="error" className="text-[10px]">Negative</Badge>;
  }
  if (status === 'MISMATCH') {
    return <Badge variant="warning" className="text-[10px]">Mismatch</Badge>;
  }
  return <Badge variant="outline" className="text-[10px]">{status}</Badge>;
}

function DetailStat({ label, value, positive, negative }: {
  label: string;
  value: number;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="rounded-md bg-background p-2 text-center">
      <p className={cn(
        "text-base font-bold font-mono",
        positive && "text-[hsl(var(--status-success))]",
        negative && value > 0 && "text-destructive"
      )}>
        {positive ? '+' : negative ? '-' : ''}{value}
      </p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}
