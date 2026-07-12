import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { logAudit } from './useAuditLogs';

/**
 * Hook to force a password reset for a user.
 * Sets a flag on the user's profile so they must change password on next login.
 */
export function useForcePasswordReset() {
  const queryClient = useQueryClient();
  const { user: adminUser } = useAuth();

  return useMutation({
    mutationFn: async ({ userId, email, displayName }: {
      userId: string;
      email: string;
      displayName: string;
    }) => {
      // Get current admin user
      if (!adminUser) throw new Error('Not authenticated');

      // Set the force_password_reset flag on the user's profile
      const { error } = await supabase
        .from('profiles')
        .update({
          force_password_reset: true,
          force_password_reset_at: new Date().toISOString(),
          force_password_reset_by: adminUser.id,
        })
        .eq('id', userId);
      
      if (error) {
        throw error;
      }
      
      // Log the audit entry
      await logAudit({
        entity_type: 'user',
        entity_id: userId,
        action: 'FORCE_PASSWORD_RESET',
        after_json: {
          email,
          display_name: displayName,
          triggered_at: new Date().toISOString(),
          triggered_by: adminUser.id,
        },
      });
      
      return { email, displayName };
    },
    onSuccess: ({ displayName }) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(`Password reset required for ${displayName}`, {
        description: 'They will need to set a new password on their next login.',
      });
    },
    onError: (error) => {
      console.error('Force password reset error:', error);
      toast.error('Failed to force password reset', {
        description: error.message,
      });
    },
  });
}

