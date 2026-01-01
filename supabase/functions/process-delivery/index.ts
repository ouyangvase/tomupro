import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OrderItem {
  id: string;
  product_id: string | null;
  qty: number;
  sku_label: string | null;
}

interface Order {
  id: string;
  salesperson_id: string;
  runner_id: string | null;
  fulfillment_warehouse_id: string | null;
  stock_deducted: boolean;
  runner_status: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Use service role for bypassing RLS
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { orderId, runnerId } = await req.json();
    
    if (!orderId) {
      console.error('Missing orderId');
      return new Response(
        JSON.stringify({ success: false, error: 'Missing orderId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Processing delivery for order ${orderId} by runner ${runnerId}`);

    // Fetch the order
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, salesperson_id, runner_id, fulfillment_warehouse_id, stock_deducted, runner_status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      console.error('Order not found:', orderError);
      return new Response(
        JSON.stringify({ success: false, error: 'Order not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Idempotency check - if already deducted, return success
    if (order.stock_deducted) {
      console.log(`Order ${orderId} already has stock deducted, skipping`);
      return new Response(
        JSON.stringify({ success: true, message: 'Stock already deducted', alreadyProcessed: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get fulfillment warehouse (default to salesperson's warehouse)
    let warehouseId = order.fulfillment_warehouse_id;
    if (!warehouseId) {
      const { data: warehouse } = await supabase
        .from('warehouses')
        .select('id')
        .eq('owner_user_id', order.salesperson_id)
        .eq('warehouse_type', 'SALESPERSON')
        .single();
      
      warehouseId = warehouse?.id;
    }

    if (!warehouseId) {
      console.error('No fulfillment warehouse found');
      return new Response(
        JSON.stringify({ success: false, error: 'No fulfillment warehouse found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch order items
    const { data: orderItems, error: itemsError } = await supabase
      .from('order_items')
      .select('id, product_id, qty, sku_label')
      .eq('order_id', orderId);

    if (itemsError) {
      console.error('Error fetching order items:', itemsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Error fetching order items' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate all items have product_id
    const itemsWithoutProduct = (orderItems || []).filter(item => !item.product_id);
    
    if (itemsWithoutProduct.length > 0) {
      console.log(`Order ${orderId} has items without product_id, setting to DISPUTE`);
      
      const missingLabels = itemsWithoutProduct
        .map(item => item.sku_label || 'Unknown')
        .join(', ');

      // Update order to DISPUTE status
      const { error: disputeError } = await supabase
        .from('orders')
        .update({
          runner_status: 'DELIVERED',
          delivered_at: new Date().toISOString(),
          reconciliation_status: 'DISPUTE',
          dispute_reason: 'Missing SKU mapping',
          dispute_notes: `Delivery marked but SKU mapping missing for items: ${missingLabels}. Please assign SKU in order items.`,
        })
        .eq('id', orderId);

      if (disputeError) {
        console.error('Error updating order to DISPUTE:', disputeError);
      }

      // Log audit
      await supabase.from('audit_logs').insert({
        entity_type: 'order',
        entity_id: orderId,
        action: 'DELIVERY_DISPUTE',
        actor_id: runnerId,
        before_json: { runner_status: order.runner_status, reconciliation_status: 'NOT_CLAIMED' },
        after_json: { 
          runner_status: 'DELIVERED', 
          reconciliation_status: 'DISPUTE',
          dispute_reason: 'Missing SKU mapping',
        },
      });

      // Create notification for salesperson
      await supabase.from('notifications').insert({
        user_id: order.salesperson_id,
        type: 'DISPUTE',
        title: 'Delivery blocked: Missing SKU mapping',
        message: `Order delivery was marked but stock could not be deducted. Missing SKU mapping for: ${missingLabels}`,
        reference_type: 'order',
        reference_id: orderId,
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Cannot complete delivery: missing SKU mapping',
          dispute: true,
          missingItems: missingLabels,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // All validations passed - create stock movements
    console.log(`Creating ${orderItems?.length} stock movements for order ${orderId}`);
    
    const stockMovements = (orderItems || []).map(item => ({
      warehouse_id: warehouseId,
      product_id: item.product_id,
      movement_type: 'SALE_DEDUCT',
      qty_change: -item.qty,
      reference_type: 'ORDER_ITEM',
      reference_id: item.id,
      created_by: runnerId || order.runner_id,
    }));

    const { error: movementsError } = await supabase
      .from('stock_movements')
      .insert(stockMovements);

    if (movementsError) {
      console.error('Error creating stock movements:', movementsError);
      return new Response(
        JSON.stringify({ success: false, error: 'Error creating stock movements' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Update order: set delivered status and mark stock as deducted
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        runner_status: 'DELIVERED',
        delivered_at: new Date().toISOString(),
        stock_deducted: true,
      })
      .eq('id', orderId);

    if (updateError) {
      console.error('Error updating order:', updateError);
      return new Response(
        JSON.stringify({ success: false, error: 'Error updating order status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log audit for successful delivery
    await supabase.from('audit_logs').insert({
      entity_type: 'order',
      entity_id: orderId,
      action: 'ORDER_DELIVERED',
      actor_id: runnerId,
      before_json: { runner_status: order.runner_status, stock_deducted: false },
      after_json: { runner_status: 'DELIVERED', stock_deducted: true },
    });

    // Log audit for stock deduction
    await supabase.from('audit_logs').insert({
      entity_type: 'order',
      entity_id: orderId,
      action: 'STOCK_DEDUCTED',
      actor_id: runnerId,
      after_json: { 
        movements_count: stockMovements.length, 
        warehouse_id: warehouseId,
        items: orderItems?.map(i => ({ product_id: i.product_id, qty: -i.qty })),
      },
    });

    console.log(`Successfully processed delivery for order ${orderId}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Delivered. Stock deducted.',
        movementsCreated: stockMovements.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
