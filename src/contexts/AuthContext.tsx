import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
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
  connectionError: string | null;
  retryCount: number;
  dismissRoleChange: () => void;
  refreshProfile: () => Promise<void>;
  retryConnection: () => Promise<void>;
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
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  // Refs to prevent duplicate calls and track retry state
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isRetryingRef = useRef(false);

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
    setConnectionError(null);
    setRetryCount(0);
  }, []);

  const fetchProfile = useCallback(async (userId: string): Promise<boolean> => {
    try {
      setConnectionError(null);
      
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();
      
      if (error) {
        console.error('Profile fetch error:', error);
        setConnectionError('Unable to connect to server. Please check your connection.');
        return false;
      }
      
      if (!data) {
        console.error('No profile found for user:', userId);
        setConnectionError('Profile not found. Please contact support.');
        return false;
      }
      
      const newProfile = data as ExtendedProfile;
      
      // Check if account is disabled or resigned
      if (newProfile.status && newProfile.status !== 'active') {
        await handleAccountDisabled(
          newProfile.status === 'resigned' 
            ? 'Your account has been marked as resigned. Please contact admin.'
            : 'Your account has been disabled. Please contact admin.'
        );
        return false;
      }
      
      // Check if role changed while session is active
      if (previousRole && previousRole !== newProfile.role) {
        setRoleChanged(true);
      }
      
      setPreviousRole(newProfile.role);
      setProfile(newProfile);
      setConnectionError(null);
      setRetryCount(0);
      return true;
      
    } catch (err) {
      console.error('Unexpected error fetching profile:', err);
      setConnectionError('Connection error. Please try again.');
      return false;
    }
  }, [previousRole, handleAccountDisabled]);

  const retryConnection = useCallback(async () => {
    if (!user?.id || isRetryingRef.current) return;
    
    isRetryingRef.current = true;
    const currentRetry = retryCount;
    setRetryCount(prev => prev + 1);
    setLoading(true);
    setConnectionError(null);
    
    const success = await fetchProfile(user.id);
    setLoading(false);
    isRetryingRef.current = false;
    
    if (!success && currentRetry < 3) {
      // Auto-retry with exponential backoff
      const delay = 2000 * Math.pow(2, currentRetry);
      retryTimeoutRef.current = setTimeout(() => {
        retryConnection();
      }, delay);
    }
  }, [user?.id, fetchProfile, retryCount]);

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
    let timeoutId: NodeJS.Timeout | null = null;
    let isMounted = true;
    
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (!isMounted) return;
        
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          // Defer profile fetch
          setTimeout(async () => {
            if (!isMounted) return;
            const success = await fetchProfile(session.user.id);
            if (isMounted) {
              setLoading(false);
              if (!success) {
                retryConnection();
              }
            }
          }, 0);
        } else {
          setProfile(null);
          setPreviousRole(null);
          setRoleChanged(false);
          setConnectionError(null);
          setRetryCount(0);
          setLoading(false);
        }
      }
    );

    // Initial session check with timeout
    const sessionPromise = supabase.auth.getSession();
    
    // Set a 15-second timeout for initial load
    timeoutId = setTimeout(() => {
      if (isMounted) {
        setConnectionError('Connection timed out. Please check your network.');
        setLoading(false);
      }
    }, 15000);
    
    sessionPromise.then(async ({ data: { session } }) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (!isMounted) return;
      
      setSession(session);
      setUser(session?.user ?? null);
      
      if (session?.user) {
        const success = await fetchProfile(session.user.id);
        if (isMounted) {
          setLoading(false);
          if (!success) {
            retryConnection();
          }
        }
      } else {
        setLoading(false);
      }
    }).catch((err) => {
      if (timeoutId) clearTimeout(timeoutId);
      if (!isMounted) return;
      
      console.error('Session check failed:', err);
      setConnectionError('Failed to check session. Please refresh.');
      setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      if (timeoutId) clearTimeout(timeoutId);
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, [fetchProfile, retryConnection]);

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
    
    // Clear any pending retries
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
    
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
    setConnectionError(null);
    setRetryCount(0);
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
        connectionError,
        retryCount,
        dismissRoleChange,
        refreshProfile,
        retryConnection,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
