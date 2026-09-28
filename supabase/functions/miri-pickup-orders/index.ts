import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  jsonResponse,
  sha256Hex,
  verifySnipersBodyRequest,
} from "../_shared/snipers.ts";

function errorMessage(error: unknown) {
  if (!error || typeof error !== "object") return String(error || "Unknown error");
  return "message" in error ? String(error.message || "Unknown error") : "Unknown error";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  const bodyText = await req.text();
  const verification = await verifySnipersBodyRequest(req, bodyText);
  if (!verification.ok) return jsonResponse({ success: false, error: verification.error }, verification.status);

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(bodyText) as Record<string, unknown>;
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }

  const idempotencyKey = req.headers.get("Idempotency-Key")!;
  const envFlag = Deno.env.get("SNIPER_MIRI_PICKUP_INTEGRATION_ENABLED");
  if (envFlag && !["1", "true", "TRUE"].includes(envFlag)) {
    return jsonResponse({ success: false, error: "Miri pickup integration is disabled" }, 409);
  }
  const requestHash = await sha256Hex(bodyText);
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.rpc("create_miri_pickup_order", {
    p_payload: payload,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
  });

  if (error) {
    const message = errorMessage(error);
    const status = message.includes("AMOUNT_EXCEEDS_SETTLEMENT_BASE") ? 422 :
      message.includes("disabled") ? 409 :
      message.includes("Idempotency key") ? 409 : 400;
    return jsonResponse({ success: false, error: message }, status);
  }

  // Deliver ORDER_CREATED without making callback delivery part of order
  // creation. The durable row is already committed by the RPC transaction.
  void fetch(`${supabaseUrl}/functions/v1/send-miri-pickup-callback`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${serviceRoleKey}`,
      apikey: serviceRoleKey,
    },
    body: JSON.stringify({ orderId: data?.tomu_order_uuid, drain: false }),
  }).catch(() => undefined);

  return jsonResponse(data as Record<string, unknown>, data?.duplicate ? 200 : 201);
});
