import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
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

const PROJECT_ID = 'dtcchduronwsyunyakxj';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ExtendedProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const [roleChanged, setRoleChanged] = useState(false);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus>('idle');
  const [profileError, setProfileError] = useState<string | null>(null);

  // Refs to avoid closure issues and prevent duplicate/looping work
  const profileUserIdRef = useRef<string | null>(null);
  const isFetchingRef = useRef<boolean>(false);
  const previousRoleRef = useRef<AppRole | null>(null);
  const initDoneRef = useRef(false);

  // Update the ref whenever profile changes
  useEffect(() => {
    profileUserIdRef.current = profile?.id ?? null;
  }, [profile?.id]);

  // Clear stale tokens function - used when session refresh fails
  const clearAuthState = useCallback(() => {
    localStorage.removeItem(`sb-${PROJECT_ID}-auth-token`);
    localStorage.removeItem('supabase.auth.token');
    sessionStorage.clear();
    setUser(null);
    setSession(null);
    setProfile(null);
    previousRoleRef.current = null;
    setRoleChanged(false);
    setProfileStatus('idle');
    setProfileError(null);
  }, []);

  // Function to handle account disabled - force sign out
  const handleAccountDisabled = useCallback(async (reason?: string) => {
    toast.error(reason || 'Account disabled. Please contact admin.');

    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn('Sign out error during account disable:', error);
    }

    localStorage.removeItem(`sb-${PROJECT_ID}-auth-token`);
    localStorage.removeItem('supabase.auth.token');
    sessionStorage.clear();

    setUser(null);
    setSession(null);
    setProfile(null);
    previousRoleRef.current = null;
    setRoleChanged(false);
  }, []);

  // Stable fetchProfile — does NOT depend on any changing state (uses refs instead)
  const fetchProfile = useCallback(async (userId: string, retryCount = 0): Promise<void> => {
    const maxRetries = 1;
    const baseDelay = 500;
    const fetchTimeout = 3000;

    // Prevent duplicate concurrent fetches
    if (retryCount === 0 && isFetchingRef.current) {
      return;
    }
    if (retryCount === 0) {
      isFetchingRef.current = true;
    }

    if (retryCount === 0) {
      setProfileStatus('loading');
      setProfileError(null);
    }

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

    // Retry on transient errors
    if (error && retryCount < maxRetries) {
      const delay = baseDelay * Math.pow(2, retryCount);
      console.warn(`[Auth] Profile fetch failed (attempt ${retryCount + 1}/${maxRetries}), retrying in ${delay}ms...`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
      return fetchProfile(userId, retryCount + 1);
    }

    if (error) {
      console.error('[Auth] Profile fetch failed after all retries:', error);
      isFetchingRef.current = false;
      // If we get an auth error, clear the session
      if (error.message?.includes('JWT') || error.code === 'PGRST301') {
        clearAuthState();
        setLoading(false);
        return;
      }
      setProfileStatus('error');
      setProfileError(error.message || 'Failed to load profile after multiple attempts');
      return;
    }

    if (!data) {
      console.warn('[Auth] No profile row found for user:', userId);
      isFetchingRef.current = false;
      setProfileStatus('missing');
      setProfileError('No profile found for your account');
      return;
    }

    const newProfile = data as ExtendedProfile;

    // Check if account is disabled or resigned
    if (newProfile.status && newProfile.status !== 'active') {
      isFetchingRef.current = false;
      await handleAccountDisabled(
        newProfile.status === 'resigned'
          ? 'Your account has been marked as resigned. Please contact admin.'
          : 'Your account has been disabled. Please contact admin.'
      );
      return;
    }

    // Check if password reset is required
    if (newProfile.force_password_reset) {
      isFetchingRef.current = false;
      previousRoleRef.current = newProfile.role;
      setProfile(newProfile);
      setProfileStatus('password_reset_required');
      setProfileError(null);
      return;
    }

    // Check if role changed while session is active (use ref, not state)
    if (previousRoleRef.current && previousRoleRef.current !== newProfile.role) {
      setRoleChanged(true);
    }

    isFetchingRef.current = false;
    previousRoleRef.current = newProfile.role;
    setProfile(newProfile);
    setProfileStatus('ready');
    setProfileError(null);
  }, [handleAccountDisabled, clearAuthState]); // Stable deps — no previousRole state

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id);
    }
  }, [user?.id, fetchProfile]);

  const retryProfile = useCallback(async () => {
    if (user?.id) {
      setProfileStatus('loading');
      setProfileError(null);
      await fetchProfile(user.id);
    }
  }, [user?.id, fetchProfile]);

  const resetSession = useCallback(async () => {
    clearAuthState();
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.warn('[Auth] Sign out error during reset:', error);
    }
    window.location.href = '/auth';
  }, [clearAuthState]);

  const dismissRoleChange = useCallback(() => {
    setRoleChanged(false);
    window.location.reload();
  }, []);

  // Safety timeout — prevent forever-loading screen (reduced from 5s to 3s)
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        console.warn('[Auth] Loading timeout (3s) - forcing completion');
        isFetchingRef.current = false;
        setLoading(false);
      }
    }, 3000);

    return () => clearTimeout(timeout);
  }, [loading]);

  // ─── Single auth initialization via onAuthStateChange ───────────────
  // This effect has STABLE dependencies (no state that changes after profile loads)
  // so it runs exactly ONCE on mount.
  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted) return;

        // Handle token refresh failure
        if (event === 'TOKEN_REFRESHED' && !newSession) {
          console.warn('[Auth] Token refresh failed - clearing stale tokens');
          clearAuthState();
          setLoading(false);
          return;
        }

        // Handle sign out
        if (event === 'SIGNED_OUT') {
          clearAuthState();
          setLoading(false);
          return;
        }

        // Handle user deleted scenarios
        if (event === 'USER_UPDATED' && !newSession) {
          console.warn('[Auth] User updated but no session - clearing state');
          clearAuthState();
          setLoading(false);
          return;
        }

        // Valid session present (INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED)
        if (newSession?.user) {
          setSession(newSession);
          setUser(newSession.user);

          // Fetch profile only if we don't already have it for this user
          if (profileUserIdRef.current !== newSession.user.id) {
            await fetchProfile(newSession.user.id);
          }
        } else if (event === 'INITIAL_SESSION' && !newSession) {
          // No stored session — user needs to log in
          // Nothing to do, just stop loading
        }

        if (mounted) {
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [fetchProfile, clearAuthState]); // Both are stable useCallbacks

  // ─── Realtime profile subscription ──────────────────────────────────
  const profileRef = useRef(profile);
  useEffect(() => { profileRef.current = profile; }, [profile]);

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

          if (newProfile.status && newProfile.status !== 'active') {
            await handleAccountDisabled(
              newProfile.status === 'resigned'
                ? 'Your account has been marked as resigned. Please contact admin.'
                : 'Your account has been disabled. Please contact admin.'
            );
            return;
          }

          if (profileRef.current && profileRef.current.role !== newProfile.role) {
            setRoleChanged(true);
          }

          setProfile(newProfile);
          previousRoleRef.current = newProfile.role;
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, handleAccountDisabled]);

  // ─── Auth methods ───────────────────────────────────────────────────
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error as Error | null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string, role: AppRole) => {
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
  }, []);

  const signOut = useCallback(async () => {
    if (signingOut) return;

    setSigningOut(true);

    const signOutPromise = supabase.auth.signOut();
    const timeoutPromise = new Promise<void>((_, reject) =>
      setTimeout(() => reject(new Error('Signout timeout')), 5000)
    );

    try {
      await Promise.race([signOutPromise, timeoutPromise]);
    } catch (error) {
      console.warn('Sign out error:', error);
    }

    localStorage.removeItem(`sb-${PROJECT_ID}-auth-token`);
    localStorage.removeItem('supabase.auth.token');
    sessionStorage.clear();

    setUser(null);
    setSession(null);
    setProfile(null);
    previousRoleRef.current = null;
    setRoleChanged(false);
    setSigningOut(false);
  }, [signingOut]);

  const contextValue = useMemo(() => ({
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
  }), [user, session, profile, loading, signingOut, roleChanged, profileStatus, profileError, dismissRoleChange, refreshProfile, retryProfile, resetSession, signIn, signUp, signOut]);

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};
