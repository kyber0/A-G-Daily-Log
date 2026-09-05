-- ============================================================
-- MIGRATION 004: Authenticated RLS Policies
-- ============================================================
-- Replaces previous service_role catch-all policies with
-- authenticated-only policies across all 14 tables.
-- The anonymous public key alone does not grant access;
-- only signed-in sessions for authorized app accounts can access data.

do $$
declare
  tbls text[] := array[
    'categories','buyers','suppliers','supplier_price_list','items',
    'stock_movements','restock_orders','item_sales','refill_container_types',
    'refill_water_types','refill_price_list','refill_sales','daily_expenses','audit_logs'
  ];
  t text;
begin
  foreach t in array tbls loop
    execute format('drop policy if exists %I on %I',
      format('Service role full access — %s', t), t);
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true)',
      format('Authenticated app access — %s', t), t
    );
  end loop;
end $$;
