import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UserMetrics {
  userId: string;
  displayName: string;
  role: string;
  bookingDue: number;
  bookingOverdue: number;
  readyNotAssigned: number;
  disputeOpen: number;
  pendingReconciliation: number;
  deliveredToday: number;
  failedToday: number;
  pendingClaimAck: number;
  assignedDeliveries: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Validate the request is from an authorized source (cron job or admin with service key)
    const authHeader = req.headers.get('Authorization');
    const expectedKey = `Bearer ${supabaseServiceKey}`;
    
    // Allow requests with service role key OR from internal cron (no auth header but from Supabase infrastructure)
    const isServiceRole = authHeader === expectedKey;
    const isInternalCron = !authHeader && req.headers.get('x-supabase-request-id');
    
    if (!isServiceRole && !isInternalCron) {
      console.error('Unauthorized access attempt to generate-daily-digest');
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Authorized request received, generating daily digest...');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const today = new Date().toISOString().split('T')[0];
    const twoDaysFromNow = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Get all active users
    const { data: users } = await supabase
      .from('profiles')
      .select('id, display_name, role')
      .eq('is_active', true);

    if (!users) {
      return new Response(JSON.stringify({ success: false, error: 'No users found' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const salespersons = users.filter(u => u.role === 'salesperson');
    const runners = users.filter(u => u.role === 'runner');
    const managers = users.filter(u => u.role === 'manager');
    const admins = users.filter(u => u.role === 'admin');

    // Calculate metrics for each salesperson
    const salespersonMetrics: UserMetrics[] = [];
    for (const sp of salespersons) {
      const { data: orders } = await supabase
        .from('orders')
        .select('id, status, runner_status, reconciliation_status, expected_pickup_date, runner_id')
        .eq('salesperson_id', sp.id);

      const bookingOrders = orders?.filter(o => o.status === 'BOOKING') || [];
      const metrics: UserMetrics = {
        userId: sp.id,
        displayName: sp.display_name,
        role: 'salesperson',
        bookingDue: bookingOrders.filter(o => o.expected_pickup_date && o.expected_pickup_date <= twoDaysFromNow && o.expected_pickup_date >= today).length,
        bookingOverdue: bookingOrders.filter(o => o.expected_pickup_date && o.expected_pickup_date < today).length,
        readyNotAssigned: orders?.filter(o => o.status === 'READY' && o.runner_status === 'UNASSIGNED').length || 0,
        disputeOpen: orders?.filter(o => o.reconciliation_status === 'DISPUTE').length || 0,
        pendingReconciliation: orders?.filter(o => o.runner_status === 'DELIVERED' && o.reconciliation_status !== 'CLAIMED').length || 0,
        deliveredToday: 0,
        failedToday: 0,
        pendingClaimAck: 0,
        assignedDeliveries: 0,
      };
      salespersonMetrics.push(metrics);

      // Store snapshot
      await supabase.from('daily_task_snapshots').upsert({
        snapshot_date: today,
        role: 'salesperson',
        owner_user_id: sp.id,
        metrics: {
          booking_due: metrics.bookingDue,
          booking_overdue: metrics.bookingOverdue,
          ready_not_assigned: metrics.readyNotAssigned,
          dispute_open: metrics.disputeOpen,
          pending_reconciliation: metrics.pendingReconciliation,
        },
      }, { onConflict: 'snapshot_date,owner_user_id' });

      // Create salesperson digest notification
      const totalPending = metrics.bookingDue + metrics.bookingOverdue + metrics.readyNotAssigned + metrics.disputeOpen;
      if (totalPending > 0) {
        await supabase.from('notifications').insert({
          user_id: sp.id,
          title: 'Daily Digest',
          message: `You have ${totalPending} pending items: ${metrics.bookingDue} due soon, ${metrics.bookingOverdue} overdue, ${metrics.readyNotAssigned} not assigned, ${metrics.disputeOpen} disputes.`,
          type: 'DAILY_DIGEST',
          priority: metrics.bookingOverdue > 0 || metrics.disputeOpen > 0 ? 'HIGH' : 'MEDIUM',
        });
      }
    }

    // Calculate metrics for each runner
    for (const runner of runners) {
      const { data: orders } = await supabase
        .from('orders')
        .select('id, runner_status, reconciliation_status, delivered_at')
        .eq('runner_id', runner.id);

      const { data: claimBatches } = await supabase
        .from('claim_batches')
        .select('id')
        .eq('runner_id', runner.id)
        .eq('status', 'ADMIN_ACK_PENDING');

      const todayStart = new Date(today).toISOString();
      const metrics: UserMetrics = {
        userId: runner.id,
        displayName: runner.display_name,
        role: 'runner',
        bookingDue: 0,
        bookingOverdue: 0,
        readyNotAssigned: 0,
        disputeOpen: orders?.filter(o => o.reconciliation_status === 'DISPUTE').length || 0,
        pendingReconciliation: 0,
        assignedDeliveries: orders?.filter(o => ['ASSIGNED', 'TAKEN'].includes(o.runner_status)).length || 0,
        deliveredToday: orders?.filter(o => o.runner_status === 'DELIVERED' && o.delivered_at && o.delivered_at >= todayStart).length || 0,
        failedToday: orders?.filter(o => o.runner_status === 'FAILED_DELIVERY').length || 0,
        pendingClaimAck: claimBatches?.length || 0,
      };

      // Store snapshot
      await supabase.from('daily_task_snapshots').upsert({
        snapshot_date: today,
        role: 'runner',
        owner_user_id: runner.id,
        metrics: {
          assigned_deliveries: metrics.assignedDeliveries,
          delivered_today: metrics.deliveredToday,
          failed_today: metrics.failedToday,
          pending_claim_ack: metrics.pendingClaimAck,
          dispute_open: metrics.disputeOpen,
        },
      }, { onConflict: 'snapshot_date,owner_user_id' });

      // Create runner digest notification
      if (metrics.assignedDeliveries > 0 || metrics.pendingClaimAck > 0) {
        await supabase.from('notifications').insert({
          user_id: runner.id,
          title: 'Daily Digest',
          message: `You have ${metrics.assignedDeliveries} pending deliveries, ${metrics.pendingClaimAck} claim batches pending admin acknowledgment.`,
          type: 'DAILY_DIGEST',
          priority: 'MEDIUM',
        });
      }
    }

    // Create manager digest
    for (const manager of managers) {
      const totalOverdue = salespersonMetrics.reduce((sum, m) => sum + m.bookingOverdue, 0);
      const totalDisputes = salespersonMetrics.reduce((sum, m) => sum + m.disputeOpen, 0);
      const totalPending = salespersonMetrics.reduce((sum, m) => sum + m.bookingDue + m.readyNotAssigned, 0);

      await supabase.from('notifications').insert({
        user_id: manager.id,
        title: 'Manager Daily Digest',
        message: `Team overview: ${totalOverdue} overdue bookings, ${totalDisputes} open disputes, ${totalPending} pending items across ${salespersonMetrics.length} salespersons.`,
        type: 'DAILY_DIGEST',
        priority: totalOverdue > 0 || totalDisputes > 0 ? 'HIGH' : 'MEDIUM',
      });
    }

    // Create admin digest
    for (const admin of admins) {
      const { data: pendingClaims } = await supabase
        .from('claim_batches')
        .select('id')
        .eq('status', 'ADMIN_ACK_PENDING');

      const totalOverdue = salespersonMetrics.reduce((sum, m) => sum + m.bookingOverdue, 0);
      const totalDisputes = salespersonMetrics.reduce((sum, m) => sum + m.disputeOpen, 0);

      await supabase.from('notifications').insert({
        user_id: admin.id,
        title: 'Admin Daily Digest',
        message: `System overview: ${pendingClaims?.length || 0} claim batches pending, ${totalOverdue} overdue bookings, ${totalDisputes} open disputes.`,
        type: 'DAILY_DIGEST',
        priority: (pendingClaims?.length || 0) > 0 || totalOverdue > 0 ? 'HIGH' : 'MEDIUM',
      });
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        generated: {
          salespersons: salespersonMetrics.length,
          runners: runners.length,
          managers: managers.length,
          admins: admins.length,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
