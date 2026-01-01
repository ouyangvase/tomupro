import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDailyTaskSnapshots } from '@/hooks/useNotificationSystem';
import { useOrders } from '@/hooks/useOrders';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { Users, AlertTriangle, Clock, CheckCircle, FileWarning, RefreshCw } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { useState } from 'react';
import { Input } from '@/components/ui/input';

interface SalespersonMetrics {
  userId: string;
  displayName: string;
  email: string;
  bookingDue: number;
  bookingOverdue: number;
  readyNotAssigned: number;
  disputeOpen: number;
  pendingReconciliation: number;
}

export default function ManagerOversight() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const { data: snapshots = [], isLoading: snapshotsLoading, refetch } = useDailyTaskSnapshots(selectedDate);
  const { data: orders = [] } = useOrders();
  const { data: userDirectory = [] } = useUserDirectory();

  // Get salesperson metrics from snapshots or calculate from orders
  const salespersons = userDirectory.filter(u => u.role === 'salesperson');
  
  const salespersonMetrics: SalespersonMetrics[] = salespersons.map(sp => {
    const snapshot = snapshots.find(s => s.owner_user_id === sp.id && s.role === 'salesperson');
    const spOrders = orders.filter(o => o.salesperson_id === sp.id);
    
    const today = new Date().toISOString().split('T')[0];
    const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const bookingOrders = spOrders.filter(o => o.status === 'BOOKING');
    const metrics = snapshot?.metrics as Record<string, number> | null;
    
    return {
      userId: sp.id,
      displayName: sp.display_name,
      email: sp.email || '',
      bookingDue: metrics?.booking_due ?? bookingOrders.filter(o => o.expected_pickup_date && o.expected_pickup_date <= twoDaysFromNow && o.expected_pickup_date >= today).length,
      bookingOverdue: metrics?.booking_overdue ?? bookingOrders.filter(o => o.expected_pickup_date && o.expected_pickup_date < today).length,
      readyNotAssigned: metrics?.ready_not_assigned ?? spOrders.filter(o => o.status === 'READY' && o.runner_status === 'UNASSIGNED').length,
      disputeOpen: metrics?.dispute_open ?? spOrders.filter(o => o.reconciliation_status === 'DISPUTE').length,
      pendingReconciliation: metrics?.pending_reconciliation ?? spOrders.filter(o => o.runner_status === 'DELIVERED' && o.reconciliation_status !== 'CLAIMED').length,
    };
  });

  // Calculate totals
  const totals = salespersonMetrics.reduce((acc, m) => ({
    bookingDue: acc.bookingDue + m.bookingDue,
    bookingOverdue: acc.bookingOverdue + m.bookingOverdue,
    readyNotAssigned: acc.readyNotAssigned + m.readyNotAssigned,
    disputeOpen: acc.disputeOpen + m.disputeOpen,
    pendingReconciliation: acc.pendingReconciliation + m.pendingReconciliation,
  }), { bookingDue: 0, bookingOverdue: 0, readyNotAssigned: 0, disputeOpen: 0, pendingReconciliation: 0 });

  const MetricCard = ({ title, value, icon: Icon, variant = 'default' }: { 
    title: string; 
    value: number; 
    icon: React.ComponentType<{ className?: string }>;
    variant?: 'default' | 'warning' | 'error' | 'success';
  }) => {
    const bgColor = {
      default: 'bg-muted',
      warning: 'bg-yellow-500/10 border-yellow-500/30',
      error: 'bg-destructive/10 border-destructive/30',
      success: 'bg-green-500/10 border-green-500/30',
    }[variant];

    return (
      <Card className={bgColor}>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Icon className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{value}</p>
              <p className="text-sm text-muted-foreground">{title}</p>
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
            <h1 className="text-2xl font-bold">Manager Oversight</h1>
            <p className="text-muted-foreground">
              Monitor salesperson performance and pending tasks
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
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <MetricCard title="Booking Due" value={totals.bookingDue} icon={Clock} variant="warning" />
          <MetricCard title="Overdue" value={totals.bookingOverdue} icon={AlertTriangle} variant="error" />
          <MetricCard title="Not Assigned" value={totals.readyNotAssigned} icon={Users} />
          <MetricCard title="Disputes" value={totals.disputeOpen} icon={FileWarning} variant="error" />
          <MetricCard title="Pending Recon" value={totals.pendingReconciliation} icon={CheckCircle} />
        </div>

        <Tabs defaultValue="salespersons">
          <TabsList>
            <TabsTrigger value="salespersons">By Salesperson</TabsTrigger>
            <TabsTrigger value="problems">Problem Queue</TabsTrigger>
          </TabsList>

          <TabsContent value="salespersons" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Salesperson Performance</CardTitle>
                <CardDescription>
                  Click on any metric to view detailed orders
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Salesperson</TableHead>
                      <TableHead className="text-center">Booking Due</TableHead>
                      <TableHead className="text-center">Overdue</TableHead>
                      <TableHead className="text-center">Not Assigned</TableHead>
                      <TableHead className="text-center">Disputes</TableHead>
                      <TableHead className="text-center">Pending Recon</TableHead>
                      <TableHead className="text-center">Total Issues</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {salespersonMetrics.map((sp) => {
                      const totalIssues = sp.bookingDue + sp.bookingOverdue + sp.readyNotAssigned + sp.disputeOpen;
                      return (
                        <TableRow key={sp.userId}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{sp.displayName}</p>
                              <p className="text-xs text-muted-foreground">{sp.email}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            {sp.bookingDue > 0 ? (
                              <Badge variant="secondary">{sp.bookingDue}</Badge>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            {sp.bookingOverdue > 0 ? (
                              <Badge variant="destructive">{sp.bookingOverdue}</Badge>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            {sp.readyNotAssigned > 0 ? (
                              <Badge variant="outline">{sp.readyNotAssigned}</Badge>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            {sp.disputeOpen > 0 ? (
                              <Badge variant="destructive">{sp.disputeOpen}</Badge>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            {sp.pendingReconciliation > 0 ? (
                              <Badge variant="secondary">{sp.pendingReconciliation}</Badge>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={totalIssues > 5 ? 'destructive' : totalIssues > 0 ? 'secondary' : 'outline'}>
                              {totalIssues}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="problems" className="mt-4">
            <div className="grid gap-4">
              {/* Overdue Bookings */}
              {salespersonMetrics.filter(sp => sp.bookingOverdue > 0).length > 0 && (
                <Card className="border-destructive/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                      Overdue Bookings
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {salespersonMetrics
                        .filter(sp => sp.bookingOverdue > 0)
                        .sort((a, b) => b.bookingOverdue - a.bookingOverdue)
                        .map(sp => (
                          <div key={sp.userId} className="flex items-center justify-between p-2 bg-destructive/5 rounded">
                            <span>{sp.displayName}</span>
                            <Badge variant="destructive">{sp.bookingOverdue} overdue</Badge>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Open Disputes */}
              {salespersonMetrics.filter(sp => sp.disputeOpen > 0).length > 0 && (
                <Card className="border-yellow-500/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-yellow-600">
                      <FileWarning className="h-5 w-5" />
                      Open Disputes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {salespersonMetrics
                        .filter(sp => sp.disputeOpen > 0)
                        .sort((a, b) => b.disputeOpen - a.disputeOpen)
                        .map(sp => (
                          <div key={sp.userId} className="flex items-center justify-between p-2 bg-yellow-500/5 rounded">
                            <span>{sp.displayName}</span>
                            <Badge variant="outline" className="border-yellow-500 text-yellow-600">
                              {sp.disputeOpen} disputes
                            </Badge>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {salespersonMetrics.filter(sp => sp.bookingOverdue > 0 || sp.disputeOpen > 0).length === 0 && (
                <Card>
                  <CardContent className="py-8 text-center text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                    <p>No critical issues at this time</p>
                  </CardContent>
                </Card>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
