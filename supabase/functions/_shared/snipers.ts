export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-request-timestamp, x-signature, x-tomupro-event-id, x-snipers-admin-trigger-secret, idempotency-key",
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

export function hasSnipersAdminTriggerSecret(req: Request): boolean {
  const triggerSecret = Deno.env.get("SNIPERS_ADMIN_TRIGGER_SECRET");
  if (!triggerSecret) return false;

  const provided = req.headers.get("X-SNIPERS-ADMIN-TRIGGER-SECRET") || "";
  return safeEqual(provided, triggerSecret);
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
