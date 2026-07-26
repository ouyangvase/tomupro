import { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/contexts/AuthContext';
import { useManagerDashboard, useAllManagersKpi, type PeriodType } from '@/hooks/useManagerDashboard';
import { formatBND } from '@/lib/currency';
import { cn } from '@/lib/utils';
import {
  Activity,
  ArrowUpRight,
  Award,
  CalendarDays,
  Crown,
  Medal,
  Target,
  TrendingUp,
  Trophy,
  User,
  Users,
  Zap,
} from 'lucide-react';

const periods: Array<{ value: PeriodType; label: string }> = [
  { value: 'last7', label: 'Last 7 days' },
  { value: 'mtd', label: 'Month to date' },
];

const scoreMeta = [
  {
    key: 'teamGrowth',
    label: 'Team growth',
    shortLabel: 'Growth',
    max: 40,
    description: 'Realized GMV growth against the previous period.',
    icon: TrendingUp,
  },
  {
    key: 'bottom30Improvement',
    label: 'Bottom 30% improvement',
    shortLabel: 'Improvement',
    max: 30,
    description: 'Progress made by the lowest-performing team members.',
    icon: Target,
  },
  {
    key: 'opsInterventions',
    label: 'Ops interventions',
    shortLabel: 'Operations',
    max: 20,
    description: 'Inbound acknowledgements and resolved operational work.',
    icon: Zap,
  },
  {
    key: 'personalContribution',
    label: 'Personal contribution',
    shortLabel: 'Personal',
    max: 10,
    description: 'Delivered orders completed by the manager.',
    icon: User,
  },
] as const;

function getInitials(name: string) {
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function ManagerImpactBoard() {
  const { role } = useAuth();
  const [period, setPeriod] = useState<PeriodType>('mtd');
  const { data: myData, isLoading: myLoading } = useManagerDashboard(period);
  const { data: allManagers, isLoading: allLoading } = useAllManagersKpi();

  const isAdmin = role === 'admin';
  const periodLabel = periods.find((item) => item.value === period)?.label || 'Month to date';
  const rankedManagers = Array.from(
    new Map((allManagers || []).map((manager) => [manager.manager_id, manager])).values(),
  ).sort((a, b) => (b.leadership_score || 0) - (a.leadership_score || 0));

  return (
    <AppLayout>
      <div className="mx-auto max-w-7xl space-y-5 pb-8">
        <header className="flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/80 p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Award className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                Performance
              </p>
              <h1 className="text-2xl font-black leading-tight sm:text-3xl">Manager impact</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {isAdmin ? 'Leadership performance across all managers.' : 'Your leadership and team results.'}
              </p>
            </div>
          </div>
          <Badge variant="outline" className="w-fit rounded-full border-primary/30 px-3 py-1 text-xs font-medium">
            <CalendarDays className="mr-1.5 h-3 w-3" />
            {periodLabel}
          </Badge>
        </header>

        <section className="rounded-2xl border border-border/60 bg-card/70 p-2 shadow-sm">
          <div className="grid grid-cols-2 rounded-xl bg-muted/40 p-1">
            {periods.map((item) => (
              <button
                type="button"
                key={item.value}
                onClick={() => setPeriod(item.value)}
                className={cn(
                  'h-9 rounded-lg px-3 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:text-sm',
                  period === item.value
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-background/70 hover:text-foreground',
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        <Tabs defaultValue="leadership" className="space-y-5">
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <TabsList className="h-11 w-max min-w-full justify-start rounded-xl bg-muted/40 p-1 sm:grid sm:grid-cols-3">
              <TabsTrigger value="leadership" className="shrink-0 rounded-lg px-4 text-xs sm:text-sm">
                Leadership
              </TabsTrigger>
              <TabsTrigger value="team" className="shrink-0 rounded-lg px-4 text-xs sm:text-sm">
                Team results
              </TabsTrigger>
              <TabsTrigger value="growth" className="shrink-0 rounded-lg px-4 text-xs sm:text-sm">
                Growth
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="leadership" className="mt-0 space-y-5">
            {myLoading ? (
              <ImpactSkeleton />
            ) : (
              <>
                <LeadershipStage
                  score={myData?.leadershipScore || 0}
                  breakdown={myData?.scoreBreakdown}
                  periodLabel={periodLabel}
                />
                <ScoreModel breakdown={myData?.scoreBreakdown} />
              </>
            )}
          </TabsContent>

          <TabsContent value="team" className="mt-0 space-y-5">
            {myLoading ? (
              <ImpactSkeleton />
            ) : (
              <>
                <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-sm">
                  <div className="flex items-center justify-between border-b border-border/50 p-4">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">
                        Confirmed results
                      </p>
                      <h2 className="text-lg font-bold">Team performance</h2>
                    </div>
                    <Trophy className="h-5 w-5 text-primary" />
                  </div>
                  <div className="grid grid-cols-2 divide-x divide-y divide-border/50 sm:grid-cols-4 sm:divide-y-0">
                    <ImpactMetric
                      icon={Target}
                      label="Delivered"
                      value={myData?.teamOverview.deliveredOrders || 0}
                    />
                    <ImpactMetric
                      icon={Award}
                      label="Realized GMV"
                      value={formatBND(myData?.teamOverview.realizedGmv || 0)}
                    />
                    <ImpactMetric
                      icon={Users}
                      label="Active team"
                      value={myData?.teamHealth.activeTeamMembers || 0}
                    />
                    <ImpactMetric
                      icon={Activity}
                      label="With orders"
                      value={myData?.teamHealth.teamMembersWithOrders || 0}
                    />
                  </div>
                </section>

                <section className="grid gap-3 sm:grid-cols-2">
                  <SimplePanel
                    label="Dependency ratio"
                    value={`${((myData?.teamHealth.dependencyRatio || 0) * 100).toFixed(0)}%`}
                    description="Share of team deliveries handled by the top performer."
                  />
                  <SimplePanel
                    label="Top-to-bottom gap"
                    value={`${(myData?.teamHealth.topBottomGapRatio || 0).toFixed(1)}x`}
                    description="Delivery difference between the strongest and lowest performers."
                  />
                </section>
              </>
            )}
          </TabsContent>

          <TabsContent value="growth" className="mt-0 space-y-5">
            {myLoading ? (
              <ImpactSkeleton />
            ) : (
              <>
                <section className="relative overflow-hidden rounded-[28px] border border-[#d49a2f]/40 bg-[#17130d] p-5 text-white sm:p-6">
                  <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#f4bd57] to-transparent" />
                  <div className="relative">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#f4bd57]">
                          Revenue flow
                        </p>
                        <h2 className="mt-1 text-2xl font-black">Pipeline to realized</h2>
                      </div>
                      <ArrowUpRight className="h-5 w-5 text-[#f4bd57]" />
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <DarkStat
                        label="Pipeline GMV"
                        value={formatBND(myData?.teamOverview.pipelineGmv || 0)}
                        detail={`${myData?.teamOverview.bookingOrders || 0} booking · ${myData?.teamOverview.readyOrders || 0} ready`}
                      />
                      <DarkStat
                        label="Realized GMV"
                        value={formatBND(myData?.teamOverview.realizedGmv || 0)}
                        detail={`${getConversionRate(
                          myData?.teamOverview.realizedGmv || 0,
                          myData?.teamOverview.pipelineGmv || 0,
                        )}% of total GMV realized`}
                      />
                    </div>
                  </div>
                </section>

                <div className="rounded-2xl border border-dashed border-border bg-muted/20 p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                      <TrendingUp className="h-4 w-4" />
                    </div>
                    <div>
                      <h3 className="font-semibold">Trend history is building</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Week-over-week and month-over-month comparisons will appear after enough KPI snapshots are recorded.
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>

        {isAdmin && (
          <AdminManagerRanking managers={rankedManagers} isLoading={allLoading} />
        )}
      </div>
    </AppLayout>
  );
}

function ImpactSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-[360px] w-full rounded-[28px]" />
      <Skeleton className="h-48 w-full rounded-2xl" />
    </div>
  );
}

function LeadershipStage({
  score,
  breakdown,
  periodLabel,
}: {
  score: number;
  breakdown?: {
    teamGrowth: number;
    bottom30Improvement: number;
    opsInterventions: number;
    personalContribution: number;
  };
  periodLabel: string;
}) {
  return (
    <section className="relative overflow-hidden rounded-[28px] border border-[#d49a2f]/40 bg-[#17130d] text-white shadow-[0_22px_70px_-42px_rgba(0,0,0,0.9)]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#f4bd57] to-transparent" />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.08),transparent_38%,rgba(212,154,47,0.10))]" />
      <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[0.75fr_1.25fr]">
        <div className="flex flex-col justify-between gap-6">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge className="rounded-full border border-[#d49a2f]/35 bg-[#d49a2f]/20 text-[#f7d18a]">
                Leadership score
              </Badge>
              <Badge className="rounded-full border border-white/10 bg-white/[0.07] text-white/70">
                {periodLabel}
              </Badge>
            </div>
            <p className="mt-5 text-[10px] font-bold uppercase tracking-[0.2em] text-white/50">Current impact</p>
            <div className="mt-1 flex items-end gap-2">
              <span className="text-7xl font-black leading-none tabular-nums text-[#f4bd57] sm:text-8xl">
                {score.toFixed(0)}
              </span>
              <span className="pb-2 text-lg font-semibold text-white/45">/ 100</span>
            </div>
            <p className="mt-3 max-w-sm text-sm leading-6 text-white/60">
              A direct view of team growth, coaching progress, operations, and personal delivery.
            </p>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-[#f4bd57] transition-[width] duration-500"
              style={{ width: `${Math.min(score, 100)}%` }}
            />
          </div>
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          {scoreMeta.map((item) => {
            const value = breakdown?.[item.key] || 0;
            return (
              <div key={item.key} className="rounded-2xl border border-white/10 bg-white/[0.07] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#d49a2f]/20 text-[#f4bd57]">
                    <item.icon className="h-4 w-4" />
                  </div>
                  <p className="text-xl font-black tabular-nums">
                    {value.toFixed(0)}
                    <span className="text-xs font-medium text-white/40">/{item.max}</span>
                  </p>
                </div>
                <p className="mt-3 text-sm font-semibold">{item.shortLabel}</p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-[#f4bd57]"
                    style={{ width: `${Math.min((value / item.max) * 100, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ScoreModel({
  breakdown,
}: {
  breakdown?: {
    teamGrowth: number;
    bottom30Improvement: number;
    opsInterventions: number;
    personalContribution: number;
  };
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-sm">
      <div className="flex items-center justify-between border-b border-border/50 p-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Score model</p>
          <h2 className="text-lg font-bold">What drives the score</h2>
        </div>
        <Award className="h-5 w-5 text-primary" />
      </div>
      <div>
        {scoreMeta.map((item) => {
          const value = breakdown?.[item.key] || 0;
          return (
            <div
              key={item.key}
              className="grid gap-3 border-b border-border/40 p-4 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <item.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold">{item.label}</p>
                  <p className="mt-0.5 text-sm leading-5 text-muted-foreground">{item.description}</p>
                </div>
              </div>
              <div className="flex items-center gap-3 pl-12 sm:pl-0">
                <div className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-muted sm:w-28">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${Math.min((value / item.max) * 100, 100)}%` }}
                  />
                </div>
                <p className="w-14 text-right text-sm font-bold tabular-nums">
                  {value.toFixed(0)}/{item.max}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function ImpactMetric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Target;
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

function SimplePanel({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
  description: string;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card/70 p-4 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-black tabular-nums">{value}</p>
      <p className="mt-2 text-sm leading-5 text-muted-foreground">{description}</p>
    </section>
  );
}

function DarkStat({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#f4bd57]">{label}</p>
      <p className="mt-2 truncate text-2xl font-black tabular-nums sm:text-3xl">{value}</p>
      <p className="mt-1 text-sm text-white/50">{detail}</p>
    </div>
  );
}

function getConversionRate(realized: number, pipeline: number) {
  const total = realized + pipeline;
  return total > 0 ? ((realized / total) * 100).toFixed(0) : '0';
}

type ManagerKpi = NonNullable<ReturnType<typeof useAllManagersKpi>['data']>[number];

function AdminManagerRanking({
  managers,
  isLoading,
}: {
  managers: ManagerKpi[];
  isLoading: boolean;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 shadow-sm">
      <div className="flex items-center justify-between border-b border-border/50 p-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-primary">Admin overview</p>
          <h2 className="text-lg font-bold">All manager impact</h2>
        </div>
        <Badge variant="outline" className="rounded-full">{managers.length} managers</Badge>
      </div>
      {isLoading ? (
        <div className="space-y-2 p-4">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      ) : managers.length ? (
        <div>
          {managers.map((manager, index) => {
            const relation = (
              manager as typeof manager & { manager?: { display_name?: string | null } | null }
            ).manager;
            const name = relation?.display_name || 'Unknown manager';
            return (
              <div
                key={manager.id}
                className="flex items-center gap-3 border-b border-border/40 p-3 last:border-b-0 hover:bg-muted/25 sm:p-4"
              >
                <ImpactRank rank={index + 1} />
                <Avatar className="h-10 w-10 border border-border/50">
                  <AvatarFallback className="bg-primary/10 font-bold text-primary">
                    {getInitials(name)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {manager.team_delivered_orders || 0} delivered · {formatBND(manager.team_realized_gmv_bnd || 0)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-black tabular-nums text-primary">
                    {(manager.leadership_score || 0).toFixed(0)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">score</p>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="p-8 text-center text-sm text-muted-foreground">No manager KPI data available yet.</p>
      )}
    </section>
  );
}

function ImpactRank({ rank }: { rank: number }) {
  const className = cn(
    'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black',
    rank === 1 && 'bg-[#f4bd57] text-[#17130d]',
    rank === 2 && 'bg-muted text-muted-foreground',
    rank === 3 && 'bg-[#c7772f]/20 text-[#c7772f]',
    rank > 3 && 'bg-muted/60 text-muted-foreground',
  );

  if (rank === 1) return <div className={className}><Crown className="h-4 w-4" /></div>;
  if (rank === 2) return <div className={className}><Medal className="h-4 w-4" /></div>;
  if (rank === 3) return <div className={className}><Award className="h-4 w-4" /></div>;
  return <div className={className}>{rank}</div>;
}
