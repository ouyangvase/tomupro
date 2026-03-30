import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

interface FailedOrder {
  order_id: string;
  order_code: string;
  customer_name: string;
  area: string | null;
  reason: string;
}

interface ValidOrder {
  id: string;
  order_code: string;
  customer_name: string | null;
  total_amount: number;
  area: string | null;
  runner_id: string;
  runner_status: string;
  reconciliation_status: string;
  delivery_fee: number;
  net_claim_amount: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ success: false, error: 'No authorization header' }, 401);
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return json({ success: false, error: 'Invalid authentication' }, 401);
    }

    const { orderIds, note, exchangeRate } = await req.json();

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      // Return 200 so Supabase client doesn't swallow the body
      return json({ success: false, error: 'No orders provided' });
    }

    const rate = Number(exchangeRate);
    if (!exchangeRate || isNaN(rate) || rate <= 0 || rate > 99.9999) {
      return json({ success: false, error: 'Valid exchange rate (BND→RM) is required (0.0001 - 99.9999)' });
    }

    console.log(`[submit-bulk-claim] runner=${user.id} count=${orderIds.length} orderIds=${JSON.stringify(orderIds)}`);

    // ── Fetch orders with display fields ──
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, order_code, customer_name, total_amount, area, runner_status, reconciliation_status, runner_id')
      .in('id', orderIds);

    if (ordersError) {
      console.error('[submit-bulk-claim] fetch orders error:', ordersError);
      return json({ success: false, error: 'Failed to fetch orders' });
    }

    // Build lookup for fetched orders
    const orderMap = new Map((orders || []).map(o => [o.id, o]));

    // ── Fetch existing batch items ──
    const { data: existingBatchItems } = await supabase
      .from('claim_batch_items')
      .select('order_id')
      .in('order_id', orderIds);

    const alreadyInBatch = new Set((existingBatchItems || []).map(i => i.order_id));

    // ── Fetch delivery charges ──
    const { data: deliveryCharges } = await supabase
      .from('delivery_charges')
      .select('area, charge_amount')
      .eq('runner_id', user.id)
      .eq('status', 'APPROVED')
      .is('superseded_at', null);

    const chargesByArea = new Map(
      (deliveryCharges || []).map(c => [c.area.toLowerCase(), Number(c.charge_amount)])
    );

    // ── Per-order validation ──
    const failedOrders: FailedOrder[] = [];
    const validOrders: ValidOrder[] = [];

    for (const orderId of orderIds) {
      const order = orderMap.get(orderId);

      if (!order) {
        failedOrders.push({ order_id: orderId, order_code: '?', customer_name: '?', area: null, reason: 'Order not found' });
        continue;
      }

      const base = {
        order_id: order.id,
        order_code: order.order_code || '?',
        customer_name: order.customer_name || '?',
        area: order.area,
      };

      // Check authorization
      if (order.runner_id !== user.id) {
        failedOrders.push({ ...base, reason: 'Not authorized — runner mismatch' });
        continue;
      }

      // Check delivery status
      if (order.runner_status !== 'DELIVERED') {
        failedOrders.push({ ...base, reason: `Status is not DELIVERED (current: ${order.runner_status || 'unknown'})` });
        continue;
      }

      // Check reconciliation status
      if (order.reconciliation_status !== 'NOT_CLAIMED') {
        failedOrders.push({ ...base, reason: `Already claimed or submitted (status: ${order.reconciliation_status})` });
        continue;
      }

      // Check if already in a batch
      if (alreadyInBatch.has(order.id)) {
        failedOrders.push({ ...base, reason: 'Already included in an existing claim batch' });
        continue;
      }

      // Check delivery charge
      if (order.area) {
        const fee = chargesByArea.get(order.area.toLowerCase());
        if (fee === undefined) {
          failedOrders.push({ ...base, reason: `No approved delivery charge for area: ${order.area}` });
          continue;
        }
        validOrders.push({
          id: order.id,
          order_code: order.order_code,
          customer_name: order.customer_name,
          total_amount: Number(order.total_amount),
          area: order.area,
          runner_id: order.runner_id,
          runner_status: order.runner_status,
          reconciliation_status: order.reconciliation_status,
          delivery_fee: fee,
          net_claim_amount: Number(order.total_amount) - fee,
        });
      } else {
        // No area → 0 delivery fee
        validOrders.push({
          id: order.id,
          order_code: order.order_code,
          customer_name: order.customer_name,
          total_amount: Number(order.total_amount),
          area: null,
          runner_id: order.runner_id,
          runner_status: order.runner_status,
          reconciliation_status: order.reconciliation_status,
          delivery_fee: 0,
          net_claim_amount: Number(order.total_amount),
        });
      }
    }

    console.log(`[submit-bulk-claim] validation: ${validOrders.length} valid, ${failedOrders.length} failed`);
    if (failedOrders.length > 0) {
      console.log(`[submit-bulk-claim] failed_orders: ${JSON.stringify(failedOrders)}`);
    }

    // ── All failed → return error with details ──
    if (validOrders.length === 0) {
      return json({
        success: false,
        error: `All ${failedOrders.length} order(s) failed validation`,
        message: `All ${failedOrders.length} order(s) failed validation. See failed_orders for details.`,
        success_count: 0,
        failed_count: failedOrders.length,
        failed_orders: failedOrders,
      });
    }

    // ── Proceed with valid orders ──
    const isPartial = failedOrders.length > 0;
    const validOrderIds = validOrders.map(o => o.id);

    const totalGrossAmount = validOrders.reduce((sum, o) => sum + o.total_amount, 0);
    const totalDeliveryFees = validOrders.reduce((sum, o) => sum + o.delivery_fee, 0);
    const totalNetBND = validOrders.reduce((sum, o) => sum + o.net_claim_amount, 0);
    const totalNetRM = Number((totalNetBND * rate).toFixed(2));
    const grossRM = Number((totalGrossAmount * rate).toFixed(2));
    const deliveryFeesRM = Number((totalDeliveryFees * rate).toFixed(2));

    // Get runner display name
    const { data: runnerProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single();

    // ── Create batch ──
    const { data: batch, error: batchError } = await supabase
      .from('claim_batches')
      .insert({
        runner_id: user.id,
        total_amount: totalNetBND,
        total_bnd: totalNetBND,
        exchange_rate_to_rm: rate,
        total_rm: totalNetRM,
        gross_bnd: totalGrossAmount,
        delivery_charges_bnd: totalDeliveryFees,
        net_bnd: totalNetBND,
        gross_rm: grossRM,
        delivery_charges_rm: deliveryFeesRM,
        net_rm: totalNetRM,
        status: 'ADMIN_ACK_PENDING',
        note: note ? String(note).slice(0, 500) : null,
      })
      .select()
      .single();

    if (batchError) {
      console.error('[submit-bulk-claim] batch creation error:', batchError);
      return json({ success: false, error: 'Failed to create claim batch. Please try again.' });
    }

    console.log(`[submit-bulk-claim] batch created: ${batch.id}`);

    // ── Insert batch items (chunked for large batches) ──
    const CHUNK_SIZE = 50;
    const batchItems = validOrderIds.map(oid => ({ batch_id: batch.id, order_id: oid }));
    for (let i = 0; i < batchItems.length; i += CHUNK_SIZE) {
      const chunk = batchItems.slice(i, i + CHUNK_SIZE);
      const { error: itemsError } = await supabase.from('claim_batch_items').insert(chunk);
      if (itemsError) {
        console.error(`[submit-bulk-claim] batch items error (chunk ${i}):`, itemsError);
        await supabase.from('claim_batch_items').delete().eq('batch_id', batch.id);
        await supabase.from('claim_batches').delete().eq('id', batch.id);
        return json({
          success: false,
          error: 'Failed to add orders to batch. Please try again.',
          debug: { step: 'insert_batch_items', details: itemsError.message },
        });
      }
    }

    // ── Create individual claims (chunked) ──
    const claimsToInsert = validOrders.map(order => ({
      order_id: order.id,
      amount: order.net_claim_amount,
      gross_amount: order.total_amount,
      delivery_fee: order.delivery_fee,
      net_claim_amount: order.net_claim_amount,
      created_by: user.id,
      method: 'TRANSFER',
    }));

    for (let i = 0; i < claimsToInsert.length; i += CHUNK_SIZE) {
      const chunk = claimsToInsert.slice(i, i + CHUNK_SIZE);
      const { error: claimsError } = await supabase.from('claims').insert(chunk);
      if (claimsError) {
        console.error(`[submit-bulk-claim] claims insert error (chunk ${i}):`, claimsError);
        // Continue — claims are secondary; batch items are the source of truth
      }
    }

    // ── Update order statuses (chunked) ──
    for (let i = 0; i < validOrderIds.length; i += CHUNK_SIZE) {
      const chunk = validOrderIds.slice(i, i + CHUNK_SIZE);
      const { error: updateError } = await supabase
        .from('orders')
        .update({ reconciliation_status: 'ADMIN_ACK_PENDING' })
        .in('id', chunk);
      if (updateError) {
        console.error(`[submit-bulk-claim] order status update error (chunk ${i}):`, updateError);
      }
    }

    // ── Audit log ──
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      action: 'BULK_CLAIM_SUBMITTED',
      entity_type: 'claim_batch',
      entity_id: batch.id,
      after_json: {
        order_count: validOrders.length,
        gross_amount: totalGrossAmount,
        delivery_fees: totalDeliveryFees,
        net_amount_bnd: totalNetBND,
        exchange_rate: rate,
        net_amount_rm: totalNetRM,
        partial: isPartial,
        failed_count: failedOrders.length,
      },
    });

    // ── Firebase sync (non-blocking) ──
    try {
      fetch(`${supabaseUrl}/functions/v1/sync-to-firebase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseServiceKey}`,
        },
        body: JSON.stringify({
          type: 'activity',
          actorName: runnerProfile?.display_name || user.email || 'Runner',
          actorId: user.id,
          action: 'submitted_claim',
          entityType: 'claim_batch',
          entityId: batch.id,
          description: `Submitted claim batch: ${validOrders.length} orders, BND ${totalNetBND.toFixed(2)} net${isPartial ? ` (${failedOrders.length} skipped)` : ''}`,
        }),
      }).catch((err) => console.error('[sync-to-firebase] error:', err));
    } catch (_syncErr) {
      // non-blocking
    }

    // ── Response ──
    return json({
      success: true,
      partial: isPartial,
      batchId: batch.id,
      orderCount: validOrders.length,
      success_count: validOrders.length,
      failed_count: failedOrders.length,
      failed_orders: failedOrders,
      grossAmount: totalGrossAmount,
      deliveryFees: totalDeliveryFees,
      netAmountBND: totalNetBND,
      exchangeRate: rate,
      netAmountRM: totalNetRM,
    });

  } catch (error) {
    console.error('[submit-bulk-claim] unexpected error:', error);
    return json({
      success: false,
      error: 'An unexpected error occurred. Please try again or contact admin.',
    });
  }
});
