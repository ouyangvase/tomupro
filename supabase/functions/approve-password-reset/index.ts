import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is admin via JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check caller is admin
    const { data: callerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .single();

    if (callerProfile?.role !== 'admin') {
      return new Response(JSON.stringify({ error: 'Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { request_id } = await req.json();
    if (!request_id) {
      return new Response(JSON.stringify({ error: 'Missing request_id' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch the pending request
    const { data: resetRequest, error: fetchError } = await supabase
      .from('password_reset_requests')
      .select('*')
      .eq('id', request_id)
      .eq('status', 'pending')
      .single();

    if (fetchError || !resetRequest) {
      return new Response(JSON.stringify({ error: 'Request not found or already processed' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Reset the user's auth password to 12345678
    const { error: updateAuthError } = await supabase.auth.admin.updateUserById(
      resetRequest.user_id,
      { password: '12345678' }
    );

    if (updateAuthError) {
      console.error('Failed to reset auth password:', updateAuthError);
      return new Response(JSON.stringify({ error: 'Failed to reset password' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Set force_password_reset flag on profile
    const { error: profileError } = await supabase
      .from('profiles')
      .update({
        force_password_reset: true,
        force_password_reset_at: new Date().toISOString(),
        force_password_reset_by: caller.id,
      })
      .eq('id', resetRequest.user_id);

    if (profileError) {
      console.error('Failed to set force_password_reset:', profileError);
    }

    // Mark request as approved
    const { error: resolveError } = await supabase
      .from('password_reset_requests')
      .update({
        status: 'approved',
        resolved_by: caller.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', request_id);

    if (resolveError) {
      console.error('Failed to update request status:', resolveError);
    }

    // Notify the requesting user
    await supabase.from('notifications').insert({
      user_id: resetRequest.user_id,
      title: 'Password Reset Approved',
      message: 'Your password has been reset. Please log in with the temporary password and set a new one.',
      type: 'SYSTEM',
      priority: 'HIGH',
      is_read: false,
      entity_type: 'PASSWORD_RESET',
    });

    // Log audit entry
    await supabase.from('audit_logs').insert({
      actor_id: caller.id,
      entity_type: 'user',
      entity_id: resetRequest.user_id,
      action: 'PASSWORD_RESET_APPROVED',
      after_json: {
        email: resetRequest.email,
        approved_by: caller.id,
        approved_at: new Date().toISOString(),
      },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('approve-password-reset error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
