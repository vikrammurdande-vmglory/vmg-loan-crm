CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'SALES', active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS customers (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, phone TEXT, email TEXT, pan TEXT, city TEXT, employment_type TEXT, monthly_income NUMERIC(14,2), created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;
CREATE TABLE IF NOT EXISTS leads (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID REFERENCES customers(id) ON DELETE CASCADE, source TEXT, status TEXT NOT NULL DEFAULT 'NEW', assigned_to UUID REFERENCES users(id), notes TEXT, next_followup TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS lenders (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), name TEXT NOT NULL, contact TEXT, active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS loan_products (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), lender_id UUID REFERENCES lenders(id) ON DELETE CASCADE, name TEXT NOT NULL, loan_type TEXT NOT NULL, min_amount NUMERIC(14,2), max_amount NUMERIC(14,2), roi NUMERIC(6,3), tenure_months INT, commission_pct NUMERIC(6,3), active BOOLEAN DEFAULT TRUE);
CREATE TABLE IF NOT EXISTS applications (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID REFERENCES customers(id) ON DELETE CASCADE, product_id UUID REFERENCES loan_products(id), assigned_to UUID REFERENCES users(id), application_no TEXT UNIQUE NOT NULL, requested_amount NUMERIC(14,2), sanctioned_amount NUMERIC(14,2), disbursed_amount NUMERIC(14,2), status TEXT NOT NULL DEFAULT 'NEW', remarks TEXT, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS followups (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), lead_id UUID REFERENCES leads(id) ON DELETE CASCADE, assigned_to UUID REFERENCES users(id), due_at TIMESTAMPTZ NOT NULL, outcome TEXT, notes TEXT, completed BOOLEAN DEFAULT FALSE, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS documents (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), customer_id UUID REFERENCES customers(id) ON DELETE CASCADE, application_id UUID REFERENCES applications(id) ON DELETE CASCADE, document_type TEXT NOT NULL, object_key TEXT NOT NULL, original_name TEXT, mime_type TEXT, created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS commissions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), application_id UUID REFERENCES applications(id) ON DELETE CASCADE, gross_amount NUMERIC(14,2) DEFAULT 0, employee_incentive NUMERIC(14,2) DEFAULT 0, net_amount NUMERIC(14,2) DEFAULT 0, status TEXT DEFAULT 'PENDING', created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS audit_logs (id BIGSERIAL PRIMARY KEY, user_id UUID REFERENCES users(id), action TEXT NOT NULL, entity TEXT, entity_id TEXT, ip TEXT, created_at TIMESTAMPTZ DEFAULT now());
INSERT INTO lenders(name,contact) SELECT 'Demo Bank','demo@example.com' WHERE NOT EXISTS (SELECT 1 FROM lenders);

CREATE TABLE IF NOT EXISTS cibil_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  application_id UUID REFERENCES applications(id) ON DELETE SET NULL,
  uploaded_by UUID REFERENCES users(id),
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  report_date DATE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  object_key TEXT,
  file_size BIGINT,
  score INT,
  total_outstanding NUMERIC(16,2),
  total_monthly_emi NUMERIC(16,2),
  total_overdue NUMERIC(16,2),
  max_dpd INT,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  extraction_confidence INT,
  extraction_note TEXT,
  accepted_final BOOLEAN NOT NULL DEFAULT FALSE,
  accepted_at TIMESTAMPTZ,
  accepted_by UUID REFERENCES users(id) ON DELETE SET NULL,
  review_started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cibil_reports_customer ON cibil_reports(customer_id, created_at DESC);

CREATE TABLE IF NOT EXISTS cibil_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES cibil_reports(id) ON DELETE CASCADE,
  lender TEXT,
  loan_type TEXT,
  account_number_masked TEXT,
  sanctioned_amount NUMERIC(16,2),
  outstanding_amount NUMERIC(16,2),
  emi NUMERIC(16,2),
  overdue_amount NUMERIC(16,2),
  dpd INT,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cibil_accounts_report ON cibil_accounts(report_id);

ALTER TABLE users ADD COLUMN IF NOT EXISTS manager_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS mother_maiden_name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS spouse_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS assignment_status TEXT NOT NULL DEFAULT 'UNASSIGNED';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS stage TEXT NOT NULL DEFAULT 'NEW LEAD';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_size BIGINT;
CREATE TABLE IF NOT EXISTS lead_comments (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,user_id UUID REFERENCES users(id),comment TEXT,stage TEXT,created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS customer_public_links (id UUID PRIMARY KEY DEFAULT gen_random_uuid(),customer_id UUID UNIQUE NOT NULL REFERENCES customers(id) ON DELETE CASCADE,token_hash TEXT UNIQUE NOT NULL,expires_at TIMESTAMPTZ NOT NULL,created_by UUID REFERENCES users(id),created_at TIMESTAMPTZ DEFAULT now());
CREATE INDEX IF NOT EXISTS idx_users_manager ON users(manager_id) WHERE active=true AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_assignment ON leads(assigned_to,assignment_status);
CREATE INDEX IF NOT EXISTS idx_lead_comments_lead ON lead_comments(lead_id,created_at DESC);

CREATE INDEX IF NOT EXISTS idx_followups_assigned_due ON followups(assigned_to,completed,due_at);

CREATE TABLE IF NOT EXISTS company_profile (id INT PRIMARY KEY DEFAULT 1, phone TEXT, whatsapp_number TEXT, email TEXT, website TEXT, facebook_page TEXT, instagram_page TEXT, address TEXT, logo_data BYTEA, logo_mime_type TEXT, updated_at TIMESTAMPTZ DEFAULT now());
INSERT INTO company_profile(id) VALUES(1) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS customer_change_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  changed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL DEFAULT 'UPDATED',
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  before_data JSONB,
  after_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_customer_change_history_customer ON customer_change_history(customer_id, created_at DESC);

ALTER TABLE cibil_reports ADD COLUMN IF NOT EXISTS review_started_at TIMESTAMPTZ;

ALTER TABLE cibil_accounts ADD COLUMN IF NOT EXISTS source_data JSONB;
CREATE INDEX IF NOT EXISTS idx_cibil_accounts_source_data ON cibil_accounts USING GIN (source_data);
