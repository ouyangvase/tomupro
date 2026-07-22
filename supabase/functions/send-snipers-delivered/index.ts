import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  getSnipersConfig,
  hasSnipersAdminTriggerSecret,
  jsonResponse,
  postSignedJson,
} from "../_shared/snipers.ts";

type SnipersEventStatus =
  | "pending"
  | "sending"
  | "acknowledged"
  | "failed"
  | "unmatched"
  | "needs_review"
  | "authentication_failed";

interface SnipersDeliveryEvent {
  event_id: string;
  tomupro_order_id: string;
  sales_entry_order_code: string;
  event_type: string;
  payload: Record<string, unknown>;
  delivery_status: SnipersEventStatus;
  attempt_count: number;
  last_attempt_at: string | null;
  next_retry_at: string | null;
}

interface SendRequest {
  orderId?: string;
  eventId?: string;
  eventIds?: string[];
  eventType?: string;
  limit?: number;
  drain?: boolean;
  maxBatches?: number;
  maxEvents?: number;
  concurrency?: number;
  interEventDelayMs?: number;
}

function isTerminal(status: string) {
  return ["acknowledged", "unmatched", "needs_review", "authentication_failed"].includes(status);
}

function backoffTime(attemptCount: number) {
  const delaySeconds = Math.min(3600, 60 * Math.pow(2, Math.max(0, attemptCount - 1)));
  return new Date(Date.now() + delaySeconds * 1000).toISOString();
}

function safeText(value: string, limit = 1000) {
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function retryTimeFromError(message: string, fallbackAttemptCount: number) {
  const retryAfterMatch = message.match(/retry after\s+(\d+)ms/i);
  if (retryAfterMatch?.[1]) {
    const retryAfterMs = Math.min(Math.max(Number(retryAfterMatch[1]), 1000), 10 * 60 * 1000);
    return new Date(Date.now() + retryAfterMs).toISOString();
  }

  return backoffTime(fallbackAttemptCount);
}

function retryTimeFromResponse(response: Response, message: string | null, fallbackAttemptCount: number) {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return new Date(Date.now() + Math.min(seconds * 1000, 10 * 60 * 1000)).toISOString();
    }

    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt) && retryAt > Date.now()) {
      return new Date(Math.min(retryAt, Date.now() + 10 * 60 * 1000)).toISOString();
    }
  }

  return retryTimeFromError(message || "", fallbackAttemptCount);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMissingRpc(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const message = "message" in error ? String(error.message || "") : "";
  const code = "code" in error ? String(error.code || "") : "";
  return code === "PGRST202" || /function .*claim_snipers_delivery_events|schema cache/i.test(message);
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
  return { ok: true as const, userId: user.id, isServiceRole: false };
}

async function canTriggerOrderEvent(supabase: ReturnType<typeof createClient>, userId: string, orderId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  const role = String(profile?.role || "").toLowerCase();
  if (["admin", "manager"].includes(role)) return true;

  const { data: order } = await supabase
    .from("orders")
    .select("id, runner_id, salesperson_id")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return false;
  if (order.runner_id === userId || order.salesperson_id === userId) return true;

  if (role === "runner_assistant" && order.runner_id) {
    const { data: binding } = await supabase
      .from("runner_assistants")
      .select("id")
      .eq("assistant_id", userId)
      .eq("runner_id", order.runner_id)
      .eq("is_active", true)
      .eq("can_deliver", true)
      .maybeSingle();
    return !!binding;
  }

  return false;
}

async function canTriggerBatchSend(supabase: ReturnType<typeof createClient>, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", userId)
    .maybeSingle();

  const role = String(profile?.role || "").toLowerCase();
  return ["admin", "administrator"].includes(role);
}

async function parseSnipersResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (!contentType.toLowerCase().includes("application/json")) {
    return {
      json: null as Record<string, unknown> | null,
      error: `SNIPERS endpoint returned non-JSON response (${contentType || "no content-type"}). This usually means the configured URL is a frontend route, not the Confirm Profit API.`,
      preview: safeText(text, 500),
    };
  }

  try {
    return { json: JSON.parse(text) as Record<string, unknown>, error: null, preview: null };
  } catch {
    return { json: null, error: "SNIPERS endpoint returned invalid JSON", preview: safeText(text, 500) };
  }
}

