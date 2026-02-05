import { useMemo, useCallback, useState, useEffect, useRef } from "react";
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

// Cache for route suggestions (15 minute TTL)
const CACHE_TTL_MS = 15 * 60 * 1000;
const suggestionCache = new Map<string, { result: SuggestionResult; timestamp: number }>();

// Maximum orders to process for route suggestions
const MAX_ORDERS_FOR_ROUTE = 20;

// Timeout for route calculation (5 seconds)
const ROUTE_TIMEOUT_MS = 5000;

export const useRouteSuggestion = (orders: OrderWithLocation[]) => {
  const { trackingState, lastUpdateTime } = useLocationContext();
  const { geocodeOrders, geocodedOrders, isGeocoding, clearCache: clearGeoCache } = useGeocoding();
  const [driverLocation, setDriverLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [hasTimedOut, setHasTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Track if calculation is in progress to prevent duplicate runs
  const calculationInProgressRef = useRef(false);
  const lastOrderIdsRef = useRef<string>("");
  const lastLocationRef = useRef<string>("");
  const abortControllerRef = useRef<AbortController | null>(null);

  // Get current driver position with timeout
  const updateDriverLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      console.log("[Route] Geolocation not available");
      return;
    }

    console.log("[Route] Requesting driver location...");
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        console.log("[Route] Driver location obtained:", position.coords.latitude, position.coords.longitude);
        setDriverLocation({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
        setHasTimedOut(false);
        setError(null);
      },
      (error) => {
        console.warn("[Route] Failed to get driver location:", error.message);
        setDriverLocation(null);
        setError("Location unavailable");
      },
      { 
        enableHighAccuracy: true, 
        timeout: 10000, 
        maximumAge: 300000 // Cache for 5 minutes
      }
    );
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

  // Geocode orders when they change (with deduplication and limits)
  useEffect(() => {
    // Create a stable key for orders
    const orderIds = orders.map(o => o.id).sort().join(",");
    
    // Skip if same orders
    if (orderIds === lastOrderIdsRef.current) {
      return;
    }
    
    // Skip if no orders
    if (orders.length === 0) {
      lastOrderIdsRef.current = orderIds;
      return;
    }
    
    // Skip if calculation already in progress
    if (calculationInProgressRef.current) {
      console.log("[Route] Calculation already in progress, skipping");
      return;
    }

    console.log("[Route] Starting geocoding for", orders.length, "orders");
    lastOrderIdsRef.current = orderIds;
    calculationInProgressRef.current = true;
    setIsCalculating(true);
    setHasTimedOut(false);
    setError(null);

    // Cancel previous calculation if any
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    // Limit to MAX_ORDERS_FOR_ROUTE orders (prioritize by date or existing order)
    const limitedOrders = orders.slice(0, MAX_ORDERS_FOR_ROUTE);
    
    // Create timeout promise
    const timeoutPromise = new Promise<'timeout'>((resolve) => {
      setTimeout(() => resolve('timeout'), ROUTE_TIMEOUT_MS);
    });

    // Create geocoding promise
    const geocodingPromise = geocodeOrders(limitedOrders);

    // Race between geocoding and timeout
    Promise.race([geocodingPromise, timeoutPromise])
      .then((result) => {
        if (result === 'timeout') {
          console.warn("[Route] Route calculation timed out after", ROUTE_TIMEOUT_MS, "ms");
          setHasTimedOut(true);
          setError("Route calculation timed out");
        } else {
          console.log("[Route] Geocoding completed successfully, processed", (result as GeocodedLocation[]).length, "orders");
        }
      })
      .catch((err) => {
        console.error("[Route] Route calculation error:", err);
        setError("Route calculation failed");
      })
      .finally(() => {
        calculationInProgressRef.current = false;
        setIsCalculating(false);
      });

  }, [orders, geocodeOrders]);

  // Calculate suggestions based on distance (with caching)
  const suggestions = useMemo<Map<string, SuggestionResult>>(() => {
    const result = new Map<string, SuggestionResult>();

    if (!driverLocation || geocodedOrders.length === 0) {
      return result;
    }

    // Create cache key based on driver location (rounded to reduce recalcs)
    const locationKey = `${Math.round(driverLocation.lat * 1000)},${Math.round(driverLocation.lng * 1000)}`;
    
    // Skip if same location
    if (locationKey === lastLocationRef.current && suggestionCache.size > 0) {
      // Return cached results if still valid
      const now = Date.now();
      let allValid = true;
      
      geocodedOrders.forEach((order) => {
        const cached = suggestionCache.get(order.orderId);
        if (cached && now - cached.timestamp < CACHE_TTL_MS) {
          result.set(order.orderId, cached.result);
        } else {
          allValid = false;
        }
      });
      
      if (allValid && result.size === geocodedOrders.length) {
        console.log("[Route] Using cached suggestions");
        return result;
      }
    }
    
    lastLocationRef.current = locationKey;

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

    // Assign ranks and cache
    const now = Date.now();
    ordersWithDistance.forEach((order, index) => {
      const suggestion: SuggestionResult = {
        orderId: order.orderId,
        rank: index + 1,
        distance: order.distance,
      };
      result.set(order.orderId, suggestion);
      suggestionCache.set(order.orderId, { result: suggestion, timestamp: now });
    });

    console.log("[Route] Calculated", result.size, "suggestions");
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

  // Manual refresh with cache clear
  const refreshRoute = useCallback(() => {
    console.log("[Route] Manual refresh triggered");
    
    // Clear caches
    suggestionCache.clear();
    lastOrderIdsRef.current = "";
    lastLocationRef.current = "";
    
    // Clear geocoding cache
    clearGeoCache();
    
    // Reset state
    setHasTimedOut(false);
    setError(null);
    
    // Refresh location first, then orders will re-geocode
    updateDriverLocation();
    
    // Force re-geocode by triggering effect
    if (orders.length > 0) {
      calculationInProgressRef.current = false;
      setIsCalculating(true);
      
      const limitedOrders = orders.slice(0, MAX_ORDERS_FOR_ROUTE);
      
      const timeoutPromise = new Promise<'timeout'>((resolve) => {
        setTimeout(() => resolve('timeout'), ROUTE_TIMEOUT_MS);
      });

      const geocodingPromise = geocodeOrders(limitedOrders);

      Promise.race([geocodingPromise, timeoutPromise])
        .then((result) => {
          if (result === 'timeout') {
            console.warn("[Route] Refresh timed out");
            setHasTimedOut(true);
            setError("Route calculation timed out");
          }
        })
        .catch((err) => {
          console.error("[Route] Refresh error:", err);
          setError("Refresh failed");
        })
        .finally(() => {
          setIsCalculating(false);
        });
    }
  }, [updateDriverLocation, clearGeoCache, geocodeOrders, orders]);

  // Check if suggestions are available
  const hasSuggestions = driverLocation !== null && suggestions.size > 0;

  // Combined loading state - true only during active calculation
  const isLoading = isCalculating || isGeocoding;

  return {
    suggestions,
    hasSuggestions,
    isGeocoding: isLoading,
    isCalculating,
    hasTimedOut,
    error,
    driverLocation,
    getSuggestedOrderIds,
    refreshLocation: refreshRoute,
    geocodedOrders,
    ordersProcessed: Math.min(orders.length, MAX_ORDERS_FOR_ROUTE),
    totalOrders: orders.length,
  };
};
