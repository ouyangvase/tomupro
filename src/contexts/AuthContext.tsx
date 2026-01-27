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

  const fetchProfile = useCallback(async (userId: string, retryCount = 0): Promise<void> => {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second
    
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    
    // Retry on transient errors (503, network issues)
    if (error && retryCount < maxRetries) {
      const delay = baseDelay * Math.pow(2, retryCount);
      console.warn(`Profile fetch failed (attempt ${retryCount + 1}/${maxRetries}), retrying in ${delay}ms...`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchProfile(userId, retryCount + 1);
    }
    
    if (error) {
      console.error('Profile fetch failed after all retries:', error);
      // Don't set profile to null here - keep loading state
      return;
    }
    
    if (data) {
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
    let mounted = true;
    
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Fetch profile BEFORE setting loading to false
          await fetchProfile(session.user.id);
        } else {
          setProfile(null);
          setPreviousRole(null);
          setRoleChanged(false);
        }
        
        if (mounted) {
          setLoading(false);
        }
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!mounted) return;
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        await fetchProfile(session.user.id);
      }
      
      if (mounted) {
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
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
    
    // Add 5-second timeout to prevent hanging
    const signOutPromise = supabase.auth.signOut();
    const timeoutPromise = new Promise<void>((_, reject) => 
      setTimeout(() => reject(new Error('Signout timeout')), 5000)
    );
    
    try {
      await Promise.race([signOutPromise, timeoutPromise]);
    } catch (error) {
      // Session may already be expired/invalid or timeout - that's okay
      console.warn('Sign out error:', error);
    }
    
    // Always clear local state regardless of API response
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
