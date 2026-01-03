import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useRunnerPickups, useCancelPickup } from '@/hooks/useDriverPickups';
import { CreatePickupDialog } from '@/components/driver/CreatePickupDialog';
import { AppLayout } from '@/components/layout/AppLayout';
import { Plus, Package, CheckCircle, XCircle, Clock, Send } from 'lucide-react';
import { format } from 'date-fns';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function DriverPickups() {
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [passingPickupId, setPassingPickupId] = useState<string | null>(null);
  const { data: pickups, isLoading } = useRunnerPickups();
  const cancelPickup = useCancelPickup();
  const queryClient = useQueryClient();

  const pendingPickups = pickups?.filter(p => p.status === 'PENDING_DRIVER_ACK') || [];
  const acknowledgedPickups = pickups?.filter(p => p.status === 'DRIVER_ACKED') || [];
  const cancelledPickups = pickups?.filter(p => p.status === 'CANCELLED') || [];

  // Pass pickup - resend notification to driver
  const handlePassPickup = async (pickupId: string, driverId: string, pickupDate: string) => {
    setPassingPickupId(pickupId);
    try {
      // Send a new notification to driver
      await supabase.from('notifications').insert({
        user_id: driverId,
        title: 'Pickup Reminder',
        message: `Please acknowledge your pickup for ${pickupDate}. Items are ready for collection.`,
        type: 'pickup_reminder',
        reference_type: 'driver_pickup',
        reference_id: pickupId,
        priority: 'HIGH',
      });
      toast.success('Notification sent to driver');
    } catch (error) {
      toast.error('Failed to send notification');
    } finally {
      setPassingPickupId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING_DRIVER_ACK':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400"><Clock className="h-3 w-3 mr-1" />Pending</Badge>;
      case 'DRIVER_ACKED':
        return <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400"><CheckCircle className="h-3 w-3 mr-1" />Acknowledged</Badge>;
      case 'CANCELLED':
        return <Badge variant="outline" className="bg-muted text-muted-foreground"><XCircle className="h-3 w-3 mr-1" />Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const PickupTable = ({ data, showActions = false }: { data: typeof pickups; showActions?: boolean }) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Driver</TableHead>
          <TableHead>Items (Req + Buffer = Total)</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Acknowledged At</TableHead>
          {showActions && <TableHead className="text-right">Actions</TableHead>}
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
                  <div key={item.id} className="text-sm flex items-center gap-2">
                    <span className="font-medium">
                      {item.product?.sku_name || 'Unknown'}
                      {item.product?.sku_code && (
                        <span className="text-muted-foreground ml-1">({item.product.sku_code})</span>
                      )}
                    </span>
                    <Badge variant="secondary" className="text-xs">
                      {item.required_qty || 0}+{item.buffer_qty}={item.qty}
                    </Badge>
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
            {showActions && (
              <TableCell className="text-right">
                {pickup.status === 'PENDING_DRIVER_ACK' && (
                  <div className="flex gap-1 justify-end">
                    <Button
                      size="sm"
                      variant="default"
                      onClick={() => handlePassPickup(pickup.id, pickup.driver_id, pickup.pickup_date)}
                      disabled={passingPickupId === pickup.id}
                    >
                      <Send className="h-3 w-3 mr-1" />
                      Pass
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => cancelPickup.mutate(pickup.id)}
                      disabled={cancelPickup.isPending}
                    >
                      Cancel
                    </Button>
                  </div>
                )}
              </TableCell>
            )}
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
                <PickupTable data={pendingPickups} showActions={true} />
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
