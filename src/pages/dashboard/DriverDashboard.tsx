import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverAnalytics } from '@/hooks/useDriverAnalytics';
import { useDriverAssignments } from '@/hooks/useDriverAssignments';
import { useDriverAllocatedStock, useDriverPickups } from '@/hooks/useDriverPickups';
import { useDriverReturnRequired } from '@/hooks/useDriverReturnRequired';
import { useDriverReturns } from '@/hooks/useDriverReturns';
import {
  Boxes,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Navigation,
  PackageCheck,
  RotateCcw,
  Target,
} from 'lucide-react';

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
  const { data: activeJobs = [], isLoading: isLoadingActiveJobs } = useDriverAssignments({
    driverId: user?.id,
    dateTo: today,
    activeOnly: true,
    includeItems: false,
  });
  const { data: pickups = [] } = useDriverPickups();
  const { data: returns = [] } = useDriverReturns();
  const { data: allocatedStock = [] } = useDriverAllocatedStock();
  const { data: returnRequired } = useDriverReturnRequired();
  const summary = analytics?.summary;
  const pendingPickup = pickups.find((pickup) =>
    pickup.pickup_date.slice(0, 10) === today
    && (pickup.status === 'PENDING_DRIVER_ACK' || pickup.status === 'DRIVER_ACKED'));
  const pendingReturn = returns.find((driverReturn) => driverReturn.status === 'PENDING_RUNNER_ACK');
  const stockQty = allocatedStock.reduce((sum, item) => sum + Number(item.allocated_qty || 0), 0);

  const nextStep = pendingPickup
    ? {
        eyebrow: 'Pickup ready',
        title: 'Collect your stock before delivery',
        detail: `${(pendingPickup.items || []).reduce((sum, item) => sum + Number(item.qty || 0), 0)} item(s) prepared by your runner`,
        action: 'Accept pickup',
        href: '/delivery/pickups',
        icon: PackageCheck,
      }
    : pendingReturn
      ? {
          eyebrow: 'Return submitted',
          title: 'Waiting for runner acceptance',
          detail: 'Your return is already submitted. No second driver action is needed.',
          action: 'View return',
          href: '/delivery/returns',
          icon: Clock3,
        }
      : returnRequired?.isReturnRequired
        ? {
            eyebrow: 'Return required',
            title: 'Return remaining stock',
            detail: `${returnRequired.totalMustReturn} item(s) need runner acknowledgement`,
            action: 'Start return',
            href: '/delivery/returns',
            icon: RotateCcw,
          }
        : activeJobs.length > 0
          ? {
              eyebrow: 'Ready to deliver',
              title: `${activeJobs.length} job(s) waiting`,
              detail: 'Open your route and complete the next delivery.',
              action: 'Open deliveries',
              href: '/delivery/inbox',
              icon: Navigation,
            }
          : {
              eyebrow: 'All clear',
              title: 'Today is complete',
              detail: 'No pickup, return, or delivery action is waiting.',
              action: 'View calendar',
              href: '/delivery/analytics',
              icon: CheckCircle2,
            };
  const NextStepIcon = nextStep.icon;

  return (
    <div className="mx-auto w-full min-w-0 max-w-2xl space-y-5 overflow-x-hidden pb-24">
      <header className="border-b border-border pb-4">
        <p className="text-xs font-bold uppercase text-primary">Today</p>
        <h1 className="mt-1 text-2xl font-bold">{format(new Date(), 'EEEE, dd MMMM')}</h1>
      </header>

      <section className="border-b border-border pb-5">
        <p className="text-xs font-bold uppercase text-primary">{nextStep.eyebrow}</p>
        <div className="mt-2 flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <NextStepIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-lg font-bold">{nextStep.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{nextStep.detail}</p>
          </div>
        </div>
        <Button className="mt-4 h-11 w-full justify-between" onClick={() => navigate(nextStep.href)}>
          {nextStep.action}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </section>

      <section className="grid grid-cols-2 gap-x-5 gap-y-5 border-b border-border pb-5">
        <div>
          <p className="text-sm text-muted-foreground">Today's jobs</p>
          {isLoadingActiveJobs ? <Skeleton className="mt-2 h-8 w-20" /> : (
            <p className="mt-1 text-3xl font-bold">{activeJobs.length}</p>
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

      <section className="border-b border-border pb-5">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center gap-2 font-semibold">
            <Boxes className="h-5 w-5 text-primary" />
            Stock on hand
          </span>
          <span className="text-xl font-bold">{stockQty}</span>
        </div>
        {allocatedStock.length > 0 && (
          <div className="mt-3 divide-y divide-border border-y border-border">
            {allocatedStock.slice(0, 3).map((item) => (
              <div key={item.product_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span className="min-w-0 truncate">{item.sku_code || item.sku_name}</span>
                <span className="font-bold">{item.allocated_qty}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="divide-y divide-border border-y border-border">
        <button
          type="button"
          onClick={() => navigate('/delivery/analytics')}
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
          onClick={() => navigate('/delivery/analytics')}
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
