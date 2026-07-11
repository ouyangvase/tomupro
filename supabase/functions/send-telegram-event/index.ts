import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TelegramResponse {
  ok: boolean;
  description?: string;
}

async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<TelegramResponse> {
  const res = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
  });
  return res.json();
}

// ── Message templates ──

function receiptEventMessage(eventType: string, metadata: Record<string, any>): string {
  const orderCode = metadata.order_code || '???';
  const customer = metadata.customer_name || 'Unknown';
  const amount = metadata.total_amount != null
    ? `BND ${Number(metadata.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    : 'N/A';
  const payment = metadata.payment_method || 'N/A';

  const titles: Record<string, string> = {
    receipt_uploaded: 'New Receipt Uploaded',
    receipt_reuploaded: 'Receipt Re-uploaded',
    receipt_confirmed: 'Receipt Confirmed',
    receipt_rejected: 'Receipt Rejected',
  };

  const title = titles[eventType] || 'Receipt Update';
  const emoji = eventType === 'receipt_confirmed' ? '✅'
    : eventType === 'receipt_rejected' ? '❌'
    : '📄';

  return [
    `${emoji} <b>${title}</b>`,
    '',
    `Order: <b>${orderCode}</b>`,
    `Customer: ${customer}`,
    `Amount: ${amount}`,
    `Payment: ${payment}`,
    '',
    eventType === 'receipt_uploaded' || eventType === 'receipt_reuploaded'
      ? '⚡ Please review and confirm/reject the receipt.'
      : eventType === 'receipt_rejected'
      ? '⚠️ The salesperson has been notified to re-upload.'
      : '',
  ].filter(Boolean).join('\n');
}

function deliveryEventMessage(eventType: string, metadata: Record<string, any>): string {
  const orderCode = metadata.order_code || '???';
  const customer = metadata.customer_name || 'Unknown';
  const amount = metadata.total_amount != null
    ? `BND ${Number(metadata.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
    : 'N/A';
  const payment = metadata.payment_method || 'N/A';

  const titles: Record<string, string> = {
    order_assigned: 'New Order Assigned',
    order_taken: 'Order Taken',
    order_delivered: 'Order Delivered',
    delivery_failed: 'Delivery Failed',
  };

  const title = titles[eventType] || 'Delivery Update';
  const emoji = eventType === 'order_delivered' ? '✅'
    : eventType === 'delivery_failed' ? '❌'
    : '📦';

  return [
    `${emoji} <b>${title}</b>`,
    '',
    `Order: <b>${orderCode}</b>`,
    `Customer: ${customer}`,
    `Amount: ${amount}`,
    `Payment: ${payment}`,
    '',
    eventType === 'order_assigned'
      ? '⚡ A new order needs delivery action.'
      : '',
  ].filter(Boolean).join('\n');
}

const RECEIPT_EVENTS = new Set(['receipt_uploaded', 'receipt_reuploaded', 'receipt_confirmed', 'receipt_rejected']);
const DELIVERY_EVENTS = new Set(['order_assigned', 'order_taken', 'order_delivered', 'delivery_failed']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── Get bot settings ──
    const { data: botSettings } = await supabase
      .from('telegram_bot_settings')
      .select('*')
      .limit(1)
      .single();

    if (!botSettings?.bot_token || !botSettings.bot_enabled) {
      return new Response(
        JSON.stringify({ success: false, error: 'Bot not configured or disabled' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const botToken = botSettings.bot_token;

    // ── Fetch unprocessed events (batch of 50) ──
    const { data: events, error: evError } = await supabase
      .from('telegram_event_queue')
      .select('*')
      .eq('processed', false)
      .order('created_at', { ascending: true })
      .limit(50);

    if (evError) throw evError;
    if (!events || events.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, reason: 'No pending events' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[send-telegram-event] Processing ${events.length} events`);

    // ── Pre-fetch all runner assistants ──
    const runnerIds = [...new Set(events.map((e: any) => e.runner_id).filter(Boolean))];
    let assistantsMap = new Map<string, any[]>(); // runner_id -> assistants[]

    if (runnerIds.length > 0) {
      const { data: assistants } = await supabase
        .from('runner_assistants')
        .select('assistant_id, runner_id, can_confirm_receipt, can_deliver')
        .eq('is_active', true)
        .in('runner_id', runnerIds);

      for (const a of (assistants || [])) {
        const list = assistantsMap.get(a.runner_id) || [];
        list.push(a);
        assistantsMap.set(a.runner_id, list);
      }
    }

    // ── Pre-fetch all user telegram settings + permissions ──
    const allUserIds = new Set<string>();
    for (const rId of runnerIds) {
      allUserIds.add(rId);
      const assistants = assistantsMap.get(rId) || [];
      for (const a of assistants) allUserIds.add(a.assistant_id);
    }

    const userIdList = [...allUserIds];
    let settingsMap = new Map<string, any>();
    let permissionsMap = new Map<string, any>();

    if (userIdList.length > 0) {
      const { data: settings } = await supabase
        .from('user_telegram_settings')
        .select('*')
        .eq('telegram_enabled', true)
        .not('chat_id', 'is', null)
        .in('user_id', userIdList);

      for (const s of (settings || [])) settingsMap.set(s.user_id, s);

      const { data: perms } = await supabase
        .from('telegram_notification_permissions')
        .select('*')
        .eq('admin_enabled', true)
        .in('user_id', userIdList);

      for (const p of (perms || [])) permissionsMap.set(p.user_id, p);
    }

    // ── Process each event ──
    let sentCount = 0;
    const processedIds: string[] = [];

    for (const event of events) {
      const { id, event_type, runner_id, metadata } = event;
      const isReceipt = RECEIPT_EVENTS.has(event_type);
      const isDelivery = DELIVERY_EVENTS.has(event_type);

      // Build message
      const message = isReceipt
        ? receiptEventMessage(event_type, metadata || {})
        : deliveryEventMessage(event_type, metadata || {});

      // Determine recipients: the runner + their assistants with matching permissions
      const recipients: string[] = [];

      // Runner always gets the notification
      if (runner_id) recipients.push(runner_id);

      // Assistants based on event type and permissions
      const assistants = runner_id ? (assistantsMap.get(runner_id) || []) : [];
      for (const a of assistants) {
        if (isReceipt && a.can_confirm_receipt) {
          recipients.push(a.assistant_id);
        }
        if (isDelivery && a.can_deliver) {
          recipients.push(a.assistant_id);
        }
      }

      // Send to each recipient who has telegram enabled + event preference
      for (const userId of recipients) {
        const setting = settingsMap.get(userId);
        const perm = permissionsMap.get(userId);
        if (!setting || !perm) continue;

        // Check event preference
        if (isReceipt && setting.receive_receipt_events === false) continue;
        if (isDelivery && setting.receive_delivery_events === false) continue;

        try {
          const result = await sendTelegramMessage(botToken, setting.chat_id, message);

          await supabase.from('telegram_notification_logs').insert({
            user_id: userId,
            chat_id: setting.chat_id,
            notification_type: `event_${event_type}`,
            status: result.ok ? 'success' : 'failed',
            error_message: result.ok ? null : (result.description || 'Unknown error'),
            message_preview: message.substring(0, 200),
          });

          if (result.ok) sentCount++;
        } catch (err) {
          console.error(`[send-telegram-event] Failed to send to ${userId}:`, err);
          await supabase.from('telegram_notification_logs').insert({
            user_id: userId,
            chat_id: setting.chat_id,
            notification_type: `event_${event_type}`,
            status: 'failed',
            error_message: err instanceof Error ? err.message : String(err),
            message_preview: message.substring(0, 200),
          });
        }
      }

      processedIds.push(id);
    }

    // ── Mark events as processed ──
    if (processedIds.length > 0) {
      await supabase
        .from('telegram_event_queue')
        .update({ processed: true })
        .in('id', processedIds);
    }

    console.log(`[send-telegram-event] Done: ${sentCount} messages sent, ${processedIds.length} events processed`);

    return new Response(
      JSON.stringify({ success: true, processed: processedIds.length, sent: sentCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('[send-telegram-event] error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
