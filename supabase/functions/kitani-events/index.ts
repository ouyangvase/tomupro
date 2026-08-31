import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  validateKitaniOrderReadyEvent,
  type KitaniOrderReadyEvent,
} from "./validation.ts";

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

  let event: KitaniLocationConfirmedEvent | KitaniOrderReadyEvent;
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
      validateKitaniOrderReadyEvent(event);
    } catch (error) {
      return jsonResponse({ success: false, error: error instanceof Error ? error.message : "Invalid KITANI order" }, 400);
    }
    const systemProfileId = Deno.env.get("KITANI_SYSTEM_PROFILE_ID");
    if (!systemProfileId) {
      return jsonResponse({ success: false, error: "KITANI system profile is not configured" }, 500);
    }
    const { data: result, error } = await supabase.rpc("ingest_kitani_order", {
      p_event: event,
      p_system_profile_id: systemProfileId,
      p_idempotency_key: idempotencyKey,
    });
    if (error) return jsonResponse({ success: false, error: error.message }, 500);
    return jsonResponse({
      success: true,
      status: result?.status || "created",
      order_id: result?.order_id,
      order_code: result?.order_code,
      duplicate: result?.status === "duplicate",
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
