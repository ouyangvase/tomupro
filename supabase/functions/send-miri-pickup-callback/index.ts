import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  hasSnipersAdminTriggerSecret,
  jsonResponse,
  postSignedJson,
} from "../_shared/snipers.ts";

function retryAt(attempt: number) {
  return new Date(Date.now() + Math.min(3600, 60 * 2 ** Math.max(0, attempt - 1)) * 1000).toISOString();
}

function safeText(value: string, limit = 1000) {
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

async function authorized(req: Request, serviceRoleKey: string) {
  if (hasSnipersAdminTriggerSecret(req)) return true;
  return req.headers.get("Authorization") === `Bearer ${serviceRoleKey}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (!(await authorized(req, serviceRoleKey))) {
    return jsonResponse({ success: false, error: "Unauthorized" }, 401);
  }

  const body = await req.json().catch(() => ({})) as { orderId?: string; eventId?: string; drain?: boolean; limit?: number };
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, serviceRoleKey);
  const limit = Math.min(Math.max(Number(body.limit || (body.drain ? 50 : 1)), 1), 100);
  let query = supabase
    .from("miri_pickup_callback_events")
    .select("*")
    .in("status", ["PENDING", "FAILED"])
    .lte("next_retry_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(limit);
  if (body.orderId) query = query.eq("order_id", body.orderId);
  if (body.eventId) query = query.eq("event_id", body.eventId);

  const { data: events, error } = await query;
  if (error) return jsonResponse({ success: false, error: error.message }, 500);

  const baseUrl = Deno.env.get("SNIPERS_BASE_URL")?.replace(/\/+$/, "");
  const callbackPath = Deno.env.get("SNIPERS_MIRI_CALLBACK_PATH") || "/api/integrations/sniper/miri-pickup-events";
  const callbackUrl = Deno.env.get("SNIPERS_MIRI_CALLBACK_URL") || (baseUrl ? `${baseUrl}${callbackPath.startsWith("/") ? callbackPath : `/${callbackPath}`}` : null);
  const apiKey = Deno.env.get("SNIPERS_API_KEY");
  const webhookSecret = Deno.env.get("SNIPERS_WEBHOOK_SECRET");
  if (!callbackUrl || !apiKey || !webhookSecret) {
    return jsonResponse({ success: false, error: "Miri callback credentials are not configured", count: 0 }, 500);
  }

  const results: Record<string, unknown>[] = [];
  for (const event of events || []) {
    const attempt = Number(event.attempt_count || 0) + 1;
    await supabase.from("miri_pickup_callback_events").update({
      status: "SENDING",
      attempt_count: attempt,
      updated_at: new Date().toISOString(),
    }).eq("id", event.id);

    try {
      const response = await postSignedJson({
        url: callbackUrl,
        apiKey,
        webhookSecret,
        eventId: event.event_id,
        idempotencyKey: event.event_id,
        body: event.payload,
      });
      const responseText = await response.text();
      const responseJson = (() => {
        try { return JSON.parse(responseText); } catch { return { preview: safeText(responseText, 500) }; }
      })();
      const acknowledged = response.ok;
      await supabase.from("miri_pickup_callback_events").update({
        status: acknowledged ? "ACKNOWLEDGED" : "FAILED",
        last_http_status: response.status,
        last_response: responseJson,
        last_error: acknowledged ? null : `HTTP ${response.status}`,
        next_retry_at: acknowledged ? null : retryAt(attempt),
        sent_at: acknowledged ? new Date().toISOString() : null,
        acknowledged_at: acknowledged ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      }).eq("id", event.id);
      results.push({ event_id: event.event_id, status: acknowledged ? "ACKNOWLEDGED" : "FAILED", http_status: response.status });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await supabase.from("miri_pickup_callback_events").update({
        status: "FAILED",
        last_error: safeText(message),
        next_retry_at: retryAt(attempt),
        updated_at: new Date().toISOString(),
      }).eq("id", event.id);
      results.push({ event_id: event.event_id, status: "FAILED", error: message });
    }
  }

  return jsonResponse({ success: true, count: results.length, results });
});
