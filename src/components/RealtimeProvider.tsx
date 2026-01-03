import { useRealtimeUpdates } from '@/hooks/useRealtimeUpdates';

// This component enables real-time updates for the app
// It should be rendered once at the app level when user is authenticated
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  useRealtimeUpdates();
  return <>{children}</>;
}

export default RealtimeProvider;
