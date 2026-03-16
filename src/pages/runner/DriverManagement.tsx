import { useState, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useOrders } from '@/hooks/useOrders';
import { 
  useRunnerDrivers, 
  useAddDriverToRunner, 
  useRemoveDriverFromRunner,
  useBulkAssignOrdersToDriver,
  useRunnerAcceptDelivery,
  useRunnerRejectDelivery,
  useGenerateDriverCode,
} from '@/hooks/useDrivers';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { DataGrid } from '@/components/data-grid/DataGrid';
import { PageHero } from '@/components/dashboard/PageHero';
import { 
  Users, UserPlus, Truck, Check, X, Package, 
  CheckCircle, UserMinus, Key, Copy, Clock,
  Wifi, WifiOff, AlertTriangle, Eye, Send
} from 'lucide-react';
import { toast } from 'sonner';
import capybaraDriver from '@/assets/capybara-driver.png';

const DRIVER_CAPACITY = 40;

export default function DriverManagement() {
  const { profile } = useAuth();
  const { data: drivers = [], isLoading: driversLoading } = useRunnerDrivers(profile?.id);
  const { data: users = [] } = useUserDirectory();
  const { data: orders = [], isLoading: ordersLoading } = useOrders({ runnerId: profile?.id });

  const userById = useMemo(() => new Map(users.map((u) => [u.id, u])), [users]);
  
  const addDriver = useAddDriverToRunner();
  const removeDriver = useRemoveDriverFromRunner();
  const bulkAssign = useBulkAssignOrdersToDriver();
  const acceptDelivery = useRunnerAcceptDelivery();
  const rejectDelivery = useRunnerRejectDelivery();
  const generateCode = useGenerateDriverCode();

  const [addDriverOpen, setAddDriverOpen] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [assignDialogOpen, setAssignDialogOpen] = useState(false);
  const [selectedOrders, setSelectedOrders] = useState<string[]>([]);
  const [assignToDriverId, setAssignToDriverId] = useState('');
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [rejectOrderId, setRejectOrderId] = useState('');
  const [rejectReason, setRejectReason] = useState('');

  const availableDrivers = useMemo(() => {
    const assignedDriverIds = drivers.map(d => d.driver_id);
    return users.filter(u => u.role === 'driver' && !assignedDriverIds.includes(u.id));
  }, [users, drivers]);

  const assignableOrders = useMemo(() => {
    return orders.filter(o => 
      o.status === 'READY' && 
      (o.runner_status === 'TAKEN' || o.runner_status === 'ASSIGNED') &&
      (!o.driver_id || o.driver_status === 'UNASSIGNED')
    );
  }, [orders]);

  const pendingAcceptanceOrders = useMemo(() => {
    return orders.filter(o => 
      o.driver_status === 'DRIVER_DELIVERED' && 
      o.runner_accept_status === 'PENDING'
    );
  }, [orders]);

  const driverWorkloads = useMemo(() => {
    const counts: Record<string, number> = {};
    orders.forEach(o => {
      if (o.driver_id && ['ASSIGNED', 'OUT_FOR_DELIVERY', 'DRIVER_DELIVERED'].includes(o.driver_status || '')) {
        counts[o.driver_id] = (counts[o.driver_id] || 0) + 1;
      }
    });
    return counts;
  }, [orders]);

  // Stats
  const totalAssigned = Object.values(driverWorkloads).reduce((a, b) => a + b, 0);

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
    setSelectedOrders(prev => prev.includes(orderId) ? prev.filter(id => id !== orderId) : [...prev, orderId]);
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
      key: 'select', header: '',
      render: (order: any) => <Checkbox checked={selectedOrders.includes(order.id)} onCheckedChange={() => toggleOrderSelection(order.id)} />,
    },
    { key: 'order_code', header: 'Order' },
    { key: 'customer_name', header: 'Customer' },
    { key: 'area', header: 'Area' },
    { key: 'total_amount', header: 'Amount (BND)', render: (order: any) => `BND ${Number(order.total_amount).toFixed(2)}` },
  ];

  const getCapacityColor = (workload: number) => {
    const pct = (workload / DRIVER_CAPACITY) * 100;
    if (pct >= 80) return 'bg-destructive';
    if (pct >= 50) return 'bg-amber-500';
    return 'bg-emerald-500';
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Hero */}
        <PageHero
          icon={<Truck className="h-6 w-6 text-primary" />}
          title="Driver Operations"
          subtitle="Manage drivers and assign delivery tasks"
          image={capybaraDriver}
          imageAlt="Driver Capybara"
          actions={
            <Button onClick={() => setAddDriverOpen(true)} className="rounded-xl gap-2">
              <UserPlus className="h-4 w-4" />
              Add Driver
            </Button>
          }
        />

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="border-none shadow-sm bg-gradient-to-br from-emerald-50 to-emerald-100/50 dark:from-emerald-950/20 dark:to-emerald-900/10">
            <CardContent className="p-5 flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{drivers.length}</p>
                <p className="text-xs text-muted-foreground">Active Drivers</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm bg-gradient-to-br from-primary/5 to-primary/10">
            <CardContent className="p-5 flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-primary/15 flex items-center justify-center shrink-0">
                <Package className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{totalAssigned}</p>
                <p className="text-xs text-muted-foreground">Orders Assigned</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm bg-gradient-to-br from-amber-50 to-amber-100/50 dark:from-amber-950/20 dark:to-amber-900/10">
            <CardContent className="p-5 flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-amber-500/15 flex items-center justify-center shrink-0">
                <Clock className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{pendingAcceptanceOrders.length}</p>
                <p className="text-xs text-muted-foreground">Pending Accept</p>
              </div>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm bg-gradient-to-br from-blue-50 to-blue-100/50 dark:from-blue-950/20 dark:to-blue-900/10">
            <CardContent className="p-5 flex items-center gap-3">
              <div className="h-11 w-11 rounded-2xl bg-blue-500/15 flex items-center justify-center shrink-0">
                <Truck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{assignableOrders.length}</p>
                <p className="text-xs text-muted-foreground">To Assign</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="drivers" className="space-y-5">
          <TabsList className="rounded-xl">
            <TabsTrigger value="drivers" className="gap-2 rounded-lg">
              <Users className="h-4 w-4" />
              My Drivers ({drivers.length})
            </TabsTrigger>
            <TabsTrigger value="assign" className="gap-2 rounded-lg">
              <Truck className="h-4 w-4" />
              Assign Orders ({assignableOrders.length})
            </TabsTrigger>
            <TabsTrigger value="pending" className="gap-2 rounded-lg">
              <Clock className="h-4 w-4" />
              Pending ({pendingAcceptanceOrders.length})
            </TabsTrigger>
          </TabsList>

          {/* Drivers Tab */}
          <TabsContent value="drivers">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {drivers.map(rd => {
                const driverData = rd.driver as any;
                const driverCode = driverData?.driver_code;
                const driverName = driverData?.display_name ?? userById.get(rd.driver_id)?.display_name ?? 'Unknown';
                const workload = driverWorkloads[rd.driver_id] || 0;
                const capacityPct = Math.min((workload / DRIVER_CAPACITY) * 100, 100);
                const email = driverData?.email || userById.get(rd.driver_id)?.email;
                
                return (
                  <Card key={rd.id} className="border shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-primary to-primary/30" />
                    <CardContent className="p-5 space-y-4">
                      {/* Header */}
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="h-11 w-11 rounded-2xl bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                            {(driverName)[0]?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <p className="font-semibold text-base">{driverName}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              {workload > 0 ? (
                                <Badge variant="secondary" className="text-xs gap-1 rounded-full">
                                  <Wifi className="h-3 w-3" />
                                  Active
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs gap-1 rounded-full text-muted-foreground">
                                  <WifiOff className="h-3 w-3" />
                                  Idle
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => handleRemoveDriver(rd.id)}>
                          <UserMinus className="h-4 w-4" />
                        </Button>
                      </div>

                      {/* Capacity Bar */}
                      <div>
                        <div className="flex items-center justify-between text-xs mb-1.5">
                          <span className="text-muted-foreground">{workload} orders</span>
                          <span className="text-muted-foreground font-medium">{workload} / {DRIVER_CAPACITY}</span>
                        </div>
                        <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${getCapacityColor(workload)}`}
                            style={{ width: `${capacityPct}%` }}
                          />
                        </div>
                      </div>

                      {/* Email */}
                      {email && (
                        <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/50">
                          <span className="text-sm text-muted-foreground truncate mr-2">{email}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 shrink-0"
                            onClick={() => { navigator.clipboard.writeText(email); toast.success('Email copied'); }}
                          >
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                      
                      {/* Driver Code */}
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-muted/50">
                        <div className="flex items-center gap-2">
                          <Key className="h-4 w-4 text-muted-foreground" />
                          {driverCode ? (
                            <span className="font-mono font-semibold text-sm">{driverCode}</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">No code</span>
                          )}
                        </div>
                        <div className="flex gap-1">
                          {driverCode && (
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => { navigator.clipboard.writeText(driverCode); toast.success('Code copied'); }}>
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          <Button variant="outline" size="sm" className="h-7 text-xs rounded-lg"
                            onClick={() => generateCode.mutate(rd.driver_id)} disabled={generateCode.isPending}>
                            {generateCode.isPending ? '...' : driverCode ? 'Regenerate' : 'Generate'}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              
              {drivers.length === 0 && (
                <div className="col-span-full flex flex-col items-center justify-center py-16">
                  <img src={capybaraDriver} alt="No drivers" className="h-28 w-28 object-contain mb-5 drop-shadow-md opacity-80" />
                  <h3 className="text-lg font-semibold">No drivers yet</h3>
                  <p className="text-sm text-muted-foreground mb-4">Add drivers to start assigning deliveries</p>
                  <Button onClick={() => setAddDriverOpen(true)} className="rounded-xl gap-2">
                    <UserPlus className="h-4 w-4" />
                    Add Driver
                  </Button>
                </div>
              )}
            </div>
          </TabsContent>

          {/* Assign Orders Tab */}
          <TabsContent value="assign">
            <Card className="border shadow-sm">
              <div className="flex items-center justify-between p-5 border-b">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Send className="h-4.5 w-4.5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold">Assign Orders to Driver</p>
                    <p className="text-xs text-muted-foreground">{assignableOrders.length} orders ready</p>
                  </div>
                </div>
                {selectedOrders.length > 0 && (
                  <Button onClick={() => setAssignDialogOpen(true)} className="rounded-xl gap-2">
                    <Send className="h-4 w-4" />
                    Assign {selectedOrders.length} Orders
                  </Button>
                )}
              </div>
              <CardContent className="p-5">
                {assignableOrders.length > 0 ? (
                  <>
                    <div className="flex items-center gap-2 mb-4">
                      <Checkbox 
                        checked={selectedOrders.length === assignableOrders.length && assignableOrders.length > 0}
                        onCheckedChange={selectAllOrders}
                      />
                      <Label className="text-sm">Select All</Label>
                    </div>
                    <DataGrid data={assignableOrders} columns={columns} keyField="id" loading={ordersLoading} />
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center py-12">
                    <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
                      <CheckCircle className="h-6 w-6 text-emerald-500" />
                    </div>
                    <p className="text-sm text-muted-foreground">No orders to assign — all clear!</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pending Tab */}
          <TabsContent value="pending">
            <div className="space-y-3">
              {pendingAcceptanceOrders.length > 0 ? (
                pendingAcceptanceOrders.map(order => (
                  <Card key={order.id} className="border shadow-sm overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-amber-400 to-amber-200" />
                    <CardContent className="p-5">
                      <div className="flex justify-between items-start">
                        <div className="space-y-1.5">
                          <p className="font-semibold">{order.order_code}</p>
                          <p className="text-sm text-muted-foreground">{order.customer_name} • {order.area}</p>
                          <p className="text-sm">BND {Number(order.total_amount).toFixed(2)} ({order.payment_method})</p>
                          <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 mt-1">
                            <Clock className="h-3 w-3 mr-1" />
                            Awaiting Acceptance
                          </Badge>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="rounded-xl gap-1.5" onClick={() => handleAcceptDelivery(order.id)} disabled={acceptDelivery.isPending}>
                            <Check className="h-4 w-4" /> Accept
                          </Button>
                          <Button variant="destructive" size="sm" className="rounded-xl gap-1.5" onClick={() => handleOpenRejectDialog(order.id)}>
                            <X className="h-4 w-4" /> Reject
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="h-12 w-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-4">
                    <CheckCircle className="h-6 w-6 text-emerald-500" />
                  </div>
                  <h3 className="text-base font-semibold">All caught up!</h3>
                  <p className="text-sm text-muted-foreground">No deliveries pending acceptance</p>
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
              <DialogDescription>Select a driver to add to your team</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue placeholder="Choose a driver..." />
                </SelectTrigger>
                <SelectContent>
                  {availableDrivers.map(d => (
                    <SelectItem key={d.id} value={d.id}>{d.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {availableDrivers.length === 0 && (
                <p className="text-sm text-muted-foreground">No available drivers. Contact admin to create driver accounts.</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDriverOpen(false)}>Cancel</Button>
              <Button onClick={handleAddDriver} disabled={!selectedDriverId || addDriver.isPending} className="rounded-xl">
                {addDriver.isPending ? 'Adding...' : 'Add Driver'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Assign Dialog */}
        <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Assign Orders to Driver</DialogTitle>
              <DialogDescription>{selectedOrders.length} orders selected</DialogDescription>
            </DialogHeader>
            <Select value={assignToDriverId} onValueChange={setAssignToDriverId}>
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Choose a driver..." />
              </SelectTrigger>
              <SelectContent>
                {drivers.map(rd => (
                  <SelectItem key={rd.driver_id} value={rd.driver_id}>
                    {(rd.driver as any)?.display_name || userById.get(rd.driver_id)?.display_name || 'Unknown'} ({driverWorkloads[rd.driver_id] || 0} active)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleBulkAssign} disabled={!assignToDriverId || bulkAssign.isPending} className="rounded-xl">
                {bulkAssign.isPending ? 'Assigning...' : 'Assign Orders'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject Delivery</DialogTitle>
              <DialogDescription>This will return the order to the driver for re-delivery</DialogDescription>
            </DialogHeader>
            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Explain why you're rejecting..." className="rounded-xl" />
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancel</Button>
              <Button variant="destructive" onClick={handleRejectDelivery} disabled={!rejectReason || rejectDelivery.isPending} className="rounded-xl">
                {rejectDelivery.isPending ? 'Rejecting...' : 'Reject'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
