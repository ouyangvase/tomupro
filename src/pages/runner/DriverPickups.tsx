import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRunnerPickups, useCancelPickup } from '@/hooks/useDriverPickups';
import { CreatePickupDialog } from '@/components/driver/CreatePickupDialog';
import { AppLayout } from '@/components/layout/AppLayout';
import { Plus, Package, CheckCircle, XCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';

export default function DriverPickups() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const { data: pickups, isLoading } = useRunnerPickups();
  const cancelPickup = useCancelPickup();

  const pendingPickups = pickups?.filter(p => p.status === 'PENDING_DRIVER_ACK') || [];
  const acknowledgedPickups = pickups?.filter(p => p.status === 'DRIVER_ACKED') || [];
  const cancelledPickups = pickups?.filter(p => p.status === 'CANCELLED') || [];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING_DRIVER_ACK':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'DRIVER_ACKED':
        return <Badge variant="outline" className="bg-green-50 text-green-700"><CheckCircle className="h-3 w-3 mr-1" />Acknowledged</Badge>;
      case 'CANCELLED':
        return <Badge variant="outline" className="bg-muted text-muted-foreground"><XCircle className="h-3 w-3 mr-1" />Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const PickupTable = ({ data }: { data: typeof pickups }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Driver</TableHead>
          <TableHead>Items</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Acknowledged At</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data?.map(pickup => (
          <TableRow key={pickup.id}>
            <TableCell className="font-medium">
              {format(new Date(pickup.pickup_date), 'dd MMM yyyy')}
            </TableCell>
            <TableCell>{pickup.driver?.display_name || 'Unknown'}</TableCell>
            <TableCell>
              <div className="space-y-1">
                {pickup.items?.map(item => (
                  <div key={item.id} className="text-sm">
                    {item.product?.sku_name} x {item.qty}
                  </div>
                ))}
                {(!pickup.items || pickup.items.length === 0) && (
                  <span className="text-muted-foreground">No items</span>
                )}
              </div>
            </TableCell>
            <TableCell>{getStatusBadge(pickup.status)}</TableCell>
            <TableCell>
              {pickup.acknowledged_at
                ? format(new Date(pickup.acknowledged_at), 'dd MMM HH:mm')
                : '-'}
            </TableCell>
            <TableCell>
              {pickup.status === 'PENDING_DRIVER_ACK' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => cancelPickup.mutate(pickup.id)}
                  disabled={cancelPickup.isPending}
                >
                  Cancel
                </Button>
              )}
            </TableCell>
          </TableRow>
        ))}
        {(!data || data.length === 0) && (
          <TableRow>
            <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
              No pickups found
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );

  return (
    <AppLayout>
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="h-6 w-6" />
            Driver Pickups
          </h1>
          <p className="text-muted-foreground">Manage daily stock handoff to drivers</p>
        </div>
        <Button onClick={() => setCreateDialogOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Create Pickup
        </Button>
      </div>

      <Tabs defaultValue="pending">
        <TabsList>
          <TabsTrigger value="pending">
            Pending ({pendingPickups.length})
          </TabsTrigger>
          <TabsTrigger value="acknowledged">
            Acknowledged ({acknowledgedPickups.length})
          </TabsTrigger>
          <TabsTrigger value="cancelled">
            Cancelled ({cancelledPickups.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending">
          <Card>
            <CardHeader>
              <CardTitle>Pending Driver Acknowledgement</CardTitle>
              <CardDescription>Pickups waiting for driver to confirm receipt</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : (
                <PickupTable data={pendingPickups} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="acknowledged">
          <Card>
            <CardHeader>
              <CardTitle>Acknowledged Pickups</CardTitle>
              <CardDescription>Pickups confirmed by drivers</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : (
                <PickupTable data={acknowledgedPickups} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="cancelled">
          <Card>
            <CardHeader>
              <CardTitle>Cancelled Pickups</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : (
                <PickupTable data={cancelledPickups} />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <CreatePickupDialog open={createDialogOpen} onOpenChange={setCreateDialogOpen} />
    </div>
    </AppLayout>
  );
}
