import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';

const FUNCTION_VERSION = '20260806_telegram_driver_delivery_resilience_v1';
const DELIVERY_PHOTO_BUCKET = 'delivery-photos';
const TELEGRAM_MAX_ATTEMPTS = 3;
const TELEGRAM_RETRY_DELAYS_MS = [300, 900];

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

type RecipientKind = 'runner' | 'assistant' | 'order_owner' | 'team_manager';

interface TelegramResponse {
  ok: boolean;
  error_code?: number;
  description?: string;
  result?: {
    message_id?: number;
  };
}

interface TelegramDestination {
  id: string | null;
  user_id: string;
  chat_id: string;
  label: string;
}

interface QueueEvent {
  id: string;
  event_type: string;
  order_id: string;
  runner_id: string | null;
  metadata: Record<string, any> | null;
  created_at: string;
}

interface OrderRow {
  id: string;
  order_code: string | null;
  customer_name: string | null;
  total_amount: number | string | null;
  payment_method: string | null;
  driver_payment_method: string | null;
  driver_status: string | null;
  driver_delivered_at: string | null;
  driver_failed_reason: string | null;
  driver_failed_remark: string | null;
  driver_next_delivery_date: string | null;
  updated_at: string | null;
  driver_id: string | null;
  salesperson_id: string | null;
  order_owner_id: string | null;
  owner_salesperson_id_snapshot: string | null;
  owner_manager_id_snapshot: string | null;
}

interface AttachmentRow {
  order_id: string | null;
  url: string;
  uploaded_by: string;
  uploaded_at: string;
}

interface Recipient {
  userId: string;
  kind: RecipientKind;
}

interface SendTelegramEventRequest {
  event_id?: string;
  event_ids?: string[];
  order_id?: string;
  event_type?: string;
  limit?: number;
  drain?: boolean;
  trigger?: string;
}

const TELEGRAM_CHAT_ID_PATTERN = /^-?\d+$/;

function isRetryableTelegramResponse(status: number, response: TelegramResponse): boolean {
  return status === 429 || status >= 500 || response.error_code === 429 || (response.error_code || 0) >= 500;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callTelegram(
  botToken: string,
  method: string,
  payload: Record<string, unknown>,
): Promise<TelegramResponse> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < TELEGRAM_MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const response = await res.json() as TelegramResponse;

      if (res.ok || !isRetryableTelegramResponse(res.status, response) || attempt === TELEGRAM_MAX_ATTEMPTS - 1) {
        return response;
      }

      console.warn(`[send-telegram-event] Retrying Telegram ${method} after HTTP ${res.status}`);
    } catch (error) {
      lastError = error;
      if (attempt === TELEGRAM_MAX_ATTEMPTS - 1) throw error;
      console.warn(`[send-telegram-event] Retrying Telegram ${method} after transient network error`);
    }

    await wait(TELEGRAM_RETRY_DELAYS_MS[attempt] || TELEGRAM_RETRY_DELAYS_MS.at(-1)!);
  }

  throw lastError instanceof Error ? lastError : new Error('Telegram request failed');
}

