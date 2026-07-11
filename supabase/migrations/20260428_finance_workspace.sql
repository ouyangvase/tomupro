-- Finance Workspace Linking System Migration
-- Run this in the Supabase SQL Editor

-- 1. Add finance_viewer to app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'finance_viewer';

-- 2. Create new enum types
DO $$ BEGIN
  CREATE TYPE company_member_role AS ENUM ('owner', 'admin', 'runner', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE company_member_status AS ENUM ('pending', 'active', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE finance_claim_status AS ENUM ('draft', 'pending', 'approved', 'rejected', 'paid', 'voided');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE finance_claim_category AS ENUM ('fuel', 'packaging', 'toll', 'parking', 'equipment', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE finance_transaction_type AS ENUM ('income', 'expense', 'transfer');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE finance_transaction_status AS ENUM ('pending', 'confirmed', 'voided');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE finance_report_status AS ENUM ('draft', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. Create tables

-- Companies (workspace container)
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  owner_user_id UUID NOT NULL REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Company members
CREATE TABLE IF NOT EXISTS company_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  role company_member_role NOT NULL DEFAULT 'runner',
  invited_by UUID REFERENCES profiles(id),
  status company_member_status NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(company_id, user_id)
);

-- Finance claims (expense claims submitted by runners)
CREATE TABLE IF NOT EXISTS finance_claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  claim_no TEXT NOT NULL,
  runner_user_id UUID NOT NULL REFERENCES profiles(id),
  tracking_number TEXT,
  order_id UUID REFERENCES orders(id),
  claim_date DATE NOT NULL DEFAULT CURRENT_DATE,
  category finance_claim_category NOT NULL DEFAULT 'other',
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_method TEXT,
  receipt_url TEXT,
  notes TEXT,
  status finance_claim_status NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  paid_by UUID REFERENCES profiles(id),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- No self-approval
  CONSTRAINT no_self_approval CHECK (approved_by IS NULL OR approved_by != runner_user_id)
);

-- Finance transactions (auto-created from approved claims or manual entries)
CREATE TABLE IF NOT EXISTS finance_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  source_type TEXT NOT NULL DEFAULT 'manual',
  source_id UUID,
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  type finance_transaction_type NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  amount NUMERIC NOT NULL DEFAULT 0,
  status finance_transaction_status NOT NULL DEFAULT 'pending',
  created_by UUID NOT NULL REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Finance monthly reports (snapshots, visible to finance_viewer when closed)
CREATE TABLE IF NOT EXISTS finance_monthly_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  report_month TEXT NOT NULL, -- YYYY-MM format
  total_income NUMERIC NOT NULL DEFAULT 0,
  total_expense NUMERIC NOT NULL DEFAULT 0,
  net_profit NUMERIC NOT NULL DEFAULT 0,
  gross_profit NUMERIC NOT NULL DEFAULT 0,
  profit_margin NUMERIC NOT NULL DEFAULT 0,
  closed_by UUID REFERENCES profiles(id),
  closed_at TIMESTAMPTZ,
  status finance_report_status NOT NULL DEFAULT 'draft',
  UNIQUE(company_id, report_month)
);

-- Finance audit logs
CREATE TABLE IF NOT EXISTS finance_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id),
  action TEXT NOT NULL,
  module TEXT NOT NULL,
  record_id UUID,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Indexes
