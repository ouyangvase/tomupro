import { useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useDataShares } from '@/hooks/useDataShares';

/**
 * Hook to check if the current user can perform operations on a subject's data.
 * 
 * Rules:
 * - User can always operate on their own data
 * - Admin can operate on all data
 * - For shared data, can_operate flag determines write access
 * 
 * @param subjectUserId - The owner of the data
 * @returns boolean indicating if operations are allowed
 */
export function useCanOperate(subjectUserId: string | null | undefined) {
  const { user, role } = useAuth();
  const { data: shares = [] } = useDataShares();
  
  return useMemo(() => {
    if (!user?.id || !subjectUserId) return false;
    
    // User can always operate on their own data
    if (user.id === subjectUserId) return true;
    
    // Admin can operate on all data
    if (role === 'admin') return true;
    
    // Manager can operate on team data (existing behavior)
    // This is handled by existing permission checks
    
    // Check for shared data with operate permission
    const share = shares.find(s => 
      s.subject_user_id === subjectUserId && 
      s.active && 
      s.can_operate
    );
    
    return !!share;
  }, [user?.id, subjectUserId, role, shares]);
}

/**
 * Hook to check if the current user has read-only access to a subject's data.
 * Returns true if user has access but cannot operate.
 * 
 * @param subjectUserId - The owner of the data
 * @returns boolean indicating if access is read-only
 */
export function useIsReadOnlyAccess(subjectUserId: string | null | undefined) {
  const { user, role } = useAuth();
  const { data: shares = [] } = useDataShares();
  
  return useMemo(() => {
    if (!user?.id || !subjectUserId) return false;
    
    // Own data is never read-only
    if (user.id === subjectUserId) return false;
    
    // Admin is never read-only
    if (role === 'admin') return false;
    
    // Check for shared data without operate permission
    const share = shares.find(s => 
      s.subject_user_id === subjectUserId && 
      s.active
    );
    
    // Has share but cannot operate = read-only
    return share ? !share.can_operate : false;
  }, [user?.id, subjectUserId, role, shares]);
}

/**
 * Hook to get the scope permissions for a specific subject.
 * Used to determine which modules the user can access for the subject's data.
 * 
 * @param subjectUserId - The owner of the data
 * @returns Object with scope booleans
 */
export function useShareScopes(subjectUserId: string | null | undefined) {
  const { user, role } = useAuth();
  const { data: shares = [] } = useDataShares();
  
  return useMemo(() => {
    // Default: full access for own data
    const fullAccess = {
      scope_orders: true,
      scope_products: true,
      scope_stock_balance: true,
      scope_inbound: true,
      can_operate: true,
      isOwnData: true,
    };
    
    if (!user?.id || !subjectUserId) {
      return { ...fullAccess, isOwnData: false, can_operate: false };
    }
    
    // Own data = full access
    if (user.id === subjectUserId) return fullAccess;
    
    // Admin = full access
    if (role === 'admin') return { ...fullAccess, isOwnData: false };
    
    // Find share for this subject
    const share = shares.find(s => 
      s.subject_user_id === subjectUserId && 
      s.active
    );
    
    if (!share) {
      // No share = no access (handled by visibility filter elsewhere)
      return {
        scope_orders: false,
        scope_products: false,
        scope_stock_balance: false,
        scope_inbound: false,
        can_operate: false,
        isOwnData: false,
      };
    }
    
    return {
      scope_orders: share.scope_orders,
      scope_products: share.scope_products,
      scope_stock_balance: share.scope_stock_balance,
      scope_inbound: share.scope_inbound,
      can_operate: share.can_operate,
      isOwnData: false,
    };
  }, [user?.id, subjectUserId, role, shares]);
}
