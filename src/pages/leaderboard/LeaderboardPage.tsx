import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, TrendingUp, TrendingDown, Minus, AlertTriangle, Sparkles, RefreshCw, Award, Crown, Timer, Medal, Flame } from "lucide-react";
import { CapybaraState } from "@/components/dashboard/CapybaraState";
import { useAuth } from "@/contexts/AuthContext";
import { useVisibleRankings, useMyRanking, usePreviousPeriodRanking, useLeaderboardSettings, PeriodMode, LeaderboardRanking } from "@/hooks/useLeaderboard";
import { formatBND } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { format, endOfMonth, differenceInDays, differenceInHours, differenceInMinutes, differenceInSeconds } from "date-fns";

function getInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function RankDelta({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) {
    return (
      <Badge className="text-[10px] px-2 py-0.5 bg-primary/20 text-primary border-0 font-medium">
        NEW
      </Badge>
    );
  }
  
  const delta = previous - current;
  
  if (delta > 0) {
    return (
      <span className="flex items-center gap-0.5 text-[hsl(var(--status-success))] text-xs font-semibold">
        <TrendingUp className="h-3.5 w-3.5" />
        +{delta}
      </span>
    );
  }
  
  if (delta < 0) {
    return (
      <span className="flex items-center gap-0.5 text-[hsl(var(--status-error))] text-xs font-semibold">
        <TrendingDown className="h-3.5 w-3.5" />
        {delta}
      </span>
    );
  }
  
  return (
    <span className="flex items-center gap-0.5 text-muted-foreground/60 text-xs">
      <Minus className="h-3 w-3" />
    </span>
  );
}

