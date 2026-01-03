import { useState, useCallback } from "react";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN || "";

interface RoutePoint {
  longitude: number;
  latitude: number;
  orderId?: string;
  orderCode?: string;
}

interface OptimizedRoute {
  driverId: string;
  geometry: GeoJSON.LineString;
  distance: number; // in meters
  duration: number; // in seconds
  waypoints: RoutePoint[];
}

interface DirectionsResponse {
  routes: Array<{
    geometry: GeoJSON.LineString;
    distance: number;
    duration: number;
  }>;
  waypoints: Array<{
    location: [number, number];
    waypoint_index: number;
  }>;
}

export const useRouteDrawing = () => {
  const [isCalculating, setIsCalculating] = useState(false);
  const [routes, setRoutes] = useState<Map<string, OptimizedRoute>>(new Map());

  const calculateRoute = useCallback(async (
    driverId: string,
    driverLocation: { longitude: number; latitude: number },
    destinations: RoutePoint[]
  ): Promise<OptimizedRoute | null> => {
    if (!MAPBOX_TOKEN || destinations.length === 0) {
      return null;
    }

    setIsCalculating(true);

    try {
      // Build coordinates string: driver location + all destinations
      const allPoints = [
        driverLocation,
        ...destinations
      ];

      // Mapbox allows max 25 coordinates per request
      const limitedPoints = allPoints.slice(0, 25);
      
      const coordinates = limitedPoints
        .map((p) => `${p.longitude},${p.latitude}`)
        .join(";");

      // Use optimize=true to get the optimal order
      const response = await fetch(
        `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?` +
        `access_token=${MAPBOX_TOKEN}&` +
        `geometries=geojson&` +
        `overview=full&` +
        `steps=false`
      );

      if (!response.ok) {
        console.error("Directions API error:", response.status);
        return null;
      }

      const data: DirectionsResponse = await response.json();

      if (!data.routes || data.routes.length === 0) {
        return null;
      }

      const route = data.routes[0];
      
      const optimizedRoute: OptimizedRoute = {
        driverId,
        geometry: route.geometry,
        distance: route.distance,
        duration: route.duration,
        waypoints: limitedPoints,
      };

      setRoutes((prev) => {
        const newMap = new Map(prev);
        newMap.set(driverId, optimizedRoute);
        return newMap;
      });

      return optimizedRoute;
    } catch (error) {
      console.error("Route calculation error:", error);
      return null;
    } finally {
      setIsCalculating(false);
    }
  }, []);

  const clearRoute = useCallback((driverId: string) => {
    setRoutes((prev) => {
      const newMap = new Map(prev);
      newMap.delete(driverId);
      return newMap;
    });
  }, []);

  const clearAllRoutes = useCallback(() => {
    setRoutes(new Map());
  }, []);

  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  };

  const formatDuration = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes} min`;
  };

  return {
    calculateRoute,
    clearRoute,
    clearAllRoutes,
    routes,
    isCalculating,
    formatDistance,
    formatDuration,
  };
};
