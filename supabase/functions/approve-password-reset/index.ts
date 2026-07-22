import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEFAULT_TEMPORARY_PASSWORD = 'Tomu@12345678';

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const temporaryPassword = Deno.env.get('PASSWORD_RESET_TEMPORARY_PASSWORD') || DEFAULT_TEMPORARY_PASSWORD;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Missing authorization' }, 401);
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await authClient.auth.getUser();
    if (authError || !caller) {
      return jsonResponse({ error: 'Invalid token' }, 401);
    }

    const { data: callerProfile, error: callerProfileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', caller.id)
      .maybeSingle();

    if (callerProfileError) {
      console.error('Failed to load caller profile:', callerProfileError);
      return jsonResponse({ error: 'Unable to verify admin access' }, 500);
    }

    if (callerProfile?.role !== 'admin') {
      return jsonResponse({ error: 'Admin access required' }, 403);
    }

    let requestId: string | undefined;
    try {
      const body = await req.json();
      requestId = body?.request_id;
    } catch {
      return jsonResponse({ error: 'Invalid request body' }, 400);
    }

    if (!requestId) {
      return jsonResponse({ error: 'Missing request_id' }, 400);
    }

    const { data: resetRequest, error: fetchError } = await supabase
      .from('password_reset_requests')
      .select('*')
      .eq('id', requestId)
      .maybeSingle();

    if (fetchError || !resetRequest) {
      console.error('Failed to fetch password reset request:', fetchError);
      return jsonResponse({ error: 'Request not found' }, 404);
    }

    if (resetRequest.status !== 'pending') {
      return jsonResponse({
        success: true,
        already_processed: true,
        status: resetRequest.status,
        temporary_password: temporaryPassword,
      });
    }

    const { error: updateAuthError } = await supabase.auth.admin.updateUserById(
      resetRequest.user_id,
      { password: temporaryPassword }
    );

    if (updateAuthError) {
      console.error('Failed to reset auth password:', updateAuthError);
      return jsonResponse({ error: updateAuthError.message || 'Failed to reset password' }, 500);
    }

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
      return jsonResponse({ error: 'Password was reset, but the profile reset flag could not be saved' }, 500);
    }

    const { error: resolveError } = await supabase
      .from('password_reset_requests')
      .update({
        status: 'approved',
        resolved_by: caller.id,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', requestId);

    if (resolveError) {
      console.error('Failed to update request status:', resolveError);
      return jsonResponse({ error: 'Password was reset, but the request status could not be saved' }, 500);
    }

    await supabase.from('notifications').insert({
      user_id: resetRequest.user_id,
      title: 'Password Reset Approved',
      message: `Your password has been reset. Please log in with the temporary password (${temporaryPassword}) and set a new one.`,
      type: 'SYSTEM',
      priority: 'HIGH',
      is_read: false,
      entity_type: 'PASSWORD_RESET',
    });

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

    return jsonResponse({
      success: true,
      temporary_password: temporaryPassword,
    });
  } catch (err) {
    console.error('approve-password-reset error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
