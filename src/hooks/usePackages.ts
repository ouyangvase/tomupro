import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface Package {
  id: string;
  tracking_no: string;
  owner_id: string;
  owner_name: string;
  status: string;
  batch_id: string | null;
  intl_order_id: string | null;
  latest_paid_at: string | null;
  total_paid_cny: number | null;
  weight_kg: number | null;
  last_updated_at: string;
  sku_codes: string[];
}

export interface PackageSku {
  id: string;
  package_id: string;
  sku_code: string | null;
  sku_ref: string | null;
  product_title: string | null;
  qty: number | null;
  unit_price_cny: number | null;
}

export interface AppNotification {
  id: string;
  user_email: string;
  title: string;
  body: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

export const PACKAGE_STATUSES = [
  'WAREHOUSE',
  'PACKING',
  'WAIT_PAY',
  'IN_TRANSIT',
  'TRANSIT_STATION',
  'DESTINATION'
] as const;

export type PackageStatus = typeof PACKAGE_STATUSES[number];

export function useMyPackages(filters?: {
  status?: string;
  ownerId?: string;
  search?: string;
}) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['my-packages', user?.id, filters],
    queryFn: async () => {
      if (!user) return [];

      // If search looks like a SKU, search in cn_package_skus first
      let packageIds: string[] | null = null;
      
      if (filters?.search) {
        // Try to find packages by SKU code
        const { data: skuMatches } = await supabase
          .from('cn_package_skus')
          .select('package_id')
          .ilike('sku_code', `%${filters.search}%`);
        
        if (skuMatches && skuMatches.length > 0) {
          packageIds = [...new Set(skuMatches.map(s => s.package_id))];
        }
      }

      // Query the view
      let query = supabase
        .from('v_my_packages')
        .select('*')
        .order('last_updated_at', { ascending: false });

      if (packageIds && packageIds.length > 0) {
        // Search by package IDs from SKU match
        query = query.in('id', packageIds);
      } else if (filters?.search) {
        // Search by tracking number
        query = query.ilike('tracking_no', `%${filters.search}%`);
      }

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      if (filters?.ownerId) {
        query = query.eq('owner_id', filters.ownerId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as Package[];
    },
    enabled: !!user,
  });
}

export function usePackageDetail(packageId: string | null) {
  return useQuery({
    queryKey: ['package-detail', packageId],
    queryFn: async () => {
      if (!packageId) return null;

      const { data, error } = await supabase
        .from('v_my_packages')
        .select('*')
        .eq('id', packageId)
        .single();

      if (error) throw error;
      return data as Package;
    },
    enabled: !!packageId,
  });
}

export function usePackageSkus(packageId: string | null) {
  return useQuery({
    queryKey: ['package-skus', packageId],
    queryFn: async () => {
      if (!packageId) return [];

      const { data, error } = await supabase
        .from('cn_package_skus')
        .select('*')
        .eq('package_id', packageId)
        .order('sku_code');

      if (error) throw error;
      return (data || []) as PackageSku[];
    },
    enabled: !!packageId,
  });
}

export function useAccessibleOwners() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['accessible-owners', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('pc_owners')
        .select('owner_id, owner_name')
        .order('owner_name');

      if (error) throw error;
      return data || [];
    },
    enabled: !!user,
  });
}

export function useAppNotifications() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['app-notifications', user?.id],
    queryFn: async () => {
      if (!user) return [];

      const { data, error } = await supabase
        .from('app_notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as AppNotification[];
    },
    enabled: !!user,
  });
}

export function useUnreadAppNotificationCount() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['app-notifications-unread', user?.id],
    queryFn: async () => {
      if (!user) return 0;

      const { count, error } = await supabase
        .from('app_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false);

      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!user,
  });
}

export function useMarkAppNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (notificationId: string) => {
      const { error } = await supabase
        .from('app_notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['app-notifications-unread'] });
    },
  });
}

export function useMarkAllAppNotificationsRead() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async () => {
      if (!user?.email) throw new Error('No user email');

      const { error } = await supabase
        .from('app_notifications')
        .update({ is_read: true })
        .eq('is_read', false);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['app-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['app-notifications-unread'] });
    },
  });
}
