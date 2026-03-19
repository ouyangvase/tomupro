import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
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
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(body));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  // Get integration settings
  const { data: settings } = await supabase
    .from("integration_settings")
    .select("*")
    .eq("integration_name", "pulseone")
    .single();

  if (!settings || !settings.webhook_url) {
    return jsonResponse({ error: "Webhook URL not configured" }, 400);
  }

  // Build test payload
  const testPayload = {
    event_type: "test.ping",
    occurred_at: new Date().toISOString(),
    data: {
      order_ref: "TEST-PING",
      customer_name: "Test Customer",
      customer_phone: "+60000000000",
      full_address: "Test Address",
      area: "Test Area",
      payment_type: "COD",
      order_total: 0,
      items: [],
    },
  };

  const payloadStr = JSON.stringify(testPayload);
  const signature = await hmacSign(settings.shared_secret || "", payloadStr);
  const idempotencyKey = `test-ping-${Date.now()}`;

  try {
    const resp = await fetch(settings.webhook_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Webhook-Event": "test.ping",
        "X-Webhook-Signature": signature,
        "Idempotency-Key": idempotencyKey,
        "X-Source-System": "TOMUPRO",
      },
      body: payloadStr,
    });

    const responseText = await resp.text();

    return jsonResponse({
      success: resp.ok,
      status: resp.status,
      response: responseText.substring(0, 500),
      idempotency_key: idempotencyKey,
    });
  } catch (err) {
    return jsonResponse(
      {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      },
      502
    );
  }
});
