import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";
import { useFirebaseDriverLocations } from "@/hooks/useFirebaseLocations";
import { isFirebaseEnabled } from "@/integrations/firebase/client";

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

/**
 * Unified driver locations hook.
 * When Firebase is enabled, uses Firestore realtime (no polling, no Supabase load).
 * Falls back to Supabase driver_latest_location view when Firebase is disabled.
 */
export const useDriverLatestLocations = (driverIds?: string[]) => {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const isAllowed = !!user && (profile?.role === "runner" || profile?.role === "admin");

  // Firebase path: realtime via Firestore onSnapshot
  const firebaseResult = useFirebaseDriverLocations(
    isFirebaseEnabled && isAllowed ? driverIds : undefined
  );

  // Supabase fallback path
  const supabaseQuery = useQuery({
    queryKey: ["driver-latest-locations", driverIds],
    queryFn: async () => {
      let q = supabase.from("driver_latest_location").select("*");
      if (driverIds && driverIds.length > 0) {
        q = q.in("driver_id", driverIds);
      }
      const { data, error } = await q;
      if (error) throw error;
      return data as LatestDriverLocation[];
    },
    enabled: isAllowed && !isFirebaseEnabled,
    refetchInterval: 15000,
  });

  // Supabase realtime subscription (only when Firebase disabled)
  useEffect(() => {
    if (!isAllowed || isFirebaseEnabled) return;

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
  }, [isAllowed, queryClient]);

  // When Firebase is enabled, adapt Firebase data to match the Supabase format
  if (isFirebaseEnabled) {
    const adaptedData: LatestDriverLocation[] = firebaseResult.locations.map((loc) => ({
      id: loc.driverId,
      driver_id: loc.driverId,
      latitude: loc.lat,
      longitude: loc.lng,
      accuracy: loc.accuracy,
      speed: loc.speed,
      heading: loc.heading,
      recorded_at: loc.updatedAt?.toISOString() || new Date().toISOString(),
      driver_name: "", // Firebase doesn't store name in locations; DriverMapView uses separate driver list
    }));

    return {
      data: adaptedData,
      isLoading: firebaseResult.isLoading,
      isError: false,
      error: null,
      refetch: async () => ({ data: adaptedData, error: null, isError: false, isLoading: false, failureCount: 0, failureReason: null, errorUpdateCount: 0, status: 'success' as const, fetchStatus: 'idle' as const, isFetched: true, isFetchedAfterMount: true, isFetching: false, isInitialLoading: false, isPaused: false, isPlaceholderData: false, isPending: false, isRefetchError: false, isRefetching: false, isStale: false, isSuccess: true, dataUpdatedAt: Date.now(), errorUpdatedAt: 0 }),
    } as unknown as ReturnType<typeof useQuery<LatestDriverLocation[]>>;
  }

  return supabaseQuery;
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