function PodiumCard({ 
  ranking, 
  position,
  isCurrentUser 
}: { 
  ranking: LeaderboardRanking; 
  position: 1 | 2 | 3;
  isCurrentUser: boolean;
}) {
  const positionConfig = {
    1: {
      container: "order-2 z-20 -mt-4",
      wrapper: "relative",
      card: "min-h-[320px] bg-gradient-to-b from-primary/15 via-card to-card/95 border-2 border-primary/40 shadow-[0_0_60px_-10px_hsl(var(--primary)/0.4)]",
      avatar: "w-28 h-28 ring-4 ring-primary shadow-[0_0_30px_-5px_hsl(var(--primary)/0.5)]",
      avatarBg: "bg-gradient-to-br from-primary/30 to-primary/10 text-primary",
      icon: Crown,
      iconColor: "text-primary",
      iconBg: "bg-primary/20 border border-primary/30",
      salesSize: "text-4xl",
      badge: "bg-primary text-primary-foreground",
      glow: true,
    },
    2: {
      container: "order-1 z-10",
      wrapper: "relative",
      card: "min-h-[280px] bg-gradient-to-b from-muted/60 via-card to-card/95 border border-muted-foreground/30",
      avatar: "w-24 h-24 ring-4 ring-muted-foreground/40",
      avatarBg: "bg-gradient-to-br from-muted-foreground/20 to-muted text-muted-foreground",
      icon: Medal,
      iconColor: "text-muted-foreground",
      iconBg: "bg-muted-foreground/20 border border-muted-foreground/20",
      salesSize: "text-2xl",
      badge: "bg-muted-foreground/20 text-muted-foreground",
      glow: false,
    },
    3: {
      container: "order-3 z-10",
      wrapper: "relative",
      card: "min-h-[260px] bg-gradient-to-b from-[hsl(25,80%,55%)]/15 via-card to-card/95 border border-[hsl(25,80%,55%)]/40",
      avatar: "w-24 h-24 ring-4 ring-[hsl(25,80%,55%)]/40",
      avatarBg: "bg-gradient-to-br from-[hsl(25,80%,55%)]/30 to-[hsl(25,80%,55%)]/10 text-[hsl(25,80%,55%)]",
      icon: Award,
      iconColor: "text-[hsl(25,80%,55%)]",
      iconBg: "bg-[hsl(25,80%,55%)]/20 border border-[hsl(25,80%,55%)]/30",
      salesSize: "text-2xl",
      badge: "bg-[hsl(25,80%,55%)]/20 text-[hsl(25,80%,55%)]",
      glow: false,
    },
  };

  const config = positionConfig[position];
  const IconComponent = config.icon;

  return (
    <div className={cn("flex flex-col items-center w-full max-w-[200px]", config.container)}>
      <div className={config.wrapper}>
        {/* Rank Badge */}
        <div className={cn(
          "absolute -top-3 left-1/2 -translate-x-1/2 z-30 px-4 py-1.5 rounded-full font-bold text-sm shadow-lg",
          config.badge
        )}>
          #{position}
        </div>

        {/* Card */}
        <div className={cn(
          "rounded-2xl p-6 flex flex-col items-center justify-between w-full backdrop-blur-sm",
          config.card,
          isCurrentUser && "ring-2 ring-primary ring-offset-2 ring-offset-background"
        )}>
          {/* Icon Badge */}
          <div className={cn("rounded-full p-2.5 mb-4", config.iconBg)}>
            <IconComponent className={cn("h-5 w-5", config.iconColor)} />
          </div>

          {/* Avatar */}
          <Avatar className={cn(config.avatar, "mb-4 transition-transform hover:scale-105")}>
            {ranking.avatar_url && (
              <AvatarImage src={ranking.avatar_url} alt={ranking.salesperson_name} />
            )}
            <AvatarFallback className={cn("text-2xl font-bold", config.avatarBg)}>
              {getInitials(ranking.salesperson_name)}
            </AvatarFallback>
          </Avatar>

          {/* Name */}
          <h3 className={cn(
            "font-semibold text-base mb-1 text-center truncate w-full",
            isCurrentUser && "text-primary"
          )}>
            {ranking.salesperson_name}
          </h3>
          {isCurrentUser && (
            <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-3">You</span>
          )}

          {/* Stats */}
          <div className="text-center space-y-2 mt-auto">
            <p className="text-xs text-muted-foreground font-medium">
              <span className="text-foreground font-semibold">{ranking.delivered_orders}</span> delivered
            </p>
            
            <div className="flex items-center justify-center gap-1.5">
              <Flame className="h-5 w-5 text-primary" />
              <span className={cn("font-bold tabular-nums tracking-tight", config.salesSize)}>
                {formatBND(ranking.net_sales).replace('BND ', '')}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Net Sales</p>
          </div>

          {/* Countdown for 1st place */}
          {position === 1 && (
            <div className="mt-5 pt-4 border-t border-primary/20 w-full">
              <CountdownTimer />
            </div>
          )}
        </div>

        {/* Glow effect for 1st place */}
        {config.glow && (
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/20 to-transparent rounded-2xl blur-2xl scale-110 opacity-60" />
        )}
      </div>
    </div>
  );
}

function CountdownTimer() {
  const [, setTick] = useState(0);
  
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  const now = new Date();
  const endOfMonthDate = endOfMonth(now);
  
  const days = differenceInDays(endOfMonthDate, now);
  const hours = differenceInHours(endOfMonthDate, now) % 24;
  const minutes = differenceInMinutes(endOfMonthDate, now) % 60;
  const seconds = differenceInSeconds(endOfMonthDate, now) % 60;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Timer className="h-3.5 w-3.5" />
        <span className="text-[10px] uppercase tracking-wider font-medium">Resets in</span>
      </div>
      <div className="flex items-center gap-1">
        <TimeUnit value={days} label="D" />
        <span className="text-muted-foreground/50 font-light">:</span>
        <TimeUnit value={hours} label="H" />
        <span className="text-muted-foreground/50 font-light">:</span>
        <TimeUnit value={minutes} label="M" />
        <span className="text-muted-foreground/50 font-light">:</span>
        <TimeUnit value={seconds} label="S" />
      </div>
    </div>
  );
}

function TimeUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-lg font-bold tabular-nums text-foreground leading-none">
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-[8px] text-muted-foreground uppercase">{label}</span>
    </div>
  );
}

function UserRankBanner({ 
  ranking, 
  totalUsers,
  previousRanking
}: { 
  ranking: LeaderboardRanking; 
  totalUsers: number;
  previousRanking: LeaderboardRanking | null;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-card to-primary/10 p-4 md:p-5 max-w-2xl mx-auto shadow-lg">
      {/* Decorative elements */}
      <div className="absolute top-0 left-0 w-20 h-20 bg-primary/10 rounded-full -translate-x-1/2 -translate-y-1/2 blur-2xl" />
      <div className="absolute bottom-0 right-0 w-20 h-20 bg-primary/10 rounded-full translate-x-1/2 translate-y-1/2 blur-2xl" />
      
      <div className="relative flex flex-col md:flex-row items-center justify-center gap-3 md:gap-6 text-center md:text-left">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="text-sm text-muted-foreground">You earned</span>
          <span className="flex items-center gap-1.5 bg-primary/20 px-3 py-1 rounded-full">
            <Flame className="h-4 w-4 text-primary" />
            <span className="font-bold text-primary">{formatBND(ranking.net_sales).replace('BND ', '')}</span>
          </span>
        </div>
        
        <div className="hidden md:block w-px h-8 bg-border" />
        
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Ranked</span>
          <span className="flex items-center gap-2 bg-muted/50 px-3 py-1 rounded-full">
            <span className="font-bold text-xl text-foreground">#{ranking.rank_position}</span>
            <RankDelta current={ranking.rank_position} previous={previousRanking?.rank_position ?? null} />
          </span>
          <span className="text-sm text-muted-foreground">of <span className="font-semibold text-foreground">{totalUsers}</span></span>
        </div>
      </div>
    </div>
  );
}

