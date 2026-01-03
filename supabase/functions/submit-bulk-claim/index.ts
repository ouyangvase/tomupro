import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OrderWithCharge {
  id: string;
  total_amount: number;
  area: string | null;
  runner_id: string;
  runner_status: string;
  reconciliation_status: string;
  delivery_fee?: number;
  net_claim_amount?: number;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get authorization header to identify the user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'No authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify the user
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { orderIds, note, exchangeRate } = await req.json();

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No orders provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate exchange rate
    const rate = Number(exchangeRate);
    if (!exchangeRate || isNaN(rate) || rate <= 0 || rate > 99.9999) {
      return new Response(
        JSON.stringify({ success: false, error: 'Valid exchange rate (BND→RM) is required (0.0001 - 99.9999)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate orders belong to this runner and are DELIVERED and not already CLAIMED
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, total_amount, area, runner_status, reconciliation_status, runner_id')
      .in('id', orderIds);

    if (ordersError) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch orders' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate all orders
    const invalidOrders = orders?.filter(o => 
      o.runner_id !== user.id || 
      o.runner_status !== 'DELIVERED' || 
      o.reconciliation_status === 'CLAIMED'
    );

    if (invalidOrders && invalidOrders.length > 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'Some orders are invalid or not authorized' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get runner's approved delivery charges
    const { data: deliveryCharges } = await supabase
      .from('delivery_charges')
      .select('area, charge_amount')
      .eq('runner_id', user.id)
      .eq('status', 'APPROVED')
      .is('superseded_at', null);

    const chargesByArea = new Map(
      deliveryCharges?.map(c => [c.area.toLowerCase(), Number(c.charge_amount)]) || []
    );

    // Check if all orders have approved delivery charges for their areas
    const ordersWithoutCharges: string[] = [];
    const ordersWithCharges: OrderWithCharge[] = [];

    for (const order of orders || []) {
      if (order.area) {
        const deliveryFee = chargesByArea.get(order.area.toLowerCase());
        if (deliveryFee === undefined) {
          ordersWithoutCharges.push(order.area);
        } else {
          ordersWithCharges.push({
            ...order,
            delivery_fee: deliveryFee,
            net_claim_amount: Number(order.total_amount) - deliveryFee,
          });
        }
      } else {
        // Orders without area get 0 delivery fee
        ordersWithCharges.push({
          ...order,
          delivery_fee: 0,
          net_claim_amount: Number(order.total_amount),
        });
      }
    }

    // Block if any orders are missing delivery charges
    if (ordersWithoutCharges.length > 0) {
      const uniqueAreas = [...new Set(ordersWithoutCharges)];
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `No approved delivery charge for area(s): ${uniqueAreas.join(', ')}. Please submit delivery charge proposals first.`,
          missingAreas: uniqueAreas,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate total amounts (all in BND)
    const totalGrossAmount = ordersWithCharges.reduce((sum, o) => sum + Number(o.total_amount), 0);
    const totalDeliveryFees = ordersWithCharges.reduce((sum, o) => sum + (o.delivery_fee || 0), 0);
    const totalNetBND = ordersWithCharges.reduce((sum, o) => sum + (o.net_claim_amount || 0), 0);
    const totalNetRM = Number((totalNetBND * rate).toFixed(2));

    // Get runner's display name for notification
    const { data: runnerProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single();

    // Create claim batch with BND and RM amounts
    const { data: batch, error: batchError } = await supabase
      .from('claim_batches')
      .insert({
        runner_id: user.id,
        total_amount: totalNetBND, // Keep for backward compatibility
        total_bnd: totalNetBND,
        exchange_rate_to_rm: rate,
        total_rm: totalNetRM,
        status: 'ADMIN_ACK_PENDING',
        note: note ? String(note).slice(0, 500) : null,
      })
      .select()
      .single();

    if (batchError) {
      console.error('Batch creation error:', batchError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create claim batch' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Insert batch items
    const batchItems = orderIds.map((orderId: string) => ({
      batch_id: batch.id,
      order_id: orderId,
    }));

    const { error: itemsError } = await supabase
      .from('claim_batch_items')
      .insert(batchItems);

    if (itemsError) {
      await supabase.from('claim_batches').delete().eq('id', batch.id);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to add orders to batch' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create individual claims for each order with delivery fee breakdown
    const claimsToInsert = ordersWithCharges.map(order => ({
      order_id: order.id,
      amount: order.net_claim_amount || 0,
      gross_amount: Number(order.total_amount),
      delivery_fee: order.delivery_fee || 0,
      net_claim_amount: order.net_claim_amount || 0,
      created_by: user.id,
      method: 'TRANSFER', // Default method for bulk claims
    }));

    await supabase.from('claims').insert(claimsToInsert);

    // Update orders reconciliation_status to ADMIN_ACK_PENDING
    await supabase
      .from('orders')
      .update({ reconciliation_status: 'ADMIN_ACK_PENDING' })
      .in('id', orderIds);

    // Log audit
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      action: 'BULK_CLAIM_SUBMITTED',
      entity_type: 'claim_batch',
      entity_id: batch.id,
      after_json: { 
        order_count: orderIds.length, 
        gross_amount: totalGrossAmount,
        delivery_fees: totalDeliveryFees,
        net_amount_bnd: totalNetBND,
        exchange_rate: rate,
        net_amount_rm: totalNetRM,
      },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        batchId: batch.id, 
        orderCount: orderIds.length,
        grossAmount: totalGrossAmount,
        deliveryFees: totalDeliveryFees,
        netAmountBND: totalNetBND,
        exchangeRate: rate,
        netAmountRM: totalNetRM,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Bulk claim error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});