import type { AppRole } from '@/types/database';
import type { ProfileStatus } from '@/components/auth/ProfileGate';

export function isOrdersQueryReady(params: {
  profileStatus: ProfileStatus;
  userId: string | undefined;
  role: AppRole | null;
  scopeRequired: boolean;
  scopeReady: boolean;
}) {
  return Boolean(
    params.profileStatus === 'ready' &&
      params.userId &&
      params.role &&
      (!params.scopeRequired || params.scopeReady),
  );
}
