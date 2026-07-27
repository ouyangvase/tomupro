import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

async function getFunctionError(error: unknown) {
  const context = (error as { context?: unknown })?.context;
  if (context instanceof Response) {
    const body = await context.clone().json().catch(() => null);
    return new Error(
      body?.error ||
      body?.message ||
      (error instanceof Error ? error.message : 'Failed to force password reset')
    );
  }

  return error instanceof Error ? error : new Error('Failed to force password reset');
}

/**
 * Hook to force a password reset for a user.
 * Replaces the password with the temporary password and requires a change on next login.
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

      const { data, error } = await supabase.functions.invoke('approve-password-reset', {
        body: { user_id: userId },
      });

      if (error) throw await getFunctionError(error);
      if (data?.error) throw new Error(data.error);

      return {
        email,
        displayName,
        temporaryPassword: data?.temporary_password || 'Tomu@12345678',
      };
    },
    onSuccess: ({ displayName, temporaryPassword }) => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast.success(`Password reset for ${displayName}`, {
        description: `Temporary password: ${temporaryPassword}. They must set a new password after login.`,
      });
    },
    onError: (error) => {
      toast.error('Failed to force password reset', {
        description: error.message,
      });
    },
  });
}

