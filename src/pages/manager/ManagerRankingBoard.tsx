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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
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
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { 
  Trophy, 
  TrendingUp, 
  TrendingDown, 
  Users, 
  Crown,
  Medal,
  Settings,
  Search,
  Award,
  Target,
  Zap,
  User,
  Sparkles,
  ChevronRight,
  Star
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

  // Get top 3 for podium
  const topThree = rankingData?.slice(0, 3) || [];
  const restOfList = rankingData?.slice(3) || [];

  // Reorder for podium: [2nd, 1st, 3rd]
  const podiumOrder = topThree.length >= 3 
    ? [topThree[1], topThree[0], topThree[2]] 
    : topThree.length === 2 
      ? [topThree[1], topThree[0]] 
      : topThree;

  const getMetricValue = (manager: ManagerRankingData) => {
    switch (metric) {
      case 'leadership_score':
        return manager.leadership_score.toFixed(0);
      case 'team_gmv':
        return formatBND(manager.team_realized_gmv);
      case 'team_delivered':
        return manager.team_delivered_orders.toString();
    }
  };

  const getMetricLabel = () => {
    switch (metric) {
      case 'leadership_score': return 'Score';
      case 'team_gmv': return 'GMV';
      case 'team_delivered': return 'Delivered';
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header with gradient background */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-6 md:p-8">
          <div className="absolute inset-0 bg-gradient-to-r from-primary/5 to-transparent" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-primary/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          
          <div className="relative z-10">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/20 text-primary">
                  <Trophy className="h-6 w-6" />
                </div>
                <div>
                  <h1 className="text-xl md:text-2xl font-bold">Manager Ranking</h1>
                  <p className="text-sm text-muted-foreground">
                    Compete & climb the leaderboard
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Period Toggle - Pill Style */}
                <div className="flex rounded-full border border-border/50 bg-card/50 backdrop-blur-sm p-1">
                  <Button
                    variant={period === 'last7' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setPeriod('last7')}
                    className={cn(
                      "rounded-full text-xs px-4 transition-all",
                      period === 'last7' && "shadow-md"
                    )}
                  >
                    Last 7 Days
                  </Button>
                  <Button
                    variant={period === 'mtd' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setPeriod('mtd')}
                    className={cn(
                      "rounded-full text-xs px-4 transition-all",
                      period === 'mtd' && "shadow-md"
                    )}
                  >
                    MTD
                  </Button>
                </div>

                {/* Admin: Participants Button */}
                {isAdmin && (
                  <Sheet open={participantsOpen} onOpenChange={setParticipantsOpen}>
                    <SheetTrigger asChild>
                      <Button variant="outline" size="sm" className="rounded-full">
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
                                  className="flex items-center justify-between p-3 rounded-xl border bg-card/50"
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
          </div>
        </div>

        {/* Metric Selector - Modern Pills */}
        <div className="flex justify-center">
          <div className="inline-flex rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm p-1.5 gap-1">
            {[
              { value: 'leadership_score', label: 'Leadership', icon: Award },
              { value: 'team_gmv', label: 'Team GMV', icon: Sparkles },
              { value: 'team_delivered', label: 'Delivered', icon: Target },
            ].map((item) => (
              <Button
                key={item.value}
                variant={metric === item.value ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setMetric(item.value as RankingMetric)}
                className={cn(
                  "rounded-xl text-xs px-4 gap-2 transition-all",
                  metric === item.value && "shadow-md"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="space-y-4">
            <div className="flex justify-center gap-4 py-8">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-48 w-28 rounded-2xl" />
              ))}
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
        ) : !rankingData?.length ? (
          <Card className="glass-card">
            <CardContent className="py-16 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
                <Users className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Rankings Yet</h3>
              <p className="text-muted-foreground text-sm max-w-sm mx-auto">
                No managers are on the ranking board yet. {isAdmin && 'Add participants to get started.'}
              </p>
              {isAdmin && (
                <Button 
                  variant="default" 
                  className="mt-6 rounded-full"
                  onClick={() => setParticipantsOpen(true)}
                >
                  Add Participants
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <>
            {/* Podium Section - Top 3 */}
            {topThree.length > 0 && (
              <div className="py-4">
                <div className="flex items-end justify-center gap-2 md:gap-4">
                  {podiumOrder.map((manager, idx) => {
                    if (!manager) return null;
                    const isFirst = manager.rank === 1;
                    const isSecond = manager.rank === 2;
                    const isThird = manager.rank === 3;

                    return (
                      <PodiumCard
                        key={manager.manager_id}
                        manager={manager}
                        rank={manager.rank}
                        isFirst={isFirst}
                        isSecond={isSecond}
                        isThird={isThird}
                        metricValue={getMetricValue(manager)}
                        metricLabel={getMetricLabel()}
                        onClick={() => setSelectedManager(manager)}
                      />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Awards Section */}
            {topThree.length > 0 && (
              <Card className="glass-card overflow-hidden">
                <CardContent className="p-4 md:p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Medal className="h-5 w-5 text-primary" />
                    <h3 className="font-semibold">Current Awards</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <AwardBadge 
                      title="Top Performer"
                      subtitle={topThree[0]?.manager_name || 'TBD'}
                      icon={<Crown className="h-4 w-4" />}
                      variant="gold"
                    />
                    <AwardBadge 
                      title="Best Growth"
                      subtitle={rankingData?.reduce((prev, curr) => 
                        (curr.growth_pct > prev.growth_pct) ? curr : prev
                      )?.manager_name || 'TBD'}
                      icon={<TrendingUp className="h-4 w-4" />}
                      variant="green"
                    />
                    <AwardBadge 
                      title="Rising Star"
                      subtitle={rankingData?.[Math.min(2, rankingData.length - 1)]?.manager_name || 'TBD'}
                      icon={<Star className="h-4 w-4" />}
                      variant="purple"
                    />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Rest of Rankings */}
            {restOfList.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-medium text-muted-foreground px-1">
                  All Rankings
                </h3>
                {restOfList.map((manager) => (
                  <RankingCard
                    key={manager.manager_id}
                    data={manager}
                    metricValue={getMetricValue(manager)}
                    metricLabel={getMetricLabel()}
                    onClick={() => setSelectedManager(manager)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {/* Details Drawer */}
        <Sheet open={!!selectedManager} onOpenChange={() => setSelectedManager(null)}>
          <SheetContent side={isMobile ? 'bottom' : 'right'} className={isMobile ? 'h-[90vh]' : ''}>
            {selectedManager && (
              <ManagerDetailsDrawer data={selectedManager} metric={metric} />
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

// Podium Card Component
function PodiumCard({ 
  manager, 
  rank,
  isFirst, 
  isSecond, 
  isThird,
  metricValue,
  metricLabel,
  onClick
}: { 
  manager: ManagerRankingData;
  rank: number;
  isFirst: boolean;
  isSecond: boolean;
  isThird: boolean;
  metricValue: string;
  metricLabel: string;
  onClick: () => void;
}) {
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getPodiumHeight = () => {
    if (isFirst) return 'h-44 md:h-52';
    if (isSecond) return 'h-36 md:h-44';
    return 'h-32 md:h-40';
  };

  const getAvatarSize = () => {
    if (isFirst) return 'h-20 w-20 md:h-24 md:w-24';
    return 'h-16 w-16 md:h-20 md:w-20';
  };

  const getCrownColor = () => {
    if (isFirst) return 'text-yellow-500';
    if (isSecond) return 'text-gray-400';
    return 'text-amber-600';
  };

  const getBorderGlow = () => {
    if (isFirst) return 'ring-2 ring-yellow-500/50 shadow-[0_0_20px_rgba(234,179,8,0.3)]';
    if (isSecond) return 'ring-2 ring-gray-400/30';
    if (isThird) return 'ring-2 ring-amber-600/30';
    return '';
  };

  return (
    <div 
      className={cn(
        "flex flex-col items-center cursor-pointer transition-all hover:scale-105",
        isFirst && "order-2",
        isSecond && "order-1",
        isThird && "order-3"
      )}
      onClick={onClick}
    >
      {/* Avatar with Crown */}
      <div className="relative mb-2">
        {rank <= 3 && (
          <div className={cn(
            "absolute -top-3 left-1/2 -translate-x-1/2 z-10",
            getCrownColor()
          )}>
            <Crown className={cn("h-5 w-5 md:h-6 md:w-6", isFirst && "h-6 w-6 md:h-7 md:w-7")} />
          </div>
        )}
        <Avatar className={cn(
          getAvatarSize(),
          "border-4 border-card transition-all",
          getBorderGlow()
        )}>
          <AvatarFallback className={cn(
            "text-lg md:text-xl font-bold",
            isFirst ? "bg-gradient-to-br from-yellow-500/20 to-yellow-600/20 text-yellow-600 dark:text-yellow-400" :
            isSecond ? "bg-gradient-to-br from-gray-400/20 to-gray-500/20 text-gray-600 dark:text-gray-300" :
            "bg-gradient-to-br from-amber-500/20 to-amber-600/20 text-amber-600 dark:text-amber-400"
          )}>
            {getInitials(manager.manager_name)}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Podium */}
      <div className={cn(
        "w-24 md:w-32 rounded-t-2xl flex flex-col items-center justify-start pt-3 px-2 transition-all",
        getPodiumHeight(),
        isFirst 
          ? "bg-gradient-to-b from-yellow-500/20 to-yellow-600/10 border-t-2 border-x-2 border-yellow-500/30" 
          : isSecond 
            ? "bg-gradient-to-b from-gray-400/20 to-gray-500/10 border-t-2 border-x-2 border-gray-400/30" 
            : "bg-gradient-to-b from-amber-500/20 to-amber-600/10 border-t-2 border-x-2 border-amber-500/30"
      )}>
        {/* Rank Number */}
        <div className={cn(
          "text-2xl md:text-3xl font-bold mb-1",
          isFirst ? "text-yellow-500" : isSecond ? "text-gray-400" : "text-amber-600"
        )}>
          #{rank}
        </div>
        
        {/* Name */}
        <p className="text-xs md:text-sm font-semibold text-center truncate w-full">
          {manager.manager_name.split(' ')[0]}
        </p>
        
        {/* Metric */}
        <p className="text-xs text-muted-foreground mt-1">
          {metricValue}
        </p>
        
        {/* Growth indicator */}
        {manager.growth_pct !== 0 && (
          <div className={cn(
            "flex items-center gap-0.5 text-xs mt-1",
            manager.growth_pct > 0 ? "text-green-500" : "text-red-500"
          )}>
            {manager.growth_pct > 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {Math.abs(manager.growth_pct).toFixed(0)}%
          </div>
        )}
      </div>
    </div>
  );
}

// Award Badge Component
function AwardBadge({ 
  title, 
  subtitle, 
  icon,
  variant 
}: { 
  title: string; 
  subtitle: string; 
  icon: React.ReactNode;
  variant: 'gold' | 'green' | 'purple';
}) {
  const getVariantStyles = () => {
    switch (variant) {
      case 'gold':
        return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20';
      case 'green':
        return 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20';
      case 'purple':
        return 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20';
    }
  };

  return (
    <div className={cn(
      "flex items-center gap-3 p-3 rounded-xl border",
      getVariantStyles()
    )}>
      <div className="p-2 rounded-lg bg-current/10">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs opacity-80">{title}</p>
        <p className="font-semibold truncate text-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

// Ranking Card Component (for 4th place and below)
function RankingCard({ 
  data, 
  metricValue,
  metricLabel,
  onClick
}: { 
  data: ManagerRankingData;
  metricValue: string;
  metricLabel: string;
  onClick: () => void;
}) {
  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  return (
    <Card 
      className="glass-card cursor-pointer transition-all hover:shadow-lg hover:scale-[1.01] active:scale-[0.99]"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          {/* Rank */}
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center font-bold text-muted-foreground">
            #{data.rank}
          </div>

          {/* Avatar & Info */}
          <Avatar className="h-12 w-12 border-2 border-border">
            <AvatarFallback className="bg-secondary text-secondary-foreground font-medium">
              {getInitials(data.manager_name)}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0">
            <p className="font-semibold truncate">{data.manager_name}</p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{data.team_delivered_orders} delivered</span>
              {data.growth_pct !== 0 && (
                <span className={cn(
                  "flex items-center",
                  data.growth_pct > 0 ? "text-green-500" : "text-red-500"
                )}>
                  {data.growth_pct > 0 ? (
                    <TrendingUp className="h-3 w-3 mr-0.5" />
                  ) : (
                    <TrendingDown className="h-3 w-3 mr-0.5" />
                  )}
                  {Math.abs(data.growth_pct).toFixed(1)}%
                </span>
              )}
            </div>
          </div>

          {/* Primary Metric Value */}
          <div className="flex-shrink-0 text-right">
            <span className="text-lg font-bold">{metricValue}</span>
            <p className="text-xs text-muted-foreground">{metricLabel}</p>
          </div>

          <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

// Manager Details Drawer
function ManagerDetailsDrawer({ data, metric }: { data: ManagerRankingData; metric: RankingMetric }) {
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
      ? "⚠️ High dependency on top performer"
      : null,
    data.bottom30_improve_pct > 0.5 
      ? "✅ Bottom performers improving well"
      : data.bottom30_improve_pct < 0.2 
        ? "💡 Focus coaching on bottom 30%"
        : null,
  ].filter(Boolean);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const getRankColor = () => {
    if (data.rank === 1) return 'text-yellow-500';
    if (data.rank === 2) return 'text-gray-400';
    if (data.rank === 3) return 'text-amber-600';
    return 'text-muted-foreground';
  };

  return (
    <>
      <SheetHeader className="pb-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 border-2 border-primary/20">
            <AvatarFallback className="bg-primary/10 text-primary font-bold text-xl">
              {getInitials(data.manager_name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <SheetTitle className="text-left">{data.manager_name}</SheetTitle>
            <div className="flex items-center gap-2 mt-1">
              <Badge variant="outline" className={cn("font-bold", getRankColor())}>
                Rank #{data.rank}
              </Badge>
              {data.growth_pct !== 0 && (
                <Badge variant={data.growth_pct > 0 ? 'default' : 'destructive'} className="text-xs">
                  {data.growth_pct > 0 ? '+' : ''}{data.growth_pct.toFixed(1)}%
                </Badge>
              )}
            </div>
          </div>
        </div>
      </SheetHeader>

      <ScrollArea className="h-[calc(100vh-180px)] mt-2">
        <div className="space-y-4 pb-6">
          {/* Leadership Score */}
          <Card className="glass-card overflow-hidden">
            <div className="bg-gradient-to-r from-primary/10 to-transparent p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Leadership Score</span>
                </div>
                <div className="text-3xl font-bold text-primary">
                  {data.leadership_score.toFixed(0)}
                  <span className="text-sm text-muted-foreground font-normal">/100</span>
                </div>
              </div>
            </div>
            <CardContent className="p-4 pt-3">
              <div className="space-y-3">
                <ScoreBar 
                  label="Team Growth" 
                  value={scoreBreakdown.team_growth_score} 
                  max={40}
                  icon={<TrendingUp className="h-4 w-4" />}
                  color="bg-blue-500"
                />
                <ScoreBar 
                  label="Bottom 30% Improvement" 
                  value={scoreBreakdown.improvement_score} 
                  max={30}
                  icon={<Target className="h-4 w-4" />}
                  color="bg-green-500"
                />
                <ScoreBar 
                  label="Ops Interventions" 
                  value={scoreBreakdown.ops_score} 
                  max={20}
                  icon={<Zap className="h-4 w-4" />}
                  color="bg-yellow-500"
                />
                <ScoreBar 
                  label="Personal Contribution" 
                  value={scoreBreakdown.personal_score} 
                  max={10}
                  icon={<User className="h-4 w-4" />}
                  color="bg-purple-500"
                />
              </div>
            </CardContent>
          </Card>

          {/* Key Metrics */}
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                Key Metrics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
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
                  valueClass={data.growth_pct >= 0 ? 'text-green-500' : 'text-red-500'}
                />
                <MetricItem 
                  label="Dependency" 
                  value={`${(data.dependency_ratio * 100).toFixed(0)}%`}
                  valueClass={data.dependency_ratio > 0.5 ? 'text-yellow-500' : ''}
                />
              </div>
            </CardContent>
          </Card>

          {/* Insights */}
          {insights.length > 0 && (
            <Card className="glass-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {insights.map((insight, i) => (
                    <li key={i} className="text-sm bg-muted/30 rounded-lg p-2.5">{insight}</li>
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
  icon,
  color = "bg-primary"
}: { 
  label: string; 
  value: number; 
  max: number;
  icon: React.ReactNode;
  color?: string;
}) {
  const percentage = (value / max) * 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          {icon}
          {label}
        </span>
        <span className="font-medium tabular-nums">{value.toFixed(1)}/{max}</span>
      </div>
      <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
        <div 
          className={cn("h-full rounded-full transition-all", color)}
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
  valueClass 
}: { 
  label: string; 
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="p-3 rounded-xl bg-muted/30">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-lg font-semibold", valueClass)}>{value}</p>
    </div>
  );
}
