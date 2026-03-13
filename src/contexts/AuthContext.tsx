import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Profile, AppRole } from '@/types/database';
import type { ProfileStatus } from '@/components/auth/ProfileGate';

// Extended Profile type to include new status fields
type UserStatus = 'active' | 'disabled' | 'resigned';

interface ExtendedProfile extends Profile {
  status?: UserStatus;
  disabled_at?: string | null;
  disabled_reason?: string | null;
  disabled_by?: string | null;
  force_password_reset?: boolean;
  force_password_reset_at?: string | null;
  force_password_reset_by?: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: ExtendedProfile | null;
  role: AppRole | null;
  loading: boolean;
  signingOut: boolean;
  roleChanged: boolean;
  profileStatus: ProfileStatus;
  profileError: string | null;
  dismissRoleChange: () => void;
  refreshProfile: () => Promise<void>;
  retryProfile: () => Promise<void>;
  resetSession: () => Promise<void>;
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
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('idle');
  const [profileError, setProfileError] = useState<string | null>(null);
  
  // Ref to track current profile user ID (avoids closure issues and infinite loops)
  const profileUserIdRef = useRef<string | null>(null);
  // Guard against duplicate concurrent profile fetches
  const isFetchingRef = useRef<boolean>(false);
  
  // Update the ref whenever profile changes
  useEffect(() => {
    profileUserIdRef.current = profile?.id ?? null;
  }, [profile?.id]);

  // Clear stale tokens function - used when session refresh fails
  const clearAuthState = useCallback(() => {
    const projectId = 'fitonksgqfxnpljiylkn';
    localStorage.removeItem(`sb-${projectId}-auth-token`);
    localStorage.removeItem('supabase.auth.token');
    sessionStorage.clear();
    setUser(null);
    setSession(null);
    setProfile(null);
    setPreviousRole(null);
    setRoleChanged(false);
    setProfileStatus('idle');
    setProfileError(null);
  }, []);

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

