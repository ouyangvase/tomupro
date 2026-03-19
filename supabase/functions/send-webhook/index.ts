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

interface WebhookPayload {
  event_type: string;
  occurred_at: string;
  order_ref: string;
  order_id: string;
  customer_name: string;
  customer_phone: string;
  full_address: string;
  area: string | null;
  payment_type: string;
  order_total: number;
  items: Array<{
    sku: string | null;
    product_name: string;
    qty: number;
    unit_price: number;
    line_total: number;
  }>;
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

  let body: { orderId: string; eventType?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const { orderId, eventType = "order.delivered" } = body;

  if (!orderId) {
    return jsonResponse({ error: "Missing orderId" }, 400);
  }

  // Get integration settings
  const { data: settings } = await supabase
    .from("integration_settings")
    .select("*")
    .eq("integration_name", "pulseone")
    .single();

  if (!settings || !settings.webhook_enabled || !settings.webhook_url) {
    // Webhook not enabled, log and skip
    const idempKey = `${eventType}:${orderId}:${Date.now()}`;
    await supabase.from("webhook_logs").insert({
      event_type: eventType,
      order_id: orderId,
      idempotency_key: idempKey,
      sync_status: "skipped",
      payload: { reason: "Webhook not enabled or URL not configured" },
    });
    return jsonResponse({ success: true, status: "skipped", reason: "Webhook not enabled" });
  }

  // Fetch order with items
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select(`
      id, order_code, customer_name, phone, address, area,
      payment_method, total_amount, delivered_at,
      order_items(id, product_id, sku_label, qty, price, line_total,
        product:products(sku_code, sku_name)
      )
    `)
    .eq("id", orderId)
    .single();

  if (orderError || !order) {
    return jsonResponse({ error: "Order not found" }, 404);
  }

  // Build payload
  const idempotencyKey = `order.delivered:${order.order_code}:${order.delivered_at || new Date().toISOString()}`;

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

  const items = ((order as any).order_items || []).map((item: any) => ({
    sku: item.product?.sku_code || item.sku_label || null,
    product_name: item.product?.sku_name || item.sku_label || "Unknown",
    qty: item.qty,
    unit_price: item.price,
    line_total: item.line_total,
  }));

  const webhookPayload: WebhookPayload = {
    event_type: eventType,
    occurred_at: order.delivered_at || new Date().toISOString(),
    order_ref: order.order_code,
    order_id: order.id,
    customer_name: order.customer_name,
    customer_phone: order.phone,
    full_address: order.address,
    area: order.area,
    payment_type: order.payment_method,
    order_total: order.total_amount,
    items,
  };

  const payloadString = JSON.stringify(webhookPayload);

  // Sign payload
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
          "X-Webhook-Event": eventType,
          "X-Webhook-Signature": signature,
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

    // Wait before retry (exponential backoff)
    if (attempt < MAX_RETRIES) {
      await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }

  // Log the result
  await supabase.from("webhook_logs").upsert(
    {
      event_type: eventType,
      order_ref: order.order_code,
      order_id: orderId,
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
      order_ref: order.order_code,
      idempotency_key: idempotencyKey,
    });
  } else {
    return jsonResponse(
      {
        success: false,
        status: "failed",
        error: lastError,
        order_ref: order.order_code,
        retry_count: MAX_RETRIES,
      },
      502
    );
  }
});
