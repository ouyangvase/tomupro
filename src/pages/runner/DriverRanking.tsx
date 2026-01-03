import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/AuthContext';
import { useRunnerDriverRanking, useFeatureSetting, useToggleFeatureSetting } from '@/hooks/useDriverRanking';
import { Trophy, Medal, Award } from 'lucide-react';

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

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="h-5 w-5 text-yellow-500" />;
      case 2:
        return <Medal className="h-5 w-5 text-gray-400" />;
      case 3:
        return <Award className="h-5 w-5 text-amber-600" />;
      default:
        return <span className="text-muted-foreground">#{rank}</span>;
    }
  };

  const currentMonthRankings = rankings?.filter(r => {
    const rankMonth = new Date(r.month).getMonth();
    const currentMonth = new Date().getMonth();
    return rankMonth === currentMonth;
  }) || [];

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="h-6 w-6" />
            Driver Ranking
          </h1>
          <p className="text-muted-foreground">Monthly delivery performance leaderboard</p>
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
            <Label htmlFor="ranking-visible">
              Allow drivers to view ranking
            </Label>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {isRankingVisible 
              ? 'Drivers can see their rank and the team leaderboard'
              : 'Ranking is hidden from drivers'}
          </p>
        </CardContent>
      </Card>

      {/* Current Month Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })} Leaderboard
          </CardTitle>
          <CardDescription>Driver performance this month</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading...</div>
          ) : currentMonthRankings.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No delivery data for this month yet
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rank</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                  <TableHead className="text-right">Failed</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead className="text-right">Success Rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentMonthRankings
                  .sort((a, b) => a.rank_in_team - b.rank_in_team)
                  .map(ranking => {
                    const total = ranking.delivered_count + ranking.failed_count;
                    const successRate = total > 0 
                      ? Math.round((ranking.delivered_count / total) * 100)
                      : 0;
                    
                    return (
                      <TableRow key={ranking.driver_id}>
                        <TableCell className="font-medium">
                          <div className="flex items-center justify-center">
                            {getRankIcon(ranking.rank_in_team)}
                          </div>
                        </TableCell>
                        <TableCell className="font-medium">{ranking.driver_name}</TableCell>
                        <TableCell className="text-right">
                          <Badge variant="outline" className="bg-green-50 text-green-700">
                            {ranking.delivered_count}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {ranking.failed_count > 0 ? (
                            <Badge variant="outline" className="bg-red-50 text-red-700">
                              {ranking.failed_count}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          RM {ranking.total_amount?.toLocaleString() || '0'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={successRate >= 90 ? 'default' : 'secondary'}>
                            {successRate}%
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
  );
}