  // Validate session by making an authenticated request
  const validateSession = useCallback(async (): Promise<boolean> => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error || !data.user) {
        console.warn('[Auth] Session validation failed:', error?.message);
        return false;
      }
      return true;
    } catch (err) {
      console.warn('[Auth] Session validation exception:', err);
      return false;
    }
  }, []);

  const fetchProfile = useCallback(async (userId: string, retryCount = 0): Promise<void> => {
    const maxRetries = 1;
    const baseDelay = 500;
    const fetchTimeout = 3000; // 3 second timeout per attempt

    // Prevent duplicate concurrent fetches
    if (retryCount === 0 && isFetchingRef.current) {
      console.log('[Auth] Profile fetch already in progress, skipping duplicate');
      return;
    }
    if (retryCount === 0) {
      isFetchingRef.current = true;
    }
    
    // Set loading status on first attempt
    if (retryCount === 0) {
      setProfileStatus('loading');
      setProfileError(null);
    }
    
    console.log(`[Auth] Fetching profile for ${userId} (attempt ${retryCount + 1}/${maxRetries + 1})`);
    
    // Add timeout wrapper using Promise.race
    const fetchWithTimeout = async (): Promise<{ data: ExtendedProfile | null; error: any }> => {
      const timeoutPromise = new Promise<{ data: null; error: { message: string } }>((resolve) => {
        setTimeout(() => resolve({ data: null, error: { message: 'Request timed out' } }), fetchTimeout);
      });
      
      const fetchPromise = supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle()
        .then(({ data, error }) => ({ data: data as ExtendedProfile | null, error }));
      
      return Promise.race([fetchPromise, timeoutPromise]);
    };
    
    const { data, error } = await fetchWithTimeout();
    
    // Retry on transient errors (503, network issues, timeout)
    if (error && retryCount < maxRetries) {
      const delay = baseDelay * Math.pow(2, retryCount);
      console.warn(`[Auth] Profile fetch failed (attempt ${retryCount + 1}/${maxRetries}), retrying in ${delay}ms...`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchProfile(userId, retryCount + 1);
    }
    
    // Terminal error state - all retries exhausted
    if (error) {
      console.error('[Auth] Profile fetch failed after all retries:', error);
      isFetchingRef.current = false;
      setProfileStatus('error');
      setProfileError(error.message || 'Failed to load profile after multiple attempts');
      return;
    }
    
    // Profile missing - no row exists for this user
    if (!data) {
      console.warn('[Auth] No profile row found for user:', userId);
      isFetchingRef.current = false;
      setProfileStatus('missing');
      setProfileError('No profile found for your account');
      return;
    }
    
    // Success - we have profile data
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
    
    // Check if password reset is required
    if (newProfile.force_password_reset) {
      console.log('[Auth] Password reset required for user');
      setPreviousRole(newProfile.role);
      setProfile(newProfile);
      setProfileStatus('password_reset_required');
      setProfileError(null);
      return;
    }
    
    // Check if role changed while session is active
    if (previousRole && previousRole !== newProfile.role) {
      setRoleChanged(true);
    }
    
    console.log('[Auth] Profile loaded successfully, role:', newProfile.role);
    setPreviousRole(newProfile.role);
    setProfile(newProfile);
    setProfileStatus('ready');
    setProfileError(null);
  }, [previousRole, handleAccountDisabled]);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  }, [user?.id, fetchProfile]);

  // Retry profile fetch - for use with ProfileGate
  const retryProfile = useCallback(async () => {
    if (user?.id) {
      console.log('[Auth] Retrying profile fetch...');
      setProfileStatus('loading');
      setProfileError(null);
      await fetchProfile(user.id);
    }
  }, [user?.id, fetchProfile]);

  // Reset session completely - for use with ProfileGate
  const resetSession = useCallback(async () => {
    console.log('[Auth] Resetting session...');
    clearAuthState();
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn('[Auth] Sign out error during reset:', error);
    }
    // Navigate to auth page
    window.location.href = '/auth';
  }, [clearAuthState]);

  const dismissRoleChange = useCallback(() => {
    setRoleChanged(false);
    // Force reload to apply new permissions
    window.location.reload();
  }, []);

  // Safety timeout to prevent infinite loading states
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        console.warn('[Auth] Loading timeout (10s) - forcing completion');
        setLoading(false);
      }
    }, 10000); // 10 second timeout
    
    return () => clearTimeout(timeout);
  }, [loading]);

  useEffect(() => {
    let mounted = true;
    
    // Initialize auth with proper session validation
    const initializeAuth = async () => {
      try {
        console.log('[Auth] Initializing auth...');
        
        // First check if we have a stored session
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.warn('[Auth] Initial session check error - clearing tokens:', error.message);
          clearAuthState();
          if (mounted) setLoading(false);
          return;
        }
        
        if (!session) {
          console.log('[Auth] No session found - user needs to log in');
          if (mounted) setLoading(false);
          return;
        }
        
        // Validate session with a getUser call (this checks if token is actually valid)
        console.log('[Auth] Validating session...');
        const isValid = await validateSession();
        
        if (!isValid) {
          console.warn('[Auth] Session validation failed - clearing stale tokens');
          clearAuthState();
          if (mounted) setLoading(false);
          return;
        }
        
        console.log('[Auth] Session valid, fetching profile...');
        // Session is valid - proceed
        if (mounted) {
          setSession(session);
          setUser(session.user);
          await fetchProfile(session.user.id);
          setLoading(false);
        }
      } catch (err) {
        console.error('[Auth] Initialization error:', err);
        clearAuthState();
        if (mounted) setLoading(false);
      }
    };
    
    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        
        console.log('[Auth] Auth state changed:', event);
        
        // Handle session refresh failures (e.g., invalid refresh token)
        if (event === 'TOKEN_REFRESHED' && !session) {
          console.warn('[Auth] Token refresh failed - clearing stale tokens');
          clearAuthState();
          if (mounted) setLoading(false);
          return;
        }
        
        // Handle sign out event
        if (event === 'SIGNED_OUT') {
          console.log('[Auth] User signed out');
          clearAuthState();
          if (mounted) setLoading(false);
          return;
        }
        
        // Handle user deleted or auth error scenarios
        if (event === 'USER_UPDATED' && !session) {
          console.warn('[Auth] User updated but no session - clearing state');
          clearAuthState();
          if (mounted) setLoading(false);
          return;
        }
        
        // For SIGNED_IN or valid session updates
        if (session?.user) {
          setSession(session);
          setUser(session.user);
          
          // Only fetch profile if we don't already have it for THIS user
          // Use ref to avoid stale closure issues and infinite loops
          if (profileUserIdRef.current !== session.user.id) {
            await fetchProfile(session.user.id);
          }
        } else if (!session) {
          // No session after an event - clear state
          setUser(null);
          setSession(null);
          setProfile(null);
          setPreviousRole(null);
          setRoleChanged(false);
        }
        
        if (mounted) {
          setLoading(false);
        }
      }
    );

    // THEN initialize auth
    initializeAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile, clearAuthState, validateSession]);

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
        profileStatus,
        profileError,
        dismissRoleChange,
        refreshProfile,
        retryProfile,
        resetSession,
        signIn,
        signUp,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
