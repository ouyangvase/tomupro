import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDriverPickups, useAcknowledgePickup } from '@/hooks/useDriverPickups';
import { AppLayout } from '@/components/layout/AppLayout';
import LocationTracker from '@/components/driver/LocationTracker';
import { Package, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { format } from 'date-fns';

export default function DriverPickupsPage() {
  const { data: pickups, isLoading } = useDriverPickups();
  const acknowledgePickup = useAcknowledgePickup();

  const pendingPickups = pickups?.filter(p => p.status === 'PENDING_DRIVER_ACK') || [];
  const acknowledgedPickups = pickups?.filter(p => p.status === 'DRIVER_ACKED') || [];
  const completedPickups = pickups?.filter(p => p.status === 'COMPLETED') || [];

  if (isLoading) {
    return (
      <AppLayout>
        <div className="text-center py-12 text-muted-foreground">Loading pickups...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl mx-auto">
      <LocationTracker />
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Package className="h-6 w-6" />
          My Pickups
        </h1>
        <p className="text-muted-foreground">View and acknowledge stock pickups from your runner</p>
      </div>

      {/* Pending Pickups - Priority Section */}
      {pendingPickups.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Pending Acknowledgement
          </h2>
          {pendingPickups.map(pickup => (
            <Card key={pickup.id} className="border-amber-200 bg-amber-50/50">
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">
                      Pickup - {format(new Date(pickup.pickup_date), 'dd MMM yyyy')}
                    </CardTitle>
                    <CardDescription>
                      From: {pickup.runner?.display_name || 'Runner'}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="bg-amber-100 text-amber-700">
                    <Clock className="h-3 w-3 mr-1" />
                    Pending
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <p className="text-sm font-medium">Items to receive:</p>
                  <div className="bg-background rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Product</TableHead>
                          <TableHead className="text-center w-24">Required</TableHead>
                          <TableHead className="text-center w-24">Buffer</TableHead>
                          <TableHead className="text-center w-24">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {pickup.items?.map(item => {
                          return (
                            <TableRow key={item.id}>
                              <TableCell className="text-sm font-medium">
                                {item.product?.sku_code || 'N/A'} / {item.product?.sku_name || 'Unknown'}
                              </TableCell>
                              <TableCell className="text-center">
                                {item.required_qty !== null ? (
                                  <Badge variant="secondary">{item.required_qty}</Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                {item.buffer_qty > 0 ? (
                                  <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
                                    +{item.buffer_qty}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">0</span>
                                )}
                              </TableCell>
                              <TableCell className="text-center">
                                <Badge variant="default">{item.qty}</Badge>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                        {(!pickup.items || pickup.items.length === 0) && (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                              No items specified
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
                {pickup.notes && (
                  <p className="text-sm text-muted-foreground">
                    <strong>Notes:</strong> {pickup.notes}
                  </p>
                )}
                <Button
                  className="w-full"
                  size="lg"
                  onClick={() => acknowledgePickup.mutate(pickup.id)}
                  disabled={acknowledgePickup.isPending}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  {acknowledgePickup.isPending ? 'Acknowledging...' : 'Acknowledge Pickup'}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Acknowledged Pickups */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-green-500" />
          Awaiting Collection
        </h2>
        {acknowledgedPickups.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground">
              No acknowledged pickups waiting for collection
            </CardContent>
          </Card>
        ) : (
          acknowledgedPickups.map(pickup => (
            <Card key={pickup.id}>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">
                      {format(new Date(pickup.pickup_date), 'dd MMM yyyy')}
                    </CardTitle>
                    <CardDescription>
                      Acknowledged at {pickup.acknowledged_at 
                        ? format(new Date(pickup.acknowledged_at), 'dd MMM HH:mm')
                        : '-'}
                    </CardDescription>
                  </div>
                  <Badge variant="outline" className="bg-green-50 text-green-700">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Acknowledged
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-center w-24">Required</TableHead>
                      <TableHead className="text-center w-24">Buffer</TableHead>
                      <TableHead className="text-center w-24">Received</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pickup.items?.map(item => (
                      <TableRow key={item.id}>
                        <TableCell className="text-sm font-medium">
                          {item.product?.sku_code || 'N/A'} / {item.product?.sku_name || 'Unknown'}
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {item.required_qty ?? '-'}
                        </TableCell>
                        <TableCell className="text-center text-muted-foreground">
                          {item.buffer_qty > 0 ? `+${item.buffer_qty}` : '0'}
                        </TableCell>
                        <TableCell className="text-center font-medium">{item.qty}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {completedPickups.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Completed Pickups</h2>
          <div className="divide-y divide-border border-y border-border">
            {completedPickups.map((pickup) => (
              <div key={pickup.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="font-semibold">{format(new Date(pickup.pickup_date), 'dd MMM yyyy')}</p>
                  <p className="text-sm text-muted-foreground">
                    {(pickup.items || []).reduce((sum, item) => sum + Number(item.collected_qty || 0), 0)} items collected
                  </p>
                </div>
                <Badge variant="outline" className="border-green-600 text-green-700">Completed</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {pendingPickups.length === 0 && acknowledgedPickups.length === 0 && completedPickups.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No pickups assigned yet</p>
            <p className="text-sm text-muted-foreground mt-1">
              Your runner will create pickups when stock is ready
            </p>
          </CardContent>
        </Card>
      )}
      </div>
    </AppLayout>
  );
}
