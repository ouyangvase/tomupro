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
const geocodeCache = new Map<string, { lat: number; lng: number } | null>();

export const useGeocoding = () => {
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodedOrders, setGeocodedOrders] = useState<GeocodedLocation[]>([]);
  const apiKeyRef = useRef<string | null>(null);

  const getApiKey = async (): Promise<string | null> => {
    if (apiKeyRef.current) return apiKeyRef.current;
    
    try {
      const { data, error } = await supabase.functions.invoke('get-google-maps-key');
      if (error || !data?.apiKey) return null;
      apiKeyRef.current = data.apiKey;
      return data.apiKey;
    } catch {
      return null;
    }
  };

  const geocodeAddress = useCallback(async (address: string): Promise<{ lat: number; lng: number } | null> => {
    // Check cache first
    if (geocodeCache.has(address)) {
      return geocodeCache.get(address) || null;
    }

    const apiKey = await getApiKey();
    if (!apiKey || !address) {
      return null;
    }

    try {
      const encodedAddress = encodeURIComponent(address);
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?address=${encodedAddress}&key=${apiKey}`
      );

      if (!response.ok) {
        geocodeCache.set(address, null);
        return null;
      }

      const data = await response.json();
      
      if (data.status === 'OK' && data.results && data.results.length > 0) {
        const location = data.results[0].geometry.location;
        const coords = { lat: location.lat, lng: location.lng };
        geocodeCache.set(address, coords);
        return coords;
      }
      
      geocodeCache.set(address, null);
      return null;
    } catch (error) {
      console.error("Geocoding error:", error);
      geocodeCache.set(address, null);
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
  }>) => {
    if (!orders || orders.length === 0) {
      setGeocodedOrders([]);
      return [];
    }

    setIsGeocoding(true);
    const results: GeocodedLocation[] = [];

    // Process in batches to avoid rate limiting
    const batchSize = 5;
    for (let i = 0; i < orders.length; i += batchSize) {
      const batch = orders.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(async (order) => {
          // Try geocoding with full address first
          let coords = await geocodeAddress(order.address);
          
          // If failed, try with area + "Brunei"
          if (!coords && order.area) {
            coords = await geocodeAddress(`${order.area}, Brunei`);
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
      if (i + batchSize < orders.length) {
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
    }

    setGeocodedOrders(results);
    setIsGeocoding(false);
    return results;
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
