import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Trophy, TrendingUp, TrendingDown, Minus, Crown, Medal, ChevronRight, Radio, RefreshCw } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useVisibleRankings, useMyRanking, usePreviousPeriodRanking, useLeaderboardSettings } from "@/hooks/useLeaderboard";
import { formatBND } from "@/lib/currency";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

function getInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getRankIcon(rank: number, size: "sm" | "lg" = "sm") {
  const iconClass = size === "lg" ? "h-6 w-6" : "h-4 w-4";
  switch (rank) {
    case 1:
      return <Crown className={cn(iconClass, "text-yellow-500")} />;
    case 2:
      return <Medal className={cn(iconClass, "text-gray-400")} />;
    case 3:
      return <Medal className={cn(iconClass, "text-amber-600")} />;
    default:
      return null;
  }
}

function RankDelta({ current, previous }: { current: number; previous: number | null }) {
  if (previous === null) {
    return <Badge variant="outline" className="text-xs">New</Badge>;
  }
  
  const delta = previous - current;
  
  if (delta > 0) {
    return (
      <span className="flex items-center gap-1 text-green-600 text-sm">
        <TrendingUp className="h-4 w-4" />
        +{delta}
      </span>
    );
  }
  
  if (delta < 0) {
    return (
      <span className="flex items-center gap-1 text-red-600 text-sm">
        <TrendingDown className="h-4 w-4" />
        {delta}
      </span>
    );
  }
  
  return (
    <span className="flex items-center gap-1 text-muted-foreground text-sm">
      <Minus className="h-4 w-4" />
    </span>
  );
}

export function LeaderboardDashboardCard() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { data: settings } = useLeaderboardSettings();
  const { rankings, top3Rankings, lastUpdated, isFetching } = useVisibleRankings('month');
  const myRanking = useMyRanking('month');
  const previousRanking = usePreviousPeriodRanking('month');
  
  const isSalesperson = profile?.role === 'salesperson' || profile?.role === 'manager';

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="h-5 w-5 text-primary" />
            Sales Ranking
          </CardTitle>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => navigate('/leaderboard')}
          >
            View All
            <ChevronRight className="h-4 w-4 ml-1" />
          </Button>
        </div>
        {/* Live indicator */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Radio className={cn("h-2 w-2", isFetching ? "text-yellow-500 animate-pulse" : "text-green-500")} />
          <span>Live • {format(lastUpdated, 'HH:mm')}</span>
          {isFetching && <RefreshCw className="h-2 w-2 animate-spin" />}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* My Rank (for salesperson) */}
        {isSalesperson && myRanking && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">Your Rank</span>
              <div className="flex items-center gap-2">
                {getRankIcon(myRanking.rank_position, "lg")}
                <span className="text-2xl font-bold text-primary">
                  #{myRanking.rank_position}
                </span>
                <RankDelta 
                  current={myRanking.rank_position} 
                  previous={previousRanking?.rank_position ?? null} 
                />
              </div>
            </div>
            <div className="text-right">
              <p className="font-semibold">{formatBND(myRanking.net_sales)}</p>
              <p className="text-xs text-muted-foreground">
                {myRanking.delivered_orders} delivered
              </p>
            </div>
          </div>
        )}

        {/* Top 3 - Always shows actual top 3 regardless of visibility settings */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Top Performers</p>
          {top3Rankings.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">
              No rankings yet
            </p>
          ) : (
            top3Rankings.map((ranking, idx) => (
              <div 
                key={ranking.salesperson_id}
                className={cn(
                  "flex items-center justify-between p-2 rounded-lg border",
                  ranking.salesperson_id === profile?.id && "bg-primary/5 border-primary/20"
                )}
              >
                <div className="flex items-center gap-2">
                  <div className="w-6 flex justify-center">
                    {getRankIcon(idx + 1)}
                    {!getRankIcon(idx + 1) && (
                      <span className="text-sm text-muted-foreground">#{idx + 1}</span>
                    )}
                  </div>
                  <Avatar className="h-7 w-7">
                    {ranking.avatar_url && (
                      <AvatarImage src={ranking.avatar_url} alt={ranking.salesperson_name} />
                    )}
                    <AvatarFallback className="text-xs bg-muted">
                      {getInitials(ranking.salesperson_name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className={cn(
                    "text-sm",
                    ranking.salesperson_id === profile?.id && "font-medium text-primary"
                  )}>
                    {ranking.salesperson_name}
                    {ranking.salesperson_id === profile?.id && (
                      <span className="ml-1 text-xs text-muted-foreground">(You)</span>
                    )}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-sm font-medium">
                    {formatBND(ranking.net_sales)}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {ranking.delivered_orders} del
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
