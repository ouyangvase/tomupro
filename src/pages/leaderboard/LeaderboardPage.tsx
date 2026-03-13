import { useState, useEffect, useMemo } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Trophy, TrendingUp, TrendingDown, Minus, AlertTriangle, Sparkles, RefreshCw, Award, Crown, Timer, Medal, Flame, Target, Zap, ChevronUp, Calendar, Users } from "lucide-react";
import { CapybaraState } from "@/components/dashboard/CapybaraState";
import { AnimatedCounter } from "@/components/dashboard/AnimatedCounter";
import { PageHero } from "@/components/dashboard/PageHero";
import { useAuth } from "@/contexts/AuthContext";
import { useVisibleRankings, useMyRanking, usePreviousPeriodRanking, useLeaderboardSettings, PeriodMode, LeaderboardRanking } from "@/hooks/useLeaderboard";
import { formatBND } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { format, endOfMonth, endOfQuarter, endOfYear, differenceInDays, differenceInHours, differenceInMinutes, differenceInSeconds } from "date-fns";
import capybaraSales from "@/assets/capybara-sales.png";

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function RankDelta({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) {
    return <Badge className="text-[10px] px-2 py-0.5 bg-primary/20 text-primary border-0 font-medium">NEW</Badge>;
  }
  const delta = previous - current;
  if (delta > 0) return <span className="flex items-center gap-0.5 text-[hsl(var(--status-success))] text-xs font-semibold"><TrendingUp className="h-3.5 w-3.5" />+{delta}</span>;
  if (delta < 0) return <span className="flex items-center gap-0.5 text-[hsl(var(--status-error))] text-xs font-semibold"><TrendingDown className="h-3.5 w-3.5" />{delta}</span>;
  return <span className="flex items-center gap-0.5 text-muted-foreground/60 text-xs"><Minus className="h-3 w-3" /></span>;
}

