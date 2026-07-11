import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { format, startOfMonth, endOfMonth } from 'date-fns';

export type CommissionMode = 'PER_ORDER' | 'PERCENTAGE';
export type TargetType = 'ORDER_COUNT' | 'SALES_VALUE';

export interface CommissionSettings {
  id: string;
  salesperson_id: string;
  commission_mode: CommissionMode;
  base_value: number;
  is_tiered: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface CommissionTier {
  id: string;
  settings_id: string;
  tier_order: number;
  min_orders: number;
  max_orders: number | null;
  tier_value: number;
  created_at: string;
}

export interface SalespersonTarget {
  id: string;
  salesperson_id: string;
  year_month: string;
  target_type: TargetType;
  target_value: number;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
}

export interface CommissionSnapshot {
  id: string;
  order_id: string;
  salesperson_id: string;
  commission_mode: CommissionMode;
  commission_value: number;
  commission_base_amount: number;
  commission_amount: number;
  tier_applied: number | null;
  year_month: string;
  order_sequence_in_month: number;
  created_at: string;
  reconciled_at: string;
}

export interface CommissionDashboardStats {
  // Monthly target
  monthlyTarget: {
    type: TargetType;
    value: number;
  } | null;
  achievedValue: number;
  targetProgress: number;
  remainingToTarget: number;
  
  // Commission amounts
  estimatedCommission: number; // Delivered but not reconciled
  finalCommission: number; // Reconciled & approved
  totalCommission: number;
  
  // Order counts
  monthlyDeliveredCount: number;
  monthlyReconciledCount: number;
  
  // Tier progress
  currentTier: number | null;
  nextTierAt: number | null;
  ordersToNextTier: number | null;
  currentTierValue: number | null;
  nextTierValue: number | null;
  
