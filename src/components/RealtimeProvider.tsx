import { useRealtimeUpdates } from '@/hooks/useRealtimeUpdates';
import { useFirebasePresence } from '@/hooks/useFirebasePresence';
import { useFirebaseLocationWriter } from '@/hooks/useFirebaseLocations';

// This component enables real-time updates for the app
// It should be rendered once at the app level when user is authenticated
export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  useRealtimeUpdates();
  // Firebase: track online presence and write driver GPS location
  useFirebasePresence();
  useFirebaseLocationWriter();
  return <>{children}</>;
}

export default RealtimeProvider;
