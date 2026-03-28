/**
 * sync-to-firebase Edge Function
 *
 * Pushes notifications and activity events from Supabase to Firebase Firestore.
 * Called fire-and-forget from other edge functions (process-delivery, submit-bulk-claim, etc.)
 *
 * Uses Firestore REST API — no Firebase Admin SDK needed.
 *
 * Payload types:
 *   { type: 'notification', userId, title, body, notificationType, data? }
 *   { type: 'activity', actorName, actorId, action, entityType, entityId, description, metadata? }
 *   { type: 'batch', items: Array<notification | activity> }
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const FIREBASE_PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID') || 'tomupro-430df';
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;

// Convert a JS value to Firestore Value format
function toFirestoreValue(val: unknown): Record<string, unknown> {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === 'string') return { stringValue: val };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (val instanceof Date) return { timestampValue: val.toISOString() };
  if (Array.isArray(val)) {
    return { arrayValue: { values: val.map(toFirestoreValue) } };
  }
  if (typeof val === 'object') {
    const fields: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      fields[k] = toFirestoreValue(v);
    }
    return { mapValue: { fields } };
  }
  return { stringValue: String(val) };
}

// Create a Firestore document via REST API
async function createFirestoreDoc(
  collectionPath: string,
  fields: Record<string, unknown>,
): Promise<boolean> {
  const url = `${FIRESTORE_BASE}/${collectionPath}`;
  const body = {
    fields: Object.fromEntries(
      Object.entries(fields).map(([k, v]) => [k, toFirestoreValue(v)]),
    ),
  };

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error(`[sync-to-firebase] Firestore write failed (${resp.status}):`, text);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[sync-to-firebase] Firestore request error:', err);
    return false;
  }
}

interface NotificationPayload {
  type: 'notification';
  userId: string;
  title: string;
  body: string;
  notificationType: string;
  data?: Record<string, unknown>;
}

interface ActivityPayload {
  type: 'activity';
  actorName: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  description: string;
  metadata?: Record<string, unknown>;
}

interface BatchPayload {
  type: 'batch';
  items: Array<NotificationPayload | ActivityPayload>;
}

type SyncPayload = NotificationPayload | ActivityPayload | BatchPayload;

async function pushNotification(p: NotificationPayload): Promise<boolean> {
  return createFirestoreDoc(`notifications/${p.userId}/items`, {
    title: p.title,
    body: p.body,
    type: p.notificationType || 'info',
    read: false,
    createdAt: new Date().toISOString(),
    data: p.data || null,
  });
}

async function pushActivity(p: ActivityPayload): Promise<boolean> {
  return createFirestoreDoc('activity/global/items', {
    actorName: p.actorName,
    actorId: p.actorId,
    action: p.action,
    entityType: p.entityType,
    entityId: p.entityId,
    description: p.description,
    createdAt: new Date().toISOString(),
    metadata: p.metadata || null,
  });
}

async function processItem(item: NotificationPayload | ActivityPayload): Promise<boolean> {
  if (item.type === 'notification') return pushNotification(item);
  if (item.type === 'activity') return pushActivity(item);
  console.warn('[sync-to-firebase] Unknown item type:', (item as Record<string, unknown>).type);
  return false;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth: only allow internal calls (service role key)
    const authHeader = req.headers.get('Authorization');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!authHeader || !serviceKey || !authHeader.includes(serviceKey)) {
      // Also accept calls from within Supabase functions (same network)
      // For extra safety, check for a shared secret
      const internalSecret = Deno.env.get('SYNC_FIREBASE_SECRET');
      const providedSecret = req.headers.get('x-sync-secret');
      if (!internalSecret || providedSecret !== internalSecret) {
        // Allow service role bearer token
        if (!authHeader?.startsWith('Bearer ') || !serviceKey) {
          return new Response(
            JSON.stringify({ error: 'Unauthorized' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
          );
        }
      }
    }

    const payload: SyncPayload = await req.json();
    let successCount = 0;
    let failCount = 0;

    if (payload.type === 'batch') {
      const results = await Promise.allSettled(
        payload.items.map((item) => processItem(item)),
      );
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value) successCount++;
        else failCount++;
      }
    } else {
      const ok = await processItem(payload as NotificationPayload | ActivityPayload);
      if (ok) successCount++;
      else failCount++;
    }

    return new Response(
      JSON.stringify({ success: true, pushed: successCount, failed: failCount }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    console.error('[sync-to-firebase] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
