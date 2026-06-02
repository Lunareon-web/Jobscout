-- App Config — stores search settings from frontend
create table if not exists app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

alter table app_config enable row level security;
create policy "app_config_read"  on app_config for select using (true);
create policy "app_config_write" on app_config for all using (true);

-- Default config
insert into app_config (key, value) values
  ('search_config', '{
    "standort": "Düsseldorf",
    "umkreis": 60,
    "jobtitel": [
      "Projektmanager", "Project Manager", "Design Manager",
      "Designer", "Produktdesigner", "Interior Designer",
      "Innenarchitekt", "Raumplaner", "Concept Designer",
      "Brand Designer", "Visual Merchandiser"
    ]
  }'::jsonb)
on conflict (key) do nothing;
