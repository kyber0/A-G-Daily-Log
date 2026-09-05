-- ============================================================
-- AUDIT LOGS (Database storage for water and item sales logs)
-- ============================================================

create table if not exists audit_logs (
  id          uuid primary key default gen_random_uuid(),
  log_type    text not null check (log_type in ('water', 'item', 'general')),
  action      text not null,
  details     text not null,
  timestamp   timestamptz not null default now(),
  created_at  timestamptz not null default now()
);

create index if not exists idx_audit_logs_type_timestamp on audit_logs (log_type, timestamp desc);
create index if not exists idx_audit_logs_timestamp on audit_logs (timestamp desc);

-- Row Level Security (RLS)
alter table audit_logs enable row level security;

-- Policies for service role and anon
create policy "Allow all operations for service role"
  on audit_logs
  for all
  using (true)
  with check (true);

create policy "Allow all operations for anon"
  on audit_logs
  for all
  using (true)
  with check (true);
