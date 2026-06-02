-- ============================================================
-- Jobscout Intelligence Platform — Supabase Migration 002
-- Run in Supabase SQL Editor AFTER 001_initial.sql
-- ============================================================

-- 1. COMPANY CANDIDATES (Discovery Queue Input)
create table if not exists company_candidates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text not null,
  city text not null default 'Düsseldorf',
  country text not null default 'DE',
  source_url text,
  source_type text, -- 'search','directory','manual'
  status text not null default 'pending', -- pending|validated|rejected|duplicate
  created_at timestamptz not null default now()
);

-- 2. COMPANIES (validated + enriched)
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website text not null unique,
  city text not null default 'Düsseldorf',
  country text not null default 'DE',
  industry text, -- retail|interior|ladenbau|workplace|architektur|messebau|other
  employee_range text, -- 1-10|11-50|51-200|201-500|500+
  services text[] default '{}',
  score integer not null default 0,
  priority text not null default 'D', -- A+|A|B|C|D
  is_active boolean not null default true,
  last_enriched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 3. CAREER PAGES
create table if not exists career_pages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  url text not null,
  last_checked timestamptz,
  status text not null default 'unknown', -- ok|empty|error|unknown
  jobs_found integer not null default 0,
  created_at timestamptz not null default now()
);

-- 4. EXTEND existing jobs table
alter table jobs
  add column if not exists company_id uuid references companies(id) on delete set null,
  add column if not exists score integer not null default 0,
  add column if not exists is_active boolean not null default true,
  add column if not exists last_seen timestamptz;

-- 5. CONTACTS
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  title text,
  source_url text,
  linkedin_url text,
  created_at timestamptz not null default now()
);

-- 6. PROJECT SIGNALS
create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  project_type text not null, -- expansion|flagship|showroom|innovation_center|office_move|new_hq|trade_show
  title text not null,
  location text,
  source_url text,
  project_date date,
  created_at timestamptz not null default now()
);

