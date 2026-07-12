import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";

// Battery-friendly: 30-second interval instead of 10s
const UPDATE_INTERVAL_MS = 30000;

export type LocationPermissionState = "prompt" | "granted" | "denied" | "unsupported";
export type LocationTrackingState = "idle" | "starting" | "active" | "error" | "stopped";
export type LocationSharingMode = "off" | "delivery_session" | "live_tracking";

interface LocationState {
  permissionState: LocationPermissionState;
  trackingState: LocationTrackingState;
  lastLocation: GeolocationPosition | null;
  lastUpdateTime: Date | null;
  error: string | null;
  isSharing: boolean;
  sharingMode: LocationSharingMode;
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
    sharingMode: "off",
  });

  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPositionRef = useRef<GeolocationPosition | null>(null);

  // Check initial permission state
  useEffect(() => {
    if (!isDriver) return;
    
    if (!("geolocation" in navigator)) {
      setState(prev => ({ ...prev, permissionState: "unsupported" }));
      return;
    }

    if ("permissions" in navigator) {
      let permissionStatus: PermissionStatus | null = null;
      const onChange = () => {
        if (permissionStatus) {
          setState(prev => ({
            ...prev,
            permissionState: permissionStatus!.state as LocationPermissionState,
          }));
        }
      };

      navigator.permissions.query({ name: "geolocation" }).then((result) => {
        permissionStatus = result;
        setState(prev => ({
          ...prev,
          permissionState: result.state as LocationPermissionState,
        }));
        result.addEventListener("change", onChange);
      }).catch(() => {
        setState(prev => ({ ...prev, permissionState: "prompt" }));
      });

      return () => {
        if (permissionStatus) {
          permissionStatus.removeEventListener("change", onChange);
        }
      };
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
    
    return latDiff > 0.0001 || lngDiff > 0.0001;
  }, []);

  // Start location tracking with a specific mode
  const startTracking = useCallback(async (mode: LocationSharingMode = "delivery_session"): Promise<boolean> => {
    if (!isDriver || !("geolocation" in navigator)) {
      return false;
    }

    setState(prev => ({ ...prev, trackingState: "starting", error: null, sharingMode: mode }));

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          sendLocation(position);
          
          // Use interval-based updates only (battery friendly, no continuous watch)
          intervalRef.current = setInterval(() => {
            navigator.geolocation.getCurrentPosition(
              (pos) => {
                if (hasSignificantMovement(pos)) {
                  sendLocation(pos);
                }
              },
              (err) => console.error("Interval position error:", err),
              { enableHighAccuracy: false, timeout: 10000, maximumAge: 15000 }
            );
          }, UPDATE_INTERVAL_MS);

          setState(prev => ({
            ...prev,
            permissionState: "granted",
            trackingState: "active",
            isSharing: true,
            sharingMode: mode,
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
            sharingMode: "off",
          }));
          
          resolve(false);
        },
        {
          enableHighAccuracy: false,
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
      sharingMode: "off",
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

  // Location is NEVER required now - it's always optional
  const locationRequired = false;
  const canProceed = true;

  return {
    ...state,
    startTracking,
    stopTracking,
    locationRequired,
    canProceed,
    isDriver,
  };
};
