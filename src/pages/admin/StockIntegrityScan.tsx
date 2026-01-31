import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Database, Search, Wrench, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { useStockBackfill, BackfillResult } from '@/hooks/useStockBackfill';

export default function StockIntegrityScan() {
  const queryClient = useQueryClient();
  const [scanResults, setScanResults] = useState<BackfillResult | null>(null);
  const { mutate: runBackfill, isPending: isScanning } = useStockBackfill();

  const handleDryRun = () => {
    runBackfill(true, {
      onSuccess: (data) => setScanResults(data)
    });
  };

  const handleApplyFix = () => {
    runBackfill(false, {
      onSuccess: (data) => {
        setScanResults(data);
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5" />
              Full Stock Audit
            </CardTitle>
            <CardDescription>
              Scan all delivered orders and ensure stock movements are correctly recorded. 
              This checks for missing deductions, duplicates, and warehouse mismatches.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
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
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
