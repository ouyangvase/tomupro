import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.89.0';
import {
  validateDriverTelegramSource,
  type DriverDeliveryAttemptSource,
} from '../_shared/driverTelegramSource.ts';
import {
  driverEventMessage,
  escapeHtml,
  formatAmount,
  type DriverTelegramMessageAttempt,
} from '../_shared/driverEventMessage.ts';
const FUNCTION_VERSION = '20260823_telegram_driver_delivery_retry_hardened_v1';
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
  http_status?: number;
  parameters?: { retry_after?: number };
  result?: { message_id?: number } | Array<{ message_id?: number }>;
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
  next_retry_at?: string | null;
  delivery_attempt_id: string | null;
  active_assignment_id: string | null;
  driver_id: string | null;
  event_source: string | null;
  source_function: string | null;
  submitted_at: string | null;
  notification_attempt_count?: number | null;
  driver_submitted_at?: string | null;
  event_created_at?: string | null;
  processor_started_at?: string | null;
  telegram_attempt_at?: string | null;
  telegram_success_at?: string | null;
}

type DriverAuditStatus = 'pending' | 'retrying' | 'success' | 'failed' | 'skipped';

interface DriverEventState {
  status: DriverAuditStatus;
  reason: string;
  eligible_recipient_count: number;
  subscribed_recipient_count: number;
  destination_count: number;
  send_attempt_count: number;
  success_count: number;
  failed_count: number;
  attempt_count: number;
  last_error?: string | null;
  next_retry_at?: string | null;
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

interface PhotoReferenceRecord {
  url?: unknown;
  public_url?: unknown;
  signed_url?: unknown;
  signedUrl?: unknown;
  path?: unknown;
  storage_path?: unknown;
  bucket?: unknown;
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
  driver_only?: boolean;
  trigger?: string;
}

const TELEGRAM_CHAT_ID_PATTERN = /^-?\d+$/;

function isRetryableTelegramResponse(status: number, response: TelegramResponse): boolean {
  return status === 429 || status >= 500 || response.error_code === 429 || (response.error_code || 0) >= 500;
}

function getTelegramRetryAfterSeconds(response: TelegramResponse): number | null {
  const retryAfter = Number(response.parameters?.retry_after);
  return Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null;
}

function mergeRetryAfterSeconds(
  current: number | null,
  response: TelegramResponse,
): number | null {
  const next = getTelegramRetryAfterSeconds(response);
  if (next === null) return current;
  return Math.max(current || 0, next);
}

function getTelegramMessageId(response: TelegramResponse): string | null {
  const result = response.result;
  const messageId = Array.isArray(result) ? result[0]?.message_id : result?.message_id;
  return messageId ? String(messageId) : null;
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

      if (res.ok || res.status === 429 || response.error_code === 429
        || !isRetryableTelegramResponse(res.status, response)
        || attempt === TELEGRAM_MAX_ATTEMPTS - 1) {
        return { ...response, http_status: res.status };
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

async function sendTelegramPhoto(
  botToken: string,
  chatId: string,
  photoUrl: string,
  caption?: string,
): Promise<TelegramResponse> {
  return callTelegram(botToken, 'sendPhoto', {
    chat_id: chatId,
    photo: photoUrl,
    ...(caption ? { caption, parse_mode: 'HTML' } : {}),
  });
}

async function sendTelegramMediaGroup(
  botToken: string,
  chatId: string,
  photoUrls: string[],
  caption?: string,
): Promise<TelegramResponse> {
  return callTelegram(botToken, 'sendMediaGroup', {
    chat_id: chatId,
    media: photoUrls.map((url, index) => ({
      type: 'photo',
      media: url,
      ...(caption && index === 0 ? { caption, parse_mode: 'HTML' } : {}),
    })),
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

function storagePathToPublicUrl(path: string, bucket: string): string {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  if (!supabaseUrl) return path;

  const encodedPath = path.split('/').map((part) => encodeURIComponent(part)).join('/');
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${encodedPath}`;
}

function normalizeProofPhotos(
  value: unknown,
  orderId: string,
  uploadedBy: string,
  uploadedAt: string,
): AttachmentRow[] {
  if (!Array.isArray(value)) return [];

  return value.flatMap((entry) => {
    const record: PhotoReferenceRecord = typeof entry === 'string'
      ? { url: entry }
      : entry && typeof entry === 'object'
        ? entry as PhotoReferenceRecord
        : {};
    const bucket = typeof record.bucket === 'string' && record.bucket.trim()
      ? record.bucket.trim()
      : DELIVERY_PHOTO_BUCKET;
    const rawUrl = [record.url, record.public_url, record.signed_url, record.signedUrl]
      .find((candidate) => typeof candidate === 'string' && candidate.trim()) as string | undefined;
    const rawPath = [record.path, record.storage_path]
      .find((candidate) => typeof candidate === 'string' && candidate.trim()) as string | undefined;
    const url = rawUrl?.trim() || (rawPath ? storagePathToPublicUrl(rawPath.trim(), bucket) : '');

    return url
      ? [{ order_id: orderId, url, uploaded_by: uploadedBy, uploaded_at: uploadedAt }]
      : [];
  });
}

function isRetryableTelegramResult(response: TelegramResponse): boolean {
  const status = response.http_status || 0;
  return isRetryableTelegramResponse(status, response);
}

function getRetryAt(attemptCount: number, retryAfterSeconds: number | null = null): string {
  const delayMinutes = Math.min(30, Math.max(1, 2 ** Math.min(attemptCount, 5)));
  const delayMs = Math.max(
    delayMinutes * 60 * 1000,
    (retryAfterSeconds || 0) * 1000,
  );
  return new Date(Date.now() + delayMs).toISOString();
}

async function updateDriverEventState(
  supabase: any,
  eventId: string,
  state: DriverEventState,
): Promise<void> {
  const { error } = await supabase.rpc('set_telegram_driver_event_state', {
    p_event_id: eventId,
    p_status: state.status,
    p_reason: state.reason,
    p_eligible_recipient_count: state.eligible_recipient_count,
    p_subscribed_recipient_count: state.subscribed_recipient_count,
    p_destination_count: state.destination_count,
    p_send_attempt_count: state.send_attempt_count,
    p_success_count: state.success_count,
    p_failed_count: state.failed_count,
    p_attempt_count: state.attempt_count,
    p_last_error: state.last_error || null,
    p_next_retry_at: state.next_retry_at || null,
  });

  if (error) {
    throw new Error(`Failed to persist Telegram driver event ${eventId}: ${error.message}`);
  }
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

    const { data: botSettings, error: botSettingsError } = await supabase
      .from('telegram_bot_settings')
      .select('*')
      .limit(1)
      .single();

    if (botSettingsError) {
      throw new Error(`Telegram bot settings read failed: ${botSettingsError.message}`);
    }

    if (!botSettings?.bot_token || !botSettings.bot_enabled) {
      const reason = 'telegram_bot_not_configured_or_disabled';
      await supabase
        .from('telegram_driver_event_audit')
        .update({ reason, updated_at: new Date().toISOString() })
        .eq('status', 'pending');
      await supabase
        .from('telegram_event_queue')
        .update({ notification_reason: reason })
        .eq('processed', false)
        .in('event_type', ['driver_delivered', 'driver_failed']);
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
      ? Math.min(Math.max(Number(requestBody.limit || 5), 1), 25)
      : requestBody.driver_only || requestBody.drain === true
        ? Math.min(Math.max(Number(requestBody.limit || 25), 1), 25)
        : Math.min(Math.max(Number(requestBody.limit || 10), 1), 10);
    const requestedEventIds = eventIds.length > 0
      ? eventIds.slice(0, eventLimit)
      : requestBody.event_id
        ? [requestBody.event_id]
        : null;

    const { data: rawEvents, error: evError } = await supabase.rpc('claim_telegram_event_batch', {
      p_limit: eventLimit,
      p_event_type: requestBody.event_type || null,
      p_event_id: requestBody.event_id || null,
      p_driver_only: requestBody.driver_only === true,
      p_order_id: requestBody.order_id || null,
      p_event_ids: requestedEventIds,
    });

    if (evError) throw evError;

    const events = (rawEvents || []) as QueueEvent[];
    if (events.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, reason: 'No pending events', version: FUNCTION_VERSION }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[send-telegram-event] Processing ${events.length} claimed events`, JSON.stringify({
      trigger: requestBody.trigger || 'unknown',
      driver_only: requestBody.driver_only === true,
      event_type: requestBody.event_type || null,
    }));

    const driverEventIds = events
      .filter((event) => DRIVER_EVENTS.has(event.event_type))
      .map((event) => event.id);
    const driverAttemptMap = new Map<string, number>();
    const deliveryAttemptMap = new Map<string, DriverDeliveryAttemptSource>();
    const latestDeliveryAttemptMap = new Map<string, { id: string; submitted_at: string }>();
    const driverNameMap = new Map<string, string>();
    if (driverEventIds.length > 0) {
      const { data: driverAuditRows, error: driverAuditError } = await supabase
        .from('telegram_driver_event_audit')
        .select('event_id, attempt_count')
        .in('event_id', driverEventIds);
      if (driverAuditError) {
        throw new Error(`Driver event audit read failed: ${driverAuditError.message}`);
      }
      for (const row of driverAuditRows || []) {
        driverAttemptMap.set(row.event_id, Number(row.attempt_count || 0));
      }

      for (const event of events) {
        if (!DRIVER_EVENTS.has(event.event_type)) continue;
        driverAttemptMap.set(
          event.id,
          Math.max(driverAttemptMap.get(event.id) || 0, Number(event.notification_attempt_count || 0)),
        );
      }

      const deliveryAttemptIds = [...new Set(events
        .filter((event) => DRIVER_EVENTS.has(event.event_type) && event.delivery_attempt_id)
        .map((event) => event.delivery_attempt_id as string))];
      if (deliveryAttemptIds.length > 0) {
        const { data: deliveryAttempts, error: deliveryAttemptError } = await supabase
          .from('delivery_attempts')
          .select('id, order_id, active_assignment_id, driver_id, result_type, failure_reason, remark, reschedule_date, submitted_at, superseded_at, proof_images')
          .in('id', deliveryAttemptIds);
        if (deliveryAttemptError) {
          throw new Error(`Delivery attempt source read failed: ${deliveryAttemptError.message}`);
        }
        for (const attempt of (deliveryAttempts || []) as DriverDeliveryAttemptSource[]) {
          deliveryAttemptMap.set(attempt.id, attempt);
        }

        const sourceOrderIds = [...new Set((deliveryAttempts || []).map((attempt) => attempt.order_id))];
        if (sourceOrderIds.length > 0) {
          const { data: laterAttempts, error: laterAttemptsError } = await supabase
            .from('delivery_attempts')
            .select('id, order_id, submitted_at')
            .in('order_id', sourceOrderIds)
            .order('submitted_at', { ascending: false });
          if (laterAttemptsError) {
            throw new Error(`Latest delivery attempt read failed: ${laterAttemptsError.message}`);
          }
          for (const attempt of laterAttempts || []) {
            if (!latestDeliveryAttemptMap.has(attempt.order_id)) {
              latestDeliveryAttemptMap.set(attempt.order_id, {
                id: attempt.id,
                submitted_at: attempt.submitted_at,
              });
            }
          }
        }
      }
    }

    const driverIds = [...new Set([...deliveryAttemptMap.values()].map((attempt) => attempt.driver_id).filter(Boolean))];
    if (driverIds.length > 0) {
      const { data: driverProfiles, error: driverProfileError } = await supabase
        .from('profiles')
        .select('id, display_name, email')
        .in('id', driverIds);
      if (driverProfileError) {
        throw new Error(`Driver profile read failed: ${driverProfileError.message}`);
      }
      for (const profile of driverProfiles || []) {
        const displayName = String(profile.display_name || profile.email || '').trim();
        if (displayName) driverNameMap.set(profile.id, displayName);
      }
    }

    const invalidDriverEventIds = new Set<string>();
    for (const event of events.filter((candidate) => DRIVER_EVENTS.has(candidate.event_type))) {
      const sourceAttempt = event.delivery_attempt_id
        ? deliveryAttemptMap.get(event.delivery_attempt_id)
        : null;
      const latestAttempt = sourceAttempt ? latestDeliveryAttemptMap.get(sourceAttempt.order_id) : null;
      const validation = latestAttempt
        && sourceAttempt
        && latestAttempt.id !== sourceAttempt.id
        && new Date(latestAttempt.submitted_at).getTime() > new Date(sourceAttempt.submitted_at).getTime()
        ? { valid: false as const, reason: 'superseded_by_later_driver_attempt' }
        : validateDriverTelegramSource(event, sourceAttempt);
      if (validation.valid) continue;

      invalidDriverEventIds.add(event.id);
      await updateDriverEventState(supabase, event.id, {
        status: 'skipped',
        reason: validation.reason,
        eligible_recipient_count: 0,
        subscribed_recipient_count: 0,
        destination_count: 0,
        send_attempt_count: 0,
        success_count: 0,
        failed_count: 0,
        attempt_count: driverAttemptMap.get(event.id) || 0,
        last_error: validation.reason,
        next_retry_at: null,
      });
    }

    const validEvents = events.filter((event) => !invalidDriverEventIds.has(event.id));

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

    const driverEvents = validEvents.filter((event) => DRIVER_EVENTS.has(event.event_type));
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
        const { data: ownerProfiles, error: ownerProfilesError } = await supabase
          .from('profiles')
          .select('id, role, manager_id')
          .in('id', [...ownerIds]);

        if (ownerProfilesError) {
          throw new Error(`Owner profile read failed: ${ownerProfilesError.message}`);
        }

        for (const profile of (ownerProfiles || [])) {
          profileMap.set(profile.id, profile);
          if (profile.manager_id) {
            const managerIds = initialManagerIdsByOwner.get(profile.id) || new Set<string>();
            managerIds.add(profile.manager_id);
            initialManagerIdsByOwner.set(profile.id, managerIds);
          }
        }

        const { data: bindings, error: bindingsError } = await supabase
          .from('manager_salesperson_bindings')
          .select('manager_id, salesperson_id')
          .eq('active', true)
          .in('salesperson_id', [...ownerIds]);

        if (bindingsError) {
          throw new Error(`Manager binding read failed: ${bindingsError.message}`);
        }

        for (const binding of (bindings || [])) {
          const managerIds = initialManagerIdsByOwner.get(binding.salesperson_id) || new Set<string>();
          managerIds.add(binding.manager_id);
          initialManagerIdsByOwner.set(binding.salesperson_id, managerIds);
        }

        const managerIds = [...new Set([...initialManagerIdsByOwner.values()].flatMap((ids) => [...ids]))];
        if (managerIds.length > 0) {
          const { data: managerProfiles, error: managerProfilesError } = await supabase
            .from('profiles')
            .select('id, role, manager_id')
            .in('id', managerIds);

          if (managerProfilesError) {
            throw new Error(`Manager profile read failed: ${managerProfilesError.message}`);
          }

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
      const { data: settings, error: settingsError } = await supabase
        .from('user_telegram_settings')
        .select('*')
        .eq('telegram_enabled', true)
        .in('user_id', userIdList);

      if (settingsError) {
        throw new Error(`Telegram settings read failed: ${settingsError.message}`);
      }

      for (const setting of (settings || [])) {
        settingsMap.set(setting.user_id, setting);
      }

      const { data: destinations, error: destinationsError } = await supabase
        .from('user_telegram_destinations')
        .select('id, user_id, chat_id, label')
        .in('user_id', userIdList)
        .eq('active', true)
        .not('verified_at', 'is', null)
        .order('is_primary', { ascending: false })
        .order('created_at', { ascending: true });

      if (destinationsError) {
        throw new Error(`Telegram destination read failed: ${destinationsError.message}`);
      }

      for (const destination of (destinations || []) as TelegramDestination[]) {
        const userDestinations = destinationsMap.get(destination.user_id) || [];
        userDestinations.push(destination);
        destinationsMap.set(destination.user_id, userDestinations);
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

    for (const event of validEvents) {
      const { id, event_type, runner_id, metadata } = event;
      const isReceipt = RECEIPT_EVENTS.has(event_type);
      const isDelivery = DELIVERY_EVENTS.has(event_type);
      const isDriver = DRIVER_EVENTS.has(event_type);
      const attemptCount = isDriver
        ? Math.max(1, driverAttemptMap.get(id) || Number(event.notification_attempt_count || 0))
        : 0;

      let message = '';
      let recipients: Recipient[] = [];
      let photos: AttachmentRow[] = [];
      let logOrderId: string | null = event.order_id || metadata?.order_id || null;
      let logOrderRef: string | null = metadata?.order_code || metadata?.order_ref || null;

      if (isDriver) {
        const order = driverOrderMap.get(event.order_id);
        if (!order) {
          await updateDriverEventState(supabase, id, {
            status: 'failed',
            reason: 'order_not_found_when_sender_loaded_event',
            eligible_recipient_count: 0,
            subscribed_recipient_count: 0,
            destination_count: 0,
            send_attempt_count: 0,
            success_count: 0,
            failed_count: 1,
            attempt_count: attemptCount,
            last_error: 'The order referenced by the Driver event no longer exists',
          });
          continue;
        }

        logOrderRef = order.order_code;
        const deliveryAttempt = event.delivery_attempt_id
          ? deliveryAttemptMap.get(event.delivery_attempt_id)
          : null;
        const driverId = deliveryAttempt?.driver_id || order.driver_id || metadata?.driver_id || null;
        const driverName = (driverId ? driverNameMap.get(driverId) : null)
          || (typeof metadata?.driver_name === 'string' ? metadata.driver_name : null);
        const proofSnapshot = deliveryAttempt?.proof_images ?? metadata?.proof_images;
        const proofSnapshotPhotos = normalizeProofPhotos(
          proofSnapshot,
          event.order_id,
          deliveryAttempt?.driver_id || driverId || '',
          deliveryAttempt?.submitted_at || event.submitted_at || event.created_at,
        );
        const orderPhotos = attachmentMap.get(event.order_id) || [];

        if (proofSnapshotPhotos.length > 0) {
          photos = proofSnapshotPhotos;
        } else {
          const eventTime = new Date(event.created_at).getTime();
          const recentPhotos = orderPhotos.filter((attachment) => {
            const uploadedAt = new Date(attachment.uploaded_at).getTime();
            const withinWindow = uploadedAt >= eventTime - 30 * 60 * 1000 && uploadedAt <= eventTime + 5 * 60 * 1000;
            return withinWindow && (!driverId || attachment.uploaded_by === driverId);
          });
          const driverPhotos = orderPhotos.filter((attachment) => !driverId || attachment.uploaded_by === driverId);
          photos = recentPhotos.length > 0 ? recentPhotos : driverPhotos;
        }

        const messageAttempt: DriverTelegramMessageAttempt | null = deliveryAttempt
          ? {
            result_type: deliveryAttempt.result_type,
            failure_reason: deliveryAttempt.failure_reason,
            remark: deliveryAttempt.remark,
            reschedule_date: deliveryAttempt.reschedule_date,
          }
          : null;
        message = driverEventMessage(event, order, driverName, messageAttempt);
        recipients = driverRecipientsMap.get(id) || [];
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

      const uniqueEventRecipients = uniqueRecipients(recipients);
      const sentChatIdsForEvent = new Set<string>();
      let eventHadFailure = false;
      let retryableFailure = false;
      let deliveryStillInFlight = false;
      let subscribedRecipientCount = 0;
      let destinationCount = 0;
      let sendAttemptCount = 0;
      let eventSuccessCount = 0;
      let eventFailedCount = 0;
      let lastError = '';
      let queueAttemptTimestamped = false;

      for (const recipient of uniqueEventRecipients) {
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

        subscribedRecipientCount++;
        const userDestinations = destinationsMap.get(recipient.userId) || [];
        for (const destination of userDestinations) {
          const chatId = destination.chat_id.trim();
          if (!TELEGRAM_CHAT_ID_PATTERN.test(chatId)) continue;
          if (sentChatIdsForEvent.has(chatId)) continue;
          sentChatIdsForEvent.add(chatId);
          destinationCount++;

          const destinationKey = destination.id || chatId;
          const deliveryKey = `attempt:${event.delivery_attempt_id}:${event_type}:${destinationKey}`;
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
            retryableFailure = true;
            lastError = claimError.message;
            console.error(`[send-telegram-event] Failed to claim ${deliveryKey}:`, claimError.message);
            continue;
          }

          const claim = claims?.[0];
          if (!claim?.should_send) {
            if (claim?.delivery_status === 'success') eventSuccessCount++;
            else deliveryStillInFlight = true;
            continue;
          }

          sendAttemptCount++;
          const attemptedAt = new Date().toISOString();
          if (isDriver && !queueAttemptTimestamped) {
            const { error: queueAttemptError } = await supabase
              .from('telegram_event_queue')
              .update({ telegram_attempt_at: attemptedAt })
              .eq('id', id)
              .is('telegram_attempt_at', null);
            if (queueAttemptError) {
              console.warn('[send-telegram-event] Could not persist Telegram attempt timestamp:', queueAttemptError.message);
            }
            queueAttemptTimestamped = true;
          }
          const { error: logAttemptError } = await supabase
            .from('telegram_notification_logs')
            .update({ attempted_at: attemptedAt })
            .eq('id', claim.log_id);
          if (logAttemptError) {
            console.warn('[send-telegram-event] Could not persist Telegram log attempt timestamp:', logAttemptError.message);
          }
          const errors: string[] = [];
          let inactiveDestination = false;
          let sendWasRetryable = false;
          let retryAfterSeconds: number | null = null;
          let messageResult: TelegramResponse = { ok: false };
          try {
            const photoUrls = isDriver
              ? await resolveTelegramPhotoUrls(supabase, photos)
              : photos.map((photo) => photo.url).filter(Boolean);
            let textSentWithPhoto = false;
            let photoSendMethod = photoUrls.length === 0 ? 'text_only' : 'photo';

            if (isDriver) {
              console.log('[send-telegram-event] Driver photo payload', JSON.stringify({
                order_id: event.order_id,
                delivery_attempt_id: event.delivery_attempt_id,
                event_type,
                photo_reference_count: photos.length,
                photo_count: photoUrls.length,
                photo_urls_present: photoUrls.length > 0,
              }));
            }

            for (let i = 0; i < photoUrls.length; i += 10) {
              const batch = photoUrls.slice(i, i + 10);
              if (batch.length > 1) {
                photoSendMethod = i === 0 ? 'media_group_with_caption' : 'media_group';
                const groupResult = await sendTelegramMediaGroup(
                  botToken,
                  chatId,
                  batch,
                  i === 0 ? message : undefined,
                );
                console.log('[send-telegram-event] Telegram photo response', JSON.stringify({
                  order_id: event.order_id,
                  delivery_attempt_id: event.delivery_attempt_id,
                  event_type,
                  photo_count: batch.length,
                  send_method: photoSendMethod,
                  ok: groupResult.ok,
                  http_status: groupResult.http_status,
                  error_code: groupResult.error_code,
                }));
                retryAfterSeconds = mergeRetryAfterSeconds(retryAfterSeconds, groupResult);
                if (groupResult.ok) {
                  if (i === 0) {
                    textSentWithPhoto = true;
                    messageResult = groupResult;
                  }
                  continue;
                }
                const description = groupResult.description || 'Media group send failed';
                if (isInactiveDestinationError(description)) {
                  inactiveDestination = true;
                  errors.push(description);
                  break;
                }
                sendWasRetryable ||= isRetryableTelegramResult(groupResult);
                console.warn('[send-telegram-event] Media group failed, falling back to individual photos:', description);
                photoSendMethod = 'individual_photos_fallback';
              }

              for (const [photoIndex, photoUrl] of batch.entries()) {
                const withCaption = i === 0 && photoIndex === 0 && !textSentWithPhoto;
                const photoResult = await sendTelegramPhoto(
                  botToken,
                  chatId,
                  photoUrl,
                  withCaption ? message : undefined,
                );
                console.log('[send-telegram-event] Telegram photo response', JSON.stringify({
                  order_id: event.order_id,
                  delivery_attempt_id: event.delivery_attempt_id,
                  event_type,
                  photo_count: 1,
                  send_method: withCaption ? 'single_photo_with_caption' : photoSendMethod,
                  ok: photoResult.ok,
                  http_status: photoResult.http_status,
                  error_code: photoResult.error_code,
                }));
                retryAfterSeconds = mergeRetryAfterSeconds(retryAfterSeconds, photoResult);
                if (!photoResult.ok) {
                  const description = photoResult.description || 'Photo send failed';
                  errors.push(description);
                  sendWasRetryable ||= isRetryableTelegramResult(photoResult);
                  if (isInactiveDestinationError(description)) {
                    inactiveDestination = true;
                    break;
                  }
                } else if (withCaption) {
                  textSentWithPhoto = true;
                  messageResult = photoResult;
                }
              }

              if (inactiveDestination) break;
            }

            if (!inactiveDestination && (photoUrls.length === 0 || !textSentWithPhoto)) {
              const textResult = await sendTelegramMessage(botToken, chatId, message);
              messageResult = textResult;
              console.log('[send-telegram-event] Telegram text response', JSON.stringify({
                order_id: event.order_id,
                delivery_attempt_id: event.delivery_attempt_id,
                event_type,
                send_method: 'text_only_fallback',
                ok: textResult.ok,
                http_status: textResult.http_status,
                error_code: textResult.error_code,
              }));
              retryAfterSeconds = mergeRetryAfterSeconds(retryAfterSeconds, textResult);
              if (!textResult.ok) {
                const description = textResult.description || 'Message send failed';
                errors.push(description);
                sendWasRetryable ||= isRetryableTelegramResult(textResult);
                if (isInactiveDestinationError(description)) inactiveDestination = true;
              }
            }

            if (isDriver && photoUrls.length > 0 && !textSentWithPhoto && !inactiveDestination) {
              console.warn('[send-telegram-event] Driver photos sent without caption; text fallback was attempted', JSON.stringify({
                order_id: event.order_id,
                delivery_attempt_id: event.delivery_attempt_id,
                event_type,
                photo_count: photoUrls.length,
              }));
            }

            if (!inactiveDestination && photoUrls.length === 0 && !messageResult.ok) {
              const description = messageResult.description || 'Message send failed';
              if (!errors.includes(description)) {
                errors.push(description);
              }
              sendWasRetryable ||= isRetryableTelegramResult(messageResult);
              if (isInactiveDestinationError(description)) inactiveDestination = true;
            }

            const ok = errors.length === 0;
            const deliveryStatus = ok ? 'success' : sendWasRetryable ? 'retrying' : 'failed';
            const deliveryError = ok ? null : errors.join('; ');
            await supabase
              .from('telegram_notification_logs')
              .update({
                status: deliveryStatus,
                error_message: deliveryError,
                telegram_message_id: getTelegramMessageId(messageResult),
                sent_at: sendWasRetryable ? getRetryAt(attemptCount, retryAfterSeconds) : new Date().toISOString(),
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
            }

            if (ok) {
              sentCount++;
              eventSuccessCount++;
            } else {
              eventHadFailure = true;
              eventFailedCount++;
              retryableFailure ||= sendWasRetryable;
              lastError = deliveryError || 'Telegram send failed';
            }
          } catch (err) {
            eventHadFailure = true;
            eventFailedCount++;
            retryableFailure = true;
            lastError = err instanceof Error ? err.message : String(err);
            console.error(`[send-telegram-event] Failed to send to ${recipient.userId}:`, err);
            await supabase
              .from('telegram_notification_logs')
              .update({
                status: 'retrying',
                error_message: lastError,
                sent_at: getRetryAt(attemptCount, retryAfterSeconds),
              })
              .eq('id', claim.log_id);
          }
        }
      }

      if (isDriver) {
        let status: DriverAuditStatus;
        let reason: string;
        let nextRetryAt: string | null = null;

        if (retryableFailure) {
          status = 'retrying';
          reason = 'retryable_telegram_or_claim_failure';
          nextRetryAt = getRetryAt(attemptCount, retryAfterSeconds);
        } else if (eventSuccessCount > 0 && eventFailedCount > 0) {
          status = 'success';
          reason = 'sent_to_some_destinations_some_destinations_failed';
        } else if (eventSuccessCount > 0) {
          status = 'success';
          reason = 'sent_successfully';
        } else if (eventFailedCount > 0) {
          status = 'failed';
          reason = 'all_telegram_destinations_failed';
        } else if (deliveryStillInFlight) {
          status = 'pending';
          reason = 'another_sender_has_an_active_delivery_attempt';
        } else if (uniqueEventRecipients.length === 0) {
          status = 'skipped';
          reason = 'no_eligible_recipient';
        } else if (subscribedRecipientCount === 0) {
          status = 'skipped';
          reason = 'all_recipients_disabled_or_preference_off';
        } else if (destinationCount === 0) {
          status = 'skipped';
          reason = 'no_active_verified_telegram_destination';
        } else {
          status = 'skipped';
          reason = 'no_sendable_destination_after_deduplication';
        }

        await updateDriverEventState(supabase, id, {
          status,
          reason,
          eligible_recipient_count: uniqueEventRecipients.length,
          subscribed_recipient_count: subscribedRecipientCount,
          destination_count: destinationCount,
          send_attempt_count: sendAttemptCount,
          success_count: eventSuccessCount,
          failed_count: eventFailedCount,
          attempt_count: attemptCount,
          last_error: lastError || null,
          next_retry_at: nextRetryAt,
        });
      } else if (!eventHadFailure) {
        processedIds.push(id);
      }
    }

    if (processedIds.length > 0) {
      await supabase
        .from('telegram_event_queue')
        .update({
          processed: true,
          processed_at: new Date().toISOString(),
          notification_status: 'success',
          notification_reason: 'processed_by_server_worker',
          processing_started_at: null,
          processing_lease_until: null,
          processor_run_id: null,
          processor_last_error: null,
        })
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
