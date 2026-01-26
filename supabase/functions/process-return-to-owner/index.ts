import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * Process stock return to owner when order is FAILED, CANCELLED, or explicitly returned.
 * This function is idempotent - calling it multiple times for the same order will not
 * create duplicate return movements.
 * 
 * Rules:
 * 1. Only returns stock if it was previously deducted (DELIVER_DEDUCT exists)
 * 2. Returns stock to the ORIGINAL owner's warehouse (salesperson)
 * 3. Uses RETURN_TO_OWNER movement type with order_id for idempotency
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const authenticatedUserId = user.id;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    const { orderId, reason } = await req.json();
    
    if (!orderId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing orderId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch order details
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('id, salesperson_id, runner_id, fulfillment_warehouse_id, stock_deducted, runner_status')
      .eq('id', orderId)
      .single();

    if (orderError || !order) {
      return new Response(
        JSON.stringify({ success: false, error: 'Order not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authorization: runner, admin, or salesperson can process returns
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', authenticatedUserId)
      .single();
    
    const isAuthorized = 
      profile?.role === 'admin' ||
      order.runner_id === authenticatedUserId ||
      order.salesperson_id === authenticatedUserId;
    
    if (!isAuthorized) {
      return new Response(
        JSON.stringify({ success: false, error: 'Not authorized' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If stock was never deducted, nothing to return
    if (!order.stock_deducted) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No stock deduction to reverse',
          returnsCreated: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // CRITICAL: Always recalculate the correct ACTIVE warehouse using database function
    // Never trust cached fulfillment_warehouse_id - it may be stale from role changes
    // (e.g., user was salesperson, now is manager with different warehouse type)
    console.log('[RETURN] Calculating correct active warehouse for order:', orderId);
    
    const { data: warehouseResult, error: warehouseError } = await supabase
      .rpc('get_stock_owner_warehouse', { p_order_id: orderId });
    
    let warehouseId = warehouseResult;
    
    if (warehouseError) {
      console.error('[RETURN] Error getting stock owner warehouse:', warehouseError);
    }

    // Fallback: try to find any active warehouse for the salesperson
    if (!warehouseId) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', order.salesperson_id)
        .single();
      
      const warehouseType = profile?.role === 'manager' ? 'MANAGER' : 'SALESPERSON';
      
      const { data: activeWarehouse } = await supabase
        .from('warehouses')
        .select('id')
        .eq('owner_user_id', order.salesperson_id)
        .eq('warehouse_type', warehouseType)
        .eq('is_active', true)
        .single();
      
      warehouseId = activeWarehouse?.id;
    }

    if (!warehouseId) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No active warehouse found. Stock can only be returned to active warehouse inventory.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('[RETURN] Using active warehouse:', warehouseId);

    // Find all DELIVER_DEDUCT movements for this order
    const { data: deductions, error: deductionsError } = await supabase
      .from('stock_movements')
      .select('id, product_id, qty_change, warehouse_id')
      .eq('order_id', orderId)
      .eq('movement_type', 'DELIVER_DEDUCT');

    if (deductionsError) {
      return new Response(
        JSON.stringify({ success: false, error: 'Error fetching deductions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!deductions || deductions.length === 0) {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'No deductions found to reverse',
          returnsCreated: 0 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create RETURN_TO_OWNER movements for each deduction (idempotent)
    let returnsCreated = 0;
    let returnsSkipped = 0;

    for (const deduction of deductions) {
      // Check if return already exists (idempotency)
      const { data: existingReturn } = await supabase
        .from('stock_movements')
        .select('id')
        .eq('order_id', orderId)
        .eq('product_id', deduction.product_id)
        .eq('movement_type', 'RETURN_TO_OWNER')
        .maybeSingle();

      if (existingReturn) {
        returnsSkipped++;
        console.log(`Skipped duplicate return for order ${orderId}, product ${deduction.product_id}`);
        continue;
      }

      // Create the return movement - return to the ACTIVE warehouse (not the old one from deduction)
      // This handles role changes (e.g., user was salesperson, now is manager)
      const { error: returnError } = await supabase
        .from('stock_movements')
        .insert({
          warehouse_id: warehouseId, // Use the ACTIVE warehouse calculated above
          product_id: deduction.product_id,
          movement_type: 'RETURN_TO_OWNER',
          qty_change: Math.abs(deduction.qty_change), // Positive to add back
          reference_type: 'ORDER',
          order_id: orderId,
          created_by: authenticatedUserId,
        });

      if (returnError) {
        // Handle unique constraint violation gracefully
        if (returnError.code === '23505') {
          returnsSkipped++;
          continue;
        }
        console.error('Return movement error:', returnError);
        throw returnError;
      }

      returnsCreated++;
    }

    // Log audit
    await supabase.from('audit_logs').insert({
      entity_type: 'order',
      entity_id: orderId,
      action: 'STOCK_RETURNED_TO_OWNER',
      actor_id: authenticatedUserId,
      after_json: {
        reason: reason || 'Order failed/cancelled',
        returns_created: returnsCreated,
        returns_skipped: returnsSkipped,
      },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Stock returned to owner warehouse`,
        returnsCreated,
        returnsSkipped,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Process return error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
