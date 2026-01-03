import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useDriverReturns } from '@/hooks/useDriverReturns';
import { CreateReturnDialog } from '@/components/driver/CreateReturnDialog';
import { AppLayout } from '@/components/layout/AppLayout';
import { RotateCcw, Plus, CheckCircle, Clock, XCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function DriverReturnsPage() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { data: returns, isLoading } = useDriverReturns();

  const pendingReturns = returns?.filter(r => r.status === 'PENDING_RUNNER_ACK') || [];
  const acknowledgedReturns = returns?.filter(r => r.status === 'RUNNER_ACKED') || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING_RUNNER_ACK':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'RUNNER_ACKED':
        return <Badge variant="outline" className="bg-green-50 text-green-700"><CheckCircle className="h-3 w-3 mr-1" />Acknowledged</Badge>;
      case 'CANCELLED':
        return <Badge variant="outline" className="bg-muted text-muted-foreground"><XCircle className="h-3 w-3 mr-1" />Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
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

      {/* Pending Returns */}
      {pendingReturns.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Pending Acknowledgement</h2>
          {pendingReturns.map(ret => (
            <Card key={ret.id} className="border-amber-200 bg-amber-50/50">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-lg">
                    Return - {format(new Date(ret.created_at), 'dd MMM yyyy HH:mm')}
                  </CardTitle>
                  {getStatusBadge(ret.status)}
                </div>
                <CardDescription>
                  Waiting for runner acknowledgement
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {ret.items?.map(item => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span>{item.product?.sku_name}</span>
                      <span className="font-medium">x {item.qty}</span>
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
        <h2 className="text-lg font-semibold">Acknowledged Returns</h2>
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
                  <CardTitle className="text-lg">
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
                      <span>{item.product?.sku_name}</span>
                      <span className="font-medium">x {item.qty}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {returns?.length === 0 && (
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
