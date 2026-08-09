import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TelegramResponse {
  ok: boolean;
  description?: string;
  result?: {
    message_id?: number;
  };
}

const TELEGRAM_CHAT_ID_PATTERN = /^-?\d+$/;

interface TelegramDestination {
  id: string | null;
  user_id: string;
  chat_id: string;
  label: string;
}

async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<TelegramResponse> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  return res.json();
}

async function getAuthenticatedUserId(req: Request, supabase: any): Promise<string | null> {
  const authorization = req.headers.get('Authorization') || '';
  const token = authorization.replace(/^Bearer\s+/i, '').trim();
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(
    JSON.stringify(payload),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
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
    if (['test', 'verify_destination', 'test_destination', 'test_all_destinations'].includes(action)) {
      const userId = await getAuthenticatedUserId(req, supabase);
      if (!userId) return jsonResponse({ success: false, error: 'Authentication required' }, 401);

      if (action === 'verify_destination') {
        const chatId = String(body.chat_id ?? '').trim();
        const label = String(body.label ?? '').trim() || null;
        if (!TELEGRAM_CHAT_ID_PATTERN.test(chatId)) {
          return jsonResponse({ success: false, error: 'Enter a valid personal or group Chat ID using numbers only' }, 400);
        }

        const { data: existingDestinations, error: existingError } = await supabase
          .from('user_telegram_destinations')
          .select('id, chat_id')
          .eq('user_id', userId)
          .eq('active', true);
        if (existingError) return jsonResponse({ success: false, error: existingError.message }, 400);
        if ((existingDestinations || []).some((destination) => destination.chat_id === chatId)) {
          return jsonResponse({ success: false, error: 'This Telegram chat is already connected' }, 409);
        }
        if ((existingDestinations || []).length >= 2) {
          return jsonResponse({ success: false, error: 'Maximum 2 Telegram chats connected' }, 409);
        }

        const verification = await sendTelegramMessage(
          botToken,
          chatId,
          '<b>TomuPro Telegram verified</b>\n\nVerification succeeded. TomuPro is completing the connection.',
        );
        if (!verification.ok) {
          return jsonResponse({ success: false, error: verification.description || 'Telegram could not reach this chat' }, 400);
        }

        const { data: destinationId, error: destinationError } = await supabase.rpc(
          'upsert_verified_telegram_destination',
          { p_user_id: userId, p_chat_id: chatId, p_label: label },
        );
        if (destinationError) {
          return jsonResponse({ success: false, error: destinationError.message }, 400);
        }

        await supabase.from('telegram_notification_logs').insert({
          user_id: userId,
          telegram_destination_id: destinationId,
          chat_id: chatId,
          notification_type: 'destination_verification',
          status: 'success',
          telegram_message_id: verification.result?.message_id ? String(verification.result.message_id) : null,
          message_preview: 'TomuPro Telegram verified',
        });

        return jsonResponse({
          success: true,
          destination_id: destinationId,
          telegram_message_id: verification.result?.message_id ?? null,
          verified_at: new Date().toISOString(),
        });
      }

      if (action === 'test') {
        const chatId = String(body.chat_id ?? '').trim();
        if (!TELEGRAM_CHAT_ID_PATTERN.test(chatId)) {
          return jsonResponse({ success: false, error: 'Enter a valid personal or group Chat ID using numbers only' }, 400);
        }

        const { data: allowedDestination } = await supabase
          .from('user_telegram_destinations')
          .select('id')
          .eq('user_id', userId)
          .eq('chat_id', chatId)
          .eq('active', true)
          .not('verified_at', 'is', null)
          .maybeSingle();
        if (!allowedDestination) {
          return jsonResponse({ success: false, error: 'Verify this Telegram chat before testing it' }, 403);
        }

        const result = await sendTelegramMessage(botToken, chatId, body.message || 'TomuPro bot connected!');
        return jsonResponse({ success: result.ok, error: result.description, telegram_message_id: result.result?.message_id ?? null });
      }

      let destinationQuery = supabase
        .from('user_telegram_destinations')
        .select('id, user_id, chat_id, label')
        .eq('user_id', userId)
        .eq('active', true)
        .not('verified_at', 'is', null);

      if (action === 'test_destination') {
        destinationQuery = destinationQuery.eq('id', body.destination_id);
      }

      const { data: destinations, error: destinationsError } = await destinationQuery
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });
      if (destinationsError) return jsonResponse({ success: false, error: destinationsError.message }, 400);
      if (!destinations?.length) return jsonResponse({ success: false, error: 'No verified Telegram chat found' }, 404);

      const results = [];
      for (const destination of destinations as TelegramDestination[]) {
        const result = await sendTelegramMessage(
          botToken,
          destination.chat_id,
          '<b>TomuPro test notification</b>\n\nYour Telegram connection is working.',
        );
        await supabase.from('telegram_notification_logs').insert({
          user_id: userId,
          telegram_destination_id: destination.id,
          chat_id: destination.chat_id,
          notification_type: 'destination_test',
          status: result.ok ? 'success' : 'failed',
          error_message: result.ok ? null : (result.description || 'Telegram send failed'),
          telegram_message_id: result.result?.message_id ? String(result.result.message_id) : null,
          message_preview: 'TomuPro test notification',
        });
        results.push({
          destination_id: destination.id,
          label: destination.label,
          success: result.ok,
          error: result.ok ? null : result.description,
          telegram_message_id: result.result?.message_id ?? null,
        });
      }

      return jsonResponse({
        success: true,
        all_succeeded: results.every((result) => result.success),
        results,
        tested_at: new Date().toISOString(),
      });
    }

    // ── Action: send_daily ──
    if (!botSettings.bot_enabled) {
      return new Response(
        JSON.stringify({ success: false, error: 'Bot is disabled', sent: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Telegram report delivery is self-service. Users opt in from their own
    // settings; an optional permission row only provides additional data scope.
    const { data: permissionRows } = await supabase
      .from('telegram_notification_permissions')
      .select('*');

    const { data: userSettings } = await supabase
      .from('user_telegram_settings')
      .select('*')
      .eq('telegram_enabled', true);

    if (!userSettings?.length) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, reason: 'No qualifying users' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const testUserId = body.test_user_id;
    const permissionsMap = new Map((permissionRows || []).map((permission) => [permission.user_id, permission]));
    const userIds = (userSettings as any[]).map((setting) => setting.user_id);
    const destinationsByUser = new Map<string, TelegramDestination[]>();
    const { data: destinations } = await supabase
      .from('user_telegram_destinations')
      .select('id, user_id, chat_id, label')
      .in('user_id', userIds)
      .eq('active', true)
      .not('verified_at', 'is', null)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: true });

    for (const destination of (destinations || []) as TelegramDestination[]) {
      const userDestinations = destinationsByUser.get(destination.user_id) || [];
      userDestinations.push(destination);
      destinationsByUser.set(destination.user_id, userDestinations);
    }

    for (const setting of userSettings as any[]) {
      if (destinationsByUser.has(setting.user_id)) continue;
      const legacyChatId = String(setting.chat_id || '').trim();
      if (!TELEGRAM_CHAT_ID_PATTERN.test(legacyChatId)) continue;
      destinationsByUser.set(setting.user_id, [{
        id: null,
        user_id: setting.user_id,
        chat_id: legacyChatId,
        label: 'Primary Telegram',
      }]);
    }

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

    // Include both runner-accepted failures and newly reported Driver failures
    // so the existing Failed Delivery preference reflects real failed work.
    let failedOrders: any[] = [];
    offset = 0;
    while (true) {
      const { data: batch } = await supabase
        .from('orders')
        .select('id, total_amount, salesperson_id, runner_id, area, status, runner_status, driver_status')
        .or('runner_status.eq.FAILED_DELIVERY,driver_status.eq.DRIVER_FAILED')
        .neq('status', 'CANCELLED')
        .range(offset, offset + pageSize - 1);
      if (!batch || batch.length === 0) break;
      failedOrders = failedOrders.concat(batch);
      if (batch.length < pageSize) break;
      offset += pageSize;
    }

    console.log(`[DEBUG] failed orders: ${failedOrders.length}`);

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
    const { data: bindingsData } = await supabase
      .from('bindings')
      .select('runner_id, salesperson_id')
      .eq('active', true);

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

      const configuredPermission = permissionsMap.get(userId);
      const perm = configuredPermission?.admin_enabled ? configuredPermission : {
        user_id: userId,
        can_view_all_data: false,
        see_all_stock: false,
        allowed_stock_owner_ids: [],
        allowed_warehouse_ids: [],
        allowed_runner_ids: [],
        allowed_team_user_ids: [],
      };
      const userDestinations = destinationsByUser.get(userId) || [];
      if (userDestinations.length === 0) continue;

      const seeAll = !!perm.can_view_all_data || !!perm.see_all_stock;
      const wantsStock = !!userSetting.receive_stock_balance;
      const wantsDelivered = !!userSetting.receive_delivered_not_claimed;
      const wantsFailed = !!userSetting.receive_failed_delivery;

      if (!wantsStock && !wantsDelivered && !wantsFailed) continue;

      // ── Pre-compute allowed IDs ──
      const allowedOwnerIds: string[] = perm.allowed_stock_owner_ids || [];
      const allowedWarehouseIds: string[] = perm.allowed_warehouse_ids || [];
      const allowedRunnerIds: string[] = perm.allowed_runner_ids || [];
      const allowedTeamUserIds: string[] = perm.allowed_team_user_ids || [];

      // Auto-derive warehouse IDs from allowed stock owners + user's own warehouses
      const derivedWarehouseIds: string[] = [];
      if (warehousesData) {
        const ownerSet = new Set<string>([userId, ...allowedOwnerIds, ...allowedTeamUserIds]);
        for (const wh of warehousesData) {
          if (ownerSet.has(wh.owner_user_id)) {
            derivedWarehouseIds.push(wh.id);
          }
        }
      }

      const runnerBoundOwnerIds = new Set<string>();
      if (allowedRunnerIds.length > 0 && bindingsData) {
        for (const binding of bindingsData) {
          if (allowedRunnerIds.includes(binding.runner_id)) {
            runnerBoundOwnerIds.add(binding.salesperson_id);
          }
        }
      }

      const allAllowedOwners = new Set<string>([
        userId,
        ...allowedOwnerIds,
        ...allowedTeamUserIds,
        ...runnerBoundOwnerIds,
      ]);

      // ── Build combined message ──
      let msg = `<b>TomuPro Daily Report</b>\n\nDate: ${dateStr}\n`;

      // ── Delivered Not Claimed Section ──
      // Uses same calculation as Submit Claim Batch: Gross - Delivery Charges = Net Claim
      if (wantsDelivered) {
        let filteredOrders = unclaimedOrders;

        if (!seeAll) {
          filteredOrders = filteredOrders.filter(o => {
            if (o.salesperson_id === userId || o.runner_id === userId) return true;
            if (allowedOwnerIds.includes(o.salesperson_id)) return true;
            if (allowedRunnerIds.includes(o.runner_id)) return true;
            if (allowedTeamUserIds.includes(o.salesperson_id)) return true;
            return false;
          });
        }

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

      // ── Failed Delivery Section ──
      if (wantsFailed) {
        let filteredFailed = failedOrders;

        if (!seeAll) {
          filteredFailed = filteredFailed.filter(o => {
            if (o.salesperson_id === userId || o.runner_id === userId) return true;
            if (allowedOwnerIds.includes(o.salesperson_id)) return true;
            if (allowedRunnerIds.includes(o.runner_id)) return true;
            if (allowedTeamUserIds.includes(o.salesperson_id)) return true;
            return false;
          });
        }

        const failedCount = filteredFailed.length;
        const failedAmount = filteredFailed.reduce(
          (total, order) => total + (Number(order.total_amount) || 0),
          0,
        );

        if (failedCount > 0) {
          msg += `\nFailed Delivery:`;
          msg += `\nOrders: ${failedCount}`;
          msg += `\nAmount: BND ${failedAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n`;
        } else {
          msg += `\nNo failed deliveries.\n`;
        }

        debugInfo[userId] = {
          ...(debugInfo[userId] || {}),
          failedTotal: failedOrders.length,
          failedFiltered: failedCount,
          failedAmount,
        };
      }

      // ── Stock Balance Section (grouped by OWNER) ──
      if (wantsStock) {
        let filteredStock = allStock || [];

        if (!seeAll) {
          filteredStock = filteredStock.filter(s => {
            const ownerId = s.owner_user_id;
            if (ownerId && allAllowedOwners.has(ownerId)) return true;
            if (allowedWarehouseIds.includes(s.warehouse_id)) return true;
            if (derivedWarehouseIds.length > 0 && derivedWarehouseIds.includes(s.warehouse_id)) return true;
            return false;
          });
        }

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
      for (const destination of userDestinations) {
        const chatId = destination.chat_id.trim();
        if (!TELEGRAM_CHAT_ID_PATTERN.test(chatId)) continue;

        const deliveryType = testUserId ? 'daily_report_test' : 'daily_report';
        const deliveryKey = `${deliveryType}:${today.toISOString().slice(0, 10)}:${userId}:${chatId}`;
        const { data: claims, error: claimError } = await supabase.rpc(
          'claim_telegram_notification_delivery',
          {
            p_delivery_key: deliveryKey,
            p_user_id: userId,
            p_destination_id: destination.id,
            p_chat_id: chatId,
            p_notification_type: 'daily_report',
            p_message_preview: msg.substring(0, 200),
          },
        );
        if (claimError) {
          console.error(`[send-telegram-daily] Failed to claim ${deliveryKey}:`, claimError.message);
          continue;
        }

        const claim = claims?.[0];
        if (!claim?.should_send) continue;

        try {
          const result = await sendTelegramMessage(botToken, chatId, msg.trim());
          await supabase
            .from('telegram_notification_logs')
            .update({
              status: result.ok ? 'success' : 'failed',
              error_message: result.ok ? null : (result.description || 'Unknown error'),
              telegram_message_id: result.result?.message_id ? String(result.result.message_id) : null,
              sent_at: new Date().toISOString(),
            })
            .eq('id', claim.log_id);
          if (result.ok) sentCount++;
        } catch (err) {
          await supabase
            .from('telegram_notification_logs')
            .update({
              status: 'failed',
              error_message: err instanceof Error ? err.message : String(err),
              sent_at: new Date().toISOString(),
            })
            .eq('id', claim.log_id);
        }
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
