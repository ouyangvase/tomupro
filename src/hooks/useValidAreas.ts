import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Fetches the list of valid areas from the delivery_charges table.
 * Used for area validation in order creation and CSV import.
 */
export function useValidAreas() {
  return useQuery({
    queryKey: ['valid-areas'],
    staleTime: 60000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_charges')
        .select('area')
        .eq('status', 'APPROVED');

      if (error) throw error;

      const uniqueAreas = [...new Set((data || []).map(d => d.area))].sort();
      return uniqueAreas;
    },
  });
}

/**
 * Validates whether a given area string exists in the valid areas list.
 */
export function isValidArea(area: string, validAreas: string[]): boolean {
  if (!area || !area.trim()) return true; // empty is allowed (optional field)
  return validAreas.some(a => a.toUpperCase() === area.toUpperCase().trim());
}
