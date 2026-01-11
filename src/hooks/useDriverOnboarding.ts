import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

interface LinkResult {
  success: boolean;
  error?: string;
  runner_id?: string;
  runner_name?: string;
}

export const useDriverOnboarding = () => {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();

  // Check if driver is linked to a runner
  // Only runs for drivers - other roles skip this entirely
  const isDriver = profile?.role === "driver";
  
  const { data: isLinked, isLoading: checkingLink } = useQuery({
    queryKey: ["driver-runner-link", user?.id],
    queryFn: async () => {
      if (!user?.id) return false;

      const { data, error } = await supabase
        .from("runner_drivers")
        .select("id, runner_id")
        .eq("driver_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (error) throw error;
      return !!data;
    },
    // Only enable for drivers - salespersons, runners, admins, managers skip this
    enabled: !!user && isDriver,
  });

  // Link driver to runner by code
  const linkToRunner = useMutation({
    mutationFn: async (code: string) => {
      const { data, error } = await supabase.rpc("link_driver_to_runner_by_code", {
        p_code: code.toUpperCase().trim(),
      });

      if (error) throw error;
      return data as unknown as LinkResult;
    },
    onSuccess: (result) => {
      if (result.success) {
        toast.success(`Successfully linked to ${result.runner_name}`);
        queryClient.invalidateQueries({ queryKey: ["driver-runner-link"] });
        queryClient.invalidateQueries({ queryKey: ["driver-parent-runner"] });
        queryClient.invalidateQueries({ queryKey: ["driver-parent-runner-id"] });
      } else {
        toast.error(result.error || "Failed to link to runner");
      }
    },
    onError: (error: Error) => {
      toast.error(`Error: ${error.message}`);
    },
  });

  // Get runner's code (for runners to share)
  const { data: runnerCode } = useQuery({
    queryKey: ["runner-code", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;

      const { data, error } = await supabase
        .from("profiles")
        .select("runner_code")
        .eq("id", user.id)
        .single();

      if (error) throw error;
      return data?.runner_code;
    },
    enabled: !!user && profile?.role === "runner",
  });

  return {
    isLinked,
    // Only show checkingLink for drivers - other roles are never checking
    checkingLink: isDriver ? checkingLink : false,
    linkToRunner,
    runnerCode,
    // Only drivers can need onboarding - salespersons/runners/admins/managers never do
    needsOnboarding: isDriver && isLinked === false && !checkingLink,
  };
};
