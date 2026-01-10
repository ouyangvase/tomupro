import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trophy, TrendingUp, TrendingDown, Minus, AlertTriangle, Radio, RefreshCw, Award, Diamond, Clock } from "lucide-react";
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
    return <Badge variant="outline" className="text-xs bg-primary/10 border-primary/30">New</Badge>;
  }
  
  const delta = previous - current;
  
  if (delta > 0) {
    return (
      <span className="flex items-center gap-1 text-[hsl(var(--status-success))] text-xs font-medium">
        <TrendingUp className="h-3 w-3" />
        +{delta}
      </span>
    );
  }
  
  if (delta < 0) {
    return (
      <span className="flex items-center gap-1 text-[hsl(var(--status-error))] text-xs font-medium">
        <TrendingDown className="h-3 w-3" />
        {delta}
      </span>
    );
  }
  
  return (
    <span className="flex items-center gap-1 text-muted-foreground text-xs">
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
  const positionStyles = {
    1: {
      container: "order-2 z-10",
      card: "h-[280px] bg-gradient-to-b from-card/80 to-card border-primary/30",
      avatar: "w-24 h-24 ring-4 ring-primary/50",
      trophy: "text-primary",
      trophyBg: "bg-primary/20",
      prize: "text-3xl",
    },
    2: {
      container: "order-1",
      card: "h-[240px] bg-gradient-to-b from-muted/50 to-card border-muted-foreground/20",
      avatar: "w-20 h-20 ring-4 ring-muted-foreground/30",
      trophy: "text-muted-foreground",
      trophyBg: "bg-muted-foreground/20",
      prize: "text-2xl",
    },
    3: {
      container: "order-3",
      card: "h-[220px] bg-gradient-to-b from-[hsl(24,50%,30%)]/20 to-card border-[hsl(24,70%,50%)]/30",
      avatar: "w-20 h-20 ring-4 ring-[hsl(24,70%,50%)]/30",
      trophy: "text-[hsl(24,70%,50%)]",
      trophyBg: "bg-[hsl(24,70%,50%)]/20",
      prize: "text-2xl",
    },
  };

  const styles = positionStyles[position];

  return (
    <div className={cn("flex flex-col items-center", styles.container)}>
      {/* Avatar */}
      <div className="relative mb-3">
        <Avatar className={cn(styles.avatar, isCurrentUser && "ring-primary")}>
          <AvatarFallback className="text-xl font-bold bg-secondary text-secondary-foreground">
            {getInitials(ranking.salesperson_name)}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Name */}
      <h3 className={cn(
        "font-semibold text-lg mb-2 text-center",
        isCurrentUser && "text-primary"
      )}>
        {ranking.salesperson_name}
        {isCurrentUser && <span className="text-xs text-muted-foreground ml-1">(You)</span>}
      </h3>

      {/* Trophy & Points Card */}
      <div className={cn(
        "rounded-xl border p-4 flex flex-col items-center justify-end w-full max-w-[180px]",
        styles.card,
        isCurrentUser && "border-primary/50"
      )}>
        {/* Trophy Icon */}
        <div className={cn("rounded-full p-3 mb-3", styles.trophyBg)}>
          <Trophy className={cn("h-6 w-6", styles.trophy)} />
        </div>

        {/* Label */}
        <p className="text-xs text-muted-foreground mb-1">
          {ranking.delivered_orders} delivered
        </p>

        {/* Amount */}
        <div className="flex items-center gap-1.5">
          <Diamond className="h-4 w-4 text-primary fill-primary/20" />
          <span className={cn("font-bold tabular-nums", styles.prize)}>
            {formatBND(ranking.net_sales).replace('BND ', '')}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">Sales</p>

        {/* Countdown for 1st place */}
        {position === 1 && (
          <div className="mt-4 flex flex-col items-center">
            <Clock className="h-5 w-5 text-muted-foreground mb-1" />
            <p className="text-xs text-muted-foreground">Ends in</p>
            <CountdownTimer />
          </div>
        )}
      </div>
    </div>
  );
}

