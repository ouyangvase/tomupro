import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, decodeCursor, encodeCursor, jsonResponse, verifySnipersRequest } from "../_shared/snipers.ts";

interface OrderItemRow {
  sku_label?: string | null;
  qty?: number | null;
  price?: number | null;
  line_total?: number | null;
  product?: {
    sku_code?: string | null;
    sku_name?: string | null;
  } | null;
}

interface DeliveredOrderRow {
  id: string;
  order_code: string;
  customer_name: string | null;
  phone: string | null;
  total_qty: number | null;
  total_amount: number | null;
  runner_status: string;
  delivered_at: string | null;
  updated_at: string | null;
  owner_salesperson_display_name_snapshot?: string | null;
  order_items?: OrderItemRow[] | null;
}

function toHistoricalRecord(order: DeliveredOrderRow) {
  const items = (order.order_items || []).map((item) => ({
    sku: item.product?.sku_code || item.sku_label || null,
    sku_label: item.sku_label || null,
    product_name: item.product?.sku_name || item.sku_label || null,
    quantity: item.qty || 0,
    unit_price: item.price || 0,
    line_total: item.line_total || 0,
  }));

  const quantity = order.total_qty || items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);

  return {
    tomupro_order_id: order.id,
    sales_entry_order_code: order.order_code,
    customer_name: order.customer_name,
    customer_phone: order.phone,
    sku: items[0]?.sku || null,
    quantity,
    amount: order.total_amount || 0,
    profit_owner: order.owner_salesperson_display_name_snapshot || null,
    tracking_number: null,
    delivery_status: "delivered",
    delivered_at: order.delivered_at,
    updated_at: order.updated_at,
    items,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "GET") return jsonResponse({ success: false, error: "Method not allowed" }, 405);

  const verification = await verifySnipersRequest(req);
  if (!verification.ok) return jsonResponse({ success: false, error: verification.error }, verification.status);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const url = new URL(req.url);

  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 500);
  const offset = decodeCursor(url.searchParams.get("cursor"));
  const deliveredFrom = url.searchParams.get("delivered_from");
  const deliveredTo = url.searchParams.get("delivered_to");
  const updatedSince = url.searchParams.get("updated_since");
  const orderCode = url.searchParams.get("order_code");

  let query = supabase
    .from("orders")
    .select(`
      id,
      order_code,
      customer_name,
      phone,
      total_qty,
      total_amount,
      runner_status,
      delivered_at,
      updated_at,
      owner_salesperson_display_name_snapshot,
      order_items(sku_label, qty, price, line_total, product:products(sku_code, sku_name))
    `)
    .eq("runner_status", "DELIVERED")
    .not("delivered_at", "is", null)
    .order("delivered_at", { ascending: true })
    .order("id", { ascending: true });

  if (deliveredFrom) query = query.gte("delivered_at", deliveredFrom);
  if (deliveredTo) query = query.lte("delivered_at", deliveredTo);
  if (updatedSince) query = query.gte("updated_at", updatedSince);
  if (orderCode) query = query.eq("order_code", orderCode);

  const { data, error } = await query.range(offset, offset + limit - 1);
  if (error) return jsonResponse({ success: false, error: error.message }, 500);

  const rows = (data || []) as unknown as DeliveredOrderRow[];
  const nextCursor = rows.length === limit ? encodeCursor(offset + rows.length) : null;

  return jsonResponse({
    success: true,
    data: rows.map(toHistoricalRecord),
    limit,
    count: rows.length,
    next_cursor: nextCursor,
  });
});
