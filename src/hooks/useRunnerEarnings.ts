import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface RunnerEarnings {
  today_earnings: number;
  today_orders: number;
  week_earnings: number;
  week_orders: number;
  month_earnings: number;
  month_orders: number;
  pending_amount: number;
  pending_orders: number;
  approved_amount: number;
  approved_orders: number;
  submitted_amount: number;
  submitted_orders: number;
  total_lifetime_earnings: number;
  total_lifetime_orders: number;
}

export interface DailyEarning {
  day: string;
  earnings: number;
  order_count: number;
}

export function useRunnerEarnings(runnerId?: string, runnerIds?: string[]) {
  const effectiveRunnerIds = Array.from(new Set(
    (runnerIds?.length ? runnerIds : runnerId ? [runnerId] : [])
      .map(id => id.trim())
      .filter(Boolean),
  )).sort();

  return useQuery({
    queryKey: ['runner-earnings', effectiveRunnerIds],
    queryFn: async () => {
      const summaries = await Promise.all(effectiveRunnerIds.map(async (sourceRunnerId) => {
        const { data, error } = await supabase.rpc('get_runner_earnings_summary', {
          p_runner_id: sourceRunnerId,
        });
        if (error) throw error;
        const summary = data as unknown as RunnerEarnings | RunnerEarnings[] | null;
        return Array.isArray(summary) ? summary[0] : summary;
      }));

      const empty: RunnerEarnings = {
        today_earnings: 0, today_orders: 0,
        week_earnings: 0, week_orders: 0,
        month_earnings: 0, month_orders: 0,
        pending_amount: 0, pending_orders: 0,
        approved_amount: 0, approved_orders: 0,
        submitted_amount: 0, submitted_orders: 0,
        total_lifetime_earnings: 0, total_lifetime_orders: 0,
      };

      return summaries.reduce<RunnerEarnings>((total, summary) => {
        if (!summary) return total;
        for (const key of Object.keys(empty) as (keyof RunnerEarnings)[]) {
          total[key] += Number(summary[key] || 0);
        }
        return total;
      }, empty);
    },
    enabled: effectiveRunnerIds.length > 0,
    staleTime: 30000,
    gcTime: 5 * 60 * 1000,
  });
}

export function useRunnerDailyEarnings(runnerId?: string, days: number = 7) {
  return useQuery({
    queryKey: ['runner-daily-earnings', runnerId, days],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_runner_daily_earnings', {
        p_runner_id: runnerId!,
        p_days: days,
      });
      if (error) throw error;
      return (data as unknown as DailyEarning[]) || [];
    },
    enabled: !!runnerId,
    staleTime: 60000,
    gcTime: 5 * 60 * 1000,
  });
}
