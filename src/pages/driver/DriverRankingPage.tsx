import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useMyDriverRanking, useIsRankingVisible, useTeamRankingForDriver } from '@/hooks/useDriverRanking';
import { AppLayout } from '@/components/layout/AppLayout';
import { PageHero } from '@/components/dashboard/PageHero';
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter';
import { CapybaraState } from '@/components/dashboard/CapybaraState';
import { Trophy, Medal, Award, Lock, Crown, Flame, Target, ChevronUp, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import capybaraDriver from '@/assets/capybara-driver.png';

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function DriverRankingPage() {
  const { data: myRanking, isLoading: loadingMyRanking } = useMyDriverRanking();
  const { data: isVisible, isLoading: loadingVisibility } = useIsRankingVisible();
  const { data: teamRanking, isLoading: loadingTeam } = useTeamRankingForDriver();

  const isLoading = loadingMyRanking || loadingVisibility || loadingTeam;

  if (isLoading) {
    return (
      <AppLayout>
        <CapybaraState type="loading" title="Loading ranking..." description="Our capybara is tallying the scores" />
      </AppLayout>
    );
  }

  if (!isVisible) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardContent className="py-12 text-center">
              <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">Ranking Not Available</h2>
              <p className="text-muted-foreground">Your runner has not enabled ranking visibility for drivers.</p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const currentMonthTeam = teamRanking?.filter(r => {
    const rankMonth = new Date(r.month).getMonth();
    const currentMonth = new Date().getMonth();
    return rankMonth === currentMonth;
  }) || [];

  const topThree = currentMonthTeam.sort((a, b) => a.rank_in_team - b.rank_in_team).slice(0, 3);
  const successRate = myRanking && (myRanking.delivered_count + myRanking.failed_count) > 0
    ? Math.round((myRanking.delivered_count / (myRanking.delivered_count + myRanking.failed_count)) * 100) : 0;

  // Gap to next rank
  const nextRankDriver = myRanking ? currentMonthTeam.find(r => r.rank_in_team === myRanking.rank_in_team - 1) : null;
  const deliveryGap = nextRankDriver ? nextRankDriver.delivered_count - (myRanking?.delivered_count || 0) : 0;

  return (
    <AppLayout>
      <div className="space-y-6 max-w-3xl mx-auto">
        {/* Hero */}
        <PageHero
          icon={<Trophy className="h-6 w-6 text-primary" />}
          title="Driver Rankings"
          subtitle="Your delivery performance this month"
          image={capybaraDriver}
          imageAlt="Delivery Capybara"
        />

        {/* My Stats Card */}
        {myRanking ? (
          <Card className="overflow-hidden border-primary/20">
            <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-5">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-muted-foreground font-medium">Your Current Rank</p>
                  <div className="flex items-center gap-3 mt-1">
                    {myRanking.rank_in_team <= 3 ? (
                      myRanking.rank_in_team === 1 ? <Crown className="h-8 w-8 text-primary" /> :
                      myRanking.rank_in_team === 2 ? <Medal className="h-8 w-8 text-muted-foreground" /> :
                      <Award className="h-8 w-8 text-[hsl(25,80%,55%)]" />
                    ) : null}
                    <span className="text-5xl font-extrabold text-primary">#{myRanking.rank_in_team}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Deliveries</p>
                  <p className="text-3xl font-bold text-[hsl(var(--status-success))]">
                    <AnimatedCounter value={myRanking.delivered_count} />
                  </p>
                </div>
              </div>
            </div>
            <CardContent className="p-5">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
                  <p className="text-xs text-muted-foreground">Total Amount</p>
                  <p className="font-bold text-lg">BND {myRanking.total_amount?.toLocaleString() || '0'}</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
                  <p className="text-xs text-muted-foreground">Failed</p>
                  <p className="font-bold text-lg text-[hsl(var(--status-error))]">{myRanking.failed_count}</p>
                </div>
                <div className="p-3 rounded-xl bg-muted/30 border border-border/30">
                  <p className="text-xs text-muted-foreground">Success Rate</p>
                  <p className="font-bold text-lg">{successRate}%</p>
                </div>
              </div>

              {/* Gap to next rank */}
              {nextRankDriver && myRanking.rank_in_team > 1 && deliveryGap > 0 && (
                <div className="mt-4 flex items-center justify-center gap-2 p-3 rounded-xl bg-primary/5 border border-primary/20">
                  <ChevronUp className="h-5 w-5 text-primary animate-bounce" />
                  <span className="text-sm">
                    <span className="font-semibold text-primary">{deliveryGap} more</span>
                    <span className="text-muted-foreground"> deliveries to reach </span>
                    <span className="font-semibold">#{myRanking.rank_in_team - 1}</span>
                  </span>
                </div>
              )}
            </CardContent>
          </Card>
        ) : (
          <CapybaraState type="empty" title="No data yet" description="Start delivering to see your ranking!" />
        )}

        {/* Team Podium (top 3) */}
        {topThree.length >= 3 && (
          <div className="flex justify-center items-end gap-3 py-4">
            {[topThree[1], topThree[0], topThree[2]].map((driver, idx) => {
              const position = idx === 0 ? 2 : idx === 1 ? 1 : 3;
              const isMe = myRanking?.driver_id === driver.driver_id;
              const avatarSize = position === 1 ? 'h-16 w-16' : 'h-12 w-12';
              const podiumH = position === 1 ? 'h-28' : position === 2 ? 'h-20' : 'h-16';
              const ringColor = position === 1 ? 'ring-primary' : position === 2 ? 'ring-muted-foreground/40' : 'ring-[hsl(25,80%,55%)]/40';
              const bgColor = position === 1 ? 'bg-gradient-to-b from-primary/15 to-primary/5 border-primary/30' : position === 2 ? 'bg-gradient-to-b from-muted/50 to-muted/20 border-muted-foreground/30' : 'bg-gradient-to-b from-[hsl(25,80%,55%)]/15 to-[hsl(25,80%,55%)]/5 border-[hsl(25,80%,55%)]/30';
              const crownColor = position === 1 ? 'text-primary' : position === 2 ? 'text-muted-foreground' : 'text-[hsl(25,80%,55%)]';

              return (
                <div key={driver.driver_id} className={cn("flex flex-col items-center", position === 1 && "order-2", position === 2 && "order-1", position === 3 && "order-3")}>
                  <div className="relative mb-2">
                    <Crown className={cn("absolute -top-3 left-1/2 -translate-x-1/2 z-10 drop-shadow-md", crownColor, position === 1 ? "h-6 w-6" : "h-4 w-4")} fill="currentColor" />
                    <Avatar className={cn(avatarSize, "ring-4 border-4 border-background", ringColor)}>
                      <AvatarFallback className={cn("font-bold", position === 1 ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground")}>
                        {getInitials(driver.driver_name)}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                  <div className={cn("w-24 rounded-t-xl flex flex-col items-center pt-2 px-2 border-t-2 border-x-2", podiumH, bgColor)}>
                    <span className={cn("text-xl font-bold", crownColor)}>#{position}</span>
                    <p className="text-xs font-semibold truncate w-full text-center">{driver.driver_name}</p>
                    <p className="text-[10px] text-muted-foreground">{driver.delivered_count} del</p>
                    {isMe && <Badge variant="outline" className="text-[9px] mt-1 px-1.5">You</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Team Leaderboard Table */}
        <Card className="border-border/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              Team Leaderboard
            </CardTitle>
            <CardDescription>
              {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {currentMonthTeam.length === 0 ? (
              <CapybaraState type="empty" title="No team data" description="No rankings available for this month" />
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border/30 bg-muted/30 hover:bg-muted/30">
                    <TableHead className="w-16 text-xs uppercase">Rank</TableHead>
                    <TableHead className="text-xs uppercase">Driver</TableHead>
                    <TableHead className="text-right text-xs uppercase">Delivered</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {currentMonthTeam.map(ranking => {
                    const isMe = myRanking?.driver_id === ranking.driver_id;
                    return (
                      <TableRow
                        key={ranking.driver_id}
                        className={cn("transition-all", isMe ? "bg-primary/10 border-l-4 border-l-primary" : "hover:bg-muted/20")}
                      >
                        <TableCell>
                          <div className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold",
                            ranking.rank_in_team === 1 && "bg-primary/20 text-primary",
                            ranking.rank_in_team === 2 && "bg-muted text-muted-foreground",
                            ranking.rank_in_team === 3 && "bg-[hsl(25,80%,55%)]/20 text-[hsl(25,80%,55%)]",
                            ranking.rank_in_team > 3 && "bg-muted/50 text-muted-foreground"
                          )}>
                            {ranking.rank_in_team <= 3 ? (
                              ranking.rank_in_team === 1 ? <Crown className="h-4 w-4" /> :
                              ranking.rank_in_team === 2 ? <Medal className="h-4 w-4" /> :
                              <Award className="h-4 w-4" />
                            ) : ranking.rank_in_team}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                              <AvatarFallback className="text-xs bg-muted font-medium">
                                {getInitials(ranking.driver_name)}
                              </AvatarFallback>
                            </Avatar>
                            <span className={cn("font-medium", isMe && "text-primary")}>
                              {ranking.driver_name}
                            </span>
                            {isMe && <Badge variant="outline" className="text-[10px] px-1.5">You</Badge>}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className="bg-[hsl(var(--status-success))]/10 text-[hsl(var(--status-success))] border-0">
                            {ranking.delivered_count}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
