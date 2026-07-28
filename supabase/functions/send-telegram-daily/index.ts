import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TelegramResponse {
  ok: boolean;
  description?: string;
}

const TELEGRAM_CHAT_ID_PATTERN = /^-?\d+$/;

async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<TelegramResponse> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  return res.json();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json().catch(() => ({}));
    const action = body.action || 'send_daily';

    // ── Get bot settings ──
    const { data: botSettings } = await supabase
      .from('telegram_bot_settings')
      .select('*')
      .limit(1)
      .single();

    if (!botSettings?.bot_token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Bot token not configured' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const botToken = botSettings.bot_token;

    // ── Action: test (only for Test Connection button) ──
    if (action === 'test') {
      const chatId = String(body.chat_id ?? '').trim();
      const message = body.message || 'TomuPro bot connected!';
      if (!TELEGRAM_CHAT_ID_PATTERN.test(chatId)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Enter a valid personal or group Chat ID using numbers only' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const result = await sendTelegramMessage(botToken, chatId, message);
      return new Response(
        JSON.stringify({ success: result.ok, error: result.description }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Action: send_daily ──
    if (!botSettings.bot_enabled) {
      return new Response(
        JSON.stringify({ success: false, error: 'Bot is disabled', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get all users who self-enabled Telegram. Admin permission rows are no
    // longer required for a user to receive their own Telegram notifications.
    const { data: userSettings } = await supabase
      .from('user_telegram_settings')
      .select('*')
      .eq('telegram_enabled', true)
      .not('chat_id', 'is', null);

    if (!userSettings?.length) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, reason: 'No qualifying users' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const testUserId = body.test_user_id;

    // ── Fetch stock from stock_balance_view (same source as Inventory page) ──
    const { data: allStock, error: stockError } = await supabase
      .from('stock_balance_view')
      .select('warehouse_id, owner_user_id, owner_name, sku_code, balance_qty');

    console.log(`[DEBUG] stock_balance_view: ${allStock?.length ?? 0} rows, error: ${stockError?.message ?? 'none'}`);

    // ── Fetch delivered NOT_CLAIMED orders (same filter as get_delivered_orders_fast) ──
    // Include area for delivery charge lookup, and status to exclude CANCELLED
    // Fetch ALL rows (bypass default 1000 row limit) using pagination
    let unclaimedOrders: any[] = [];
    let offset = 0;
    const pageSize = 1000;
    while (true) {
      const { data: batch } = await supabase
        .from('orders')
        .select('id, total_amount, salesperson_id, runner_id, area, status, delivered_at')
        .eq('runner_status', 'DELIVERED')
        .eq('reconciliation_status', 'NOT_CLAIMED')
        .neq('status', 'CANCELLED')
        .range(offset, offset + pageSize - 1);
      if (!batch || batch.length === 0) break;
      unclaimedOrders = unclaimedOrders.concat(batch);
      if (batch.length < pageSize) break;
      offset += pageSize;
    }

    console.log(`[DEBUG] unclaimed orders: ${unclaimedOrders.length}`);

    // ── Fetch approved delivery charges (same as useDeliveryCharges hook) ──
    // Key: runner_id + area → charge_amount
    const { data: deliveryChargesData } = await supabase
      .from('delivery_charges')
      .select('runner_id, area, charge_amount')
      .eq('status', 'APPROVED')
      .is('superseded_at', null);

    // Build lookup: Map<"runner_id|area_lowercase", charge_amount>
    const chargeMap = new Map<string, number>();
    for (const dc of (deliveryChargesData || [])) {
      const key = `${dc.runner_id}|${(dc.area || '').toLowerCase()}`;
      chargeMap.set(key, Number(dc.charge_amount) || 0);
    }

    console.log(`[DEBUG] delivery charges loaded: ${chargeMap.size} entries`);

    // Get active bindings for runner→salesperson lookup
    // Get warehouses to auto-derive warehouse IDs from stock owner IDs
    const { data: warehousesData } = await supabase
      .from('warehouses')
      .select('id, owner_user_id')
      .eq('is_active', true);

    const today = new Date();
    const dateStr = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`;

    let sentCount = 0;
    const debugInfo: Record<string, any> = {};

    for (const userSetting of (userSettings as any[])) {
      const userId = userSetting.user_id;
      if (testUserId && userId !== testUserId) continue;
      if (!userSetting.chat_id) continue;

      const chatId = String(userSetting.chat_id).trim();
      if (!TELEGRAM_CHAT_ID_PATTERN.test(chatId)) {
        await supabase.from('telegram_notification_logs').insert({
          user_id: userId,
          chat_id: chatId,
          notification_type: 'daily_report',
          status: 'failed',
          error_message: 'Invalid personal or group Chat ID',
        });
        continue;
      }

      const wantsStock = !!userSetting.receive_stock_balance;
      const wantsDelivered = !!userSetting.receive_delivered_not_claimed;

      if (!wantsStock && !wantsDelivered) continue;

      // ── Pre-compute allowed IDs ──
      // Auto-derive warehouse IDs from allowed stock owners + user's own warehouses
      const derivedWarehouseIds: string[] = [];
      if (warehousesData) {
        const ownerSet = new Set<string>([userId]);
        for (const wh of warehousesData) {
          if (ownerSet.has(wh.owner_user_id)) {
            derivedWarehouseIds.push(wh.id);
          }
        }
      }

      const allAllowedOwners = new Set<string>([userId]);

      // ── Build combined message ──
      let msg = `<b>TomuPro Daily Report</b>\n\nDate: ${dateStr}\n`;

      // ── Delivered Not Claimed Section ──
      // Uses same calculation as Submit Claim Batch: Gross - Delivery Charges = Net Claim
      if (wantsDelivered) {
        let filteredOrders = unclaimedOrders;

        filteredOrders = filteredOrders.filter(o => o.salesperson_id === userId || o.runner_id === userId);

        // Calculate exactly like Submit Claim Batch modal (useClaimPreview):
        // Gross = SUM(total_amount)
        // Delivery Charges = SUM(delivery_charge per order based on runner_id + area)
        // Net Claim = Gross - Delivery Charges
        let grossBND = 0;
        let deliveryChargesBND = 0;
        const orderCount = filteredOrders.length;

        for (const o of filteredOrders) {
          const amount = Number(o.total_amount) || 0;
          grossBND += amount;

          // Lookup delivery charge by runner_id + area (same as useDeliveryChargePreview)
          if (o.runner_id && o.area) {
            const chargeKey = `${o.runner_id}|${o.area.toLowerCase()}`;
            const charge = chargeMap.get(chargeKey);
            if (charge !== undefined) {
              deliveryChargesBND += charge;
            }
          }
        }

        const netBND = grossBND - deliveryChargesBND;

        console.log(`[DEBUG] User ${userId}: orders=${orderCount}, gross=${grossBND}, charges=${deliveryChargesBND}, net=${netBND}`);

        if (orderCount > 0) {
          msg += `\nDelivered Not Claimed:`;
          msg += `\nOrders Selected: ${orderCount}`;
          msg += `\nGross Total: BND ${grossBND.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          if (deliveryChargesBND > 0) {
            msg += `\nDelivery Charges: -BND ${deliveryChargesBND.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
          }
          msg += `\nNet Claim: BND ${netBND.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
        } else {
          msg += `\nNo delivered orders not claimed.\n`;
        }

        debugInfo[userId] = {
          ...(debugInfo[userId] || {}),
          ordersTotal: unclaimedOrders.length,
          ordersFiltered: orderCount,
          grossBND,
          deliveryChargesBND,
          netBND,
        };
      }

      // ── Stock Balance Section (grouped by OWNER) ──
      if (wantsStock) {
        let filteredStock = allStock || [];

        filteredStock = filteredStock.filter(s => {
          const ownerId = s.owner_user_id;
          if (ownerId && allAllowedOwners.has(ownerId)) return true;
          if (derivedWarehouseIds.length > 0 && derivedWarehouseIds.includes(s.warehouse_id)) return true;
          return false;
        });

        console.log(`[DEBUG] User ${userId}: stock total=${(allStock || []).length}, filtered=${filteredStock.length}`);

        // Apply hide_zero_stock_sku filter if user has it enabled
        const hideZero = userSetting.hide_zero_stock_sku ?? false;
        if (hideZero) {
          filteredStock = filteredStock.filter(s => (s.balance_qty ?? 0) !== 0);
          console.log(`[DEBUG] User ${userId}: after zero filter=${filteredStock.length}`);
        }

        // Group by owner, then by SKU
        const ownerMap = new Map<string, { name: string; skus: Map<string, number> }>();

        for (const s of filteredStock) {
          const ownerName = s.owner_name || 'Unknown';
          const ownerId = s.owner_user_id || 'unknown';
          const skuCode = s.sku_code || '???';
          const qty = s.balance_qty ?? 0;

          let owner = ownerMap.get(ownerId);
          if (!owner) {
            owner = { name: ownerName, skus: new Map() };
            ownerMap.set(ownerId, owner);
          }

          const existingQty = owner.skus.get(skuCode) || 0;
          owner.skus.set(skuCode, existingQty + qty);
        }

        debugInfo[userId] = {
          ...(debugInfo[userId] || {}),
          stockTotal: (allStock || []).length,
          stockFiltered: filteredStock.length,
          ownersCount: ownerMap.size,
        };

        if (ownerMap.size > 0) {
          msg += `\n<b>STOCK BALANCE</b>\n`;

          const sortedOwners = [...ownerMap.entries()].sort((a, b) =>
            a[1].name.localeCompare(b[1].name)
          );

          for (const [, owner] of sortedOwners) {
            msg += `\n<b>${owner.name.toUpperCase()}</b>\n`;

            const sortedSkus = [...owner.skus.entries()].sort((a, b) =>
              a[0].localeCompare(b[0])
            );

            for (const [sku, qty] of sortedSkus) {
              msg += `${sku} X ${qty}\n`;
            }
          }
        } else {
          msg += `\nNo stock balance available.\n`;
        }
      }

      // ── Send single combined message ──
      try {
        const result = await sendTelegramMessage(botToken, chatId, msg.trim());
        await supabase.from('telegram_notification_logs').insert({
          user_id: userId,
          chat_id: chatId,
          notification_type: 'daily_report',
          status: result.ok ? 'success' : 'failed',
          error_message: result.ok ? null : (result.description || 'Unknown error'),
          message_preview: msg.substring(0, 200),
        });
        if (result.ok) sentCount++;
      } catch (err) {
        await supabase.from('telegram_notification_logs').insert({
          user_id: userId,
          chat_id: chatId,
          notification_type: 'daily_report',
          status: 'failed',
          error_message: err instanceof Error ? err.message : String(err),
          message_preview: msg.substring(0, 200),
        });
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent: sentCount, debug: debugInfo }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('send-telegram-daily error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
