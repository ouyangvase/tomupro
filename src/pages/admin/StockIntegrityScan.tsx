import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Database, Search, Wrench, CheckCircle, AlertCircle, RefreshCw, Trash2, Zap } from 'lucide-react';
import { useStockBackfill, useQuickRepair, BackfillResult, QuickRepairResult } from '@/hooks/useStockBackfill';

export default function StockIntegrityScan() {
  const queryClient = useQueryClient();
  const [scanResults, setScanResults] = useState<BackfillResult | null>(null);
  const [quickRepairResults, setQuickRepairResults] = useState<QuickRepairResult | null>(null);
  const [forceReprocess, setForceReprocess] = useState(true);
  const { mutate: runBackfill, isPending: isScanning } = useStockBackfill();
  const { mutate: runQuickRepair, isPending: isQuickRepairing } = useQuickRepair();

  const handleDryRun = () => {
    runBackfill({ dryRun: true, forceReprocess }, {
      onSuccess: (data) => setScanResults(data)
    });
  };

  const handleApplyFix = () => {
    runBackfill({ dryRun: false, forceReprocess }, {
      onSuccess: (data) => {
        setScanResults(data);
        queryClient.invalidateQueries({ queryKey: ['stock-balance'] });
        queryClient.invalidateQueries({ queryKey: ['filtered-stock-balance'] });
        queryClient.invalidateQueries({ queryKey: ['inventory'] });
      }
    });
  };

  const handleQuickRepairPreview = () => {
    runQuickRepair(true, {
      onSuccess: (data) => setQuickRepairResults(data)
    });
  };

  const handleQuickRepairApply = () => {
    runQuickRepair(false, {
      onSuccess: (data) => {
        setQuickRepairResults(data);
        queryClient.invalidateQueries({ queryKey: ['stock-balance'] });
        queryClient.invalidateQueries({ queryKey: ['filtered-stock-balance'] });
        queryClient.invalidateQueries({ queryKey: ['inventory'] });
      }
    });
  };

  return (
    <AppLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-3">
          <Database className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Stock Integrity Scan</h1>
            <p className="text-muted-foreground">Audit and repair stock movement discrepancies</p>
          </div>
        </div>

        {/* Quick Repair Card - Primary Method */}
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-primary" />
              Quick Repair (Recommended)
            </CardTitle>
            <CardDescription>
              Fast database-level repair that creates missing stock deductions for all DELIVERED orders.
              This bypasses edge function timeouts and fixes the FT02-GOLD type issues.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2 flex-wrap">
              <Button 
                variant="outline" 
                onClick={handleQuickRepairPreview}
                disabled={isQuickRepairing}
              >
                <Search className="h-4 w-4 mr-2" />
                {isQuickRepairing ? 'Scanning...' : 'Preview Issues'}
              </Button>
              
              {quickRepairResults && quickRepairResults.dry_run && quickRepairResults.missing_deductions > 0 && (
                <Button 
                  variant="destructive" 
                  onClick={handleQuickRepairApply}
                  disabled={isQuickRepairing}
                >
                  <Wrench className="h-4 w-4 mr-2" />
                  Fix {quickRepairResults.missing_deductions} Missing Deductions
                </Button>
              )}
            </div>

            {/* Quick Repair Results */}
            {quickRepairResults && (
              <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
                <div className="flex items-center gap-2 mb-4">
                  <Badge variant={quickRepairResults.dry_run ? 'secondary' : 'default'}>
                    {quickRepairResults.dry_run ? 'Preview' : 'Applied'}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-3 rounded-lg bg-background">
                    <p className="text-sm text-muted-foreground">Missing Deductions</p>
                    <p className="text-2xl font-bold text-orange-500">{quickRepairResults.missing_deductions}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-background">
                    <p className="text-sm text-muted-foreground">Fixed Deductions</p>
                    <p className="text-2xl font-bold text-green-500">{quickRepairResults.fixed_deductions}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-background">
                    <p className="text-sm text-muted-foreground">Queue Cleared</p>
                    <p className="text-2xl font-bold text-blue-500">{quickRepairResults.queue_cleared}</p>
                  </div>
                </div>

                {/* Fixed Orders List */}
                {quickRepairResults.fixed_orders && quickRepairResults.fixed_orders.length > 0 && (
                  <div className="border rounded-lg p-3 bg-background">
                    <p className="text-sm font-medium mb-2">Orders to Fix ({quickRepairResults.fixed_orders.length})</p>
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                      {quickRepairResults.fixed_orders.slice(0, 20).map((code, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{code}</Badge>
                      ))}
                      {quickRepairResults.fixed_orders.length > 20 && (
                        <Badge variant="secondary" className="text-xs">+{quickRepairResults.fixed_orders.length - 20} more</Badge>
                      )}
                    </div>
                  </div>
                )}

                {/* Errors */}
                {quickRepairResults.errors && quickRepairResults.errors.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Errors ({quickRepairResults.errors.length})</AlertTitle>
                    <AlertDescription>
                      <ul className="text-xs mt-2 space-y-1 max-h-32 overflow-y-auto">
                        {quickRepairResults.errors.slice(0, 5).map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {!quickRepairResults.dry_run && (
                  <Alert className="bg-green-500/10 border-green-500/30">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <AlertTitle className="text-green-500">Repair Complete</AlertTitle>
                    <AlertDescription>
                      Stock balances have been updated. Refresh the inventory page to see correct values.
                    </AlertDescription>
                  </Alert>
                )}

                {quickRepairResults.dry_run && quickRepairResults.missing_deductions === 0 && (
                  <Alert className="bg-green-500/10 border-green-500/30">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <AlertTitle className="text-green-500">All Clear</AlertTitle>
                    <AlertDescription>
                      No missing stock deductions found. All balances are correct.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Legacy Edge Function Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Full Stock Audit (Edge Function)
            </CardTitle>
            <CardDescription>
              Legacy scan using edge function. May timeout for large datasets.
              Use Quick Repair above for faster results.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Force Reprocess Option */}
            <div className="flex items-center space-x-3 p-3 rounded-lg bg-muted/50 border">
              <Switch
                id="force-reprocess"
                checked={forceReprocess}
                onCheckedChange={setForceReprocess}
              />
              <div className="flex-1">
                <Label htmlFor="force-reprocess" className="font-medium flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Clear Failed Queue Items
                </Label>
                <p className="text-xs text-muted-foreground mt-1">
                  Marks blocked delivery_queue items as REPROCESSED so fresh deductions can be created
                </p>
              </div>
            </div>

            <div className="flex gap-2 flex-wrap">
              <Button 
                variant="outline" 
                onClick={handleDryRun}
                disabled={isScanning}
              >
                <Search className="h-4 w-4 mr-2" />
                {isScanning ? 'Scanning...' : 'Preview Scan (Dry Run)'}
              </Button>
              
              {scanResults && !scanResults.dryRun && (
                <Badge className="bg-green-500/20 text-green-500 border-green-500/30">
                  Last repair: {scanResults.results.missingDeductionsCreated} fixed
                </Badge>
              )}
            </div>
            
            {/* Results Display */}
            {scanResults && (
              <div className="border rounded-lg p-4 space-y-4 bg-muted/50">
                <div className="flex items-center gap-2 mb-4">
                  <Badge variant={scanResults.dryRun ? 'secondary' : 'default'}>
                    {scanResults.dryRun ? 'Preview Mode' : 'Applied'}
                  </Badge>
                  <span className="text-sm text-muted-foreground">{scanResults.message}</span>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="p-3 rounded-lg bg-background">
                    <p className="text-sm text-muted-foreground">Orders Scanned</p>
                    <p className="text-2xl font-bold">{scanResults.results.deliveredOrdersScanned}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-background">
                    <p className="text-sm text-muted-foreground">Missing Deductions</p>
                    <p className="text-2xl font-bold text-orange-500">
                      {scanResults.results.missingDeductionsCreated}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-background">
                    <p className="text-sm text-muted-foreground">Duplicates Found</p>
                    <p className="text-2xl font-bold">
                      {scanResults.results.duplicateDeductionsReversed}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-background">
                    <p className="text-sm text-muted-foreground">Warehouse Mismatches</p>
                    <p className="text-2xl font-bold">
                      {scanResults.results.warehouseTypeMismatches}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-background">
                    <p className="text-sm text-muted-foreground">Failed Queue Cleared</p>
                    <p className="text-2xl font-bold text-blue-500">
                      {scanResults.results.failedQueueCleared || 0}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-3 rounded-lg bg-background">
                    <p className="text-sm text-muted-foreground">Failed Orders Scanned</p>
                    <p className="text-xl font-semibold">{scanResults.results.failedOrdersScanned}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-background">
                    <p className="text-sm text-muted-foreground">Missing Returns Created</p>
                    <p className="text-xl font-semibold">{scanResults.results.missingReturnsCreated}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-background">
                    <p className="text-sm text-muted-foreground">Duplicate Returns Reversed</p>
                    <p className="text-xl font-semibold">{scanResults.results.duplicateReturnsReversed}</p>
                  </div>
                </div>
                
                {/* Errors */}
                {scanResults.results.errors.length > 0 && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Errors Found ({scanResults.results.errors.length})</AlertTitle>
                    <AlertDescription>
                      <ul className="text-xs mt-2 space-y-1 max-h-32 overflow-y-auto">
                        {scanResults.results.errors.slice(0, 10).map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                        {scanResults.results.errors.length > 10 && (
                          <li className="text-muted-foreground">...and {scanResults.results.errors.length - 10} more</li>
                        )}
                      </ul>
                    </AlertDescription>
                  </Alert>
                )}

                {/* Fixed Orders List */}
                {scanResults.results.fixedOrders.length > 0 && (
                  <div className="border rounded-lg p-3 bg-background">
                    <p className="text-sm font-medium mb-2">Orders to Fix ({scanResults.results.fixedOrders.length})</p>
                    <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
                      {scanResults.results.fixedOrders.slice(0, 20).map((code, i) => (
                        <Badge key={i} variant="outline" className="text-xs">{code}</Badge>
                      ))}
                      {scanResults.results.fixedOrders.length > 20 && (
                        <Badge variant="secondary" className="text-xs">+{scanResults.results.fixedOrders.length - 20} more</Badge>
                      )}
                    </div>
                  </div>
                )}
                
                {/* Apply Fix Button */}
                {scanResults.dryRun && scanResults.results.missingDeductionsCreated > 0 && (
                  <Button 
                    variant="destructive" 
                    onClick={handleApplyFix}
                    disabled={isScanning}
                    className="w-full sm:w-auto"
                  >
                    <Wrench className="h-4 w-4 mr-2" />
                    Apply Fix ({scanResults.results.missingDeductionsCreated} deductions)
                  </Button>
                )}
                
                {!scanResults.dryRun && (
                  <Alert className="bg-green-500/10 border-green-500/30">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <AlertTitle className="text-green-500">Repair Complete</AlertTitle>
                    <AlertDescription>
                      Stock balance has been updated. The inventory page will now show correct balances.
                    </AlertDescription>
                  </Alert>
                )}

                {scanResults.dryRun && scanResults.results.missingDeductionsCreated === 0 && 
                 scanResults.results.duplicateDeductionsReversed === 0 && 
                 scanResults.results.warehouseTypeMismatches === 0 && (
                  <Alert className="bg-green-500/10 border-green-500/30">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <AlertTitle className="text-green-500">All Clear</AlertTitle>
                    <AlertDescription>
                      No stock integrity issues found. All movements are correctly recorded.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
