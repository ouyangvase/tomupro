import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Database, Search, Wrench, CheckCircle, AlertCircle, RefreshCw, Zap, Eye, AlertTriangle } from 'lucide-react';
import { 
  useFullStockIntegrityAudit, 
  useStockIntegritySummary, 
  useQuickRepair, 
  useFullStockRebuild,
  computeIntegritySummary,
  FullStockIntegrityRow
} from '@/hooks/useFullStockIntegrity';
import { useUsers } from '@/hooks/useUsers';

export default function StockIntegrityScan() {
  const queryClient = useQueryClient();
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAuditResults, setShowAuditResults] = useState(false);
  
  const { data: users = [] } = useUsers();
  const owners = users.filter(u => ['salesperson', 'manager', 'runner'].includes(u.role));
  
  const { data: summaryData, isLoading: summaryLoading, refetch: refetchSummary } = useStockIntegritySummary();
  const { data: auditData = [], isLoading: auditLoading, refetch: refetchAudit } = useFullStockIntegrityAudit(
    ownerFilter === 'all' ? null : ownerFilter,
    statusFilter === 'all' ? null : statusFilter
  );
  
  const quickRepair = useQuickRepair();
  const fullRebuild = useFullStockRebuild();
  
  // Filter by search query
  const filteredData = auditData.filter(row => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      row.sku_code?.toLowerCase().includes(q) ||
      row.sku_name?.toLowerCase().includes(q) ||
      row.owner_name?.toLowerCase().includes(q)
    );
  });
  
  const localSummary = computeIntegritySummary(filteredData);
  
  const handleRefresh = () => {
    refetchSummary();
    refetchAudit();
  };
  
  const handlePreviewIssues = () => {
    quickRepair.mutate(true);
  };
  
  const handleApplyQuickRepair = () => {
    quickRepair.mutate(false, {
      onSuccess: () => {
        handleRefresh();
      }
    });
  };
  
  const handlePreviewFullRebuild = () => {
    fullRebuild.mutate(true);
    setShowAuditResults(true);
  };
  
  const handleApplyFullRebuild = () => {
    fullRebuild.mutate(false, {
      onSuccess: () => {
        handleRefresh();
      }
    });
  };
  
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'OK':
        return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/30">OK</Badge>;
      case 'MISMATCH':
        return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-500 border-yellow-500/30">Mismatch</Badge>;
      case 'NEGATIVE':
        return <Badge variant="outline" className="bg-red-500/10 text-red-500 border-red-500/30">Negative</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Database className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Stock Integrity Rebuild</h1>
            <p className="text-muted-foreground">Full ledger-based audit and repair for all SKUs</p>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Total SKUs</p>
              <p className="text-3xl font-bold">{summaryData?.total_skus ?? '-'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Healthy</p>
              <p className="text-3xl font-bold text-green-500">{summaryData?.healthy_count ?? '-'}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Mismatches</p>
              <p className="text-3xl font-bold text-yellow-500">{summaryData?.mismatch_count ?? 0}</p>
            </CardContent>
          </Card>
          <Card className="border-red-500/30">
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Negative Balance</p>
              <p className="text-3xl font-bold text-red-500">{summaryData?.negative_count ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <p className="text-sm text-muted-foreground">Health %</p>
              <p className="text-3xl font-bold">{summaryData?.health_percentage ?? 100}%</p>
            </CardContent>
          </Card>
        </div>

        {/* Quick Repair Card */}
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Quick Repair (Recommended)
            </CardTitle>
            <CardDescription>
              Fast database-level bulk repair. Creates missing stock deductions for all DELIVERED orders 
              using SQL aggregation (no edge function timeouts). Idempotent - safe to run multiple times.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <Button 
                variant="outline" 
                onClick={handlePreviewIssues}
                disabled={quickRepair.isPending}
              >
                <Eye className="h-4 w-4 mr-2" />
                {quickRepair.isPending ? 'Scanning...' : 'Preview Issues (Dry Run)'}
              </Button>
              
              <Button 
                variant="default" 
                onClick={handleApplyQuickRepair}
                disabled={quickRepair.isPending}
              >
                <Wrench className="h-4 w-4 mr-2" />
                Apply Quick Repair
              </Button>
            </div>

            {/* Quick Repair Results */}
            {quickRepair.data && (
              <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
                <div className="flex items-center gap-2 mb-4">
                  <Badge variant={quickRepair.data.dry_run ? 'secondary' : 'default'}>
                    {quickRepair.data.dry_run ? 'Preview' : 'Applied'}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-3 rounded-lg bg-background">
                    <p className="text-sm text-muted-foreground">Missing Deductions</p>
                    <p className="text-2xl font-bold text-orange-500">{quickRepair.data.missing_deductions}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-background">
                    <p className="text-sm text-muted-foreground">Fixed Deductions</p>
                    <p className="text-2xl font-bold text-green-500">{quickRepair.data.fixed_deductions}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-background">
                    <p className="text-sm text-muted-foreground">Queue Cleared</p>
                    <p className="text-2xl font-bold text-blue-500">{quickRepair.data.queue_cleared}</p>
                  </div>
                </div>

                {quickRepair.data.dry_run && quickRepair.data.missing_deductions === 0 && (
                  <Alert className="bg-green-500/10 border-green-500/30">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <AlertTitle className="text-green-500">All Clear</AlertTitle>
                    <AlertDescription>
                      No missing stock deductions found.
                    </AlertDescription>
                  </Alert>
                )}

                {!quickRepair.data.dry_run && (
                  <Alert className="bg-green-500/10 border-green-500/30">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <AlertTitle className="text-green-500">Repair Complete</AlertTitle>
                    <AlertDescription>
                      Stock deductions created. Balances are now correct.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Full Rebuild Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Full Stock Integrity Rebuild
            </CardTitle>
            <CardDescription>
              Complete ledger audit for ALL owner/warehouse/SKU combinations. 
              Computes balance from: Inbound + Adjustments + Transfer In + Returns - Transfer Out - Delivered - Driver Allocate.
              Shows detailed breakdown and creates any missing deductions.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <Button 
                variant="outline" 
                onClick={handlePreviewFullRebuild}
                disabled={fullRebuild.isPending}
              >
                <Search className="h-4 w-4 mr-2" />
                {fullRebuild.isPending ? 'Scanning...' : 'Preview Full Audit'}
              </Button>
              
              <Button 
                variant="destructive" 
                onClick={handleApplyFullRebuild}
                disabled={fullRebuild.isPending}
              >
                <Wrench className="h-4 w-4 mr-2" />
                Apply Full Rebuild
              </Button>
              
              <Button variant="ghost" onClick={handleRefresh}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>

            {/* Full Rebuild Results */}
            {fullRebuild.data && (
              <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
                <div className="flex items-center gap-2 mb-4">
                  <Badge variant={fullRebuild.data.dry_run ? 'secondary' : 'default'}>
                    {fullRebuild.data.dry_run ? 'Preview' : 'Applied'}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="p-3 rounded-lg bg-background">
                    <p className="text-sm text-muted-foreground">SKUs Scanned</p>
                    <p className="text-2xl font-bold">{fullRebuild.data.total_skus_scanned}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-background">
                    <p className="text-sm text-muted-foreground">OK</p>
                    <p className="text-2xl font-bold text-green-500">{fullRebuild.data.ok_count}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-background">
                    <p className="text-sm text-muted-foreground">Mismatches</p>
                    <p className="text-2xl font-bold text-yellow-500">{fullRebuild.data.mismatch_count}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-background">
                    <p className="text-sm text-muted-foreground">Negative</p>
                    <p className="text-2xl font-bold text-red-500">{fullRebuild.data.negative_count}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-background">
                    <p className="text-sm text-muted-foreground">Deductions Fixed</p>
                    <p className="text-2xl font-bold text-blue-500">{fullRebuild.data.missing_deductions_fixed}</p>
                  </div>
                </div>

                {!fullRebuild.data.dry_run && (
                  <Alert className="bg-green-500/10 border-green-500/30">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <AlertTitle className="text-green-500">Full Rebuild Complete</AlertTitle>
                    <AlertDescription>
                      All missing deductions created. Stock balances are now computed from ledger.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Detailed Audit Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" />
              Detailed SKU Audit
            </CardTitle>
            <CardDescription>
              Full breakdown by owner/warehouse/SKU. Balance = Inbound + Adjust + TransferIn + Returns - TransferOut - Delivered - DriverAllocate
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-4">
              <div className="flex-1 min-w-[200px]">
                <Input
                  placeholder="Search SKU code or name..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Select value={ownerFilter} onValueChange={setOwnerFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="All Owners" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Owners</SelectItem>
                  {owners.map(owner => (
                    <SelectItem key={owner.id} value={owner.id}>
                      {owner.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="OK">OK</SelectItem>
                  <SelectItem value="MISMATCH">Mismatch</SelectItem>
                  <SelectItem value="NEGATIVE">Negative</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={handleRefresh} disabled={auditLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${auditLoading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {/* Summary of filtered data */}
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>Showing: {filteredData.length} SKUs</span>
              <span>|</span>
              <span className="text-green-500">{localSummary.healthyCount} OK</span>
              <span className="text-yellow-500">{localSummary.mismatchCount} Mismatch</span>
              <span className="text-red-500">{localSummary.negativeCount} Negative</span>
            </div>

            {/* Table */}
            <ScrollArea className="h-[500px] border rounded-lg">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead>Owner</TableHead>
                    <TableHead>Warehouse</TableHead>
                    <TableHead>SKU</TableHead>
                    <TableHead className="text-right text-green-600">Inbound</TableHead>
                    <TableHead className="text-right">Adjust</TableHead>
                    <TableHead className="text-right text-blue-600">Transfer In</TableHead>
                    <TableHead className="text-right text-orange-600">Transfer Out</TableHead>
                    <TableHead className="text-right text-red-600">Delivered</TableHead>
                    <TableHead className="text-right font-bold">Balance</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Issue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((row, i) => (
                    <TableRow key={`${row.warehouse_id}-${row.product_id}-${i}`}>
                      <TableCell>
                        <Badge variant="outline">{row.owner_name}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{row.warehouse_name}</TableCell>
                      <TableCell>
                        <div>
                          <span className="font-mono text-sm">{row.sku_code || '-'}</span>
                          <p className="text-xs text-muted-foreground truncate max-w-[150px]">{row.sku_name}</p>
                        </div>
                      </TableCell>
                      <TableCell className="text-right text-green-600">+{row.inbound_qty}</TableCell>
                      <TableCell className="text-right">{row.adjustment_qty >= 0 ? '+' : ''}{row.adjustment_qty}</TableCell>
                      <TableCell className="text-right text-blue-600">+{row.transfer_in_qty}</TableCell>
                      <TableCell className="text-right text-orange-600">-{row.transfer_out_qty}</TableCell>
                      <TableCell className="text-right text-red-600">-{row.delivered_qty}</TableCell>
                      <TableCell className={`text-right font-bold ${row.computed_balance < 0 ? 'text-red-600' : ''}`}>
                        {row.computed_balance}
                      </TableCell>
                      <TableCell>{getStatusBadge(row.status)}</TableCell>
                      <TableCell className="text-xs text-red-500 max-w-[150px] truncate">
                        {row.issue_label}
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredData.length === 0 && !auditLoading && (
                    <TableRow>
                      <TableCell colSpan={11} className="text-center text-muted-foreground py-8">
                        No audit data found. Click "Preview Full Audit" to scan.
                      </TableCell>
                    </TableRow>
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
