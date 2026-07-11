-- Interest Leads table for contact/register interest form
CREATE TABLE IF NOT EXISTS interest_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  company_name TEXT,
  phone TEXT,
  email TEXT NOT NULL,
  business_type TEXT,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'closed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE interest_leads ENABLE ROW LEVEL SECURITY;

-- Anon users can insert (public form submission)
CREATE POLICY "anon_insert_interest_leads" ON interest_leads
  FOR INSERT TO anon WITH CHECK (true);

-- Authenticated users can read all leads
CREATE POLICY "authenticated_select_interest_leads" ON interest_leads
  FOR SELECT TO authenticated USING (true);

-- Authenticated users can update status
CREATE POLICY "authenticated_update_interest_leads" ON interest_leads
  FOR UPDATE TO authenticated USING (true);

-- Service role full access
CREATE POLICY "service_role_all_interest_leads" ON interest_leads
  FOR ALL TO service_role USING (true);

-- Index for sorting by date
CREATE INDEX IF NOT EXISTS idx_interest_leads_created_at ON interest_leads (created_at DESC);