function classifyResponse(response: Response, responseJson: Record<string, unknown> | null, parseError: string | null) {
  if (response.status === 401 || response.status === 403) {
    return { status: "authentication_failed" as SnipersEventStatus, error: parseError || "SNIPERS authentication failed" };
  }

  if (parseError) {
    return { status: "failed" as SnipersEventStatus, error: parseError };
  }

  const matched = responseJson?.matched;
  const confirmationStatus = String(
    responseJson?.profit_confirmation_status || responseJson?.confirmation_status || responseJson?.status || "",
  ).toLowerCase();
  const reason = String(responseJson?.reason || responseJson?.error || "");

  if (response.ok && ["needs_review", "ambiguous", "ambiguous_match"].includes(confirmationStatus)) {
    return { status: "needs_review" as SnipersEventStatus, error: reason || "SNIPERS reported an ambiguous match" };
  }

  if (response.ok && responseJson?.success === true && matched !== false) {
    return { status: "acknowledged" as SnipersEventStatus, error: null };
  }

  if (response.ok && (matched === false || confirmationStatus === "unmatched")) {
    return { status: "unmatched" as SnipersEventStatus, error: reason || "No matching SNIPERS Sales Entry order found" };
  }

  return {
    status: "failed" as SnipersEventStatus,
    error: reason || `SNIPERS returned HTTP ${response.status} without a successful acknowledgement`,
  };
}

