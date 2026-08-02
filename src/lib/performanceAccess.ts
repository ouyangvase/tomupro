import type { AppRole } from '@/types/database';

export function canAccessPerformance(
  role: AppRole | null | undefined,
  hidePerformanceUI: boolean,
): boolean {
  if (!role) return false;
  return role === 'admin' || !hidePerformanceUI;
}
