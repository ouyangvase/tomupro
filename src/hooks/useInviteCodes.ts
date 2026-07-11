import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface InviteCode {
  id: string;
  code: string;
  role: string;
  created_by: string;
  is_active: boolean;
  max_uses: number;
  used_count: number;
  expires_at: string | null;
  created_at: string;
  creator?: {
    display_name: string;
  };
}

// Generate a random code with prefix
function generateCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed ambiguous chars (I, O, 0, 1)
  let result = '';
  for (let i = 0; i < 4; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `TOMU-SP-${result}`;
}

export function useInviteCodes() {
  return useQuery({
    queryKey: ['invite-codes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('invite_codes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as InviteCode[];
    },
  });
}

export function useCreateInviteCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      role?: string;
      max_uses?: number;
      expires_at?: string | null;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Generate unique code with retries
      let code = generateCode();
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        const { data, error } = await supabase
          .from('invite_codes')
          .insert({
            code,
            role: params.role || 'salesperson',
            max_uses: params.max_uses || 1,
            expires_at: params.expires_at || null,
            created_by: user.id,
          })
          .select()
          .single();

        if (error) {
          if (error.code === '23505') { // Unique violation
            code = generateCode();
            attempts++;
            continue;
          }
          throw error;
        }

        return data;
      }

      throw new Error('Failed to generate unique code after multiple attempts');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invite-codes'] });
      toast.success('Invite code created');
    },
    onError: (error) => {
      toast.error(`Failed to create code: ${error.message}`);
    },
  });
}

export function useUpdateInviteCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { id: string; is_active: boolean }) => {
      const { data, error } = await supabase
        .from('invite_codes')
        .update({ is_active: params.is_active })
        .eq('id', params.id)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invite-codes'] });
      toast.success('Invite code updated');
    },
    onError: (error) => {
      toast.error(`Failed to update code: ${error.message}`);
    },
  });
}

export function useDeleteInviteCode() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('invite_codes')
        .delete()
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invite-codes'] });
      toast.success('Invite code deleted');
    },
    onError: (error) => {
      toast.error(`Failed to delete code: ${error.message}`);
    },
  });
}

// Validate code during registration (public RPC)
export async function validateInviteCode(code: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('validate_invite_code', {
    code_text: code,
  });

  if (error) {
    console.error('Error validating invite code:', error);
    return null;
  }

  return data as string | null;
}
