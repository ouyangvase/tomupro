import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { useAuth } from '@/contexts/AuthContext';
import { useManagerDashboard, useAllManagersKpi, type PeriodType } from '@/hooks/useManagerDashboard';
import { formatBND } from '@/lib/currency';
import { cn } from '@/lib/utils';
import {
  Award,
  TrendingUp,
  Users,
  Target,
  Medal,
  Trophy,
  Star,
} from 'lucide-react';

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-yellow-600 text-white">
        <Trophy className="h-4 w-4" />
      </div>
    );
  }
  if (rank === 2) {
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 text-white">
        <Medal className="h-4 w-4" />
      </div>
    );
  }
  if (rank === 3) {
    return (
      <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-amber-600 to-amber-800 text-white">
        <Medal className="h-4 w-4" />
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-secondary text-muted-foreground font-bold">
      {rank}
    </div>
  );
}

function ScoreCard({
  title,
  score,
  maxScore,
  description,
  colorClass,
}: {
  title: string;
  score: number;
  maxScore: number;
  description?: string;
  colorClass: string;
}) {
  const percentage = (score / maxScore) * 100;
  
  return (
    <div className="p-4 rounded-xl bg-secondary/30 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-muted-foreground">{title}</span>
        <span className={cn("text-lg font-bold", colorClass)}>
          {score.toFixed(0)}/{maxScore}
        </span>
      </div>
      <Progress value={percentage} className="h-2" />
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
    </div>
  );
}

