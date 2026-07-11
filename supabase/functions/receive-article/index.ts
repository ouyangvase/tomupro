import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const WEBHOOK_TOKEN = 'aseo_wh_5534f5ea0043790a5cc235456a44e50b';
const SITE_DOMAIN = 'https://tomu.my';

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function calculateReadingTime(html: string): number {
  const text = html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
  const wordCount = text.split(' ').filter(Boolean).length;
  return Math.max(1, Math.ceil(wordCount / 200));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // Auth check
  const authHeader = req.headers.get('Authorization');
  const token = authHeader?.replace('Bearer ', '');
  if (!token || token !== WEBHOOK_TOKEN) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = await req.json();
    const { event } = body;

    // Test event
    if (event === 'test') {
      return jsonResponse({ url: `${SITE_DOMAIN}/blog/test`, status: 'ok' });
    }

    // Validate required fields
    if (!body.id || !body.title || !body.slug) {
      return jsonResponse({ error: 'Missing required fields: id, title, slug' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const readingTime = body.content_html
      ? calculateReadingTime(body.content_html)
      : null;

    const record = {
      id: body.id,
      title: body.title,
      slug: body.slug,
      content_html: body.content_html || null,
      content_markdown: body.content_markdown || null,
      hero_image_url: body.heroImageUrl || null,
      hero_image_alt: body.heroImageAlt || null,
      infographic_url: body.infographicImageUrl || null,
      meta_description: body.metaDescription || null,
      meta_keywords: body.metaKeywords || null,
      tags: body.wordpressTags || null,
      faq_schema: body.faqSchema || null,
      language: body.languageCode || 'en',
      reading_time: readingTime,
      published_at: body.publishedAt || new Date().toISOString(),
      updated_at: body.updatedAt || new Date().toISOString(),
      created_at: body.createdAt || new Date().toISOString(),
      received_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from('blog_posts')
      .upsert(record, { onConflict: 'id' });

    if (error) {
      console.error('[receive-article] upsert error:', error);
      return jsonResponse({ error: error.message }, 500);
    }

    console.log(`[receive-article] upserted article id=${body.id} slug=${body.slug}`);

    return jsonResponse({ url: `${SITE_DOMAIN}/blog/${body.slug}` });
  } catch (err) {
    console.error('[receive-article] unexpected error:', err);
    return jsonResponse({ error: 'Internal server error' }, 500);
  }
});
