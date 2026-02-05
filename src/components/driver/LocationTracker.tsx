import React from "react";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MapPin, MapPinOff, Loader2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocationContext } from "@/contexts/LocationContext";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

const LocationTracker: React.FC = () => {
  const { profile } = useAuth();
  const {
    permissionState,
    trackingState,
    lastUpdateTime,
    error,
    isSharing,
    startTracking,
    stopTracking,
  } = useLocationContext();

  if (profile?.role !== "driver") return null;

  const handleToggle = async () => {
    if (isSharing) {
      stopTracking();
    } else {
      await startTracking();
    }
  };

  const isUpdating = trackingState === "starting";

  return (
    <div className="glass-card p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {/* Status indicator */}
          <div className={cn(
            "relative h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
            isSharing
              ? "bg-[hsl(var(--status-success)/0.15)]"
              : "bg-muted"
          )}>
            {isUpdating ? (
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
            ) : isSharing ? (
              <>
                <MapPin className="h-4 w-4 text-[hsl(var(--status-success))]" />
                {/* Glow ring */}
                <span className="absolute inset-0 rounded-full animate-ping bg-[hsl(var(--status-success)/0.2)]" style={{ animationDuration: '2s' }} />
              </>
            ) : (
              <MapPinOff className="h-4 w-4 text-muted-foreground" />
            )}
          </div>

          {/* Text info */}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">Location</span>
              <Badge
                variant={isSharing ? "default" : "secondary"}
                className="text-[10px] px-1.5 py-0 h-4 rounded-full"
              >
                {isSharing ? "ON" : "OFF"}
              </Badge>
            </div>
            {lastUpdateTime && (
              <p className="text-[10px] text-muted-foreground truncate">
                {formatDistanceToNow(lastUpdateTime, { addSuffix: true })}
              </p>
            )}
            {error && (
              <p className="text-[10px] text-[hsl(var(--status-error))] flex items-center gap-1">
                <AlertTriangle className="h-2.5 w-2.5" />
                {error}
              </p>
            )}
            {permissionState === 'denied' && (
              <p className="text-[10px] text-[hsl(var(--status-error))]">
                Enable location in settings
              </p>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-2 flex-shrink-0">
          <Switch
            id="location-sharing"
            checked={isSharing}
            onCheckedChange={handleToggle}
            disabled={isUpdating || permissionState === 'denied'}
          />
          <Label htmlFor="location-sharing" className="sr-only">
            Toggle location sharing
          </Label>
        </div>
      </div>
    </div>
  );
};

export default LocationTracker;
