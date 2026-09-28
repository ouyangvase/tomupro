import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type { Profile, AppRole } from '@/types/database';
import type { ProfileStatus } from '@/components/auth/ProfileGate';
import { setDisplayCurrency } from '@/lib/currency';
import { clearVisibleOwnerIdsCache } from '@/lib/visibleOwnerIdsCache';
import { lifecycleTrace } from '@/lib/lifecycleTrace';
import { subscribeWithReconnect } from '@/lib/subscribeWithReconnect';

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
  signUp: (email: string, password: string, displayName: string, role: AppRole, runnerCode?: string, inviteCode?: string, referralCode?: string) => Promise<{ error: Error | null }>;
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
const PROFILE_FETCH_TIMEOUT_MS = 8000;
const PROFILE_FETCH_MAX_RETRIES = 2;
const PROFILE_FETCH_BASE_DELAY_MS = 300;
const ENABLE_PROFILE_REALTIME = import.meta.env.VITE_ENABLE_SUPABASE_REALTIME === 'true';

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
  const authUserIdRef = useRef<string | null>(null);
  const profileLoadUserIdRef = useRef<string | null>(null);

  // Update the ref whenever profile changes
  useEffect(() => {
    profileUserIdRef.current = profile?.id ?? null;
  }, [profile?.id]);

  // Clear stale tokens function - used when session refresh fails
  const clearAuthState = useCallback(() => {
    // Invalidate any in-flight profile request before clearing the session.
    // Otherwise a late response from the previous user can overwrite the new
    // auth state or surface a misleading load error during sign-in.
    profileRequestSeqRef.current += 1;
    isFetchingRef.current = false;
    profileUserIdRef.current = null;
    profileLoadUserIdRef.current = null;
    localStorage.removeItem(`sb-${SUPABASE_PROJECT_REF}-auth-token`);
    localStorage.removeItem('supabase.auth.token');
    clearVisibleOwnerIdsCache();
    sessionStorage.clear();
    setDisplayCurrency('BND');
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
    clearVisibleOwnerIdsCache();
    sessionStorage.clear();
    setDisplayCurrency('BND');

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
    profileLoadUserIdRef.current = userId;
    const requestSeq = profileRequestSeqRef.current + 1;
    const isBackgroundRefresh = Boolean(options?.background);
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
            setDisplayCurrency(newProfile.display_currency);

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

            // Scope results are role-dependent, so discard them before dependent
            // order queries can run with the new role.
            if (previousRoleRef.current && previousRoleRef.current !== newProfile.role) {
              setRoleChanged(true);
              clearVisibleOwnerIdsCache(userId);
            }

            previousRoleRef.current = newProfile.role;
            setProfile(newProfile);
            setProfileStatus('ready');
            setProfileError(null);
            lifecycleTrace('user_loaded', { userId });
            lifecycleTrace('role_loaded', { userId, role: newProfile.role });
            lifecycleTrace('profile_ready', { userId, role: newProfile.role });
            lifecycleTrace('auth_ready', { userId, role: newProfile.role, profileStatus: 'ready' });
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
          console.warn('[Auth] Profile request rejected; preserving the session until Supabase confirms sign-out:', lastError);
          if (isBackgroundRefresh) {
            return;
          }
          setProfileStatus('error');
          setProfileError('Your session could not be verified. Please retry.');
          setLoading(false);
          return;
        }

        if (attempt < PROFILE_FETCH_MAX_RETRIES) {
          const delay = PROFILE_FETCH_BASE_DELAY_MS * Math.pow(2, attempt);
          console.warn(`[Auth] Profile fetch failed (attempt ${attempt + 1}/${PROFILE_FETCH_MAX_RETRIES + 1}), retrying in ${delay}ms...`, lastError?.message);
          await new Promise(resolve => window.setTimeout(resolve, delay));
        }
      }

      if (isBackgroundRefresh) {
        console.warn('[Auth] Background profile refresh failed:', lastError?.message || lastError);
      } else {
        console.error('[Auth] Profile fetch failed after all retries:', lastError);
        lifecycleTrace('profile_failed', {
          userId,
          message: lastError?.message || 'unknown',
        });
        setProfileStatus('error');
        setProfileError(lastError?.message || 'Failed to load profile after multiple attempts');
      }
    } finally {
      if (profileRequestSeqRef.current === requestSeq) {
        isFetchingRef.current = false;
      }
    }
  }, [handleAccountDisabled]); // Stable deps — no previousRole state

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

  // ─── Single auth initialization via onAuthStateChange ───────────────
  // This effect has STABLE dependencies (no state that changes after profile loads)
  // so it runs exactly ONCE on mount.
  useEffect(() => {
    let mounted = true;
    lifecycleTrace('auth_initializing');

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, newSession) => {
        if (!mounted) return;
        lifecycleTrace('auth_event', {
          event,
          hasSession: Boolean(newSession),
          userId: newSession?.user?.id || null,
        });

        // Supabase owns the persisted session. A transient null refresh/update event
        // is not an authoritative logout and must not erase otherwise valid tokens.
        if (event === 'TOKEN_REFRESHED' && !newSession) {
          console.warn('[Auth] Token refresh returned no session; waiting for an explicit sign-out event');
          setLoading(false);
          return;
        }

        // Handle sign out
        if (event === 'SIGNED_OUT') {
          authUserIdRef.current = null;
          clearAuthState();
          setLoading(false);
          return;
        }

        if (event === 'USER_UPDATED' && !newSession) {
          console.warn('[Auth] User update returned no session; waiting for an explicit sign-out event');
          setLoading(false);
          return;
        }

        // Valid session present (INITIAL_SESSION, SIGNED_IN, TOKEN_REFRESHED)
        if (newSession?.user) {
          if (authUserIdRef.current && authUserIdRef.current !== newSession.user.id) {
            clearVisibleOwnerIdsCache();
            profileLoadUserIdRef.current = null;
          }
          authUserIdRef.current = newSession.user.id;
          setSession(newSession);
          setUser(newSession.user);

          // The session identifies the user, but the database profile is authoritative
          // for role and permissions. Do not publish a cached/session role as ready.
          if (
            profileUserIdRef.current !== newSession.user.id &&
            profileLoadUserIdRef.current !== newSession.user.id
          ) {
            setProfile(null);
            setProfileStatus('loading');
            setProfileError(null);
            window.setTimeout(() => {
              void fetchProfile(newSession.user.id, { force: true });
            }, 0);
          }
        } else if (event === 'INITIAL_SESSION' && !newSession) {
          // No stored session — user needs to log in
          // Nothing to do, just stop loading
          lifecycleTrace('auth_ready', { userId: null, profileStatus: 'signed_out' });
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
    if (!ENABLE_PROFILE_REALTIME) return;
    if (!user?.id) return;

    const channelName = `profile-changes-${user.id}`;
    return subscribeWithReconnect(() => supabase
      .channel(channelName)
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
          setDisplayCurrency(newProfile.display_currency);
          previousRoleRef.current = newProfile.role;
        }
      ),
      { name: channelName },
    );
  }, [user?.id, handleAccountDisabled]);

  // ─── Auth methods ───────────────────────────────────────────────────
  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    return { error: error as Error | null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string, role: AppRole, runnerCode?: string, inviteCode?: string, referralCode?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    const normalizedEmail = email.trim().toLowerCase();
    const normalizedRunnerCode = runnerCode?.trim().toUpperCase() || undefined;
    const normalizedReferralCode = referralCode?.trim().toUpperCase() || undefined;

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          display_name: displayName,
          role: role,
          ...(normalizedRunnerCode ? { runner_code: normalizedRunnerCode } : {}),
          ...(inviteCode ? { invite_code: inviteCode } : {}),
          ...(normalizedReferralCode ? { referral_code: normalizedReferralCode } : {}),
        },
      },
    });

    if (!error && data.session && role === 'driver' && normalizedRunnerCode) {
      const { data: linkData, error: linkError } = await supabase.rpc('link_driver_to_runner_by_code', {
        p_code: normalizedRunnerCode,
      });
      const linkResult = linkData as { success?: boolean; error?: string } | null;

      if (linkError) return { error: linkError as Error };
      if (!linkResult?.success) {
        return { error: new Error(linkResult?.error || 'Driver could not be linked to the selected runner') };
      }
    }

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
    clearVisibleOwnerIdsCache();
    sessionStorage.clear();
    setDisplayCurrency('BND');

    profileRequestSeqRef.current += 1;
    isFetchingRef.current = false;
    profileUserIdRef.current = null;
    profileLoadUserIdRef.current = null;
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
