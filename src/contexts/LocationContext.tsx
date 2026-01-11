import React, { createContext, useContext, useEffect, ReactNode } from "react";
import { useLocationPermission, LocationPermissionState, LocationTrackingState } from "@/hooks/useLocationPermission";

interface LocationContextType {
  permissionState: LocationPermissionState;
  trackingState: LocationTrackingState;
  lastUpdateTime: Date | null;
  error: string | null;
  isSharing: boolean;
  startTracking: () => Promise<boolean>;
  stopTracking: () => void;
  locationRequired: boolean;
  canProceed: boolean;
  isDriver: boolean;
}

const LocationContext = createContext<LocationContextType | undefined>(undefined);

export const useLocationContext = () => {
  const context = useContext(LocationContext);
  if (!context) {
    throw new Error("useLocationContext must be used within LocationProvider");
  }
  return context;
};

interface LocationProviderProps {
  children: ReactNode;
}

export const LocationProvider: React.FC<LocationProviderProps> = ({ children }) => {
  const locationState = useLocationPermission();

  // Auto-start tracking for drivers when permission is already granted
  useEffect(() => {
    if (
      locationState.isDriver && 
      locationState.permissionState === "granted" && 
      locationState.trackingState === "idle"
    ) {
      locationState.startTracking();
    }
  }, [locationState.isDriver, locationState.permissionState, locationState.trackingState]);

  return (
    <LocationContext.Provider value={locationState}>
      {children}
    </LocationContext.Provider>
  );
};
