import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export interface DriverRemark {
  id: string;
  order_id: string;
  driver_user_id: string;
  remark_type: string;
  remark_text: string | null;
  created_at: string;
  updated_at: string;
}

export const REMARK_PRESETS = [
  { value: "texted_customer", label: "Texted Customer" },
  { value: "called_customer", label: "Called Customer" },
  { value: "waiting_reply", label: "Waiting Reply" },
  { value: "customer_replied", label: "Customer Replied" },
  { value: "arranging_delivery", label: "Arranging Delivery" },
  { value: "custom", label: "Custom Note" },
] as const;

export type RemarkPreset = typeof REMARK_PRESETS[number]["value"];

export const useDriverRemarks = (orderIds?: string[]) => {
  const { user } = useAuth();
  const [remarks, setRemarks] = useState<Record<string, DriverRemark>>({});
  const [isLoading, setIsLoading] = useState(true);

  // Fetch remarks for given order IDs
  const fetchRemarks = useCallback(async () => {
    if (!user?.id || !orderIds?.length) {
      setRemarks({});
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from("driver_order_remarks")
        .select("*")
        .eq("driver_user_id", user.id)
        .in("order_id", orderIds);

      if (error) throw error;

      const remarkMap: Record<string, DriverRemark> = {};
      data?.forEach((remark) => {
        remarkMap[remark.order_id] = remark as DriverRemark;
      });
      setRemarks(remarkMap);
    } catch (error) {
      console.error("Error fetching driver remarks:", error);
    } finally {
      setIsLoading(false);
    }
  }, [user?.id, orderIds]);

  // Upsert a remark
  const upsertRemark = useCallback(
    async (orderId: string, remarkType: string, remarkText?: string) => {
      if (!user?.id) return;

      try {
        const { error } = await supabase
          .from("driver_order_remarks")
          .upsert(
            {
              order_id: orderId,
              driver_user_id: user.id,
              remark_type: remarkType,
              remark_text: remarkText || null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "order_id,driver_user_id" }
          );

        if (error) throw error;

        // Update local state optimistically
        setRemarks((prev) => ({
          ...prev,
          [orderId]: {
            ...prev[orderId],
            id: prev[orderId]?.id || "",
            order_id: orderId,
            driver_user_id: user.id,
            remark_type: remarkType,
            remark_text: remarkText || null,
            created_at: prev[orderId]?.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
        }));

        toast.success("Remark saved");
      } catch (error) {
        console.error("Error saving remark:", error);
        toast.error("Failed to save remark");
      }
    },
    [user?.id]
  );

  // Delete a remark
  const deleteRemark = useCallback(
    async (orderId: string) => {
      if (!user?.id) return;

      try {
        const { error } = await supabase
          .from("driver_order_remarks")
          .delete()
          .eq("order_id", orderId)
          .eq("driver_user_id", user.id);

        if (error) throw error;

        setRemarks((prev) => {
          const newRemarks = { ...prev };
          delete newRemarks[orderId];
          return newRemarks;
        });

        toast.success("Remark removed");
      } catch (error) {
        console.error("Error deleting remark:", error);
        toast.error("Failed to remove remark");
      }
    },
    [user?.id]
  );

  // Initial fetch
  useEffect(() => {
    fetchRemarks();
  }, [fetchRemarks]);

  // Realtime subscription
  useEffect(() => {
    if (!user?.id) return;

    const channel = supabase
      .channel("driver_remarks_changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "driver_order_remarks",
          filter: `driver_user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            const oldRecord = payload.old as { order_id: string };
            setRemarks((prev) => {
              const newRemarks = { ...prev };
              delete newRemarks[oldRecord.order_id];
              return newRemarks;
            });
          } else {
            const newRecord = payload.new as DriverRemark;
            setRemarks((prev) => ({
              ...prev,
              [newRecord.order_id]: newRecord,
            }));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  return {
    remarks,
    isLoading,
    upsertRemark,
    deleteRemark,
    refetch: fetchRemarks,
  };
};
