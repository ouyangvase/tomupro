import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-client-id, x-request-timestamp, x-correlation-id, x-signature, idempotency-key",
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

function safeEqual(a: string, b: string) {
  return a.length === b.length && a === b;
}

function normalizePhone(phone: string | null | undefined) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.startsWith("673")) return `+${digits}`;
  if (digits.startsWith("60")) return `+${digits}`;
  if (/^01\d{8,9}$/.test(digits)) return `+60${digits.slice(1)}`;
  return `+673${digits.replace(/^0/, "")}`;
}

interface KitaniLocationConfirmedEvent {
  event_id?: string;
  event_type: "delivery.location_confirmed";
  occurred_at?: string;
  delivery_intent_id: string;
  source_order_id: string;
  customer: {
    phone: string;
  };
  dropoff: {
    formatted_address: string;
    latitude: number;
    longitude: number;
    unit?: string | null;
    landmark?: string | null;
    instructions?: string | null;
    gps_accuracy?: number | null;
  };
}

interface KitaniOrderReadyEvent {
  event_id: string;
  event_type: "delivery.order_ready";
  occurred_at: string;
  delivery_intent_id: string;
  source_order_id: string;
  source_order_no: string;
  customer: { name: string; phone: string };
  pickup: {
    name: string;
    address: string;
    latitude: number | null;
    longitude: number | null;
  };
  dropoff: {
    formatted_address: string;
    latitude: number;
    longitude: number;
    unit?: string | null;
    landmark?: string | null;
    instructions?: string | null;
    gps_accuracy?: number | null;
  };
  package: { type: string; description: string };
  financials: {
    merchandise_subtotal_minor: number;
    delivery_fee_minor: number;
    discount_total_minor: number;
    total_amount_minor: number;
    cod_amount_minor: number;
    payment_method: "COD" | "TRANSFER";
    currency_code: "BND";
  };
  items: Array<{
    sku_label: string;
    quantity: number;
    price_minor: number;
    line_total_minor: number;
  }>;
}

type KitaniEvent = KitaniLocationConfirmedEvent | KitaniOrderReadyEvent;

