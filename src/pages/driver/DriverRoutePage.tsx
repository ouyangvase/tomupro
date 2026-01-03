import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverRouteOptimization } from '@/hooks/useRouteOptimization';
import { AppLayout } from '@/components/layout/AppLayout';
import { MapPin, Package, Navigation, ArrowRight } from 'lucide-react';

export default function DriverRoutePage() {
  const { profile } = useAuth();
  const { data: routeData, isLoading } = useDriverRouteOptimization(profile?.id);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="text-center py-12 text-muted-foreground">Loading route...</div>
      </AppLayout>
    );
  }

  if (!routeData || routeData.totalOrders === 0) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardContent className="py-12 text-center">
              <Navigation className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">No Pending Deliveries</h2>
              <p className="text-muted-foreground">
                You have no orders to deliver. Wait for your runner to assign orders.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Navigation className="h-6 w-6" />
          Optimized Route
        </h1>
        <p className="text-muted-foreground">
          {routeData.totalOrders} orders across {routeData.totalAreas} areas
        </p>
      </div>

      {/* Suggested Route Order */}
      <Card className="bg-primary/5 border-primary/20">
        <CardHeader>
          <CardTitle className="text-lg">Suggested Delivery Order</CardTitle>
          <CardDescription>
            Areas with more orders are prioritized for efficiency
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-center gap-2">
            {routeData.suggestedOrder.map((group, index) => (
              <div key={group.area || 'unknown'} className="flex items-center gap-2">
                <Badge variant="outline" className="bg-background">
                  <span className="font-bold mr-2">{index + 1}</span>
                  {group.area || 'Unknown Area'}
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({group.orders.length})
                  </span>
                </Badge>
                {index < routeData.suggestedOrder.length - 1 && (
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Area Groups */}
      <div className="space-y-4">
        {routeData.suggestedOrder.map((group, index) => (
          <Card key={group.area || 'unknown'}>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-bold">
                    {index + 1}
                  </div>
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <MapPin className="h-4 w-4" />
                      {group.area || 'Unknown Area'}
                    </CardTitle>
                    <CardDescription>
                      {group.orders.length} orders · RM {group.totalAmount.toLocaleString()}
                    </CardDescription>
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {group.orders.map(order => (
                  <div 
                    key={order.id} 
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium text-sm">{order.order_code}</p>
                        <p className="text-xs text-muted-foreground">{order.customer_name}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-sm">RM {order.total_amount}</p>
                      <p className="text-xs text-muted-foreground">{order.payment_method}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      </div>
    </AppLayout>
  );
}
