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

/* ── Google Sheets Auth (Service Account JWT → Access Token) ── */

function base64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function strToBase64url(str: string): string {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemBody = pem
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/g, "")
    .replace(/-----END (RSA )?PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  const binaryStr = atob(pemBody);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return crypto.subtle.importKey(
    "pkcs8",
    bytes.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function getAccessToken(
  sa: { client_email: string; private_key: string }
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = strToBase64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = strToBase64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: "https://www.googleapis.com/auth/spreadsheets",
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    })
  );

  const sigInput = `${header}.${payload}`;
  const key = await importPrivateKey(sa.private_key);
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(sigInput)
  );
  const jwt = `${sigInput}.${base64url(sig)}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google OAuth failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.access_token;
}

/* ── Google Sheets API helpers ── */

async function sheetsRequest(
  accessToken: string,
  spreadsheetId: string,
  path: string,
  method = "GET",
  body?: unknown
): Promise<unknown> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Sheets API error (${res.status}): ${text}`);
  }
  return res.json();
}

async function ensureSheetTab(
  accessToken: string,
  spreadsheetId: string,
  tabTitle: string,
  existingTabs: string[]
): Promise<void> {
  if (existingTabs.includes(tabTitle)) return;
  await sheetsRequest(accessToken, spreadsheetId, ":batchUpdate", "POST", {
    requests: [{ addSheet: { properties: { title: tabTitle } } }],
  });
}

