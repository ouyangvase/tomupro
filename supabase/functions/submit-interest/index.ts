import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  try {
    const body = await req.json();
    const { full_name, company_name, phone, email, business_type, message } = body;

    // Validate required fields
    if (!full_name || typeof full_name !== 'string' || full_name.trim().length === 0) {
      return json({ error: 'Full name is required' }, 400);
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return json({ error: 'Valid email is required' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const record = {
      full_name: full_name.trim(),
      company_name: company_name?.trim() || null,
      phone: phone?.trim() || null,
      email: email.trim().toLowerCase(),
      business_type: business_type?.trim() || null,
      message: message?.trim() || null,
    };

    const { error: dbError } = await supabase
      .from('interest_leads')
      .insert(record);

    if (dbError) {
      console.error('[submit-interest] DB error:', dbError);
      return json({ error: 'Failed to save submission' }, 500);
    }

    // Send email notification via Resend (non-blocking, graceful fallback)
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey) {
      try {
        const emailHtml = `
          <h2>New TomuPro Interest Registration</h2>
          <table style="border-collapse:collapse;width:100%;max-width:600px;">
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee;">Full Name</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${record.full_name}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee;">Company</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${record.company_name || '-'}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee;">Phone</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${record.phone || '-'}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee;">Email</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${record.email}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee;">Business Type</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${record.business_type || '-'}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;border-bottom:1px solid #eee;">Message</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${record.message || '-'}</td></tr>
            <tr><td style="padding:8px 12px;font-weight:bold;">Submitted</td><td style="padding:8px 12px;">${new Date().toLocaleString('en-US', { timeZone: 'Asia/Brunei' })}</td></tr>
          </table>
        `;

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'TomuPro <noreply@tomu.my>',
            to: ['hello@tomu.my'],
            subject: 'New TomuPro Interest Registration',
            html: emailHtml,
          }),
        });
      } catch (emailErr) {
        console.warn('[submit-interest] Email send failed (non-fatal):', emailErr);
      }
    } else {
      console.log('[submit-interest] RESEND_API_KEY not set, skipping email notification');
    }

    return json({ success: true });
  } catch (err) {
    console.error('[submit-interest] error:', err);
    return json({ error: 'Internal server error' }, 500);
  }
});