function LeaderboardTable({ 
  rankings, 
  currentUserId,
  primaryMetric
}: { 
  rankings: LeaderboardRanking[];
  currentUserId: string | undefined;
  primaryMetric: string;
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="border-border/30 bg-muted/30 hover:bg-muted/30">
            <TableHead className="w-[80px] text-xs uppercase tracking-wider text-muted-foreground font-semibold">Rank</TableHead>
            <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Salesperson</TableHead>
            <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground font-semibold">Delivered</TableHead>
            <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground font-semibold">Success</TableHead>
            <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground font-semibold">Sales</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rankings.map((ranking, index) => {
            const isCurrentUser = ranking.salesperson_id === currentUserId;
            const isTopThree = ranking.rank_position <= 3;
            
            return (
              <TableRow 
                key={ranking.salesperson_id}
                className={cn(
                  "border-border/20 transition-all duration-200",
                  isCurrentUser 
                    ? "bg-primary/10 hover:bg-primary/15 border-l-4 border-l-primary" 
                    : "hover:bg-muted/20",
                  isTopThree && !isCurrentUser && "bg-muted/10"
                )}
              >
                <TableCell className="font-medium py-4">
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold transition-transform hover:scale-110",
                    ranking.rank_position === 1 && "bg-gradient-to-br from-primary/30 to-primary/10 text-primary shadow-sm",
                    ranking.rank_position === 2 && "bg-gradient-to-br from-muted-foreground/30 to-muted text-muted-foreground",
                    ranking.rank_position === 3 && "bg-gradient-to-br from-[hsl(25,80%,55%)]/30 to-[hsl(25,80%,55%)]/10 text-[hsl(25,80%,55%)]",
                    ranking.rank_position > 3 && "bg-muted/50 text-muted-foreground"
                  )}>
                    {ranking.rank_position === 1 && <Crown className="h-4 w-4" />}
                    {ranking.rank_position === 2 && <Medal className="h-4 w-4" />}
                    {ranking.rank_position === 3 && <Award className="h-4 w-4" />}
                    {ranking.rank_position > 3 && ranking.rank_position}
                  </div>
                </TableCell>
                <TableCell className="py-4">
                  <div className="flex items-center gap-3">
                    <Avatar className={cn(
                      "h-10 w-10 transition-transform hover:scale-105",
                      isTopThree && "ring-2 ring-offset-1 ring-offset-background",
                      ranking.rank_position === 1 && "ring-primary/50",
                      ranking.rank_position === 2 && "ring-muted-foreground/30",
                      ranking.rank_position === 3 && "ring-[hsl(25,80%,55%)]/30"
                    )}>
                      {ranking.avatar_url && (
                        <AvatarImage src={ranking.avatar_url} alt={ranking.salesperson_name} />
                      )}
                      <AvatarFallback className={cn(
                        "text-sm font-semibold",
                        ranking.rank_position === 1 && "bg-primary/20 text-primary",
                        ranking.rank_position === 2 && "bg-muted-foreground/20 text-muted-foreground",
                        ranking.rank_position === 3 && "bg-[hsl(25,80%,55%)]/20 text-[hsl(25,80%,55%)]",
                        ranking.rank_position > 3 && "bg-secondary text-secondary-foreground"
                      )}>
                        {getInitials(ranking.salesperson_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className={cn(
                        "font-medium",
                        isCurrentUser && "text-primary"
                      )}>
                        {ranking.salesperson_name}
                      </p>
                      {isCurrentUser && (
                        <span className="text-[10px] text-primary/70 uppercase tracking-wider font-medium">You</span>
                      )}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums py-4">
                  <span className="font-medium">{ranking.delivered_orders}</span>
                </TableCell>
                <TableCell className="text-right tabular-nums py-4">
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "font-medium border-0",
                      ranking.success_rate >= 80 && "bg-[hsl(var(--status-success))]/20 text-[hsl(var(--status-success))]",
                      ranking.success_rate >= 50 && ranking.success_rate < 80 && "bg-[hsl(var(--status-pending))]/20 text-[hsl(var(--status-pending))]",
                      ranking.success_rate < 50 && "bg-muted text-muted-foreground"
                    )}
                  >
                    {ranking.success_rate}%
                  </Badge>
                </TableCell>
                <TableCell className="text-right py-4">
                  <div className="flex items-center justify-end gap-1.5">
                    <Flame className="h-4 w-4 text-primary" />
                    <span className="font-bold tabular-nums text-base">
                      {formatBND(ranking.net_sales).replace('BND ', '')}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export default function LeaderboardPage() {
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const { profile } = useAuth();
  const { data: settings } = useLeaderboardSettings();
  const { rankings, top3Rankings, lastUpdated, isLoading, isFetching, hasDeliveredOrders } = useVisibleRankings(periodMode);
  const myRanking = useMyRanking(periodMode);
  const previousRanking = usePreviousPeriodRanking(periodMode);
  
  const primaryMetric = settings?.primary_metric || 'net_sales';
  
  // Check if all rankings have zero data
  const allZeros = rankings.length > 0 && rankings.every(r => r.net_sales === 0 && r.delivered_orders === 0);

  return (
    <AppLayout>
      <div className="space-y-8 max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/20 text-primary">
                <Trophy className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Sales Leaderboard</h1>
                <p className="text-sm text-muted-foreground">
                  Rankings by {settings?.primary_metric?.replace('_', ' ') || 'net sales'}
                </p>
              </div>
            </div>
          </div>
          
          {/* Live Indicator */}
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors",
              isFetching 
                ? "bg-[hsl(var(--status-pending))]/20 text-[hsl(var(--status-pending))]" 
                : "bg-[hsl(var(--status-success))]/20 text-[hsl(var(--status-success))]"
            )}>
              <span className={cn(
                "w-2 h-2 rounded-full",
                isFetching ? "bg-[hsl(var(--status-pending))] animate-pulse" : "bg-[hsl(var(--status-success))]"
              )} />
              Live
            </div>
            <span className="text-xs text-muted-foreground tabular-nums">
              {format(lastUpdated, 'HH:mm:ss')}
            </span>
            {isFetching && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </div>
        </div>

        {/* Warning Banner */}
        {allZeros && rankings.length > 0 && (
          <Alert variant="destructive" className="rounded-xl">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              No delivered orders matched for this period. Verify order data or check filters.
            </AlertDescription>
          </Alert>
        )}

        {/* Period Tabs */}
        <Tabs value={periodMode} onValueChange={(v) => setPeriodMode(v as PeriodMode)} className="w-full">
          <div className="flex justify-center">
            <TabsList className="grid grid-cols-3 w-full max-w-sm h-11 p-1 bg-muted/50 rounded-xl">
              <TabsTrigger value="today" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
                Today
              </TabsTrigger>
              <TabsTrigger value="week" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
                This Week
              </TabsTrigger>
              <TabsTrigger value="month" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
                This Month
              </TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value={periodMode} className="mt-10 space-y-10">
            {/* Loading State */}
            {isLoading && (
              <div className="flex flex-col items-center justify-center py-20 gap-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                  <Trophy className="absolute inset-0 m-auto h-6 w-6 text-primary" />
                </div>
                <p className="text-muted-foreground font-medium">Loading rankings...</p>
              </div>
            )}

            {/* Top 3 Podium - Always shows actual top 3 regardless of visibility settings */}
            {!isLoading && top3Rankings.length >= 3 && (
              <div className="flex justify-center items-end gap-3 md:gap-6 py-6">
                <PodiumCard 
                  ranking={top3Rankings[1]} 
                  position={2} 
                  isCurrentUser={top3Rankings[1].salesperson_id === profile?.id}
                />
                <PodiumCard 
                  ranking={top3Rankings[0]} 
                  position={1} 
                  isCurrentUser={top3Rankings[0].salesperson_id === profile?.id}
                />
                <PodiumCard 
                  ranking={top3Rankings[2]} 
                  position={3} 
                  isCurrentUser={top3Rankings[2].salesperson_id === profile?.id}
                />
              </div>
            )}

            {/* Less than 3 participants */}
            {!isLoading && top3Rankings.length > 0 && top3Rankings.length < 3 && (
              <div className="flex justify-center items-end gap-3 md:gap-6 py-6">
                {top3Rankings.map((ranking, index) => (
                  <PodiumCard 
                    key={ranking.salesperson_id}
                    ranking={ranking} 
                    position={(index + 1) as 1 | 2 | 3} 
                    isCurrentUser={ranking.salesperson_id === profile?.id}
                  />
                ))}
              </div>
            )}

            {/* User Rank Banner */}
            {!isLoading && (profile?.role === 'salesperson' || profile?.role === 'manager') && myRanking && (
              <UserRankBanner 
                ranking={myRanking} 
                totalUsers={rankings.length}
                previousRanking={previousRanking}
              />
            )}

            {/* Full Rankings Table */}
            {!isLoading && rankings.length > 0 && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    Full Rankings
                  </h2>
                  <Badge variant="outline" className="font-medium rounded-full px-3 py-1">
                    {rankings.length} salespeople
                  </Badge>
                </div>
                <LeaderboardTable 
                  rankings={rankings}
                  currentUserId={profile?.id}
                  primaryMetric={primaryMetric}
                />
              </div>
            )}

            {/* Empty State */}
            {!isLoading && rankings.length === 0 && (
              <div className="text-center py-20">
                <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-6">
                  <Trophy className="h-10 w-10 text-muted-foreground/40" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">No rankings yet</h3>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  Start delivering orders to climb the leaderboard and compete with your team!
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
