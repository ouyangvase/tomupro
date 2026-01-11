import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { 
  MapPin, 
  Shield, 
  Loader2, 
  AlertTriangle, 
  CheckCircle2,
  Navigation,
  Settings
} from "lucide-react";
import { useLocationPermission } from "@/hooks/useLocationPermission";
import { useAuth } from "@/contexts/AuthContext";
import tomuLogo from "@/assets/tomu-logo.png";

interface LocationPermissionGateProps {
  children: React.ReactNode;
}

const LocationPermissionGate: React.FC<LocationPermissionGateProps> = ({ children }) => {
  const { profile, signOut, signingOut } = useAuth();
  const {
    permissionState,
    trackingState,
    error,
    isSharing,
    startTracking,
    isDriver,
  } = useLocationPermission();
  
  const [isEnabling, setIsEnabling] = useState(false);

  // Non-drivers pass through immediately
  if (!isDriver) {
    return <>{children}</>;
  }

  // If location is already active, render children
  if (isSharing && trackingState === "active") {
    return <>{children}</>;
  }

  const handleEnableLocation = async () => {
    setIsEnabling(true);
    const success = await startTracking();
    setIsEnabling(false);
  };

  const getStatusBadge = () => {
    if (permissionState === "denied") {
      return <Badge variant="destructive">Permission Denied</Badge>;
    }
    if (permissionState === "unsupported") {
      return <Badge variant="destructive">Not Supported</Badge>;
    }
    if (trackingState === "active" && isSharing) {
      return <Badge className="bg-green-500">Location Active</Badge>;
    }
    return <Badge variant="secondary">Location Off</Badge>;
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img 
            src={tomuLogo} 
            alt="TOMU Logo" 
            className="mx-auto h-16 w-16 object-contain mb-4" 
          />
          <div className="mx-auto h-16 w-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Navigation className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl">Enable Live Location</CardTitle>
          <div className="flex justify-center mt-2">
            {getStatusBadge()}
          </div>
          <CardDescription className="text-base mt-3">
            Your runner needs to track your location for delivery coordination.
            This helps with route planning and customer updates.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Benefits */}
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">Better Route Planning</p>
                <p className="text-xs text-muted-foreground">
                  Runners can optimize your delivery route
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">Customer Updates</p>
                <p className="text-xs text-muted-foreground">
                  Accurate ETAs for waiting customers
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Shield className="h-5 w-5 text-primary mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-sm">Privacy Protected</p>
                <p className="text-xs text-muted-foreground">
                  Only your runner can see your location while you're active
                </p>
              </div>
            </div>
          </div>

          {/* Error message */}
          {error && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Permission denied instructions */}
          {permissionState === "denied" && (
            <Alert>
              <Settings className="h-4 w-4" />
              <AlertDescription className="text-sm">
                <strong>Location access was denied.</strong>
                <br />
                To enable:
                <ol className="list-decimal ml-4 mt-1 space-y-1">
                  <li>Open your browser settings</li>
                  <li>Find "Site Settings" or "Permissions"</li>
                  <li>Allow location access for this site</li>
                  <li>Refresh and try again</li>
                </ol>
              </AlertDescription>
            </Alert>
          )}

          {/* Unsupported browser */}
          {permissionState === "unsupported" && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Your browser doesn't support location services.
                Please use a modern browser like Chrome, Safari, or Firefox.
              </AlertDescription>
            </Alert>
          )}

          {/* Main action buttons */}
          <div className="space-y-3">
            <Button 
              className="w-full" 
              size="lg"
              onClick={handleEnableLocation}
              disabled={isEnabling || permissionState === "unsupported"}
            >
              {isEnabling ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Enabling Location...
                </>
              ) : permissionState === "denied" ? (
                <>
                  <Settings className="h-4 w-4 mr-2" />
                  Try Again
                </>
              ) : (
                <>
                  <MapPin className="h-4 w-4 mr-2" />
                  Enable Location Sharing
                </>
              )}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  or
                </span>
              </div>
            </div>

            <Button 
              variant="outline" 
              className="w-full"
              onClick={signOut}
              disabled={signingOut}
            >
              {signingOut ? "Signing out..." : "Sign Out"}
            </Button>
          </div>

          {/* Info note */}
          <p className="text-xs text-muted-foreground text-center">
            Location sharing is required for all active drivers.
            Your location is only shared while using the app.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default LocationPermissionGate;
