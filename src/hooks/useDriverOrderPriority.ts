import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { subscribeWithReconnect } from "@/lib/subscribeWithReconnect";

export interface DriverOrderPriority {
  id: string;
  driver_user_id: string;
  order_id: string;
  priority_number: number;
  updated_at: string;
}

export const useDriverOrderPriority = (orderIds?: string[]) => {
  const { user } = useAuth();
  const [priorities, setPriorities] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [hasManualPriority, setHasManualPriority] = useState(false);

  // Fetch priorities for given order IDs
  const fetchPriorities = useCallback(async () => {
    if (!user?.id || !orderIds?.length) {
      setPriorities({});
      setHasManualPriority(false);
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("driver_order_priority")
        .select("*")
        .eq("driver_user_id", user.id)
        .in("order_id", orderIds);

      if (error) throw error;

      const priorityMap: Record<string, number> = {};
      data?.forEach((p) => {
        priorityMap[p.order_id] = p.priority_number;
      });
      setPriorities(priorityMap);
      setHasManualPriority((data?.length ?? 0) > 0);
    } catch (error) {
      console.error("Error fetching driver priorities:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, orderIds]);

  // Bulk update priorities (used after drag-drop)
  const updatePriorities = useCallback(
    async (orderedIds: string[]) => {
      if (!user?.id || !orderedIds.length) return;

      const updates = orderedIds.map((orderId, index) => ({
        driver_user_id: user.id,
        order_id: orderId,
        priority_number: index + 1,
        updated_at: new Date().toISOString(),
      }));

      try {
        // Upsert all priorities
        const { error } = await supabase
          .from("driver_order_priority")
          .upsert(updates, { onConflict: "driver_user_id,order_id" });

        if (error) throw error;

        // Update local state
        const newPriorities: Record<string, number> = {};
        orderedIds.forEach((id, idx) => {
          newPriorities[id] = idx + 1;
        });
        setPriorities(newPriorities);
        setHasManualPriority(true);

        toast.success("Order priority saved");
      } catch (error) {
        console.error("Error updating priorities:", error);
        toast.error("Failed to save order priority");
      }
    },
    [user?.id]
  );

  // Clear all manual priorities (reset to default sorting)
  const clearPriorities = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { error } = await supabase
        .from("driver_order_priority")
        .delete()
        .eq("driver_user_id", user.id);

      if (error) throw error;

      setPriorities({});
      setHasManualPriority(false);
      toast.success("Priority reset to default");
    } catch (error) {
      console.error("Error clearing priorities:", error);
      toast.error("Failed to reset priority");
    }
  }, [user?.id]);

  // Initial fetch
  useEffect(() => {
    fetchPriorities();
  }, [fetchPriorities]);

  // Realtime subscription
  useEffect(() => {
    if (!user?.id) return;

    return subscribeWithReconnect(() => supabase
      .channel(`driver_priority_changes:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "driver_order_priority",
          filter: `driver_user_id=eq.${user.id}`,
        },
        () => {
          // Refetch on any change to keep in sync
          fetchPriorities();
        }
      ),
      { name: `driver_priority_changes:${user.id}` },
    );
  }, [user?.id, fetchPriorities]);

  return {
    priorities,
    hasManualPriority,
    isLoading,
    updatePriorities,
    clearPriorities,
    refetch: fetchPriorities,
  };
};
