-- ============================================================
-- DAY CLOSURES (Sync manual close/reopen decisions across devices)
-- ============================================================

create table if not exists day_closures (
  date        text primary key,              -- YYYY-MM-DD
  is_closed   boolean not null default true,
  reason      text not null default '',
  updated_at  timestamptz not null default now()
);

create index if not exists idx_day_closures_date on day_closures (date desc);

-- Row Level Security (RLS)
alter table day_closures enable row level security;

create policy "Allow all operations for service role"
  on day_closures
  for all
  using (true)
  with check (true);

create policy "Allow all operations for anon"
  on day_closures
  for all
  using (true)
  with check (true);
