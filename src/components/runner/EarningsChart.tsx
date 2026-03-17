import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { formatBND } from '@/lib/currency';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useRunnerDailyEarnings } from '@/hooks/useRunnerEarnings';
import { BarChart3 } from 'lucide-react';
import { format, parseISO } from 'date-fns';

interface EarningsChartProps {
  runnerId?: string;
}

const periodDays: Record<string, number> = {
  daily: 7,
  weekly: 28,
  monthly: 90,
};

export function EarningsChart({ runnerId }: EarningsChartProps) {
  const [period, setPeriod] = useState('daily');
  const days = periodDays[period];

  const { data: dailyData = [], isLoading } = useRunnerDailyEarnings(runnerId, days);

  // Aggregate by period
  const chartData = (() => {
    if (period === 'daily') {
      return dailyData.map(d => ({
        label: format(parseISO(d.day), 'EEE'),
        fullLabel: format(parseISO(d.day), 'MMM dd'),
        earnings: Number(d.earnings),
        orders: Number(d.order_count),
      }));
    }
    if (period === 'weekly') {
      // Group by week
      const weeks: Record<string, { earnings: number; orders: number; start: string }> = {};
      dailyData.forEach(d => {
        const date = parseISO(d.day);
        const weekKey = format(date, 'yyyy-ww');
        if (!weeks[weekKey]) {
          weeks[weekKey] = { earnings: 0, orders: 0, start: d.day };
        }
        weeks[weekKey].earnings += Number(d.earnings);
        weeks[weekKey].orders += Number(d.order_count);
      });
      return Object.values(weeks).map(w => ({
        label: format(parseISO(w.start), 'MMM dd'),
        fullLabel: `Week of ${format(parseISO(w.start), 'MMM dd')}`,
        earnings: w.earnings,
        orders: w.orders,
      }));
    }
    // Monthly
    const months: Record<string, { earnings: number; orders: number }> = {};
    dailyData.forEach(d => {
      const monthKey = format(parseISO(d.day), 'MMM yyyy');
      if (!months[monthKey]) {
        months[monthKey] = { earnings: 0, orders: 0 };
      }
      months[monthKey].earnings += Number(d.earnings);
      months[monthKey].orders += Number(d.order_count);
    });
    return Object.entries(months).map(([label, data]) => ({
      label,
      fullLabel: label,
      earnings: data.earnings,
      orders: data.orders,
    }));
  })();

  const totalEarnings = chartData.reduce((sum, d) => sum + d.earnings, 0);
  const totalOrders = chartData.reduce((sum, d) => sum + d.orders, 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            Earnings Overview
          </CardTitle>
          <Tabs value={period} onValueChange={setPeriod}>
            <TabsList className="h-9">
              <TabsTrigger value="daily" className="text-xs px-3 py-1.5">Daily</TabsTrigger>
              <TabsTrigger value="weekly" className="text-xs px-3 py-1.5">Weekly</TabsTrigger>
              <TabsTrigger value="monthly" className="text-xs px-3 py-1.5">Monthly</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="flex gap-4 text-sm text-muted-foreground mt-1">
          <span>Total: <strong className="text-foreground">{formatBND(totalEarnings)}</strong></span>
          <span>Orders: <strong className="text-foreground">{totalOrders}</strong></span>
        </div>
      </CardHeader>
      <CardContent className="pt-2">
        {isLoading ? (
          <Skeleton className="h-48 w-full rounded-lg" />
        ) : chartData.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            No earnings data yet
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
              <XAxis 
                dataKey="label" 
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis 
                tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                axisLine={false}
                tickLine={false}
                width={45}
              />
              <Tooltip 
                cursor={{ fill: 'hsl(var(--muted)/0.3)' }}
                content={({ active, payload }) => {
                  if (!active || !payload?.[0]) return null;
                  const data = payload[0].payload;
                  return (
                    <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
                      <p className="text-xs text-muted-foreground">{data.fullLabel}</p>
                      <p className="text-sm font-bold text-primary">{formatBND(data.earnings)}</p>
                      <p className="text-xs text-muted-foreground">{data.orders} orders</p>
                    </div>
                  );
                }}
              />
              <Bar 
                dataKey="earnings" 
                fill="hsl(var(--primary))" 
                radius={[6, 6, 0, 0]}
                maxBarSize={48}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
