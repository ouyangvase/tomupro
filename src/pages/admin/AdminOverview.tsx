import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDailyTaskSnapshots } from '@/hooks/useNotificationSystem';
import { useOrders } from '@/hooks/useOrders';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { useClaimBatches } from '@/hooks/useClaimBatches';
import { 
  Users, AlertTriangle, Clock, CheckCircle, FileWarning, 
  RefreshCw, Package, DollarSign, TrendingUp, Truck 
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export default function AdminOverview() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [generatingDigest, setGeneratingDigest] = useState(false);
  const { data: snapshots = [], isLoading: snapshotsLoading, refetch } = useDailyTaskSnapshots(selectedDate);
  const { data: orders = [] } = useOrders();
  const { data: userDirectory = [] } = useUserDirectory();
  const { data: claimBatches = [] } = useClaimBatches();

  const pendingClaimBatches = claimBatches.filter(b => b.status === 'ADMIN_ACK_PENDING');

  // Calculate global metrics
  const today = new Date().toISOString().split('T')[0];
  const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const bookingOrders = orders.filter(o => o.status === 'BOOKING');
  const readyOrders = orders.filter(o => o.status === 'READY');
  const deliveredOrders = orders.filter(o => o.runner_status === 'DELIVERED');
  const disputeOrders = orders.filter(o => o.reconciliation_status === 'DISPUTE');

  const globalMetrics = {
    totalOrders: orders.length,
    bookingCount: bookingOrders.length,
    readyCount: readyOrders.length,
    deliveredCount: deliveredOrders.length,
    bookingDue: bookingOrders.filter(o => o.expected_pickup_date && o.expected_pickup_date <= twoDaysFromNow && o.expected_pickup_date >= today).length,
    bookingOverdue: bookingOrders.filter(o => o.expected_pickup_date && o.expected_pickup_date < today).length,
    readyNotAssigned: readyOrders.filter(o => o.runner_status === 'UNASSIGNED').length,
    disputeOpen: disputeOrders.length,
    pendingClaimBatches: pendingClaimBatches.length,
    pendingClaimTotal: pendingClaimBatches.reduce((sum, b) => sum + Number(b.total_amount), 0),
  };

  // Get per-user metrics
  const salespersons = userDirectory.filter(u => u.role === 'salesperson');
  const runners = userDirectory.filter(u => u.role === 'runner');

  const generateDailyDigest = async () => {
    setGeneratingDigest(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-daily-digest');
      if (error) throw error;
      toast.success('Daily digest generated successfully');
      refetch();
    } catch {
      toast.error('Failed to generate daily digest');
    } finally {
      setGeneratingDigest(false);
    }
  };

  const MetricCard = ({ title, value, subtitle, icon: Icon, variant = 'default', onClick }: { 
    title: string; 
    value: number | string; 
    subtitle?: string;
    icon: React.ComponentType<{ className?: string }>;
    variant?: 'default' | 'warning' | 'error' | 'success';
    onClick?: () => void;
  }) => {
    const bgColor = {
      default: 'bg-muted',
      warning: 'bg-yellow-500/10 border-yellow-500/30',
      error: 'bg-destructive/10 border-destructive/30',
      success: 'bg-green-500/10 border-green-500/30',
    }[variant];

    return (
      <Card className={`${bgColor} ${onClick ? 'cursor-pointer hover:opacity-80' : ''}`} onClick={onClick}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Icon className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-sm text-muted-foreground">{title}</p>
              {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Admin Overview</h1>
            <p className="text-muted-foreground">
              System-wide metrics and performance monitoring
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-40"
            />
            <Button variant="outline" size="icon" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button onClick={generateDailyDigest} disabled={generatingDigest}>
              {generatingDigest ? 'Generating...' : 'Generate Digest'}
            </Button>
          </div>
        </div>

        {/* Global KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <MetricCard title="Total Orders" value={globalMetrics.totalOrders} icon={Package} />
          <MetricCard title="Booking" value={globalMetrics.bookingCount} icon={Clock} />
          <MetricCard title="Ready" value={globalMetrics.readyCount} icon={TrendingUp} />
          <MetricCard title="Delivered" value={globalMetrics.deliveredCount} icon={CheckCircle} variant="success" />
          <MetricCard 
            title="Pending Claims" 
            value={globalMetrics.pendingClaimBatches} 
            subtitle={`${globalMetrics.pendingClaimTotal.toLocaleString()}`}
            icon={DollarSign} 
            variant="warning"
            onClick={() => navigate('/admin/claim-batches')}
          />
          <MetricCard 
            title="Disputes" 
            value={globalMetrics.disputeOpen} 
            icon={AlertTriangle} 
            variant={globalMetrics.disputeOpen > 0 ? 'error' : 'default'}
          />
        </div>

        {/* Problem Queue */}
        <div className="grid md:grid-cols-3 gap-4">
          <Card className={globalMetrics.bookingOverdue > 0 ? 'border-destructive/50' : ''}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                Overdue Bookings
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{globalMetrics.bookingOverdue}</p>
              {globalMetrics.bookingOverdue > 0 && (
                <Badge variant="destructive" className="mt-2">Requires attention</Badge>
              )}
            </CardContent>
          </Card>

          <Card className={globalMetrics.readyNotAssigned > 0 ? 'border-yellow-500/50' : ''}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Truck className="h-4 w-4" />
                Unassigned Ready Orders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{globalMetrics.readyNotAssigned}</p>
              {globalMetrics.readyNotAssigned > 0 && (
                <Badge variant="secondary" className="mt-2">Needs runner</Badge>
              )}
            </CardContent>
          </Card>

          <Card className={globalMetrics.pendingClaimBatches > 0 ? 'border-primary/50' : ''}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <DollarSign className="h-4 w-4" />
                Pending Claim Batches
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{globalMetrics.pendingClaimBatches}</p>
              {globalMetrics.pendingClaimBatches > 0 && (
                <Button size="sm" className="mt-2" onClick={() => navigate('/admin/claim-batches')}>
                  Review Claims
                </Button>
              )}
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="salespersons">
          <TabsList>
            <TabsTrigger value="salespersons">Salespersons ({salespersons.length})</TabsTrigger>
            <TabsTrigger value="runners">Runners ({runners.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="salespersons" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Salesperson Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Salesperson</TableHead>
                      <TableHead className="text-center">Booking</TableHead>
                      <TableHead className="text-center">Ready</TableHead>
                      <TableHead className="text-center">Overdue</TableHead>
                      <TableHead className="text-center">Disputes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salespersons.map((sp) => {
                      const spOrders = orders.filter(o => o.salesperson_id === sp.id);
                      const spBooking = spOrders.filter(o => o.status === 'BOOKING').length;
                      const spReady = spOrders.filter(o => o.status === 'READY').length;
                      const spOverdue = spOrders.filter(o => o.status === 'BOOKING' && o.expected_pickup_date && o.expected_pickup_date < today).length;
                      const spDisputes = spOrders.filter(o => o.reconciliation_status === 'DISPUTE').length;

                      return (
                        <TableRow key={sp.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{sp.display_name}</p>
                              <p className="text-xs text-muted-foreground">{sp.email}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{spBooking}</TableCell>
                          <TableCell className="text-center">{spReady}</TableCell>
                          <TableCell className="text-center">
                            {spOverdue > 0 ? <Badge variant="destructive">{spOverdue}</Badge> : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            {spDisputes > 0 ? <Badge variant="destructive">{spDisputes}</Badge> : '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="runners" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Runner Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Runner</TableHead>
                      <TableHead className="text-center">Assigned</TableHead>
                      <TableHead className="text-center">Delivered</TableHead>
                      <TableHead className="text-center">Failed</TableHead>
                      <TableHead className="text-center">Pending Claims</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {runners.map((runner) => {
                      const runnerOrders = orders.filter(o => o.runner_id === runner.id);
                      const assigned = runnerOrders.filter(o => ['ASSIGNED', 'TAKEN'].includes(o.runner_status)).length;
                      const delivered = runnerOrders.filter(o => o.runner_status === 'DELIVERED').length;
                      const failed = runnerOrders.filter(o => o.runner_status === 'FAILED_DELIVERY').length;
                      const pendingClaims = claimBatches.filter(b => b.runner_id === runner.id && b.status === 'ADMIN_ACK_PENDING').length;

                      return (
                        <TableRow key={runner.id}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{runner.display_name}</p>
                              <p className="text-xs text-muted-foreground">{runner.email}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{assigned}</TableCell>
                          <TableCell className="text-center">{delivered}</TableCell>
                          <TableCell className="text-center">
                            {failed > 0 ? <Badge variant="destructive">{failed}</Badge> : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            {pendingClaims > 0 ? <Badge variant="secondary">{pendingClaims}</Badge> : '-'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
