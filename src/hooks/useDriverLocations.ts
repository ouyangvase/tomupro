import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";

interface DriverLocation {
  id: string;
  driver_id: string;
  latitude: number;
  longitude: number;
  accuracy: number | null;
  speed: number | null;
  heading: number | null;
  recorded_at: string;
}

interface LatestDriverLocation extends DriverLocation {
  driver_name: string;
}

export const useDriverLocations = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Update driver's current location
  const updateLocation = useMutation({
    mutationFn: async (position: GeolocationPosition) => {
      if (!user?.id) throw new Error("Not authenticated");

      const { data, error } = await supabase
        .from("driver_locations")
        .insert({
          driver_id: user.id,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          heading: position.coords.heading,
          recorded_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
  });

  return { updateLocation };
};

export const useDriverLatestLocations = (driverIds?: string[]) => {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["driver-latest-locations", driverIds],
    queryFn: async () => {
      let query = supabase
        .from("driver_latest_location")
        .select("*");

      if (driverIds && driverIds.length > 0) {
        query = query.in("driver_id", driverIds);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as LatestDriverLocation[];
    },
    enabled: !!user && (profile?.role === "runner" || profile?.role === "admin"),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Subscribe to realtime updates
  useEffect(() => {
    if (!user || (profile?.role !== "runner" && profile?.role !== "admin")) return;

    const channel = supabase
      .channel("driver-locations-updates")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "driver_locations",
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["driver-latest-locations"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, profile?.role, queryClient]);

  return query;
};

export const useLocationTracking = () => {
  const { updateLocation } = useDriverLocations();
  const { profile } = useAuth();

  const startTracking = () => {
    if (!("geolocation" in navigator)) {
      console.error("Geolocation not supported");
      return null;
    }

    if (profile?.role !== "driver") {
      return null;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        updateLocation.mutate(position);
      },
      (error) => {
        console.error("Geolocation error:", error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      }
    );

    return watchId;
  };

  const stopTracking = (watchId: number) => {
    navigator.geolocation.clearWatch(watchId);
  };

  return { startTracking, stopTracking };
};
