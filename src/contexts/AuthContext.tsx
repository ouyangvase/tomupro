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

const getSupabaseProjectRef = () => {
  try {
    return new URL(import.meta.env.VITE_SUPABASE_URL).hostname.split('.')[0] || 'dtcchduronwsyunyakxj';
  } catch {
    return 'dtcchduronwsyunyakxj';
  }
};

const SUPABASE_PROJECT_REF = getSupabaseProjectRef();
const PROFILE_FETCH_TIMEOUT_MS = 1000;
const PROFILE_FETCH_MAX_RETRIES = 0;
const PROFILE_FETCH_BASE_DELAY_MS = 300;
const AUTH_LOADING_TIMEOUT_MS = 1500;
const PROFILE_LOADING_TIMEOUT_MS = 1500;
const PROFILE_CACHE_PREFIX = `tomupro-profile-cache:${SUPABASE_PROJECT_REF}:`;

const getProfileCacheKey = (userId: string) => `${PROFILE_CACHE_PREFIX}${userId}`;

const readCachedProfile = (userId: string): ExtendedProfile | null => {
  try {
    const raw = localStorage.getItem(getProfileCacheKey(userId));
    if (!raw) return null;
    const cached = JSON.parse(raw) as ExtendedProfile;
    if (cached?.id !== userId || !cached?.role) return null;
    if (cached.status && cached.status !== 'active') return null;
    if (cached.force_password_reset) return null;
    return cached;
  } catch {
    return null;
  }
};

const writeCachedProfile = (profile: ExtendedProfile) => {
  try {
    localStorage.setItem(getProfileCacheKey(profile.id), JSON.stringify(profile));
  } catch {
    // Profile cache is an optimization only.
  }
};

const clearProfileCache = () => {
  try {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(PROFILE_CACHE_PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // Profile cache is an optimization only.
  }
};

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
  const profileRequestSeqRef = useRef(0);
  const previousRoleRef = useRef<AppRole | null>(null);
  const initDoneRef = useRef(false);

  // Update the ref whenever profile changes
  useEffect(() => {
    profileUserIdRef.current = profile?.id ?? null;
  }, [profile?.id]);

  // Clear stale tokens function - used when session refresh fails
  const clearAuthState = useCallback(() => {
    localStorage.removeItem(`sb-${SUPABASE_PROJECT_REF}-auth-token`);
    localStorage.removeItem('supabase.auth.token');
    clearProfileCache();
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

    localStorage.removeItem(`sb-${SUPABASE_PROJECT_REF}-auth-token`);
    localStorage.removeItem('supabase.auth.token');
    clearProfileCache();
    sessionStorage.clear();

    setUser(null);
    setSession(null);
    setProfile(null);
    previousRoleRef.current = null;
    setRoleChanged(false);
  }, []);

  // Stable fetchProfile — does NOT depend on any changing state (uses refs instead)
  const fetchProfile = useCallback(async (userId: string, options?: { force?: boolean; background?: boolean }): Promise<void> => {
    if (!userId) return;

    // Prevent duplicate concurrent fetches, unless the user explicitly retries.
    if (!options?.force && isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;
    const requestSeq = profileRequestSeqRef.current + 1;
    const isBackgroundRefresh = Boolean(options?.background && profileUserIdRef.current === userId);
    profileRequestSeqRef.current = requestSeq;
    if (!isBackgroundRefresh) {
      setProfileStatus('loading');
      setProfileError(null);
    }

    try {
      let lastError: any = null;

      for (let attempt = 0; attempt <= PROFILE_FETCH_MAX_RETRIES; attempt += 1) {
        const controller = new AbortController();
        let timeoutId: ReturnType<typeof window.setTimeout> | null = null;

        try {
          const profileQuery = supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle()
            .abortSignal(controller.signal);

          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = window.setTimeout(() => {
              controller.abort();
              reject(new Error('Profile request timed out. Please try again.'));
            }, PROFILE_FETCH_TIMEOUT_MS);
          });

          const { data, error } = await Promise.race([profileQuery, timeoutPromise]);

          if (timeoutId) window.clearTimeout(timeoutId);

          if (profileRequestSeqRef.current !== requestSeq) {
            return;
          }

          if (!error) {
            if (!data) {
              console.warn('[Auth] No profile row found for user:', userId);
              setProfileStatus('missing');
              setProfileError('No profile found for your account');
              return;
            }

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

            previousRoleRef.current = newProfile.role;
            setProfile(newProfile);
            writeCachedProfile(newProfile);
            setProfileStatus('ready');
            setProfileError(null);
            return;
          }

          lastError = error;
        } catch (error: any) {
          if (timeoutId) window.clearTimeout(timeoutId);
          lastError = error?.name === 'AbortError' || error?.message?.includes('timed out')
            ? { message: 'Profile request timed out. Please try again.' }
            : error;
        }

        if (profileRequestSeqRef.current !== requestSeq) {
          return;
        }

        const isAuthError = lastError?.message?.includes('JWT') || lastError?.code === 'PGRST301';
        if (isAuthError) {
          console.error('[Auth] Profile fetch failed because the session is invalid:', lastError);
          clearAuthState();
          setLoading(false);
          return;
        }

        if (attempt < PROFILE_FETCH_MAX_RETRIES) {
          const delay = PROFILE_FETCH_BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(`[Auth] Profile fetch failed (attempt ${attempt + 1}/${PROFILE_FETCH_MAX_RETRIES + 1}), retrying in ${delay}ms...`, lastError?.message);
          await new Promise(resolve => window.setTimeout(resolve, delay));
        }
      }

      console.error('[Auth] Profile fetch failed after all retries:', lastError);
      if (!isBackgroundRefresh) {
        setProfileStatus('error');
        setProfileError(lastError?.message || 'Failed to load profile after multiple attempts');
      }
    } finally {
      if (profileRequestSeqRef.current === requestSeq) {
        isFetchingRef.current = false;
      }
    }
  }, [handleAccountDisabled, clearAuthState]); // Stable deps — no previousRole state

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id, { force: true });
    }
  }, [user?.id, fetchProfile]);

  const retryProfile = useCallback(async () => {
    if (user?.id) {
      await fetchProfile(user.id, { force: true });
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
        console.warn('[Auth] Loading timeout - forcing completion');
        isFetchingRef.current = false;
        setLoading(false);
      }
    }, AUTH_LOADING_TIMEOUT_MS);

    return () => clearTimeout(timeout);
  }, [loading]);

  useEffect(() => {
    if (profileStatus !== 'loading') return;

    const timeout = window.setTimeout(() => {
      console.warn('[Auth] Profile loading watchdog timeout');
      profileRequestSeqRef.current += 1;
      isFetchingRef.current = false;
      setProfileStatus('error');
      setProfileError('Profile request timed out. Please try again.');
      setLoading(false);
    }, PROFILE_LOADING_TIMEOUT_MS);

    return () => window.clearTimeout(timeout);
  }, [profileStatus]);

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
            const cachedProfile = readCachedProfile(newSession.user.id);
            if (cachedProfile) {
              previousRoleRef.current = cachedProfile.role;
              setProfile(cachedProfile);
              setProfileStatus('ready');
              setProfileError(null);
              setLoading(false);
              void fetchProfile(newSession.user.id, { force: true, background: true });
            } else {
              await fetchProfile(newSession.user.id);
            }
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
          writeCachedProfile(newProfile);
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

    localStorage.removeItem(`sb-${SUPABASE_PROJECT_REF}-auth-token`);
    localStorage.removeItem('supabase.auth.token');
    clearProfileCache();
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