CREATE INDEX IF NOT EXISTS idx_company_members_company ON company_members(company_id);
CREATE INDEX IF NOT EXISTS idx_company_members_user ON company_members(user_id);
CREATE INDEX IF NOT EXISTS idx_finance_claims_company_status ON finance_claims(company_id, status);
CREATE INDEX IF NOT EXISTS idx_finance_claims_runner ON finance_claims(runner_user_id);
CREATE INDEX IF NOT EXISTS idx_finance_transactions_company_date ON finance_transactions(company_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_finance_monthly_reports_company ON finance_monthly_reports(company_id, report_month);
CREATE INDEX IF NOT EXISTS idx_finance_audit_logs_company ON finance_audit_logs(company_id, created_at DESC);

-- 5. Enable RLS on all new tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_monthly_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance_audit_logs ENABLE ROW LEVEL SECURITY;

-- 6. Helper function: get user's company membership
CREATE OR REPLACE FUNCTION get_user_company_id(p_user_id UUID)
RETURNS UUID STABLE SECURITY DEFINER AS $$
  SELECT company_id FROM company_members
  WHERE user_id = p_user_id AND status = 'active'
  LIMIT 1;
$$ LANGUAGE SQL;

CREATE OR REPLACE FUNCTION get_user_company_role(p_user_id UUID)
RETURNS company_member_role STABLE SECURITY DEFINER AS $$
  SELECT role FROM company_members
  WHERE user_id = p_user_id AND status = 'active'
  LIMIT 1;
$$ LANGUAGE SQL;

-- 7. RLS Policies

-- Companies: members can SELECT, owner can UPDATE
CREATE POLICY "Members can view their company" ON companies
  FOR SELECT USING (
    id IN (SELECT company_id FROM company_members WHERE user_id = auth.uid() AND status = 'active')
  );

CREATE POLICY "Authenticated users can create companies" ON companies
  FOR INSERT WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Owner can update company" ON companies
  FOR UPDATE USING (owner_user_id = auth.uid());

-- Company Members: same-company members can SELECT, admin/owner can INSERT/UPDATE
CREATE POLICY "Members can view same-company members" ON company_members
  FOR SELECT USING (
    company_id IN (SELECT company_id FROM company_members cm WHERE cm.user_id = auth.uid() AND cm.status = 'active')
  );

CREATE POLICY "Admin/Owner can manage members" ON company_members
  FOR INSERT WITH CHECK (
    get_user_company_role(auth.uid()) IN ('owner', 'admin')
    AND company_id = get_user_company_id(auth.uid())
  );

CREATE POLICY "Admin/Owner can update members" ON company_members
  FOR UPDATE USING (
    get_user_company_role(auth.uid()) IN ('owner', 'admin')
    AND company_id = get_user_company_id(auth.uid())
  );

-- Also allow the system to insert the owner when creating a company
CREATE POLICY "Creator can add self as owner" ON company_members
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND role = 'owner'
  );

-- Finance Claims: admin sees all company, runner sees own
CREATE POLICY "Admin sees all company claims" ON finance_claims
  FOR SELECT USING (
    company_id = get_user_company_id(auth.uid())
    AND get_user_company_role(auth.uid()) IN ('owner', 'admin')
  );

CREATE POLICY "Runner sees own claims" ON finance_claims
  FOR SELECT USING (runner_user_id = auth.uid());

CREATE POLICY "Runner can submit claims" ON finance_claims
  FOR INSERT WITH CHECK (
    runner_user_id = auth.uid()
    AND company_id = get_user_company_id(auth.uid())
  );

CREATE POLICY "Admin can update claims" ON finance_claims
  FOR UPDATE USING (
    company_id = get_user_company_id(auth.uid())
    AND get_user_company_role(auth.uid()) IN ('owner', 'admin')
  );

-- Finance Transactions: admin only
CREATE POLICY "Admin can view transactions" ON finance_transactions
  FOR SELECT USING (
    company_id = get_user_company_id(auth.uid())
    AND get_user_company_role(auth.uid()) IN ('owner', 'admin')
  );

CREATE POLICY "Admin can create transactions" ON finance_transactions
  FOR INSERT WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND get_user_company_role(auth.uid()) IN ('owner', 'admin')
  );

-- Finance Monthly Reports: admin sees all, viewer sees closed only
CREATE POLICY "Admin can manage reports" ON finance_monthly_reports
  FOR ALL USING (
    company_id = get_user_company_id(auth.uid())
    AND get_user_company_role(auth.uid()) IN ('owner', 'admin')
  );

CREATE POLICY "Viewer sees closed reports" ON finance_monthly_reports
  FOR SELECT USING (
    company_id = get_user_company_id(auth.uid())
    AND get_user_company_role(auth.uid()) = 'viewer'
    AND status = 'closed'
  );

-- Finance Audit Logs: admin read-only
CREATE POLICY "Admin can view audit logs" ON finance_audit_logs
  FOR SELECT USING (
    company_id = get_user_company_id(auth.uid())
    AND get_user_company_role(auth.uid()) IN ('owner', 'admin')
  );

CREATE POLICY "Any member can insert audit logs" ON finance_audit_logs
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND company_id = get_user_company_id(auth.uid())
  );

-- 8. Auto-create transaction when claim is approved
CREATE OR REPLACE FUNCTION auto_create_transaction_on_claim_approval()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    INSERT INTO finance_transactions (
      company_id, source_type, source_id, transaction_date, type, category,
      description, amount, status, created_by
    ) VALUES (
      NEW.company_id, 'claim', NEW.id, NEW.claim_date, 'expense', NEW.category::TEXT,
      'Expense claim: ' || NEW.description, NEW.amount, 'confirmed', NEW.approved_by
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_claim_approval ON finance_claims;
CREATE TRIGGER trg_claim_approval
  AFTER UPDATE ON finance_claims
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_transaction_on_claim_approval();

-- 9. Updated_at trigger for companies and finance_claims
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_companies_updated_at ON companies;
CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_finance_claims_updated_at ON finance_claims;
CREATE TRIGGER trg_finance_claims_updated_at
  BEFORE UPDATE ON finance_claims
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
