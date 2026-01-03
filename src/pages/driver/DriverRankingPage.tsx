import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useMyDriverRanking, useIsRankingVisible, useTeamRankingForDriver } from '@/hooks/useDriverRanking';
import { Trophy, Medal, Award, Lock } from 'lucide-react';

export default function DriverRankingPage() {
  const { data: myRanking, isLoading: loadingMyRanking } = useMyDriverRanking();
  const { data: isVisible, isLoading: loadingVisibility } = useIsRankingVisible();
  const { data: teamRanking, isLoading: loadingTeam } = useTeamRankingForDriver();

  const isLoading = loadingMyRanking || loadingVisibility || loadingTeam;

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Trophy className="h-5 w-5 text-yellow-500" />;
      case 2:
        return <Medal className="h-5 w-5 text-gray-400" />;
      case 3:
        return <Award className="h-5 w-5 text-amber-600" />;
      default:
        return <span className="text-muted-foreground font-medium">#{rank}</span>;
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="text-center py-12 text-muted-foreground">Loading ranking...</div>
      </div>
    );
  }

  if (!isVisible) {
    return (
      <div className="container mx-auto py-6 max-w-2xl">
        <Card>
          <CardContent className="py-12 text-center">
            <Lock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Ranking Not Available</h2>
            <p className="text-muted-foreground">
              Your runner has not enabled ranking visibility for drivers.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const currentMonthTeam = teamRanking?.filter(r => {
    const rankMonth = new Date(r.month).getMonth();
    const currentMonth = new Date().getMonth();
    return rankMonth === currentMonth;
  }) || [];

  return (
    <div className="container mx-auto py-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Trophy className="h-6 w-6" />
          My Ranking
        </h1>
        <p className="text-muted-foreground">Your delivery performance this month</p>
      </div>

      {/* My Stats */}
      {myRanking ? (
        <Card className="bg-gradient-to-r from-primary/5 to-primary/10">
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardDescription>Your Current Rank</CardDescription>
                <CardTitle className="text-4xl flex items-center gap-2">
                  {getRankIcon(myRanking.rank_in_team)}
                  <span className="ml-2">#{myRanking.rank_in_team}</span>
                </CardTitle>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Deliveries</p>
                <p className="text-2xl font-bold text-green-600">{myRanking.delivered_count}</p>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-sm text-muted-foreground">Total Amount</p>
                <p className="font-semibold">RM {myRanking.total_amount?.toLocaleString() || '0'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Failed</p>
                <p className="font-semibold text-red-600">{myRanking.failed_count}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Success Rate</p>
                <p className="font-semibold">
                  {myRanking.delivered_count + myRanking.failed_count > 0
                    ? Math.round((myRanking.delivered_count / (myRanking.delivered_count + myRanking.failed_count)) * 100)
                    : 0}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            No delivery data for this month yet. Start delivering to see your ranking!
          </CardContent>
        </Card>
      )}

      {/* Team Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Team Leaderboard</CardTitle>
          <CardDescription>
            {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {currentMonthTeam.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No team data available
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Rank</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead className="text-right">Delivered</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {currentMonthTeam
                  .sort((a, b) => a.rank_in_team - b.rank_in_team)
                  .map(ranking => (
                    <TableRow 
                      key={ranking.driver_id}
                      className={myRanking?.driver_id === ranking.driver_id ? 'bg-primary/5' : ''}
                    >
                      <TableCell>
                        <div className="flex items-center justify-center">
                          {getRankIcon(ranking.rank_in_team)}
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        {ranking.driver_name}
                        {myRanking?.driver_id === ranking.driver_id && (
                          <Badge variant="outline" className="ml-2">You</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline" className="bg-green-50 text-green-700">
                          {ranking.delivered_count}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
