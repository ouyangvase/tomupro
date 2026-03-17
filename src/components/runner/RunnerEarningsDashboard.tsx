import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBND } from '@/lib/currency';
import { 
  DollarSign, TrendingUp, Clock, CheckCircle, 
  Wallet, Target, Zap, ArrowUpRight 
} from 'lucide-react';
import type { RunnerEarnings } from '@/hooks/useRunnerEarnings';

interface RunnerEarningsDashboardProps {
  earnings: RunnerEarnings | undefined;
  isLoading: boolean;
  weeklyTarget?: number;
}

export function RunnerEarningsDashboard({ 
  earnings, 
  isLoading, 
  weeklyTarget = 1000 
}: RunnerEarningsDashboardProps) {
  const weekProgress = earnings ? Math.min((earnings.week_earnings / weeklyTarget) * 100, 100) : 0;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => (
            <Card key={i} className="overflow-hidden">
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
        <Skeleton className="h-20 w-full rounded-xl" />
      </div>
    );
  }

  const e = earnings || {
    today_earnings: 0, today_orders: 0,
    week_earnings: 0, week_orders: 0,
    pending_amount: 0, pending_orders: 0,
    approved_amount: 0, approved_orders: 0,
    submitted_amount: 0, submitted_orders: 0,
    total_lifetime_earnings: 0, total_lifetime_orders: 0,
  } as RunnerEarnings;

  const cards = [
    {
      label: "Today's Earnings",
      value: e.today_earnings,
      subtitle: `${e.today_orders} deliveries`,
      icon: Zap,
      color: 'hsl(var(--chart-1))',
      bgClass: 'bg-[hsl(var(--chart-1)/0.1)]',
      borderClass: 'border-[hsl(var(--chart-1)/0.3)]',
      textClass: 'text-[hsl(var(--chart-1))]',
    },
    {
      label: "This Week",
      value: e.week_earnings,
      subtitle: `${e.week_orders} deliveries`,
      icon: TrendingUp,
      color: 'hsl(var(--status-success))',
      bgClass: 'bg-[hsl(var(--status-success)/0.1)]',
      borderClass: 'border-[hsl(var(--status-success)/0.3)]',
      textClass: 'text-[hsl(var(--status-success))]',
    },
    {
      label: "Pending Claim",
      value: e.pending_amount,
      subtitle: `${e.pending_orders} orders`,
      icon: Clock,
      color: 'hsl(var(--status-warning))',
      bgClass: 'bg-[hsl(var(--status-warning)/0.1)]',
      borderClass: 'border-[hsl(var(--status-warning)/0.3)]',
      textClass: 'text-[hsl(var(--status-warning))]',
    },
    {
      label: "Approved",
      value: e.approved_amount,
      subtitle: `${e.approved_orders} orders`,
      icon: CheckCircle,
      color: 'hsl(var(--status-success))',
      bgClass: 'bg-[hsl(var(--status-success)/0.08)]',
      borderClass: 'border-[hsl(var(--status-success)/0.25)]',
      textClass: 'text-[hsl(var(--status-success))]',
    },
  ];

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card 
              key={card.label} 
              className={`relative overflow-hidden ${card.borderClass} transition-all hover:shadow-md`}
            >
              <div className="absolute top-0 right-0 w-16 h-16 rounded-full -translate-y-1/2 translate-x-1/2 opacity-20" 
                   style={{ backgroundColor: card.color }} />
              <CardContent className="p-4 relative">
                <div className="flex items-center gap-2 mb-1.5">
                  <div className={`p-1.5 rounded-lg ${card.bgClass}`}>
                    <Icon className={`h-3.5 w-3.5 ${card.textClass}`} />
                  </div>
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    {card.label}
                  </p>
                </div>
                <p className={`text-2xl md:text-3xl font-extrabold tracking-tight ${card.textClass}`}>
                  {formatBND(card.value, false)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {card.subtitle}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Weekly Target Progress */}
      <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-transparent to-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-primary/10">
                <Target className="h-4 w-4 text-primary" />
              </div>
              <span className="text-sm font-semibold">Weekly Target</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-lg font-bold text-primary">{formatBND(e.week_earnings, false)}</span>
              <span className="text-sm text-muted-foreground">/ {formatBND(weeklyTarget, false)}</span>
            </div>
          </div>
          <Progress value={weekProgress} className="h-3" />
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-muted-foreground">
              {weekProgress >= 100 ? '🎉 Target reached!' : `${(weeklyTarget - e.week_earnings).toFixed(0)} BND to go`}
            </span>
            <span className="text-xs font-medium text-primary">
              {weekProgress.toFixed(0)}%
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Wallet Summary */}
      <Card className="border-border/50 bg-gradient-to-br from-card via-card to-primary/5">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-primary/10">
                <Wallet className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Runner Balance</p>
                <p className="text-2xl font-extrabold tracking-tight">
                  {formatBND(e.approved_amount + e.pending_amount + e.submitted_amount)}
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-1 items-end text-right">
              <div className="flex items-center gap-1.5 text-xs">
                <div className="h-2 w-2 rounded-full bg-[hsl(var(--status-warning))]" />
                <span className="text-muted-foreground">Pending</span>
                <span className="font-semibold">{formatBND(e.pending_amount, false)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <div className="h-2 w-2 rounded-full bg-[hsl(var(--chart-1))]" />
                <span className="text-muted-foreground">Submitted</span>
                <span className="font-semibold">{formatBND(e.submitted_amount, false)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs">
                <div className="h-2 w-2 rounded-full bg-[hsl(var(--status-success))]" />
                <span className="text-muted-foreground">Approved</span>
                <span className="font-semibold">{formatBND(e.approved_amount, false)}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
