import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrders, useBulkUpdateOrders } from '@/hooks/useOrders';
import { 
  useRunnerDrivers, 
  useAddDriverToRunner, 
  useRemoveDriverFromRunner,
  useBulkAssignOrdersToDriver,
  useRunnerAcceptDelivery,
  useRunnerRejectDelivery,
} from '@/hooks/useDrivers';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { DataGrid } from '@/components/data-grid/DataGrid';
import { 
  Users, UserPlus, Truck, Check, X, Package, 
  AlertCircle, Clock, CheckCircle, UserMinus 
} from 'lucide-react';
import { toast } from 'sonner';

export default function DriverManagement() {
  const { profile } = useAuth();
  const { data: drivers = [], isLoading: driversLoading } = useRunnerDrivers(profile?.id);
  const { data: users = [] } = useUserDirectory();
  const { data: orders = [], isLoading: ordersLoading } = useOrders({ runnerId: profile?.id });
  
  const addDriver = useAddDriverToRunner();
  const removeDriver = useRemoveDriverFromRunner();
  const bulkAssign = useBulkAssignOrdersToDriver();
  const acceptDelivery = useRunnerAcceptDelivery();
  const rejectDelivery = useRunnerRejectDelivery();

  const [addDriverOpen, setAddDriverOpen] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [assignToDriverId, setAssignToDriverId] = useState('');
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectOrderId, setRejectOrderId] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  // Available drivers (users with driver role not already assigned)
  const availableDrivers = useMemo(() => {
    const assignedDriverIds = drivers.map(d => d.driver_id);
    return users.filter(u => 
      u.role === 'driver' && !assignedDriverIds.includes(u.id)
    );
  }, [users, drivers]);

  // Orders that can be assigned to drivers (runner status = TAKEN or ASSIGNED)
  const assignableOrders = useMemo(() => {
    return orders.filter(o => 
      o.status === 'READY' && 
      (o.runner_status === 'TAKEN' || o.runner_status === 'ASSIGNED') &&
      (!o.driver_id || o.driver_status === 'UNASSIGNED')
    );
  }, [orders]);

  // Pending acceptance orders (driver delivered, waiting for runner accept)
  const pendingAcceptanceOrders = useMemo(() => {
    return orders.filter(o => 
      o.driver_status === 'DRIVER_DELIVERED' && 
      o.runner_accept_status === 'PENDING'
    );
  }, [orders]);

  // Driver workload counts
  const driverWorkloads = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach(o => {
      if (o.driver_id && ['ASSIGNED', 'OUT_FOR_DELIVERY', 'DRIVER_DELIVERED'].includes(o.driver_status || '')) {
        counts[o.driver_id] = (counts[o.driver_id] || 0) + 1;
      }
    });
    return counts;
  }, [orders]);

  const handleAddDriver = async () => {
    if (!selectedDriverId || !profile?.id) return;
    await addDriver.mutateAsync({ runnerId: profile.id, driverId: selectedDriverId });
    setAddDriverOpen(false);
    setSelectedDriverId('');
  };

  const handleRemoveDriver = async (id: string) => {
    await removeDriver.mutateAsync(id);
  };

  const handleBulkAssign = async () => {
    if (!assignToDriverId || selectedOrders.length === 0) return;
    await bulkAssign.mutateAsync({ orderIds: selectedOrders, driverId: assignToDriverId });
    setAssignDialogOpen(false);
    setSelectedOrders([]);
    setAssignToDriverId('');
  };

  const handleAcceptDelivery = async (orderId: string) => {
    await acceptDelivery.mutateAsync(orderId);
  };

  const handleOpenRejectDialog = (orderId: string) => {
    setRejectOrderId(orderId);
    setRejectReason('');
    setRejectDialogOpen(true);
  };

  const handleRejectDelivery = async () => {
    if (!rejectOrderId || !rejectReason) return;
    await rejectDelivery.mutateAsync({ orderId: rejectOrderId, reason: rejectReason });
    setRejectDialogOpen(false);
    setRejectOrderId('');
    setRejectReason('');
  };

  const toggleOrderSelection = (orderId: string) => {
    setSelectedOrders(prev => 
      prev.includes(orderId) 
        ? prev.filter(id => id !== orderId)
        : [...prev, orderId]
    );
  };

  const selectAllOrders = () => {
    if (selectedOrders.length === assignableOrders.length) {
      setSelectedOrders([]);
    } else {
      setSelectedOrders(assignableOrders.map(o => o.id));
    }
  };

  const columns = [
    {
      key: 'select',
      header: '',
      render: (order: any) => (
        <Checkbox 
          checked={selectedOrders.includes(order.id)}
          onCheckedChange={() => toggleOrderSelection(order.id)}
        />
      ),
    },
    { key: 'order_code', header: 'Order' },
    { key: 'customer_name', header: 'Customer' },
    { key: 'area', header: 'Area' },
    { 
      key: 'total_amount', 
      header: 'Amount',
      render: (order: any) => `RM ${order.total_amount}`,
    },
  ];

  return (
    <AppLayout>
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold">Driver Management</h1>
            <p className="text-muted-foreground">Manage your drivers and assign orders</p>
          </div>
          <Button onClick={() => setAddDriverOpen(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add Driver
          </Button>
        </div>

        <Tabs defaultValue="drivers" className="space-y-4">
          <TabsList>
            <TabsTrigger value="drivers" className="gap-2">
              <Users className="h-4 w-4" />
              My Drivers ({drivers.length})
            </TabsTrigger>
            <TabsTrigger value="assign" className="gap-2">
              <Truck className="h-4 w-4" />
              Assign Orders ({assignableOrders.length})
            </TabsTrigger>
            <TabsTrigger value="pending" className="gap-2">
              <Clock className="h-4 w-4" />
              Pending Acceptance ({pendingAcceptanceOrders.length})
            </TabsTrigger>
          </TabsList>

          {/* Drivers Tab */}
          <TabsContent value="drivers">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {drivers.map(rd => (
                <Card key={rd.id}>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-base">
                        {(rd.driver as any)?.display_name || 'Unknown Driver'}
                      </CardTitle>
                      <Button 
                        variant="ghost" 
                        size="icon"
                        onClick={() => handleRemoveDriver(rd.id)}
                      >
                        <UserMinus className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <Package className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">
                        {driverWorkloads[rd.driver_id] || 0} active orders
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              {drivers.length === 0 && (
                <div className="col-span-full text-center py-12">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
                  <h3 className="text-lg font-medium">No drivers yet</h3>
                  <p className="text-muted-foreground text-sm mb-4">
                    Add drivers to start assigning deliveries
                  </p>
                  <Button onClick={() => setAddDriverOpen(true)}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add Driver
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Assign Orders Tab */}
          <TabsContent value="assign">
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>Assign Orders to Driver</CardTitle>
                  {selectedOrders.length > 0 && (
                    <Button onClick={() => setAssignDialogOpen(true)}>
                      Assign {selectedOrders.length} Orders
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {assignableOrders.length > 0 ? (
                  <>
                    <div className="flex items-center gap-2 mb-4">
                      <Checkbox 
                        checked={selectedOrders.length === assignableOrders.length && assignableOrders.length > 0}
                        onCheckedChange={selectAllOrders}
                      />
                      <Label>Select All</Label>
                    </div>
                    <DataGrid 
                      data={assignableOrders} 
                      columns={columns}
                      keyField="id"
                      loading={ordersLoading}
                    />
                  </>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-3" />
                    <p className="text-muted-foreground">No orders to assign</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pending Acceptance Tab */}
          <TabsContent value="pending">
            <div className="space-y-4">
              {pendingAcceptanceOrders.length > 0 ? (
                pendingAcceptanceOrders.map(order => (
                  <Card key={order.id}>
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <div className="font-medium">{order.order_code}</div>
                          <div className="text-sm text-muted-foreground">
                            {order.customer_name} • {order.area}
                          </div>
                          <div className="text-sm mt-1">
                            RM {order.total_amount} ({order.payment_method})
                          </div>
                          <Badge className="mt-2 bg-yellow-100 text-yellow-800">
                            Driver Delivered - Awaiting Your Acceptance
                          </Badge>
                        </div>
                        <div className="flex gap-2">
                          <Button 
                            variant="default" 
                            size="sm"
                            onClick={() => handleAcceptDelivery(order.id)}
                            disabled={acceptDelivery.isPending}
                          >
                            <Check className="h-4 w-4 mr-1" />
                            Accept
                          </Button>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            onClick={() => handleOpenRejectDialog(order.id)}
                          >
                            <X className="h-4 w-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center py-12">
                  <CheckCircle className="h-12 w-12 mx-auto text-green-500 mb-3" />
                  <h3 className="text-lg font-medium">All caught up!</h3>
                  <p className="text-muted-foreground text-sm">
                    No deliveries pending your acceptance
                  </p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Add Driver Dialog */}
        <Dialog open={addDriverOpen} onOpenChange={setAddDriverOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Driver</DialogTitle>
              <DialogDescription>
                Select a driver to add to your team
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Select Driver</Label>
                <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a driver..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableDrivers.map(d => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.display_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {availableDrivers.length === 0 && (
                  <p className="text-sm text-muted-foreground mt-2">
                    No available drivers. Contact admin to create driver accounts.
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDriverOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleAddDriver} 
                disabled={!selectedDriverId || addDriver.isPending}
              >
                {addDriver.isPending ? 'Adding...' : 'Add Driver'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Assign to Driver Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign Orders to Driver</DialogTitle>
              <DialogDescription>
                {selectedOrders.length} orders selected
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Select Driver</Label>
                <Select value={assignToDriverId} onValueChange={setAssignToDriverId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a driver..." />
                  </SelectTrigger>
                  <SelectContent>
                    {drivers.map(rd => (
                      <SelectItem key={rd.driver_id} value={rd.driver_id}>
                        {(rd.driver as any)?.display_name || 'Unknown'} 
                        ({driverWorkloads[rd.driver_id] || 0} active)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                onClick={handleBulkAssign} 
                disabled={!assignToDriverId || bulkAssign.isPending}
              >
                {bulkAssign.isPending ? 'Assigning...' : 'Assign Orders'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Delivery Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Delivery</DialogTitle>
              <DialogDescription>
                This will return the order to the driver for re-delivery
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Reason *</Label>
                <Textarea 
                  value={rejectReason}
                  onChange={e => setRejectReason(e.target.value)}
                  placeholder="Explain why you're rejecting this delivery..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>
                Cancel
              </Button>
              <Button 
                variant="destructive"
                onClick={handleRejectDelivery} 
                disabled={!rejectReason || rejectDelivery.isPending}
              >
                {rejectDelivery.isPending ? 'Rejecting...' : 'Reject'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
