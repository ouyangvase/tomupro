import { useAuth } from '@/contexts/AuthContext';
import { useImpersonation } from '@/contexts/ImpersonationContext';
import type { AppRole, Profile } from '@/types/database';

interface EffectiveAuthResult {
  // Effective values - use these for data filtering
  user: { id: string } | null;
  userId: string | null;
  profile: Profile | null;
  role: AppRole | null;
  
  // Impersonation state
  isImpersonating: boolean;
  realAdminId: string | null;
  impersonatedUserId: string | null;
  
  // Session info (always the real admin's session)
  session: ReturnType<typeof useAuth>['session'];
  
  // Loading state
  loading: boolean;
}

/**
 * Hook that returns the "effective" auth context.
 * When admin is impersonating another user, returns the target user's info.
 * Otherwise returns the real user's info.
 * 
 * Use this hook in data-fetching hooks to ensure proper data scoping.
 */
export function useEffectiveAuth(): EffectiveAuthResult {
  const auth = useAuth();
  const impersonation = useImpersonation();

  // If admin is impersonating, return target user's context
  if (impersonation.isImpersonating && impersonation.impersonatedUser) {
    // Create a partial profile from impersonated user data
    const impersonatedProfile: Profile | null = impersonation.effectiveProfile ? {
      id: impersonation.effectiveProfile.id,
      display_name: impersonation.effectiveProfile.display_name,
      email: impersonation.effectiveProfile.email,
      role: impersonation.effectiveProfile.role,
      is_active: impersonation.effectiveProfile.status === 'active',
      created_at: '',
      updated_at: null,
      manager_id: null,
      avatar_url: null,
      theme_preference: 'dark',
    } : null;

    return {
      user: { id: impersonation.effectiveUserId! },
      userId: impersonation.effectiveUserId,
      profile: impersonatedProfile,
      role: impersonation.effectiveRole,
      isImpersonating: true,
      realAdminId: impersonation.realAdminId,
      impersonatedUserId: impersonation.effectiveUserId,
      session: auth.session,
      loading: auth.loading || impersonation.isLoading,
    };
  }

  // Normal auth - not impersonating
  return {
    user: auth.user,
    userId: auth.user?.id ?? null,
    profile: auth.profile,
    role: auth.role,
    isImpersonating: false,
    realAdminId: null,
    impersonatedUserId: null,
    session: auth.session,
    loading: auth.loading,
  };
}

/**
 * Hook to get effective visible owner IDs for data filtering.
 * Uses the impersonated user's visibility when in View As mode.
 */
export function useEffectiveVisibleIds() {
  const { userId, role, isImpersonating } = useEffectiveAuth();
  
  return {
    effectiveUserId: userId,
    effectiveRole: role,
    isImpersonating,
  };
}
