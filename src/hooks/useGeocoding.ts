import { useState, useCallback } from "react";

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_PUBLIC_TOKEN || "";

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

interface GeocodeResult {
  features: Array<{
    center: [number, number];
    place_name: string;
  }>;
}

// Cache for geocoded addresses
const geocodeCache = new Map<string, [number, number] | null>();

export const useGeocoding = () => {
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodedOrders, setGeocodedOrders] = useState<GeocodedLocation[]>([]);

  const geocodeAddress = async (address: string): Promise<[number, number] | null> => {
    // Check cache first
    if (geocodeCache.has(address)) {
      return geocodeCache.get(address) || null;
    }

    if (!MAPBOX_TOKEN || !address) {
      return null;
    }

    try {
      const encodedAddress = encodeURIComponent(address);
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodedAddress}.json?access_token=${MAPBOX_TOKEN}&country=my&limit=1`
      );

      if (!response.ok) {
        return null;
      }

      const data: GeocodeResult = await response.json();
      
      if (data.features && data.features.length > 0) {
        const [lng, lat] = data.features[0].center;
        geocodeCache.set(address, [lng, lat]);
        return [lng, lat];
      }
      
      geocodeCache.set(address, null);
      return null;
    } catch (error) {
      console.error("Geocoding error:", error);
      return null;
    }
  };

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
      return;
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
          
          // If failed, try with area + "Malaysia"
          if (!coords && order.area) {
            coords = await geocodeAddress(`${order.area}, Malaysia`);
          }

          if (coords) {
            return {
              orderId: order.id,
              orderCode: order.order_code,
              customerName: order.customer_name,
              address: order.address,
              area: order.area,
              driverId: order.driver_id,
              longitude: coords[0],
              latitude: coords[1],
            };
          }
          return null;
        })
      );

      results.push(...batchResults.filter((r): r is GeocodedLocation => r !== null));
      
      // Small delay between batches
      if (i + batchSize < orders.length) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    setGeocodedOrders(results);
    setIsGeocoding(false);
  }, []);

  return {
    geocodeOrders,
    geocodedOrders,
    isGeocoding,
    geocodeAddress,
  };
};
