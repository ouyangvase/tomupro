import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useManagerDashboard, type PeriodType } from '@/hooks/useManagerDashboard';
import { formatBND } from '@/lib/currency';
import { cn } from '@/lib/utils';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Package,
  CheckCircle,
  Clock,
  AlertCircle,
  Target,
  BarChart3,
  Inbox,
  Award,
  ArrowRight,
  DollarSign,
  RefreshCw,
  Truck,
  ShoppingCart,
} from 'lucide-react';

function MetricCard({
  title,
  value,
  subValue,
  icon: Icon,
  colorClass,
  onClick,
  isLoading,
}: {
  title: string;
  value: string | number;
  subValue?: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
  onClick?: () => void;
  isLoading?: boolean;
}) {
  return (
    <Card 
      className={cn(
        "cursor-pointer hover:shadow-lg transition-all duration-300",
        onClick && "hover:-translate-y-1"
      )}
      onClick={onClick}
    >
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{title}</p>
            {isLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <p className={cn("text-2xl md:text-3xl font-bold", colorClass)}>{value}</p>
            )}
            {subValue && (
              <p className="text-xs text-muted-foreground">{subValue}</p>
            )}
          </div>
          <div className={cn("p-3 rounded-2xl", colorClass.replace('text-', 'bg-').replace(']', '/20]'))}>
            <Icon className={cn("h-6 w-6", colorClass)} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreBreakdownCard({
  label,
  score,
  maxScore,
  colorClass,
}: {
  label: string;
  score: number;
  maxScore: number;
  colorClass: string;
}) {
  const percentage = (score / maxScore) * 100;
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className={cn("font-semibold", colorClass)}>{score}/{maxScore}</span>
      </div>
      <Progress value={percentage} className="h-2" />
    </div>
  );
}

