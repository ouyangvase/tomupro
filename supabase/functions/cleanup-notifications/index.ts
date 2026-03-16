import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Delete notifications older than 72 hours
    const cutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();

    const { data, error } = await supabase
      .from('notifications')
      .delete()
      .lt('created_at', cutoff)
      .select('id');

    if (error) throw error;

    const deletedCount = data?.length ?? 0;

    return new Response(
      JSON.stringify({ success: true, deleted: deletedCount, cutoff }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
