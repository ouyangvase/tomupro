import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/contexts/AuthContext';
import { useDriverAnalytics } from '@/hooks/useDriverAnalytics';
import { AppLayout } from '@/components/layout/AppLayout';
import { Clock, MapPin, Package, Target } from 'lucide-react';
import { format, parseISO } from 'date-fns';

export default function DriverAnalyticsPage() {
  const { profile } = useAuth();
  const { data: analytics, isLoading } = useDriverAnalytics(profile?.id);

  if (isLoading) {
    return (
      <AppLayout>
        <div className="text-center py-12 text-muted-foreground">Loading analytics...</div>
      </AppLayout>
    );
  }

  if (!analytics) {
    return (
      <AppLayout>
        <div className="max-w-2xl mx-auto">
          <Card>
            <CardContent className="py-12 text-center">
              <Target className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h2 className="text-xl font-semibold mb-2">No Data Yet</h2>
              <p className="text-muted-foreground">
                Start delivering orders to see your performance analytics.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppLayout>
    );
  }

  const formatAmount = (value: number) => `BND ${Number(value || 0).toFixed(2)}`;
  const statusCards = [
    {
      title: 'Delivered',
      subtitle: 'Accepted by runner',
      metric: analytics.statusSummary.delivered,
      icon: Target,
      tone: 'bg-emerald-50 text-emerald-700',
    },
    {
      title: 'Failed',
      subtitle: 'Driver failed',
      metric: analytics.statusSummary.failed,
      icon: Package,
      tone: 'bg-red-50 text-red-700',
    },
    {
      title: 'Waiting Accept',
      subtitle: 'Delivered, waiting runner',
      metric: analytics.statusSummary.waitingAccept,
      icon: Clock,
      tone: 'bg-amber-50 text-amber-700',
    },
    {
      title: 'Failed Waiting',
      subtitle: 'Failed, waiting runner',
      metric: analytics.statusSummary.failedWaitingAccept,
      icon: MapPin,
      tone: 'bg-orange-50 text-orange-700',
    },
  ];
  const monthlyActivity = analytics.monthlyTrend.filter(
    (day) => day.delivered > 0 || day.failed > 0 || day.totalAmount > 0,
  );

  return (
    <AppLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6" />
            My Performance
          </h1>
          <p className="text-muted-foreground">Track your delivery performance and trends</p>
        </div>

      {/* Operational status summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {statusCards.map(({ title, subtitle, metric, icon: Icon, tone }) => (
          <Card key={title} className="border-border/70 shadow-sm">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    {title}
                  </p>
                  <p className="mt-1 text-3xl font-bold leading-none">{metric.count}</p>
                  <p className="mt-2 text-sm font-semibold text-foreground">{formatAmount(metric.amount)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>
                </div>
                <div className={`rounded-full p-2 ${tone}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="weekly">
        <TabsList>
          <TabsTrigger value="weekly">Weekly Trend</TabsTrigger>
          <TabsTrigger value="monthly">Monthly Trend</TabsTrigger>
          <TabsTrigger value="areas">Active Areas</TabsTrigger>
        </TabsList>

        <TabsContent value="weekly">
          <Card>
            <CardHeader>
              <CardTitle>This Week's Performance</CardTitle>
              <CardDescription>Accepted delivered orders, failed orders, and collection by day.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-7">
                {analytics.weeklyTrend.map((day) => (
                  <div key={day.date} className="rounded-2xl border bg-card p-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                      {format(parseISO(day.date), 'EEE')}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">{format(parseISO(day.date), 'dd MMM')}</p>
                    <div className="mt-3 space-y-1 text-sm">
                      <div className="flex items-center justify-between">
                        <span>Delivered</span>
                        <span className="font-semibold text-emerald-700">{day.delivered}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Failed</span>
                        <span className="font-semibold text-red-700">{day.failed}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Amount</span>
                        <span className="font-semibold">{formatAmount(day.totalAmount)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              {analytics.thisWeek.avgDeliveryTimeMinutes && (
                <div className="flex items-center gap-2 mt-4 text-sm text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  Average delivery time: {analytics.thisWeek.avgDeliveryTimeMinutes} minutes
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monthly">
          <Card>
            <CardHeader>
              <CardTitle>Monthly Performance</CardTitle>
              <CardDescription>Only active days are shown to keep the page light.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {monthlyActivity.length === 0 ? (
                  <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                    No delivery activity this month.
                  </div>
                ) : (
                  monthlyActivity.map((day) => (
                    <div key={day.date} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-3">
                      <div>
                        <p className="font-semibold">{format(parseISO(day.date), 'dd MMM yyyy')}</p>
                        <p className="text-sm text-muted-foreground">{formatAmount(day.totalAmount)} accepted delivered amount</p>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700">
                          {day.delivered} delivered
                        </Badge>
                        <Badge variant="outline" className="bg-red-50 text-red-700">
                          {day.failed} failed
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="areas">
          <div className="grid md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" />
                  Active Route Areas
                </CardTitle>
                <CardDescription>Current orders needing delivery by area</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {analytics.topAreas.length === 0 ? (
                    <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                      No active delivery areas.
                    </div>
                  ) : (
                    analytics.topAreas.map((area) => (
                      <div key={area.area} className="rounded-2xl border bg-card p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{area.area}</p>
                            <p className="text-sm text-muted-foreground">{formatAmount(area.totalAmount)} active collect</p>
                          </div>
                          <Badge variant="secondary">{area.deliveredCount} active</Badge>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active Area Statistics</CardTitle>
                <CardDescription>Today&apos;s assigned delivery workload by area</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[300px] overflow-y-auto">
                  {analytics.areaStats
                    .sort((a, b) => b.deliveredCount - a.deliveredCount)
                    .map(area => (
                      <div key={area.area} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                        <div>
                          <p className="font-medium text-sm">{area.area}</p>
                          <div className="flex gap-2 mt-1">
                            <Badge variant="outline" className="bg-green-50 text-green-700 text-xs">
                              {area.deliveredCount} active
                            </Badge>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-medium">BND {area.totalAmount.toLocaleString()}</p>
                          {area.avgDeliveryTime && (
                            <p className="text-xs text-muted-foreground flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {area.avgDeliveryTime}m avg
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
      </div>
    </AppLayout>
  );
}
