export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-timestamp, x-signature, x-tomupro-event-id, x-snipers-admin-trigger-secret, idempotency-key, x-original-uri, x-forwarded-uri, x-forwarded-path",
};

export function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function getSnipersConfig() {
  const baseUrl = Deno.env.get("SNIPERS_BASE_URL")?.replace(/\/+$/, "");
  const apiKey = Deno.env.get("SNIPERS_API_KEY");
  const webhookSecret = Deno.env.get("SNIPERS_WEBHOOK_SECRET");
  const deliveredPath =
    Deno.env.get("SNIPERS_ORDER_DELIVERED_PATH") || "/api/integrations/tomupro/order-delivered";

  return {
    baseUrl,
    apiKey,
    webhookSecret,
    deliveredPath: deliveredPath.startsWith("/") ? deliveredPath : `/${deliveredPath}`,
    deliveredUrl: baseUrl ? `${baseUrl}${deliveredPath.startsWith("/") ? deliveredPath : `/${deliveredPath}`}` : null,
  };
}

const DEFAULT_PULSE_ONE_RECEIVER =
  "https://vegwxtqfrltghvtgocqd.supabase.co/functions/v1/tomupro-webhook";

export type SnipersDeliveryConfig = {
  deliveredUrl: string | null;
  apiKey: string | null;
  webhookSecret: string | null;
  protocol: "pulseone" | "snipers";
};

export function buildPulseOneDeliveredPayload(payload: Record<string, unknown>) {
  const order = (payload.order || {}) as Record<string, any>;
  const items = Array.isArray(order.items) ? order.items : [];

  return {
    event_type: "order.delivered",
    occurred_at: payload.occurred_at || new Date().toISOString(),
    order_id: order.tomupro_order_id || null,
    order_ref: order.sales_entry_order_code || null,
    tracking_no: order.sales_entry_order_code || null,
    customer_name: order.customer_name || null,
    customer_phone: order.customer_phone || null,
    full_address: order.full_address || null,
    area: order.area || null,
    payment_type: order.payment_type || null,
    order_total: Number(order.amount || 0),
    items: items.map((item: Record<string, any>) => ({
      sku_code: item.sku || item.sku_label || null,
      qty: Number(item.quantity ?? item.qty ?? 0),
      price: Number(item.unit_price ?? item.price ?? 0),
      line_total: Number(item.line_total || 0),
    })),
    data: {
      order_id: order.tomupro_order_id || null,
      order_ref: order.sales_entry_order_code || null,
      tracking_no: order.sales_entry_order_code || null,
      customer_name: order.customer_name || null,
      customer_phone: order.customer_phone || null,
      full_address: order.full_address || null,
      area: order.area || null,
      payment_type: order.payment_type || null,
      order_total: Number(order.amount || 0),
      items: items.map((item: Record<string, any>) => ({
        sku_code: item.sku || item.sku_label || null,
        qty: Number(item.quantity ?? item.qty ?? 0),
        price: Number(item.unit_price ?? item.price ?? 0),
        line_total: Number(item.line_total || 0),
      })),
      source_system: "TOMUPRO",
    },
  };
}

/**
 * Prefer the existing Pulse One integration row when it is configured.
 * This keeps the delivery worker compatible with the receiver that TOMUPRO
 * was already linked to, while retaining SNIPERS_* as an explicit fallback.
 */
export async function resolveSnipersDeliveryConfig(supabase: any): Promise<SnipersDeliveryConfig> {
  const { data } = await supabase
    .from("integration_settings")
    .select("webhook_url, webhook_enabled, shared_secret")
    .eq("integration_name", "pulseone")
    .maybeSingle();

  if (data?.webhook_url && data.shared_secret) {
    const configuredUrl = String(data.webhook_url).replace(/\/+$/, "");
    const isFrontendRoute = /snipers\.today\/(?:pulse-one|api\/integrations)/i.test(configuredUrl);
    return {
      deliveredUrl: isFrontendRoute ? DEFAULT_PULSE_ONE_RECEIVER : configuredUrl,
      apiKey: null,
      webhookSecret: String(data.shared_secret),
      protocol: "pulseone",
    };
  }

  const config = getSnipersConfig();
  const configuredPath = Deno.env.get("SNIPERS_ORDER_DELIVERED_PATH") || "";
  if (config.webhookSecret && (!configuredPath || configuredPath === "/api/integrations/tomupro/order-delivered")) {
    return {
      deliveredUrl: DEFAULT_PULSE_ONE_RECEIVER,
      apiKey: null,
      webhookSecret: config.webhookSecret,
      protocol: "pulseone",
    };
  }

  return {
    deliveredUrl: config.deliveredUrl,
    apiKey: config.apiKey,
    webhookSecret: config.webhookSecret,
    protocol: "snipers",
  };
}

