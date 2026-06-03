-- Add salary fields to jobs table (from JobSpy)
alter table jobs
  add column if not exists salary_min integer,
  add column if not exists salary_max integer,
  add column if not exists salary_currency text default 'EUR';

-- Index for salary filtering
create index if not exists jobs_salary_idx on jobs(salary_min) where salary_min is not null;
