import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { 
  MapPin, MapPinOff, Loader2, AlertTriangle, 
  Navigation, Shield, BatteryLow, ChevronDown, ChevronUp 
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocationContext } from "@/contexts/LocationContext";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import capybaraDriver from "@/assets/capybara-driver.png";
import type { LocationSharingMode } from "@/hooks/useLocationPermission";

const LocationTracker: React.FC = () => {
  const { profile } = useAuth();
  const {
    permissionState,
    trackingState,
    lastUpdateTime,
    error,
    isSharing,
    sharingMode,
    startTracking,
    stopTracking,
  } = useLocationContext();

  const [expanded, setExpanded] = useState(false);

  if (profile?.role !== "driver") return null;

  const handleToggle = async () => {
    if (isSharing) {
      stopTracking();
    } else {
      await startTracking("delivery_session");
    }
  };

  const isUpdating = trackingState === "starting";

  const modeLabel: Record<LocationSharingMode, string> = {
    off: "Off",
    delivery_session: "Delivery Session",
    live_tracking: "Runner Requested",
  };

  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="p-3">
        {/* Compact row */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={cn(
              "relative h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0 transition-colors",
              isSharing
                ? "bg-[hsl(var(--status-success)/0.15)]"
                : "bg-muted"
            )}>
              {isUpdating ? (
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
              ) : isSharing ? (
                <>
                  <Navigation className="h-4 w-4 text-[hsl(var(--status-success))]" />
                  <span className="absolute inset-0 rounded-full animate-ping bg-[hsl(var(--status-success)/0.2)]" style={{ animationDuration: '3s' }} />
                </>
              ) : (
                <MapPinOff className="h-4 w-4 text-muted-foreground" />
              )}
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">Location</span>
                <Badge
                  variant={isSharing ? "default" : "secondary"}
                  className="text-[10px] px-1.5 py-0 h-4 rounded-full"
                >
                  {isSharing ? modeLabel[sharingMode] : "OFF"}
                </Badge>
              </div>
              {isSharing && lastUpdateTime && (
                <p className="text-[10px] text-muted-foreground truncate">
                  Updated {formatDistanceToNow(lastUpdateTime, { addSuffix: true })}
                </p>
              )}
              {!isSharing && (
                <p className="text-[10px] text-muted-foreground">
                  Optional · Enable when delivering
                </p>
              )}
              {error && (
                <p className="text-[10px] text-destructive flex items-center gap-1">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  {error}
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
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>

        {/* Expanded info panel */}
        {expanded && (
          <div className="mt-3 pt-3 border-t space-y-3">
            <div className="flex items-center gap-3">
              <img src={capybaraDriver} alt="" className="h-12 w-12 object-contain opacity-80" />
              <div className="text-xs text-muted-foreground">
                <p className="font-medium text-foreground text-sm mb-0.5">Delivery Location Sharing</p>
                <p>Share your location only when delivering. Updates every 30 seconds to save battery.</p>
              </div>
            </div>

            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2">
                <MapPin className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                <p className="text-xs"><span className="font-medium">Route coordination</span> — Runners optimize your delivery route</p>
              </div>
              <div className="flex items-start gap-2">
                <Shield className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                <p className="text-xs"><span className="font-medium">Privacy protected</span> — Only shared while you enable it</p>
              </div>
              <div className="flex items-start gap-2">
                <BatteryLow className="h-3.5 w-3.5 text-primary mt-0.5 shrink-0" />
                <p className="text-xs"><span className="font-medium">Battery optimized</span> — Low-frequency updates every 30s</p>
              </div>
            </div>

            {permissionState === "denied" && (
              <div className="bg-destructive/10 rounded-lg p-3 text-xs text-destructive">
                <p className="font-medium mb-1">Location access denied</p>
                <p>Open browser settings → Site Settings → Allow location for this site, then try again.</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default LocationTracker;
