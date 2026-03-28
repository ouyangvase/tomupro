import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ManagerAlert {
  managerId: string;
  managerEmail: string;
  managerName: string;
  highPriorityAgents: { name: string; count: number }[];
  totalActionRequired: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const HIGH_PRIORITY_THRESHOLD = 5;

    // Get all manager groups with members
    const { data: groups, error: groupsError } = await supabase
      .from('manager_groups')
      .select(`
        id,
        manager_user_id,
        manager:profiles!manager_user_id(id, display_name, email)
      `);

    if (groupsError) throw groupsError;

    // Get all group members
    const { data: members, error: membersError } = await supabase
      .from('group_members')
      .select('group_id, member_user_id');

    if (membersError) throw membersError;

    // Get all action required orders
    const { data: actionOrders, error: ordersError } = await supabase
      .from('orders')
      .select('id, salesperson_id')
      .eq('salesperson_action_required', true);

    if (ordersError) throw ordersError;

    // Get salesperson names
    const salespersonIds = [...new Set(actionOrders?.map(o => o.salesperson_id) || [])];
    const { data: salespersons } = await supabase
      .from('user_directory')
      .select('id, display_name')
      .in('id', salespersonIds);

    const spNameMap = new Map(salespersons?.map(sp => [sp.id, sp.display_name]) || []);

    // Build alerts for each manager
    const managerAlerts: ManagerAlert[] = [];

    for (const group of groups || []) {
      const groupMemberIds = members
        ?.filter(m => m.group_id === group.id)
        .map(m => m.member_user_id) || [];

      if (groupMemberIds.length === 0) continue;

      // Count action required per salesperson
      const spCounts: Record<string, number> = {};
      actionOrders?.forEach(order => {
        if (groupMemberIds.includes(order.salesperson_id)) {
          spCounts[order.salesperson_id] = (spCounts[order.salesperson_id] || 0) + 1;
        }
      });

      // Find high priority agents (>= threshold)
      const highPriorityAgents = Object.entries(spCounts)
        .filter(([_, count]) => count >= HIGH_PRIORITY_THRESHOLD)
        .map(([spId, count]) => ({
          name: spNameMap.get(spId) || 'Unknown',
          count,
        }))
        .sort((a, b) => b.count - a.count);

      if (highPriorityAgents.length > 0) {
        const manager = group.manager as any;
        managerAlerts.push({
          managerId: group.manager_user_id,
          managerEmail: manager?.email || '',
          managerName: manager?.display_name || 'Manager',
          highPriorityAgents,
          totalActionRequired: Object.values(spCounts).reduce((a, b) => a + b, 0),
        });
      }
    }

    // Create notifications for managers with high priority agents
    for (const alert of managerAlerts) {
      const agentList = alert.highPriorityAgents
        .map(a => `${a.name} (${a.count})`)
        .join(', ');

      await supabase.from('notifications').insert({
        user_id: alert.managerId,
        title: 'High Action Required Alert',
        message: `${alert.highPriorityAgents.length} agent(s) have ${HIGH_PRIORITY_THRESHOLD}+ pending actions: ${agentList}`,
        type: 'DAILY_DIGEST',
        priority: 'HIGH',
        is_read: false,
      });

      // Sync to Firebase (non-blocking)
      try {
        fetch(`${supabaseUrl}/functions/v1/sync-to-firebase`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            type: 'notification',
            userId: alert.managerId,
            title: 'High Action Required Alert',
            body: `${alert.highPriorityAgents.length} agent(s) have ${HIGH_PRIORITY_THRESHOLD}+ pending actions`,
            notificationType: 'DAILY_DIGEST',
          }),
        }).catch(() => {});
      } catch (_) {
        // non-blocking
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        alertsSent: managerAlerts.length,
        managers: managerAlerts.map(a => a.managerName),
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