async function sendOneEvent(supabase: ReturnType<typeof createClient>, event: SnipersDeliveryEvent) {
  if (isTerminal(event.delivery_status)) {
    return {
      event_id: event.event_id,
      status: event.delivery_status,
      skipped: true,
      reason: "terminal_event",
    };
  }

  const config = getSnipersConfig();
  if (!config.deliveredUrl || !config.apiKey || !config.webhookSecret) {
    const error = "SNIPERS_BASE_URL, SNIPERS_API_KEY, and SNIPERS_WEBHOOK_SECRET must be configured";
    await supabase
      .from("snipers_delivery_events")
      .update({
        delivery_status: "failed",
        last_error: error,
        updated_at: new Date().toISOString(),
        next_retry_at: backoffTime(event.attempt_count + 1),
      })
      .eq("event_id", event.event_id);
    return { event_id: event.event_id, status: "failed", error };
  }

  const attemptCount = event.attempt_count + 1;
  await supabase
    .from("snipers_delivery_events")
    .update({
      delivery_status: "sending",
      attempt_count: attemptCount,
      last_attempt_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("event_id", event.event_id);

  try {
    const response = await postSignedJson({
      url: config.deliveredUrl,
      apiKey: config.apiKey,
      webhookSecret: config.webhookSecret,
      eventId: event.event_id,
      idempotencyKey: event.event_id,
      body: event.payload,
    });

    const parsed = await parseSnipersResponse(response);
    const classified = classifyResponse(response, parsed.json, parsed.error);
    const terminal = ["acknowledged", "unmatched", "needs_review", "authentication_failed"].includes(classified.status);
    const nextRetryAt = terminal ? null : retryTimeFromResponse(response, classified.error, attemptCount);

    await supabase
      .from("snipers_delivery_events")
      .update({
        delivery_status: classified.status,
        last_http_status: response.status,
        last_error: classified.error,
        last_response: parsed.json || { preview: parsed.preview },
        acknowledged_at: classified.status === "acknowledged" ? new Date().toISOString() : null,
        next_retry_at: nextRetryAt,
        updated_at: new Date().toISOString(),
      })
      .eq("event_id", event.event_id);

    return {
      event_id: event.event_id,
      status: classified.status,
      http_status: response.status,
      sales_entry_order_code: event.sales_entry_order_code,
      error: classified.error,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from("snipers_delivery_events")
      .update({
        delivery_status: "failed",
        last_error: safeText(message),
        next_retry_at: retryTimeFromError(message, attemptCount),
        updated_at: new Date().toISOString(),
      })
      .eq("event_id", event.event_id);
    return { event_id: event.event_id, status: "failed", error: message };
  }
}

async function sendEventsWithConcurrency(
  supabase: ReturnType<typeof createClient>,
  events: SnipersDeliveryEvent[],
  concurrency: number,
  deadlineAt: number,
  interEventDelayMs: number,
) {
  const results: unknown[] = [];
  let nextIndex = 0;

  const workers = Array.from({ length: concurrency }, async () => {
    while (Date.now() < deadlineAt) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      const event = events[currentIndex];
      if (!event) return;
      results.push(await sendOneEvent(supabase, event));
      if (interEventDelayMs > 0 && Date.now() + interEventDelayMs < deadlineAt) {
        await sleep(interEventDelayMs);
      }
    }
  });

  await Promise.all(workers);
  return results;
}

function buildEventQuery(
  supabase: ReturnType<typeof createClient>,
  body: SendRequest,
  limit: number,
) {
  const query = supabase
    .from("snipers_delivery_events")
    .select("*")
    .order("created_at", { ascending: true });

  if (body.eventId) {
    return query.eq("event_id", body.eventId).limit(1);
  }

  if (body.eventIds?.length) {
    return query
      .in("event_id", body.eventIds.slice(0, limit))
      .limit(limit);
  }

  return query
    .in("delivery_status", ["pending", "failed"])
    .or(`next_retry_at.is.null,next_retry_at.lte.${new Date().toISOString()}`)
    .lt("attempt_count", 8)
    .limit(limit);
}

async function fetchQueueEvents(
  supabase: ReturnType<typeof createClient>,
  body: SendRequest,
  limit: number,
) {
  if (body.eventId || body.eventIds?.length) {
    return await buildEventQuery(supabase, body, limit);
  }

  const claimed = await supabase.rpc("claim_snipers_delivery_events", { p_limit: limit });
  if (!claimed.error || !isMissingRpc(claimed.error)) {
    return claimed;
  }

  // Backward compatible fallback while the safety migration is being applied.
  // The RPC path is the production path because it uses row locks.
  return await buildEventQuery(supabase, body, limit);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const auth = await authenticate(req, supabaseUrl, anonKey, serviceRoleKey);
  if (!auth.ok) return jsonResponse({ success: false, error: auth.error }, auth.status);

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  let body: SendRequest = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  if (body.orderId && !auth.isServiceRole && auth.userId) {
    const allowed = await canTriggerOrderEvent(supabase, auth.userId, body.orderId);
    if (!allowed) return jsonResponse({ success: false, error: "Not authorized to send this SNIPERS event" }, 403);
  }

  if (body.orderId) {
    const { data: eventId, error } = await supabase.rpc("enqueue_snipers_delivery_event", {
      p_order_id: body.orderId,
      p_event_type: body.eventType || "tomupro.order.delivered",
    });
    if (error) return jsonResponse({ success: false, error: error.message }, 400);
    body.eventId = eventId as string;
  }

  const eventIds = Array.isArray(body.eventIds)
    ? [...new Set(body.eventIds.map((eventId) => String(eventId).trim()).filter(Boolean))]
    : [];
  body.eventIds = eventIds;

  const isExplicitEventBatch = eventIds.length > 0;
  const isDrain = !body.eventId && !isExplicitEventBatch;
  if (isDrain && !auth.isServiceRole) {
    return jsonResponse({ success: false, error: "Only service credentials may drain SNIPERS delivery events" }, 403);
  }
  if (isExplicitEventBatch && !auth.isServiceRole) {
    if (!auth.userId || !(await canTriggerBatchSend(supabase, auth.userId))) {
      return jsonResponse({ success: false, error: "Admin access required to send SNIPERS event batches" }, 403);
    }
  }

  const batchLimit = isDrain
    ? Math.min(Math.max(Number(body.limit || 1), 1), 5)
    : isExplicitEventBatch
      ? Math.min(Math.max(Number(body.limit || eventIds.length), 1), 100)
      : Math.min(Math.max(Number(body.limit || 10), 1), 25);
  const maxBatches = isDrain
    ? Math.min(Math.max(Number(body.maxBatches || 1), 1), 5)
    : 1;
  const maxEvents = isDrain
    ? Math.min(Math.max(Number(body.maxEvents || batchLimit * maxBatches), 1), 25)
    : batchLimit;
  const concurrency = isExplicitEventBatch
    ? Math.min(Math.max(Number(body.concurrency || 2), 1), 5)
    : 1;
  const interEventDelayMs = isDrain
    ? Math.min(Math.max(Number(body.interEventDelayMs ?? 1500), 0), 60_000)
    : isExplicitEventBatch
      ? Math.min(Math.max(Number(body.interEventDelayMs ?? 250), 0), 60_000)
    : 0;
  const startedAt = Date.now();
  const maxRuntimeMs = isDrain ? 15_000 : isExplicitEventBatch ? 110_000 : 25_000;
  const deadlineAt = startedAt + maxRuntimeMs;
  const results = [];
  let batchCount = 0;
  let exhausted = false;

  while (batchCount < maxBatches && results.length < maxEvents && Date.now() < deadlineAt) {
    const remaining = Math.max(1, Math.min(batchLimit, maxEvents - results.length));
    const { data: events, error } = await fetchQueueEvents(supabase, body, remaining);

    if (error) return jsonResponse({ success: false, error: error.message }, 500);
    if (!events?.length) {
      exhausted = true;
      break;
    }

    batchCount += 1;
    const batchResults = await sendEventsWithConcurrency(
      supabase,
      events as SnipersDeliveryEvent[],
      concurrency,
      deadlineAt,
      interEventDelayMs,
    );
    results.push(...batchResults);

    if (body.eventId) break;
  }

  const timedOut = Date.now() >= deadlineAt;

  return jsonResponse({
    success: true,
    drain: isDrain,
    processed: results.length,
    batch_count: batchCount,
    timed_out: timedOut,
    has_more: !exhausted && !body.eventId && (timedOut || results.length >= maxEvents || batchCount >= maxBatches),
    results,
  });
});
