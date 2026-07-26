import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/contexts/AuthContext';
import {
  useManagerRankingData,
  useAllManagersForRanking,
  useToggleManagerRankingParticipant,
  useBulkUpdateManagerRankingParticipants,
  type RankingPeriod,
  type RankingMetric,
  type ManagerRankingData,
} from '@/hooks/useManagerRanking';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { CapybaraState } from '@/components/dashboard/CapybaraState';
import {
  Award,
  CalendarDays,
  ChevronRight,
  Crown,
  Flame,
  GitCompare,
  Medal,
  Search,
  Settings,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Trophy,
  User,
  Users,
  Zap,
} from 'lucide-react';
import { formatBND } from '@/lib/currency';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const periodOptions: Array<{ value: RankingPeriod; label: string }> = [
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
];

const metricOptions: Array<{
  value: RankingMetric;
  label: string;
  icon: typeof Award;
}> = [
  { value: 'leadership_score', label: 'Leadership', icon: Award },
  { value: 'team_gmv', label: 'Team GMV', icon: Sparkles },
  { value: 'team_delivered', label: 'Delivered', icon: Target },
];

function getInitials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getMetricValue(manager: ManagerRankingData, metric: RankingMetric) {
  if (metric === 'team_gmv') return formatBND(manager.team_realized_gmv);
  if (metric === 'team_delivered') return manager.team_delivered_orders.toString();
  return manager.leadership_score.toFixed(0);
}