  // Settings
  commissionMode: CommissionMode | null;
  baseValue: number | null;
  isTiered: boolean;
}

// Get current month in YYYY-MM format
function getCurrentYearMonth(): string {
  return format(new Date(), 'yyyy-MM');
}

// Hook to get commission settings for a salesperson
export function useCommissionSettings(salespersonId?: string) {
  const { user } = useAuth();
  const targetId = salespersonId || user?.id;

  return useQuery({
    queryKey: ['commission-settings', targetId],
    queryFn: async () => {
      if (!targetId) throw new Error('No salesperson ID');
      
      const { data, error } = await supabase
        .from('commission_settings')
        .select('*')
        .eq('salesperson_id', targetId)
        .maybeSingle();
      
      if (error) throw error;
      return data as CommissionSettings | null;
    },
    enabled: !!targetId,
  });
}

// Hook to get commission tiers for settings
export function useCommissionTiers(settingsId?: string) {
  return useQuery({
    queryKey: ['commission-tiers', settingsId],
    queryFn: async () => {
      if (!settingsId) return [];
      
      const { data, error } = await supabase
        .from('commission_tiers')
        .select('*')
        .eq('settings_id', settingsId)
        .order('tier_order', { ascending: true });
      
      if (error) throw error;
      return data as CommissionTier[];
    },
    enabled: !!settingsId,
  });
}

// Hook to get monthly target
export function useSalespersonTarget(salespersonId?: string, yearMonth?: string) {
  const { user } = useAuth();
  const targetId = salespersonId || user?.id;
  const month = yearMonth || getCurrentYearMonth();

  return useQuery({
    queryKey: ['salesperson-target', targetId, month],
    queryFn: async () => {
      if (!targetId) throw new Error('No salesperson ID');
      
      const { data, error } = await supabase
        .from('salesperson_targets')
        .select('*')
        .eq('salesperson_id', targetId)
        .eq('year_month', month)
        .maybeSingle();
      
      if (error) throw error;
      return data as SalespersonTarget | null;
    },
    enabled: !!targetId,
  });
}

// Hook to get commission snapshots for a salesperson
export function useCommissionSnapshots(salespersonId?: string, yearMonth?: string) {
  const { user } = useAuth();
  const targetId = salespersonId || user?.id;
  const month = yearMonth || getCurrentYearMonth();

  return useQuery({
    queryKey: ['commission-snapshots', targetId, month],
    queryFn: async () => {
      if (!targetId) throw new Error('No salesperson ID');
      
      const { data, error } = await supabase
        .from('commission_snapshots')
        .select('*')
        .eq('salesperson_id', targetId)
        .eq('year_month', month)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      return data as CommissionSnapshot[];
    },
    enabled: !!targetId,
  });
}

// Hook to get comprehensive commission dashboard stats
export function useCommissionDashboard(salespersonId?: string) {
  const { user } = useAuth();
  const targetId = salespersonId || user?.id;
  const currentMonth = getCurrentYearMonth();
  const monthStart = startOfMonth(new Date()).toISOString();
  const monthEnd = endOfMonth(new Date()).toISOString();

  return useQuery({
    queryKey: ['commission-dashboard', targetId, currentMonth],
    queryFn: async () => {
      if (!targetId) throw new Error('No salesperson ID');

      const [
        settingsRes,
        targetRes,
        snapshotsRes,
        deliveredOrdersRes,
      ] = await Promise.all([
        // Get commission settings with tiers
        supabase
          .from('commission_settings')
          .select('*, commission_tiers(*)')
          .eq('salesperson_id', targetId)
          .maybeSingle(),
        
        // Get monthly target
        supabase
          .from('salesperson_targets')
          .select('*')
          .eq('salesperson_id', targetId)
          .eq('year_month', currentMonth)
          .maybeSingle(),
        
        // Get commission snapshots for this month (reconciled orders)
        supabase
          .from('commission_snapshots')
          .select('*')
          .eq('salesperson_id', targetId)
          .eq('year_month', currentMonth),
        
        // Get delivered but not yet reconciled orders for estimated commission
        supabase
          .from('orders')
          .select('id, total_amount, discount_amount')
          .eq('salesperson_id', targetId)
          .eq('runner_status', 'DELIVERED')
          .neq('reconciliation_status', 'SETTLED')
          .gte('delivered_at', monthStart)
          .lte('delivered_at', monthEnd),
      ]);

      const settings = settingsRes.data as (CommissionSettings & { commission_tiers: CommissionTier[] }) | null;
      const target = targetRes.data as SalespersonTarget | null;
      const snapshots = (snapshotsRes.data || []) as CommissionSnapshot[];
      const deliveredOrders = deliveredOrdersRes.data || [];

      // Calculate final commission from snapshots
      const finalCommission = snapshots.reduce((sum, s) => sum + (s.commission_amount || 0), 0);
      const monthlyReconciledCount = snapshots.length;

      // Calculate estimated commission from delivered but not reconciled orders
      let estimatedCommission = 0;
      if (settings) {
        const tiers = settings.commission_tiers?.sort((a, b) => a.tier_order - b.tier_order) || [];
        const currentOrderCount = monthlyReconciledCount + deliveredOrders.length;

        deliveredOrders.forEach((order, index) => {
          const orderSequence = monthlyReconciledCount + index + 1;
          const commissionBase = (order.total_amount || 0) - (order.discount_amount || 0);
          
          let commissionValue = settings.base_value;
          
          // Apply tiered commission if applicable
          if (settings.is_tiered && tiers.length > 0) {
            const applicableTier = tiers.find(t => 
              orderSequence >= t.min_orders && 
              (t.max_orders === null || orderSequence <= t.max_orders)
            ) || tiers[tiers.length - 1];
            
            if (applicableTier) {
              commissionValue = applicableTier.tier_value;
            }
          }
          
          if (settings.commission_mode === 'PER_ORDER') {
            estimatedCommission += commissionValue;
          } else {
            estimatedCommission += commissionBase * (commissionValue / 100);
          }
        });
      }

      // Calculate target progress
      const monthlyDeliveredCount = monthlyReconciledCount + deliveredOrders.length;
      const achievedSalesValue = snapshots.reduce((sum, s) => sum + s.commission_base_amount, 0) +
        deliveredOrders.reduce((sum, o) => sum + (o.total_amount || 0) - (o.discount_amount || 0), 0);

      let achievedValue = 0;
      let targetProgress = 0;
      let remainingToTarget = 0;

      if (target) {
        if (target.target_type === 'ORDER_COUNT') {
          achievedValue = monthlyDeliveredCount;
        } else {
          achievedValue = achievedSalesValue;
        }
        targetProgress = Math.min((achievedValue / target.target_value) * 100, 100);
        remainingToTarget = Math.max(target.target_value - achievedValue, 0);
      }

      // Calculate tier progress
      let currentTier: number | null = null;
      let nextTierAt: number | null = null;
      let ordersToNextTier: number | null = null;
      let currentTierValue: number | null = null;
      let nextTierValue: number | null = null;

      if (settings?.is_tiered && settings.commission_tiers?.length > 0) {
        const tiers = settings.commission_tiers.sort((a, b) => a.tier_order - b.tier_order);
        const currentOrderCount = monthlyDeliveredCount;
        
        // Find current tier
        const currentTierData = tiers.find(t => 
          currentOrderCount >= t.min_orders && 
          (t.max_orders === null || currentOrderCount <= t.max_orders)
        );
        
        if (currentTierData) {
          currentTier = currentTierData.tier_order;
          currentTierValue = currentTierData.tier_value;
          
          // Find next tier
          const nextTierData = tiers.find(t => t.tier_order === currentTierData.tier_order + 1);
          if (nextTierData) {
            nextTierAt = nextTierData.min_orders;
            nextTierValue = nextTierData.tier_value;
            ordersToNextTier = Math.max(nextTierData.min_orders - currentOrderCount, 0);
          }
        } else if (currentOrderCount < tiers[0].min_orders) {
          // Before first tier
          nextTierAt = tiers[0].min_orders;
          nextTierValue = tiers[0].tier_value;
          ordersToNextTier = tiers[0].min_orders - currentOrderCount;
        }
      }

      return {
        monthlyTarget: target ? {
          type: target.target_type as TargetType,
          value: target.target_value,
        } : null,
        achievedValue,
        targetProgress,
        remainingToTarget,
        estimatedCommission,
        finalCommission,
        totalCommission: estimatedCommission + finalCommission,
        monthlyDeliveredCount,
        monthlyReconciledCount,
        currentTier,
        nextTierAt,
        ordersToNextTier,
        currentTierValue,
        nextTierValue,
        commissionMode: settings?.commission_mode as CommissionMode | null,
        baseValue: settings?.base_value ?? null,
        isTiered: settings?.is_tiered ?? false,
      } as CommissionDashboardStats;
    },
    enabled: !!targetId,
    refetchInterval: 120000,
  });
}

// Admin mutation to create/update commission settings
export function useUpsertCommissionSettings() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      salespersonId,
      commissionMode,
      baseValue,
      isTiered,
      tiers,
    }: {
      salespersonId: string;
      commissionMode: CommissionMode;
      baseValue: number;
      isTiered: boolean;
      tiers?: Array<{ min_orders: number; max_orders: number | null; tier_value: number }>;
    }) => {
      // Upsert commission settings
      const { data: settings, error: settingsError } = await supabase
        .from('commission_settings')
        .upsert({
          salesperson_id: salespersonId,
          commission_mode: commissionMode,
          base_value: baseValue,
          is_tiered: isTiered,
          updated_by: user?.id,
        }, {
          onConflict: 'salesperson_id',
        })
        .select()
        .single();

      if (settingsError) throw settingsError;

      // If tiered, update tiers
      if (isTiered && tiers && tiers.length > 0) {
        // Delete existing tiers
        await supabase
          .from('commission_tiers')
          .delete()
          .eq('settings_id', settings.id);

        // Insert new tiers
        const tierInserts = tiers.map((tier, index) => ({
          settings_id: settings.id,
          tier_order: index + 1,
          min_orders: tier.min_orders,
          max_orders: tier.max_orders,
          tier_value: tier.tier_value,
        }));

        const { error: tiersError } = await supabase
          .from('commission_tiers')
          .insert(tierInserts);

        if (tiersError) throw tiersError;
      }

      return settings;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['commission-settings', variables.salespersonId] });
      queryClient.invalidateQueries({ queryKey: ['commission-dashboard', variables.salespersonId] });
      toast({ title: 'Commission settings updated successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

// Admin mutation to set monthly target
export function useSetSalespersonTarget() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      salespersonId,
      yearMonth,
      targetType,
      targetValue,
    }: {
      salespersonId: string;
      yearMonth?: string;
      targetType: TargetType;
      targetValue: number;
    }) => {
      const month = yearMonth || getCurrentYearMonth();

      const { data, error } = await supabase
        .from('salesperson_targets')
        .upsert({
          salesperson_id: salespersonId,
          year_month: month,
          target_type: targetType,
          target_value: targetValue,
          updated_by: user?.id,
        }, {
          onConflict: 'salesperson_id,year_month',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['salesperson-target', variables.salespersonId] });
      queryClient.invalidateQueries({ queryKey: ['commission-dashboard', variables.salespersonId] });
      toast({ title: 'Monthly target updated successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

// Calculate commission for an order (used during reconciliation)
export async function calculateOrderCommission(
  orderId: string,
  salespersonId: string,
  orderTotal: number,
  discountAmount: number,
  deliveryCharge: number
): Promise<{
  commissionMode: CommissionMode;
  commissionValue: number;
  commissionBaseAmount: number;
  commissionAmount: number;
  tierApplied: number | null;
  orderSequence: number;
} | null> {
  const currentMonth = getCurrentYearMonth();
  const commissionBase = orderTotal - discountAmount - deliveryCharge;

  // Get commission settings
  const { data: settings } = await supabase
    .from('commission_settings')
    .select('*, commission_tiers(*)')
    .eq('salesperson_id', salespersonId)
    .maybeSingle();

  if (!settings) return null;

  // Get current order count for the month
  const { count } = await supabase
    .from('commission_snapshots')
    .select('*', { count: 'exact', head: true })
    .eq('salesperson_id', salespersonId)
    .eq('year_month', currentMonth);

  const orderSequence = (count || 0) + 1;
  let commissionValue = settings.base_value;
  let tierApplied: number | null = null;

  // Apply tiered commission if applicable
  if (settings.is_tiered && settings.commission_tiers?.length > 0) {
    const tiers = (settings.commission_tiers as CommissionTier[]).sort((a, b) => a.tier_order - b.tier_order);
    const applicableTier = tiers.find(t => 
      orderSequence >= t.min_orders && 
      (t.max_orders === null || orderSequence <= t.max_orders)
    ) || tiers[tiers.length - 1];
    
    if (applicableTier) {
      commissionValue = applicableTier.tier_value;
      tierApplied = applicableTier.tier_order;
    }
  }

  let commissionAmount: number;
  if (settings.commission_mode === 'PER_ORDER') {
    commissionAmount = commissionValue;
  } else {
    commissionAmount = commissionBase * (commissionValue / 100);
  }

  return {
    commissionMode: settings.commission_mode as CommissionMode,
    commissionValue,
    commissionBaseAmount: commissionBase,
    commissionAmount,
    tierApplied,
    orderSequence,
  };
}

// Create commission snapshot (called when reconciliation is approved)
export async function createCommissionSnapshot(
  orderId: string,
  salespersonId: string,
  orderTotal: number,
  discountAmount: number,
  deliveryCharge: number
): Promise<CommissionSnapshot | null> {
  const currentMonth = getCurrentYearMonth();
  
  const commissionData = await calculateOrderCommission(
    orderId,
    salespersonId,
    orderTotal,
    discountAmount,
    deliveryCharge
  );

  if (!commissionData) return null;

  const { data, error } = await supabase
    .from('commission_snapshots')
    .insert({
      order_id: orderId,
      salesperson_id: salespersonId,
      commission_mode: commissionData.commissionMode,
      commission_value: commissionData.commissionValue,
      commission_base_amount: commissionData.commissionBaseAmount,
      commission_amount: commissionData.commissionAmount,
      tier_applied: commissionData.tierApplied,
      year_month: currentMonth,
      order_sequence_in_month: commissionData.orderSequence,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create commission snapshot:', error);
    return null;
  }

  return data as CommissionSnapshot;
}
