import React from "react";

interface LocationPermissionGateProps {
  children: React.ReactNode;
}

/**
 * LocationPermissionGate no longer blocks drivers.
 * Location sharing is optional — drivers can use the app without it.
 * The LocationTracker component in the driver dashboard provides
 * on-demand location sharing controls.
 */
const LocationPermissionGate: React.FC<LocationPermissionGateProps> = ({ children }) => {
  return <>{children}</>;
};

export default LocationPermissionGate;