-- 7. CRAWL QUEUE
create table if not exists crawl_queue (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null, -- company_candidate|company|career_page|project|contact|scoring|alert
  entity_id uuid,
  priority integer not null default 5, -- 1 (low) to 10 (high)
  status text not null default 'pending', -- pending|running|done|error
  attempts integer not null default 0,
  error_msg text,
  next_run timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- 8. CRAWL HISTORY
create table if not exists crawl_history (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  agent text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running', -- running|done|error
  items_found integer not null default 0,
  details jsonb default '{}'
);

-- 9. ALERTS
create table if not exists alerts (
  id uuid primary key default gen_random_uuid(),
  alert_type text not null, -- new_job|new_project|new_company|score_change
  company_id uuid references companies(id) on delete cascade,
  job_id text references jobs(id) on delete cascade,
  message text not null,
  payload jsonb default '{}',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- INDEXES
-- ============================================================
create index if not exists companies_score_idx on companies(score desc);
create index if not exists companies_priority_idx on companies(priority);
create index if not exists companies_city_idx on companies(city);
create index if not exists crawl_queue_status_idx on crawl_queue(status, priority desc, next_run);
create index if not exists crawl_queue_entity_idx on crawl_queue(entity_type, entity_id);
create index if not exists alerts_read_idx on alerts(is_read, created_at desc);
create index if not exists projects_company_idx on projects(company_id);
create index if not exists jobs_company_idx on jobs(company_id);
create index if not exists jobs_score_idx on jobs(score desc);

-- ============================================================
-- RLS POLICIES
-- ============================================================
alter table companies enable row level security;
alter table company_candidates enable row level security;
alter table career_pages enable row level security;
alter table contacts enable row level security;
alter table projects enable row level security;
alter table crawl_queue enable row level security;
alter table crawl_history enable row level security;
alter table alerts enable row level security;

-- Public read
create policy "companies_read" on companies for select using (true);
create policy "career_pages_read" on career_pages for select using (true);
create policy "contacts_read" on contacts for select using (true);
create policy "projects_read" on projects for select using (true);
create policy "alerts_read" on alerts for select using (true);
create policy "crawl_history_read" on crawl_history for select using (true);

-- Service role write (backend uses service key)
create policy "companies_write" on companies for all using (true);
create policy "candidates_write" on company_candidates for all using (true);
create policy "career_pages_write" on career_pages for all using (true);
create policy "contacts_write" on contacts for all using (true);
create policy "projects_write" on projects for all using (true);
create policy "crawl_queue_write" on crawl_queue for all using (true);
create policy "crawl_history_write" on crawl_history for all using (true);
create policy "alerts_write" on alerts for all using (true);

-- ============================================================
-- SEED: migrate existing hardcoded companies from search-firmen.ts
-- ============================================================
insert into companies (name, website, city, industry, score, priority) values
  ('HPP Architekten',        'https://www.hpp.com',                    'Düsseldorf',    'architektur', 70, 'B'),
  ('RKW Architektur',        'https://www.rkw-architektur.de',         'Düsseldorf',    'architektur', 70, 'B'),
  ('Ingenhoven Architects',  'https://www.ingenhovenarchitects.com',   'Düsseldorf',    'architektur', 70, 'B'),
  ('Dula-Werke',             'https://www.dula.de',                    'Mönchengladbach','ladenbau',   85, 'A'),
  ('Syma-System',            'https://www.syma.de',                    'Meerbusch',     'messebau',    65, 'C'),
  ('Kurz Design',            'https://www.kurz-design.de',             'Neuss',         'interior',    75, 'B'),
  ('OPUS Marketing',         'https://www.opus-marketing.de',          'Düsseldorf',    'retail',      60, 'C'),
  ('flora&faunavisions',     'https://www.florafaunavisions.de',       'Düsseldorf',    'interior',    80, 'A'),
  ('Eller + Eller',          'https://www.eller-eller.de',             'Düsseldorf',    'architektur', 70, 'B'),
  ('Pieron Shopkonzepte',    'https://www.pieron.de',                  'Neuss',         'ladenbau',    85, 'A'),
  ('Umdasch Shop Concept',   'https://www.umdasch-shop-concept.com',   'Neuss',         'ladenbau',    90, 'A+'),
  ('Blocher Partners',       'https://www.blocherpartners.de',         'Düsseldorf',    'interior',    80, 'A'),
  ('CB.e Retail Solutions',  'https://www.cbe-retail.com',             'Hilden',        'retail',      75, 'B'),
  ('Materie',                'https://www.materie.de',                 'Düsseldorf',    'interior',    75, 'B'),
  ('Schweitzer Project',     'https://www.schweitzer-project.com',     'Düsseldorf',    'ladenbau',    85, 'A'),
  ('Lindner Hotels',         'https://www.lindner.de',                 'Düsseldorf',    'workplace',   65, 'C'),
  ('Douglas',                'https://www.douglas.de',                 'Düsseldorf',    'retail',      80, 'A'),
  ('Peek & Cloppenburg',     'https://www.peek-cloppenburg.de',        'Düsseldorf',    'retail',      85, 'A'),
  ('METRO AG',               'https://www.metroag.de',                 'Düsseldorf',    'retail',      75, 'B'),
  ('dart Architekten',       'https://www.dart-architekten.de',        'Düsseldorf',    'architektur', 65, 'C')
on conflict (website) do nothing;

-- Seed career_pages für migrierte Firmen
insert into career_pages (company_id, url)
select c.id, cp.url from companies c
join (values
  ('https://www.hpp.com',                  'https://www.hpp.com/de/karriere/'),
  ('https://www.rkw-architektur.de',       'https://www.rkw-architektur.de/buero/karriere/'),
  ('https://www.ingenhovenarchitects.com', 'https://www.ingenhovenarchitects.com/studio/karriere/'),
  ('https://www.dula.de',                  'https://www.dula.de/karriere/'),
  ('https://www.syma.de',                  'https://www.syma.de/de/karriere/'),
  ('https://www.kurz-design.de',           'https://www.kurz-design.de/karriere/'),
  ('https://www.opus-marketing.de',        'https://www.opus-marketing.de/karriere/'),
  ('https://www.florafaunavisions.de',     'https://www.florafaunavisions.de/karriere/'),
  ('https://www.eller-eller.de',           'https://www.eller-eller.de/karriere/'),
  ('https://www.pieron.de',                'https://www.pieron.de/unternehmen/karriere/'),
  ('https://www.umdasch-shop-concept.com', 'https://www.umdasch-shop-concept.com/de/unternehmen/karriere/'),
  ('https://www.blocherpartners.de',       'https://www.blocherpartners.de/karriere/'),
  ('https://www.cbe-retail.com',           'https://www.cbe-retail.com/karriere/'),
  ('https://www.materie.de',               'https://www.materie.de/karriere/'),
  ('https://www.schweitzer-project.com',   'https://www.schweitzer-project.com/karriere/'),
  ('https://www.lindner.de',               'https://karriere.lindner.de/'),
  ('https://www.douglas.de',               'https://karriere.douglas.de/stellenangebote/'),
  ('https://www.peek-cloppenburg.de',      'https://karriere.peek-cloppenburg.de/stellenangebote/'),
  ('https://www.metroag.de',               'https://jobs.metro.com/de/de/search-results'),
  ('https://www.dart-architekten.de',      'https://www.dart-architekten.de/buero/')
) as cp(website, career_url) on c.website = cp.website
on conflict do nothing;
