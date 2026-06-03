-- ── Migration 002: Crawl-Tracking ──────────────────────────────
-- Ausführen im Supabase SQL Editor

-- Crawl-Runs: jede automatische Crawler-Ausführung wird geloggt
CREATE TABLE IF NOT EXISTS crawl_runs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  source      text        NOT NULL,  -- 'ba' | 'portals' | 'firmenseiten'
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  job_count   int         NOT NULL DEFAULT 0,   -- Anzahl verarbeitete Jobs
  new_count   int         NOT NULL DEFAULT 0,   -- Anzahl neu in DB
  status      text        NOT NULL DEFAULT 'running',  -- running | done | error
  error       text
);

CREATE INDEX IF NOT EXISTS crawl_runs_source_idx  ON crawl_runs(source, started_at DESC);
CREATE INDEX IF NOT EXISTS crawl_runs_started_idx ON crawl_runs(started_at DESC);

-- Neue Spalten für jobs-Tabelle (falls noch nicht vorhanden)
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS found_at  timestamptz NOT NULL DEFAULT now();

-- Optimierte Indizes
CREATE INDEX IF NOT EXISTS jobs_is_active_idx ON jobs(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS jobs_found_at_idx  ON jobs(found_at DESC);
CREATE INDEX IF NOT EXISTS jobs_quelle_idx    ON jobs(quelle);

-- RLS für crawl_runs
ALTER TABLE crawl_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Crawl runs öffentlich lesbar"
  ON crawl_runs FOR SELECT USING (true);

CREATE POLICY "Service kann crawl_runs einfügen"
  ON crawl_runs FOR INSERT WITH CHECK (true);

CREATE POLICY "Service kann crawl_runs aktualisieren"
  ON crawl_runs FOR UPDATE USING (true);
