import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, jsonResponse, verifySnipersRequest } from "../_shared/snipers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  const verification = await verifySnipersRequest(req);
  if (!verification.ok) return jsonResponse({ success: false, error: verification.error }, verification.status);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const url = new URL(req.url);
  const requested = url.searchParams.get("type");
  const search = url.searchParams.get("search")?.trim().toLowerCase() || "";

  if (!requested || requested === "sellers") {
    const { data, error } = await supabase
      .from("seller_accounts")
      .select("id, account_code, store_name, status")
      .eq("status", "ACTIVE")
      .eq("can_create_miri_pickup", true)
      .order("store_name");
    if (error) return jsonResponse({ success: false, error: error.message }, 500);
    const sellers = (data || [])
      .map((seller) => ({
        tomu_seller_account_id: seller.id,
        tomu_account_code: seller.account_code,
        store_name: seller.store_name,
        status: seller.status,
      }))
      .filter((seller) => !search || `${seller.store_name} ${seller.tomu_account_code}`.toLowerCase().includes(search));
    if (requested === "sellers") return jsonResponse({ success: true, sellers });

    const { data: runners, error: runnerError } = await supabase
      .from("profiles")
      .select("id, runner_code, display_name, status, is_active")
      .eq("role", "runner")
      .eq("status", "active")
      .eq("is_active", true)
      .eq("can_receive_miri_pickup", true)
      .order("display_name");
    if (runnerError) return jsonResponse({ success: false, error: runnerError.message }, 500);

    return jsonResponse({
      success: true,
      sellers,
      runners: (runners || []).map((runner) => ({
        id: runner.id,
        display_name: runner.display_name,
        runner_code: runner.runner_code,
        status: runner.status,
        phone_last_four: null,
      })),
    });
  }

  if (requested === "runners") {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, runner_code, display_name, status, is_active")
      .eq("role", "runner")
      .eq("status", "active")
      .eq("is_active", true)
      .eq("can_receive_miri_pickup", true)
      .order("display_name");
    if (error) return jsonResponse({ success: false, error: error.message }, 500);
    return jsonResponse({
      success: true,
      runners: (data || []).map((runner) => ({
        id: runner.id,
        display_name: runner.display_name,
        runner_code: runner.runner_code,
        status: runner.status,
        phone_last_four: null,
      })),
    });
  }

  return jsonResponse({ success: false, error: "type must be sellers or runners" }, 400);
});
