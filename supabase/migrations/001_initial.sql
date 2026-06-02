-- Job-Scout Düsseldorf — Supabase Schema
-- Run this in the Supabase SQL Editor

-- Search runs (history)
create table if not exists search_runs (
  id uuid primary key default gen_random_uuid(),
  config jsonb not null default '{}',
  result_count integer not null default 0,
  sources_log jsonb not null default '[]',
  created_at timestamptz not null default now()
);

-- Jobs
create table if not exists jobs (
  id text primary key,
  titel text not null,
  unternehmen text not null default '',
  ort text not null default '',
  plz text,
  datum date,
  url text not null default '',
  quelle text not null default '',
  beschreibung text,
  arbeitszeit text,
  kategorie text not null default 'sonstiges',
  search_run_id uuid references search_runs(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Favorites (per user, anonymous via localStorage ID)
create table if not exists favorites (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,  -- localStorage device ID (no auth required)
  job_id text not null references jobs(id) on delete cascade,
  notiz text not null default '',
  created_at timestamptz not null default now(),
  unique(user_id, job_id)
);

-- Indexes
create index if not exists jobs_datum_idx on jobs(datum desc);
create index if not exists jobs_kategorie_idx on jobs(kategorie);
create index if not exists jobs_quelle_idx on jobs(quelle);
create index if not exists favorites_user_idx on favorites(user_id);
create index if not exists search_runs_created_idx on search_runs(created_at desc);

-- RLS Policies (anon access for read)
alter table jobs enable row level security;
alter table favorites enable row level security;
alter table search_runs enable row level security;

create policy "Jobs are publicly readable"
  on jobs for select using (true);

create policy "Service role can insert jobs"
  on jobs for insert with check (true);

create policy "Service role can upsert jobs"
  on jobs for update using (true);

create policy "Favorites are user-scoped"
  on favorites for all using (true);

create policy "Search runs are publicly readable"
  on search_runs for select using (true);

create policy "Service role can insert search runs"
  on search_runs for insert with check (true);
