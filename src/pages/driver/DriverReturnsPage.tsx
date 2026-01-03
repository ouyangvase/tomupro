import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useDriverReturns, useCreateReturn } from '@/hooks/useDriverReturns';
import { useDriverReturnRequired } from '@/hooks/useDriverReturnRequired';
import { useDriverParentRunner } from '@/hooks/useDrivers';
import { CreateReturnDialog } from '@/components/driver/CreateReturnDialog';
import { AppLayout } from '@/components/layout/AppLayout';
import { RotateCcw, Plus, CheckCircle, Clock, XCircle, AlertTriangle, PackageCheck, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

export default function DriverReturnsPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { data: returns, isLoading } = useDriverReturns();
  const { data: returnRequired, isLoading: isLoadingReturn } = useDriverReturnRequired();
  const { data: parentRunner } = useDriverParentRunner();
  const createReturn = useCreateReturn();

  const pendingReturns = returns?.filter(r => r.status === 'PENDING_RUNNER_ACK') || [];
  const acknowledgedReturns = returns?.filter(r => r.status === 'RUNNER_ACKED') || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING_RUNNER_ACK':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700"><Clock className="h-3 w-3 mr-1" />Pending Runner</Badge>;
      case 'RUNNER_ACKED':
        return <Badge variant="outline" className="bg-green-50 text-green-700"><CheckCircle className="h-3 w-3 mr-1" />Acknowledged</Badge>;
      case 'CANCELLED':
        return <Badge variant="outline" className="bg-muted text-muted-foreground"><XCircle className="h-3 w-3 mr-1" />Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // One-click accept to submit all suggested return items
  const handleQuickAccept = async () => {
    if (!parentRunner || !returnRequired?.items.length) return;

    await createReturn.mutateAsync({
      runner_id: parentRunner.id,
      notes: 'Auto-suggested return for failed/undelivered items',
      items: returnRequired.items.map(item => ({
        product_id: item.product_id,
        qty: item.suggested_return_qty,
      })),
    });
  };

  if (isLoading) {
    return (
      <AppLayout>
        <div className="text-center py-12 text-muted-foreground">Loading returns...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl mx-auto">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <RotateCcw className="h-6 w-6" />
              My Returns
            </h1>
            <p className="text-muted-foreground">Submit and track stock returns to your runner</p>
          </div>
          <Button onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Return
          </Button>
        </div>

        {/* Action Required - One-Click Accept */}
        {returnRequired?.isReturnRequired && returnRequired.items.length > 0 && (
          <Card className="border-2 border-destructive bg-destructive/5">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                <CardTitle className="text-lg text-destructive">Action Required</CardTitle>
              </div>
              <CardDescription>
                You have undelivered/failed items that need to be returned to your runner
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Items to return */}
              <div className="bg-background rounded-lg p-3 border">
                <p className="text-sm font-medium mb-2">Items to Return:</p>
                <div className="space-y-2">
                  {returnRequired.items.map(item => (
                    <div key={item.product_id} className="flex justify-between items-center text-sm">
                      <span className="text-muted-foreground">
                        {item.sku_code || 'N/A'} / {item.sku_name}
                      </span>
                      <Badge variant="secondary" className="font-mono">
                        × {item.suggested_return_qty}
                      </Badge>
                    </div>
                  ))}
                </div>
                <div className="border-t mt-3 pt-3 flex justify-between items-center">
                  <span className="font-medium">Total Items</span>
                  <Badge className="font-mono">{returnRequired.totalSuggestedReturn}</Badge>
                </div>
              </div>

              {/* One-click accept button */}
              <Button 
                className="w-full" 
                size="lg"
                onClick={handleQuickAccept}
                disabled={createReturn.isPending || !parentRunner}
              >
                {createReturn.isPending ? (
                  'Submitting...'
                ) : (
                  <>
                    <PackageCheck className="h-5 w-5 mr-2" />
                    Accept & Submit Return
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </>
                )}
              </Button>
              
              <p className="text-xs text-muted-foreground text-center">
                Click to submit all items for return. Your runner will acknowledge receipt.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Pending Returns - Waiting for Runner */}
        {pendingReturns.length > 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600" />
              Pending Runner Acknowledgement
            </h2>
            {pendingReturns.map(ret => (
              <Card key={ret.id} className="border-amber-200 bg-amber-50/50">
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-base">
                      Return - {format(new Date(ret.created_at), 'dd MMM yyyy HH:mm')}
                    </CardTitle>
                    {getStatusBadge(ret.status)}
                  </div>
                  <CardDescription>
                    Waiting for runner to acknowledge receipt
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {ret.items?.map(item => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span className="font-medium">
                          {item.product?.sku_code || 'N/A'} / {item.product?.sku_name || 'Unknown'}
                        </span>
                        <span className="font-medium">× {item.qty}</span>
                      </div>
                    ))}
                  </div>
                  {ret.notes && (
                    <p className="text-sm text-muted-foreground mt-2">
                      <strong>Notes:</strong> {ret.notes}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Acknowledged Returns */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Acknowledged Returns
          </h2>
          {acknowledgedReturns.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-muted-foreground">
                No acknowledged returns yet
              </CardContent>
            </Card>
          ) : (
            acknowledgedReturns.map(ret => (
              <Card key={ret.id}>
                <CardHeader className="pb-2">
                  <div className="flex justify-between items-start">
                    <CardTitle className="text-base">
                      {format(new Date(ret.created_at), 'dd MMM yyyy')}
                    </CardTitle>
                    {getStatusBadge(ret.status)}
                  </div>
                  <CardDescription>
                    Acknowledged at {ret.acknowledged_at 
                      ? format(new Date(ret.acknowledged_at), 'dd MMM HH:mm')
                      : '-'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {ret.items?.map(item => (
                      <div key={item.id} className="flex justify-between text-sm">
                        <span className="font-medium">
                          {item.product?.sku_code || 'N/A'} / {item.product?.sku_name || 'Unknown'}
                        </span>
                        <span className="font-medium">× {item.qty}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {returns?.length === 0 && !returnRequired?.isReturnRequired && (
          <Card>
            <CardContent className="py-12 text-center">
              <RotateCcw className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No returns submitted yet</p>
              <Button className="mt-4" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Submit Your First Return
              </Button>
            </CardContent>
          </Card>
        )}

        <CreateReturnDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
      </div>
    </AppLayout>
  );
}