function getMetricLabel(metric: RankingMetric) {
  if (metric === 'team_gmv') return 'Team GMV';
  if (metric === 'team_delivered') return 'Delivered';
  return 'Leadership';
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

  const { data: rankingData, isLoading, isFetching } = useManagerRankingData(period, metric);
  const { data: allManagers, isLoading: loadingManagers } = useAllManagersForRanking();
  const toggleParticipant = useToggleManagerRankingParticipant();
  const bulkUpdate = useBulkUpdateManagerRankingParticipants();

  const filteredManagers =
    allManagers?.filter(
      (manager) =>
        manager.display_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        manager.email.toLowerCase().includes(searchQuery.toLowerCase()),
    ) || [];

  const handleToggle = async (managerId: string, currentEnabled: boolean) => {
    try {
      await toggleParticipant.mutateAsync({ managerId, isEnabled: !currentEnabled });
      toast.success(!currentEnabled ? 'Manager added to ranking' : 'Manager removed from ranking');
    } catch {
      toast.error('Failed to update participant');
    }
  };

  const handleBulkUpdate = async (enable: boolean) => {
    try {
      await bulkUpdate.mutateAsync({
        managerIds: allManagers?.map((manager) => manager.id) || [],
        isEnabled: enable,
      });
      toast.success(enable ? 'All managers enabled' : 'All managers disabled');
      setBulkConfirmOpen(null);
    } catch {
      toast.error('Failed to update participants');
    }
  };

  const toggleCompare = (id: string) => {
    setCompareIds((current) =>
      current.includes(id)
        ? current.filter((managerId) => managerId !== id)
        : current.length < 3
          ? [...current, id]
          : current,
    );
  };

  const rankings = rankingData || [];
  const topThree = rankings.slice(0, 3);
  const comparedManagers = rankings.filter((manager) => compareIds.includes(manager.manager_id));
  const totalGmv = rankings.reduce((sum, manager) => sum + manager.team_realized_gmv, 0);
  const totalDelivered = rankings.reduce((sum, manager) => sum + manager.team_delivered_orders, 0);
  const avgGrowth = rankings.length
    ? rankings.reduce((sum, manager) => sum + manager.growth_pct, 0) / rankings.length
    : 0;
  const periodLabel = periodOptions.find((option) => option.value === period)?.label || 'Monthly';
  const metricLabel = getMetricLabel(metric);

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl space-y-5 pb-8">
        <header className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Trophy className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                Performance
              </p>
              <h1 className="text-2xl font-black leading-tight sm:text-3xl">Manager ranking</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Compare leadership, team sales, and delivered orders.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="rounded-full border-primary/30 px-3 py-1 text-xs font-medium">
              <CalendarDays className="mr-1.5 h-3 w-3" />
              {periodLabel}
            </Badge>
            <div
              className={cn(
                'flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium',
                isFetching
                  ? 'bg-[hsl(var(--status-pending))]/20 text-[hsl(var(--status-pending))]'
                  : 'bg-[hsl(var(--status-success))]/20 text-[hsl(var(--status-success))]',
              )}
            >
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  isFetching
                    ? 'animate-pulse bg-[hsl(var(--status-pending))]'
                    : 'bg-[hsl(var(--status-success))]',
                )}
              />
              Live
            </div>
            {isAdmin && (
              <Sheet open={participantsOpen} onOpenChange={setParticipantsOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" size="sm" className="rounded-full">
                    <Settings className="mr-2 h-4 w-4" />
                    Participants
                  </Button>
                </SheetTrigger>
                <SheetContent side={isMobile ? 'bottom' : 'right'} className={isMobile ? 'h-[90dvh]' : ''}>
                  <SheetHeader>
                    <SheetTitle>Manage participants</SheetTitle>
                  </SheetHeader>
                  <div className="space-y-4 py-4">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        placeholder="Search managers..."
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setBulkConfirmOpen('enable')}
                      >
                        Enable all
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex-1"
                        onClick={() => setBulkConfirmOpen('disable')}
                      >
                        Disable all
                      </Button>
                    </div>
                    <ScrollArea className="h-[calc(90dvh-190px)] md:h-[calc(100vh-220px)]">
                      <div className="space-y-2 pr-3">
                        {loadingManagers
                          ? Array.from({ length: 5 }).map((_, index) => (
                              <Skeleton key={index} className="h-16 w-full" />
                            ))
                          : filteredManagers.map((manager) => (
                              <div
                                key={manager.id}
                                className="flex items-center justify-between gap-3 rounded-xl border border-border/50 bg-card/50 p-3"
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="truncate font-medium">{manager.display_name}</p>
                                  <p className="truncate text-xs text-muted-foreground">{manager.email}</p>
                                  {!manager.is_active && (
                                    <Badge variant="secondary" className="mt-1 text-xs">
                                      Inactive
                                    </Badge>
                                  )}
                                </div>
                                <Switch
                                  checked={manager.is_enabled}
                                  onCheckedChange={() => handleToggle(manager.id, manager.is_enabled)}
                                  disabled={toggleParticipant.isPending}
                                />
                              </div>
                            ))}
                      </div>
                    </ScrollArea>
                  </div>
                </SheetContent>
              </Sheet>
            )}
          </div>
        </header>

        <section className="rounded-2xl border border-border/60 bg-card/70 p-2 shadow-sm">
          <div className="grid gap-2 md:grid-cols-2">
            <div className="grid grid-cols-3 rounded-xl bg-muted/40 p-1">
              {periodOptions.map((option) => (
                <Button
                  key={option.value}
                  variant="ghost"
                  size="sm"
                  onClick={() => setPeriod(option.value)}
                  className={cn(
                    'h-9 rounded-lg px-2 text-xs transition-all sm:text-sm',
                    period === option.value && 'bg-primary text-primary-foreground shadow-sm hover:bg-primary',
                  )}
                >
                  {option.label}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-3 rounded-xl bg-muted/40 p-1">
              {metricOptions.map((option) => (
                <Button
                  key={option.value}
                  variant="ghost"
                  size="sm"
                  onClick={() => setMetric(option.value)}
                  className={cn(
                    'h-9 min-w-0 rounded-lg px-1.5 text-xs transition-all sm:px-3 sm:text-sm',
                    metric === option.value && 'bg-primary text-primary-foreground shadow-sm hover:bg-primary',
                  )}
                >
                  <option.icon className="mr-1.5 hidden h-3.5 w-3.5 sm:block" />
                  <span className="truncate">{option.label}</span>
                </Button>
              ))}
            </div>
          </div>
        </section>

        {isLoading ? (
          <RankingSkeleton />
        ) : !rankings.length ? (
          <CapybaraState
            type="empty"
            title="No rankings yet"
            description={isAdmin ? 'Add participants to start the board.' : 'No managers are on the board yet.'}
          />
        ) : (
          <>
            <ManagerAwardStage
              rankings={rankings}
              topThree={topThree}
              metric={metric}
              metricLabel={metricLabel}
              periodLabel={periodLabel}
              onSelect={setSelectedManager}
            />

            <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-sm">
              <div className="grid grid-cols-2 divide-x divide-y divide-border/50 sm:grid-cols-4 sm:divide-y-0">
                <SnapshotMetric icon={Users} label="Managers" value={rankings.length} />
                <SnapshotMetric icon={Flame} label="Total GMV" value={formatBND(totalGmv)} />
                <SnapshotMetric icon={Target} label="Delivered" value={totalDelivered} />
                <SnapshotMetric
                  icon={TrendingUp}
                  label="Avg growth"
                  value={`${avgGrowth >= 0 ? '+' : ''}${avgGrowth.toFixed(1)}%`}
                />
              </div>
            </section>

            {comparedManagers.length >= 2 && (
              <ComparisonPanel managers={comparedManagers} onClear={() => setCompareIds([])} />
            )}

            <section className="space-y-3">
              <div className="flex items-end justify-between gap-3 px-1">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Full board</p>
                  <h2 className="text-lg font-bold">All manager rankings</h2>
                </div>
                <Badge variant="outline" className="rounded-full">
                  {rankings.length} managers
                </Badge>
              </div>

              <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-sm">
                {rankings.map((manager) => (
                  <RankingRow
                    key={manager.manager_id}
                    data={manager}
                    metric={metric}
                    isComparing={compareIds.includes(manager.manager_id)}
                    onToggleCompare={() => toggleCompare(manager.manager_id)}
                    onClick={() => setSelectedManager(manager)}
                  />
                ))}
              </div>

              {compareIds.length === 1 && (
                <p className="px-1 text-xs text-muted-foreground">Select one more manager to compare.</p>
              )}
            </section>
          </>
        )}

        <Sheet open={!!selectedManager} onOpenChange={(open) => !open && setSelectedManager(null)}>
          <SheetContent side={isMobile ? 'bottom' : 'right'} className={isMobile ? 'h-[90dvh]' : ''}>
            {selectedManager && <ManagerDetailsDrawer data={selectedManager} />}
          </SheetContent>
        </Sheet>

        <AlertDialog open={!!bulkConfirmOpen} onOpenChange={() => setBulkConfirmOpen(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {bulkConfirmOpen === 'enable' ? 'Enable all managers?' : 'Disable all managers?'}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {bulkConfirmOpen === 'enable'
                  ? 'All managers will appear on the ranking board.'
                  : 'All managers will be removed from the ranking board.'}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => handleBulkUpdate(bulkConfirmOpen === 'enable')}
                disabled={bulkUpdate.isPending}
              >
                Confirm
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </AppLayout>
  );
}

function RankingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-[380px] w-full rounded-[28px]" />
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}

function SnapshotMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 items-center gap-3 p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
        <p className="truncate text-base font-bold tabular-nums sm:text-lg">{value}</p>
      </div>
    </div>
  );
}

