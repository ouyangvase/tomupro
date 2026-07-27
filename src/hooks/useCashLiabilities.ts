import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { useAuth } from '@/contexts/AuthContext';

// ============== Driver Deliveries Today Hook ==============
// Used by RunnerCashDriver page to show Excel-style list of today's deliveries

export interface DriverDeliveryToday {
  id: string;
  order_code: string;
  customer_name: string | null;
  total_amount: number;
  driver_id: string | null;
  driver_payment_method: string | null;
  driver_delivered_at: string | null;
  driver: { display_name: string } | null;
}

export function useDriverDeliveriesToday(driverFilter?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['driver-deliveries-today', driverFilter],
    queryFn: async () => {
      if (!user?.id) return [];

      const today = format(new Date(), 'yyyy-MM-dd');

      let query = supabase
        .from('orders')
        .select(`
          id,
          order_code,
          customer_name,
          total_amount,
          driver_id,
          driver_payment_method,
          driver_delivered_at,
          driver:profiles!orders_driver_id_fkey(display_name)
        `)
        .eq('runner_id', user.id)
        .eq('driver_status', 'DRIVER_DELIVERED')
        .gte('driver_delivered_at', today)
        .order('driver_delivered_at', { ascending: false });
      
      if (driverFilter && driverFilter !== 'all') {
        query = query.eq('driver_id', driverFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as DriverDeliveryToday[];
    },
  });
}

export interface CashLiability {
  id: string;
  runner_id: string;
  driver_id: string | null;
  order_id: string;
  order_code: string;
  customer_name: string | null;
  cash_amount: number;
  delivered_at: string;
  status: 'OPEN' | 'PENDING_HANDOVER' | 'SETTLED';
  settlement_batch_id: string | null;
  created_at: string;
  settled_at: string | null;
  driver?: { display_name: string };
  order?: { order_items: Array<{ qty: number }> } | null;
}

export interface CashSettlementBatch {
  id: string;
  runner_id: string;
  assistant_id: string | null;
  settlement_date: string | null;
  total_amount: number;
  order_count: number;
  status: 'PENDING_ACK' | 'SETTLED';
  runner_confirmed_at: string | null;
  runner_confirmed_by: string | null;
  assistant_acknowledged_at: string | null;
  assistant_acknowledged_by: string | null;
  settled_at: string | null;
  settled_by: string | null;
  note: string | null;
  created_at: string;
  runner?: { display_name: string };
  settled_by_profile?: { display_name: string };
  assistant?: { display_name: string; email: string | null } | null;
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
  liabilities: CashLiability[];
  pendingHandover: CashLiability[];
  pendingHandoverAmount: number;
}

export interface CashSettlementAssistant {
  assistant_id: string;
  assistant: { display_name: string; email: string | null } | null;
}

export interface AcceptedDriverDelivery {
  id: string;
  order_code: string;
  total_amount: number;
  delivered_at: string | null;
  driver_id: string | null;
  driver: { display_name: string } | null;
  order_items: Array<{ qty: number }>;
}

