import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, hasSnipersAdminTriggerSecret, jsonResponse } from "../_shared/snipers.ts";

interface DeliveredOrder {
  id: string;
  order_code: string;
  delivered_at: string | null;
  updated_at: string | null;
}

async function authenticate(req: Request, supabaseUrl: string, anonKey: string, serviceRoleKey: string) {
  if (hasSnipersAdminTriggerSecret(req)) {
    return { ok: true as const, userId: null, isServiceRole: true };
  }

  const authHeader = req.headers.get("Authorization") || "";
  if (authHeader === `Bearer ${serviceRoleKey}`) {
    return { ok: true as const, userId: null, isServiceRole: true };
  }

  if (!authHeader) return { ok: false as const, status: 401, error: "Unauthorized" };

  const authClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error } = await authClient.auth.getUser();
  if (error || !user) return { ok: false as const, status: 401, error: "Unauthorized" };

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: profile } = await serviceClient
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (String(profile?.role || "").toLowerCase() !== "admin") {
    return { ok: false as const, status: 403, error: "Admin access required" };
  }

  return { ok: true as const, userId: user.id, isServiceRole: false };
}

function toIsoOrNull(value: unknown) {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const auth = await authenticate(req, supabaseUrl, anonKey, serviceRoleKey);
  if (!auth.ok) return jsonResponse({ success: false, error: auth.error }, auth.status);

  let body: {
    deliveredFrom?: string;
    deliveredTo?: string;
    updatedSince?: string;
    orderCode?: string;
    eventCodePrefix?: string;
    limit?: number;
    sendLimit?: number;
    concurrency?: number;
    includeResults?: boolean;
    dryRun?: boolean;
    send?: boolean;
  } = {};

  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const limit = Math.min(Math.max(Number(body.limit || 100), 1), 500);
  const sendLimit = Math.min(Math.max(Number(body.sendLimit || limit), 1), 500);
  const concurrency = Math.min(Math.max(Number(body.concurrency || 4), 1), 5);
  const includeResults = body.includeResults === true;
  const dryRun = body.dryRun !== false;
  const shouldSend = body.send === true;

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const eventCodePrefix = String(body.eventCodePrefix || "").trim();
  if (eventCodePrefix) {
    const eventQuery = supabase
      .from("snipers_delivery_events")
      .select("event_id, tomupro_order_id, sales_entry_order_code, delivery_status, created_at")
      .eq("event_type", "tomupro.order.delivered")
      .ilike("sales_entry_order_code", `${eventCodePrefix}%`)
      .in("delivery_status", ["pending", "failed"])
      .order("created_at", { ascending: true })
      .limit(limit);

    const { data: events, error: eventError } = await eventQuery;
    if (eventError) return jsonResponse({ success: false, error: eventError.message }, 500);

    const pendingEvents = events || [];

    if (dryRun) {
      return jsonResponse({
        success: true,
        dry_run: true,
        source: "existing_events",
        event_code_prefix: eventCodePrefix,
        matched_delivered_events: pendingEvents.length,
        limit,
        sample: pendingEvents.slice(0, 10).map((event) => ({
          tomupro_order_id: event.tomupro_order_id,
          sales_entry_order_code: event.sales_entry_order_code,
          event_id: event.event_id,
          delivery_status: event.delivery_status,
        })),
        next_step: "Call again with { dryRun: false, send: true } to send these exact event IDs.",
      });
    }

    const sendResults = [];
    const sendErrors = [];

    if (shouldSend) {
      const eventsToSend = pendingEvents.slice(0, sendLimit);
      let nextIndex = 0;

      const workers = Array.from({ length: Math.min(concurrency, eventsToSend.length) }, async () => {
        while (nextIndex < eventsToSend.length) {
          const currentIndex = nextIndex;
          nextIndex += 1;
          const event = eventsToSend[currentIndex];
          if (!event) return;

          try {
            const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-snipers-delivered`, {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${serviceRoleKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                eventId: event.event_id,
                limit: 1,
              }),
            });

            const contentType = sendResponse.headers.get("content-type") || "";
            const responseBody = contentType.includes("application/json")
              ? await sendResponse.json()
              : { success: false, http_status: sendResponse.status, error: await sendResponse.text() };

            sendResults.push({
              tomupro_order_id: event.tomupro_order_id,
              sales_entry_order_code: event.sales_entry_order_code,
              event_id: event.event_id,
              http_status: sendResponse.status,
              response: responseBody,
            });

            if (!sendResponse.ok || responseBody?.success !== true) {
              sendErrors.push({
                tomupro_order_id: event.tomupro_order_id,
                sales_entry_order_code: event.sales_entry_order_code,
                event_id: event.event_id,
                http_status: sendResponse.status,
                response: responseBody,
              });
            }
          } catch (error) {
            sendErrors.push({
              tomupro_order_id: event.tomupro_order_id,
              sales_entry_order_code: event.sales_entry_order_code,
              event_id: event.event_id,
              http_status: null,
              response: {
                success: false,
                error: error instanceof Error ? error.message : String(error),
              },
            });
          }
        }
      });

      await Promise.all(workers);
    }

    return jsonResponse({
      success: sendErrors.length === 0,
      dry_run: false,
      source: "existing_events",
      event_code_prefix: eventCodePrefix,
      matched_delivered_events: pendingEvents.length,
      sent: shouldSend,
      send_mode: shouldSend ? "targeted_event_id_prefix" : "matched_only",
      concurrency: shouldSend ? Math.min(concurrency, pendingEvents.length, sendLimit) : 0,
      sent_count: sendResults.length,
      send_results: includeResults ? sendResults : sendResults.slice(0, 10),
      send_errors: sendErrors,
      result_count: sendResults.length,
      result_sample_count: includeResults ? sendResults.length : Math.min(sendResults.length, 10),
    }, sendErrors.length === 0 ? 200 : 207);
  }

  let query = supabase
    .from("orders")
    .select("id, order_code, delivered_at, updated_at")
    .eq("runner_status", "DELIVERED")
    .not("delivered_at", "is", null)
    .order("delivered_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(limit);

  const deliveredFrom = toIsoOrNull(body.deliveredFrom);
  const deliveredTo = toIsoOrNull(body.deliveredTo);
  const updatedSince = toIsoOrNull(body.updatedSince);

  if (deliveredFrom) query = query.gte("delivered_at", deliveredFrom);
  if (deliveredTo) query = query.lte("delivered_at", deliveredTo);
  if (updatedSince) query = query.gte("updated_at", updatedSince);
  if (body.orderCode) query = query.eq("order_code", body.orderCode);

  const { data: orders, error } = await query;
  if (error) return jsonResponse({ success: false, error: error.message }, 500);

  const rows = (orders || []) as DeliveredOrder[];

  if (dryRun) {
    return jsonResponse({
      success: true,
      dry_run: true,
      matched_delivered_orders: rows.length,
      limit,
      sample: rows.slice(0, 10).map((order) => ({
        tomupro_order_id: order.id,
        sales_entry_order_code: order.order_code,
        delivered_at: order.delivered_at,
      })),
      next_step: "Call again with { dryRun: false, send: true } after SNIPERS confirms its receiver endpoint is live.",
    });
  }

  const enqueued = [];
  const enqueueErrors = [];

  for (const order of rows) {
    const { data: eventId, error: enqueueError } = await supabase.rpc("enqueue_snipers_delivery_event", {
      p_order_id: order.id,
      p_event_type: "tomupro.order.delivered",
    });

    if (enqueueError) {
      enqueueErrors.push({
        tomupro_order_id: order.id,
        sales_entry_order_code: order.order_code,
        error: enqueueError.message,
      });
    } else {
      enqueued.push({
        tomupro_order_id: order.id,
        sales_entry_order_code: order.order_code,
        event_id: eventId,
      });
    }
  }

  const sendResults = [];
  const sendErrors = [];

  if (shouldSend && enqueued.length > 0) {
    for (const event of enqueued.slice(0, sendLimit)) {
      const sendResponse = await fetch(`${supabaseUrl}/functions/v1/send-snipers-delivered`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${serviceRoleKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId: event.event_id,
          limit: 1,
        }),
      });

      const contentType = sendResponse.headers.get("content-type") || "";
      const responseBody = contentType.includes("application/json")
        ? await sendResponse.json()
        : { success: false, http_status: sendResponse.status, error: await sendResponse.text() };

      sendResults.push({
        tomupro_order_id: event.tomupro_order_id,
        sales_entry_order_code: event.sales_entry_order_code,
        event_id: event.event_id,
        http_status: sendResponse.status,
        response: responseBody,
      });

      if (!sendResponse.ok || responseBody?.success !== true) {
        sendErrors.push({
          tomupro_order_id: event.tomupro_order_id,
          sales_entry_order_code: event.sales_entry_order_code,
          event_id: event.event_id,
          http_status: sendResponse.status,
          response: responseBody,
        });
      }
    }
  }

  return jsonResponse({
    success: enqueueErrors.length === 0 && sendErrors.length === 0,
    dry_run: false,
    matched_delivered_orders: rows.length,
    enqueued: enqueued.length,
    enqueue_errors: enqueueErrors,
    sent: shouldSend,
    send_mode: shouldSend ? "targeted_event_id" : "enqueue_only",
    sent_count: sendResults.length,
    send_results: sendResults,
    send_errors: sendErrors,
  }, enqueueErrors.length === 0 && sendErrors.length === 0 ? 200 : 207);
});
