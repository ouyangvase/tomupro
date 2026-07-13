import { useRealtimeUpdates } from '@/hooks/useRealtimeUpdates';
import { useFirebasePresence } from '@/hooks/useFirebasePresence';
import { useFirebaseLocationWriter } from '@/hooks/useFirebaseLocations';

const ENABLE_SUPABASE_REALTIME = import.meta.env.VITE_ENABLE_SUPABASE_REALTIME === 'true';

// This component enables real-time updates for the app
// It should be rendered once at the app level when user is authenticated
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  useRealtimeUpdates(ENABLE_SUPABASE_REALTIME);
  // Firebase: track online presence and write driver GPS location
  useFirebasePresence();
  useFirebaseLocationWriter();
  return <>{children}</>;
}

export default RealtimeProvider;