export function hasSnipersAdminTriggerSecret(req: Request): boolean {
  const candidates = [
    {
      secret: Deno.env.get("SNIPERS_ADMIN_TRIGGER_SECRET"),
      header: "X-SNIPERS-ADMIN-TRIGGER-SECRET",
    },
    {
      secret: Deno.env.get("TOMUPRO_DELIVERED_FUNCTION_SECRET"),
      header: "X-TOMUPRO-DELIVERY-TRIGGER-SECRET",
    },
  ];

  return candidates.some(({ secret, header }) => {
    if (!secret) return false;
    return safeEqual(req.headers.get(header) || "", secret);
  });
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

export async function postSignedJson(params: {
  url: string;
  apiKey: string;
  webhookSecret: string;
  eventId: string;
  idempotencyKey: string;
  body: Record<string, unknown>;
}) {
  const bodyText = JSON.stringify(params.body);
  const timestamp = new Date().toISOString();
  const signature = await hmacHex(
    params.webhookSecret,
    `${timestamp}.${params.eventId}.${params.idempotencyKey}.${bodyText}`,
  );

  return await fetch(params.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${params.apiKey}`,
      "X-Request-Timestamp": timestamp,
      "X-TOMUPRO-Event-Id": params.eventId,
      "X-Signature": signature,
      "Idempotency-Key": params.idempotencyKey,
      "X-Source-System": "TOMUPRO",
    },
    body: bodyText,
  });
}

export async function postPulseOneJson(params: {
  url: string;
  webhookSecret: string;
  eventType: string;
  eventId: string;
  idempotencyKey: string;
  body: Record<string, unknown>;
}) {
  const bodyText = JSON.stringify(params.body);
  const signature = await hmacHex(params.webhookSecret, bodyText);

  return await fetch(params.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Webhook-Event": params.eventType,
      "X-Webhook-Signature": signature,
      "Idempotency-Key": params.idempotencyKey,
      "X-Source-System": "TOMUPRO",
      "X-TOMUPRO-Event-Id": params.eventId,
    },
    body: bodyText,
  });
}

export async function verifySnipersRequest(req: Request): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { apiKey, webhookSecret } = getSnipersConfig();
  if (!apiKey || !webhookSecret) {
    return { ok: false, status: 500, error: "SNIPERS credentials are not configured" };
  }

  const authorization = req.headers.get("Authorization") || "";
  if (authorization !== `Bearer ${apiKey}`) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const timestamp = req.headers.get("X-Request-Timestamp") || "";
  const signature = req.headers.get("X-Signature") || "";
  if (!timestamp || !signature) {
    return { ok: false, status: 401, error: "Missing request signature" };
  }

  const signedAt = Date.parse(timestamp);
  if (!Number.isFinite(signedAt) || Math.abs(Date.now() - signedAt) > 5 * 60 * 1000) {
    return { ok: false, status: 401, error: "Request timestamp outside allowed window" };
  }

  const url = new URL(req.url);
  const candidatePaths = new Set<string>([
    `${url.pathname}${url.search}`,
    `/api/integrations/snipers/delivered-orders${url.search}`,
  ]);

  for (const headerName of ["X-Original-URI", "X-Forwarded-Uri", "X-Forwarded-Path"]) {
    const headerValue = req.headers.get(headerName);
    if (headerValue) candidatePaths.add(headerValue);
  }

  for (const candidatePath of candidatePaths) {
    const expected = await hmacHex(webhookSecret, `${timestamp}.${req.method}.${candidatePath}`);
    if (safeEqual(expected, signature)) {
      return { ok: true };
    }
  }

  if (candidatePaths.size === 0) {
    return { ok: false, status: 401, error: "Invalid signature" };
  }

  return { ok: false, status: 401, error: "Invalid signature" };
}

/**
 * Body-authenticated variant used by Sniper write endpoints. The body is
 * included in the signature so a valid token cannot be replayed with a
 * different seller, runner, or amount.
 */
export async function verifySnipersBodyRequest(
  req: Request,
  bodyText: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const { apiKey, webhookSecret } = getSnipersConfig();
  if (!apiKey || !webhookSecret) {
    return { ok: false, status: 500, error: "SNIPERS credentials are not configured" };
  }

  if (req.headers.get("Authorization") !== `Bearer ${apiKey}`) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const timestamp = req.headers.get("X-Request-Timestamp") || "";
  const signature = req.headers.get("X-Signature") || "";
  const idempotencyKey = req.headers.get("Idempotency-Key") || "";
  if (!timestamp || !signature || !idempotencyKey) {
    return { ok: false, status: 401, error: "Missing request signature or idempotency key" };
  }

  const signedAt = Date.parse(timestamp);
  if (!Number.isFinite(signedAt) || Math.abs(Date.now() - signedAt) > 5 * 60 * 1000) {
    return { ok: false, status: 401, error: "Request timestamp outside allowed window" };
  }

  const url = new URL(req.url);
  const candidatePaths = new Set<string>([
    `${url.pathname}${url.search}`,
    "/api/integrations/sniper/miri-pickup-orders",
    "/api/integrations/snipers/miri-pickup-orders",
  ]);
  for (const headerName of ["X-Original-URI", "X-Forwarded-Uri", "X-Forwarded-Path"]) {
    const headerValue = req.headers.get(headerName);
    if (headerValue) candidatePaths.add(headerValue);
  }

  for (const candidatePath of candidatePaths) {
    const expected = await hmacHex(
      webhookSecret,
      `${timestamp}.${req.method}.${candidatePath}.${idempotencyKey}.${bodyText}`,
    );
    if (safeEqual(expected, signature)) return { ok: true };
  }

  return { ok: false, status: 401, error: "Invalid signature" };
}

export function encodeCursor(offset: number): string {
  return btoa(JSON.stringify({ offset }));
}

export function decodeCursor(cursor: string | null): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(atob(cursor));
    const offset = Number(parsed.offset);
    return Number.isFinite(offset) && offset >= 0 ? offset : 0;
  } catch {
    return 0;
  }
}
