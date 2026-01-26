import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import type { AppRole, Profile } from '@/types/database';

interface ImpersonatedUser {
  id: string;
  display_name: string;
  email: string;
  role: AppRole;
  status: string;
}

interface ImpersonationContextType {
  // State
  isImpersonating: boolean;
  impersonatedUser: ImpersonatedUser | null;
  sessionId: string | null;
  
  // Effective values (use these instead of real auth when impersonating)
  effectiveUserId: string | null;
  effectiveRole: AppRole | null;
  effectiveProfile: ImpersonatedUser | null;
  
  // Real admin info (always available)
  realAdminId: string | null;
  
  // Actions
  startImpersonation: (userId: string) => Promise<void>;
  stopImpersonation: () => Promise<void>;
  
  // Audit helper
  logImpersonatedAction: (action: string, details?: Record<string, unknown>) => Promise<void>;
  
  // Loading state
  isLoading: boolean;
}

const ImpersonationContext = createContext<ImpersonationContextType | undefined>(undefined);

const SESSION_KEY = 'admin_impersonation_session';

interface StoredSession {
  sessionId: string;
  impersonatedUser: ImpersonatedUser;
}

export function ImpersonationProvider({ children }: { children: React.ReactNode }) {
  const { user, role, profile } = useAuth();
  const [impersonatedUser, setImpersonatedUser] = useState<ImpersonatedUser | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const isAdmin = role === 'admin';
  const isImpersonating = isAdmin && !!impersonatedUser && !!sessionId;

  // Restore session from sessionStorage on mount
  useEffect(() => {
    if (!isAdmin || !user?.id) return;

    const stored = sessionStorage.getItem(SESSION_KEY);
    if (stored) {
      try {
        const parsed: StoredSession = JSON.parse(stored);
        // Verify session is still valid in database
        supabase
          .from('admin_impersonation_sessions')
          .select('id, ended_at')
          .eq('id', parsed.sessionId)
          .eq('admin_id', user.id)
          .is('ended_at', null)
          .maybeSingle()
          .then(({ data }) => {
            if (data) {
              setSessionId(parsed.sessionId);
              setImpersonatedUser(parsed.impersonatedUser);
            } else {
              // Session expired or ended, clear storage
              sessionStorage.removeItem(SESSION_KEY);
            }
          });
      } catch {
        sessionStorage.removeItem(SESSION_KEY);
      }
    }
  }, [isAdmin, user?.id]);

  const startImpersonation = useCallback(async (userId: string) => {
    if (!isAdmin || !user?.id) {
      toast.error('Only admins can use View As mode');
      return;
    }

    setIsLoading(true);
    try {
      // Fetch target user profile
      const { data: target, error: targetError } = await supabase
        .from('profiles')
        .select('id, display_name, email, role, status')
        .eq('id', userId)
        .single();

      if (targetError || !target) {
        toast.error('User not found');
        return;
      }

      // Prevent admin-to-admin impersonation
      if (target.role === 'admin') {
        toast.error('Cannot impersonate another admin');
        return;
      }

      // Create impersonation session in database
      const { data: session, error: sessionError } = await supabase
        .from('admin_impersonation_sessions')
        .insert({
          admin_id: user.id,
          target_user_id: target.id,
          target_role: target.role,
        })
        .select('id')
        .single();

      if (sessionError || !session) {
        console.error('Failed to create impersonation session:', sessionError);
        toast.error('Failed to start View As mode');
        return;
      }

      const impersonated: ImpersonatedUser = {
        id: target.id,
        display_name: target.display_name,
        email: target.email,
        role: target.role,
        status: target.status || 'active',
      };

      // Store in state and sessionStorage
      setSessionId(session.id);
      setImpersonatedUser(impersonated);
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        sessionId: session.id,
        impersonatedUser: impersonated,
      }));

      toast.success(`Now viewing as ${target.display_name}`);
    } catch (error) {
      console.error('Impersonation error:', error);
      toast.error('Failed to start View As mode');
    } finally {
      setIsLoading(false);
    }
  }, [isAdmin, user?.id]);

  const stopImpersonation = useCallback(async () => {
    if (!sessionId) return;

    setIsLoading(true);
    try {
      // End session in database
      await supabase
        .from('admin_impersonation_sessions')
        .update({ ended_at: new Date().toISOString() })
        .eq('id', sessionId);

      // Clear state and storage
      setSessionId(null);
      setImpersonatedUser(null);
      sessionStorage.removeItem(SESSION_KEY);

      toast.success('Exited View As mode');
    } catch (error) {
      console.error('Failed to end impersonation:', error);
      toast.error('Failed to exit View As mode');
    } finally {
      setIsLoading(false);
    }
  }, [sessionId]);

  const logImpersonatedAction = useCallback(async (
    action: string,
    details?: Record<string, unknown>
  ) => {
    if (!isImpersonating || !sessionId || !impersonatedUser) return;

    try {
      // Log to audit_logs with impersonation fields
      await supabase.from('audit_logs').insert({
        entity_type: 'impersonated_action',
        entity_id: impersonatedUser.id,
        action,
        actor_id: user?.id,
        impersonated_user_id: impersonatedUser.id,
        impersonation_session_id: sessionId,
        after_json: details as unknown as undefined,
      });

      // Increment actions count on session
      await supabase
        .from('admin_impersonation_sessions')
        .update({ actions_count: (await supabase
          .from('admin_impersonation_sessions')
          .select('actions_count')
          .eq('id', sessionId)
          .single()
          .then(r => (r.data?.actions_count ?? 0) + 1))
        })
        .eq('id', sessionId);
    } catch (error) {
      console.error('Failed to log impersonated action:', error);
    }
  }, [isImpersonating, sessionId, impersonatedUser, user?.id]);

  const value: ImpersonationContextType = {
    isImpersonating,
    impersonatedUser,
    sessionId,
    effectiveUserId: isImpersonating ? impersonatedUser?.id ?? null : user?.id ?? null,
    effectiveRole: isImpersonating ? impersonatedUser?.role ?? null : role,
    effectiveProfile: isImpersonating ? impersonatedUser : (profile as ImpersonatedUser | null),
    realAdminId: isAdmin ? user?.id ?? null : null,
    startImpersonation,
    stopImpersonation,
    logImpersonatedAction,
    isLoading,
  };

  return (
    <ImpersonationContext.Provider value={value}>
      {children}
    </ImpersonationContext.Provider>
  );
}

export function useImpersonation() {
  const context = useContext(ImpersonationContext);
  if (!context) {
    throw new Error('useImpersonation must be used within an ImpersonationProvider');
  }
  return context;
}
