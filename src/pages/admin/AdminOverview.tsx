import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertTriangle, XCircle, Calendar, MessageSquare, ExternalLink,
  Construction, RefreshCw, Package, DollarSign, CheckCircle, Truck,
  Clock, Users, ArrowRight, Activity, TrendingUp, ShoppingCart,
  AlertCircle, Zap
} from 'lucide-react';
import { useDailyTaskSnapshots } from '@/hooks/useNotificationSystem';
import { useOrders } from '@/hooks/useOrders';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { useClaimBatches } from '@/hooks/useClaimBatches';
import { useAdminActionRequiredStats } from '@/hooks/useActionRequiredStats';
import { useMaintenanceMode } from '@/hooks/useMaintenanceMode';
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter';

export default function AdminOverview() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [generatingDigest, setGeneratingDigest] = useState(false);
  const { data: snapshots = [], isLoading: snapshotsLoading, refetch } = useDailyTaskSnapshots(selectedDate);
  const { data: orders = [] } = useOrders();
  const { data: userDirectory = [] } = useUserDirectory();
  const { data: claimBatches = [] } = useClaimBatches();
  const { data: actionStats, isLoading: actionStatsLoading } = useAdminActionRequiredStats();
  const { isMaintenanceMode, toggleMaintenance, isToggling } = useMaintenanceMode();

  const pendingClaimBatches = claimBatches.filter(b => b.status === 'ADMIN_ACK_PENDING');
  const today = new Date().toISOString().split('T')[0];
  const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const bookingOrders = orders.filter(o => o.status === 'BOOKING');
  const readyOrders = orders.filter(o => o.status === 'READY');
  const deliveredOrders = orders.filter(o => o.runner_status === 'DELIVERED');
  const disputeOrders = orders.filter(o => o.reconciliation_status === 'DISPUTE');
  const salespersons = userDirectory.filter(u => u.role === 'salesperson');
  const runners = userDirectory.filter(u => u.role === 'runner');

  const metrics = {
    totalOrders: orders.length,
    bookingCount: bookingOrders.length,
    readyCount: readyOrders.length,
    deliveredCount: deliveredOrders.length,
    bookingOverdue: bookingOrders.filter(o => o.expected_pickup_date && o.expected_pickup_date < today).length,
    readyNotAssigned: readyOrders.filter(o => o.runner_status === 'UNASSIGNED').length,
    disputeOpen: disputeOrders.length,
    pendingClaimBatches: pendingClaimBatches.length,
    pendingClaimTotal: pendingClaimBatches.reduce((sum, b) => sum + Number(b.total_amount), 0),
  };

  const generateDailyDigest = async () => {
    setGeneratingDigest(true);
    try {
      const { error } = await supabase.functions.invoke('generate-daily-digest');
      if (error) throw error;
      toast.success('Daily digest generated successfully');
      refetch();
    } catch {
      toast.error('Failed to generate daily digest');
    } finally {
      setGeneratingDigest(false);
    }
  };

  return (
    <AppLayout>
      <div className="p-4 md:p-6 space-y-6 max-w-[1400px] mx-auto">
        {/* Page Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/10">
              <Activity className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Operations Center</h1>
              <p className="text-sm text-muted-foreground">System-wide metrics and performance monitoring</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm",
              isMaintenanceMode ? "border-destructive/50 bg-destructive/5" : "border-border"
            )}>
              <Construction className={cn("h-3.5 w-3.5", isMaintenanceMode ? "text-destructive" : "text-muted-foreground")} />
              <span className="font-medium">Maintenance</span>
              <Switch
                checked={isMaintenanceMode}
                disabled={isToggling}
                onCheckedChange={(checked) => {
                  toggleMaintenance(checked, {
                    onSuccess: () => toast.success(checked ? 'Maintenance mode enabled' : 'Maintenance mode disabled'),
                    onError: () => toast.error('Failed to toggle maintenance mode'),
                  });
                }}
              />
            </div>
            <Input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="w-36 h-9" />
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Button size="sm" onClick={generateDailyDigest} disabled={generatingDigest}>
              {generatingDigest ? 'Generating...' : 'Generate Digest'}
            </Button>
          </div>
        </div>

        {/* ── Top Section: Action Required Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <ActionCard
            label="Action Required"
            value={actionStats?.systemTotal ?? 0}
            icon={AlertTriangle}
            loading={actionStatsLoading}
            variant="critical"
            onClick={() => navigate('/sales/action-required')}
          />
          <ActionCard
            label="Failed Delivery"
            value={actionStats?.failedDelivery ?? 0}
            icon={XCircle}
            loading={actionStatsLoading}
            variant="error"
            onClick={() => navigate('/sales/action-required')}
          />
          <ActionCard
            label="Reschedule Requests"
            value={actionStats?.rescheduled ?? 0}
            icon={Calendar}
            loading={actionStatsLoading}
            variant="warning"
          />
          <ActionCard
            label="Runner Notes"
            value={actionStats?.runnerFlagged ?? 0}
            icon={MessageSquare}
            loading={actionStatsLoading}
            variant="info"
          />
        </div>

        {/* ── Operations Issues ── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <IssueCard
            label="Overdue Orders"
            value={metrics.bookingOverdue}
            alert={metrics.bookingOverdue > 0}
            alertLabel="Requires attention"
            icon={AlertCircle}
            onClick={() => navigate('/sales/booking')}
          />
          <IssueCard
            label="Unassigned Ready"
            value={metrics.readyNotAssigned}
            alert={metrics.readyNotAssigned > 0}
            alertLabel="Needs runner"
            icon={Truck}
            onClick={() => navigate('/sales/ready')}
          />
          <IssueCard
            label="Pending Claims"
            value={metrics.pendingClaimBatches}
            alert={metrics.pendingClaimBatches > 0}
            alertLabel={`$${metrics.pendingClaimTotal.toLocaleString()}`}
            icon={DollarSign}
            onClick={() => navigate('/admin/claim-batches')}
          />
        </div>

        {/* ── Orders Pipeline ── */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-primary" />
              <CardTitle className="text-base">Orders Pipeline</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <PipelineStage label="Booking" value={metrics.bookingCount} icon={Package} color="primary" onClick={() => navigate('/sales/booking')} />
              <PipelineStage label="Ready" value={metrics.readyCount} icon={ShoppingCart} color="warning" onClick={() => navigate('/sales/ready')} />
              <PipelineStage label="Dispatch" value={readyOrders.filter(o => o.runner_status !== 'UNASSIGNED').length} icon={Truck} color="info" onClick={() => navigate('/runner/inbox')} />
              <PipelineStage label="Delivered" value={metrics.deliveredCount} icon={CheckCircle} color="success" onClick={() => navigate('/reconciliation/admin')} />
            </div>
          </CardContent>
        </Card>

        {/* ── Salesperson Accountability ── */}
        {(actionStats?.systemTotal ?? 0) > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" />
                  <CardTitle className="text-base">Salesperson Accountability</CardTitle>
                </div>
                <p className="text-xs text-muted-foreground">Sorted by highest failed deliveries</p>
              </div>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>Salesperson</TableHead>
                    <TableHead className="text-center">Total</TableHead>
                    <TableHead className="text-center">Failed</TableHead>
                    <TableHead className="text-center">Reschedule</TableHead>
                    <TableHead className="text-center">Notes</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {actionStats?.bySalesperson.filter(sp => sp.total > 0).map((sp) => {
                    const isHighRisk = sp.failedDelivery >= 10;
                    return (
                      <TableRow key={sp.salespersonId} className={cn(isHighRisk && "bg-destructive/[0.03]")}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div>
                              <p className="font-medium">{sp.salespersonName}</p>
                              <p className="text-xs text-muted-foreground">{sp.email}</p>
                            </div>
                            {isHighRisk && <Badge variant="error" className="text-[10px]">High Risk</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <Badge variant="destructive" className="text-sm px-3 font-bold">{sp.total}</Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {sp.failedDelivery > 0 ? (
                            <span className="text-sm font-bold text-destructive">{sp.failedDelivery}</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          {sp.rescheduled > 0 ? (
                            <span className="text-sm font-medium text-[hsl(var(--status-warning))]">{sp.rescheduled}</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-center">
                          {sp.runnerFlagged > 0 ? (
                            <span className="text-sm font-medium text-primary">{sp.runnerFlagged}</span>
                          ) : <span className="text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => navigate('/sales/action-required')}>
                            <ExternalLink className="h-3 w-3" /> View
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {actionStats?.bySalesperson.filter(sp => sp.total > 0).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No action required items
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* ── Team Metrics ── */}
        <Tabs defaultValue="salespersons">
          <TabsList>
            <TabsTrigger value="salespersons">Salespersons ({salespersons.length})</TabsTrigger>
            <TabsTrigger value="runners">Runners ({runners.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="salespersons" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Salesperson Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>Salesperson</TableHead>
                      <TableHead className="text-center">Booking</TableHead>
                      <TableHead className="text-center">Ready</TableHead>
                      <TableHead className="text-center">Overdue</TableHead>
                      
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salespersons.map((sp) => {
                      const spOrders = orders.filter(o => o.salesperson_id === sp.id);
                      const spBooking = spOrders.filter(o => o.status === 'BOOKING').length;
                      const spReady = spOrders.filter(o => o.status === 'READY').length;
                      const spOverdue = spOrders.filter(o => o.status === 'BOOKING' && o.expected_pickup_date && o.expected_pickup_date < today).length;
                      

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
                            {spOverdue > 0 ? <Badge variant="destructive">{spOverdue}</Badge> : '—'}
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
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Runner Metrics</CardTitle>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
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
                            {failed > 0 ? <Badge variant="destructive">{failed}</Badge> : '—'}
                          </TableCell>
                          <TableCell className="text-center">
                            {pendingClaims > 0 ? <Badge variant="secondary">{pendingClaims}</Badge> : '—'}
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

/* ── Sub-components ── */

function ActionCard({ label, value, icon: Icon, loading, variant, onClick }: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
  variant: 'critical' | 'error' | 'warning' | 'info';
  onClick?: () => void;
}) {
  const styles = {
    critical: {
      border: value > 0 ? 'border-destructive/40' : 'border-border',
      bg: value > 0 ? 'bg-destructive/5' : '',
      icon: value > 0 ? 'text-destructive' : 'text-muted-foreground',
      pulse: value > 0,
    },
    error: {
      border: value > 0 ? 'border-destructive/30' : 'border-border',
      bg: value > 0 ? 'bg-destructive/[0.03]' : '',
      icon: 'text-destructive',
      pulse: false,
    },
    warning: {
      border: value > 0 ? 'border-[hsl(var(--status-warning)/0.3)]' : 'border-border',
      bg: value > 0 ? 'bg-[hsl(var(--status-warning)/0.03)]' : '',
      icon: 'text-[hsl(var(--status-warning))]',
      pulse: false,
    },
    info: {
      border: value > 0 ? 'border-primary/30' : 'border-border',
      bg: value > 0 ? 'bg-primary/[0.03]' : '',
      icon: 'text-primary',
      pulse: false,
    },
  }[variant];

  return (
    <Card
      className={cn(styles.border, styles.bg, onClick && "cursor-pointer hover:shadow-md transition-shadow")}
      onClick={onClick}
    >
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
            {loading ? (
              <Skeleton className="h-10 w-16 mt-1" />
            ) : (
              <p className={cn("text-4xl font-bold tracking-tight mt-1", value > 0 && styles.icon)}>
                <AnimatedCounter value={value} />
              </p>
            )}
          </div>
          <Icon className={cn("h-7 w-7", styles.icon, styles.pulse && "animate-pulse")} />
        </div>
      </CardContent>
    </Card>
  );
}

function IssueCard({ label, value, alert, alertLabel, icon: Icon, onClick }: {
  label: string;
  value: number;
  alert: boolean;
  alertLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  onClick?: () => void;
}) {
  return (
    <Card
      className={cn(
        "transition-all",
        alert && "border-destructive/20",
        onClick && "cursor-pointer hover:shadow-sm"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-3">
          <div className={cn("p-2 rounded-lg", alert ? "bg-destructive/10" : "bg-secondary")}>
            <Icon className={cn("h-4 w-4", alert ? "text-destructive" : "text-muted-foreground")} />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold">{value}</p>
          </div>
        </div>
        {alert && (
          <Badge variant="destructive" className="mt-2 text-[10px]">{alertLabel}</Badge>
        )}
      </CardContent>
    </Card>
  );
}

function PipelineStage({ label, value, icon: Icon, color, onClick }: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  color: 'primary' | 'warning' | 'info' | 'success';
  onClick?: () => void;
}) {
  const colorMap = {
    primary: { bg: 'bg-primary/10', text: 'text-primary' },
    warning: { bg: 'bg-[hsl(var(--status-warning)/0.1)]', text: 'text-[hsl(var(--status-warning))]' },
    info: { bg: 'bg-[hsl(var(--status-pending)/0.1)]', text: 'text-[hsl(var(--status-pending))]' },
    success: { bg: 'bg-[hsl(var(--status-success)/0.1)]', text: 'text-[hsl(var(--status-success))]' },
  }[color];

  return (
    <div
      className={cn("rounded-xl border bg-card p-4 transition-all", onClick && "cursor-pointer hover:shadow-sm")}
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded-lg", colorMap.bg)}>
          <Icon className={cn("h-5 w-5", colorMap.text)} />
        </div>
        <div>
          <p className="text-2xl font-bold tabular-nums"><AnimatedCounter value={value} /></p>
          <p className="text-xs text-muted-foreground font-medium">{label}</p>
        </div>
      </div>
    </div>
  );
}
