import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function postSignedJson(params: {
  url: string;
  clientId: string;
  secret: string;
  idempotencyKey: string;
  body: Record<string, unknown>;
}) {
  const bodyText = JSON.stringify(params.body);
  const timestamp = new Date().toISOString();
  const signature = await hmacSign(params.secret, `${timestamp}.${params.idempotencyKey}.${bodyText}`);
  return await fetch(params.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Id": params.clientId,
      "X-Request-Timestamp": timestamp,
      "X-Correlation-Id": crypto.randomUUID(),
      "X-Signature": signature,
      "Idempotency-Key": params.idempotencyKey,
    },
    body: bodyText,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${serviceRoleKey}`) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }

  const apiBase = Deno.env.get("KITANI_API_BASE_URL");
  const clientId = Deno.env.get("KITANI_CLIENT_ID");
  const apiSecret = Deno.env.get("KITANI_API_SECRET");
  if (!apiBase || !clientId || !apiSecret) {
    return jsonResponse({ success: false, error: "KITANI API credentials are not configured" }, 500);
  }

  let body: { orderId?: string; deliveredAt?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }
  if (!body.orderId) return jsonResponse({ success: false, error: "Missing orderId" }, 400);

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const { data: link, error: linkError } = await supabase
    .from("kitani_order_links")
    .select("id, order_id, kitani_delivery_intent_id, status, delivered_event_sent_at")
    .eq("order_id", body.orderId)
    .maybeSingle();
  if (linkError) return jsonResponse({ success: false, error: linkError.message }, 500);
  if (!link?.kitani_delivery_intent_id) {
    return jsonResponse({ success: true, status: "skipped_no_kitani_link" });
  }
  if (link.delivered_event_sent_at) {
    return jsonResponse({ success: true, status: "already_sent" });
  }
  if (link.status !== "LOCATION_CONFIRMED" && link.status !== "SUBMITTED_TO_TOMUPRO") {
    return jsonResponse({ success: true, status: "skipped_location_not_confirmed" });
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, order_code, delivered_at")
    .eq("id", body.orderId)
    .single();
  if (orderError || !order) return jsonResponse({ success: false, error: "Order not found" }, 404);

  const occurredAt = body.deliveredAt || order.delivered_at || new Date().toISOString();
  const eventPayload = {
    event_id: `tomupro.delivery.delivered.${order.id}.${new Date(occurredAt).getTime()}`,
    event_type: "tomupro.delivery.delivered",
    source_delivery_id: link.kitani_delivery_intent_id,
    source_order_id: order.id,
    source_order_no: order.order_code,
    status: "DELIVERED",
    occurred_at: occurredAt,
  };
  const idempotencyKey = `tomupro:${order.id}:delivered:v1`;
  const response = await postSignedJson({
    url: `${apiBase.replace(/\/+$/, "")}/integrations/tomupro/v1/events`,
    clientId,
    secret: apiSecret,
    idempotencyKey,
    body: eventPayload,
  });
  const responseText = await response.text();

  if (!response.ok) {
    await supabase.from("kitani_order_links").update({
      last_error: `KITANI delivered event failed HTTP ${response.status}: ${responseText.slice(0, 500)}`,
    }).eq("id", link.id);
    return jsonResponse({ success: false, error: "KITANI delivered event failed", detail: responseText }, 502);
  }

  await supabase.from("kitani_order_links").update({
    status: "DELIVERED",
    delivered_event_sent_at: new Date().toISOString(),
    last_error: null,
  }).eq("id", link.id);

  return jsonResponse({ success: true, status: "sent" });
});