async function sendTelegramMessage(botToken: string, chatId: string, text: string): Promise<TelegramResponse> {
  return callTelegram(botToken, 'sendMessage', {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
}

async function sendTelegramPhoto(botToken: string, chatId: string, photoUrl: string): Promise<TelegramResponse> {
  return callTelegram(botToken, 'sendPhoto', {
    chat_id: chatId,
    photo: photoUrl,
  });
}

async function sendTelegramMediaGroup(botToken: string, chatId: string, photoUrls: string[]): Promise<TelegramResponse> {
  return callTelegram(botToken, 'sendMediaGroup', {
    chat_id: chatId,
    media: photoUrls.map((url) => ({ type: 'photo', media: url })),
  });
}

function isInactiveDestinationError(description: string): boolean {
  const normalized = description.toLowerCase();
  return normalized.includes('chat not found')
    || normalized.includes('bot was kicked')
    || normalized.includes('user is deactivated')
    || normalized.includes('forbidden');
}

function extractStorageObjectPath(url: string, bucket: string): string | null {
  const marker = `/${bucket}/`;
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) return null;

  const pathWithQuery = url.slice(markerIndex + marker.length);
  const path = pathWithQuery.split('?')[0];
  return path ? decodeURIComponent(path) : null;
}

async function resolveTelegramPhotoUrl(supabase: any, url: string): Promise<string | null> {
  const objectPath = extractStorageObjectPath(url, DELIVERY_PHOTO_BUCKET);
  if (!objectPath) return url;

  const { data, error } = await supabase.storage
    .from(DELIVERY_PHOTO_BUCKET)
    .createSignedUrl(objectPath, 60 * 60);

  if (error || !data?.signedUrl) {
    console.warn('[send-telegram-event] Failed to sign delivery photo URL:', error?.message || 'No signed URL returned');
    return null;
  }

  return data.signedUrl;
}

async function resolveTelegramPhotoUrls(supabase: any, photos: AttachmentRow[]): Promise<string[]> {
  const resolved: string[] = [];

  for (const photo of photos) {
    if (!photo.url) continue;
    const signedUrl = await resolveTelegramPhotoUrl(supabase, photo.url);
    if (signedUrl) resolved.push(signedUrl);
  }

  return resolved;
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatAmount(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'BND 0.00';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'BND 0.00';
  return `BND ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatEventDate(value: unknown): string {
  const date = value ? new Date(String(value)) : new Date();
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Brunei',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function formatDeliveryDate(value: unknown): string {
  const raw = String(value || '').trim();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw)
    ? new Date(`${raw}T00:00:00+08:00`)
    : new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Brunei',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function getOwnerId(order: OrderRow): string | null {
  return order.order_owner_id || order.owner_salesperson_id_snapshot || order.salesperson_id || null;
}

function uniqueRecipients(recipients: Recipient[]): Recipient[] {
  const seen = new Set<string>();
  const unique: Recipient[] = [];

  for (const recipient of recipients) {
    const key = `${recipient.userId}:${recipient.kind}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(recipient);
  }

  return unique;
}

function receiptEventMessage(eventType: string, metadata: Record<string, any>): string {
  const orderCode = escapeHtml(metadata.order_code || 'Unknown order');
  const customer = escapeHtml(metadata.customer_name || 'Unknown customer');
  const amount = formatAmount(metadata.total_amount);
  const payment = escapeHtml(metadata.payment_method || 'N/A');

  const titles: Record<string, string> = {
    receipt_uploaded: 'New Receipt Uploaded',
    receipt_reuploaded: 'Receipt Re-uploaded',
    receipt_confirmed: 'Receipt Confirmed',
    receipt_rejected: 'Receipt Rejected',
  };

  return [
    `<b>${escapeHtml(titles[eventType] || 'Receipt Update')}</b>`,
    '',
    `Order: <b>${orderCode}</b>`,
    `Customer: ${customer}`,
    `Amount: ${amount}`,
    `Payment: ${payment}`,
  ].join('\n');
}

function deliveryEventMessage(eventType: string, metadata: Record<string, any>): string {
  const orderCode = escapeHtml(metadata.order_code || 'Unknown order');
  const customer = escapeHtml(metadata.customer_name || 'Unknown customer');
  const amount = formatAmount(metadata.total_amount);
  const payment = escapeHtml(metadata.payment_method || 'N/A');

  const titles: Record<string, string> = {
    order_assigned: 'New Order Assigned',
    order_taken: 'Order Taken',
    order_delivered: 'Order Delivered',
    delivery_failed: 'Delivery Failed',
  };

  return [
    `<b>${escapeHtml(titles[eventType] || 'Delivery Update')}</b>`,
    '',
    `Order: <b>${orderCode}</b>`,
    `Customer: ${customer}`,
    `Amount: ${amount}`,
    `Payment: ${payment}`,
  ].join('\n');
}

function driverEventMessage(event: QueueEvent, order: OrderRow): string {
  const metadata = event.metadata || {};
  const orderCode = escapeHtml(order.order_code || metadata.order_code || 'Unknown order');
  const eventDate = event.event_type === 'driver_delivered'
    ? formatEventDate(metadata.driver_delivered_at || order.driver_delivered_at || metadata.updated_at || order.updated_at || event.created_at)
    : formatEventDate(metadata.updated_at || order.updated_at || event.created_at);
  const amount = formatAmount(order.total_amount ?? metadata.total_amount);

  if (event.event_type === 'driver_failed') {
    const reason = order.driver_failed_reason || metadata.driver_failed_reason || '';
    const remark = order.driver_failed_remark || metadata.driver_failed_remark || '';
    const nextDeliveryDate = order.driver_next_delivery_date
      || metadata.driver_next_delivery_date
      || '';
    const normalizedReason = reason.trim().toLowerCase();

    if (
      normalizedReason === 'delivery tomorrow'
      || (
        normalizedReason === 'customer requested reschedule'
        && metadata.delivery_timing === 'tomorrow'
      )
    ) {
      return [
        `<b>${orderCode}</b>`,
        '',
        'Delivery Tomorrow',
        formatDeliveryDate(nextDeliveryDate),
        'Deliver again tomorrow',
      ].join('\n');
    }

    if (normalizedReason === 'customer requested reschedule' && nextDeliveryDate) {
      return [
        `<b>${orderCode}</b>`,
        '',
        'Rescheduled',
        'New Delivery Date:',
        formatDeliveryDate(nextDeliveryDate),
      ].join('\n');
    }

    const remarkLine = [reason, remark].filter(Boolean).join(' / ') || 'No remark';

    return [
      `<b>${orderCode}</b>`,
      '',
      'Failed Delivery',
      eventDate,
      `Remark: ${escapeHtml(remarkLine)}`,
    ].join('\n');
  }

  return [
    `<b>${orderCode}</b>`,
    '',
    'Delivered',
    eventDate,
    `Amount: ${amount}`,
  ].join('\n');
}

const RECEIPT_EVENTS = new Set(['receipt_uploaded', 'receipt_reuploaded', 'receipt_confirmed', 'receipt_rejected']);
const DELIVERY_EVENTS = new Set(['order_assigned', 'order_taken', 'order_delivered', 'delivery_failed']);
const DRIVER_EVENTS = new Set(['driver_delivered', 'driver_failed']);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let requestBody: SendTelegramEventRequest = {};
    try {
      requestBody = await req.json();
    } catch {
      requestBody = {};
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: botSettings } = await supabase
      .from('telegram_bot_settings')
      .select('*')
      .limit(1)
      .single();

    if (!botSettings?.bot_token || !botSettings.bot_enabled) {
      return new Response(
        JSON.stringify({ success: false, error: 'Bot not configured or disabled' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const botToken = botSettings.bot_token;

    const eventIds = Array.isArray(requestBody.event_ids)
      ? [...new Set(requestBody.event_ids.map((id) => String(id).trim()).filter(Boolean))]
      : [];
    const eventLimit = requestBody.event_id || eventIds.length > 0 || requestBody.order_id
      ? Math.min(Math.max(Number(requestBody.limit || 5), 1), 10)
      : requestBody.drain === true
        ? Math.min(Math.max(Number(requestBody.limit || 10), 1), 10)
        : Math.min(Math.max(Number(requestBody.limit || 3), 1), 3);

    let eventQuery = supabase
      .from('telegram_event_queue')
      .select('*')
      .eq('processed', false)
      .order('created_at', { ascending: true })
      .limit(eventLimit);

    if (requestBody.event_id) {
      eventQuery = eventQuery.eq('id', requestBody.event_id);
    } else if (eventIds.length > 0) {
      eventQuery = eventQuery.in('id', eventIds.slice(0, eventLimit));
    } else if (requestBody.order_id) {
      eventQuery = eventQuery.eq('order_id', requestBody.order_id);
      if (requestBody.event_type) {
        eventQuery = eventQuery.eq('event_type', requestBody.event_type);
      }
    } else if (requestBody.event_type) {
      eventQuery = eventQuery.eq('event_type', requestBody.event_type);
    }

    const { data: rawEvents, error: evError } = await eventQuery;

    if (evError) throw evError;

    const events = (rawEvents || []) as QueueEvent[];
    if (events.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, reason: 'No pending events', version: FUNCTION_VERSION }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[send-telegram-event] Processing ${events.length} events`);

    const runnerIds = [...new Set(events.map((event) => event.runner_id).filter(Boolean))] as string[];
    const assistantsMap = new Map<string, any[]>();

    if (runnerIds.length > 0) {
      const { data: assistants } = await supabase
        .from('runner_assistants')
        .select('assistant_id, runner_id, can_confirm_receipt, can_deliver')
        .eq('is_active', true)
        .in('runner_id', runnerIds);

      for (const assistant of (assistants || [])) {
        const list = assistantsMap.get(assistant.runner_id) || [];
        list.push(assistant);
        assistantsMap.set(assistant.runner_id, list);
      }
    }

    const driverEvents = events.filter((event) => DRIVER_EVENTS.has(event.event_type));
    const driverOrderIds = [...new Set(driverEvents.map((event) => event.order_id).filter(Boolean))];
    const driverOrderMap = new Map<string, OrderRow>();
    const attachmentMap = new Map<string, AttachmentRow[]>();
    const driverRecipientsMap = new Map<string, Recipient[]>();
    const profileMap = new Map<string, any>();

    if (driverOrderIds.length > 0) {
      const { data: orderRows, error: orderError } = await supabase
        .from('orders')
        .select(`
          id,
          order_code,
          customer_name,
          total_amount,
          payment_method,
          driver_payment_method,
          driver_status,
          driver_delivered_at,
          driver_failed_reason,
          driver_failed_remark,
          driver_next_delivery_date,
          updated_at,
          driver_id,
          salesperson_id,
          order_owner_id,
          owner_salesperson_id_snapshot,
          owner_manager_id_snapshot
        `)
        .in('id', driverOrderIds);

      if (orderError) throw orderError;
      for (const order of (orderRows || []) as OrderRow[]) {
        driverOrderMap.set(order.id, order);
      }

      const { data: attachmentRows } = await supabase
        .from('attachments')
        .select('order_id, url, uploaded_by, uploaded_at')
        .eq('type', 'delivery_photo')
        .in('order_id', driverOrderIds)
        .order('uploaded_at', { ascending: true });

      for (const attachment of (attachmentRows || []) as AttachmentRow[]) {
        if (!attachment.order_id) continue;
        const list = attachmentMap.get(attachment.order_id) || [];
        list.push(attachment);
        attachmentMap.set(attachment.order_id, list);
      }

      const ownerIds = new Set<string>();
      const initialManagerIdsByOwner = new Map<string, Set<string>>();

      for (const order of driverOrderMap.values()) {
        const ownerId = getOwnerId(order);
        if (!ownerId) continue;

        ownerIds.add(ownerId);
        if (order.owner_manager_id_snapshot) {
          const managerIds = initialManagerIdsByOwner.get(ownerId) || new Set<string>();
          managerIds.add(order.owner_manager_id_snapshot);
          initialManagerIdsByOwner.set(ownerId, managerIds);
        }
      }

      if (ownerIds.size > 0) {
        const { data: ownerProfiles } = await supabase
          .from('profiles')
          .select('id, role, manager_id')
          .in('id', [...ownerIds]);

        for (const profile of (ownerProfiles || [])) {
          profileMap.set(profile.id, profile);
          if (profile.manager_id) {
            const managerIds = initialManagerIdsByOwner.get(profile.id) || new Set<string>();
            managerIds.add(profile.manager_id);
            initialManagerIdsByOwner.set(profile.id, managerIds);
          }
        }

        const { data: bindings } = await supabase
          .from('manager_salesperson_bindings')
          .select('manager_id, salesperson_id')
          .eq('active', true)
          .in('salesperson_id', [...ownerIds]);

        for (const binding of (bindings || [])) {
          const managerIds = initialManagerIdsByOwner.get(binding.salesperson_id) || new Set<string>();
          managerIds.add(binding.manager_id);
          initialManagerIdsByOwner.set(binding.salesperson_id, managerIds);
        }

        const managerIds = [...new Set([...initialManagerIdsByOwner.values()].flatMap((ids) => [...ids]))];
        if (managerIds.length > 0) {
          const { data: managerProfiles } = await supabase
            .from('profiles')
            .select('id, role, manager_id')
            .in('id', managerIds);

          for (const profile of (managerProfiles || [])) {
            profileMap.set(profile.id, profile);
          }
        }
      }

      for (const event of driverEvents) {
        const order = driverOrderMap.get(event.order_id);
        if (!order) continue;

        const recipients: Recipient[] = [];
        const ownerId = getOwnerId(order);
        if (ownerId) {
          recipients.push({ userId: ownerId, kind: 'order_owner' });
          for (const managerId of (initialManagerIdsByOwner.get(ownerId) || [])) {
            if (managerId !== ownerId) {
              recipients.push({ userId: managerId, kind: 'team_manager' });
            }
          }
        }

        driverRecipientsMap.set(event.id, uniqueRecipients(recipients));
      }
    }

    const allUserIds = new Set<string>();
    for (const runnerId of runnerIds) {
      allUserIds.add(runnerId);
      const assistants = assistantsMap.get(runnerId) || [];
      for (const assistant of assistants) allUserIds.add(assistant.assistant_id);
    }
    for (const recipients of driverRecipientsMap.values()) {
      for (const recipient of recipients) allUserIds.add(recipient.userId);
    }

    const userIdList = [...allUserIds];
    const settingsMap = new Map<string, any>();
    const destinationsMap = new Map<string, TelegramDestination[]>();

    if (userIdList.length > 0) {
      const { data: settings } = await supabase
        .from('user_telegram_settings')
        .select('*')
        .eq('telegram_enabled', true)
        .in('user_id', userIdList);

      for (const setting of (settings || [])) {
        settingsMap.set(setting.user_id, setting);
      }

      const { data: destinations } = await supabase
        .from('user_telegram_destinations')
        .select('id, user_id, chat_id, label')
        .in('user_id', userIdList)
        .eq('active', true)
        .not('verified_at', 'is', null)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });

      for (const destination of (destinations || []) as TelegramDestination[]) {
        const userDestinations = destinationsMap.get(destination.user_id) || [];
        userDestinations.push(destination);
        destinationsMap.set(destination.user_id, userDestinations);
      }

      for (const setting of (settings || [])) {
        if (destinationsMap.has(setting.user_id)) continue;
        const legacyChatId = String(setting.chat_id || '').trim();
        if (!TELEGRAM_CHAT_ID_PATTERN.test(legacyChatId)) continue;
        destinationsMap.set(setting.user_id, [{
          id: null,
          user_id: setting.user_id,
          chat_id: legacyChatId,
          label: 'Primary Telegram',
        }]);
      }

      const missingProfiles = userIdList.filter((userId) => !profileMap.has(userId));
      if (missingProfiles.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, role, manager_id')
          .in('id', missingProfiles);

        for (const profile of (profiles || [])) {
          profileMap.set(profile.id, profile);
        }
      }
    }

    let sentCount = 0;
    const processedIds: string[] = [];

    for (const event of events) {
      const { id, event_type, runner_id, metadata } = event;
      const isReceipt = RECEIPT_EVENTS.has(event_type);
      const isDelivery = DELIVERY_EVENTS.has(event_type);
      const isDriver = DRIVER_EVENTS.has(event_type);

      let message = '';
      let recipients: Recipient[] = [];
      let photos: AttachmentRow[] = [];
      let logOrderId: string | null = event.order_id || metadata?.order_id || null;
      let logOrderRef: string | null = metadata?.order_code || metadata?.order_ref || null;

      if (isDriver) {
        const order = driverOrderMap.get(event.order_id);
        if (!order) {
          processedIds.push(id);
          continue;
        }
        logOrderRef = order.order_code;

        const driverId = order.driver_id || metadata?.driver_id || null;
        const eventTime = new Date(event.created_at).getTime();
        const orderPhotos = attachmentMap.get(event.order_id) || [];
        const recentPhotos = orderPhotos.filter((attachment) => {
          const uploadedAt = new Date(attachment.uploaded_at).getTime();
          const withinWindow = uploadedAt >= eventTime - 30 * 60 * 1000 && uploadedAt <= eventTime + 5 * 60 * 1000;
          return withinWindow && (!driverId || attachment.uploaded_by === driverId);
        });
        const driverPhotos = orderPhotos.filter((attachment) => !driverId || attachment.uploaded_by === driverId);

        message = driverEventMessage(event, order);
        recipients = driverRecipientsMap.get(id) || [];
        photos = recentPhotos.length > 0 ? recentPhotos : driverPhotos;
      } else if (isReceipt || isDelivery) {
        message = isReceipt
          ? receiptEventMessage(event_type, metadata || {})
          : deliveryEventMessage(event_type, metadata || {});

        if (runner_id) recipients.push({ userId: runner_id, kind: 'runner' });

        const assistants = runner_id ? (assistantsMap.get(runner_id) || []) : [];
        for (const assistant of assistants) {
          if (isReceipt && assistant.can_confirm_receipt) {
            recipients.push({ userId: assistant.assistant_id, kind: 'assistant' });
          }
          if (isDelivery && assistant.can_deliver) {
            recipients.push({ userId: assistant.assistant_id, kind: 'assistant' });
          }
        }
      } else {
        processedIds.push(id);
        continue;
      }

      const sentChatIdsForEvent = new Set<string>();
      let eventHadFailure = false;

      for (const recipient of uniqueRecipients(recipients)) {
        const setting = settingsMap.get(recipient.userId);
        if (!setting) continue;

        if (isReceipt && setting.receive_receipt_events === false) continue;
        if (isDelivery && setting.receive_delivery_events === false) continue;
        if (isDriver) {
          if (event_type === 'driver_delivered' && setting.receive_delivered_order === false) continue;
          if (event_type === 'driver_failed' && setting.receive_failed_delivery === false) continue;
          if (recipient.kind === 'order_owner' && setting.receive_delivery_events === false) continue;
          if (recipient.kind === 'team_manager') {
            const wantsTeamUpdates = setting.receive_team_order_updates === true
              || setting.receive_team_delivery_events === true;
            if (!wantsTeamUpdates) continue;
          }
        }

        const userDestinations = destinationsMap.get(recipient.userId) || [];
        for (const destination of userDestinations) {
          const chatId = destination.chat_id.trim();
          if (!TELEGRAM_CHAT_ID_PATTERN.test(chatId)) continue;
          if (sentChatIdsForEvent.has(chatId)) continue;
          sentChatIdsForEvent.add(chatId);

          const deliveryKey = `event:${id}:${chatId}`;
          const { data: claims, error: claimError } = await supabase.rpc(
            'claim_telegram_notification_delivery',
            {
              p_delivery_key: deliveryKey,
              p_user_id: recipient.userId,
              p_destination_id: destination.id,
              p_chat_id: chatId,
              p_notification_type: `event_${event_type}`,
              p_message_preview: message.substring(0, 200),
              p_order_id: logOrderId,
              p_order_ref: logOrderRef,
              p_recipient_role: recipient.kind,
              p_event_id: id,
            },
          );
          if (claimError) {
            eventHadFailure = true;
            console.error(`[send-telegram-event] Failed to claim ${deliveryKey}:`, claimError.message);
            continue;
          }

          const claim = claims?.[0];
          if (!claim?.should_send) {
            if (claim?.delivery_status !== 'success') eventHadFailure = true;
            continue;
          }

          const errors: string[] = [];
          let inactiveDestination = false;
          try {
            const photoUrls = isDriver
              ? await resolveTelegramPhotoUrls(supabase, photos)
              : photos.map((photo) => photo.url).filter(Boolean);

            for (let i = 0; i < photoUrls.length; i += 10) {
              const batch = photoUrls.slice(i, i + 10);
              if (batch.length > 1) {
                const groupResult = await sendTelegramMediaGroup(botToken, chatId, batch);
                if (groupResult.ok) continue;
                const description = groupResult.description || 'Media group send failed';
                if (isInactiveDestinationError(description)) {
                  inactiveDestination = true;
                  errors.push(description);
                  break;
                }
                console.warn('[send-telegram-event] Media group failed, falling back to individual photos:', description);
              }

              for (const photoUrl of batch) {
                const photoResult = await sendTelegramPhoto(botToken, chatId, photoUrl);
                if (!photoResult.ok) {
                  const description = photoResult.description || 'Photo send failed';
                  errors.push(description);
                  if (isInactiveDestinationError(description)) {
                    inactiveDestination = true;
                    break;
                  }
                }
              }

              if (inactiveDestination) break;
            }

            let messageResult: TelegramResponse = { ok: false };
            if (!inactiveDestination) {
              messageResult = await sendTelegramMessage(botToken, chatId, message);
              if (!messageResult.ok) {
                const description = messageResult.description || 'Message send failed';
                errors.push(description);
                if (isInactiveDestinationError(description)) inactiveDestination = true;
              }
            }

            const ok = errors.length === 0;
            await supabase
              .from('telegram_notification_logs')
              .update({
                status: ok ? 'success' : 'failed',
                error_message: ok ? null : errors.join('; '),
                telegram_message_id: messageResult.result?.message_id ? String(messageResult.result.message_id) : null,
                sent_at: new Date().toISOString(),
              })
              .eq('id', claim.log_id);

            if (inactiveDestination) {
              const destinationUpdate = destination.id
                ? supabase
                  .from('user_telegram_destinations')
                  .update({ active: false, is_primary: false, updated_at: new Date().toISOString() })
                  .eq('id', destination.id)
                  .eq('chat_id', chatId)
                : supabase
                  .from('user_telegram_settings')
                  .update({ chat_id: null, telegram_enabled: false, updated_at: new Date().toISOString() })
                  .eq('user_id', recipient.userId)
                  .eq('chat_id', chatId);
              await destinationUpdate;
              if (destination.id) {
                await supabase.rpc('sync_primary_telegram_chat_id', { p_user_id: recipient.userId });
              }
              console.warn(`[send-telegram-event] Deactivated unreachable Telegram destination ${chatId}`);
            } else if (ok) {
              sentCount++;
            } else {
              eventHadFailure = true;
            }
          } catch (err) {
            eventHadFailure = true;
            console.error(`[send-telegram-event] Failed to send to ${recipient.userId}:`, err);
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

      if (!eventHadFailure) processedIds.push(id);
    }

    if (processedIds.length > 0) {
      await supabase
        .from('telegram_event_queue')
        .update({ processed: true })
        .in('id', processedIds);
    }

    console.log(`[send-telegram-event] Done: ${sentCount} messages sent, ${processedIds.length} events processed`);

    return new Response(
      JSON.stringify({ success: true, processed: processedIds.length, sent: sentCount, version: FUNCTION_VERSION }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[send-telegram-event] error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
