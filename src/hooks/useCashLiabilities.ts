import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logAudit } from '@/hooks/useAuditLogs';
import { format, isToday, parseISO } from 'date-fns';

export interface CashLiability {
  id: string;
  runner_id: string;
  driver_id: string | null;
  order_id: string;
  order_code: string;
  customer_name: string | null;
  cash_amount: number;
  delivered_at: string;
  status: 'OPEN' | 'SETTLED';
  settlement_batch_id: string | null;
  created_at: string;
  settled_at: string | null;
  driver?: { display_name: string };
}

export interface CashSettlementBatch {
  id: string;
  runner_id: string;
  total_amount: number;
  order_count: number;
  status: 'SETTLED';
  settled_at: string;
  settled_by: string;
  note: string | null;
  created_at: string;
  runner?: { display_name: string };
  settled_by_profile?: { display_name: string };
}

export interface DriverGroupedLiabilities {
  driverId: string;
  driverName: string;
  liabilities: CashLiability[];
  totalAmount: number;
}

export interface GroupedLiabilities {
  byDriver: DriverGroupedLiabilities[];
  totalOpen: number;
  totalOpenAmount: number;
  driverCount: number;
}

// Get open cash liabilities for current runner, grouped by driver
export function useRunnerCashLiabilities() {
  return useQuery({
    queryKey: ['runner-cash-liabilities'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { byDriver: [], totalOpen: 0, totalOpenAmount: 0, driverCount: 0 } as GroupedLiabilities;

      const { data, error } = await supabase
        .from('cash_liabilities')
        .select(`
          *,
          driver:profiles!cash_liabilities_driver_id_fkey(display_name)
        `)
        .eq('runner_id', user.id)
        .eq('status', 'OPEN')
        .order('delivered_at', { ascending: false });

      if (error) throw error;

      const liabilities = (data || []) as CashLiability[];
      
      // Group by driver
      const driverMap = new Map<string, DriverGroupedLiabilities>();

      liabilities.forEach(liability => {
        const driverId = liability.driver_id || 'unknown';
        const driverName = liability.driver?.display_name || 'Unknown Driver';
        
        if (!driverMap.has(driverId)) {
          driverMap.set(driverId, {
            driverId,
            driverName,
            liabilities: [],
            totalAmount: 0,
          });
        }
        
        const group = driverMap.get(driverId)!;
        group.liabilities.push(liability);
        group.totalAmount += Number(liability.cash_amount);
      });

      // Convert map to sorted array (highest amount first)
      const byDriver = Array.from(driverMap.values())
        .sort((a, b) => b.totalAmount - a.totalAmount);

      return {
        byDriver,
        totalOpen: liabilities.length,
        totalOpenAmount: liabilities.reduce((sum, l) => sum + Number(l.cash_amount), 0),
        driverCount: driverMap.size,
      } as GroupedLiabilities;
    },
  });
}

// Get settlement history for current runner
export function useRunnerSettlementHistory() {
  return useQuery({
    queryKey: ['runner-settlement-history'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from('cash_settlement_batches')
        .select('*')
        .eq('runner_id', user.id)
        .order('settled_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return data as CashSettlementBatch[];
    },
  });
}

// Settle open cash liabilities for a specific driver
export function useSettleDriverCash() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ driverId, note }: { driverId: string; note?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get all open liabilities for this runner from specific driver
      const { data: openLiabilities, error: fetchError } = await supabase
        .from('cash_liabilities')
        .select('*')
        .eq('runner_id', user.id)
        .eq('driver_id', driverId)
        .eq('status', 'OPEN');

      if (fetchError) throw fetchError;
      if (!openLiabilities || openLiabilities.length === 0) {
        throw new Error('No open liabilities to settle for this driver');
      }

      const totalAmount = openLiabilities.reduce((sum, l) => sum + Number(l.cash_amount), 0);
      const orderCount = openLiabilities.length;

      // Create settlement batch
      const { data: batch, error: batchError } = await supabase
        .from('cash_settlement_batches')
        .insert({
          runner_id: user.id,
          total_amount: totalAmount,
          order_count: orderCount,
          settled_by: user.id,
          note: note || `Settled from driver`,
        })
        .select()
        .single();

      if (batchError) throw batchError;

      // Update all liabilities to SETTLED
      const liabilityIds = openLiabilities.map(l => l.id);
      const { error: updateError } = await supabase
        .from('cash_liabilities')
        .update({
          status: 'SETTLED',
          settlement_batch_id: batch.id,
          settled_at: new Date().toISOString(),
        })
        .in('id', liabilityIds);

      if (updateError) throw updateError;

      // Audit log
      await logAudit({
        entity_type: 'cash_settlement_batch',
        entity_id: batch.id,
        action: 'DRIVER_CASH_SETTLED',
        before_json: { driver_id: driverId, open_liabilities: orderCount },
        after_json: { settled_amount: totalAmount, order_count: orderCount },
      });

      return batch;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runner-cash-liabilities'] });
      queryClient.invalidateQueries({ queryKey: ['runner-settlement-history'] });
      toast.success('Cash from driver settled');
    },
    onError: (error: Error) => {
      toast.error(`Settlement failed: ${error.message}`);
    },
  });
}

