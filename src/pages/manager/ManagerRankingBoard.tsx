import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import { 
  useManagerRankingData, 
  useAllManagersForRanking,
  useToggleManagerRankingParticipant,
  useBulkUpdateManagerRankingParticipants,
  type RankingPeriod,
  type RankingMetric,
  type ManagerRankingData
} from '@/hooks/useManagerRanking';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from '@/components/ui/sheet';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Trophy, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Package, 
  DollarSign,
  Settings,
  Search,
  ChevronRight,
  Award,
  Target,
  Zap,
  User
} from 'lucide-react';
import { formatBND } from '@/lib/currency';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

export default function ManagerRankingBoard() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const isAdmin = profile?.role === 'admin';

  const [period, setPeriod] = useState<RankingPeriod>('last7');
  const [metric, setMetric] = useState<RankingMetric>('leadership_score');
  const [selectedManager, setSelectedManager] = useState<ManagerRankingData | null>(null);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState<'enable' | 'disable' | null>(null);

  const { data: rankingData, isLoading } = useManagerRankingData(period, metric);
  const { data: allManagers, isLoading: loadingManagers } = useAllManagersForRanking();
  const toggleParticipant = useToggleManagerRankingParticipant();
  const bulkUpdate = useBulkUpdateManagerRankingParticipants();

  const filteredManagers = allManagers?.filter(m => 
    m.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.email.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const handleToggle = async (managerId: string, currentEnabled: boolean) => {
    try {
      await toggleParticipant.mutateAsync({ managerId, isEnabled: !currentEnabled });
      toast.success(!currentEnabled ? 'Manager added to ranking' : 'Manager removed from ranking');
    } catch (error) {
      toast.error('Failed to update participant');
    }
  };

  const handleBulkUpdate = async (enable: boolean) => {
    const managerIds = allManagers?.map(m => m.id) || [];
    try {
      await bulkUpdate.mutateAsync({ managerIds, isEnabled: enable });
      toast.success(enable ? 'All managers enabled' : 'All managers disabled');
      setBulkConfirmOpen(null);
    } catch (error) {
      toast.error('Failed to update participants');
    }
  };

  const getRankBadge = (rank: number) => {
    if (rank === 1) return <Trophy className="h-5 w-5 text-yellow-500" />;
    if (rank === 2) return <Trophy className="h-5 w-5 text-gray-400" />;
    if (rank === 3) return <Trophy className="h-5 w-5 text-amber-600" />;
    return <span className="text-muted-foreground font-medium">#{rank}</span>;
  };

  const getMetricLabel = (m: RankingMetric) => {
    switch (m) {
      case 'leadership_score': return 'Leadership Score';
      case 'team_gmv': return 'Team GMV';
      case 'team_delivered': return 'Delivered Orders';
    }
  };

  return (
    <AppLayout>
      <div className="space-y-4 md:space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-xl md:text-2xl font-bold">Manager Ranking Board</h1>
            <p className="text-sm text-muted-foreground">
              Compare manager performance and leadership scores
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Period Toggle */}
            <div className="flex rounded-lg border bg-muted p-1">
              <Button
                variant={period === 'last7' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setPeriod('last7')}
                className="text-xs"
              >
                Last 7 Days
              </Button>
              <Button
                variant={period === 'mtd' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setPeriod('mtd')}
                className="text-xs"
              >
                MTD
              </Button>
            </div>

            {/* Admin: Participants Button */}
            {isAdmin && (
              <Sheet open={participantsOpen} onOpenChange={setParticipantsOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Settings className="h-4 w-4 mr-2" />
                    Participants
                  </Button>
                </SheetTrigger>
                <SheetContent side={isMobile ? 'bottom' : 'right'} className={isMobile ? 'h-[90vh]' : ''}>
                  <SheetHeader>
                    <SheetTitle>Manage Participants</SheetTitle>
                  </SheetHeader>
                  
                  <div className="py-4 space-y-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search managers..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>

                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => setBulkConfirmOpen('enable')}
                      >
                        Enable All
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="flex-1"
                        onClick={() => setBulkConfirmOpen('disable')}
                      >
                        Disable All
                      </Button>
                    </div>

                    <ScrollArea className="h-[calc(100vh-280px)] md:h-[calc(100vh-220px)]">
                      <div className="space-y-2">
                        {loadingManagers ? (
                          Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-16 w-full" />
                          ))
                        ) : (
                          filteredManagers.map((manager) => (
                            <div
                              key={manager.id}
                              className="flex items-center justify-between p-3 rounded-lg border bg-card"
                            >
                              <div className="flex-1 min-w-0">
                                <p className="font-medium truncate">{manager.display_name}</p>
                                <p className="text-xs text-muted-foreground truncate">{manager.email}</p>
                                {!manager.is_active && (
                                  <Badge variant="secondary" className="mt-1 text-xs">Inactive</Badge>
                                )}
                              </div>
                              <Switch
                                checked={manager.is_enabled}
                                onCheckedChange={() => handleToggle(manager.id, manager.is_enabled)}
                                disabled={toggleParticipant.isPending}
                              />
                            </div>
                          ))
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </SheetContent>
              </Sheet>
            )}
          </div>
        </div>

        {/* Metric Tabs */}
        <Tabs value={metric} onValueChange={(v) => setMetric(v as RankingMetric)}>
          <TabsList className="w-full md:w-auto">
            <TabsTrigger value="leadership_score" className="flex-1 md:flex-none">
              <Award className="h-4 w-4 mr-2" />
              <span className="hidden md:inline">Leadership Score</span>
              <span className="md:hidden">Score</span>
            </TabsTrigger>
            <TabsTrigger value="team_gmv" className="flex-1 md:flex-none">
              <DollarSign className="h-4 w-4 mr-2" />
              <span className="hidden md:inline">Team GMV</span>
              <span className="md:hidden">GMV</span>
            </TabsTrigger>
            <TabsTrigger value="team_delivered" className="flex-1 md:flex-none">
              <Package className="h-4 w-4 mr-2" />
              <span className="hidden md:inline">Delivered Orders</span>
              <span className="md:hidden">Delivered</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value={metric} className="mt-4">
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-20 w-full" />
                ))}
              </div>
            ) : !rankingData?.length ? (
              <Card>
                <CardContent className="py-12 text-center">
                  <Users className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No managers on the ranking board yet</p>
                  {isAdmin && (
                    <Button 
                      variant="outline" 
                      className="mt-4"
                      onClick={() => setParticipantsOpen(true)}
                    >
                      Add Participants
                    </Button>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {rankingData.map((manager) => (
                  <RankingCard
                    key={manager.manager_id}
                    data={manager}
                    metric={metric}
                    onClick={() => setSelectedManager(manager)}
                    getRankBadge={getRankBadge}
                    isMobile={isMobile}
                  />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* Details Drawer */}
        <Sheet open={!!selectedManager} onOpenChange={() => setSelectedManager(null)}>
          <SheetContent side={isMobile ? 'bottom' : 'right'} className={isMobile ? 'h-[90vh]' : ''}>
            {selectedManager && (
              <ManagerDetailsDrawer data={selectedManager} onClose={() => setSelectedManager(null)} />
            )}
          </SheetContent>
        </Sheet>

        {/* Bulk Confirm Dialog */}
        <AlertDialog open={!!bulkConfirmOpen} onOpenChange={() => setBulkConfirmOpen(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {bulkConfirmOpen === 'enable' ? 'Enable All Managers?' : 'Disable All Managers?'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {bulkConfirmOpen === 'enable' 
                  ? 'All managers will appear on the ranking board.'
                  : 'All managers will be removed from the ranking board.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction 
                onClick={() => handleBulkUpdate(bulkConfirmOpen === 'enable')}
                disabled={bulkUpdate.isPending}
              >
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

// Ranking Card Component
function RankingCard({ 
  data, 
  metric, 
  onClick, 
  getRankBadge,
  isMobile 
}: { 
  data: ManagerRankingData;
  metric: RankingMetric;
  onClick: () => void;
  getRankBadge: (rank: number) => React.ReactNode;
  isMobile: boolean;
}) {
  const getPrimaryValue = () => {
    switch (metric) {
      case 'leadership_score':
        return (
          <span className="text-lg font-bold">{data.leadership_score.toFixed(0)}</span>
        );
      case 'team_gmv':
        return (
          <span className="text-lg font-bold">{formatBND(data.team_realized_gmv)}</span>
        );
      case 'team_delivered':
        return (
          <span className="text-lg font-bold">{data.team_delivered_orders}</span>
        );
    }
  };

  return (
    <Card 
      className={cn(
        "cursor-pointer transition-all hover:shadow-md",
        data.rank <= 3 && "border-primary/20 bg-primary/5"
      )}
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          {/* Rank */}
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-muted flex items-center justify-center">
            {getRankBadge(data.rank)}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{data.manager_name}</p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{data.team_delivered_orders} delivered</span>
              {data.growth_pct !== 0 && (
                <span className={cn(
                  "flex items-center",
                  data.growth_pct > 0 ? "text-green-600" : "text-red-600"
                )}>
                  {data.growth_pct > 0 ? (
                    <TrendingUp className="h-3 w-3 mr-1" />
                  ) : (
                    <TrendingDown className="h-3 w-3 mr-1" />
                  )}
                  {Math.abs(data.growth_pct).toFixed(1)}%
                </span>
              )}
            </div>
          </div>

          {/* Primary Metric Value */}
          <div className="flex-shrink-0 text-right">
            {getPrimaryValue()}
          </div>

          <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

// Manager Details Drawer
function ManagerDetailsDrawer({ data, onClose }: { data: ManagerRankingData; onClose: () => void }) {
  const scoreBreakdown = data.score_breakdown || {
    team_growth_score: 0,
    improvement_score: 0,
    ops_score: 0,
    personal_score: 0,
  };

  const insights = [
    data.growth_pct > 10 
      ? "🚀 Strong growth momentum this period!" 
      : data.growth_pct < -10 
        ? "⚠️ GMV declining - consider intervention"
        : null,
    data.dependency_ratio > 0.5 
      ? "⚠️ High dependency on top performer - diversify workload"
      : null,
    data.bottom30_improve_pct > 0.5 
      ? "✅ Bottom performers improving well"
      : data.bottom30_improve_pct < 0.2 
        ? "💡 Focus coaching on bottom 30%"
        : null,
  ].filter(Boolean);

  return (
    <>
      <SheetHeader>
        <SheetTitle className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-primary" />
          Rank #{data.rank} - {data.manager_name}
        </SheetTitle>
      </SheetHeader>

      <ScrollArea className="h-[calc(100vh-120px)] mt-4">
        <div className="space-y-6 pb-6">
          {/* Leadership Score */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Award className="h-5 w-5" />
                Leadership Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-primary mb-4">
                {data.leadership_score.toFixed(0)}
                <span className="text-lg text-muted-foreground">/100</span>
              </div>

              <div className="space-y-3">
                <ScoreBar 
                  label="Team Growth" 
                  value={scoreBreakdown.team_growth_score} 
                  max={40}
                  icon={<TrendingUp className="h-4 w-4" />}
                />
                <ScoreBar 
                  label="Bottom 30% Improvement" 
                  value={scoreBreakdown.improvement_score} 
                  max={30}
                  icon={<Target className="h-4 w-4" />}
                />
                <ScoreBar 
                  label="Ops Interventions" 
                  value={scoreBreakdown.ops_score} 
                  max={20}
                  icon={<Zap className="h-4 w-4" />}
                />
                <ScoreBar 
                  label="Personal Contribution" 
                  value={scoreBreakdown.personal_score} 
                  max={10}
                  icon={<User className="h-4 w-4" />}
                />
              </div>
            </CardContent>
          </Card>

          {/* Key Metrics */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Key Metrics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <MetricItem 
                  label="Realized GMV" 
                  value={formatBND(data.team_realized_gmv)} 
                />
                <MetricItem 
                  label="Pipeline GMV" 
                  value={formatBND(data.team_pipeline_gmv)} 
                />
                <MetricItem 
                  label="Delivered" 
                  value={data.team_delivered_orders.toString()} 
                />
                <MetricItem 
                  label="Booking" 
                  value={data.team_booking_orders.toString()} 
                />
                <MetricItem 
                  label="Growth" 
                  value={`${data.growth_pct >= 0 ? '+' : ''}${data.growth_pct.toFixed(1)}%`}
                  className={data.growth_pct >= 0 ? 'text-green-600' : 'text-red-600'}
                />
                <MetricItem 
                  label="Dependency Ratio" 
                  value={`${(data.dependency_ratio * 100).toFixed(0)}%`}
                />
              </div>
            </CardContent>
          </Card>

          {/* Insights */}
          {insights.length > 0 && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Insights</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {insights.map((insight, i) => (
                    <li key={i} className="text-sm">{insight}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </ScrollArea>
    </>
  );
}

// Score Bar Component
function ScoreBar({ 
  label, 
  value, 
  max, 
  icon 
}: { 
  label: string; 
  value: number; 
  max: number;
  icon: React.ReactNode;
}) {
  const percentage = (value / max) * 100;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className="font-medium">{value.toFixed(1)}/{max}</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div 
          className="h-full bg-primary rounded-full transition-all"
          style={{ width: `${Math.min(percentage, 100)}%` }}
        />
      </div>
    </div>
  );
}

// Metric Item Component
function MetricItem({ 
  label, 
  value, 
  className 
}: { 
  label: string; 
  value: string;
  className?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold", className)}>{value}</p>
    </div>
  );
}