export function useRunnerAcceptedDriverDeliveries(runnerIdOverride?: string) {
  const { user } = useAuth();
  const runnerScopeId = runnerIdOverride || user?.id;

  return useQuery({
    queryKey: ['runner-accepted-driver-deliveries', runnerScopeId],
    enabled: Boolean(runnerScopeId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, order_code, total_amount, delivered_at, driver_id, driver:profiles!orders_driver_id_fkey(display_name), order_items(qty)')
        .eq('runner_id', runnerScopeId!)
        .eq('driver_status', 'DRIVER_DELIVERED')
        .eq('runner_accept_status', 'ACCEPTED')
        .not('driver_id', 'is', null)
        .order('delivered_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      return (data || []) as AcceptedDriverDelivery[];
    },
  });
}

// Get open cash liabilities for current runner, grouped by driver
export function useRunnerCashLiabilities(runnerIdOverride?: string) {
  const { user } = useAuth();
  const runnerScopeId = runnerIdOverride || user?.id;

  return useQuery({
    queryKey: ['runner-cash-liabilities', runnerScopeId],
    queryFn: async () => {
      if (!runnerScopeId) {
        return {
          byDriver: [],
          totalOpen: 0,
          totalOpenAmount: 0,
          driverCount: 0,
          liabilities: [],
          pendingHandover: [],
          pendingHandoverAmount: 0,
        } as GroupedLiabilities;
      }

      const { data, error } = await supabase
        .from('cash_liabilities')
        .select(`
          *,
          driver:profiles!cash_liabilities_driver_id_fkey(display_name),
          order:orders!cash_liabilities_order_id_fkey(order_items(qty))
        `)
        .eq('runner_id', runnerScopeId)
        .in('status', ['OPEN', 'PENDING_HANDOVER'])
        .order('delivered_at', { ascending: false });

      if (error) throw error;

      const liabilities = (data || []) as unknown as CashLiability[];
      const openLiabilities = liabilities.filter((liability) => liability.status === 'OPEN');
      const pendingHandover = liabilities.filter((liability) => liability.status === 'PENDING_HANDOVER');
      
      // Group by driver
      const driverMap = new Map<string, DriverGroupedLiabilities>();

      openLiabilities.forEach(liability => {
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
        totalOpen: openLiabilities.length,
        totalOpenAmount: openLiabilities.reduce((sum, l) => sum + Number(l.cash_amount), 0),
        driverCount: driverMap.size,
        liabilities: openLiabilities,
        pendingHandover,
        pendingHandoverAmount: pendingHandover.reduce((sum, l) => sum + Number(l.cash_amount), 0),
      } as GroupedLiabilities;
    },
  });
}

export function useCashSettlementAssistants(runnerId?: string) {
  return useQuery({
    queryKey: ['cash-settlement-assistants', runnerId],
    enabled: Boolean(runnerId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('runner_assistants')
        .select('assistant_id, assistant:profiles!runner_assistants_assistant_id_fkey(display_name, email)')
        .eq('runner_id', runnerId!)
        .eq('is_active', true)
        .eq('can_manage_cash_settlement', true)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as unknown as CashSettlementAssistant[];
    },
  });
}

// Get pending and completed cash handovers for the current Runner scope.
export function useRunnerSettlementHistory(runnerIdOverride?: string) {
  const { user } = useAuth();
  const runnerScopeId = runnerIdOverride || user?.id;

  return useQuery({
    queryKey: ['runner-settlement-history', runnerScopeId],
    queryFn: async () => {
      if (!runnerScopeId) return [];

      const { data, error } = await supabase
        .from('cash_settlement_batches')
        .select('*, assistant:profiles!cash_settlement_batches_assistant_id_fkey(display_name, email)')
        .eq('runner_id', runnerScopeId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as unknown as CashSettlementBatch[];
    },
  });
}

export function useCreateCashHandover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ assistantId, settlementDate }: { assistantId: string; settlementDate: string }) => {
      const { data, error } = await supabase.rpc('create_cash_handover', {
        p_assistant_id: assistantId,
        p_settlement_date: settlementDate,
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string };
      if (!result?.success) throw new Error(result?.error || 'Unable to create cash handover');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runner-cash-liabilities'] });
      queryClient.invalidateQueries({ queryKey: ['runner-settlement-history'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      toast.success('Sent to assistant for acknowledgement');
    },
    onError: (error: Error) => {
      toast.error(`Cash handover failed: ${error.message}`);
    },
  });
}

export function useAcknowledgeCashHandover() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (batchId: string) => {
      const { data, error } = await supabase.rpc('acknowledge_cash_handover', {
        p_batch_id: batchId,
      });
      if (error) throw error;
      const result = data as { success?: boolean; error?: string };
      if (!result?.success) throw new Error(result?.error || 'Unable to acknowledge cash handover');
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runner-cash-liabilities'] });
      queryClient.invalidateQueries({ queryKey: ['runner-settlement-history'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      toast.success('Cash handover acknowledged');
    },
    onError: (error: Error) => {
      toast.error(`Acknowledgement failed: ${error.message}`);
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
