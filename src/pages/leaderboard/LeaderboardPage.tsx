import { useState } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Trophy, Medal, TrendingUp, TrendingDown, Minus, Crown, Star, User } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useVisibleRankings, useMyRanking, usePreviousPeriodRanking, useLeaderboardSettings, PeriodMode, LeaderboardRanking } from "@/hooks/useLeaderboard";
import { formatBND } from "@/lib/currency";
import { cn } from "@/lib/utils";

function getRankIcon(rank: number) {
  switch (rank) {
    case 1:
      return <Crown className="h-5 w-5 text-yellow-500" />;
    case 2:
      return <Medal className="h-5 w-5 text-gray-400" />;
    case 3:
      return <Medal className="h-5 w-5 text-amber-600" />;
    default:
      return <span className="text-muted-foreground font-medium">#{rank}</span>;
  }
}

function RankDelta({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) {
    return <Badge variant="outline" className="text-xs">New</Badge>;
  }
  
  const delta = previous - current;
  
  if (delta > 0) {
    return (
      <span className="flex items-center gap-1 text-green-600 text-xs">
        <TrendingUp className="h-3 w-3" />
        +{delta}
      </span>
    );
  }
  
  if (delta < 0) {
    return (
      <span className="flex items-center gap-1 text-red-600 text-xs">
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

function LeaderboardRow({ 
  ranking, 
  isCurrentUser, 
  primaryMetric 
}: { 
  ranking: LeaderboardRanking; 
  isCurrentUser: boolean;
  primaryMetric: string;
}) {
  const getPrimaryValue = () => {
    switch (primaryMetric) {
      case 'net_sales':
        return formatBND(ranking.net_sales);
      case 'completed_orders':
        return `${ranking.completed_orders} orders`;
      case 'delivered_orders':
        return `${ranking.delivered_orders} delivered`;
      case 'conversion_score':
        return `${ranking.conversion_score}%`;
      case 'success_rate':
        return `${ranking.success_rate}%`;
      default:
        return formatBND(ranking.net_sales);
    }
  };

  return (
    <div 
      className={cn(
        "flex items-center justify-between p-3 rounded-lg border transition-colors",
        isCurrentUser 
          ? "bg-primary/10 border-primary/30" 
          : "bg-card hover:bg-muted/50",
        ranking.rank_position <= 3 && "border-l-4",
        ranking.rank_position === 1 && "border-l-yellow-500",
        ranking.rank_position === 2 && "border-l-gray-400",
        ranking.rank_position === 3 && "border-l-amber-600"
      )}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 flex justify-center">
          {getRankIcon(ranking.rank_position)}
        </div>
        <div>
          <p className={cn(
            "font-medium",
            isCurrentUser && "text-primary"
          )}>
            {ranking.salesperson_name}
            {isCurrentUser && <span className="ml-2 text-xs text-muted-foreground">(You)</span>}
          </p>
          <div className="flex gap-2 text-xs text-muted-foreground">
            <span>{ranking.completed_orders} completed</span>
            <span>•</span>
            <span>{ranking.delivered_orders} delivered</span>
          </div>
        </div>
      </div>
      <div className="text-right">
        <p className="font-semibold">{getPrimaryValue()}</p>
        <p className="text-xs text-muted-foreground">
          {ranking.success_rate}% success
        </p>
      </div>
    </div>
  );
}

function TopThreeCard({ ranking, position }: { ranking: LeaderboardRanking; position: 1 | 2 | 3 }) {
  const heightClass = position === 1 ? "h-28" : position === 2 ? "h-24" : "h-20";
  const bgClass = position === 1 
    ? "bg-gradient-to-b from-yellow-500/20 to-yellow-500/5 border-yellow-500/30" 
    : position === 2 
      ? "bg-gradient-to-b from-gray-400/20 to-gray-400/5 border-gray-400/30"
      : "bg-gradient-to-b from-amber-600/20 to-amber-600/5 border-amber-600/30";

  return (
    <div className={cn(
      "flex flex-col items-center justify-end rounded-lg border p-3",
      heightClass,
      bgClass
    )}>
      <div className="mb-1">
        {position === 1 && <Crown className="h-6 w-6 text-yellow-500" />}
        {position === 2 && <Medal className="h-5 w-5 text-gray-400" />}
        {position === 3 && <Medal className="h-5 w-5 text-amber-600" />}
      </div>
      <p className="font-medium text-sm text-center truncate max-w-full">
        {ranking.salesperson_name}
      </p>
      <p className="text-xs text-muted-foreground">
        {formatBND(ranking.net_sales)}
      </p>
    </div>
  );
}

export default function LeaderboardPage() {
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month');
  const { profile } = useAuth();
  const { data: settings } = useLeaderboardSettings();
  const rankings = useVisibleRankings(periodMode);
  const myRanking = useMyRanking(periodMode);
  const previousRanking = usePreviousPeriodRanking(periodMode);
  
  const primaryMetric = settings?.primary_metric || 'net_sales';
  const top3 = rankings.slice(0, 3);
  const restRankings = rankings.slice(3);
  
  const getPeriodLabel = () => {
    switch (periodMode) {
      case 'today': return 'Today';
      case 'week': return 'This Week';
      case 'month': return 'This Month';
      default: return 'This Month';
    }
  };

  return (
    <AppLayout>
      <div className="space-y-6">
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
        </div>

        {/* My Rank Summary */}
        {profile?.role === 'salesperson' && myRanking && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <User className="h-5 w-5 text-primary" />
                    <span className="font-medium">Your Rank</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl font-bold text-primary">
                      #{myRanking.rank_position}
                    </span>
                    <RankDelta 
                      current={myRanking.rank_position} 
                      previous={previousRanking?.rank_position ?? null} 
                    />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-lg font-semibold">{formatBND(myRanking.net_sales)}</p>
                  <p className="text-sm text-muted-foreground">
                    {myRanking.completed_orders} completed orders
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Period Tabs */}
        <Tabs value={periodMode} onValueChange={(v) => setPeriodMode(v as PeriodMode)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="week">This Week</TabsTrigger>
            <TabsTrigger value="month">This Month</TabsTrigger>
          </TabsList>
          
          <TabsContent value={periodMode} className="mt-4 space-y-4">
            {/* Top 3 Podium */}
            {top3.length >= 3 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Star className="h-5 w-5 text-yellow-500" />
                    Top Performers - {getPeriodLabel()}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2 items-end">
                    {/* 2nd place */}
                    <TopThreeCard ranking={top3[1]} position={2} />
                    {/* 1st place */}
                    <TopThreeCard ranking={top3[0]} position={1} />
                    {/* 3rd place */}
                    <TopThreeCard ranking={top3[2]} position={3} />
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Full Rankings */}
            <Card>
              <CardHeader>
                <CardTitle>Full Rankings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {rankings.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">
                    No rankings available for this period
                  </p>
                ) : (
                  rankings.map((ranking) => (
                    <LeaderboardRow
                      key={ranking.salesperson_id}
                      ranking={ranking}
                      isCurrentUser={ranking.salesperson_id === profile?.id}
                      primaryMetric={primaryMetric}
                    />
                  ))
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
