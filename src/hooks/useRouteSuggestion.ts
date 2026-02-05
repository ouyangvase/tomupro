import { useMemo, useCallback, useState, useEffect } from "react";
import { useLocationContext } from "@/contexts/LocationContext";
import { useGeocoding, GeocodedLocation } from "@/hooks/useGeocoding";
import { haversineDistance } from "@/lib/haversine";

interface OrderWithLocation {
  id: string;
  order_code: string;
  customer_name: string;
  address: string;
  area: string | null;
  driver_id: string | null;
}

interface SuggestionResult {
  orderId: string;
  rank: number;
  distance: number; // in km
}

export const useRouteSuggestion = (orders: OrderWithLocation[]) => {
  const { trackingState, lastUpdateTime } = useLocationContext();
  const { geocodeOrders, geocodedOrders, isGeocoding } = useGeocoding();
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Get current driver position
  const updateDriverLocation = useCallback(() => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setDriverLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        (error) => {
          console.warn("Failed to get driver location:", error.message);
          setDriverLocation(null);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 } // Cache for 5 minutes
      );
    }
  }, []);

  // Update driver location when tracking state changes
  useEffect(() => {
    if (trackingState === "active") {
      updateDriverLocation();
    }
  }, [trackingState, lastUpdateTime, updateDriverLocation]);

  // Initial location fetch
  useEffect(() => {
    updateDriverLocation();
  }, [updateDriverLocation]);

  // Geocode orders when they change
  useEffect(() => {
    if (orders.length > 0) {
      geocodeOrders(orders);
    }
  }, [orders, geocodeOrders]);

  // Calculate suggestions based on distance
  const suggestions = useMemo<Map<string, SuggestionResult>>(() => {
    const result = new Map<string, SuggestionResult>();

    if (!driverLocation || geocodedOrders.length === 0) {
      return result;
    }

    // Calculate distance for each geocoded order
    const ordersWithDistance = geocodedOrders.map((order) => ({
      orderId: order.orderId,
      distance: haversineDistance(
        driverLocation.lat,
        driverLocation.lng,
        order.latitude,
        order.longitude
      ),
    }));

    // Sort by distance (nearest first)
    ordersWithDistance.sort((a, b) => a.distance - b.distance);

    // Assign ranks
    ordersWithDistance.forEach((order, index) => {
      result.set(order.orderId, {
        orderId: order.orderId,
        rank: index + 1,
        distance: order.distance,
      });
    });

    return result;
  }, [driverLocation, geocodedOrders]);

  // Get sorted order IDs based on suggestion
  const getSuggestedOrderIds = useCallback((): string[] => {
    if (suggestions.size === 0) {
      return orders.map((o) => o.id);
    }

    const suggestedIds: string[] = [];
    const unsuggestedIds: string[] = [];

    orders.forEach((order) => {
      if (suggestions.has(order.id)) {
        suggestedIds.push(order.id);
      } else {
        unsuggestedIds.push(order.id);
      }
    });

    // Sort suggested IDs by rank
    suggestedIds.sort((a, b) => {
      const rankA = suggestions.get(a)?.rank ?? Infinity;
      const rankB = suggestions.get(b)?.rank ?? Infinity;
      return rankA - rankB;
    });

    // Append unsorted orders at the end
    return [...suggestedIds, ...unsuggestedIds];
  }, [suggestions, orders]);

  // Check if suggestions are available
  const hasSuggestions = driverLocation !== null && suggestions.size > 0;

  return {
    suggestions,
    hasSuggestions,
    isGeocoding,
    driverLocation,
    getSuggestedOrderIds,
    refreshLocation: updateDriverLocation,
    geocodedOrders,
  };
};
