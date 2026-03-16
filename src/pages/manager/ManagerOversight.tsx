import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { format } from 'date-fns';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContext';
import { useManagerActionRequiredStats, useAdminActionRequiredStats } from '@/hooks/useActionRequiredStats';
import { useManagerGroups, useGroupMembers } from '@/hooks/useStockVisibility';
import { useOrders } from '@/hooks/useOrders';
import { useUserDirectory } from '@/hooks/useUserDirectory';
import { 
  Users, 
  AlertTriangle, 
  Clock, 
  CheckCircle, 
  FileWarning, 
  RefreshCw,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Search,
  Mail,
  ExternalLink
} from 'lucide-react';

interface SalespersonMetrics {
  userId: string;
  displayName: string;
  email: string;
  actionRequired: number;
  failedDelivery: number;
  rescheduled: number;
  runnerFlagged: number;
  bookingOrders: number;
  readyOrders: number;
  pendingDelivery: number;
  
  deliveredToday: number;
}

export default function ManagerOversight() {
  const navigate = useNavigate();
  const { profile, role } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  
  const isAdmin = role === 'admin';
  
  // Use the appropriate stats hook based on role
  const { data: managerStats, isLoading: managerLoading, refetch: refetchManager } = useManagerActionRequiredStats();
  const { data: adminStats, isLoading: adminLoading, refetch: refetchAdmin } = useAdminActionRequiredStats();
  
  const actionStats = isAdmin ? adminStats : managerStats;
  const isLoading = isAdmin ? adminLoading : managerLoading;
  const refetch = isAdmin ? refetchAdmin : refetchManager;
  
  // Get group info for managers
  const { data: groups = [] } = useManagerGroups();
  const { data: allMembers = [] } = useGroupMembers();
  const { data: orders = [] } = useOrders();
  const { data: userDirectory = [] } = useUserDirectory();
  
  // Get member IDs for the current manager
  const myGroup = groups.find(g => g.manager_user_id === profile?.id);
  const myMemberIds = isAdmin 
    ? userDirectory.filter(u => u.role === 'salesperson').map(u => u.id)
    : allMembers.filter(m => m.group_id === myGroup?.id).map(m => m.member_user_id);

  // Calculate detailed metrics per salesperson
  const salespersonMetrics: SalespersonMetrics[] = (actionStats?.bySalesperson || []).map(sp => {
    const spOrders = orders.filter(o => o.salesperson_id === sp.salespersonId);
    const today = new Date().toISOString().split('T')[0];
    
    return {
      userId: sp.salespersonId,
      displayName: sp.salespersonName,
      email: sp.email || '',
      actionRequired: sp.total,
      failedDelivery: sp.failedDelivery,
      rescheduled: sp.rescheduled,
      runnerFlagged: sp.runnerFlagged,
      bookingOrders: spOrders.filter(o => o.status === 'BOOKING').length,
      readyOrders: spOrders.filter(o => o.status === 'READY').length,
      pendingDelivery: spOrders.filter(o => o.status === 'READY' && o.runner_status !== 'DELIVERED').length,
      
      deliveredToday: spOrders.filter(o => o.delivered_at && o.delivered_at.split('T')[0] === today).length,
    };
  });
  
  // Filter by search term
  const filteredMetrics = salespersonMetrics.filter(sp => 
    !searchTerm || 
    sp.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    sp.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate totals
  const totals = salespersonMetrics.reduce((acc, m) => ({
    actionRequired: acc.actionRequired + m.actionRequired,
    failedDelivery: acc.failedDelivery + m.failedDelivery,
    rescheduled: acc.rescheduled + m.rescheduled,
    runnerFlagged: acc.runnerFlagged + m.runnerFlagged,
    bookingOrders: acc.bookingOrders + m.bookingOrders,
    readyOrders: acc.readyOrders + m.readyOrders,
  }), { actionRequired: 0, failedDelivery: 0, rescheduled: 0, runnerFlagged: 0, bookingOrders: 0, readyOrders: 0 });

  const MetricCard = ({ title, value, icon: Icon, variant = 'default', onClick }: { 
    title: string; 
    value: number; 
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
      <Card 
        className={`${bgColor} ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`}
        onClick={onClick}
      >
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

  // Salespersons with high action required counts (threshold: 5)
  const highPrioritySalespersons = salespersonMetrics.filter(sp => sp.actionRequired >= 5);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">
              {isAdmin ? 'Admin Oversight' : 'Team Oversight'}
            </h1>
            <p className="text-muted-foreground">
              {isAdmin 
                ? 'Monitor all salesperson performance and pending tasks'
                : `Monitor your team's performance and pending tasks (${myMemberIds.length} agents)`
              }
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard 
            title="Action Required" 
            value={totals.actionRequired} 
            icon={AlertTriangle} 
            variant="error"
            onClick={() => navigate('/sales/action-required')}
          />
          <MetricCard 
            title="Failed Delivery" 
            value={totals.failedDelivery} 
            icon={FileWarning} 
            variant="warning" 
          />
          <MetricCard 
            title="Rescheduled" 
            value={totals.rescheduled} 
            icon={Clock} 
          />
        </div>

        {/* High Priority Alert */}
        {highPrioritySalespersons.length > 0 && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                High Priority Agents ({highPrioritySalespersons.length})
              </CardTitle>
              <CardDescription>
                These salespersons have 5 or more unresolved Action Required items
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {highPrioritySalespersons.map(sp => (
                  <Badge 
                    key={sp.userId} 
                    variant="destructive"
                    className="cursor-pointer"
                    onClick={() => navigate(`/sales/action-required?salesperson=${sp.userId}`)}
                  >
                    {sp.displayName} ({sp.actionRequired})
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="performance">
          <TabsList>
            <TabsTrigger value="performance">Agent Performance</TabsTrigger>
            <TabsTrigger value="action-breakdown">Action Required Breakdown</TabsTrigger>
            <TabsTrigger value="problems">Problem Queue</TabsTrigger>
          </TabsList>

          <TabsContent value="performance" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Salesperson Performance</CardTitle>
                    <CardDescription>
                      Click on any agent to view their orders
                    </CardDescription>
                  </div>
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search agents..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Salesperson</TableHead>
                      <TableHead className="text-center">Action Required</TableHead>
                      <TableHead className="text-center">Booking</TableHead>
                      <TableHead className="text-center">Ready</TableHead>
                      
                      <TableHead className="text-center">Delivered Today</TableHead>
                      <TableHead className="text-center">Health</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {isLoading ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          Loading...
                        </TableCell>
                      </TableRow>
                    ) : filteredMetrics.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                          {myMemberIds.length === 0 
                            ? 'No salespersons assigned to your team. Add members in Settings → Bindings.'
                            : 'No salespersons found matching your search.'
                          }
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredMetrics.map((sp) => {
                        // Calculate health score (0-100)
                        const issueCount = sp.actionRequired;
                        const healthScore = Math.max(0, 100 - (issueCount * 10));
                        
                        return (
                          <TableRow 
                            key={sp.userId}
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => navigate(`/sales/booking?salesperson=${sp.userId}`)}
                          >
                            <TableCell>
                              <div>
                                <p className="font-medium">{sp.displayName}</p>
                                <p className="text-xs text-muted-foreground">{sp.email}</p>
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              {sp.actionRequired > 0 ? (
                                <Badge 
                                  variant={sp.actionRequired >= 5 ? "destructive" : "secondary"}
                                  className="cursor-pointer"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/sales/action-required?salesperson=${sp.userId}`);
                                  }}
                                >
                                  {sp.actionRequired}
                                </Badge>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </TableCell>
                            <TableCell className="text-center">
                              {sp.bookingOrders > 0 ? (
                                <Badge variant="outline">{sp.bookingOrders}</Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              {sp.readyOrders > 0 ? (
                                <Badge variant="secondary">{sp.readyOrders}</Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              {sp.deliveredToday > 0 ? (
                                <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/30">
                                  {sp.deliveredToday}
                                </Badge>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-center">
                              <div className="flex items-center gap-2">
                                <Progress 
                                  value={healthScore} 
                                  className="w-16 h-2"
                                />
                                <span className={`text-xs ${healthScore >= 80 ? 'text-green-600' : healthScore >= 50 ? 'text-yellow-600' : 'text-destructive'}`}>
                                  {healthScore}%
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <Button variant="ghost" size="icon">
                                <ArrowRight className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="action-breakdown" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Action Required by Agent</CardTitle>
                <CardDescription>
                  Detailed breakdown of pending actions per salesperson
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Salesperson</TableHead>
                      <TableHead className="text-center">Total</TableHead>
                      <TableHead className="text-center">Failed Delivery</TableHead>
                      <TableHead className="text-center">Rescheduled</TableHead>
                      <TableHead className="text-center">Runner Flagged</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(actionStats?.bySalesperson || [])
                      .filter(sp => sp.total > 0)
                      .map((sp) => (
                        <TableRow key={sp.salespersonId}>
                          <TableCell>
                            <div>
                              <p className="font-medium">{sp.salespersonName}</p>
                              <p className="text-xs text-muted-foreground">{sp.email}</p>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant={sp.total >= 5 ? "destructive" : "secondary"}>
                              {sp.total}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-center">
                            {sp.failedDelivery > 0 ? (
                              <Badge variant="outline" className="bg-orange-500/10 text-orange-700 border-orange-500/30">
                                {sp.failedDelivery}
                              </Badge>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            {sp.rescheduled > 0 ? (
                              <Badge variant="outline">{sp.rescheduled}</Badge>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="text-center">
                            {sp.runnerFlagged > 0 ? (
                              <Badge variant="outline" className="bg-yellow-500/10 text-yellow-700 border-yellow-500/30">
                                {sp.runnerFlagged}
                              </Badge>
                            ) : '-'}
                          </TableCell>
                          <TableCell>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => navigate(`/sales/action-required?salesperson=${sp.salespersonId}`)}
                            >
                              View <ArrowRight className="h-4 w-4 ml-1" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    }
                    {(actionStats?.bySalesperson || []).filter(sp => sp.total > 0).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-500" />
                          <p className="text-muted-foreground">No action required items</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="problems" className="mt-4">
            <div className="grid gap-4">
              {/* High Action Required */}
              {highPrioritySalespersons.length > 0 && (
                <Card className="border-destructive/50">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-destructive">
                      <AlertTriangle className="h-5 w-5" />
                      High Action Required Count
                    </CardTitle>
                    <CardDescription>
                      Agents with 5+ unresolved items need immediate attention
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {highPrioritySalespersons
                        .sort((a, b) => b.actionRequired - a.actionRequired)
                        .map(sp => (
                          <div 
                            key={sp.userId} 
                            className="flex items-center justify-between p-3 bg-destructive/5 rounded-lg cursor-pointer hover:bg-destructive/10"
                            onClick={() => navigate(`/sales/action-required?salesperson=${sp.userId}`)}
                          >
                            <div>
                              <span className="font-medium">{sp.displayName}</span>
                              <span className="text-sm text-muted-foreground ml-2">{sp.email}</span>
                            </div>
                            <Badge variant="destructive">{sp.actionRequired} pending</Badge>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              )}


              {highPrioritySalespersons.length === 0 && (
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
