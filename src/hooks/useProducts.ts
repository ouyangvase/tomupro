import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamMembers } from '@/hooks/useTeamMembers';
import type { Product } from '@/types/database';

export function useProducts(includeInactive = false) {
  const { user, role } = useAuth();
  const { data: teamMembers = [] } = useTeamMembers();
  
  return useQuery({
    queryKey: ['products', includeInactive, role, user?.id, teamMembers.map(t => t.id)],
    queryFn: async () => {
      let query = supabase
        .from('products')
        .select(`
          *,
          creator:profiles!products_created_by_fkey(id, display_name)
        `)
        .order('sku_name', { ascending: true });
      
      if (!includeInactive) {
        query = query.eq('is_active', true);
      }
      
      // For salesperson, only show their own products
      if (role === 'salesperson' && user?.id) {
        query = query.eq('owner_user_id', user.id);
      }
      // For manager, show own products + team products
      // RLS will handle this, but we can add explicit filter for clarity
      else if (role === 'manager' && user?.id) {
        const teamIds = [user.id, ...teamMembers.map(t => t.id)];
        if (teamIds.length > 0) {
          query = query.in('owner_user_id', teamIds);
        }
      }
      // Admin sees all (no filter)
      
      const { data, error } = await query;
      if (error) throw error;
      return data as (Product & { creator?: { id: string; display_name: string } })[];
    },
    enabled: !!user?.id || role === 'admin',
  });
}

export function useCreateProduct() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (product: Partial<Product>) => {
      const { data, error } = await supabase
        .from('products')
        .insert(product as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Product created successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

export function useUpdateProduct() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<Product> & { id: string }) => {
      const { data, error } = await supabase
        .from('products')
        .update(updates as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Product updated successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

export function useDeleteProduct() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('products')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Product deleted successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}

export function useBulkUpdateProducts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ ids, updates }: { ids: string[]; updates: Partial<Product> }) => {
      const { error } = await supabase
        .from('products')
        .update(updates as any)
        .in('id', ids);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast({ title: 'Products updated successfully' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    },
  });
}
