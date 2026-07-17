import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ActorProfile {
  id: string;
  display_name?: string | null;
  email?: string | null;
  role?: string | null;
}

interface KitaniPayloadOrderItem {
  sku_label?: string | null;
  qty?: number | null;
  product?: {
    sku_name?: string | null;
    sku_code?: string | null;
  } | null;
}

interface KitaniPayloadOrder {
  id: string;
  order_code?: string | null;
  customer_name?: string | null;
  phone?: string | null;
  address?: string | null;
  status?: string | null;
  payment_method?: string | null;
  total_amount?: number | string | null;
  salesperson_id?: string | null;
  salesperson?: {
    display_name?: string | null;
    email?: string | null;
  } | null;
  order_items?: KitaniPayloadOrderItem[] | null;
}

interface KitaniApiResponse extends Record<string, unknown> {
  delivery_intent_id?: string | null;
  status?: string;
  invitation?: {
    url?: string;
    expires_at?: string;
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeBaseUrl(value: string | undefined, fallback: string) {
  return (value || fallback).replace(/\/+$/, "");
}

function renderTemplate(template: string, variables: Record<string, string>) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => variables[key] ?? "");
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

function buildKitaniPayload(order: KitaniPayloadOrder, actor: ActorProfile) {
  return {
    source: "TOMUPRO",
    source_order_id: order.id,
    source_order_no: order.order_code,
    source_tab: order.status,
    store: {
      external_tenant_id: Deno.env.get("TOMUPRO_TENANT_ID") || "tomupro",
      external_store_id: order.salesperson_id,
    },
    actor: {
      external_user_id: actor.id,
      login_id: actor.email || actor.display_name || actor.id,
      role: String(actor.role || "").toUpperCase(),
    },
    customer: {
      name: order.customer_name,
      phone: order.phone,
      current_delivery_address: order.address,
    },
    pickup: {
      name: order.salesperson?.display_name || "TOMUPRO",
      address: Deno.env.get("TOMUPRO_DEFAULT_PICKUP_ADDRESS") || null,
      latitude: Deno.env.get("TOMUPRO_DEFAULT_PICKUP_LATITUDE") || null,
      longitude: Deno.env.get("TOMUPRO_DEFAULT_PICKUP_LONGITUDE") || null,
    },
    parcel: {
      package_type: "NORMAL",
      description: (order.order_items || [])
        .map((item) => `${item.sku_label || item.product?.sku_name || "Item"} x ${item.qty || 0}`)
        .join(", "),
    },
    payment: {
      method: order.payment_method,
      cod_amount_minor: Math.round(Number(order.total_amount || 0) * 100),
      currency_code: "BND",
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ success: false, error: "Method not allowed" }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ success: false, error: "Unauthorized" }, 401);
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { orderId } = await req.json();
    if (!orderId) {
      return jsonResponse({ success: false, error: "Missing orderId" }, 400);
    }

    const { data: actor, error: actorError } = await supabase
      .from("user_directory")
      .select("id, display_name, email, role")
      .eq("id", user.id)
      .single();

