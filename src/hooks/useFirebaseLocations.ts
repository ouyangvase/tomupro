/**
 * Firebase Driver Locations Hook
 *
 * Replaces the Supabase driver_locations table writes with Firebase Firestore.
 * Drivers write their GPS coordinates directly to Firestore (no Supabase load).
 * Runners/admins subscribe to realtime location updates via onSnapshot.
 *
 * Firestore structure:
 *   locations/{driverId} → { lat, lng, heading, speed, accuracy, updatedAt }
 *
 * Only active when Firebase is enabled (VITE_FIREBASE_ENABLED=true).
 * Falls back to existing Supabase-based location tracking when disabled.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  doc,
  setDoc,
  onSnapshot,
  collection,
  query,
  where,
  serverTimestamp,
  Timestamp,
  getDocs,
} from 'firebase/firestore';
import { firebaseDb, isFirebaseEnabled } from '@/integrations/firebase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface DriverLocation {
  driverId: string;
  lat: number;
  lng: number;
  heading: number | null;
  speed: number | null;
  accuracy: number | null;
  updatedAt: Date | null;
}

const UPDATE_INTERVAL_MS = 30_000; // 30 seconds, same as existing

/**
 * Driver: Writes own GPS location to Firebase every 30s.
 * Only active for driver role when Firebase is enabled.
 */
export function useFirebaseLocationWriter() {
  const { user, profile } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const watchRef = useRef<number | null>(null);

  useEffect(() => {
    if (!isFirebaseEnabled || !firebaseDb || !user?.id || profile?.role !== 'driver') return;

    const locRef = doc(firebaseDb, 'locations', user.id);

    const writeLocation = (position: GeolocationPosition) => {
      setDoc(locRef, {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        heading: position.coords.heading,
        speed: position.coords.speed,
        accuracy: position.coords.accuracy,
        updatedAt: serverTimestamp(),
        displayName: profile?.display_name || '',
      }, { merge: true }).catch((err) => {
        console.warn('[Firebase] Failed to write location:', err);
      });
    };

    // Use watchPosition for continuous updates
    if ('geolocation' in navigator) {
      const onSuccess = (pos: GeolocationPosition) => writeLocation(pos);
      const onError = (err: GeolocationPositionError) => {
        console.warn('[Firebase] Geolocation error:', err.message);
      };

      // Write immediately on mount
      navigator.geolocation.getCurrentPosition(onSuccess, onError, {
        enableHighAccuracy: true,
        timeout: 10000,
      });

      // Then write every 30s
      intervalRef.current = setInterval(() => {
        navigator.geolocation.getCurrentPosition(onSuccess, onError, {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 10000,
        });
      }, UPDATE_INTERVAL_MS);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current);
    };
  }, [user?.id, profile?.role, profile?.display_name]);
}

/**
 * Runner/Admin: Subscribe to realtime locations of all drivers.
 * Returns array of DriverLocation updated in realtime via Firestore onSnapshot.
 */
export function useFirebaseDriverLocations(driverIds?: string[]): {
  locations: DriverLocation[];
  isLoading: boolean;
} {
  const [locations, setLocations] = useState<DriverLocation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseEnabled || !firebaseDb) {
      setIsLoading(false);
      return;
    }

    const locCol = collection(firebaseDb, 'locations');

    // Subscribe to all locations (Firestore doesn't support .in() >30 items well,
    // so we fetch all and filter client-side for now)
    const unsubscribe = onSnapshot(locCol, (snapshot) => {
      const locs: DriverLocation[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        const driverId = doc.id;

        // Filter by driverIds if provided
        if (driverIds && driverIds.length > 0 && !driverIds.includes(driverId)) return;

        locs.push({
          driverId,
          lat: data.lat || 0,
          lng: data.lng || 0,
          heading: data.heading || null,
          speed: data.speed || null,
          accuracy: data.accuracy || null,
          updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
        });
      });
      setLocations(locs);
      setIsLoading(false);
    });

    return unsubscribe;
  }, [driverIds?.join(',')]);

  return { locations, isLoading };
}

/**
 * Subscribe to a single driver's location.
 */
export function useFirebaseSingleDriverLocation(driverId: string | undefined): DriverLocation | null {
  const [location, setLocation] = useState<DriverLocation | null>(null);

  useEffect(() => {
    if (!isFirebaseEnabled || !firebaseDb || !driverId) return;

    const docRef = doc(firebaseDb, 'locations', driverId);
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setLocation({
          driverId,
          lat: data.lat || 0,
          lng: data.lng || 0,
          heading: data.heading || null,
          speed: data.speed || null,
          accuracy: data.accuracy || null,
          updatedAt: data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : null,
        });
      }
    });

    return unsubscribe;
  }, [driverId]);

  return location;
}
