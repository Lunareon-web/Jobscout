-- ── Migration 003: Crawl Companies (eigene Tabelle, kein Konflikt mit Python-Backend) ──
-- Ausführen im Supabase SQL Editor

CREATE TABLE IF NOT EXISTS crawl_companies (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL UNIQUE,
  career_url  text,
  website     text,
  city        text,
  source      text        NOT NULL DEFAULT 'discovered',
  is_active   boolean     NOT NULL DEFAULT true,
  last_crawled timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS crawl_companies_active_idx     ON crawl_companies(is_active);
CREATE INDEX IF NOT EXISTS crawl_companies_career_idx     ON crawl_companies(career_url) WHERE career_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS crawl_companies_created_idx    ON crawl_companies(created_at DESC);
CREATE INDEX IF NOT EXISTS crawl_companies_crawled_idx    ON crawl_companies(last_crawled ASC NULLS FIRST);

ALTER TABLE crawl_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "crawl_companies lesbar"        ON crawl_companies FOR SELECT USING (true);
CREATE POLICY "crawl_companies einfuegen"     ON crawl_companies FOR INSERT WITH CHECK (true);
CREATE POLICY "crawl_companies aktualisieren" ON crawl_companies FOR UPDATE USING (true);
