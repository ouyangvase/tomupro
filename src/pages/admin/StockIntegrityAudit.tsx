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
  Database, Search, CheckCircle, AlertCircle, RefreshCw, 
  ChevronDown, ChevronRight, ArrowUpDown, Package, Warehouse, TrendingDown, TrendingUp
} from 'lucide-react';
import { useStockIntegrityAudit, useMovementDrilldown, useStockIntegritySummary, StockIntegrityRow } from '@/hooks/useStockIntegrity';
import { useUsers } from '@/hooks/useUsers';
import { useAuth } from '@/contexts/AuthContext';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

export default function StockIntegrityAudit() {
  const { profile } = useAuth();
  const { data: users = [] } = useUsers();
  const [ownerFilter, setOwnerFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'error' | 'negative'>('all');
  const [selectedRow, setSelectedRow] = useState<StockIntegrityRow | null>(null);
  
  const { data: auditData = [], isLoading, refetch } = useStockIntegrityAudit(ownerFilter);
  const summary = useStockIntegritySummary(auditData);
  
  // Filter options - only users with stock
  const ownerOptions = useMemo(() => {
    const ownerIds = new Set(auditData.map(r => r.owner_user_id));
    return users.filter(u => ownerIds.has(u.id) || u.role === 'salesperson' || u.role === 'manager');
  }, [users, auditData]);
  
  // Apply local filters
  const filteredData = useMemo(() => {
    let result = auditData;
    
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(r => 
        r.sku_code?.toLowerCase().includes(q) ||
        r.sku_name?.toLowerCase().includes(q) ||
        r.owner_name?.toLowerCase().includes(q)
      );
    }
    
    if (statusFilter === 'error') {
      result = result.filter(r => r.status === 'ERROR');
    } else if (statusFilter === 'negative') {
      result = result.filter(r => r.computed_balance < 0);
    }
    
    return result;
  }, [auditData, searchQuery, statusFilter]);
  
  // Restrict to admin only
  if (profile?.role !== 'admin') {
    return (
      <AppLayout>
        <div className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Access Denied</AlertTitle>
            <AlertDescription>Only administrators can access the Stock Integrity Audit.</AlertDescription>
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
              <p className="text-2xl font-bold">{summary.totalSkus}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Healthy</p>
              <p className="text-2xl font-bold text-green-500">{summary.healthyCount}</p>
            </CardContent>
          </Card>
          <Card className={summary.errorCount > 0 ? 'border-yellow-500/50' : ''}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Issues</p>
              <p className="text-2xl font-bold text-yellow-500">{summary.errorCount}</p>
            </CardContent>
          </Card>
          <Card className={summary.negativeBalanceCount > 0 ? 'border-destructive/50' : ''}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Negative Balance</p>
              <p className="text-2xl font-bold text-destructive">{summary.negativeBalanceCount}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Health %</p>
              <p className="text-2xl font-bold">{summary.healthPercentage}%</p>
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
              
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-[160px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="error">Issues Only</SelectItem>
                  <SelectItem value="negative">Negative Balance</SelectItem>
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
                  {filteredData.map((row) => (
                    <tr 
                      key={`${row.warehouse_id}-${row.product_id}`}
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
                      <td className="p-3 text-right font-mono text-green-600">
                        +{row.inbound_qty}
                      </td>
                      <td className="p-3 text-right font-mono text-muted-foreground">
                        {row.adjustment_qty >= 0 ? '+' : ''}{row.adjustment_qty}
                      </td>
                      <td className="p-3 text-right font-mono text-blue-500">
                        +{row.transfer_in_qty}
                      </td>
                      <td className="p-3 text-right font-mono text-orange-500">
                        {row.transfer_out_qty}
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
                        {row.computed_balance < 0 ? (
                          <AlertCircle className="h-4 w-4 text-destructive inline" />
                        ) : (
                          <CheckCircle className="h-4 w-4 text-green-500 inline" />
                        )}
                      </td>
                      <td className="p-3">
                        {row.suspected_issue && (
                          <span className="text-xs text-yellow-600">{row.suspected_issue}</span>
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

function DrilldownDialog({ row, onClose }: { row: StockIntegrityRow | null; onClose: () => void }) {
  const { data: movements = [], isLoading } = useMovementDrilldown(row?.warehouse_id, row?.product_id);
  
  if (!row) return null;
  
  return (
    <Dialog open={!!row} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="h-5 w-5" />
            Movement History: {row.sku_code} / {row.sku_name}
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-green-500/10 border border-green-500/30">
              <p className="text-xs text-muted-foreground">Inbound</p>
              <p className="text-xl font-bold text-green-500">+{row.inbound_qty}</p>
            </div>
            <div className="p-3 rounded-lg bg-muted border">
              <p className="text-xs text-muted-foreground">Adjustments</p>
              <p className="text-xl font-bold">{row.adjustment_qty >= 0 ? '+' : ''}{row.adjustment_qty}</p>
            </div>
            <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
              <p className="text-xs text-muted-foreground">Delivered</p>
              <p className="text-xl font-bold text-destructive">-{row.delivered_qty}</p>
            </div>
            <div className={cn(
              "p-3 rounded-lg border",
              row.computed_balance < 0 ? "bg-destructive/10 border-destructive/30" : "bg-primary/10 border-primary/30"
            )}>
              <p className="text-xs text-muted-foreground">Balance</p>
              <p className={cn("text-xl font-bold", row.computed_balance < 0 ? "text-destructive" : "text-primary")}>
                {row.computed_balance}
              </p>
            </div>
          </div>
          
          {/* Owner/Warehouse info */}
          <div className="flex gap-4 text-sm text-muted-foreground">
            <span>Owner: <strong className="text-foreground">{row.owner_name}</strong></span>
            <span>Warehouse: <strong className="text-foreground">{row.warehouse_name}</strong></span>
          </div>
          
          {/* Movement list */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="p-2 text-left">Date</th>
                  <th className="p-2 text-left">Type</th>
                  <th className="p-2 text-right">Qty</th>
                  <th className="p-2 text-left">Reference</th>
                  <th className="p-2 text-left">Created By</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && (
                  <tr>
                    <td colSpan={5} className="p-4 text-center text-muted-foreground">Loading...</td>
                  </tr>
                )}
                {movements.map((m) => (
                  <tr key={m.id} className="border-t">
                    <td className="p-2 text-muted-foreground">
                      {format(new Date(m.created_at), 'MMM dd, HH:mm')}
                    </td>
                    <td className="p-2">
                      <Badge variant={
                        m.movement_type === 'INBOUND' ? 'default' :
                        m.movement_type.includes('DEDUCT') ? 'destructive' :
                        m.movement_type.includes('TRANSFER') ? 'secondary' : 'outline'
                      } className="text-xs">
                        {m.movement_type}
                      </Badge>
                    </td>
                    <td className={cn(
                      "p-2 text-right font-mono",
                      m.qty_change > 0 ? "text-green-600" : "text-destructive"
                    )}>
                      {m.qty_change > 0 ? '+' : ''}{m.qty_change}
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {m.order_code && <span className="font-medium">{m.order_code}</span>}
                      {m.inbound_tracking && <span>Tracking: {m.inbound_tracking}</span>}
                      {!m.order_code && !m.inbound_tracking && m.reference_type}
                    </td>
                    <td className="p-2 text-muted-foreground">{m.created_by_name || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