// ─── Podium Card ────────────────────────────────────────
function PodiumCard({ ranking, position, isCurrentUser }: { ranking: LeaderboardRanking; position: 1 | 2 | 3; isCurrentUser: boolean }) {
  const config = {
    1: {
      container: "order-2 z-20 -mt-6",
      card: "min-h-[330px] bg-gradient-to-b from-primary/15 via-card to-card border-2 border-primary/40 shadow-[0_0_60px_-10px_hsl(var(--primary)/0.4)]",
      avatar: "w-28 h-28 ring-4 ring-primary shadow-[0_0_30px_-5px_hsl(var(--primary)/0.5)]",
      avatarBg: "bg-gradient-to-br from-primary/30 to-primary/10 text-primary",
      icon: Crown, iconColor: "text-primary", iconBg: "bg-primary/20 border border-primary/30",
      salesSize: "text-4xl", badge: "bg-primary text-primary-foreground", glow: true,
    },
    2: {
      container: "order-1 z-10",
      card: "min-h-[280px] bg-gradient-to-b from-muted/60 via-card to-card border border-muted-foreground/30",
      avatar: "w-24 h-24 ring-4 ring-muted-foreground/40",
      avatarBg: "bg-gradient-to-br from-muted-foreground/20 to-muted text-muted-foreground",
      icon: Medal, iconColor: "text-muted-foreground", iconBg: "bg-muted-foreground/20 border border-muted-foreground/20",
      salesSize: "text-2xl", badge: "bg-muted-foreground/20 text-muted-foreground", glow: false,
    },
    3: {
      container: "order-3 z-10",
      card: "min-h-[260px] bg-gradient-to-b from-[hsl(25,80%,55%)]/15 via-card to-card border border-[hsl(25,80%,55%)]/40",
      avatar: "w-24 h-24 ring-4 ring-[hsl(25,80%,55%)]/40",
      avatarBg: "bg-gradient-to-br from-[hsl(25,80%,55%)]/30 to-[hsl(25,80%,55%)]/10 text-[hsl(25,80%,55%)]",
      icon: Award, iconColor: "text-[hsl(25,80%,55%)]", iconBg: "bg-[hsl(25,80%,55%)]/20 border border-[hsl(25,80%,55%)]/30",
      salesSize: "text-2xl", badge: "bg-[hsl(25,80%,55%)]/20 text-[hsl(25,80%,55%)]", glow: false,
    },
  }[position];

  const IconComponent = config.icon;

  return (
    <div className={cn("flex flex-col items-center w-full max-w-[210px] group", config.container)}>
      <div className="relative">
        <div className={cn("absolute -top-3 left-1/2 -translate-x-1/2 z-30 px-4 py-1.5 rounded-full font-bold text-sm shadow-lg", config.badge)}>
          #{position}
        </div>
        <div className={cn(
          "rounded-2xl p-6 flex flex-col items-center justify-between w-full backdrop-blur-sm transition-all duration-300 group-hover:shadow-xl group-hover:-translate-y-1",
          config.card,
          isCurrentUser && "ring-2 ring-primary ring-offset-2 ring-offset-background"
        )}>
          <div className={cn("rounded-full p-2.5 mb-4", config.iconBg)}>
            <IconComponent className={cn("h-5 w-5", config.iconColor)} />
          </div>
          <Avatar className={cn(config.avatar, "mb-4 transition-transform group-hover:scale-105")}>
            {ranking.avatar_url && <AvatarImage src={ranking.avatar_url} alt={ranking.salesperson_name} />}
            <AvatarFallback className={cn("text-2xl font-bold", config.avatarBg)}>
              {getInitials(ranking.salesperson_name)}
            </AvatarFallback>
          </Avatar>
          <h3 className={cn("font-semibold text-base mb-1 text-center truncate w-full", isCurrentUser && "text-primary")}>
            {ranking.salesperson_name}
          </h3>
          {isCurrentUser && <span className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-3">You</span>}
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
          {position === 1 && (
            <div className="mt-5 pt-4 border-t border-primary/20 w-full">
              <CountdownTimer />
            </div>
          )}
        </div>
        {config.glow && <div className="absolute inset-0 -z-10 bg-gradient-to-b from-primary/20 to-transparent rounded-2xl blur-2xl scale-110 opacity-60" />}
      </div>
    </div>
  );
}

function CountdownTimer() {
  const [, setTick] = useState(0);
  useEffect(() => { const interval = setInterval(() => setTick(t => t + 1), 1000); return () => clearInterval(interval); }, []);

  const now = new Date();
  const endDate = endOfMonth(now);
  const days = differenceInDays(endDate, now);
  const hours = differenceInHours(endDate, now) % 24;
  const minutes = differenceInMinutes(endDate, now) % 60;
  const seconds = differenceInSeconds(endDate, now) % 60;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Timer className="h-3.5 w-3.5" />
        <span className="text-[10px] uppercase tracking-wider font-medium">Resets in</span>
      </div>
      <div className="flex items-center gap-1">
        {[{ v: days, l: 'D' }, { v: hours, l: 'H' }, { v: minutes, l: 'M' }, { v: seconds, l: 'S' }].map((u, i) => (
          <div key={u.l} className="flex items-center gap-1">
            {i > 0 && <span className="text-muted-foreground/50 font-light">:</span>}
            <div className="flex flex-col items-center">
              <span className="text-lg font-bold tabular-nums text-foreground leading-none">{String(u.v).padStart(2, '0')}</span>
              <span className="text-[8px] text-muted-foreground uppercase">{u.l}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Achievement Strip ────────────────────────────────────────
function AchievementStrip({ rankings }: { rankings: LeaderboardRanking[] }) {
  if (rankings.length === 0) return null;

  const topSales = rankings[0];
  const topDelivered = [...rankings].sort((a, b) => b.delivered_orders - a.delivered_orders)[0];
  const topSuccess = [...rankings].filter(r => r.delivered_orders > 0).sort((a, b) => b.success_rate - a.success_rate)[0];

  const awards = [
    { title: "Top Performer", user: topSales, icon: <Crown className="h-4 w-4" />, variant: "from-primary/20 to-primary/5 border-primary/30" },
    { title: "Delivery Champion", user: topDelivered, icon: <Target className="h-4 w-4" />, variant: "from-[hsl(var(--status-success))]/20 to-[hsl(var(--status-success))]/5 border-[hsl(var(--status-success))]/30" },
    { title: "Best Success Rate", user: topSuccess, icon: <Zap className="h-4 w-4" />, variant: "from-[hsl(25,80%,55%)]/20 to-[hsl(25,80%,55%)]/5 border-[hsl(25,80%,55%)]/30" },
  ].filter(a => a.user);

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
        <Award className="h-4 w-4 text-primary" /> Current Achievements
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {awards.map((award) => (
          <div key={award.title} className={cn("flex items-center gap-3 p-3 rounded-xl border bg-gradient-to-br transition-all hover:shadow-md", award.variant)}>
            <div className="p-2 rounded-lg bg-card shadow-sm">{award.icon}</div>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground font-medium">{award.title}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <Avatar className="h-5 w-5">
                  {award.user!.avatar_url && <AvatarImage src={award.user!.avatar_url} />}
                  <AvatarFallback className="text-[10px] bg-muted">{getInitials(award.user!.salesperson_name)}</AvatarFallback>
                </Avatar>
                <p className="font-semibold truncate text-sm">{award.user!.salesperson_name}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Personal Rank Panel ────────────────────────────────────────
function PersonalRankPanel({ myRanking, rankings, previousRanking }: {
  myRanking: LeaderboardRanking;
  rankings: LeaderboardRanking[];
  previousRanking: LeaderboardRanking | null;
}) {
  const nextRank = rankings.find(r => r.rank_position === myRanking.rank_position - 1);
  const salesGap = nextRank ? nextRank.net_sales - myRanking.net_sales : 0;
  const deliveryGap = nextRank ? nextRank.delivered_orders - myRanking.delivered_orders : 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/10 via-card to-primary/10 p-5 shadow-lg">
      <div className="absolute top-0 left-0 w-20 h-20 bg-primary/10 rounded-full -translate-x-1/2 -translate-y-1/2 blur-2xl" />
      <div className="absolute bottom-0 right-0 w-20 h-20 bg-primary/10 rounded-full translate-x-1/2 translate-y-1/2 blur-2xl" />

      <div className="relative space-y-4">
        {/* Top row: rank + sales */}
        <div className="flex flex-col md:flex-row items-center justify-center gap-3 md:gap-6 text-center md:text-left">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="text-sm text-muted-foreground">Your Rank</span>
            <span className="flex items-center gap-2 bg-muted/50 px-3 py-1 rounded-full">
              <span className="font-bold text-xl text-foreground">#{myRanking.rank_position}</span>
              <RankDelta current={myRanking.rank_position} previous={previousRanking?.rank_position ?? null} />
            </span>
            <span className="text-sm text-muted-foreground">of <span className="font-semibold text-foreground">{rankings.length}</span></span>
          </div>
          <div className="hidden md:block w-px h-8 bg-border" />
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Earned</span>
            <span className="flex items-center gap-1.5 bg-primary/20 px-3 py-1 rounded-full">
              <Flame className="h-4 w-4 text-primary" />
              <span className="font-bold text-primary">{formatBND(myRanking.net_sales).replace('BND ', '')}</span>
            </span>
          </div>
        </div>

        {/* Gap to next rank */}
        {nextRank && myRanking.rank_position > 1 && (
          <div className="flex items-center justify-center gap-3 p-3 rounded-xl bg-card/80 border border-border/50">
            <ChevronUp className="h-5 w-5 text-primary animate-bounce" />
            <div className="text-sm text-center">
              <span className="text-muted-foreground">Gap to </span>
              <span className="font-semibold">#{myRanking.rank_position - 1}</span>
              <span className="text-muted-foreground"> — </span>
              {salesGap > 0 && <span className="font-semibold text-primary">{formatBND(salesGap)}</span>}
              {deliveryGap > 0 && <span className="text-muted-foreground"> ({deliveryGap} more deliveries)</span>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Insight Cards ────────────────────────────────────────
function InsightCards({ rankings }: { rankings: LeaderboardRanking[] }) {
  const totalSales = rankings.reduce((s, r) => s + r.net_sales, 0);
  const avgSales = rankings.length > 0 ? totalSales / rankings.length : 0;
  const avgSuccess = rankings.length > 0 ? rankings.reduce((s, r) => s + r.success_rate, 0) / rankings.length : 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {[
        { label: "Participants", value: rankings.length, icon: <Users className="h-4 w-4" /> },
        { label: "Total Sales", value: formatBND(totalSales), icon: <Flame className="h-4 w-4" /> },
        { label: "Avg Sales", value: formatBND(avgSales), icon: <Target className="h-4 w-4" /> },
        { label: "Avg Success", value: `${avgSuccess.toFixed(0)}%`, icon: <Zap className="h-4 w-4" /> },
      ].map(item => (
        <Card key={item.label} className="border-border/50">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10 text-primary">{item.icon}</div>
            <div>
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="font-bold text-lg">{typeof item.value === 'number' ? <AnimatedCounter value={item.value} /> : item.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Table ────────────────────────────────────────
function LeaderboardTable({ rankings, currentUserId }: { rankings: LeaderboardRanking[]; currentUserId: string | undefined }) {
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
          {rankings.map((ranking) => {
            const isCurrentUser = ranking.salesperson_id === currentUserId;
            const isTopThree = ranking.rank_position <= 3;
            return (
              <TableRow
                key={ranking.salesperson_id}
                className={cn(
                  "border-border/20 transition-all duration-200",
                  isCurrentUser ? "bg-primary/10 hover:bg-primary/15 border-l-4 border-l-primary" : "hover:bg-muted/20",
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
                      {ranking.avatar_url && <AvatarImage src={ranking.avatar_url} alt={ranking.salesperson_name} />}
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
                      <p className={cn("font-medium", isCurrentUser && "text-primary")}>{ranking.salesperson_name}</p>
                      {isCurrentUser && <span className="text-[10px] text-primary/70 uppercase tracking-wider font-medium">You</span>}
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums py-4 font-medium">{ranking.delivered_orders}</TableCell>
                <TableCell className="text-right tabular-nums py-4">
                  <Badge variant="outline" className={cn(
                    "font-medium border-0",
                    ranking.success_rate >= 80 && "bg-[hsl(var(--status-success))]/20 text-[hsl(var(--status-success))]",
                    ranking.success_rate >= 50 && ranking.success_rate < 80 && "bg-[hsl(var(--status-pending))]/20 text-[hsl(var(--status-pending))]",
                    ranking.success_rate < 50 && "bg-muted text-muted-foreground"
                  )}>
                    {ranking.success_rate}%
                  </Badge>
                </TableCell>
                <TableCell className="text-right py-4">
                  <div className="flex items-center justify-end gap-1.5">
                    <Flame className="h-4 w-4 text-primary" />
                    <span className="font-bold tabular-nums text-base">{formatBND(ranking.net_sales).replace('BND ', '')}</span>
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

// ─── Main Page ────────────────────────────────────────
export default function LeaderboardPage() {
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const { profile } = useAuth();
  const { data: settings } = useLeaderboardSettings();
  const { rankings, top3Rankings, lastUpdated, isLoading, isFetching, hasDeliveredOrders } = useVisibleRankings(periodMode);
  const myRanking = useMyRanking(periodMode);
  const previousRanking = usePreviousPeriodRanking(periodMode);

  const allZeros = rankings.length > 0 && rankings.every(r => r.net_sales === 0 && r.delivered_orders === 0);

  const currentMonth = format(new Date(), 'MMMM yyyy');

  return (
    <AppLayout>
      <div className="space-y-8 max-w-6xl mx-auto">
        {/* Hero */}
        <PageHero
          icon={<Trophy className="h-6 w-6 text-primary" />}
          title="Performance Arena"
          subtitle="Compete. Deliver. Rise to the top."
          image={capybaraSales}
          imageAlt="Champion Capybara"
          actions={
            <div className="flex items-center gap-3">
              <div className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium",
                isFetching
                  ? "bg-[hsl(var(--status-pending))]/20 text-[hsl(var(--status-pending))]"
                  : "bg-[hsl(var(--status-success))]/20 text-[hsl(var(--status-success))]"
              )}>
                <span className={cn("w-2 h-2 rounded-full", isFetching ? "bg-[hsl(var(--status-pending))] animate-pulse" : "bg-[hsl(var(--status-success))]")} />
                Live
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">{format(lastUpdated, 'HH:mm:ss')}</span>
              {isFetching && <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
          }
        />

        {/* Time Filters */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <div className="flex rounded-full border border-border/50 bg-card/80 backdrop-blur-sm p-1 shadow-sm">
            {([
              { value: 'today', label: 'Today' },
              { value: 'week', label: 'This Week' },
              { value: 'month', label: 'This Month' },
            ] as const).map(tab => (
              <Button
                key={tab.value}
                variant={periodMode === tab.value ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setPeriodMode(tab.value)}
                className={cn(
                  "rounded-full text-xs px-4 transition-all",
                  periodMode === tab.value && "bg-primary text-primary-foreground shadow-md"
                )}
              >
                {tab.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Warning */}
        {allZeros && rankings.length > 0 && (
          <Alert variant="destructive" className="rounded-xl">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>No delivered orders matched for this period. Verify order data or check filters.</AlertDescription>
          </Alert>
        )}

        {/* Loading */}
        {isLoading && <CapybaraState type="loading" title="Loading rankings..." description="Our capybara is tallying up the scores" />}

        {!isLoading && rankings.length === 0 && (
          <CapybaraState type="empty" title="No rankings yet" description="Start delivering orders to climb the leaderboard!" />
        )}

        {!isLoading && rankings.length > 0 && (
          <div className="space-y-8">
            {/* Podium */}
            {top3Rankings.length >= 3 ? (
              <div className="flex justify-center items-end gap-3 md:gap-6 py-6">
                <PodiumCard ranking={top3Rankings[1]} position={2} isCurrentUser={top3Rankings[1].salesperson_id === profile?.id} />
                <PodiumCard ranking={top3Rankings[0]} position={1} isCurrentUser={top3Rankings[0].salesperson_id === profile?.id} />
                <PodiumCard ranking={top3Rankings[2]} position={3} isCurrentUser={top3Rankings[2].salesperson_id === profile?.id} />
              </div>
            ) : top3Rankings.length > 0 && (
              <div className="flex justify-center items-end gap-3 md:gap-6 py-6">
                {top3Rankings.map((r, i) => (
                  <PodiumCard key={r.salesperson_id} ranking={r} position={(i + 1) as 1 | 2 | 3} isCurrentUser={r.salesperson_id === profile?.id} />
                ))}
              </div>
            )}

            {/* Achievement Strip */}
            <AchievementStrip rankings={rankings} />

            {/* Personal Rank Panel */}
            {(profile?.role === 'salesperson' || profile?.role === 'manager') && myRanking && (
              <PersonalRankPanel myRanking={myRanking} rankings={rankings} previousRanking={previousRanking} />
            )}

            {/* Insight Cards */}
            <InsightCards rankings={rankings} />

            {/* Full Rankings Table */}
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
              <LeaderboardTable rankings={rankings} currentUserId={profile?.id} />
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
