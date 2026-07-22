import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  getSnipersConfig,
  hasSnipersAdminTriggerSecret,
  jsonResponse,
  postSignedJson,
} from "../_shared/snipers.ts";

async function requireAdmin(req: Request, supabaseUrl: string, anonKey: string, serviceRoleKey: string) {
  if (hasSnipersAdminTriggerSecret(req)) return { ok: true as const, userId: null };

  const authHeader = req.headers.get("Authorization") || "";
  if (authHeader === `Bearer ${serviceRoleKey}`) return { ok: true as const, userId: null };
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

  return { ok: true as const, userId: user.id };
}

async function parseResponse(response: Response) {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!contentType.toLowerCase().includes("application/json")) {
    return {
      json: null as Record<string, unknown> | null,
      error: `Expected JSON API response, received ${contentType || "no content-type"}`,
      preview: text.slice(0, 400),
      contentType,
    };
  }

  try {
    return { json: JSON.parse(text) as Record<string, unknown>, error: null, preview: null, contentType };
  } catch {
    return { json: null, error: "Invalid JSON response", preview: text.slice(0, 400), contentType };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = await requireAdmin(req, supabaseUrl, anonKey, serviceRoleKey);
  if (!admin.ok) return jsonResponse({ success: false, error: admin.error }, admin.status);

  const config = getSnipersConfig();
  const testedAt = new Date().toISOString();
  if (!config.deliveredUrl || !config.apiKey || !config.webhookSecret) {
    return jsonResponse({
      success: false,
      connected: false,
      tested_at: testedAt,
      safe_error: "SNIPERS_BASE_URL, SNIPERS_API_KEY, and SNIPERS_WEBHOOK_SECRET must be configured",
    }, 500);
  }

  const eventId = `tomupro.connection.test:${crypto.randomUUID()}`;
  const body = {
    event_id: eventId,
    event_type: "tomupro.connection.test",
    occurred_at: testedAt,
    order: {
      tomupro_order_id: "connection-test",
      sales_entry_order_code: "CONNECTION_TEST",
      customer_name: "Connection Test",
      customer_phone: null,
      sku: null,
      quantity: 0,
      amount: 0,
      profit_owner: null,
      tracking_number: null,
      delivery_status: "test",
      delivered_at: testedAt,
      updated_at: testedAt,
    },
  };

  const started = performance.now();
  try {
    const response = await postSignedJson({
      url: config.deliveredUrl,
      apiKey: config.apiKey,
      webhookSecret: config.webhookSecret,
      eventId,
      idempotencyKey: eventId,
      body,
    });
    const responseTimeMs = Math.round(performance.now() - started);
    const parsed = await parseResponse(response);
    const connected = response.ok && parsed.json?.success === true;

    return jsonResponse({
      success: connected,
      connected,
      endpoint: config.deliveredUrl,
      http_status: response.status,
      response_time_ms: responseTimeMs,
      tested_at: testedAt,
      content_type: parsed.contentType,
      safe_error: connected ? null : parsed.error || parsed.json?.error || `SNIPERS returned HTTP ${response.status}`,
      response: parsed.json || { preview: parsed.preview },
    }, connected ? 200 : 502);
  } catch (error) {
    return jsonResponse({
      success: false,
      connected: false,
      endpoint: config.deliveredUrl,
      tested_at: testedAt,
      response_time_ms: Math.round(performance.now() - started),
      safe_error: error instanceof Error ? error.message : String(error),
    }, 502);
  }
});
