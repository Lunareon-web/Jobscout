-- ── Migration 003: Companies erweitern ─────────────────────────────
-- companies-Tabelle existiert bereits vom Python-Backend.
-- Nur fehlende Spalten hinzufügen.

ALTER TABLE companies ADD COLUMN IF NOT EXISTS career_url   text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS source       text NOT NULL DEFAULT 'discovered';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS last_crawled timestamptz;

CREATE INDEX IF NOT EXISTS companies_is_active_idx  ON companies(is_active);
CREATE INDEX IF NOT EXISTS companies_career_url_idx ON companies(career_url) WHERE career_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS companies_created_idx    ON companies(created_at DESC);
