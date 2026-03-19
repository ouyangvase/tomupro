import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-event, x-webhook-signature, idempotency-key, x-source-system",
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function hmacVerify(secret: string, body: string, signature: string): Promise<boolean> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computed === signature;
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

  let rawBody: string;
  let payload: Record<string, unknown>;

  try {
    rawBody = await req.text();
    payload = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  // --- Read headers ---
  const eventType = req.headers.get("x-webhook-event");
  const signature = req.headers.get("x-webhook-signature");
  const idempotencyKey = req.headers.get("idempotency-key");
  const sourceSystem = req.headers.get("x-source-system") || "TOMUPRO";

  if (!eventType) {
    return jsonResponse({ error: "Missing X-Webhook-Event header" }, 400);
  }
  if (!signature) {
    return jsonResponse({ error: "Missing X-Webhook-Signature header" }, 401);
  }

  // --- Signature validation ---
  const secret = Deno.env.get("TOMUPRO_PULSEONE_SECRET");
  if (!secret) {
    console.error("TOMUPRO_PULSEONE_SECRET not configured");
    return jsonResponse({ error: "Server misconfiguration" }, 500);
  }

  const valid = await hmacVerify(secret, rawBody, signature);
  if (!valid) {
    return jsonResponse({ error: "Invalid signature" }, 401);
  }

  // --- Idempotency check ---
  const effectiveKey = idempotencyKey || crypto.randomUUID();

  const { data: existingLog } = await supabase
    .from("integration_webhook_logs")
    .select("id, status")
    .eq("idempotency_key", effectiveKey)
    .maybeSingle();

  if (existingLog) {
    return jsonResponse({
      success: true,
      message: "Already processed",
      idempotency_key: effectiveKey,
    });
  }

  // --- Log the webhook ---
  const orderRef = (payload.order_ref as string) || null;

  const { data: logRow, error: logError } = await supabase
    .from("integration_webhook_logs")
    .insert({
      idempotency_key: effectiveKey,
      event_type: eventType,
      order_ref: orderRef,
      source_system: sourceSystem,
      payload,
      status: "received",
    })
    .select("id")
    .single();

  if (logError) {
    console.error("Failed to insert webhook log:", logError);
    return jsonResponse({ error: "Failed to log webhook" }, 500);
  }

  // --- Event routing ---
  try {
    if (eventType === "order.delivered") {
      const result = await handleOrderDelivered(supabase, payload, logRow.id);
      // Mark log as processed
      await supabase
        .from("integration_webhook_logs")
        .update({ status: "processed", processed_at: new Date().toISOString() })
        .eq("id", logRow.id);

      return jsonResponse({
        success: true,
        order_ref: orderRef,
        profit_status: result.profit_status,
      });
    }

    if (eventType === "order.updated") {
      // Future: handle order updates
      await supabase
        .from("integration_webhook_logs")
        .update({ status: "processed", processed_at: new Date().toISOString() })
        .eq("id", logRow.id);
      return jsonResponse({ success: true, message: "order.updated acknowledged" });
    }

    if (eventType === "order.cancelled") {
      // Future: handle cancellations
      await supabase
        .from("integration_webhook_logs")
        .update({ status: "processed", processed_at: new Date().toISOString() })
        .eq("id", logRow.id);
      return jsonResponse({ success: true, message: "order.cancelled acknowledged" });
    }

    // Unknown event type — log and accept
    await supabase
      .from("integration_webhook_logs")
      .update({ status: "processed", processed_at: new Date().toISOString() })
      .eq("id", logRow.id);

    return jsonResponse({ success: true, message: `Event '${eventType}' acknowledged` });
  } catch (err) {
    console.error("Processing error:", err);
    await supabase
      .from("integration_webhook_logs")
      .update({
        status: "failed",
        error_message: err instanceof Error ? err.message : String(err),
      })
      .eq("id", logRow.id);

    return jsonResponse(
      { error: "Processing failed", detail: err instanceof Error ? err.message : String(err) },
      500
    );
  }
});

// ─── order.delivered handler ───────────────────────────────────
interface DeliveredPayload {
  order_ref: string;
  order_total: number;
  payment_type?: string;
  items?: Array<{ sku_code: string; qty: number; price: number; line_total: number }>;
}

async function handleOrderDelivered(
  supabase: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  webhookLogId: string
) {
  const data = payload as unknown as DeliveredPayload;
  const { order_ref, order_total, payment_type, items = [] } = data;

  if (!order_ref) throw new Error("Missing order_ref in payload");

  // Check if profit record already exists
  const { data: existing } = await supabase
    .from("profit_orders")
    .select("id")
    .eq("order_ref", order_ref)
    .maybeSingle();

  if (existing) {
    return { profit_status: "confirmed" };
  }

  // --- SKU cost lookup ---
  const skuCodes = items.map((i) => i.sku_code).filter(Boolean);
  let costMap: Record<string, number> = {};
  const missingSkus: string[] = [];

  if (skuCodes.length > 0) {
    const { data: costs } = await supabase
      .from("sku_cost")
      .select("sku_code, unit_cost")
      .in("sku_code", skuCodes);

    if (costs) {
      costMap = Object.fromEntries(costs.map((c: { sku_code: string; unit_cost: number }) => [c.sku_code, c.unit_cost]));
    }

    for (const item of items) {
      if (item.sku_code && !(item.sku_code in costMap)) {
        missingSkus.push(item.sku_code);
      }
    }
  }

  // --- Calculate COGS ---
  let cogs = 0;
  for (const item of items) {
    const unitCost = costMap[item.sku_code] || 0;
    cogs += unitCost * (item.qty || 1);
  }

  const revenue = order_total || 0;
  const netProfit = revenue - cogs;
  const profitStatus = missingSkus.length > 0 ? "at_risk" : "confirmed";

  // --- Insert profit record ---
  const { error: insertError } = await supabase.from("profit_orders").insert({
    order_ref,
    revenue,
    cogs,
    net_profit: netProfit,
    profit_status: profitStatus,
    source: "TOMUPRO",
    items: JSON.stringify(items),
    missing_skus: JSON.stringify(missingSkus),
    payment_type: payment_type || null,
    webhook_log_id: webhookLogId,
  });

  if (insertError) throw new Error(`Failed to insert profit order: ${insertError.message}`);

  // --- Create notification if SKUs missing ---
  if (missingSkus.length > 0) {
    await supabase.from("app_notifications").insert({
      title: `Missing SKU costs for ${order_ref}`,
      body: `SKUs without cost data: ${missingSkus.join(", ")}. Profit marked as at_risk.`,
      user_email: "admin@pulseone.app",
      entity_type: "profit_order",
      entity_id: order_ref,
    });
  }

  return { profit_status: profitStatus };
}