function isSafeMinor(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function validateOrderReadyEvent(event: KitaniOrderReadyEvent) {
  if (
    !event.delivery_intent_id ||
    !event.source_order_id ||
    !event.source_order_no ||
    !event.customer?.phone ||
    !event.dropoff?.formatted_address ||
    !Number.isFinite(event.dropoff.latitude) ||
    !Number.isFinite(event.dropoff.longitude) ||
    event.financials?.currency_code !== "BND" ||
    !["COD", "TRANSFER"].includes(event.financials.payment_method) ||
    !Array.isArray(event.items) ||
    event.items.length === 0
  ) {
    throw new Error("KITANI order-ready payload is incomplete");
  }

  const financialFields = [
    "merchandise_subtotal_minor",
    "delivery_fee_minor",
    "discount_total_minor",
    "total_amount_minor",
    "cod_amount_minor",
  ] as const;
  for (const field of financialFields) {
    if (!isSafeMinor(event.financials[field])) {
      throw new Error(`KITANI ${field} must be a non-negative integer minor-unit amount`);
    }
  }
  if (
    event.financials.total_amount_minor !==
    event.financials.merchandise_subtotal_minor +
      event.financials.delivery_fee_minor -
      event.financials.discount_total_minor
  ) {
    throw new Error("KITANI order financials do not balance");
  }
  if (
    event.financials.payment_method === "COD" &&
    event.financials.cod_amount_minor !== event.financials.total_amount_minor
  ) {
    throw new Error("COD amount must equal the final KITANI total");
  }
  if (
    event.financials.payment_method === "TRANSFER" &&
    event.financials.cod_amount_minor !== 0
  ) {
    throw new Error("Transfer orders must have zero COD amount");
  }
  for (const item of event.items) {
    if (
      !item.sku_label?.trim() ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity <= 0 ||
      !isSafeMinor(item.price_minor) ||
      !isSafeMinor(item.line_total_minor) ||
      item.line_total_minor !== item.price_minor * item.quantity
    ) {
      throw new Error("KITANI order item is invalid");
    }
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  const expectedClientId = Deno.env.get("KITANI_CLIENT_ID");
  const secret = Deno.env.get("KITANI_API_SECRET") || Deno.env.get("KITANI_WEBHOOK_SECRET");
  const clientId = req.headers.get("X-Client-Id");
  const timestamp = req.headers.get("X-Request-Timestamp");
  const signature = req.headers.get("X-Signature");
  const idempotencyKey = req.headers.get("Idempotency-Key");

  if (!expectedClientId || !secret) {
    return jsonResponse({ success: false, error: "KITANI receiver credentials are not configured" }, 500);
  }
  if (!clientId || clientId !== expectedClientId || !timestamp || !signature || !idempotencyKey) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }
  const requestTime = new Date(timestamp).getTime();
  if (!Number.isFinite(requestTime) || Math.abs(Date.now() - requestTime) > 5 * 60 * 1000) {
    return jsonResponse({ success: false, error: "Stale request" }, 401);
  }

  const bodyText = await req.text();
  const expected = await hmacSign(secret, `${timestamp}.${idempotencyKey}.${bodyText}`);
  if (!safeEqual(signature, expected)) {
    return jsonResponse({ success: false, error: "Invalid signature" }, 401);
  }

  let event: KitaniEvent;
  try {
    event = JSON.parse(bodyText);
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
  }
  if (event.event_type !== "delivery.location_confirmed" && event.event_type !== "delivery.order_ready") {
    return jsonResponse({ success: true, status: "ignored" });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (event.event_type === "delivery.order_ready") {
    try {
      validateOrderReadyEvent(event);
    } catch (error) {
      return jsonResponse({ success: false, error: (error as Error).message }, 422);
    }

    const salespersonId = Deno.env.get("TOMUPRO_KITANI_SALESPERSON_ID");
    if (!salespersonId) {
      return jsonResponse({ success: false, error: "KITANI TOMUPRO owner profile is not configured" }, 500);
    }

    const { data, error } = await supabase.rpc("create_kitani_order_ready", {
      p_delivery_intent_id: event.delivery_intent_id,
      p_source_order_id: event.source_order_id,
      p_source_order_no: event.source_order_no,
      p_customer_name: event.customer.name,
      p_phone: event.customer.phone,
      p_address: [
        event.dropoff.formatted_address,
        event.dropoff.unit ? `Unit/House: ${event.dropoff.unit}` : null,
        event.dropoff.landmark ? `Landmark: ${event.dropoff.landmark}` : null,
        event.dropoff.instructions ? `Notes: ${event.dropoff.instructions}` : null,
        `GPS: ${event.dropoff.latitude}, ${event.dropoff.longitude}`,
      ].filter(Boolean).join("\n"),
      p_payment_method: event.financials.payment_method,
      p_currency_code: event.financials.currency_code,
      p_financials: event.financials,
      p_items: event.items,
      p_salesperson_id: salespersonId,
      p_request_payload: event,
    });
    if (error) {
      console.error("KITANI order-ready RPC failed", error);
      return jsonResponse({ success: false, error: "Unable to create the TOMUPRO delivery order" }, 500);
    }
    const result = Array.isArray(data) ? data[0] : data;
    if (!result?.order_id || !result?.order_code) {
      return jsonResponse({ success: false, error: "TOMUPRO did not return an order reference" }, 500);
    }
    return jsonResponse({
      success: true,
      status: result.created ? "order_created" : "already_exists",
      tomupro_order_id: result.order_id,
      tomupro_order_code: result.order_code,
    });
  }

  const { data: link, error: linkError } = await supabase
    .from("kitani_order_links")
    .select("id, order_id, status")
    .eq("kitani_delivery_intent_id", event.delivery_intent_id)
    .maybeSingle();
  if (linkError) return jsonResponse({ success: false, error: linkError.message }, 500);
  if (!link) return jsonResponse({ success: false, error: "KITANI link not found" }, 404);

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, phone, address, runner_status")
    .eq("id", link.order_id)
    .single();
  if (orderError || !order) return jsonResponse({ success: false, error: "Order not found" }, 404);

  if (normalizePhone(order.phone) !== normalizePhone(event.customer.phone)) {
    await supabase.from("kitani_order_links").update({
      status: "FAILED",
      last_error: "KITANI verified phone does not match TOMUPRO order phone",
      response_payload: event,
    }).eq("id", link.id);
    return jsonResponse({ success: false, error: "Phone mismatch" }, 409);
  }

  if (["DELIVERED", "FAILED_DELIVERY", "CANCELLED"].includes(order.runner_status)) {
    await supabase.from("kitani_order_links").update({
      status: "FAILED",
      last_error: `Cannot update address after runner status ${order.runner_status}`,
      response_payload: event,
    }).eq("id", link.id);
    return jsonResponse({ success: false, error: "Order status cannot accept address update" }, 409);
  }

  const addressParts = [
    event.dropoff.formatted_address,
    event.dropoff.unit ? `Unit/House: ${event.dropoff.unit}` : null,
    event.dropoff.landmark ? `Landmark: ${event.dropoff.landmark}` : null,
    event.dropoff.instructions ? `Notes: ${event.dropoff.instructions}` : null,
    `GPS: ${event.dropoff.latitude}, ${event.dropoff.longitude}`,
  ].filter(Boolean);
  const newAddress = addressParts.join("\n");

  const { error: updateError } = await supabase
    .from("orders")
    .update({ address: newAddress })
    .eq("id", order.id);
  if (updateError) return jsonResponse({ success: false, error: updateError.message }, 500);

  await supabase.from("kitani_order_links").update({
    status: "LOCATION_CONFIRMED",
    confirmed_at: event.occurred_at || new Date().toISOString(),
    response_payload: event,
    last_error: null,
  }).eq("id", link.id);

  await supabase.from("audit_logs").insert({
    entity_type: "order",
    entity_id: order.id,
    action: "KITANI_LOCATION_CONFIRMED",
    before_json: { address: order.address },
    after_json: {
      address: newAddress,
      kitani_delivery_intent_id: event.delivery_intent_id,
      latitude: event.dropoff.latitude,
      longitude: event.dropoff.longitude,
    },
  });

  return jsonResponse({ success: true, status: "address_updated", order_id: order.id });
});
