import React, { createContext, useContext, ReactNode } from "react";
import { useLocationPermission, LocationPermissionState, LocationTrackingState, LocationSharingMode } from "@/hooks/useLocationPermission";

interface LocationContextType {
  permissionState: LocationPermissionState;
  trackingState: LocationTrackingState;
  lastUpdateTime: Date | null;
  error: string | null;
  isSharing: boolean;
  sharingMode: LocationSharingMode;
  startTracking: (mode?: LocationSharingMode) => Promise<boolean>;
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

  // NO auto-start - location sharing is optional now

  return (
    <LocationContext.Provider value={locationState}>
      {children}
    </LocationContext.Provider>
  );
};