function ManagerAwardStage({
  rankings,
  topThree,
  metric,
  metricLabel,
  periodLabel,
  onSelect,
}: {
  rankings: ManagerRankingData[];
  topThree: ManagerRankingData[];
  metric: RankingMetric;
  metricLabel: string;
  periodLabel: string;
  onSelect: (manager: ManagerRankingData) => void;
}) {
  const champion = topThree[0];
  if (!champion) return null;

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-[#d49a2f]/40 bg-[#17130d] text-white shadow-[0_22px_70px_-42px_rgba(0,0,0,0.9)]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#f4bd57] to-transparent" />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),transparent_38%,rgba(212,154,47,0.10))]" />
      <div className="relative grid gap-5 p-5 sm:p-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full border border-[#d49a2f]/35 bg-[#d49a2f]/20 text-[#f7d18a]">
              Manager board
            </Badge>
            <Badge className="rounded-full border border-white/10 bg-white/[0.07] text-white/70">
              {periodLabel}
            </Badge>
            <Badge className="rounded-full border border-white/10 bg-white/[0.07] text-white/70">
              Ranked by {metricLabel}
            </Badge>
          </div>

          <button
            type="button"
            onClick={() => onSelect(champion)}
            className="w-full rounded-[24px] border border-[#d49a2f]/35 bg-white/[0.08] p-4 text-left shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] transition-transform duration-200 hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4bd57] sm:p-5"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
              <div className="relative shrink-0 self-start">
                <Avatar className="h-20 w-20 border-4 border-[#f4bd57] shadow-[0_0_0_7px_rgba(212,154,47,0.16)] sm:h-24 sm:w-24">
                  <AvatarImage src={champion.manager_avatar_url || undefined} alt={champion.manager_name} />
                  <AvatarFallback className="bg-[#f4bd57] text-xl font-black text-[#17130d]">
                    {getInitials(champion.manager_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute -right-2 -top-2 flex h-9 w-9 items-center justify-center rounded-full bg-[#f4bd57] text-[#17130d]">
                  <Crown className="h-4 w-4" />
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#f4bd57]">Current leader</p>
                <h2 className="mt-1 truncate text-3xl font-black sm:text-4xl">{champion.manager_name}</h2>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <DarkMetric label={metricLabel} value={getMetricValue(champion, metric)} />
                  <DarkMetric label="Delivered" value={champion.team_delivered_orders} />
                  <DarkMetric
                    label="Growth"
                    value={`${champion.growth_pct >= 0 ? '+' : ''}${champion.growth_pct.toFixed(1)}%`}
                  />
                </div>
              </div>
            </div>
          </button>

          <p className="text-sm leading-6 text-white/60">
            {rankings.length} managers ranked from confirmed team results.
          </p>
        </div>

        <aside className="min-w-0 rounded-[24px] border border-white/10 bg-black/20 p-4">
          <div className="mb-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#f4bd57]">Top contenders</p>
            <h3 className="mt-1 text-xl font-black">Leading three</h3>
          </div>
          <div className="space-y-2">
            {topThree.map((manager) => (
              <button
                type="button"
                key={manager.manager_id}
                onClick={() => onSelect(manager)}
                className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.07] p-3 text-left transition-colors hover:bg-white/[0.11] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f4bd57]"
              >
                <RankMark rank={manager.rank} dark />
                <Avatar className="h-10 w-10 border border-white/10">
                  <AvatarImage src={manager.manager_avatar_url || undefined} alt={manager.manager_name} />
                  <AvatarFallback className="bg-white/10 font-bold text-white">
                    {getInitials(manager.manager_name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{manager.manager_name}</p>
                  <p className="text-xs text-white/50">{manager.team_delivered_orders} delivered</p>
                </div>
                <p className="max-w-[35%] truncate text-sm font-black tabular-nums">
                  {getMetricValue(manager, metric)}
                </p>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

function DarkMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-black/20 px-2.5 py-2.5 sm:px-3">
      <p className="truncate text-[9px] font-semibold uppercase tracking-[0.14em] text-white/45">{label}</p>
      <p className="truncate text-sm font-black tabular-nums sm:text-base">{value}</p>
    </div>
  );
}

function RankMark({ rank, dark = false }: { rank: number; dark?: boolean }) {
  const className = cn(
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black',
    rank === 1 && 'bg-[#f4bd57] text-[#17130d]',
    rank === 2 && (dark ? 'bg-white/20 text-white' : 'bg-muted text-muted-foreground'),
    rank === 3 && 'bg-[#c7772f]/25 text-[#d98235]',
    rank > 3 && (dark ? 'bg-white/10 text-white/65' : 'bg-muted/60 text-muted-foreground'),
  );

  if (rank === 1) return <div className={className}><Crown className="h-4 w-4" /></div>;
  if (rank === 2) return <div className={className}><Medal className="h-4 w-4" /></div>;
  if (rank === 3) return <div className={className}><Award className="h-4 w-4" /></div>;
  return <div className={className}>{rank}</div>;
}

function RankingRow({
  data,
  metric,
  isComparing,
  onToggleCompare,
  onClick,
}: {
  data: ManagerRankingData;
  metric: RankingMetric;
  isComparing: boolean;
  onToggleCompare: () => void;
  onClick: () => void;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-2 border-b border-border/40 p-3 transition-colors last:border-b-0 hover:bg-muted/25 sm:gap-3 sm:p-4',
        isComparing && 'bg-primary/10',
      )}
    >
      <button
        type="button"
        onClick={onToggleCompare}
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
          isComparing && 'bg-primary text-primary-foreground hover:bg-primary',
        )}
        aria-label={`${isComparing ? 'Remove' : 'Add'} ${data.manager_name} ${isComparing ? 'from' : 'to'} comparison`}
        title="Compare manager"
      >
        <GitCompare className="h-3.5 w-3.5" />
      </button>
      <button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-2 text-left sm:gap-3">
        <RankMark rank={data.rank} />
        <Avatar className="h-10 w-10 shrink-0 border border-border/50 sm:h-11 sm:w-11">
          <AvatarImage src={data.manager_avatar_url || undefined} alt={data.manager_name} />
          <AvatarFallback className="bg-primary/10 font-bold text-primary">
            {getInitials(data.manager_name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{data.manager_name}</p>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>{data.team_delivered_orders} delivered</span>
            {data.growth_pct !== 0 && (
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 font-medium',
                  data.growth_pct > 0
                    ? 'text-[hsl(var(--status-success))]'
                    : 'text-[hsl(var(--status-error))]',
                )}
              >
                {data.growth_pct > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : (
                  <TrendingDown className="h-3 w-3" />
                )}
                {Math.abs(data.growth_pct).toFixed(1)}%
              </span>
            )}
          </div>
        </div>
        <div className="max-w-[32%] shrink-0 text-right">
          <p className="truncate text-sm font-black tabular-nums text-primary sm:text-base">
            {getMetricValue(data, metric)}
          </p>
          <p className="truncate text-[10px] text-muted-foreground">{getMetricLabel(metric)}</p>
        </div>
        <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
      </button>
    </div>
  );
}

function ComparisonPanel({
  managers,
  onClear,
}: {
  managers: ManagerRankingData[];
  onClear: () => void;
}) {
  const rows = [
    { label: 'Rank', getValue: (manager: ManagerRankingData) => `#${manager.rank}` },
    { label: 'Team GMV', getValue: (manager: ManagerRankingData) => formatBND(manager.team_realized_gmv) },
    { label: 'Delivered', getValue: (manager: ManagerRankingData) => manager.team_delivered_orders.toString() },
    {
      label: 'Growth',
      getValue: (manager: ManagerRankingData) =>
        `${manager.growth_pct >= 0 ? '+' : ''}${manager.growth_pct.toFixed(1)}%`,
    },
    { label: 'Leadership', getValue: (manager: ManagerRankingData) => manager.leadership_score.toFixed(0) },
  ];

  return (
    <section className="overflow-hidden rounded-2xl border border-primary/25 bg-card/70 shadow-sm">
      <div className="flex items-center justify-between border-b border-border/50 p-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Comparison</p>
          <h2 className="font-bold">Manager metrics</h2>
        </div>
        <Button variant="ghost" size="sm" onClick={onClear}>Clear</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[500px] text-sm">
          <thead>
            <tr className="border-b border-border/40 bg-muted/20">
              <th className="p-3 text-left text-xs font-medium text-muted-foreground">Metric</th>
              {managers.map((manager) => (
                <th key={manager.manager_id} className="p-3 text-center">
                  <span className="font-semibold">{manager.manager_name}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-b border-border/30 last:border-b-0">
                <td className="p-3 text-xs font-medium text-muted-foreground">{row.label}</td>
                {managers.map((manager) => (
                  <td key={manager.manager_id} className="p-3 text-center font-semibold tabular-nums">
                    {row.getValue(manager)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ManagerDetailsDrawer({ data }: { data: ManagerRankingData }) {
  const breakdown = data.score_breakdown || {
    team_growth_score: 0,
    improvement_score: 0,
    ops_score: 0,
    personal_score: 0,
  };
  const scoreRows = [
    { label: 'Team growth', value: breakdown.team_growth_score, max: 40, icon: TrendingUp },
    { label: 'Bottom 30% improvement', value: breakdown.improvement_score, max: 30, icon: Target },
    { label: 'Ops interventions', value: breakdown.ops_score, max: 20, icon: Zap },
    { label: 'Personal contribution', value: breakdown.personal_score, max: 10, icon: User },
  ];

  return (
    <>
      <SheetHeader className="pb-4">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 ring-4 ring-primary/20">
            <AvatarImage src={data.manager_avatar_url || undefined} alt={data.manager_name} />
            <AvatarFallback className="bg-primary/10 text-xl font-bold text-primary">
              {getInitials(data.manager_name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <SheetTitle className="truncate text-left">{data.manager_name}</SheetTitle>
            <div className="mt-1 flex items-center gap-2">
              <Badge>Rank #{data.rank}</Badge>
              <Badge variant="outline">
                {data.growth_pct >= 0 ? '+' : ''}{data.growth_pct.toFixed(1)}%
              </Badge>
            </div>
          </div>
        </div>
      </SheetHeader>
      <ScrollArea className="h-[calc(90dvh-120px)] md:h-[calc(100vh-120px)]">
        <div className="space-y-4 pr-3">
          <section className="rounded-2xl bg-[#17130d] p-4 text-white">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#f4bd57]">
                  Leadership score
                </p>
                <p className="mt-1 text-4xl font-black tabular-nums">
                  {data.leadership_score.toFixed(0)}
                  <span className="text-sm font-medium text-white/45"> / 100</span>
                </p>
              </div>
              <Award className="h-7 w-7 text-[#f4bd57]" />
            </div>
            <div className="mt-5 space-y-3">
              {scoreRows.map((row) => (
                <div key={row.label}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                    <span className="flex items-center gap-2 text-white/65">
                      <row.icon className="h-3.5 w-3.5" />
                      {row.label}
                    </span>
                    <span className="font-semibold tabular-nums">{row.value.toFixed(1)}/{row.max}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-[#f4bd57]"
                      style={{ width: `${Math.min((row.value / row.max) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-2 gap-2">
            <DetailMetric label="Realized GMV" value={formatBND(data.team_realized_gmv)} />
            <DetailMetric label="Pipeline GMV" value={formatBND(data.team_pipeline_gmv)} />
            <DetailMetric label="Delivered" value={data.team_delivered_orders} />
            <DetailMetric label="Booking" value={data.team_booking_orders} />
            <DetailMetric label="Growth" value={`${data.growth_pct >= 0 ? '+' : ''}${data.growth_pct.toFixed(1)}%`} />
            <DetailMetric label="Dependency" value={`${(data.dependency_ratio * 100).toFixed(0)}%`} />
          </section>
        </div>
      </ScrollArea>
    </>
  );
}

function DetailMetric({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/50 bg-muted/25 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-bold tabular-nums">{value}</p>
    </div>
  );
}