function CountdownTimer() {
  const now = new Date();
  const endOfMonthDate = endOfMonth(now);
  
  const days = differenceInDays(endOfMonthDate, now);
  const hours = differenceInHours(endOfMonthDate, now) % 24;
  const minutes = differenceInMinutes(endOfMonthDate, now) % 60;
  const seconds = differenceInSeconds(endOfMonthDate, now) % 60;

  return (
    <p className="text-sm font-semibold tabular-nums">
      {days}d {hours}h {minutes}m {seconds}s
    </p>
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
    <div className="glass-card-strong rounded-full px-6 py-3 flex items-center justify-center gap-3 max-w-md mx-auto">
      <span className="text-sm text-muted-foreground">You earned</span>
      <span className="flex items-center gap-1.5">
        <Diamond className="h-4 w-4 text-primary fill-primary/20" />
        <span className="font-bold text-primary">{formatBND(ranking.net_sales).replace('BND ', '')}</span>
      </span>
      <span className="text-sm text-muted-foreground">and ranked</span>
      <span className="flex items-center gap-2">
        <span className="font-bold text-foreground">#{ranking.rank_position}</span>
        <RankDelta current={ranking.rank_position} previous={previousRanking?.rank_position ?? null} />
      </span>
      <span className="text-sm text-muted-foreground">out of</span>
      <span className="font-bold text-primary">{totalUsers} users</span>
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
    <div className="glass-card overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="border-border/50 hover:bg-transparent">
            <TableHead className="w-[80px] text-muted-foreground font-medium">Rank</TableHead>
            <TableHead className="text-muted-foreground font-medium">Salesperson</TableHead>
            <TableHead className="text-right text-muted-foreground font-medium">Delivered</TableHead>
            <TableHead className="text-right text-muted-foreground font-medium">Success %</TableHead>
            <TableHead className="text-right text-muted-foreground font-medium">Sales</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rankings.map((ranking) => {
            const isCurrentUser = ranking.salesperson_id === currentUserId;
            return (
              <TableRow 
                key={ranking.salesperson_id}
                className={cn(
                  "border-border/30 transition-colors",
                  isCurrentUser 
                    ? "bg-primary/10 hover:bg-primary/15" 
                    : "hover:bg-muted/30"
                )}
              >
                <TableCell className="font-medium">
                  <div className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold",
                    ranking.rank_position === 1 && "bg-primary/20 text-primary",
                    ranking.rank_position === 2 && "bg-muted-foreground/20 text-muted-foreground",
                    ranking.rank_position === 3 && "bg-[hsl(24,70%,50%)]/20 text-[hsl(24,70%,50%)]",
                    ranking.rank_position > 3 && "bg-muted text-muted-foreground"
                  )}>
                    {ranking.rank_position}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarFallback className="text-sm bg-secondary text-secondary-foreground">
                        {getInitials(ranking.salesperson_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className={cn(
                        "font-medium",
                        isCurrentUser && "text-primary"
                      )}>
                        {ranking.salesperson_name}
                        {isCurrentUser && <span className="ml-1 text-xs text-muted-foreground">(You)</span>}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {ranking.delivered_orders}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {ranking.success_rate}%
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <Diamond className="h-4 w-4 text-primary fill-primary/20" />
                    <span className="font-semibold tabular-nums">
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
  const { rankings, lastUpdated, isLoading, isFetching, hasDeliveredOrders } = useVisibleRankings(periodMode);
  const myRanking = useMyRanking(periodMode);
  const previousRanking = usePreviousPeriodRanking(periodMode);
  
  const primaryMetric = settings?.primary_metric || 'net_sales';
  const top3 = rankings.slice(0, 3);
  const restRankings = rankings.slice(3);
  
  // Check if all rankings have zero data
  const allZeros = rankings.length > 0 && rankings.every(r => r.net_sales === 0 && r.delivered_orders === 0);

  return (
    <AppLayout>
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Trophy className="h-6 w-6 text-primary" />
              Sales Leaderboard
            </h1>
            <p className="text-muted-foreground">
              Rankings based on {settings?.primary_metric?.replace('_', ' ') || 'net sales'}
            </p>
          </div>
          
          {/* Data Indicator */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Radio className={cn("h-3 w-3", isFetching ? "text-[hsl(var(--status-pending))] animate-pulse" : "text-[hsl(var(--status-success))]")} />
            <span>Live • {format(lastUpdated, 'HH:mm:ss')}</span>
            {isFetching && <RefreshCw className="h-3 w-3 animate-spin" />}
          </div>
        </div>

        {/* Warning Banner - No matched delivered orders */}
        {allZeros && rankings.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Leaderboard has no matched delivered orders for this period. Check filters or verify order data.
            </AlertDescription>
          </Alert>
        )}

        {/* Period Tabs */}
        <Tabs value={periodMode} onValueChange={(v) => setPeriodMode(v as PeriodMode)} className="w-full">
          <div className="flex justify-center">
            <TabsList className="grid grid-cols-3 w-full max-w-md">
              <TabsTrigger value="today">Today</TabsTrigger>
              <TabsTrigger value="week">This Week</TabsTrigger>
              <TabsTrigger value="month">This Month</TabsTrigger>
            </TabsList>
          </div>
          
          <TabsContent value={periodMode} className="mt-8 space-y-8">
            {/* Loading State */}
            {isLoading && (
              <div className="flex items-center justify-center py-16">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-3 text-muted-foreground text-lg">Loading rankings...</span>
              </div>
            )}

            {/* Top 3 Podium */}
            {!isLoading && top3.length >= 3 && (
              <div className="flex justify-center items-end gap-4 md:gap-8 py-8">
                <PodiumCard 
                  ranking={top3[1]} 
                  position={2} 
                  isCurrentUser={top3[1].salesperson_id === profile?.id}
                />
                <PodiumCard 
                  ranking={top3[0]} 
                  position={1} 
                  isCurrentUser={top3[0].salesperson_id === profile?.id}
                />
                <PodiumCard 
                  ranking={top3[2]} 
                  position={3} 
                  isCurrentUser={top3[2].salesperson_id === profile?.id}
                />
              </div>
            )}

            {/* Less than 3 participants - show simple cards */}
            {!isLoading && top3.length > 0 && top3.length < 3 && (
              <div className="flex justify-center items-end gap-4 md:gap-8 py-8">
                {top3.map((ranking, index) => (
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
            {!isLoading && profile?.role === 'salesperson' && myRanking && (
              <UserRankBanner 
                ranking={myRanking} 
                totalUsers={rankings.length}
                previousRanking={previousRanking}
              />
            )}

            {/* Full Rankings Table */}
            {!isLoading && rankings.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Full Rankings</h2>
                  <Badge variant="outline" className="font-normal">
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
              <div className="text-center py-16">
                <Award className="h-16 w-16 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-lg text-muted-foreground">No rankings available for this period</p>
                <p className="text-sm text-muted-foreground/60 mt-1">Start delivering orders to appear on the leaderboard!</p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
