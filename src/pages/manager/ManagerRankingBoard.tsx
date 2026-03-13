import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import {
  useManagerRankingData, useAllManagersForRanking,
  useToggleManagerRankingParticipant, useBulkUpdateManagerRankingParticipants,
  type RankingPeriod, type RankingMetric, type ManagerRankingData
} from '@/hooks/useManagerRanking';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { PageHero } from '@/components/dashboard/PageHero';
import { AnimatedCounter } from '@/components/dashboard/AnimatedCounter';
import { CapybaraState } from '@/components/dashboard/CapybaraState';
import {
  Trophy, TrendingUp, TrendingDown, Users, Crown, Medal, Settings, Search,
  Award, Target, Zap, User, Sparkles, ChevronRight, Star, Flame, BarChart3, GitCompare
} from 'lucide-react';
import { formatBND } from '@/lib/currency';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import capybaraManager from '@/assets/capybara-manager.png';

function getInitials(name: string) {
  return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

export default function ManagerRankingBoard() {
  const { profile } = useAuth();
  const isMobile = useIsMobile();
  const isAdmin = profile?.role === 'admin';

  const [period, setPeriod] = useState<RankingPeriod>('monthly');
  const [metric, setMetric] = useState<RankingMetric>('leadership_score');
  const [selectedManager, setSelectedManager] = useState<ManagerRankingData | null>(null);
  const [participantsOpen, setParticipantsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState<'enable' | 'disable' | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);

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
    } catch { toast.error('Failed to update participant'); }
  };

  const handleBulkUpdate = async (enable: boolean) => {
    const managerIds = allManagers?.map(m => m.id) || [];
    try {
      await bulkUpdate.mutateAsync({ managerIds, isEnabled: enable });
      toast.success(enable ? 'All managers enabled' : 'All managers disabled');
      setBulkConfirmOpen(null);
    } catch { toast.error('Failed to update participants'); }
  };

  const toggleCompare = (id: string) => {
    setCompareIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 3 ? [...prev, id] : prev);
  };

  const topThree = rankingData?.slice(0, 3) || [];
  const restOfList = rankingData?.slice(3) || [];
  const podiumOrder = topThree.length >= 3
    ? [topThree[1], topThree[0], topThree[2]]
    : topThree.length === 2 ? [topThree[1], topThree[0]] : topThree;

  const getMetricValue = (manager: ManagerRankingData) => {
    switch (metric) {
      case 'leadership_score': return manager.leadership_score.toFixed(0);
      case 'team_gmv': return formatBND(manager.team_realized_gmv);
      case 'team_delivered': return manager.team_delivered_orders.toString();
    }
  };

  const getMetricLabel = () => {
    switch (metric) {
      case 'leadership_score': return 'Score';
      case 'team_gmv': return 'GMV';
      case 'team_delivered': return 'Delivered';
    }
  };

  const totalGmv = rankingData?.reduce((s, m) => s + m.team_realized_gmv, 0) || 0;
  const totalDelivered = rankingData?.reduce((s, m) => s + m.team_delivered_orders, 0) || 0;
  const avgGrowth = rankingData && rankingData.length > 0
    ? rankingData.reduce((s, m) => s + m.growth_pct, 0) / rankingData.length : 0;

  const comparedManagers = (rankingData || []).filter(m => compareIds.includes(m.manager_id));

  return (
    <AppLayout>
      <div className="space-y-6 pb-8 max-w-6xl mx-auto">
        {/* Hero */}
        <PageHero
          icon={<Trophy className="h-6 w-6 text-primary" />}
          title="Leadership Arena"
          subtitle="Lead your team to the top"
          image={capybaraManager}
          imageAlt="Strategy Capybara"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex rounded-full border border-border/50 bg-card/80 backdrop-blur-sm p-1 shadow-sm">
                {([
                  { value: 'monthly' as const, label: 'Monthly' },
                  { value: 'quarterly' as const, label: 'Quarterly' },
                  { value: 'yearly' as const, label: 'Yearly' },
                ]).map(tab => (
                  <Button key={tab.value} variant={period === tab.value ? 'default' : 'ghost'} size="sm" onClick={() => setPeriod(tab.value)}
                    className={cn("rounded-full text-xs px-4 transition-all", period === tab.value && "bg-primary text-primary-foreground shadow-md")}>
                    {tab.label}
                  </Button>
                ))}
              </div>
              {isAdmin && (
                <Sheet open={participantsOpen} onOpenChange={setParticipantsOpen}>
                  <SheetTrigger asChild>
                    <Button variant="outline" size="sm" className="rounded-full">
                      <Settings className="h-4 w-4 mr-2" />Participants
                    </Button>
                  </SheetTrigger>
                  <SheetContent side={isMobile ? 'bottom' : 'right'} className={isMobile ? 'h-[90vh]' : ''}>
                    <SheetHeader><SheetTitle>Manage Participants</SheetTitle></SheetHeader>
                    <div className="py-4 space-y-4">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input placeholder="Search managers..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => setBulkConfirmOpen('enable')}>Enable All</Button>
                        <Button variant="outline" size="sm" className="flex-1" onClick={() => setBulkConfirmOpen('disable')}>Disable All</Button>
                      </div>
                      <ScrollArea className="h-[calc(100vh-280px)] md:h-[calc(100vh-220px)]">
                        <div className="space-y-2">
                          {loadingManagers ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />) : (
                            filteredManagers.map((manager) => (
                              <div key={manager.id} className="flex items-center justify-between p-3 rounded-xl border bg-card/50">
                                <div className="flex-1 min-w-0">
                                  <p className="font-medium truncate">{manager.display_name}</p>
                                  <p className="text-xs text-muted-foreground truncate">{manager.email}</p>
                                  {!manager.is_active && <Badge variant="secondary" className="mt-1 text-xs">Inactive</Badge>}
                                </div>
                                <Switch checked={manager.is_enabled} onCheckedChange={() => handleToggle(manager.id, manager.is_enabled)} disabled={toggleParticipant.isPending} />
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
          }
        />

        {/* Metric Selector */}
        <div className="flex justify-center">
          <div className="inline-flex rounded-2xl border border-border/50 bg-card/80 backdrop-blur-sm p-1.5 gap-1 shadow-sm">
            {([
              { value: 'leadership_score', label: 'Leadership', icon: Award },
              { value: 'team_gmv', label: 'Team GMV', icon: Sparkles },
              { value: 'team_delivered', label: 'Delivered', icon: Target },
            ] as const).map((item) => (
              <Button key={item.value} variant={metric === item.value ? 'default' : 'ghost'} size="sm"
                onClick={() => setMetric(item.value)}
                className={cn("rounded-xl text-xs px-4 gap-2 transition-all", metric === item.value && "bg-primary text-primary-foreground shadow-md")}>
                <item.icon className="h-4 w-4" />{item.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Summary Insight Cards */}
        {rankingData && rankingData.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Managers", value: rankingData.length, icon: <Users className="h-4 w-4" />, isNum: true },
              { label: "Total GMV", value: formatBND(totalGmv), icon: <Flame className="h-4 w-4" />, isNum: false },
              { label: "Total Delivered", value: totalDelivered, icon: <Target className="h-4 w-4" />, isNum: true },
              { label: "Avg Growth", value: `${avgGrowth >= 0 ? '+' : ''}${avgGrowth.toFixed(1)}%`, icon: <TrendingUp className="h-4 w-4" />, isNum: false },
            ].map(item => (
              <Card key={item.label} className="border-border/50 hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10 text-primary">{item.icon}</div>
                  <div>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">{item.label}</p>
                    <p className="font-bold text-lg">{item.isNum ? <AnimatedCounter value={item.value as number} /> : item.value}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            <div className="flex justify-center gap-4 py-8">{[1, 2, 3].map(i => <Skeleton key={i} className="h-48 w-28 rounded-2xl" />)}</div>
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}
          </div>
        ) : !rankingData?.length ? (
          <CapybaraState type="empty" title="No Rankings Yet" description={isAdmin ? 'Add participants to get started.' : 'No managers are on the ranking board yet.'} />
        ) : (
          <>
            {/* Podium */}
            {topThree.length > 0 && (
              <div className="py-6">
                <div className="flex items-end justify-center gap-3 md:gap-6">
                  {podiumOrder.map((manager) => {
                    if (!manager) return null;
                    return (
                      <PodiumCard key={manager.manager_id} manager={manager} metricValue={getMetricValue(manager)} onClick={() => setSelectedManager(manager)} />
                    );
                  })}
                </div>
              </div>
            )}

            {/* Awards */}
            {topThree.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold flex items-center gap-2 text-muted-foreground">
                  <Medal className="h-4 w-4 text-primary" /> Current Awards
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  <AwardBadge title="Top Performer" manager={topThree[0]} icon={<Crown className="h-4 w-4" />} variant="gold" />
                  <AwardBadge title="Best Growth" manager={rankingData.reduce((prev, curr) => (curr.growth_pct > prev.growth_pct) ? curr : prev)} icon={<TrendingUp className="h-4 w-4" />} variant="green" />
                  <AwardBadge title="Most Delivered" manager={rankingData.reduce((prev, curr) => (curr.team_delivered_orders > prev.team_delivered_orders) ? curr : prev)} icon={<Target className="h-4 w-4" />} variant="orange" />
                  <AwardBadge title="Rising Star" manager={rankingData[Math.min(2, rankingData.length - 1)]} icon={<Flame className="h-4 w-4" />} variant="gold" />
                </div>
              </div>
            )}

            {/* Comparison Panel */}
            {comparedManagers.length >= 2 && (
              <Card className="border-primary/20 overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-primary/10 to-transparent pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <GitCompare className="h-4 w-4 text-primary" /> Manager Comparison
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border/30">
                          <th className="text-left p-2 text-muted-foreground font-medium text-xs">Metric</th>
                          {comparedManagers.map(m => (
                            <th key={m.manager_id} className="text-center p-2">
                              <div className="flex flex-col items-center gap-1">
                                <Avatar className="h-8 w-8">
                                  <AvatarImage src={m.manager_avatar_url || undefined} />
                                  <AvatarFallback className="text-xs bg-primary/10 text-primary">{getInitials(m.manager_name)}</AvatarFallback>
                                </Avatar>
                                <span className="font-semibold text-xs">{m.manager_name}</span>
                              </div>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: 'Rank', get: (m: ManagerRankingData) => `#${m.rank}` },
                          { label: 'Team GMV', get: (m: ManagerRankingData) => formatBND(m.team_realized_gmv) },
                          { label: 'Delivered', get: (m: ManagerRankingData) => m.team_delivered_orders.toString() },
                          { label: 'Growth', get: (m: ManagerRankingData) => `${m.growth_pct >= 0 ? '+' : ''}${m.growth_pct.toFixed(1)}%` },
                          { label: 'Leadership', get: (m: ManagerRankingData) => m.leadership_score.toFixed(0) },
                        ].map(row => (
                          <tr key={row.label} className="border-b border-border/20">
                            <td className="p-2 text-muted-foreground text-xs font-medium">{row.label}</td>
                            {comparedManagers.map(m => (
                              <td key={m.manager_id} className="p-2 text-center font-semibold">{row.get(m)}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Button variant="ghost" size="sm" className="mt-2 text-xs" onClick={() => setCompareIds([])}>
                    Clear Comparison
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Rest of Rankings */}
            {restOfList.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between px-1">
                  <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <Star className="h-4 w-4" /> All Rankings
                  </h3>
                  {compareIds.length > 0 && compareIds.length < 2 && (
                    <span className="text-xs text-muted-foreground">Select {2 - compareIds.length} more to compare</span>
                  )}
                </div>
                {restOfList.map((manager) => (
                  <RankingCard key={manager.manager_id} data={manager} metricValue={getMetricValue(manager)}
                    metricLabel={getMetricLabel()} onClick={() => setSelectedManager(manager)}
                    isComparing={compareIds.includes(manager.manager_id)}
                    onToggleCompare={() => toggleCompare(manager.manager_id)} />
                ))}
              </div>
            )}

            {/* Compare hint for top 3 */}
            {rankingData && rankingData.length >= 2 && compareIds.length === 0 && (
              <div className="flex items-center justify-center gap-2 p-3 rounded-xl bg-muted/30 border border-border/30">
                <GitCompare className="h-4 w-4 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">Click the compare icon on ranking cards to compare managers side by side</span>
              </div>
            )}
          </>
        )}

        {/* Details Drawer */}
        <Sheet open={!!selectedManager} onOpenChange={() => setSelectedManager(null)}>
          <SheetContent side={isMobile ? 'bottom' : 'right'} className={isMobile ? 'h-[90vh]' : ''}>
            {selectedManager && <ManagerDetailsDrawer data={selectedManager} metric={metric} />}
          </SheetContent>
        </Sheet>

        {/* Bulk Confirm */}
        <AlertDialog open={!!bulkConfirmOpen} onOpenChange={() => setBulkConfirmOpen(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{bulkConfirmOpen === 'enable' ? 'Enable All Managers?' : 'Disable All Managers?'}</AlertDialogTitle>
              <AlertDialogDescription>{bulkConfirmOpen === 'enable' ? 'All managers will appear on the ranking board.' : 'All managers will be removed from the ranking board.'}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => handleBulkUpdate(bulkConfirmOpen === 'enable')} disabled={bulkUpdate.isPending} className="bg-primary text-primary-foreground">
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

// ─── Podium Card ────────────────────────────────────────
function PodiumCard({ manager, metricValue, onClick }: { manager: ManagerRankingData; metricValue: string; onClick: () => void }) {
  const isFirst = manager.rank === 1;
  const isSecond = manager.rank === 2;

  const getPodiumHeight = () => isFirst ? 'h-40 md:h-48' : isSecond ? 'h-32 md:h-40' : 'h-28 md:h-36';
  const getAvatarSize = () => isFirst ? 'h-20 w-20 md:h-24 md:w-24' : 'h-16 w-16 md:h-20 md:w-20';
  const getAvatarRing = () => isFirst ? 'ring-4 ring-primary shadow-lg shadow-primary/30' : isSecond ? 'ring-4 ring-muted-foreground/40 shadow-lg shadow-muted-foreground/20' : 'ring-4 ring-[hsl(25,80%,55%)]/40 shadow-lg shadow-[hsl(25,80%,55%)]/20';
  const getCrownColor = () => isFirst ? 'text-primary' : isSecond ? 'text-muted-foreground' : 'text-[hsl(25,80%,55%)]';
  const getPodiumBg = () => isFirst ? 'bg-gradient-to-b from-primary/15 to-primary/5 border-primary/30' : isSecond ? 'bg-gradient-to-b from-muted/60 to-muted/20 border-muted-foreground/30' : 'bg-gradient-to-b from-[hsl(25,80%,55%)]/15 to-[hsl(25,80%,55%)]/5 border-[hsl(25,80%,55%)]/30';
  const getRankColor = () => isFirst ? 'text-primary' : isSecond ? 'text-muted-foreground' : 'text-[hsl(25,80%,55%)]';

  return (
    <div className={cn("flex flex-col items-center cursor-pointer transition-all duration-300 hover:scale-105 group", isFirst && "order-2", isSecond && "order-1", !isFirst && !isSecond && "order-3")} onClick={onClick}>
      <div className="relative mb-3">
        <div className={cn("absolute -top-4 left-1/2 -translate-x-1/2 z-10 transition-transform duration-300 group-hover:-translate-y-1", getCrownColor())}>
          <Crown className={cn("drop-shadow-md", isFirst ? "h-7 w-7 md:h-8 md:w-8" : "h-5 w-5 md:h-6 md:w-6")} fill="currentColor" />
        </div>
        <Avatar className={cn(getAvatarSize(), getAvatarRing(), "border-4 border-background transition-all duration-300")}>
          <AvatarImage src={manager.manager_avatar_url || undefined} alt={manager.manager_name} />
          <AvatarFallback className={cn("text-lg md:text-xl font-bold", isFirst ? "bg-primary/20 text-primary" : isSecond ? "bg-muted text-muted-foreground" : "bg-[hsl(25,80%,55%)]/20 text-[hsl(25,80%,55%)]")}>
            {getInitials(manager.manager_name)}
          </AvatarFallback>
        </Avatar>
      </div>
      <div className={cn("w-28 md:w-36 rounded-t-2xl flex flex-col items-center justify-start pt-4 px-3 border-t-2 border-x-2 transition-all duration-300", getPodiumHeight(), getPodiumBg())}>
        <div className={cn("text-3xl md:text-4xl font-bold mb-1 transition-transform duration-300 group-hover:scale-110", getRankColor())}>#{manager.rank}</div>
        <p className="text-sm md:text-base font-semibold text-center truncate w-full">{manager.manager_name.split(' ')[0]}</p>
        <p className="text-xs text-muted-foreground mt-1">{metricValue}</p>
        {manager.growth_pct !== 0 && (
          <div className={cn("flex items-center gap-0.5 text-xs mt-2 px-2 py-0.5 rounded-full",
            manager.growth_pct > 0 ? "text-[hsl(var(--status-success))] bg-[hsl(var(--status-success))]/10" : "text-[hsl(var(--status-error))] bg-[hsl(var(--status-error))]/10"
          )}>
            {manager.growth_pct > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(manager.growth_pct).toFixed(0)}%
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Award Badge ────────────────────────────────────────
function AwardBadge({ title, manager, icon, variant }: { title: string; manager: ManagerRankingData | null; icon: React.ReactNode; variant: 'gold' | 'green' | 'orange' }) {
  const styles = {
    gold: "bg-gradient-to-br from-primary/15 to-primary/5 border-primary/30",
    green: "bg-gradient-to-br from-[hsl(var(--status-success))]/15 to-[hsl(var(--status-success))]/5 border-[hsl(var(--status-success))]/30",
    orange: "bg-gradient-to-br from-[hsl(25,80%,55%)]/15 to-[hsl(25,80%,55%)]/5 border-[hsl(25,80%,55%)]/30",
  }[variant];

  return (
    <div className={cn("flex items-center gap-3 p-3 rounded-xl border transition-all hover:shadow-md hover:-translate-y-0.5", styles)}>
      <div className="p-2 rounded-lg bg-card shadow-sm">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          {manager && (
            <Avatar className="h-5 w-5">
              <AvatarImage src={manager.manager_avatar_url || undefined} />
              <AvatarFallback className="text-[10px] bg-muted">{getInitials(manager.manager_name)}</AvatarFallback>
            </Avatar>
          )}
          <p className="font-semibold truncate text-sm">{manager?.manager_name || 'TBD'}</p>
        </div>
      </div>
    </div>
  );
}

// ─── Ranking Card ────────────────────────────────────────
function RankingCard({ data, metricValue, metricLabel, onClick, isComparing, onToggleCompare }: {
  data: ManagerRankingData; metricValue: string; metricLabel: string; onClick: () => void;
  isComparing: boolean; onToggleCompare: () => void;
}) {
  return (
    <Card className={cn(
      "transition-all duration-200 hover:shadow-lg hover:scale-[1.01] active:scale-[0.99] border-border/50 hover:border-primary/30",
      isComparing && "ring-2 ring-primary border-primary/40"
    )}>
      <CardContent className="p-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" className={cn("h-8 w-8 p-0 rounded-full shrink-0", isComparing && "bg-primary/20")}
            onClick={(e) => { e.stopPropagation(); onToggleCompare(); }}>
            <GitCompare className={cn("h-3.5 w-3.5", isComparing ? "text-primary" : "text-muted-foreground")} />
          </Button>
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary border border-primary/20 cursor-pointer" onClick={onClick}>
            #{data.rank}
          </div>
          <Avatar className="h-12 w-12 border-2 border-border/30 cursor-pointer" onClick={onClick}>
            <AvatarImage src={data.manager_avatar_url || undefined} alt={data.manager_name} />
            <AvatarFallback className="bg-primary/10 text-primary font-medium">{getInitials(data.manager_name)}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 cursor-pointer" onClick={onClick}>
            <p className="font-semibold truncate">{data.manager_name}</p>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{data.team_delivered_orders} delivered</span>
              {data.growth_pct !== 0 && (
                <span className={cn("flex items-center px-1.5 py-0.5 rounded-full text-xs",
                  data.growth_pct > 0 ? "text-[hsl(var(--status-success))] bg-[hsl(var(--status-success))]/10" : "text-[hsl(var(--status-error))] bg-[hsl(var(--status-error))]/10"
                )}>
                  {data.growth_pct > 0 ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
                  {Math.abs(data.growth_pct).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
          <div className="flex-shrink-0 text-right cursor-pointer" onClick={onClick}>
            <span className="text-lg font-bold text-primary">{metricValue}</span>
            <p className="text-xs text-muted-foreground">{metricLabel}</p>
          </div>
          <ChevronRight className="h-5 w-5 text-muted-foreground flex-shrink-0 cursor-pointer" onClick={onClick} />
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Manager Details Drawer ────────────────────────────────────────
function ManagerDetailsDrawer({ data, metric }: { data: ManagerRankingData; metric: RankingMetric }) {
  const scoreBreakdown = data.score_breakdown || { team_growth_score: 0, improvement_score: 0, ops_score: 0, personal_score: 0 };
  const insights = [
    data.growth_pct > 10 ? "🚀 Strong growth momentum this period!" : data.growth_pct < -10 ? "⚠️ GMV declining - consider intervention" : null,
    data.dependency_ratio > 0.5 ? "⚠️ High dependency on top performer" : null,
    data.bottom30_improve_pct > 0.5 ? "✅ Bottom performers improving well" : data.bottom30_improve_pct < 0.2 ? "💡 Focus coaching on bottom 30%" : null,
  ].filter(Boolean);

  const getRankBadge = () => {
    if (data.rank === 1) return 'bg-primary text-primary-foreground';
    if (data.rank === 2) return 'bg-muted-foreground text-background';
    if (data.rank === 3) return 'bg-[hsl(25,80%,55%)] text-background';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <>
      <SheetHeader className="pb-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 ring-4 ring-primary/20">
            <AvatarImage src={data.manager_avatar_url || undefined} alt={data.manager_name} />
            <AvatarFallback className="bg-primary/10 text-primary font-bold text-xl">{getInitials(data.manager_name)}</AvatarFallback>
          </Avatar>
          <div>
            <SheetTitle className="text-left">{data.manager_name}</SheetTitle>
            <div className="flex items-center gap-2 mt-1">
              <Badge className={cn("font-bold", getRankBadge())}>Rank #{data.rank}</Badge>
              {data.growth_pct !== 0 && (
                <Badge variant="outline" className={cn("text-xs",
                  data.growth_pct > 0 ? "border-[hsl(var(--status-success))]/50 text-[hsl(var(--status-success))]" : "border-[hsl(var(--status-error))]/50 text-[hsl(var(--status-error))]"
                )}>
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
          <Card className="overflow-hidden border-primary/20">
            <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-primary text-primary-foreground"><Award className="h-4 w-4" /></div>
                  <span className="font-semibold">Leadership Score</span>
                </div>
                <div className="text-3xl font-bold text-primary">
                  {data.leadership_score.toFixed(0)}<span className="text-sm text-muted-foreground font-normal">/100</span>
                </div>
              </div>
            </div>
            <CardContent className="p-4 pt-3 space-y-3">
              {[
                { label: "Team Growth", value: scoreBreakdown.team_growth_score, max: 40, icon: <TrendingUp className="h-4 w-4" />, color: "bg-[hsl(var(--chart-1))]" },
                { label: "Bottom 30% Improvement", value: scoreBreakdown.improvement_score, max: 30, icon: <Target className="h-4 w-4" />, color: "bg-[hsl(var(--status-success))]" },
                { label: "Ops Interventions", value: scoreBreakdown.ops_score, max: 20, icon: <Zap className="h-4 w-4" />, color: "bg-primary" },
                { label: "Personal Contribution", value: scoreBreakdown.personal_score, max: 10, icon: <User className="h-4 w-4" />, color: "bg-[hsl(var(--chart-4))]" },
              ].map(bar => (
                <div key={bar.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">{bar.icon}{bar.label}</span>
                    <span className="font-medium tabular-nums">{bar.value.toFixed(1)}/{bar.max}</span>
                  </div>
                  <div className="h-2 bg-muted/50 rounded-full overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all", bar.color)} style={{ width: `${Math.min((bar.value / bar.max) * 100, 100)}%` }} />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Key Metrics */}
          <Card className="border-border/50">
            <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" />Key Metrics</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "Realized GMV", value: formatBND(data.team_realized_gmv) },
                  { label: "Pipeline GMV", value: formatBND(data.team_pipeline_gmv) },
                  { label: "Delivered", value: data.team_delivered_orders.toString() },
                  { label: "Booking", value: data.team_booking_orders.toString() },
                  { label: "Growth", value: `${data.growth_pct >= 0 ? '+' : ''}${data.growth_pct.toFixed(1)}%`, cls: data.growth_pct >= 0 ? 'text-[hsl(var(--status-success))]' : 'text-[hsl(var(--status-error))]' },
                  { label: "Dependency", value: `${(data.dependency_ratio * 100).toFixed(0)}%`, cls: data.dependency_ratio > 0.5 ? 'text-primary' : '' },
                ].map(m => (
                  <div key={m.label} className="p-3 rounded-xl bg-muted/30 border border-border/30">
                    <p className="text-xs text-muted-foreground">{m.label}</p>
                    <p className={cn("text-lg font-semibold", (m as any).cls)}>{m.value}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Insights */}
          {insights.length > 0 && (
            <Card className="border-border/50">
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Zap className="h-4 w-4 text-primary" />Insights</CardTitle></CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {insights.map((insight, i) => (
                    <li key={i} className="text-sm bg-muted/30 rounded-lg p-2.5 border border-border/30">{insight}</li>
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
