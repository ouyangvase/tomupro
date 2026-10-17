import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface KitaniPointEvent {
  tomupro_order_id: string;
  order_code: string;
  phone: string;
  total_amount_minor: number;
  attempt_count: number;
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
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

async function postEvent(url: string, secret: string, event: KitaniPointEvent) {
  const body = JSON.stringify({
    order_id: event.tomupro_order_id,
    order_code: event.order_code,
    phone: event.phone,
    total_amount_minor: event.total_amount_minor,
  });
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Signature": await hmacSign(secret, body),
      },
      body,
    });
    const responseText = await response.text();
    if (response.ok) return { ok: true as const };
    return { ok: false as const, status: response.status, error: responseText };
  } catch (error) {
    return { ok: false as const, status: null, error: String(error) };
  }
}

Deno.serve(async (req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (req.headers.get("Authorization") !== `Bearer ${serviceRoleKey}`) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }

  const eventsUrl = `${Deno.env.get("KITANI_API_BASE_URL")}/api/v1/integrations/tomupro/events`;
  const apiSecret = Deno.env.get("KITANI_API_SECRET")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data, error } = await supabase.rpc("claim_kitani_point_events");
  if (error) return jsonResponse({ success: false, error: error.message }, 500);

  for (const event of data as KitaniPointEvent[]) {
    const result = await postEvent(eventsUrl, apiSecret, event);
    if (result.ok) {
      await supabase.from("kitani_point_events").update({
        delivery_status: "sent",
        sent_at: new Date().toISOString(),
      }).eq("tomupro_order_id", event.tomupro_order_id);
    } else {
      const retryDelaySeconds = Math.min(3600, 60 * 2 ** event.attempt_count);
      await supabase.from("kitani_point_events").update({
        attempt_count: event.attempt_count + 1,
        last_http_status: result.status,
        last_error: result.error.slice(0, 500),
        next_retry_at: new Date(Date.now() + retryDelaySeconds * 1000).toISOString(),
      }).eq("tomupro_order_id", event.tomupro_order_id);
    }
  }

  return jsonResponse({ success: true });
});