    if (actorError || !actor) {
      return jsonResponse({ success: false, error: "Actor profile not found" }, 403);
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select(`
        id, order_code, customer_name, phone, address, area,
        payment_method, total_amount, status, runner_status, salesperson_id,
        salesperson:profiles!orders_salesperson_id_fkey(id, display_name, email),
        order_items(id, sku_label, qty, product:products(sku_name, sku_code))
      `)
      .eq("id", orderId)
      .single();

    if (orderError || !order) {
      return jsonResponse({ success: false, error: "Order not found" }, 404);
    }

    const role = String(actor.role || "").toLowerCase();
    const canCreate =
      ["admin", "manager"].includes(role) ||
      (role === "salesperson" && order.salesperson_id === user.id);

    if (!canCreate) {
      return jsonResponse({ success: false, error: "Not authorized to create KITANI link for this order" }, 403);
    }

    if (!["BOOKING", "READY"].includes(order.status)) {
      return jsonResponse({ success: false, error: "KITANI links can only be created for booking or ready orders" }, 400);
    }

    if (["DELIVERED", "FAILED_DELIVERY"].includes(order.runner_status)) {
      return jsonResponse({ success: false, error: "This order is already completed or failed" }, 400);
    }

    if (!order.phone || !String(order.phone).trim()) {
      return jsonResponse({ success: false, error: "Order needs a customer phone number before creating a KITANI link" }, 400);
    }

    const { data: existing } = await supabase
      .from("kitani_order_links")
      .select("*")
      .eq("order_id", orderId)
      .maybeSingle();

    if (existing?.invitation_url && !["FAILED", "EXPIRED", "REVOKED"].includes(existing.status)) {
      return jsonResponse({
        success: true,
        created: false,
        link: existing,
      });
    }

    const mode = (Deno.env.get("KITANI_INTEGRATION_MODE") || "api").toLowerCase();
    const idempotencyKey = `tomupro:${order.id}:delivery-invitation:v1`;
    const payload = buildKitaniPayload(order, actor);
    let responsePayload: Record<string, unknown> = {};
    let invitationUrl: string;
    let deliveryIntentId: string | null = null;
    let expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    let status = "AWAITING_CUSTOMER_LOCATION";

    if (mode === "api") {
      const apiBase = Deno.env.get("KITANI_API_BASE_URL");
      const clientId = Deno.env.get("KITANI_CLIENT_ID");
      const apiSecret = Deno.env.get("KITANI_API_SECRET");
      if (!apiBase || !clientId || !apiSecret) {
        return jsonResponse({ success: false, error: "KITANI API mode is missing server credentials" }, 500);
      }

      const requestBody = JSON.stringify(payload);
      const timestamp = new Date().toISOString();
      const signature = await hmacSign(apiSecret, `${timestamp}.${idempotencyKey}.${requestBody}`);
      const res = await fetch(`${normalizeBaseUrl(apiBase, apiBase)}/integrations/tomupro/v1/delivery-invitations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Client-Id": clientId,
          "X-Request-Timestamp": timestamp,
          "X-Correlation-Id": crypto.randomUUID(),
          "X-Signature": signature,
          "Idempotency-Key": idempotencyKey,
        },
        body: requestBody,
      });

      const apiResponse = await res.json().catch(() => ({ error: "Invalid KITANI response" })) as KitaniApiResponse;
      responsePayload = apiResponse;
      if (!res.ok) {
        await supabase.from("kitani_order_links").upsert({
          order_id: order.id,
          created_by: existing?.created_by || user.id,
          updated_by: user.id,
          status: "FAILED",
          last_error: JSON.stringify(responsePayload).slice(0, 1000),
          request_payload: payload,
          response_payload: responsePayload,
        }, { onConflict: "order_id" });

        return jsonResponse({ success: false, error: "KITANI API request failed", detail: responsePayload }, 502);
      }

      const invitation = apiResponse.invitation || {};
      invitationUrl = invitation.url;
      deliveryIntentId = apiResponse.delivery_intent_id || null;
      expiresAt = invitation.expires_at || expiresAt;
      status = apiResponse.status || status;
      if (!invitationUrl) {
        return jsonResponse({ success: false, error: "KITANI API did not return an invitation URL" }, 502);
      }
    } else if (mode === "mock" || mode === "manual") {
      const appBase = normalizeBaseUrl(Deno.env.get("KITANI_APP_URL"), "https://kitani.my");
      const token = crypto.randomUUID().replaceAll("-", "");
      invitationUrl = `${appBase}/delivery/${token}`;
      deliveryIntentId = `manual_${order.id}`;
      responsePayload = { mode, delivery_intent_id: deliveryIntentId, invitation: { url: invitationUrl, expires_at: expiresAt } };
    } else {
      return jsonResponse({ success: false, error: `Unsupported KITANI integration mode: ${mode}` }, 500);
    }

    const template = Deno.env.get("KITANI_INVITATION_TEMPLATE") ||
      "Your order is ready for KITANI delivery. Get the free delivery, rewards & more!\n\nConfirm your location: {{confirmation_url}}";
    const message = renderTemplate(template, {
      customer_name: order.customer_name || "",
      order_no: order.order_code || "",
      store_name: order.salesperson?.display_name || "TOMUPRO",
      confirmation_url: invitationUrl,
      expiry_text: `Link expires ${new Date(expiresAt).toLocaleString("en-BN")}.`,
      benefit_line: "Get the free delivery, rewards & more!",
    });

    const row = {
      order_id: order.id,
      created_by: existing?.created_by || user.id,
      updated_by: user.id,
      kitani_delivery_intent_id: deliveryIntentId,
      invitation_url: invitationUrl,
      message,
      template_key: "delivery_invitation",
      template_version: 1,
      status,
      source: "TOMUPRO",
      expires_at: expiresAt,
      last_error: null,
      request_payload: payload,
      response_payload: responsePayload,
    };

    const { data: saved, error: saveError } = await supabase
      .from("kitani_order_links")
      .upsert(row, { onConflict: "order_id" })
      .select()
      .single();

    if (saveError) {
      return jsonResponse({ success: false, error: saveError.message }, 500);
    }

    await supabase.from("audit_logs").insert({
      entity_type: "order",
      entity_id: order.id,
      action: "KITANI_INVITATION_CREATED",
      actor_id: user.id,
      after_json: {
        mode,
        status,
        kitani_delivery_intent_id: deliveryIntentId,
        expires_at: expiresAt,
      },
    });

    return jsonResponse({
      success: true,
      created: !existing,
      link: saved,
    });
  } catch (error) {
    console.error("create-kitani-invitation error:", error);
    return jsonResponse({ success: false, error: "Internal server error" }, 500);
  }
});
