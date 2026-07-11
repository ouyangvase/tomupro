import { useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface GeocodedLocation {
  orderId: string;
  orderCode: string;
  customerName: string;
  address: string;
  area: string | null;
  driverId: string | null;
  longitude: number;
  latitude: number;
}

// Cache for geocoded addresses (persists across hook instances)
// Key: address, Value: { coords, timestamp }
const GEOCODE_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const geocodeCache = new Map<string, { coords: { lat: number; lng: number } | null; timestamp: number }>();

// Timeout for individual geocode requests
const GEOCODE_REQUEST_TIMEOUT_MS = 3000;

// Get API key with caching
let cachedApiKey: string | null = null;
let apiKeyPromise: Promise<string | null> | null = null;

const getApiKey = async (): Promise<string | null> => {
  if (cachedApiKey) return cachedApiKey;
  
  // Prevent duplicate API key requests
  if (apiKeyPromise) return apiKeyPromise;
  
  apiKeyPromise = (async () => {
    try {
      const { data, error } = await supabase.functions.invoke('get-google-maps-key');
      if (error || !data?.apiKey) {
        console.warn("[Geocoding] Failed to get API key:", error?.message);
        return null;
      }
      cachedApiKey = data.apiKey;
      return data.apiKey;
    } catch (err) {
      console.error("[Geocoding] API key fetch error:", err);
      return null;
    } finally {
      apiKeyPromise = null;
    }
  })();
  
  return apiKeyPromise;
};

export const useGeocoding = () => {
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodedOrders, setGeocodedOrders] = useState<GeocodedLocation[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const geocodeAddress = useCallback(async (
    address: string, 
    signal?: AbortSignal
  ): Promise<{ lat: number; lng: number } | null> => {
    if (!address) return null;
    
    // Check cache first (with TTL)
    const cached = geocodeCache.get(address);
    if (cached && Date.now() - cached.timestamp < GEOCODE_CACHE_TTL_MS) {
      return cached.coords;
    }

    const apiKey = await getApiKey();
    if (!apiKey) {
      return null;
    }

    try {
      const encodedAddress = encodeURIComponent(address);
      
      // Create timeout for individual request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), GEOCODE_REQUEST_TIMEOUT_MS);
      
      // Combine with parent signal if provided
      const combinedSignal = signal 
        ? { signal: controller.signal }
        : { signal: controller.signal };
      
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`,
        combinedSignal
      );
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        geocodeCache.set(address, { coords: null, timestamp: Date.now() });
        return null;
      }

      const data = await response.json();
      
      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const location = data.results[0].geometry.location;
        const coords = { lat: location.lat, lng: location.lng };
        geocodeCache.set(address, { coords, timestamp: Date.now() });
        return coords;
      }
      
      geocodeCache.set(address, { coords: null, timestamp: Date.now() });
      return null;
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log("[Geocoding] Request aborted for:", address.substring(0, 30));
        return null;
      }
      console.error("[Geocoding] Error for address:", address.substring(0, 30), error.message);
      geocodeCache.set(address, { coords: null, timestamp: Date.now() });
      return null;
    }
  }, []);

  const geocodeOrders = useCallback(async (orders: Array<{
    id: string;
    order_code: string;
    customer_name: string;
    address: string;
    area: string | null;
    driver_id: string | null;
  }>): Promise<GeocodedLocation[]> => {
    if (!orders || orders.length === 0) {
      setGeocodedOrders([]);
      return [];
    }

    // Cancel any previous geocoding operation
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    setIsGeocoding(true);
    const results: GeocodedLocation[] = [];

    try {
      // Process in batches to avoid rate limiting
      const batchSize = 5;
      for (let i = 0; i < orders.length; i += batchSize) {
        // Check if aborted
        if (signal.aborted) {
          break;
        }
        
        const batch = orders.slice(i, i + batchSize);
        
        const batchResults = await Promise.all(
          batch.map(async (order) => {
            if (signal.aborted) return null;
            
            // Try geocoding with full address first
            let coords = await geocodeAddress(order.address, signal);
            
            // If failed, try with area + "Brunei"
            if (!coords && order.area && !signal.aborted) {
              coords = await geocodeAddress(`${order.area}, Brunei`, signal);
            }

            if (coords) {
              return {
                orderId: order.id,
                orderCode: order.order_code,
                customerName: order.customer_name,
                address: order.address,
                area: order.area,
                driverId: order.driver_id,
                longitude: coords.lng,
                latitude: coords.lat,
              };
            }
            return null;
          })
        );

        results.push(...batchResults.filter((r): r is GeocodedLocation => r !== null));
        
        // Small delay between batches to respect rate limits
        if (i + batchSize < orders.length && !signal.aborted) {
          await new Promise((resolve) => setTimeout(resolve, 100));
        }
      }

      setGeocodedOrders(results);
      return results;
    } catch (error: any) {
      console.error("[Geocoding] Batch processing error:", error.message);
      setGeocodedOrders(results); // Return partial results
      return results;
    } finally {
      setIsGeocoding(false);
    }
  }, [geocodeAddress]);

  const clearCache = useCallback(() => {
    geocodeCache.clear();
  }, []);

  return {
    geocodeOrders,
    geocodedOrders,
    isGeocoding,
    geocodeAddress,
    clearCache,
  };
};

export type { GeocodedLocation };