// Settle all open cash liabilities (legacy)
export function useSettleCash() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ note }: { note?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Get all open liabilities for this runner
      const { data: openLiabilities, error: fetchError } = await supabase
        .from('cash_liabilities')
        .select('*')
        .eq('runner_id', user.id)
        .eq('status', 'OPEN');

      if (fetchError) throw fetchError;
      if (!openLiabilities || openLiabilities.length === 0) {
        throw new Error('No open liabilities to settle');
      }

      const totalAmount = openLiabilities.reduce((sum, l) => sum + Number(l.cash_amount), 0);
      const orderCount = openLiabilities.length;

      // Create settlement batch
      const { data: batch, error: batchError } = await supabase
        .from('cash_settlement_batches')
        .insert({
          runner_id: user.id,
          total_amount: totalAmount,
          order_count: orderCount,
          settled_by: user.id,
          note: note || null,
        })
        .select()
        .single();

      if (batchError) throw batchError;

      // Update all liabilities to SETTLED
      const liabilityIds = openLiabilities.map(l => l.id);
      const { error: updateError } = await supabase
        .from('cash_liabilities')
        .update({
          status: 'SETTLED',
          settlement_batch_id: batch.id,
          settled_at: new Date().toISOString(),
        })
        .in('id', liabilityIds);

      if (updateError) throw updateError;

      // Audit log
      await logAudit({
        entity_type: 'cash_settlement_batch',
        entity_id: batch.id,
        action: 'CASH_SETTLED',
        before_json: { open_liabilities: orderCount },
        after_json: { settled_amount: totalAmount, order_count: orderCount },
      });

      return batch;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runner-cash-liabilities'] });
      queryClient.invalidateQueries({ queryKey: ['runner-settlement-history'] });
      toast.success('Cash settlement confirmed');
    },
    onError: (error: Error) => {
      toast.error(`Settlement failed: ${error.message}`);
    },
  });
}

// Admin: Get all cash liabilities with filters
export function useAdminCashLiabilities(filters: {
  runnerId?: string;
  status?: 'OPEN' | 'SETTLED' | 'all';
  startDate?: string;
  endDate?: string;
}) {
  return useQuery({
    queryKey: ['admin-cash-liabilities', filters],
    queryFn: async () => {
      let query = supabase
        .from('cash_liabilities')
        .select('*')
        .order('delivered_at', { ascending: false });

      if (filters.runnerId) {
        query = query.eq('runner_id', filters.runnerId);
      }

      if (filters.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
      }

      if (filters.startDate) {
        query = query.gte('delivered_at', filters.startDate);
      }

      if (filters.endDate) {
        query = query.lte('delivered_at', filters.endDate + 'T23:59:59');
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as CashLiability[];
    },
  });
}

// Admin: Get summary stats
export function useAdminCashLiabilitySummary() {
  return useQuery({
    queryKey: ['admin-cash-liability-summary'],
    queryFn: async () => {
      // Get total open
      const { data: openData, error: openError } = await supabase
        .from('cash_liabilities')
        .select('cash_amount')
        .eq('status', 'OPEN');

      if (openError) throw openError;

      // Get today's settled
      const today = format(new Date(), 'yyyy-MM-dd');
      const { data: settledToday, error: settledError } = await supabase
        .from('cash_settlement_batches')
        .select('total_amount')
        .gte('settled_at', today);

      if (settledError) throw settledError;

      // Get distinct runners with open liabilities
      const { data: runnersData, error: runnersError } = await supabase
        .from('cash_liabilities')
        .select('runner_id')
        .eq('status', 'OPEN');

      if (runnersError) throw runnersError;

      const uniqueRunners = new Set(runnersData?.map(r => r.runner_id) || []);

      return {
        totalOutstanding: openData?.reduce((sum, l) => sum + Number(l.cash_amount), 0) || 0,
        openCount: openData?.length || 0,
        settledToday: settledToday?.reduce((sum, b) => sum + Number(b.total_amount), 0) || 0,
        runnersWithOpenLiabilities: uniqueRunners.size,
      };
    },
  });
}

// Admin: Get all settlement batches
export function useAdminSettlementBatches(runnerId?: string) {
  return useQuery({
    queryKey: ['admin-settlement-batches', runnerId],
    queryFn: async () => {
      let query = supabase
        .from('cash_settlement_batches')
        .select('*')
        .order('settled_at', { ascending: false })
        .limit(100);

      if (runnerId) {
        query = query.eq('runner_id', runnerId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as CashSettlementBatch[];
    },
  });
}

// Create cash liability (called when runner accepts COD delivery) - LEGACY
export async function createCashLiability(params: {
  runnerId: string;
  orderId: string;
  orderCode: string;
  customerName: string | null;
  cashAmount: number;
}) {
  const { data, error } = await supabase
    .from('cash_liabilities')
    .insert({
      runner_id: params.runnerId,
      order_id: params.orderId,
      order_code: params.orderCode,
      customer_name: params.customerName,
      cash_amount: params.cashAmount,
      delivered_at: new Date().toISOString(),
      status: 'OPEN',
    })
    .select()
    .single();

  if (error) {
    // Ignore duplicate key errors (order already has liability)
    if (error.code === '23505') {
      console.warn('Cash liability already exists for order:', params.orderId);
      return null;
    }
    throw error;
  }

  return data;
}

// Create cash liability for driver-to-runner flow
// Called when driver marks delivered with CASH payment
export async function createDriverCashLiability(params: {
  driverId: string;
  runnerId: string;
  orderId: string;
  orderCode: string;
  customerName: string | null;
  cashAmount: number;
}) {
  const { data, error } = await supabase
    .from('cash_liabilities')
    .insert({
      driver_id: params.driverId,
      runner_id: params.runnerId,
      order_id: params.orderId,
      order_code: params.orderCode,
      customer_name: params.customerName,
      cash_amount: params.cashAmount,
      delivered_at: new Date().toISOString(),
      status: 'OPEN',
    })
    .select()
    .single();

  if (error) {
    // Ignore duplicate key errors (order already has liability)
    if (error.code === '23505') {
      console.warn('Cash liability already exists for order:', params.orderId);
      return null;
    }
    throw error;
  }

  return data;
}
