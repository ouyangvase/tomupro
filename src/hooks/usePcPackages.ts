import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface PcPackage {
  id: string;
  pc_package_id: string;
  tracking_no_cn: string;
  owner_id: string;
  owner_name: string | null;
  status: string;
  destination: string | null;
  total_paid_cny: number | null;
  log_cost_rm: number | null;
  weight_kg: number | null;
  updated_at: string;
  arrived_destination_at: string | null;
}

export interface PcPackageLine {
  id: string;
  pc_package_id: string;
  sku_code: string | null;
  sku_ref: string | null;
  product_title: string | null;
  qty: number | null;
  unit_price_cny: number | null;
  updated_at: string;
}

export const PC_PACKAGE_STATUSES = [
  'WAREHOUSE',
  'PACKING',
  'WAIT_PAY',
  'IN_TRANSIT',
  'TRANSIT_STATION',
  'DESTINATION'
] as const;

export type PcPackageStatus = typeof PC_PACKAGE_STATUSES[number];

export function usePcPackages(filters?: {
  status?: string;
  search?: string;
}) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['pc-packages', user?.id, filters],
    queryFn: async () => {
      if (!user) return [];

      // If search looks like a SKU, search in pc_package_lines_mirror first
      let packageIds: string[] | null = null;
      
      if (filters?.search) {
        const { data: skuMatches } = await supabase
          .from('pc_package_lines_mirror')
          .select('pc_package_id')
          .ilike('sku_code', `%${filters.search}%`);
        
        if (skuMatches && skuMatches.length > 0) {
          packageIds = [...new Set(skuMatches.map(s => s.pc_package_id))];
        }
      }

      let query = supabase
        .from('pc_packages_mirror')
        .select('*')
        .order('updated_at', { ascending: false });

      if (packageIds && packageIds.length > 0) {
        query = query.in('pc_package_id', packageIds);
      } else if (filters?.search) {
        query = query.ilike('tracking_no_cn', `%${filters.search}%`);
      }

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as PcPackage[];
    },
    enabled: !!user,
  });
}

export function usePcPackageDetail(pcPackageId: string | null) {
  return useQuery({
    queryKey: ['pc-package-detail', pcPackageId],
    queryFn: async () => {
      if (!pcPackageId) return null;

      const { data, error } = await supabase
        .from('pc_packages_mirror')
        .select('*')
        .eq('pc_package_id', pcPackageId)
        .single();

      if (error) throw error;
      return data as PcPackage;
    },
    enabled: !!pcPackageId,
  });
}

export function usePcPackageLines(pcPackageId: string | null) {
  return useQuery({
    queryKey: ['pc-package-lines', pcPackageId],
    queryFn: async () => {
      if (!pcPackageId) return [];

      const { data, error } = await supabase
        .from('pc_package_lines_mirror')
        .select('*')
        .eq('pc_package_id', pcPackageId)
        .order('sku_code');

      if (error) throw error;
      return (data || []) as PcPackageLine[];
    },
    enabled: !!pcPackageId,
  });
}

export function usePcOwnerAccess() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['pc-owner-access', user?.id],
    queryFn: async () => {
      if (!user?.email) return [];

      const { data, error } = await supabase
        .from('pc_owner_access_mirror')
        .select('*')
        .eq('user_email', user.email);

      if (error) throw error;
      return data || [];
    },
    enabled: !!user?.email,
  });
}