export default function ManagerImpactBoard() {
  const { profile, role } = useAuth();
  const [period, setPeriod] = useState<PeriodType>('mtd');
  const { data: myData, isLoading: myLoading } = useManagerDashboard(period);
  const { data: allManagers, isLoading: allLoading } = useAllManagersKpi();
  
  const isAdmin = role === 'admin';
  
  return (
    <AppLayout>
      <div className="space-y-6 md:space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold flex items-center gap-3">
              <Award className="h-8 w-8 text-primary" />
              Manager Impact Board
            </h1>
            <p className="text-muted-foreground mt-1">
              {isAdmin ? 'All managers performance overview' : 'Your leadership performance metrics'}
            </p>
          </div>
          
          <Tabs value={period} onValueChange={(v) => setPeriod(v as PeriodType)}>
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="last7" className="text-xs md:text-sm">Last 7 Days</TabsTrigger>
              <TabsTrigger value="mtd" className="text-xs md:text-sm">MTD</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="leadership">
          <TabsList className="w-full md:w-auto grid grid-cols-3">
            <TabsTrigger value="leadership" className="text-xs md:text-sm">Leadership Score</TabsTrigger>
            <TabsTrigger value="team" className="text-xs md:text-sm">Team Results</TabsTrigger>
            <TabsTrigger value="growth" className="text-xs md:text-sm">Team Growth</TabsTrigger>
          </TabsList>

          {/* Leadership Score Tab */}
          <TabsContent value="leadership" className="space-y-6 mt-6">
            {/* My Score Hero */}
            <Card className="bg-gradient-to-br from-primary/15 via-primary/10 to-transparent border-primary/30">
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row md:items-center gap-6">
                  <div className="flex items-center gap-4">
                    <div className="relative">
                      <div className="p-4 rounded-2xl bg-primary/20">
                        <Award className="h-12 w-12 text-primary" />
                      </div>
                      <div className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                        <Star className="h-3 w-3 text-primary-foreground" />
                      </div>
                    </div>
                    <div>
                      <p className="text-sm text-primary/80 font-medium">My Leadership Score</p>
                      {myLoading ? (
                        <Skeleton className="h-14 w-24 mt-1" />
                      ) : (
                        <p className="text-5xl md:text-6xl font-bold text-primary">
                          {myData?.leadershipScore ?? 0}
                        </p>
                      )}
                      <p className="text-sm text-muted-foreground">out of 100 points</p>
                    </div>
                  </div>
                  
                  <div className="flex-1 grid grid-cols-2 gap-3">
                    <ScoreCard
                      title="Team Growth"
                      score={myData?.scoreBreakdown.teamGrowth ?? 0}
                      maxScore={40}
                      description="Realized GMV growth vs previous period"
                      colorClass="text-primary"
                    />
                    <ScoreCard
                      title="Bottom 30% Improvement"
                      score={myData?.scoreBreakdown.bottom30Improvement ?? 0}
                      maxScore={30}
                      description="Improvement in underperforming team members"
                      colorClass="text-[hsl(var(--status-success))]"
                    />
                    <ScoreCard
                      title="Ops Interventions"
                      score={myData?.scoreBreakdown.opsInterventions ?? 0}
                      maxScore={20}
                      description="Inbound, rescues, disputes resolved"
                      colorClass="text-[hsl(var(--status-warning))]"
                    />
                    <ScoreCard
                      title="Personal Contribution"
                      score={myData?.scoreBreakdown.personalContribution ?? 0}
                      maxScore={10}
                      description="Your own delivered orders"
                      colorClass="text-blue-500"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Score Explanation */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base md:text-lg">How Leadership Score Works</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-lg bg-primary/5 border border-primary/20">
                    <h4 className="font-semibold text-primary mb-2">Team Growth (40%)</h4>
                    <p className="text-sm text-muted-foreground">
                      Based on your team's realized GMV growth compared to the previous period. 
                      Growth between -20% and +20% is scored proportionally.
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-[hsl(var(--status-success)/0.05)] border border-[hsl(var(--status-success)/0.2)]">
                    <h4 className="font-semibold text-[hsl(var(--status-success))] mb-2">Bottom 30% Improvement (30%)</h4>
                    <p className="text-sm text-muted-foreground">
                      Measures how well your lowest performing team members improved their delivery 
                      counts compared to the previous period.
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-[hsl(var(--status-warning)/0.05)] border border-[hsl(var(--status-warning)/0.2)]">
                    <h4 className="font-semibold text-[hsl(var(--status-warning))] mb-2">Ops Interventions (20%)</h4>
                    <p className="text-sm text-muted-foreground">
                      Points for operational activities: inbound acknowledgments, rescued orders, 
                      resolved disputes, and runner reassignments.
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-blue-500/5 border border-blue-500/20">
                    <h4 className="font-semibold text-blue-500 mb-2">Personal Contribution (10%)</h4>
                    <p className="text-sm text-muted-foreground">
                      Your own sales contribution as a seller. Each delivered order you personally 
                      handle adds to this score.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Team Results Tab */}
          <TabsContent value="team" className="space-y-6 mt-6">
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base md:text-lg flex items-center gap-2">
                    <Trophy className="h-5 w-5 text-[hsl(var(--status-success))]" />
                    Team Delivered Orders
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {myLoading ? (
                    <Skeleton className="h-20 w-full" />
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-5xl font-bold text-[hsl(var(--status-success))]">
                        {myData?.teamOverview.deliveredOrders ?? 0}
                      </p>
                      <p className="text-muted-foreground mt-2">orders delivered by your team</p>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-base md:text-lg flex items-center gap-2">
                    <Target className="h-5 w-5 text-primary" />
                    Team Realized GMV
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {myLoading ? (
                    <Skeleton className="h-20 w-full" />
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-4xl md:text-5xl font-bold text-primary">
                        {formatBND(myData?.teamOverview.realizedGmv ?? 0)}
                      </p>
                      <p className="text-muted-foreground mt-2">total revenue from deliveries</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Team Members Performance would go here */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base md:text-lg flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Team Distribution
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-secondary/50 text-center">
                    <p className="text-3xl font-bold">{myData?.teamHealth.activeTeamMembers ?? 0}</p>
                    <p className="text-sm text-muted-foreground">Active Members</p>
                  </div>
                  <div className="p-4 rounded-xl bg-secondary/50 text-center">
                    <p className="text-3xl font-bold">{myData?.teamHealth.teamMembersWithOrders ?? 0}</p>
                    <p className="text-sm text-muted-foreground">With Orders</p>
                  </div>
                  <div className="p-4 rounded-xl bg-secondary/50 text-center">
                    <p className="text-3xl font-bold">
                      {((myData?.teamHealth.dependencyRatio ?? 0) * 100).toFixed(0)}%
                    </p>
                    <p className="text-sm text-muted-foreground">Dependency Ratio</p>
                  </div>
                  <div className="p-4 rounded-xl bg-secondary/50 text-center">
                    <p className="text-3xl font-bold">
                      {(myData?.teamHealth.topBottomGapRatio ?? 0).toFixed(1)}x
                    </p>
                    <p className="text-sm text-muted-foreground">Top/Bottom Gap</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Team Growth Tab */}
          <TabsContent value="growth" className="space-y-6 mt-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-base md:text-lg flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  Growth Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    Growth comparison data requires historical KPI snapshots.
                  </p>
                  <p className="text-sm text-muted-foreground mt-2">
                    This will show week-over-week and month-over-month comparisons once data accumulates.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Pipeline vs Realized */}
            <div className="grid md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    Pipeline GMV
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {myLoading ? (
                    <Skeleton className="h-16 w-full" />
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-4xl font-bold text-primary">
                        {formatBND(myData?.teamOverview.pipelineGmv ?? 0)}
                      </p>
                      <div className="flex justify-center gap-4 mt-3">
                        <Badge variant="secondary">
                          {myData?.teamOverview.bookingOrders ?? 0} Booking
                        </Badge>
                        <Badge variant="secondary">
                          {myData?.teamOverview.readyOrders ?? 0} Ready
                        </Badge>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    Conversion Potential
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {myLoading ? (
                    <Skeleton className="h-16 w-full" />
                  ) : (
                    <div className="text-center py-4">
                      <p className="text-4xl font-bold text-[hsl(var(--status-success))]">
                        {myData?.teamOverview.realizedGmv && myData?.teamOverview.pipelineGmv
                          ? ((myData.teamOverview.realizedGmv / (myData.teamOverview.realizedGmv + myData.teamOverview.pipelineGmv)) * 100).toFixed(0)
                          : 0}%
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        of total GMV is realized
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Admin: All Managers View */}
        {isAdmin && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base md:text-lg flex items-center gap-2">
                <Users className="h-5 w-5" />
                All Managers Ranking
              </CardTitle>
            </CardHeader>
            <CardContent>
              {allLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : allManagers && allManagers.length > 0 ? (
                <div className="space-y-3">
                  {/* Group by manager and show latest */}
                  {Array.from(
                    new Map(allManagers.map(m => [m.manager_id, m])).values()
                  )
                    .sort((a, b) => (b.leadership_score ?? 0) - (a.leadership_score ?? 0))
                    .map((manager, index) => (
                      <div
                        key={manager.id}
                        className="flex items-center gap-4 p-4 rounded-xl bg-secondary/30 hover:bg-secondary/50 transition-colors"
                      >
                        <RankBadge rank={index + 1} />
                        <div className="flex-1">
                          <p className="font-semibold">
                            {(manager as any).manager?.display_name ?? 'Unknown'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Team: {manager.team_delivered_orders ?? 0} delivered | {formatBND(manager.team_realized_gmv_bnd ?? 0)}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-2xl font-bold text-primary">
                            {manager.leadership_score ?? 0}
                          </p>
                          <p className="text-xs text-muted-foreground">score</p>
                        </div>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-center text-muted-foreground py-8">
                  No manager KPI data available yet.
                </p>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </AppLayout>
  );
}
