-- Blog posts table for AutoSEO webhook integration
-- CRITICAL: Only CREATE new objects. Never DROP/ALTER/DELETE existing tables.

CREATE TABLE IF NOT EXISTS blog_posts (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  content_html TEXT,
  content_markdown TEXT,
  hero_image_url TEXT,
  hero_image_alt TEXT,
  infographic_url TEXT,
  meta_description TEXT,
  meta_keywords TEXT,
  tags TEXT,
  faq_schema JSONB,
  language TEXT DEFAULT 'en',
  reading_time INTEGER,
  published_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  received_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_blog_posts_slug ON blog_posts (slug);
CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at ON blog_posts (published_at DESC);

-- RLS
ALTER TABLE blog_posts ENABLE ROW LEVEL SECURITY;

-- Public read access (anonymous users can read blog posts)
CREATE POLICY "blog_posts_anon_select"
  ON blog_posts FOR SELECT
  TO anon, authenticated
  USING (true);

-- Service role full access (for webhook inserts/updates)
CREATE POLICY "blog_posts_service_role_all"
  ON blog_posts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