export default function ManagerDashboard() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const [period, setPeriod] = useState<PeriodType>('mtd');
  const { data, isLoading, dataUpdatedAt } = useManagerDashboard(period);
  
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  
  return (
    <AppLayout>
      <div className="space-y-6 md:space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold">Manager Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              Welcome back, {profile?.display_name}
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Period Toggle */}
            <Tabs value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
              <TabsList className="grid grid-cols-2">
                <TabsTrigger value="last7" className="text-xs md:text-sm">Last 7 Days</TabsTrigger>
                <TabsTrigger value="mtd" className="text-xs md:text-sm">MTD</TabsTrigger>
              </TabsList>
            </Tabs>
            
            {/* Live indicator */}
            <Badge className="hidden md:flex bg-[hsl(var(--status-success)/0.15)] text-[hsl(var(--status-success))] border-[hsl(var(--status-success)/0.3)]">
              <span className="w-2 h-2 bg-[hsl(var(--status-success))] rounded-full mr-2 animate-pulse" />
              Live
            </Badge>
          </div>
        </div>

        {/* Leadership Score Hero Card */}
        <Card className="bg-gradient-to-br from-primary/15 via-primary/10 to-primary/5 border-primary/30">
          <CardContent className="pt-6">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="p-4 rounded-2xl bg-primary/20">
                  <Award className="h-10 w-10 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-primary/80 font-medium">Leadership Score</p>
                  {isLoading ? (
                    <Skeleton className="h-12 w-20 mt-1" />
                  ) : (
                    <p className="text-4xl md:text-5xl font-bold text-primary">
                      {data?.leadershipScore ?? 0}
                      <span className="text-xl text-primary/60">/100</span>
                    </p>
                  )}
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4 md:w-1/2">
                <ScoreBreakdownCard 
                  label="Team Growth" 
                  score={data?.scoreBreakdown.teamGrowth ?? 0} 
                  maxScore={40} 
                  colorClass="text-primary"
                />
                <ScoreBreakdownCard 
                  label="Bottom 30% Improvement" 
                  score={data?.scoreBreakdown.bottom30Improvement ?? 0} 
                  maxScore={30} 
                  colorClass="text-[hsl(var(--status-success))]"
                />
                <ScoreBreakdownCard 
                  label="Ops Interventions" 
                  score={data?.scoreBreakdown.opsInterventions ?? 0} 
                  maxScore={20} 
                  colorClass="text-[hsl(var(--status-warning))]"
                />
                <ScoreBreakdownCard 
                  label="Personal Contribution" 
                  score={data?.scoreBreakdown.personalContribution ?? 0} 
                  maxScore={10} 
                  colorClass="text-blue-500"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Team Overview Section */}
        <div className="space-y-4">
          <h2 className="text-lg md:text-xl font-bold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Team Overview
          </h2>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
            <MetricCard
              title="Realized GMV"
              value={formatBND(data?.teamOverview.realizedGmv ?? 0)}
              subValue="Delivered only"
              icon={DollarSign}
              colorClass="text-[hsl(var(--status-success))]"
              isLoading={isLoading}
            />
            <MetricCard
              title="Pipeline GMV"
              value={formatBND(data?.teamOverview.pipelineGmv ?? 0)}
              subValue="Booking + Ready"
              icon={TrendingUp}
              colorClass="text-primary"
              isLoading={isLoading}
            />
            <MetricCard
              title="Delivered"
              value={data?.teamOverview.deliveredOrders ?? 0}
              icon={CheckCircle}
              colorClass="text-[hsl(var(--status-success))]"
              isLoading={isLoading}
              onClick={() => navigate('/runner/delivered-orders')}
            />
            <MetricCard
              title="Booking"
              value={data?.teamOverview.bookingOrders ?? 0}
              icon={Clock}
              colorClass="text-[hsl(var(--status-warning))]"
              isLoading={isLoading}
              onClick={() => navigate('/sales/booking')}
            />
            <MetricCard
              title="Ready"
              value={data?.teamOverview.readyOrders ?? 0}
              icon={ShoppingCart}
              colorClass="text-primary"
              isLoading={isLoading}
              onClick={() => navigate('/sales/ready')}
            />
            <MetricCard
              title="Action Required"
              value={data?.teamOverview.actionRequiredCount ?? 0}
              icon={AlertCircle}
              colorClass="text-destructive"
              isLoading={isLoading}
              onClick={() => navigate('/sales/action-required')}
            />
          </div>
        </div>

        {/* Team Health & Manager Impact */}
        <div className="grid md:grid-cols-2 gap-6">
          {/* Team Health */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                <BarChart3 className="h-5 w-5 text-primary" />
                Team Health
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-secondary/50">
                  <p className="text-sm text-muted-foreground">Active Members</p>
                  {isLoading ? (
                    <Skeleton className="h-8 w-12 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold">{data?.teamHealth.activeTeamMembers ?? 0}</p>
                  )}
                </div>
                <div className="p-4 rounded-xl bg-secondary/50">
                  <p className="text-sm text-muted-foreground">With Orders</p>
                  {isLoading ? (
                    <Skeleton className="h-8 w-12 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold">{data?.teamHealth.teamMembersWithOrders ?? 0}</p>
                  )}
                </div>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Dependency Ratio</span>
                  <span className={cn(
                    "font-semibold",
                    (data?.teamHealth.dependencyRatio ?? 0) > 0.5 ? "text-[hsl(var(--status-warning))]" : "text-[hsl(var(--status-success))]"
                  )}>
                    {((data?.teamHealth.dependencyRatio ?? 0) * 100).toFixed(0)}%
                  </span>
                </div>
                <Progress value={(data?.teamHealth.dependencyRatio ?? 0) * 100} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  {(data?.teamHealth.dependencyRatio ?? 0) > 0.5 
                    ? "High dependency on top performer" 
                    : "Good distribution across team"}
                </p>
              </div>
              
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/30">
                <span className="text-sm text-muted-foreground">Top/Bottom Gap</span>
                <span className="font-semibold">
                  {(data?.teamHealth.topBottomGapRatio ?? 0).toFixed(1)}x
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Manager Impact (Ops) */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base md:text-lg">
                <Target className="h-5 w-5 text-primary" />
                Manager Impact (Ops)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <div className="p-4 rounded-xl bg-[hsl(var(--status-success)/0.1)] border border-[hsl(var(--status-success)/0.2)]">
                  <p className="text-sm text-muted-foreground">Inbound Acknowledged</p>
                  {isLoading ? (
                    <Skeleton className="h-8 w-12 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-[hsl(var(--status-success))]">
                      {data?.managerImpact.inboundAckCount ?? 0}
                    </p>
                  )}
                </div>
                <div className="p-4 rounded-xl bg-primary/10 border border-primary/20">
                  <p className="text-sm text-muted-foreground">Orders Rescued</p>
                  {isLoading ? (
                    <Skeleton className="h-8 w-12 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-primary">
                      {data?.managerImpact.ordersRescuedCount ?? 0}
                    </p>
                  )}
                </div>
                <div className="p-4 rounded-xl bg-[hsl(var(--status-warning)/0.1)] border border-[hsl(var(--status-warning)/0.2)]">
                  <p className="text-sm text-muted-foreground">Disputes Resolved</p>
                  {isLoading ? (
                    <Skeleton className="h-8 w-12 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold text-[hsl(var(--status-warning))]">
                      {data?.managerImpact.disputeResolvedCount ?? 0}
                    </p>
                  )}
                </div>
                <div className="p-4 rounded-xl bg-secondary/50">
                  <p className="text-sm text-muted-foreground">Runner Reassigned</p>
                  {isLoading ? (
                    <Skeleton className="h-8 w-12 mt-1" />
                  ) : (
                    <p className="text-2xl font-bold">
                      {data?.managerImpact.runnerReassignedCount ?? 0}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* My Performance (Manager as Seller) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base md:text-lg">
              <DollarSign className="h-5 w-5 text-primary" />
              My Performance (as Seller)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 md:gap-4">
              <div className="col-span-2 md:col-span-1 p-4 rounded-xl bg-gradient-to-br from-[hsl(var(--status-success)/0.15)] to-transparent border border-[hsl(var(--status-success)/0.2)]">
                <p className="text-sm text-muted-foreground">Realized GMV</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <p className="text-xl md:text-2xl font-bold text-[hsl(var(--status-success))]">
                    {formatBND(data?.personalPerformance.personalRealizedGmv ?? 0)}
                  </p>
                )}
              </div>
              <div className="col-span-2 md:col-span-1 p-4 rounded-xl bg-gradient-to-br from-primary/15 to-transparent border border-primary/20">
                <p className="text-sm text-muted-foreground">Pipeline GMV</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-24 mt-1" />
                ) : (
                  <p className="text-xl md:text-2xl font-bold text-primary">
                    {formatBND(data?.personalPerformance.personalPipelineGmv ?? 0)}
                  </p>
                )}
              </div>
              <div className="p-4 rounded-xl bg-secondary/50">
                <p className="text-sm text-muted-foreground">Delivered</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-12 mt-1" />
                ) : (
                  <p className="text-xl md:text-2xl font-bold">{data?.personalPerformance.personalDelivered ?? 0}</p>
                )}
              </div>
              <div className="p-4 rounded-xl bg-secondary/50">
                <p className="text-sm text-muted-foreground">Booking</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-12 mt-1" />
                ) : (
                  <p className="text-xl md:text-2xl font-bold">{data?.personalPerformance.personalBooking ?? 0}</p>
                )}
              </div>
              <div className="p-4 rounded-xl bg-secondary/50">
                <p className="text-sm text-muted-foreground">Ready</p>
                {isLoading ? (
                  <Skeleton className="h-8 w-12 mt-1" />
                ) : (
                  <p className="text-xl md:text-2xl font-bold">{data?.personalPerformance.personalReady ?? 0}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Button 
            variant="outline" 
            className="h-auto py-4 flex flex-col items-center gap-2"
            onClick={() => navigate('/manager/oversight')}
          >
            <Users className="h-5 w-5" />
            <span className="text-xs md:text-sm">Team Oversight</span>
          </Button>
          <Button 
            variant="outline" 
            className="h-auto py-4 flex flex-col items-center gap-2"
            onClick={() => navigate('/manager/impact-board')}
          >
            <Award className="h-5 w-5" />
            <span className="text-xs md:text-sm">Impact Board</span>
          </Button>
          <Button 
            variant="outline" 
            className="h-auto py-4 flex flex-col items-center gap-2"
            onClick={() => navigate('/inbound/pending')}
          >
            <Package className="h-5 w-5" />
            <span className="text-xs md:text-sm">Pending Inbound</span>
          </Button>
          <Button 
            variant="outline" 
            className="h-auto py-4 flex flex-col items-center gap-2"
            onClick={() => navigate('/sales/action-required')}
          >
            <AlertCircle className="h-5 w-5" />
            <span className="text-xs md:text-sm">Action Required</span>
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
