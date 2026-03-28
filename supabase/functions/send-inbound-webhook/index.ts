import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hmacSign(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

interface InboundWebhookPayload {
  event: string;
  tracking_no: string;
  status: string;
  accepted_at: string;
  runner: string;
  target_user: string;
  target_user_id: string;
  shipment_id: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let body: { shipmentId: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { shipmentId } = body;

  if (!shipmentId) {
    return jsonResponse({ error: "Missing shipmentId" }, 400);
  }

  // Get integration settings for pulsecontrol
  const { data: settings } = await supabase
    .from("integration_settings")
    .select("*")
    .eq("integration_name", "pulsecontrol")
    .single();

  if (!settings || !settings.webhook_enabled || !settings.webhook_url) {
    const idempKey = `inbound_acknowledged:skip:${shipmentId}`;
    await supabase.from("webhook_logs").insert({
      event_type: "inbound_acknowledged",
      idempotency_key: idempKey,
      sync_status: "skipped",
      payload: { reason: "PulseControl webhook not enabled or URL not configured", shipment_id: shipmentId },
    });
    return jsonResponse({ success: true, status: "skipped", reason: "Webhook not enabled" });
  }

  // Fetch shipment
  const { data: shipment, error: shipmentError } = await supabase
    .from("inbound_shipments")
    .select("id, tracking_no, status, runner_id, salesperson_id, created_at")
    .eq("id", shipmentId)
    .single();

  if (shipmentError || !shipment) {
    return jsonResponse({ error: "Shipment not found" }, 404);
  }

  // Fetch runner and target user display names
  const { data: profiles } = await supabase
    .from("user_directory")
    .select("id, display_name")
    .in("id", [shipment.runner_id, shipment.salesperson_id]);

  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p.display_name || "Unknown"]));
  const runnerName = profileMap.get(shipment.runner_id) || "Unknown";
  const targetUserName = profileMap.get(shipment.salesperson_id) || "Unknown";

  // Build idempotency key
  const idempotencyKey = `inbound_acknowledged:${shipment.tracking_no}:${shipment.id}`;

  // Check if already sent
  const { data: existingLog } = await supabase
    .from("webhook_logs")
    .select("id, sync_status")
    .eq("idempotency_key", idempotencyKey)
    .eq("sync_status", "sent")
    .maybeSingle();

  if (existingLog) {
    return jsonResponse({ success: true, status: "already_sent", idempotency_key: idempotencyKey });
  }

  // Build payload
  const webhookPayload: InboundWebhookPayload = {
    event: "inbound_acknowledged",
    tracking_no: shipment.tracking_no,
    status: "ACKNOWLEDGED",
    accepted_at: new Date().toISOString(),
    runner: runnerName,
    target_user: targetUserName,
    target_user_id: shipment.salesperson_id,
    shipment_id: shipment.id,
  };

  const payloadString = JSON.stringify(webhookPayload);

  // Sign payload with HMAC-SHA256
  const signature = await hmacSign(settings.shared_secret || "", payloadString);

  // Attempt send with retries
  const MAX_RETRIES = 3;
  let lastError: string | null = null;
  let responseStatus: number | null = null;
  let responseBody: string | null = null;
  let success = false;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const resp = await fetch(settings.webhook_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Event": "inbound_acknowledged",
          "X-Webhook-Signature": signature,
          "x-webhook-secret": settings.shared_secret || "",
          "Idempotency-Key": idempotencyKey,
          "X-Source-System": "TOMUPRO",
        },
        body: payloadString,
      });

      responseStatus = resp.status;
      responseBody = await resp.text();

      if (resp.ok) {
        success = true;
        break;
      } else {
        lastError = `HTTP ${resp.status}: ${responseBody?.substring(0, 500)}`;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      responseStatus = null;
      responseBody = null;
    }

    // Wait before retry (exponential backoff: 1s, 2s, 4s)
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }

  // Log the result
  await supabase.from("webhook_logs").upsert(
    {
      event_type: "inbound_acknowledged",
      order_ref: shipment.tracking_no,
      payload: webhookPayload,
      response_status: responseStatus,
      response_body: responseBody?.substring(0, 2000) || null,
      sync_status: success ? "sent" : "failed",
      retry_count: success ? 0 : MAX_RETRIES,
      error_message: success ? null : lastError,
      idempotency_key: idempotencyKey,
      sent_at: success ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "idempotency_key" }
  );

  if (success) {
    return jsonResponse({
      success: true,
      status: "sent",
      tracking_no: shipment.tracking_no,
      idempotency_key: idempotencyKey,
    });
  } else {
    return jsonResponse(
      {
        success: false,
        status: "failed",
        error: lastError,
        tracking_no: shipment.tracking_no,
        retry_count: MAX_RETRIES,
      },
      502
    );
  }
});
