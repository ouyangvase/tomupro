import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Profile, AppRole } from '@/types/database';

// Extended Profile type to include new status fields
type UserStatus = 'active' | 'disabled' | 'resigned';

interface ExtendedProfile extends Profile {
  status?: UserStatus;
  disabled_at?: string | null;
  disabled_reason?: string | null;
  disabled_by?: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: ExtendedProfile | null;
  role: AppRole | null;
  loading: boolean;
  signingOut: boolean;
  roleChanged: boolean;
  dismissRoleChange: () => void;
  refreshProfile: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, displayName: string, role: AppRole) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ExtendedProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [roleChanged, setRoleChanged] = useState(false);
  const [previousRole, setPreviousRole] = useState<AppRole | null>(null);

  // Function to handle account disabled - force sign out
  const handleAccountDisabled = useCallback(async (reason?: string) => {
    toast.error(reason || 'Account disabled. Please contact admin.');
    
    // Clear session and sign out
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn('Sign out error during account disable:', error);
    }
    
    // Clear all Supabase auth tokens
    const projectId = 'fitonksgqfxnpljiylkn';
    localStorage.removeItem(`sb-${projectId}-auth-token`);
    localStorage.removeItem('supabase.auth.token');
    sessionStorage.clear();
    
    // Clear local state
    setUser(null);
    setSession(null);
    setProfile(null);
    setPreviousRole(null);
    setRoleChanged(false);
  }, []);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    
    if (!error && data) {
      const newProfile = data as ExtendedProfile;
      
      // Check if account is disabled or resigned
      if (newProfile.status && newProfile.status !== 'active') {
        await handleAccountDisabled(
          newProfile.status === 'resigned' 
            ? 'Your account has been marked as resigned. Please contact admin.'
            : 'Your account has been disabled. Please contact admin.'
        );
        return;
      }
      
      // Check if role changed while session is active
      if (previousRole && previousRole !== newProfile.role) {
        setRoleChanged(true);
      }
      
      setPreviousRole(newProfile.role);
      setProfile(newProfile);
    }
  }, [previousRole, handleAccountDisabled]);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  }, [user?.id, fetchProfile]);

  const dismissRoleChange = useCallback(() => {
    setRoleChanged(false);
    // Force reload to apply new permissions
    window.location.reload();
  }, []);

  useEffect(() => {
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        
        // Keep loading = true until profile is loaded
        if (session?.user) {
          // Defer profile fetch but keep loading true until it completes
          setTimeout(async () => {
            await fetchProfile(session.user.id);
            setLoading(false);  // Only set loading false AFTER profile loads
          }, 0);
        } else {
          setProfile(null);
          setPreviousRole(null);
          setRoleChanged(false);
          setLoading(false);  // No user = no profile needed, safe to stop loading
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
      }
      setLoading(false);  // Only after profile fetch completes
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  // Subscribe to realtime changes on the profile
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel(`profile-changes-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        async (payload) => {
          const newProfile = payload.new as ExtendedProfile;
          
          // Check if account was disabled/resigned in real-time
          if (newProfile.status && newProfile.status !== 'active') {
            await handleAccountDisabled(
              newProfile.status === 'resigned' 
                ? 'Your account has been marked as resigned. Please contact admin.'
                : 'Your account has been disabled. Please contact admin.'
            );
            return;
          }
          
          // Check if role changed
          if (profile && profile.role !== newProfile.role) {
            setRoleChanged(true);
          }
          
          setProfile(newProfile);
          setPreviousRole(newProfile.role);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, profile, handleAccountDisabled]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  };

  const signUp = async (email: string, password: string, displayName: string, role: AppRole) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          display_name: displayName,
          role: role,
        },
      },
    });
    return { error: error as Error | null };
  };

  const signOut = async () => {
    if (signingOut) return; // Prevent double-click
    
    setSigningOut(true);
    
    try {
      // Clear session from Supabase
      await supabase.auth.signOut();
    } catch (error) {
      // Session may already be expired/invalid - that's okay
      console.warn('Sign out error (session may be expired):', error);
    }
    
    // Clear all Supabase auth tokens from storage to prevent auto-rehydration
    const projectId = 'fitonksgqfxnpljiylkn';
    localStorage.removeItem(`sb-${projectId}-auth-token`);
    localStorage.removeItem('supabase.auth.token');
    sessionStorage.clear();
    
    // Clear local state
    setUser(null);
    setSession(null);
    setProfile(null);
    setPreviousRole(null);
    setRoleChanged(false);
    setSigningOut(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        role: profile?.role ?? null,
        loading,
        signingOut,
        roleChanged,
        dismissRoleChange,
        refreshProfile,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
