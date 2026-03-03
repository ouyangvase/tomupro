import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useRunnerDriverRanking, useFeatureSetting, useToggleFeatureSetting, DriverRanking } from '@/hooks/useDriverRanking';
import { AppLayout } from '@/components/layout/AppLayout';
import { Trophy, Medal, Award, Crown, Flame, Sparkles } from 'lucide-react';
import { formatBND } from '@/lib/currency';
import { cn } from '@/lib/utils';

function getInitials(name: string) {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function RunnerLeaderboardTable({
  rankings,
}: {
  rankings: DriverRanking[];
}) {
  return (
    <div className="rounded-2xl border border-border/50 bg-card/50 backdrop-blur-sm overflow-hidden shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="border-border/30 bg-muted/30 hover:bg-muted/30">
            <TableHead className="w-[80px] text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Rank
            </TableHead>
            <TableHead className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Driver
            </TableHead>
            <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Delivered
            </TableHead>
            <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Failed
            </TableHead>
            <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Success
            </TableHead>
            <TableHead className="text-right text-xs uppercase tracking-wider text-muted-foreground font-semibold">
              Sales
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rankings.map(ranking => {
            const isTopThree = ranking.rank_in_team <= 3;
            const total = ranking.delivered_count + ranking.failed_count;
            const successRate = total > 0 ? Math.round((ranking.delivered_count / total) * 100) : 0;

            return (
              <TableRow
                key={ranking.driver_id}
                className={cn(
                  'border-border/20 transition-all duration-200 hover:bg-muted/20',
                  isTopThree && 'bg-muted/10'
                )}
              >
                <TableCell className="font-medium py-4">
                  <div
                    className={cn(
                      'w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold transition-transform hover:scale-110',
                      ranking.rank_in_team === 1 &&
                        'bg-gradient-to-br from-primary/30 to-primary/10 text-primary shadow-sm',
                      ranking.rank_in_team === 2 &&
                        'bg-gradient-to-br from-muted-foreground/30 to-muted text-muted-foreground',
                      ranking.rank_in_team === 3 &&
                        'bg-gradient-to-br from-[hsl(25,80%,55%)]/30 to-[hsl(25,80%,55%)]/10 text-[hsl(25,80%,55%)]',
                      ranking.rank_in_team > 3 && 'bg-muted/50 text-muted-foreground'
                    )}
                  >
                    {ranking.rank_in_team === 1 && <Crown className="h-4 w-4" />}
                    {ranking.rank_in_team === 2 && <Medal className="h-4 w-4" />}
                    {ranking.rank_in_team === 3 && <Award className="h-4 w-4" />}
                    {ranking.rank_in_team > 3 && ranking.rank_in_team}
                  </div>
                </TableCell>
                <TableCell className="py-4">
                  <div className="flex items-center gap-3">
                    <Avatar
                      className={cn(
                        'h-10 w-10 transition-transform hover:scale-105',
                        isTopThree && 'ring-2 ring-offset-1 ring-offset-background',
                        ranking.rank_in_team === 1 && 'ring-primary/50',
                        ranking.rank_in_team === 2 && 'ring-muted-foreground/30',
                        ranking.rank_in_team === 3 && 'ring-[hsl(25,80%,55%)]/30'
                      )}
                    >
                      {ranking.driver_avatar_url && (
                        <AvatarImage src={ranking.driver_avatar_url} alt={ranking.driver_name} />
                      )}
                      <AvatarFallback
                        className={cn(
                          'text-sm font-semibold',
                          ranking.rank_in_team === 1 && 'bg-primary/20 text-primary',
                          ranking.rank_in_team === 2 && 'bg-muted-foreground/20 text-muted-foreground',
                          ranking.rank_in_team === 3 && 'bg-[hsl(25,80%,55%)]/20 text-[hsl(25,80%,55%)]',
                          ranking.rank_in_team > 3 && 'bg-secondary text-secondary-foreground'
                        )}
                      >
                        {getInitials(ranking.driver_name)}
                      </AvatarFallback>
                    </Avatar>
                    <p className="font-medium">{ranking.driver_name}</p>
                  </div>
                </TableCell>
                <TableCell className="text-right tabular-nums py-4">
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-0">
                    {ranking.delivered_count}
                  </Badge>
                </TableCell>
                <TableCell className="text-right tabular-nums py-4">
                  {ranking.failed_count > 0 ? (
                    <Badge variant="outline" className="bg-red-50 text-red-700 border-0">
                      {ranking.failed_count}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">0</span>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums py-4">
                  <Badge
                    variant="outline"
                    className={cn(
                      'font-medium border-0',
                      successRate >= 80 && 'bg-[hsl(var(--status-success))]/20 text-[hsl(var(--status-success))]',
                      successRate >= 50 &&
                        successRate < 80 &&
                        'bg-[hsl(var(--status-pending))]/20 text-[hsl(var(--status-pending))]',
                      successRate < 50 && 'bg-muted text-muted-foreground'
                    )}
                  >
                    {successRate}%
                  </Badge>
                </TableCell>
                <TableCell className="text-right py-4">
                  <div className="flex items-center justify-end gap-1.5">
                    <Flame className="h-4 w-4 text-primary" />
                    <span className="font-bold tabular-nums text-base">
                      {formatBND(ranking.total_amount).replace('BND ', '')}
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

export default function DriverRanking() {
  const { profile } = useAuth();
  const { data: rankings, isLoading } = useRunnerDriverRanking(profile?.id);
  const { data: rankingSetting } = useFeatureSetting('driver_ranking_visible', 'RUNNER', profile?.id);
  const toggleSetting = useToggleFeatureSetting();

  const isRankingVisible = rankingSetting?.value_boolean ?? false;

  const handleToggleVisibility = () => {
    if (!profile) return;
    toggleSetting.mutate({
      settingKey: 'driver_ranking_visible',
      scopeType: 'RUNNER',
      scopeId: profile.id,
      value: !isRankingVisible,
    });
  };

  const currentMonthRankings =
    rankings?.filter(r => {
      const rankMonth = new Date(r.month).getMonth();
      const currentMonth = new Date().getMonth();
      return rankMonth === currentMonth;
    }) || [];

  const sortedRankings = [...currentMonthRankings].sort((a, b) => a.rank_in_team - b.rank_in_team);

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-primary/20 text-primary">
              <Trophy className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Driver Ranking</h1>
              <p className="text-sm text-muted-foreground">Monthly delivery performance leaderboard</p>
            </div>
          </div>
        </div>

        {/* Visibility Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Visibility Settings</CardTitle>
            <CardDescription>Control whether drivers can see the ranking leaderboard</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center space-x-2">
              <Switch
                id="ranking-visible"
                checked={isRankingVisible}
                onCheckedChange={handleToggleVisibility}
                disabled={toggleSetting.isPending}
              />
              <Label htmlFor="ranking-visible">Allow drivers to view ranking</Label>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              {isRankingVisible
                ? 'Drivers can see their rank and the team leaderboard'
                : 'Ranking is hidden from drivers'}
            </p>
          </CardContent>
        </Card>

        {/* Current Month Leaderboard */}
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })} Leaderboard
            </h2>
            {sortedRankings.length > 0 && (
              <Badge variant="outline" className="font-medium rounded-full px-3 py-1">
                {sortedRankings.length} drivers
              </Badge>
            )}
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                <Trophy className="absolute inset-0 m-auto h-6 w-6 text-primary" />
              </div>
              <p className="text-muted-foreground font-medium">Loading rankings...</p>
            </div>
          ) : sortedRankings.length === 0 ? (
            <div className="text-center py-20">
              <div className="w-20 h-20 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-6">
                <Trophy className="h-10 w-10 text-muted-foreground/40" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">No delivery data yet</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Driver rankings will appear here once deliveries are recorded this month.
              </p>
            </div>
          ) : (
            <RunnerLeaderboardTable rankings={sortedRankings} />
          )}
        </div>
      </div>
    </AppLayout>
  );
}
