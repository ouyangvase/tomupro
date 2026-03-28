/**
 * Firebase Notifications Hook
 *
 * Replaces Supabase notification polling with Firebase Firestore realtime.
 * Notifications are pushed to Firebase from Supabase edge functions
 * (via a sync layer), and the client subscribes via onSnapshot.
 *
 * Firestore structure:
 *   notifications/{userId}/items/{notificationId} → { title, body, type, read, createdAt }
 *
 * Only active when Firebase is enabled (VITE_FIREBASE_ENABLED=true).
 * Falls back to existing Supabase notification hooks when disabled.
 */

import { useEffect, useState, useCallback } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  doc,
  updateDoc,
  writeBatch,
  Timestamp,
  getDocs,
} from 'firebase/firestore';
import { firebaseDb, isFirebaseEnabled } from '@/integrations/firebase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface FirebaseNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  read: boolean;
  createdAt: Date;
  data?: Record<string, unknown>;
}

/**
 * Subscribe to user's notifications in realtime via Firestore.
 * Returns notifications array, unread count, and mark-as-read functions.
 */
export function useFirebaseNotifications(maxItems = 50) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<FirebaseNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseEnabled || !firebaseDb || !user?.id) {
      setIsLoading(false);
      return;
    }

    const itemsCol = collection(firebaseDb, 'notifications', user.id, 'items');
    const q = query(itemsCol, orderBy('createdAt', 'desc'), limit(maxItems));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const items: FirebaseNotification[] = [];
      let unread = 0;

      snapshot.forEach((doc) => {
        const data = doc.data();
        const notif: FirebaseNotification = {
          id: doc.id,
          title: data.title || '',
          body: data.body || '',
          type: data.type || 'info',
          read: data.read || false,
          createdAt: data.createdAt instanceof Timestamp
            ? data.createdAt.toDate()
            : new Date(data.createdAt),
          data: data.data || undefined,
        };
        items.push(notif);
        if (!notif.read) unread++;
      });

      setNotifications(items);
      setUnreadCount(unread);
      setIsLoading(false);
    });

    return unsubscribe;
  }, [user?.id, maxItems]);

  const markAsRead = useCallback(async (notificationId: string) => {
    if (!isFirebaseEnabled || !firebaseDb || !user?.id) return;
    const docRef = doc(firebaseDb, 'notifications', user.id, 'items', notificationId);
    await updateDoc(docRef, { read: true }).catch(() => {});
  }, [user?.id]);

  const markAllAsRead = useCallback(async () => {
    if (!isFirebaseEnabled || !firebaseDb || !user?.id) return;
    const itemsCol = collection(firebaseDb, 'notifications', user.id, 'items');
    const q = query(itemsCol, where('read', '==', false));
    const snapshot = await getDocs(q);

    if (snapshot.empty) return;

    const batch = writeBatch(firebaseDb);
    snapshot.forEach((docSnap) => {
      batch.update(docSnap.ref, { read: true });
    });
    await batch.commit().catch(() => {});
  }, [user?.id]);

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead,
    markAllAsRead,
  };
}
