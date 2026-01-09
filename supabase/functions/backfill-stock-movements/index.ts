import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * One-time backfill function to ensure stock movement consistency:
 * 1. Scan all DELIVERED orders and ensure exactly one DELIVER_DEDUCT per item
 * 2. Scan FAILED/CANCELLED orders and ensure proper RETURN_TO_OWNER if deducted
 * 3. Reverse any duplicate movements
 * 4. Report results
 * 
 * This is an ADMIN-only function for data repair.
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
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();
    
    if (profile?.role !== 'admin') {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin only' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { dryRun = true } = await req.json();
    
    const results = {
      deliveredOrdersScanned: 0,
      missingDeductionsCreated: 0,
      duplicateDeductionsReversed: 0,
      failedOrdersScanned: 0,
      missingReturnsCreated: 0,
      duplicateReturnsReversed: 0,
      errors: [] as string[],
    };

    // PART 1: Process DELIVERED orders
    console.log('Scanning delivered orders...');
    
    const { data: deliveredOrders, error: deliveredError } = await supabase
      .from('orders')
      .select(`
        id,
        salesperson_id,
        fulfillment_warehouse_id,
        stock_deducted,
        order_items (id, product_id, qty)
      `)
      .eq('runner_status', 'DELIVERED')
      .eq('stock_deducted', true);

    if (deliveredError) {
      results.errors.push(`Error fetching delivered orders: ${deliveredError.message}`);
    } else {
      for (const order of deliveredOrders || []) {
        results.deliveredOrdersScanned++;
        
        // Get warehouse
        let warehouseId = order.fulfillment_warehouse_id;
        if (!warehouseId) {
          const { data: spWarehouse } = await supabase
            .from('warehouses')
            .select('id')
            .eq('owner_user_id', order.salesperson_id)
            .eq('warehouse_type', 'SALESPERSON')
            .eq('is_active', true)
            .single();
          warehouseId = spWarehouse?.id;
        }
        
        if (!warehouseId) {
          results.errors.push(`Order ${order.id}: No warehouse found`);
          continue;
        }

        for (const item of order.order_items || []) {
          if (!item.product_id) continue;
          
          // Find all DELIVER_DEDUCT and SALE_DEDUCT movements for this order+product
          const { data: deductions } = await supabase
            .from('stock_movements')
            .select('id, movement_type, qty_change, created_at')
            .or(`order_id.eq.${order.id},reference_id.eq.${item.id}`)
            .eq('product_id', item.product_id)
            .in('movement_type', ['DELIVER_DEDUCT', 'SALE_DEDUCT'])
            .order('created_at', { ascending: true });
          
          if (!deductions || deductions.length === 0) {
            // Missing deduction - create one
            console.log(`Creating missing deduction for order ${order.id}, product ${item.product_id}`);
            
            if (!dryRun) {
              const { error: insertError } = await supabase
                .from('stock_movements')
                .insert({
                  warehouse_id: warehouseId,
                  product_id: item.product_id,
                  movement_type: 'DELIVER_DEDUCT',
                  qty_change: -item.qty,
                  reference_type: 'ORDER',
                  order_id: order.id,
                  created_by: user.id,
                });
              
              if (insertError) {
                results.errors.push(`Order ${order.id}: Failed to create deduction - ${insertError.message}`);
              } else {
                results.missingDeductionsCreated++;
              }
            } else {
              results.missingDeductionsCreated++;
            }
          } else if (deductions.length > 1) {
            // Duplicate deductions - reverse extras
            console.log(`Found ${deductions.length} deductions for order ${order.id}, product ${item.product_id}`);
            
            // Keep the first one, reverse the rest
            for (let i = 1; i < deductions.length; i++) {
              const dup = deductions[i];
              
              if (!dryRun) {
                // Create reversal movement
                const { error: reversalError } = await supabase
                  .from('stock_movements')
                  .insert({
                    warehouse_id: warehouseId,
                    product_id: item.product_id,
                    movement_type: 'REVERSAL',
                    qty_change: Math.abs(dup.qty_change), // Add back
                    reference_type: 'MANUAL',
                    order_id: order.id,
                    created_by: user.id,
                  });
                
                if (reversalError) {
                  results.errors.push(`Order ${order.id}: Failed to reverse duplicate - ${reversalError.message}`);
                } else {
                  results.duplicateDeductionsReversed++;
                }
              } else {
                results.duplicateDeductionsReversed++;
              }
            }
          }
          // Exactly 1 deduction is correct - no action needed
        }
      }
    }

    // PART 2: Process FAILED/CANCELLED orders that had stock deducted
    console.log('Scanning failed/cancelled orders...');
    
    const { data: failedOrders, error: failedError } = await supabase
      .from('orders')
      .select(`
        id,
        salesperson_id,
        fulfillment_warehouse_id,
        stock_deducted,
        runner_status,
        order_items (id, product_id, qty)
      `)
      .in('runner_status', ['FAILED', 'CANCELLED'])
      .eq('stock_deducted', true);

    if (failedError) {
      results.errors.push(`Error fetching failed orders: ${failedError.message}`);
    } else {
      for (const order of failedOrders || []) {
        results.failedOrdersScanned++;
        
        // Get warehouse
        let warehouseId = order.fulfillment_warehouse_id;
        if (!warehouseId) {
          const { data: spWarehouse } = await supabase
            .from('warehouses')
            .select('id')
            .eq('owner_user_id', order.salesperson_id)
            .eq('warehouse_type', 'SALESPERSON')
            .eq('is_active', true)
            .single();
          warehouseId = spWarehouse?.id;
        }
        
        if (!warehouseId) {
          results.errors.push(`Order ${order.id}: No warehouse found for return`);
          continue;
        }

        for (const item of order.order_items || []) {
          if (!item.product_id) continue;
          
          // Check if there was a deduction
          const { data: deductions } = await supabase
            .from('stock_movements')
            .select('id, warehouse_id, qty_change')
            .or(`order_id.eq.${order.id},reference_id.eq.${item.id}`)
            .eq('product_id', item.product_id)
            .in('movement_type', ['DELIVER_DEDUCT', 'SALE_DEDUCT']);
          
          if (!deductions || deductions.length === 0) {
            // No deduction, nothing to return
            continue;
          }
          
          // Check if return already exists
          const { data: returns } = await supabase
            .from('stock_movements')
            .select('id')
            .eq('order_id', order.id)
            .eq('product_id', item.product_id)
            .eq('movement_type', 'RETURN_TO_OWNER');
          
          if (!returns || returns.length === 0) {
            // Missing return - create one
            console.log(`Creating missing return for order ${order.id}, product ${item.product_id}`);
            
            if (!dryRun) {
              // Return to the same warehouse where it was deducted
              const deductWarehouse = deductions[0].warehouse_id;
              
              const { error: returnError } = await supabase
                .from('stock_movements')
                .insert({
                  warehouse_id: deductWarehouse,
                  product_id: item.product_id,
                  movement_type: 'RETURN_TO_OWNER',
                  qty_change: Math.abs(deductions[0].qty_change), // Add back
                  reference_type: 'ORDER',
                  order_id: order.id,
                  created_by: user.id,
                });
              
              if (returnError) {
                results.errors.push(`Order ${order.id}: Failed to create return - ${returnError.message}`);
              } else {
                results.missingReturnsCreated++;
              }
            } else {
              results.missingReturnsCreated++;
            }
          } else if (returns.length > 1) {
            // Duplicate returns - reverse extras
            for (let i = 1; i < returns.length; i++) {
              if (!dryRun) {
                const { error: reversalError } = await supabase
                  .from('stock_movements')
                  .insert({
                    warehouse_id: warehouseId,
                    product_id: item.product_id,
                    movement_type: 'REVERSAL',
                    qty_change: -item.qty, // Deduct back the extra return
                    reference_type: 'MANUAL',
                    order_id: order.id,
                    created_by: user.id,
                  });
                
                if (reversalError) {
                  results.errors.push(`Order ${order.id}: Failed to reverse duplicate return - ${reversalError.message}`);
                } else {
                  results.duplicateReturnsReversed++;
                }
              } else {
                results.duplicateReturnsReversed++;
              }
            }
          }
        }
      }
    }

    // Log audit
    await supabase.from('audit_logs').insert({
      entity_type: 'system',
      entity_id: '00000000-0000-0000-0000-000000000000',
      action: 'STOCK_BACKFILL',
      actor_id: user.id,
      after_json: {
        dry_run: dryRun,
        results,
      },
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        dryRun,
        message: dryRun ? 'Dry run completed - no changes made' : 'Backfill completed',
        results,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Backfill error:', error);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