async function clearAndWriteSheet(
  accessToken: string,
  spreadsheetId: string,
  tabTitle: string,
  rows: string[][]
): Promise<number> {
  const range = `'${tabTitle}'!A1:Z`;
  // Clear existing data
  await sheetsRequest(
    accessToken,
    spreadsheetId,
    `/values/${encodeURIComponent(range)}:clear`,
    "POST",
    {}
  );
  // Write new data (header + rows)
  if (rows.length > 0) {
    await sheetsRequest(
      accessToken,
      spreadsheetId,
      `/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
      "PUT",
      { values: rows }
    );
  }
  return rows.length > 1 ? rows.length - 1 : 0; // exclude header
}

/* ── Column definitions ── */

const HEADER = [
  "Order ID",
  "Date",
  "Customer Name",
  "Phone Number",
  "Address",
  "Area",
  "Seller",
  "Runner",
  "SKU",
  "Quantity",
  "COD Amount",
  "Payment Method",
  "Status",
  "Delivery Date",
  "Updated At",
  "Claim Status",
  "Remark",
];

interface OrderRow {
  order_code: string;
  order_date: string;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  area: string | null;
  total_amount: number;
  total_qty: number;
  runner_status: string;
  reconciliation_status: string;
  payment_method: string | null;
  delivered_at: string | null;
  updated_at: string | null;
  failed_reason: string | null;
  driver_failed_remark: string | null;
  salesperson_name: string | null;
  runner_name: string | null;
  sku_summary: string;
}

function orderToRow(o: OrderRow): string[] {
  return [
    o.order_code || "",
    o.order_date || "",
    o.customer_name || "",
    o.phone || "",
    o.address || "",
    o.area || "",
    o.salesperson_name || "",
    o.runner_name || "",
    o.sku_summary || "",
    String(o.total_qty || 0),
    String(o.total_amount || 0),
    o.payment_method || "",
    o.runner_status || "",
    o.delivered_at || "",
    o.updated_at || "",
    o.reconciliation_status || "",
    o.failed_reason || o.driver_failed_remark || "",
  ];
}

/* ── Paginated fetch: fetches ALL rows matching a query (not limited to 1000) ── */

const PAGE_SIZE = 1000;

type QueryBuilder = ReturnType<ReturnType<typeof createClient>["from"]>;

async function fetchAllOrders(
  supabase: ReturnType<typeof createClient>,
  tab: "active" | "delivered" | "failed"
): Promise<any[]> {
  const allRows: any[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from("orders")
      .select(`
        id, order_code, order_date, customer_name, phone, address, area,
        total_amount, total_qty, runner_status, reconciliation_status,
        delivered_at, updated_at, failed_reason, driver_failed_remark,
        status, payment_method, salesperson_id, runner_id,
        salesperson:profiles!orders_salesperson_id_fkey(display_name),
        order_items(sku_label, qty, product:products!order_items_product_id_fkey(sku_code, sku_name))
      `)
      .range(from, from + PAGE_SIZE - 1);

    // Apply tab-specific filters (matching exact frontend dispatch page logic)
    if (tab === "active") {
      // Matches RunnerInbox: excludeDeliveredAndFailed = true
      // status = READY, runner_status NOT IN (DELIVERED, FAILED_DELIVERY, UNASSIGNED), status != CANCELLED
      query = query
        .eq("status", "READY")
        .neq("runner_status", "DELIVERED")
        .neq("runner_status", "FAILED_DELIVERY")
        .neq("runner_status", "UNASSIGNED")
        .neq("status", "CANCELLED")
        .order("created_at", { ascending: false });
    } else if (tab === "delivered") {
      // Delivered + NOT_CLAIMED only (pending claim orders)
      query = query
        .eq("runner_status", "DELIVERED")
        .neq("status", "CANCELLED")
        .eq("reconciliation_status", "NOT_CLAIMED")
        .order("delivered_at", { ascending: false, nullsFirst: false });
    } else if (tab === "failed") {
      // Matches RunnerFailedOrders: runnerStatusIn=['FAILED_DELIVERY']
      query = query
        .eq("runner_status", "FAILED_DELIVERY")
        .order("updated_at", { ascending: false });
    }

    const { data, error } = await query;

    if (error) throw new Error(`Failed to fetch ${tab} orders (offset ${from}): ${error.message}`);

    const rows = data || [];
    allRows.push(...rows);

    // If we got fewer rows than page size, we've reached the end
    if (rows.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return allRows;
}

/* ── Batch-fetch profile display names ── */

async function fetchProfileNames(
  supabase: ReturnType<typeof createClient>,
  ids: string[]
): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (ids.length === 0) return map;

  // Supabase .in() has limits, batch in chunks of 100
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", chunk);
    for (const r of data || []) {
      map[r.id] = r.display_name || "";
    }
  }
  return map;
}

/* ── Main handler ── */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Parse trigger info
  let triggeredBy = "manual";
  try {
    const body = await req.json();
    triggeredBy = body?.manual === true ? "manual" : "auto";
  } catch {
    // no body is fine
  }

  // Create log entry
  const { data: logEntry } = await supabase
    .from("gsheet_sync_logs")
    .insert({ triggered_by: triggeredBy, status: "pending" })
    .select("id")
    .single();
  const logId = logEntry?.id;

  try {
    // 1. Check settings
    const { data: settings } = await supabase
      .from("integration_settings")
      .select("*")
      .eq("integration_name", "google_sheet")
      .maybeSingle();

    if (!settings?.webhook_enabled || !settings?.webhook_url) {
      if (logId) {
        await supabase
          .from("gsheet_sync_logs")
          .update({ status: "skipped", error_message: "Sync disabled or no Sheet ID", completed_at: new Date().toISOString() })
          .eq("id", logId);
      }
      return jsonResponse({ success: false, skipped: true, reason: "Sync disabled or no Sheet ID configured" });
    }

    const spreadsheetId = settings.webhook_url.trim();

    // 2. Debounce: skip if last successful sync < 30s ago (auto-trigger only)
    const { data: recentSync } = await supabase
      .from("gsheet_sync_logs")
      .select("completed_at")
      .eq("status", "success")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (recentSync?.completed_at) {
      const elapsed = Date.now() - new Date(recentSync.completed_at).getTime();
      if (elapsed < 30000 && triggeredBy !== "manual") {
        if (logId) {
          await supabase
            .from("gsheet_sync_logs")
            .update({ status: "skipped", error_message: "Debounced (last sync < 30s ago)", completed_at: new Date().toISOString() })
            .eq("id", logId);
        }
        return jsonResponse({ success: true, skipped: true, reason: "Debounced" });
      }
    }

    // 3. Get service account credentials
    const saKeyJson = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
    if (!saKeyJson) {
      throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY env secret not configured");
    }
    const sa = JSON.parse(saKeyJson);
    const accessToken = await getAccessToken(sa);

    // 4. Fetch ALL orders for each tab with pagination (no 1000-row limit)
    console.log("[sync-google-sheet] Fetching all orders with pagination...");

    const [activeRaw, deliveredRaw, failedRaw] = await Promise.all([
      fetchAllOrders(supabase, "active"),
      fetchAllOrders(supabase, "delivered"),
      fetchAllOrders(supabase, "failed"),
    ]);

    console.log(`[sync-google-sheet] Fetched: active=${activeRaw.length}, delivered=${deliveredRaw.length}, failed=${failedRaw.length}`);

    // 5. Batch-fetch runner names (runner_id has no FK)
    const allRunnerIds = new Set<string>();
    for (const o of [...activeRaw, ...deliveredRaw, ...failedRaw]) {
      if (o.runner_id) allRunnerIds.add(o.runner_id);
    }
    const runnerMap = await fetchProfileNames(supabase, [...allRunnerIds]);

    // 6. Map orders to rows
    const mapOrder = (o: any): OrderRow => ({
      order_code: o.order_code,
      order_date: o.order_date,
      customer_name: o.customer_name,
      phone: o.phone,
      address: o.address,
      area: o.area,
      total_amount: o.total_amount,
      total_qty: o.total_qty,
      runner_status: o.runner_status,
      reconciliation_status: o.reconciliation_status,
      payment_method: o.payment_method,
      delivered_at: o.delivered_at,
      updated_at: o.updated_at,
      failed_reason: o.failed_reason,
      driver_failed_remark: o.driver_failed_remark,
      salesperson_name: o.salesperson?.display_name || null,
      runner_name: o.runner_id ? (runnerMap[o.runner_id] || null) : null,
      sku_summary: (o.order_items || [])
        .map((item: any) => {
          const code = item.product?.sku_code || item.sku_label || "?";
          return `${code} x${item.qty || 0}`;
        })
        .join(", "),
    });

    const activeOrders = activeRaw.map(mapOrder);
    const deliveredOrders = deliveredRaw.map(mapOrder);
    const failedOrders = failedRaw.map(mapOrder);

    // 7. Get existing sheet tabs
    const sheetMeta = (await sheetsRequest(accessToken, spreadsheetId, "")) as any;
    const existingTabs = (sheetMeta.sheets || []).map(
      (s: any) => s.properties?.title
    );

    // Ensure all 3 tabs exist
    for (const tab of ["Active Dispatch", "Delivered", "Failed"]) {
      await ensureSheetTab(accessToken, spreadsheetId, tab, existingTabs);
      if (!existingTabs.includes(tab)) existingTabs.push(tab);
    }

    // 8. Write data to each tab (clear + write all)
    const activeWritten = await clearAndWriteSheet(
      accessToken, spreadsheetId, "Active Dispatch",
      [HEADER, ...activeOrders.map(orderToRow)]
    );
    const deliveredWritten = await clearAndWriteSheet(
      accessToken, spreadsheetId, "Delivered",
      [HEADER, ...deliveredOrders.map(orderToRow)]
    );
    const failedWritten = await clearAndWriteSheet(
      accessToken, spreadsheetId, "Failed",
      [HEADER, ...failedOrders.map(orderToRow)]
    );

    const totalRows = activeWritten + deliveredWritten + failedWritten;

    // 9. Update log and settings with per-tab counts
    const now = new Date().toISOString();
    const tabCounts = {
      active: { db_count: activeRaw.length, sheet_count: activeWritten },
      delivered: { db_count: deliveredRaw.length, sheet_count: deliveredWritten },
      failed: { db_count: failedRaw.length, sheet_count: failedWritten },
    };

    // Check for mismatches
    const mismatches: string[] = [];
    for (const [tab, counts] of Object.entries(tabCounts)) {
      if (counts.db_count !== counts.sheet_count) {
        mismatches.push(`${tab}: db=${counts.db_count} sheet=${counts.sheet_count}`);
      }
    }
    const syncStatus = mismatches.length > 0 ? "mismatch" : "success";

    if (logId) {
      await supabase
        .from("gsheet_sync_logs")
        .update({
          status: syncStatus,
          rows_synced: totalRows,
          error_message: mismatches.length > 0 ? `Count mismatch: ${mismatches.join(", ")}` : null,
          completed_at: now,
        })
        .eq("id", logId);
    }

    await supabase
      .from("integration_settings")
      .update({
        metadata: {
          last_sync_at: now,
          last_sync_status: syncStatus,
          rows_synced: totalRows,
          service_account_email: sa.client_email,
          tab_counts: tabCounts,
        },
        updated_at: now,
      })
      .eq("integration_name", "google_sheet");

    return jsonResponse({
      success: true,
      status: syncStatus,
      rows_synced: totalRows,
      active: activeWritten,
      delivered: deliveredWritten,
      failed: failedWritten,
      tab_counts: tabCounts,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[sync-google-sheet] Error:", errorMsg);

    if (logId) {
      await supabase
        .from("gsheet_sync_logs")
        .update({
          status: "failed",
          error_message: errorMsg.substring(0, 1000),
          completed_at: new Date().toISOString(),
        })
        .eq("id", logId);
    }

    await supabase
      .from("integration_settings")
      .update({
        metadata: {
          last_sync_at: new Date().toISOString(),
          last_sync_status: "failed",
          last_error: errorMsg.substring(0, 500),
        },
        updated_at: new Date().toISOString(),
      })
      .eq("integration_name", "google_sheet");

    return jsonResponse({ success: false, error: errorMsg }, 500);
  }
});
