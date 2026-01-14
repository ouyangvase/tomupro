import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Warehouse, WarehouseType, Profile } from '@/types/database';

export interface WarehouseWithOwner extends Warehouse {
  owner?: Pick<Profile, 'id' | 'display_name' | 'email' | 'role'>;
}

export function useWarehouses() {
  return useQuery({
    queryKey: ['warehouses'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('warehouses')
        .select(`
          *,
          owner:profiles!warehouses_owner_user_id_fkey(id, display_name, email, role)
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as WarehouseWithOwner[];
    },
  });
}

export function useWarehouseStats() {
  return useQuery({
    queryKey: ['warehouse-stats'],
    queryFn: async () => {
      // Get all salespersons
      const { data: salespersons, error: spError } = await supabase
        .from('profiles')
        .select('id, display_name, email')
        .eq('role', 'salesperson');

      if (spError) throw spError;

      // Get all runners
      const { data: runners, error: runnerError } = await supabase
        .from('profiles')
        .select('id, display_name, email')
        .eq('role', 'runner');

      if (runnerError) throw runnerError;

      // Get all managers
      const { data: managers, error: managerError } = await supabase
        .from('profiles')
        .select('id, display_name, email')
        .eq('role', 'manager');

      if (managerError) throw managerError;

      // Get all warehouses
      const { data: warehouses, error: whError } = await supabase
        .from('warehouses')
        .select('id, owner_user_id, warehouse_type');

      if (whError) throw whError;

      // Find salespersons without warehouses
      const spWithWarehouse = new Set(
        warehouses
          .filter(w => w.warehouse_type === 'SALESPERSON')
          .map(w => w.owner_user_id)
      );
      const salespersonsMissing = salespersons?.filter(sp => !spWithWarehouse.has(sp.id)) || [];

      // Find runners without warehouses
      const runnerWithWarehouse = new Set(
        warehouses
          .filter(w => w.warehouse_type === 'RUNNER')
          .map(w => w.owner_user_id)
      );
      const runnersMissing = runners?.filter(r => !runnerWithWarehouse.has(r.id)) || [];

      // Find managers without warehouses
      const managerWithWarehouse = new Set(
        warehouses
          .filter(w => w.warehouse_type === 'MANAGER')
          .map(w => w.owner_user_id)
      );
      const managersMissing = managers?.filter(m => !managerWithWarehouse.has(m.id)) || [];

      return {
        totalSalespersons: salespersons?.length || 0,
        salespersonsWithWarehouse: spWithWarehouse.size,
        salespersonsMissing,
        totalRunners: runners?.length || 0,
        runnersWithWarehouse: runnerWithWarehouse.size,
        runnersMissing,
        totalManagers: managers?.length || 0,
        managersWithWarehouse: managerWithWarehouse.size,
        managersMissing,
        totalWarehouses: warehouses?.length || 0,
      };
    },
  });
}

export function useCreateWarehouse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      warehouse_type: WarehouseType;
      owner_user_id: string;
      is_active?: boolean;
    }) => {
      const { data: warehouse, error } = await supabase
        .from('warehouses')
        .insert(data)
        .select()
        .single();

      if (error) throw error;

      // Log audit
      await supabase.from('audit_logs').insert({
        entity_type: 'WAREHOUSE',
        entity_id: warehouse.id,
        action: 'CREATE',
        after_json: warehouse,
      });

      return warehouse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-stats'] });
      toast.success('Warehouse created');
    },
    onError: (error) => {
      toast.error(`Failed to create warehouse: ${error.message}`);
    },
  });
}

export function useUpdateWarehouse() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: {
      id: string;
      name?: string;
      owner_user_id?: string;
      is_active?: boolean;
    }) => {
      // Get before state
      const { data: before } = await supabase
        .from('warehouses')
        .select('*')
        .eq('id', id)
        .single();

      const { data: warehouse, error } = await supabase
        .from('warehouses')
        .update(data)
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      // Log audit
      await supabase.from('audit_logs').insert({
        entity_type: 'WAREHOUSE',
        entity_id: id,
        action: 'UPDATE',
        before_json: before,
        after_json: warehouse,
      });

      return warehouse;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-stats'] });
      toast.success('Warehouse updated');
    },
    onError: (error) => {
      toast.error(`Failed to update warehouse: ${error.message}`);
    },
  });
}

export function useBackfillWarehouses() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Get missing salespersons
      const { data: salespersons } = await supabase
        .from('profiles')
        .select('id, display_name')
        .eq('role', 'salesperson');

      const { data: existingSP } = await supabase
        .from('warehouses')
        .select('owner_user_id')
        .eq('warehouse_type', 'SALESPERSON');

      const existingSPSet = new Set(existingSP?.map(w => w.owner_user_id) || []);
      const missingSP = salespersons?.filter(sp => !existingSPSet.has(sp.id)) || [];

      // Get missing runners
      const { data: runners } = await supabase
        .from('profiles')
        .select('id, display_name')
        .eq('role', 'runner');

      const { data: existingRunner } = await supabase
        .from('warehouses')
        .select('owner_user_id')
        .eq('warehouse_type', 'RUNNER');

      const existingRunnerSet = new Set(existingRunner?.map(w => w.owner_user_id) || []);
      const missingRunners = runners?.filter(r => !existingRunnerSet.has(r.id)) || [];

      // Get missing managers
      const { data: managers } = await supabase
        .from('profiles')
        .select('id, display_name')
        .eq('role', 'manager');

      const { data: existingManager } = await supabase
        .from('warehouses')
        .select('owner_user_id')
        .eq('warehouse_type', 'MANAGER');

      const existingManagerSet = new Set(existingManager?.map(w => w.owner_user_id) || []);
      const missingManagers = managers?.filter(m => !existingManagerSet.has(m.id)) || [];

      // Create warehouses for missing salespersons
      const spCreations = missingSP.map(sp => ({
        warehouse_type: 'SALESPERSON' as WarehouseType,
        owner_user_id: sp.id,
        name: `${sp.display_name || 'User'}'s Warehouse`,
        is_active: true,
      }));

      // Create warehouses for missing runners
      const runnerCreations = missingRunners.map(r => ({
        warehouse_type: 'RUNNER' as WarehouseType,
        owner_user_id: r.id,
        name: `${r.display_name || 'User'}'s Warehouse`,
        is_active: true,
      }));

      // Create warehouses for missing managers
      const managerCreations = missingManagers.map(m => ({
        warehouse_type: 'MANAGER' as WarehouseType,
        owner_user_id: m.id,
        name: `${m.display_name || 'User'}'s Warehouse`,
        is_active: true,
      }));

      const allCreations = [...spCreations, ...runnerCreations, ...managerCreations];

      if (allCreations.length === 0) {
        return { created: 0 };
      }

      const { data: created, error } = await supabase
        .from('warehouses')
        .insert(allCreations)
        .select();

      if (error) throw error;

      // Log audits for each
      for (const wh of created || []) {
        await supabase.from('audit_logs').insert({
          entity_type: 'WAREHOUSE',
          entity_id: wh.id,
          action: 'CREATE_BACKFILL',
          after_json: wh,
        });
      }

      return { created: created?.length || 0 };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['warehouses'] });
      queryClient.invalidateQueries({ queryKey: ['warehouse-stats'] });
      toast.success(`Created ${data.created} missing warehouses`);
    },
    onError: (error) => {
      toast.error(`Backfill failed: ${error.message}`);
    },
  });
}
