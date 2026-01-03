import React, { useEffect, useState, useRef, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MapPin, MapPinOff, Loader2, AlertTriangle, Settings } from "lucide-react";
import { useDriverLocations } from "@/hooks/useDriverLocations";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

const UPDATE_INTERVAL_MS = 15000; // 15 seconds

const LocationTracker: React.FC = () => {
  const { profile } = useAuth();
  const { updateLocation } = useDriverLocations();
  
  const [isSharing, setIsSharing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<PermissionState | null>(null);
  
  const watchIdRef = useRef<number | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastPositionRef = useRef<GeolocationPosition | null>(null);

  // Check permission status
  useEffect(() => {
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' }).then((result) => {
        setPermissionStatus(result.state);
        result.addEventListener('change', () => {
          setPermissionStatus(result.state);
        });
      });
    }
  }, []);

  const sendLocation = useCallback(async (position: GeolocationPosition) => {
    try {
      await updateLocation.mutateAsync(position);
      setLastUpdate(new Date());
      setError(null);
      lastPositionRef.current = position;
    } catch (err) {
      console.error('Failed to update location:', err);
      setError('Failed to send location');
    }
  }, [updateLocation]);

  const startTracking = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setError("Geolocation not supported by your browser");
      toast.error("Geolocation not supported");
      return;
    }

    // Start watching position
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        // Check if significant movement (more than 10 meters)
        if (lastPositionRef.current) {
          const lastLat = lastPositionRef.current.coords.latitude;
          const lastLng = lastPositionRef.current.coords.longitude;
          const newLat = position.coords.latitude;
          const newLng = position.coords.longitude;
          
          // Simple distance check (rough approximation)
          const latDiff = Math.abs(newLat - lastLat);
          const lngDiff = Math.abs(newLng - lastLng);
          const moved = latDiff > 0.0001 || lngDiff > 0.0001; // ~10m
          
          if (moved) {
            sendLocation(position);
          }
        } else {
          sendLocation(position);
        }
      },
      (geoError) => {
        console.error('Geolocation error:', geoError);
        switch (geoError.code) {
          case geoError.PERMISSION_DENIED:
            setError("Location permission denied");
            setIsSharing(false);
            break;
          case geoError.POSITION_UNAVAILABLE:
            setError("Location unavailable");
            break;
          case geoError.TIMEOUT:
            setError("Location request timeout");
            break;
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );

    // Also send on interval regardless of movement
    intervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(
        sendLocation,
        (err) => console.error('Interval position error:', err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }, UPDATE_INTERVAL_MS);

    setIsSharing(true);
    setError(null);
    toast.success("Location sharing enabled");
  }, [sendLocation]);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setIsSharing(false);
    toast.info("Location sharing disabled");
  }, []);

  // Auto-start for drivers
  useEffect(() => {
    if (profile?.role === "driver") {
      // Small delay to let the component mount
      const timer = setTimeout(() => {
        startTracking();
      }, 1000);
      
      return () => {
        clearTimeout(timer);
        stopTracking();
      };
    }
  }, [profile?.role]);

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

  const toggleSharing = () => {
    if (isSharing) {
      stopTracking();
    } else {
      startTracking();
    }
  };

  if (profile?.role !== "driver") return null;

  return (
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${isSharing ? 'bg-green-100 dark:bg-green-900/30' : 'bg-muted'}`}>
              {updateLocation.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
              ) : isSharing ? (
                <MapPin className="h-5 w-5 text-green-600" />
              ) : (
                <MapPinOff className="h-5 w-5 text-muted-foreground" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">Location Sharing</span>
                <Badge variant={isSharing ? "default" : "secondary"} className="text-xs">
                  {isSharing ? "ON" : "OFF"}
                </Badge>
              </div>
              {lastUpdate && (
                <p className="text-xs text-muted-foreground">
                  Last update: {formatDistanceToNow(lastUpdate, { addSuffix: true })}
                </p>
              )}
              {error && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {error}
                </p>
              )}
              {permissionStatus === 'denied' && (
                <p className="text-xs text-destructive">
                  Enable location in browser settings
                </p>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Switch
              id="location-sharing"
              checked={isSharing}
              onCheckedChange={toggleSharing}
              disabled={updateLocation.isPending || permissionStatus === 'denied'}
            />
            <Label htmlFor="location-sharing" className="sr-only">
              Toggle location sharing
            </Label>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LocationTracker;
