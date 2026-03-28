/**
 * Firebase Activity Feed Hook
 *
 * Provides realtime team-level activity updates via Firestore.
 * Activities are written from Supabase edge functions after significant events
 * (order delivered, claim submitted, stock moved, etc.)
 *
 * Firestore structure:
 *   activity/global/items/{activityId} → { actorName, action, entityType, entityId, createdAt, metadata }
 *
 * Only active when Firebase is enabled.
 */

import { useEffect, useState } from 'react';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  Timestamp,
} from 'firebase/firestore';
import { firebaseDb, isFirebaseEnabled } from '@/integrations/firebase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface ActivityItem {
  id: string;
  actorName: string;
  actorId: string;
  action: string; // e.g. 'delivered_order', 'submitted_claim', 'acknowledged_inbound'
  entityType: string; // e.g. 'order', 'claim_batch', 'inbound_shipment'
  entityId: string;
  description: string;
  createdAt: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Subscribe to the global activity feed in realtime.
 * Returns the most recent N activity items.
 */
export function useFirebaseActivityFeed(maxItems = 30) {
  const { user } = useAuth();
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseEnabled || !firebaseDb || !user?.id) {
      setIsLoading(false);
      return;
    }

    const itemsCol = collection(firebaseDb, 'activity', 'global', 'items');
    const q = query(itemsCol, orderBy('createdAt', 'desc'), limit(maxItems));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: ActivityItem[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        items.push({
          id: doc.id,
          actorName: data.actorName || 'Unknown',
          actorId: data.actorId || '',
          action: data.action || '',
          entityType: data.entityType || '',
          entityId: data.entityId || '',
          description: data.description || '',
          createdAt: data.createdAt instanceof Timestamp
            ? data.createdAt.toDate()
            : new Date(data.createdAt),
          metadata: data.metadata || undefined,
        });
      });
      setActivities(items);
      setIsLoading(false);
    });

    return unsubscribe;
  }, [user?.id, maxItems]);

  return { activities, isLoading };
}
