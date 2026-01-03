import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useRunnerReturns, useAcknowledgeReturn } from '@/hooks/useDriverReturns';
import { AppLayout } from '@/components/layout/AppLayout';
import { RotateCcw, CheckCircle, Clock, XCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function DriverReturns() {
  const { data: returns, isLoading } = useRunnerReturns();
  const acknowledgeReturn = useAcknowledgeReturn();

  const pendingReturns = returns?.filter(r => r.status === 'PENDING_RUNNER_ACK') || [];
  const acknowledgedReturns = returns?.filter(r => r.status === 'RUNNER_ACKED') || [];
  const cancelledReturns = returns?.filter(r => r.status === 'CANCELLED') || [];

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

  const ReturnTable = ({ data }: { data: typeof returns }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Driver</TableHead>
          <TableHead>Items</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Notes</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data?.map(ret => (
          <TableRow key={ret.id}>
            <TableCell className="font-medium">
              {format(new Date(ret.created_at), 'dd MMM yyyy HH:mm')}
            </TableCell>
            <TableCell>{ret.driver?.display_name || 'Unknown'}</TableCell>
            <TableCell>
              <div className="space-y-1">
                {ret.items?.map(item => (
                  <div key={item.id} className="text-sm">
                    {item.product?.sku_name} x {item.qty}
                  </div>
                ))}
                {(!ret.items || ret.items.length === 0) && (
                  <span className="text-muted-foreground">No items</span>
                )}
              </div>
            </TableCell>
            <TableCell>{getStatusBadge(ret.status)}</TableCell>
            <TableCell className="max-w-[200px] truncate">
              {ret.notes || '-'}
            </TableCell>
            <TableCell>
              {ret.status === 'PENDING_RUNNER_ACK' && (
                <Button
                  size="sm"
                  onClick={() => acknowledgeReturn.mutate(ret.id)}
                  disabled={acknowledgeReturn.isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-1" />
                  Acknowledge
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
        {(!data || data.length === 0) && (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
              No returns found
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  return (
    <AppLayout>
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <RotateCcw className="h-6 w-6" />
          Driver Returns
        </h1>
        <p className="text-muted-foreground">Acknowledge stock returns from drivers</p>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending ({pendingReturns.length})
          </TabsTrigger>
          <TabsTrigger value="acknowledged">
            Acknowledged ({acknowledgedReturns.length})
          </TabsTrigger>
          <TabsTrigger value="cancelled">
            Cancelled ({cancelledReturns.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Pending Acknowledgement</CardTitle>
              <CardDescription>Returns waiting for your confirmation</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : (
                <ReturnTable data={pendingReturns} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="acknowledged">
          <Card>
            <CardHeader>
              <CardTitle>Acknowledged Returns</CardTitle>
              <CardDescription>Returns you have confirmed receiving</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : (
                <ReturnTable data={acknowledgedReturns} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cancelled">
          <Card>
            <CardHeader>
              <CardTitle>Cancelled Returns</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : (
                <ReturnTable data={cancelledReturns} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
    </AppLayout>
  );
}
