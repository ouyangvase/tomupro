import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SITE_DOMAIN = 'https://tomu.my';

Deno.serve(async (_req) => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: posts } = await supabase
      .from('blog_posts')
      .select('slug, updated_at')
      .order('published_at', { ascending: false });

    const today = new Date().toISOString().split('T')[0];

    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${SITE_DOMAIN}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>${SITE_DOMAIN}/blog</loc>
    <lastmod>${today}</lastmod>
    <changefreq>daily</changefreq>
    <priority>0.8</priority>
  </url>`;

    if (posts) {
      for (const post of posts) {
        const lastmod = post.updated_at
          ? new Date(post.updated_at).toISOString().split('T')[0]
          : today;
        xml += `
  <url>
    <loc>${SITE_DOMAIN}/blog/${post.slug}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
      }
    }

    xml += '\n</urlset>';

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch (err) {
    console.error('[blog-sitemap] error:', err);
    return new Response('<error>Internal server error</error>', {
      status: 500,
      headers: { 'Content-Type': 'application/xml' },
    });
  }
});
