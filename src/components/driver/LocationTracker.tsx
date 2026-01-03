import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MapPin, MapPinOff } from "lucide-react";
import { useLocationTracking } from "@/hooks/useDriverLocations";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const LocationTracker: React.FC = () => {
  const { profile } = useAuth();
  const { startTracking, stopTracking } = useLocationTracking();
  const [watchId, setWatchId] = useState<number | null>(null);
  const [isTracking, setIsTracking] = useState(false);

  // Auto-start tracking for drivers
  useEffect(() => {
    if (profile?.role === "driver") {
      const id = startTracking();
      if (id !== null) {
        setWatchId(id);
        setIsTracking(true);
      }
    }

    return () => {
      if (watchId !== null) {
        stopTracking(watchId);
      }
    };
  }, [profile?.role]);

  const toggleTracking = () => {
    if (isTracking && watchId !== null) {
      stopTracking(watchId);
      setWatchId(null);
      setIsTracking(false);
      toast.info("Location tracking stopped");
    } else {
      const id = startTracking();
      if (id !== null) {
        setWatchId(id);
        setIsTracking(true);
        toast.success("Location tracking started");
      } else {
        toast.error("Could not start location tracking");
      }
    }
  };

  if (profile?.role !== "driver") return null;

  return (
    <div className="flex items-center gap-2">
      <Badge
        variant={isTracking ? "default" : "secondary"}
        className="gap-1"
      >
        {isTracking ? (
          <>
            <MapPin className="h-3 w-3" />
            Tracking
          </>
        ) : (
          <>
            <MapPinOff className="h-3 w-3" />
            Offline
          </>
        )}
      </Badge>
      <Button
        variant="ghost"
        size="sm"
        onClick={toggleTracking}
        className="h-7 px-2"
      >
        {isTracking ? "Stop" : "Start"}
      </Button>
    </div>
  );
};

export default LocationTracker;
