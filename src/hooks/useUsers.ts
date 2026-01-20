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
      manager_id?: string | null;
      previousRole?: AppRole;
    }) => {
      const { id, role, manager_id, previousRole, ...otherChanges } = update;
      
      // Build profile update object
      const profileUpdate: Record<string, unknown> = { ...otherChanges };
      if (role !== undefined) {
        profileUpdate.role = role;
      }
      if (manager_id !== undefined) {
        profileUpdate.manager_id = manager_id;
      }

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
        
        // Handle warehouse changes when role changes
        if (previousRole && previousRole !== role) {
          // Deactivate warehouses for previous role
          await deactivateWarehousesForUser(id, previousRole);
          
          // Ensure correct warehouse for new role
          await ensureWarehouseForRole(id, role, data.display_name || 'User');
        }
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      toast.success('User updated');
    },
    onError: (error) => {
      toast.error(`Failed to update user: ${error.message}`);
    },
  });
}

/**
 * Ensures the correct warehouse exists and is active for a user's role.
 * 
 * RULES:
 * - Managers must have an active MANAGER warehouse (not SALESPERSON)
 * - Salespersons must have an active SALESPERSON warehouse (not MANAGER)
 * - Runners have RUNNER warehouses
 * - Only ONE active warehouse per user (enforced by database trigger)
 */
export async function ensureWarehouseForRole(
  userId: string,
  role: AppRole,
  displayName: string
): Promise<void> {
  // Only create warehouse for salesperson, runner, or manager
  if (role !== 'salesperson' && role !== 'runner' && role !== 'manager') {
    return;
  }

  // Determine correct warehouse type for role
  const warehouseType = role === 'manager' ? 'MANAGER' : 
                        role === 'runner' ? 'RUNNER' : 
                        'SALESPERSON';

  // Check if a warehouse of the correct type already exists for this user
  const { data: existingWarehouses, error: fetchError } = await supabase
    .from('warehouses')
    .select('id, is_active, warehouse_type')
    .eq('owner_user_id', userId)
    .eq('warehouse_type', warehouseType);

  if (fetchError) {
    console.error('Error checking warehouses:', fetchError);
    return;
  }

  if (existingWarehouses && existingWarehouses.length > 0) {
    // Warehouse of correct type exists - ensure it's active
    // The database trigger will auto-deactivate any other active warehouses
    const warehouse = existingWarehouses[0];
    if (!warehouse.is_active) {
      const { error: updateError } = await supabase
        .from('warehouses')
        .update({ is_active: true })
        .eq('id', warehouse.id);
      
      if (updateError) {
        console.error('Error activating warehouse:', updateError);
      }
    }
    return;
  }

  // No warehouse of correct type exists - create one
  // The database trigger will auto-deactivate any other active warehouses
  const { error: createError } = await supabase
    .from('warehouses')
    .insert({
      warehouse_type: warehouseType,
      owner_user_id: userId,
      name: `${displayName}'s ${warehouseType.charAt(0) + warehouseType.slice(1).toLowerCase()} Warehouse`,
      is_active: true,
    });

  if (createError) {
    console.error('Error creating warehouse:', createError);
  }
}

/**
 * Deactivates warehouses when a user changes away from a role.
 * This is called when the user's role changes.
 */
export async function deactivateWarehousesForUser(
  userId: string,
  previousRole: AppRole
): Promise<void> {
  // Only deactivate if changing away from salesperson/runner/manager
  if (previousRole !== 'salesperson' && previousRole !== 'runner' && previousRole !== 'manager') {
    return;
  }

  const warehouseType = previousRole === 'manager' ? 'MANAGER' : 
                        previousRole === 'runner' ? 'RUNNER' : 
                        'SALESPERSON';

  const { error } = await supabase
    .from('warehouses')
    .update({ is_active: false })
    .eq('owner_user_id', userId)
    .eq('warehouse_type', warehouseType);

  if (error) {
    console.error('Error deactivating warehouse:', error);
  }
}
