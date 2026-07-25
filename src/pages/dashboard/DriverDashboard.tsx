import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverAnalytics } from '@/hooks/useDriverAnalytics';
import { CalendarDays, ChevronRight, Navigation, Target } from 'lucide-react';

export function DriverDashboard() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const today = format(new Date(), 'yyyy-MM-dd');
  const { data: analytics, isLoading } = useDriverAnalytics(user?.id, {
    dateFrom: today,
    dateTo: today,
    calendarFrom: today,
    calendarTo: today,
  });
  const summary = analytics?.summary;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="border-b border-border pb-4">
        <p className="text-xs font-bold uppercase text-primary">Today</p>
        <h1 className="mt-1 text-2xl font-bold">{format(new Date(), 'EEEE, dd MMMM')}</h1>
      </header>

      <section className="grid grid-cols-2 gap-x-5 gap-y-5 border-b border-border pb-5">
        <div>
          <p className="text-sm text-muted-foreground">Today's jobs</p>
          {isLoading ? <Skeleton className="mt-2 h-8 w-20" /> : (
            <p className="mt-1 text-3xl font-bold">{summary?.assigned ?? 0}</p>
          )}
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Today's cash</p>
          {isLoading ? <Skeleton className="mt-2 h-8 w-28" /> : (
            <p className="mt-1 text-2xl font-bold">BND {(summary?.cashCollected ?? 0).toFixed(2)}</p>
          )}
        </div>
        <div className="col-span-2">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Delivery progress</span>
            <span className="font-bold">{summary?.delivered ?? 0} / {summary?.assigned ?? 0}</span>
          </div>
          <Progress value={summary?.deliveryRate ?? 0} className="h-2" />
          <p className="mt-2 text-xs text-muted-foreground">
            {summary?.pending ?? 0} pending · {summary?.failed ?? 0} failed
          </p>
        </div>
      </section>

      <Button className="h-12 w-full justify-between" onClick={() => navigate('/delivery?tab=inbox')}>
        <span className="inline-flex items-center gap-2">
          <Navigation className="h-4 w-4" />
          Open today's jobs
        </span>
        <ChevronRight className="h-4 w-4" />
      </Button>

      <section className="divide-y divide-border border-y border-border">
        <button
          type="button"
          onClick={() => navigate('/driver/analytics')}
          className="flex w-full items-center justify-between gap-3 py-4 text-left"
        >
          <span className="inline-flex items-center gap-3 font-semibold">
            <CalendarDays className="h-5 w-5 text-primary" />
            Delivery calendar
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </button>
        <button
          type="button"
          onClick={() => navigate('/driver/analytics')}
          className="flex w-full items-center justify-between gap-3 py-4 text-left"
        >
          <span className="inline-flex items-center gap-3 font-semibold">
            <Target className="h-5 w-5 text-primary" />
            Performance
          </span>
          <span className="inline-flex items-center gap-2 text-sm font-bold">
            {(summary?.deliveryRate ?? 0).toFixed(1)}%
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </span>
        </button>
      </section>
    </div>
  );
}
