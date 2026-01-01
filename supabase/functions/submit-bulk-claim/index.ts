import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
      console.error('Auth error:', authError);
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { orderIds, note } = await req.json();
    console.log(`Processing bulk claim for runner ${user.id}, orders:`, orderIds);

    if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'No orders provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate orders belong to this runner and are DELIVERED and not already CLAIMED
    const { data: orders, error: ordersError } = await supabase
      .from('orders')
      .select('id, total_amount, runner_status, reconciliation_status, runner_id')
      .in('id', orderIds);

    if (ordersError) {
      console.error('Error fetching orders:', ordersError);
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
      const reasons = invalidOrders.map(o => {
        if (o.runner_id !== user.id) return `Order ${o.id} does not belong to you`;
        if (o.runner_status !== 'DELIVERED') return `Order ${o.id} is not delivered`;
        if (o.reconciliation_status === 'CLAIMED') return `Order ${o.id} is already claimed`;
        return `Order ${o.id} is invalid`;
      });
      return new Response(
        JSON.stringify({ success: false, error: reasons.join('; ') }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Calculate total amount
    const totalAmount = orders?.reduce((sum, o) => sum + Number(o.total_amount), 0) || 0;

    // Get runner's display name for notification
    const { data: runnerProfile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single();

    // Create claim batch
    const { data: batch, error: batchError } = await supabase
      .from('claim_batches')
      .insert({
        runner_id: user.id,
        total_amount: totalAmount,
        status: 'ADMIN_ACK_PENDING',
        note: note || null,
      })
      .select()
      .single();

    if (batchError) {
      console.error('Error creating claim batch:', batchError);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create claim batch' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Created claim batch:', batch.id);

    // Insert batch items
    const batchItems = orderIds.map(orderId => ({
      batch_id: batch.id,
      order_id: orderId,
    }));

    const { error: itemsError } = await supabase
      .from('claim_batch_items')
      .insert(batchItems);

    if (itemsError) {
      console.error('Error inserting batch items:', itemsError);
      // Rollback: delete the batch
      await supabase.from('claim_batches').delete().eq('id', batch.id);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to add orders to batch' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update orders reconciliation_status to ADMIN_ACK_PENDING
    const { error: updateError } = await supabase
      .from('orders')
      .update({ reconciliation_status: 'ADMIN_ACK_PENDING' })
      .in('id', orderIds);

    if (updateError) {
      console.error('Error updating orders:', updateError);
    }

    // Get all admin users to notify
    const { data: adminUsers } = await supabase
      .from('profiles')
      .select('id')
      .eq('role', 'admin')
      .eq('is_active', true);

    // Create notifications for admins
    if (adminUsers && adminUsers.length > 0) {
      const notifications = adminUsers.map(admin => ({
        user_id: admin.id,
        title: 'New Claim Batch Submitted',
        message: `Runner ${runnerProfile?.display_name || 'Unknown'} submitted claim batch for ${orderIds.length} orders, total ${totalAmount.toLocaleString()}`,
        type: 'claim_batch',
        reference_type: 'claim_batch',
        reference_id: batch.id,
      }));

      const { error: notifError } = await supabase
        .from('notifications')
        .insert(notifications);

      if (notifError) {
        console.error('Error creating notifications:', notifError);
      }
    }

    // Log audit
    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      action: 'BULK_CLAIM_SUBMITTED',
      entity_type: 'claim_batch',
      entity_id: batch.id,
      after_json: { order_count: orderIds.length, total_amount: totalAmount },
    });

    console.log(`Successfully created claim batch ${batch.id} for ${orderIds.length} orders`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        batchId: batch.id, 
        orderCount: orderIds.length,
        totalAmount 
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'An unexpected error occurred' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
