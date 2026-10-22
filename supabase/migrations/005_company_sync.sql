-- ── Migration 005: Company-Sync ─────────────────────────────────────
-- Stellt sicher, dass `companies` alle benötigte Spalten hat und
-- `crawl_companies` existiert (für den Karriere-Seiten-Crawl).

-- Companies: sicherstellen dass alle Spalten vorhanden sind
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS company_id text;
CREATE INDEX IF NOT EXISTS jobs_company_id_idx ON jobs(company_id);

-- crawl_companies: Quelle für den Karriere-Seiten-Crawl
CREATE TABLE IF NOT EXISTS crawl_companies (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL UNIQUE,
  career_url  text,
  city        text,
  source      text        NOT NULL DEFAULT 'manual',
  is_active   boolean     NOT NULL DEFAULT true,
  last_crawled timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS crawl_companies_name_idx ON crawl_companies(name);
CREATE INDEX IF NOT EXISTS crawl_companies_is_active_idx ON crawl_companies(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS crawl_companies_last_crawled_idx ON crawl_companies(last_crawled);

-- RLS
ALTER TABLE crawl_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Crawl companies öffentlich lesbar"
  ON crawl_companies FOR SELECT USING (true);
CREATE POLICY IF NOT EXISTS "Service kann crawl_companies verwalten"
  ON crawl_companies FOR ALL USING (true);

-- companies: sicherstellen dass alle Spalten vorhanden sind (002 hat sie angelegt, aber sicher ist sicher)
ALTER TABLE companies ADD COLUMN IF NOT EXISTS website text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS industry text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS employee_range text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS services text[] DEFAULT '{}';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS score integer NOT NULL DEFAULT 0;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'D';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS last_enriched_at timestamptz;
CREATE INDEX IF NOT EXISTS companies_name_idx ON companies(name);
CREATE INDEX IF NOT EXISTS companies_score_idx ON companies(score DESC);
CREATE INDEX IF NOT EXISTS companies_priority_idx ON companies(priority);
CREATE INDEX IF NOT EXISTS companies_is_active_idx ON companies(is_active) WHERE is_active = true;
