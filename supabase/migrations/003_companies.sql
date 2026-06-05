-- ── Migration 003: Companies Table ─────────────────────────────
-- Ausführen im Supabase SQL Editor

CREATE TABLE IF NOT EXISTS companies (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  website     text,
  career_url  text,
  city        text,
  source      text        NOT NULL DEFAULT 'discovered',  -- 'ba' | 'manual' | 'discovered'
  status      text        NOT NULL DEFAULT 'active',      -- 'active' | 'inactive'
  last_crawled timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(name)
);

CREATE INDEX IF NOT EXISTS companies_status_idx     ON companies(status);
CREATE INDEX IF NOT EXISTS companies_career_url_idx ON companies(career_url) WHERE career_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS companies_created_idx    ON companies(created_at DESC);

-- RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Companies öffentlich lesbar"
  ON companies FOR SELECT USING (true);

CREATE POLICY "Service kann companies einfügen"
  ON companies FOR INSERT WITH CHECK (true);

CREATE POLICY "Service kann companies aktualisieren"
  ON companies FOR UPDATE USING (true);
