import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logAudit } from './useAuditLogs';

/**
 * Hook to force a password reset for a user.
 * Admin can trigger this to send a password reset email to the user.
 * The user will need to reset their password on next login.
 */
export function useForcePasswordReset() {
  return useMutation({
    mutationFn: async ({ userId, email, displayName }: { 
      userId: string; 
      email: string; 
      displayName: string;
    }) => {
      // Get the base URL for the redirect
      const redirectUrl = `${window.location.origin}/auth`;
      
      // Use Supabase's built-in password reset
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });
      
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
        },
      });
      
      return { email, displayName };
    },
    onSuccess: ({ displayName, email }) => {
      toast.success(`Password reset email sent to ${displayName}`, {
        description: `An email has been sent to ${email} with instructions to reset their password.`,
      });
    },
    onError: (error) => {
      console.error('Password reset error:', error);
      toast.error('Failed to send password reset email', {
        description: error.message,
      });
    },
  });
}
