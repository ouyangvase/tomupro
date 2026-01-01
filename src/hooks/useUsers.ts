import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Profile, AppRole } from '@/types/database';

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('display_name', { ascending: true });

      if (error) throw error;
      return data as Profile[];
    },
  });
}

export function useUpdateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (update: {
      id: string;
      display_name?: string;
      role?: AppRole;
    }) => {
      const { id, role, ...otherChanges } = update;
      
      // Update profile
      const profileUpdate = role ? { ...otherChanges, role } : otherChanges;
      const { data, error } = await supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Also update user_roles table if role changed
      if (role) {
        const { error: roleError } = await supabase
          .from('user_roles')
          .update({ role })
          .eq('user_id', id);

        if (roleError) {
          throw roleError;
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success('User updated');
    },
    onError: (error) => {
      toast.error(`Failed to update user: ${error.message}`);
    },
  });
}

export async function ensureWarehouseForRole(
  userId: string,
  role: AppRole,
  displayName: string
): Promise<void> {
  // Only create warehouse for salesperson or runner
  if (role !== 'salesperson' && role !== 'runner') {
    return;
  }

  const warehouseType = role === 'salesperson' ? 'SALESPERSON' : 'RUNNER';

  // Check if warehouse already exists
  const { data: existingWarehouses, error: fetchError } = await supabase
    .from('warehouses')
    .select('id, is_active')
    .eq('owner_user_id', userId)
    .eq('warehouse_type', warehouseType);

  if (fetchError) {
    // Silently return - warehouse check is non-critical
    return;
  }

  if (existingWarehouses && existingWarehouses.length > 0) {
    // Warehouse exists - ensure it's active
    const warehouse = existingWarehouses[0];
    if (!warehouse.is_active) {
      await supabase
        .from('warehouses')
        .update({ is_active: true })
        .eq('id', warehouse.id);
    }
    return;
  }

  // Create new warehouse
  const { error: createError } = await supabase
    .from('warehouses')
    .insert({
      warehouse_type: warehouseType,
      owner_user_id: userId,
      name: `${displayName}'s Warehouse`,
    });

  // Warehouse creation failure is non-critical - admin can create manually
}

export async function deactivateWarehousesForUser(
  userId: string,
  previousRole: AppRole
): Promise<void> {
  // Only deactivate if changing away from salesperson/runner
  if (previousRole !== 'salesperson' && previousRole !== 'runner') {
    return;
  }

  const warehouseType = previousRole === 'salesperson' ? 'SALESPERSON' : 'RUNNER';

  await supabase
    .from('warehouses')
    .update({ is_active: false })
    .eq('owner_user_id', userId)
    .eq('warehouse_type', warehouseType);
}
