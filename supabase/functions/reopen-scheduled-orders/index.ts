import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // Validate the request is from an authorized source
    const authHeader = req.headers.get('Authorization');
    
    // Check if this is a service role request (for cron jobs)
    const isServiceRole = authHeader === `Bearer ${supabaseServiceRoleKey}`;
    
    // Check if this is an internal Supabase cron request
    const isInternalCron = req.headers.get('x-supabase-request-id') !== null && !authHeader;
    
    // If not service role or internal cron, verify user is admin
    if (!isServiceRole && !isInternalCron) {
      if (!authHeader) {
        console.error('Unauthorized access attempt - no auth header');
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          { 
            status: 401, 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          }
        );
      }
      
      // Verify the user is authenticated and is an admin
      const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } }
      });
      
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
      
      if (authError || !user) {
        console.error('Auth error or no user:', authError?.message);
        return new Response(
          JSON.stringify({ success: false, error: 'Unauthorized' }),
          { 
            status: 401, 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          }
        );
      }
      
      // Check if user is admin
      const { data: profile, error: profileError } = await supabaseClient
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
      
      if (profileError || profile?.role !== 'admin') {
        console.error('Access denied - user is not admin:', user.id, profile?.role);
        return new Response(
          JSON.stringify({ success: false, error: 'Forbidden - Admin access required' }),
          { 
            status: 403, 
            headers: { ...corsHeaders, "Content-Type": "application/json" } 
          }
        );
      }
      
      console.log('Admin user authorized:', user.id);
    } else {
      console.log('Authorized via:', isServiceRole ? 'service role' : 'internal cron');
    }
    
    // Use service role for the actual operation
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Call the database function to reopen scheduled orders
    const { data, error } = await supabase.rpc('reopen_rescheduled_orders');

    if (error) {
      console.error("Error reopening orders:", error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { 
          status: 500, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    console.log("Reopen scheduled orders result:", data);

    return new Response(
      JSON.stringify({ success: true, result: data }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error("Unexpected error:", errorMessage);
    return new Response(
      JSON.stringify({ success: false, error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );
  }
});
