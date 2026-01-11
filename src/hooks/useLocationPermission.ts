import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const UPDATE_INTERVAL_MS = 10000; // 10 seconds
const STALE_THRESHOLD_MS = 60000; // 60 seconds without update = stale

export type LocationPermissionState = "prompt" | "granted" | "denied" | "unsupported";
export type LocationTrackingState = "idle" | "starting" | "active" | "error" | "stopped";

interface LocationState {
  permissionState: LocationPermissionState;
  trackingState: LocationTrackingState;
  lastLocation: GeolocationPosition | null;
  lastUpdateTime: Date | null;
  error: string | null;
  isSharing: boolean;
}

export const useLocationPermission = () => {
  const { user, profile } = useAuth();
  const isDriver = profile?.role === "driver";
  
  const [state, setState] = useState<LocationState>({
    permissionState: "prompt",
    trackingState: "idle",
    lastLocation: null,
    lastUpdateTime: null,
    error: null,
    isSharing: false,
  });

  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPositionRef = useRef<GeolocationPosition | null>(null);

  // Check initial permission state
  useEffect(() => {
    if (!isDriver) return;
    
    if (!("geolocation" in navigator)) {
      setState(prev => ({ ...prev, permissionState: "unsupported" }));
      return;
    }

    if ("permissions" in navigator) {
      navigator.permissions.query({ name: "geolocation" }).then((result) => {
        setState(prev => ({
          ...prev,
          permissionState: result.state as LocationPermissionState,
        }));
        
        result.addEventListener("change", () => {
          setState(prev => ({
            ...prev,
            permissionState: result.state as LocationPermissionState,
          }));
        });
      }).catch(() => {
        // Safari doesn't support permission query for geolocation
        setState(prev => ({ ...prev, permissionState: "prompt" }));
      });
    }
  }, [isDriver]);

  // Send location update to Supabase
  const sendLocation = useCallback(async (position: GeolocationPosition) => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from("driver_locations")
        .insert({
          driver_id: user.id,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          heading: position.coords.heading,
          recorded_at: new Date().toISOString(),
        });

      if (error) throw error;

      setState(prev => ({
        ...prev,
        lastLocation: position,
        lastUpdateTime: new Date(),
        error: null,
      }));
      lastPositionRef.current = position;
    } catch (err) {
      console.error("Failed to update location:", err);
      setState(prev => ({ ...prev, error: "Failed to send location update" }));
    }
  }, [user?.id]);

  // Check if significant movement occurred (>10m)
  const hasSignificantMovement = useCallback((newPos: GeolocationPosition): boolean => {
    if (!lastPositionRef.current) return true;
    
    const lastLat = lastPositionRef.current.coords.latitude;
    const lastLng = lastPositionRef.current.coords.longitude;
    const newLat = newPos.coords.latitude;
    const newLng = newPos.coords.longitude;
    
    const latDiff = Math.abs(newLat - lastLat);
    const lngDiff = Math.abs(newLng - lastLng);
    
    return latDiff > 0.0001 || lngDiff > 0.0001; // ~10m
  }, []);

  // Start location tracking
  const startTracking = useCallback(async (): Promise<boolean> => {
    if (!isDriver || !("geolocation" in navigator)) {
      return false;
    }

    setState(prev => ({ ...prev, trackingState: "starting", error: null }));

    return new Promise((resolve) => {
      // First, get initial position to trigger permission prompt
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // Permission granted, send initial location
          sendLocation(position);
          
          // Start watching position
          watchIdRef.current = navigator.geolocation.watchPosition(
            (pos) => {
              if (hasSignificantMovement(pos)) {
                sendLocation(pos);
              }
            },
            (err) => {
              console.error("Watch position error:", err);
            },
            {
              enableHighAccuracy: true,
              timeout: 15000,
              maximumAge: 5000,
            }
          );

          // Also set up interval for guaranteed updates
          intervalRef.current = setInterval(() => {
            navigator.geolocation.getCurrentPosition(
              sendLocation,
              (err) => console.error("Interval position error:", err),
              { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
          }, UPDATE_INTERVAL_MS);

          setState(prev => ({
            ...prev,
            permissionState: "granted",
            trackingState: "active",
            isSharing: true,
            error: null,
          }));
          
          resolve(true);
        },
        (err) => {
          console.error("Initial position error:", err);
          
          let errorMsg = "Location access failed";
          let permState: LocationPermissionState = state.permissionState;
          
          if (err.code === err.PERMISSION_DENIED) {
            errorMsg = "Location permission denied";
            permState = "denied";
          } else if (err.code === err.POSITION_UNAVAILABLE) {
            errorMsg = "Location unavailable";
          } else if (err.code === err.TIMEOUT) {
            errorMsg = "Location request timed out";
          }

          setState(prev => ({
            ...prev,
            permissionState: permState,
            trackingState: "error",
            error: errorMsg,
            isSharing: false,
          }));
          
          resolve(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      );
    });
  }, [isDriver, sendLocation, hasSignificantMovement, state.permissionState]);

  // Stop location tracking
  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setState(prev => ({
      ...prev,
      trackingState: "stopped",
      isSharing: false,
    }));
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  // Check if location is required (driver without active sharing)
  const locationRequired = isDriver && !state.isSharing && state.trackingState !== "active";
  const canProceed = !isDriver || (state.permissionState === "granted" && state.isSharing);

  return {
    ...state,
    startTracking,
    stopTracking,
    locationRequired,
    canProceed,
    isDriver,
  };
};
