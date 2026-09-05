-- ============================================================
-- MIGRATION 003: Fix RLS policies + extend direction constraint
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. Drop the overly permissive `anon` open-access policy on
--    audit_logs. Anonymous callers (anyone with only the public
--    anon key) must NOT be able to read or write audit records.
-- ────────────────────────────────────────────────────────────
drop policy if exists "Allow all operations for anon" on audit_logs;

-- ────────────────────────────────────────────────────────────
-- 2. Add explicit service_role policies on every table that
--    has RLS enabled but had no row-level policy defined
--    (migration 001 enabled RLS on 13 tables but created zero
--    policies, so only the service_role key bypass kept things
--    working). These policies make the intent explicit and
--    will allow future migration to a more restrictive key.
-- ────────────────────────────────────────────────────────────

-- Helper: only run policy creation if it doesn't already exist
-- (Supabase does not support "create policy if not exists" in all versions)

do $$
declare
  tbls text[] := array[
    'categories', 'buyers', 'suppliers', 'supplier_price_list',
    'items', 'stock_movements', 'restock_orders', 'item_sales',
    'refill_container_types', 'refill_water_types', 'refill_price_list',
    'refill_sales', 'daily_expenses', 'audit_logs'
  ];
  t text;
  policy_name text;
  exists_count int;
begin
  foreach t in array tbls loop
    policy_name := format('Service role full access — %s', t);
    select count(*) into exists_count
      from pg_policies
      where schemaname = 'public'
        and tablename = t
        and policyname = policy_name;

    if exists_count = 0 then
      execute format(
        'create policy %I on %I for all to service_role using (true) with check (true)',
        policy_name, t
      );
    end if;
  end loop;
end $$;

-- ────────────────────────────────────────────────────────────
-- 3. Extend stock_movements.direction constraint to allow
--    'return' and 'adjustment' in addition to 'in' / 'out'.
--    The current constraint blocks return-to-stock and manual
--    inventory correction operations.
-- ────────────────────────────────────────────────────────────
alter table stock_movements
  drop constraint if exists stock_movements_direction_check;

alter table stock_movements
  add constraint stock_movements_direction_check
    check (direction in ('in', 'out', 'return', 'adjustment'));
