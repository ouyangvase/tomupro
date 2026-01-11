import { useQuery, useQueryClient } from "@tanstack/react-query";
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
    refetchInterval: 15000, // Refetch every 15 seconds
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

// Helper to determine driver status based on last update time
export const getDriverStatus = (recordedAt: string): "online" | "recent" | "stale" | "offline" => {
  const now = new Date();
  const recorded = new Date(recordedAt);
  const diffMinutes = (now.getTime() - recorded.getTime()) / (1000 * 60);
  
  if (diffMinutes < 2) return "online";
  if (diffMinutes < 10) return "recent";
  if (diffMinutes < 60) return "stale";
  return "offline";
};

