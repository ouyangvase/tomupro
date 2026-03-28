/**
 * Firebase Presence Hook
 *
 * Tracks user online/offline status via Firestore.
 * Only active when Firebase is enabled (VITE_FIREBASE_ENABLED=true).
 *
 * Firestore structure:
 *   presence/{userId} → { online: boolean, lastSeen: Timestamp, currentPage: string }
 */

import { useEffect, useRef } from 'react';
import { doc, setDoc, onSnapshot, serverTimestamp, Timestamp } from 'firebase/firestore';
import { firebaseDb, isFirebaseEnabled } from '@/integrations/firebase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useLocation } from 'react-router-dom';

interface PresenceData {
  online: boolean;
  lastSeen: Timestamp | null;
  currentPage: string;
  role: string;
  displayName: string;
}

/**
 * Writes the current user's presence to Firestore.
 * Sets online=true on mount, online=false on unmount/tab close.
 */
export function useFirebasePresence() {
  const { user, profile } = useAuth();
  const location = useLocation();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isFirebaseEnabled || !firebaseDb || !user?.id || !profile) return;

    const presenceRef = doc(firebaseDb, 'presence', user.id);

    // Set online
    const setOnline = () => {
      setDoc(presenceRef, {
        online: true,
        lastSeen: serverTimestamp(),
        currentPage: location.pathname,
        role: profile.role || '',
        displayName: profile.display_name || '',
      }, { merge: true }).catch(() => {});
    };

    // Set offline
    const setOffline = () => {
      setDoc(presenceRef, {
        online: false,
        lastSeen: serverTimestamp(),
      }, { merge: true }).catch(() => {});
    };

    setOnline();

    // Update presence every 60s (heartbeat)
    intervalRef.current = setInterval(setOnline, 60_000);

    // Handle tab close / navigate away
    const handleBeforeUnload = () => setOffline();
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Handle visibility change (tab hidden → offline, visible → online)
    const handleVisibility = () => {
      if (document.hidden) {
        setOffline();
      } else {
        setOnline();
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibility);
      setOffline();
    };
  }, [user?.id, profile, location.pathname]);
}

/**
 * Subscribe to a specific user's presence.
 * Returns { online, lastSeen } or null if Firebase disabled.
 */
export function useUserPresence(userId: string | undefined) {
  const presenceRef = useRef<PresenceData | null>(null);

  useEffect(() => {
    if (!isFirebaseEnabled || !firebaseDb || !userId) return;

    const docRef = doc(firebaseDb, 'presence', userId);
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        presenceRef.current = snap.data() as PresenceData;
      }
    });

    return unsubscribe;
  }, [userId]);

  return presenceRef.current;
}
