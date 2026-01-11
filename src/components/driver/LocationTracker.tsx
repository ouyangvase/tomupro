import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { MapPin, MapPinOff, Loader2, AlertTriangle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocationContext } from "@/contexts/LocationContext";
import { formatDistanceToNow } from "date-fns";

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
    <Card className="mb-4">
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-full ${isSharing ? 'bg-green-100 dark:bg-green-900/30' : 'bg-muted'}`}>
              {isUpdating ? (
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
              {lastUpdateTime && (
                <p className="text-xs text-muted-foreground">
                  Last update: {formatDistanceToNow(lastUpdateTime, { addSuffix: true })}
                </p>
              )}
              {error && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  {error}
                </p>
              )}
              {permissionState === 'denied' && (
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
              onCheckedChange={handleToggle}
              disabled={isUpdating || permissionState === 'denied'}
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
