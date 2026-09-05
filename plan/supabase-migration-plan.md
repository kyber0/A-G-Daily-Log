# Supabase Migration Plan — LIVING WATER A&G Water Refill App
Database becomes the source of truth. Excel becomes an optional, on-demand export — not something the app reads or writes during normal operation.

**Confirmed decisions (this conversation):**
- No existing Supabase project — one needs to be created.
- Full historical migration: **all 5 years** of Daily Log data (2022–2026), plus the full Sales Report series (2023–2026) and current Stock Report state.
- Post-migration, the app is **Supabase-only** for live operation. Excel export is generated on demand, not auto-maintained.
- This document is the plan + a standalone implementation prompt (Section 8) — no code is being written yet.

---

## 1. The three data domains in the archive

The uploaded `INFO/` folder contains three genuinely separate business records that have never shared a schema:

| Domain | Source files | What it tracks | Date range |
|---|---|---|---|
| **Daily Log** | `{year} LOG/{MM}. DAILY LOG ({MON}).xlsx` — one sheet per day | The water refill *service* itself: container brought in, water type, pickup/deliver, price, total. Plus a small daily expenses log. | 2022–2026 (95 files, oldest domain) |
| **Sales Report** | `INVENTORY STOCK REPORT/{year}/{MM}- SALES REPORT ({MON}-{YYYY}).xlsx` | Merchandise sales — containers/caps/filters sold as *products* | 2023–2026 |
| **Stock Report + supplier prices** | `STOCK REPORT -original file.xlsx` (confirmed identical data to the one already fully reverse-engineered), `SRP1.xlsx`/`SRP2.xlsx` (supplier price sheets, dealer Jaime Bañaria / Zone 3, Sagrada, Baao) | Inventory catalog, stock movements, restock orders, supplier reference pricing | ongoing / current-state |

These relate to each other but are not the same thing: Daily Log's "container type" describes what a *retail customer* brought in for a refill; Stock Report's items are *products the business stocks and sells*. Keep them as separate domains with their own tables — don't merge them.

---

## 2. Data-quality findings from the full archive (inform the schema below)

1. **Container-type naming drift across 5 years of manual entry.** Sampled values include `SLIM`, `SLIM NEW`, `SLIM NEW (YELLOW)`, `SLIM NEW (GREEN)`, `SLIM NEW (BLUE)`, `SLIM RENT (BLUE)`, `ROUND NEW (WHITE)`, alongside the stable core set (`SLIM`, `ROUND`, `HALF`, `350ML`, `500ML`, `6LITERS`, `7LITERS`, `8LITERS`, `10LITERS`). No fixed enum will cleanly capture 5 years of this — the schema needs a normalization table with a raw-text fallback, not a hard constraint that could reject rows during migration.
2. **A few Daily Log rows are miscategorized merchandise, not refill service.** Found `SMALL CAP`, `BIG CAP`, `SMALL CAP REPLACEMENT` used as "container type" values — these are cap sales that got logged in the wrong sheet by habit, not water refill transactions. Migrate them as-is into `refill_sales` (preserve the source data faithfully) but flag them (`likely_miscategorized boolean`) for manual review rather than silently reclassifying them into `item_sales` — that's a judgment call for the business owner, not something to guess at during migration.
3. **Water types are clean** — only `PURIFIED`, `ALKALINE`, `MINERAL` found across the sample. Low risk here.
4. **Day-summary values are 100% derivable** (`Net Sales = Overall Total − Total Expenses`, `Overall Total = SUM(refill_sales.total)`) — confirmed against actual file data (3355 − 0 = 3355). **Don't store them as their own rows; compute on read**, consistent with every other derived value already designed for this app (Qty Balance, Status, etc.).
5. **`STOCK REPORT -original file.xlsx` is the same data as the file already fully analyzed** (identical F78/G78/H78 totals: 522,564 / 2,606 / 4,165) — no new reverse-engineering needed there; use the existing spec's schema (`items`, `stock_movements`, `restock_orders`, `buyers`, `categories`) directly.
6. **SRP1/SRP2 are supplier catalogs, not transactional data** — useful as the real-world source for `dealer_price` when restocking, not something to migrate as sales/inventory history. Model as a lightweight reference table, not a core entity.
7. **Excel "lock files" (`~$*.xlsx`) were present in the upload** (files left open in Excel at time of archiving) — harmless, already excluded from migration; just confirms these files were in active manual use until very recently.

---

## 3. Supabase schema (PostgreSQL DDL)

```sql
-- ============================================================
-- SHARED / REFERENCE
-- ============================================================

create table categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,          -- CONTAINERS, CAPSEALS, ... (10 fixed + user-added)
  sort_order    int not null default 0
);

create table buyers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,           -- seed with the 16 from the Stock Report spec
  is_own_shop   boolean not null default false
);

create table suppliers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,                  -- e.g. "Jaime Bañaria"
  contact       text,
  address       text,                            -- e.g. "Zone 3, Sagrada, Baao, Camarines Sur"
  source_file   text                             -- provenance, e.g. "SRP1.xlsx"
);

create table supplier_price_list (
  id              uuid primary key default gen_random_uuid(),
  supplier_id     uuid references suppliers(id),
  item_id         uuid references items(id),      -- nullable: not every supplier line maps to a catalog item yet
  description     text not null,
  packing         text,
  price           numeric(12,2) not null,
  effective_date  date,                             -- from file metadata/mtime if no in-sheet date
  source_file     text not null                      -- "SRP1.xlsx" / "SRP2.xlsx"
);

-- ============================================================
-- INVENTORY (Stock Report domain — matches the existing app spec/types.ts 1:1)
-- ============================================================

create table items (
  id                    uuid primary key default gen_random_uuid(),
  item_label            text generated always as (id::text || ' · ' || name) stored,  -- unique key, mirrors the xlsx "Item Label" column
  code                  text,                        -- not unique — see original spec finding 11.5
  name                  text not null,                -- clean, no "(SOLD)"/"NEW BATCH" text — see finding 11.1
  category_id           uuid references categories(id),
  packing               text,
  dealer_price          numeric(12,2),
  srp                   numeric(12,2),
  batch_note            text check (batch_note in ('SOLD','NEW BATCH') or batch_note is null),
  batch_date            date,
  low_stock_threshold   int,                          -- left null by default, no guessed value
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
-- status ('in_stock' | 'low' | 'out') is NEVER stored — always computed from stock_movements + low_stock_threshold,
-- exactly as it's a live formula (not a value) in Item Catalog!O of the reference workbook.

create table stock_movements (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references items(id),
  direction     text not null check (direction in ('in','out')),
  quantity      numeric(12,2) not null,
  buyer_id      uuid references buyers(id),           -- required (app-level) when direction='out'
  date          date not null,
  source        text not null check (source in ('sales_entry','wholesale_dispatch','restock','historical_import')),
  source_id     uuid,                                  -- links to item_sales.id, restock_orders.id, etc. (no FK — polymorphic)
  note          text,
  created_at    timestamptz not null default now()
);
create index on stock_movements (item_id);
create index on stock_movements (date);
create index on stock_movements (source, source_id);

create table restock_orders (
  id              uuid primary key default gen_random_uuid(),
  so_number       text,
  order_date      date,
  received_date   date,
  amount          numeric(12,2),
  trucking_fee    numeric(12,2),
  note            text,
  created_at      timestamptz not null default now()
);

-- ============================================================
-- ITEM SALES (Sales Report domain — merchandise)
-- ============================================================

create table item_sales (
  id                  uuid primary key default gen_random_uuid(),
  item_id             uuid not null references items(id),
  quantity            numeric(12,2) not null,
  discount            numeric(12,2) default 0,
  date                date not null,
  remarks             text,
  stock_movement_id   uuid references stock_movements(id),   -- the movement this sale generated (immediate/automatic — Section 8 of the app spec)
  created_at          timestamptz not null default now()
);
create index on item_sales (date);
create index on item_sales (item_id);
-- sales_amount = quantity * item.srp (as of sale time — consider storing unit_price_at_sale numeric if
-- historical price changes need to be reflected exactly; see Section 6 open question)
-- sales_total = sales_amount - discount  →  always computed, never stored

-- ============================================================
-- DAILY LOG (water refill service domain — new)
-- ============================================================

create table refill_container_types (
  id             uuid primary key default gen_random_uuid(),
  raw_name       text not null unique,             -- exact string as found in source files, e.g. "SLIM NEW (YELLOW)"
  canonical_id   uuid references refill_container_types(id),  -- points to itself (or the "clean" row) once normalized
  is_canonical   boolean not null default false
);

create table refill_water_types (
  id      uuid primary key default gen_random_uuid(),
  name    text not null unique                      -- PURIFIED / ALKALINE / MINERAL
);

create table refill_price_list (
  id                  uuid primary key default gen_random_uuid(),
  container_type_id   uuid references refill_container_types(id),
  water_type_id        uuid references refill_water_types(id),
  price_pickup         numeric(12,2),
  price_deliver         numeric(12,2),
  effective_date        date not null default current_date
);

create table refill_sales (
  id                    uuid primary key default gen_random_uuid(),
  date                  date not null,
  sn                    int,                          -- original day-sheet serial number, kept for provenance/order
  container_type_id     uuid references refill_container_types(id),
  container_type_raw    text not null,                 -- always populated, even if container_type_id is null (unmapped)
  water_type_id         uuid references refill_water_types(id),
  water_type_raw        text,
  quantity              numeric(12,2) not null,
  mode                  text not null check (mode in ('pickup','deliver')),
  unit_price             numeric(12,2),
  total                  numeric(12,2) not null,
  likely_miscategorized boolean not null default false,  -- flagged per finding #2 above (e.g. "SMALL CAP" rows)
  source_file            text not null,                   -- provenance
  source_sheet            text not null,                   -- e.g. "AUG01"
  created_at              timestamptz not null default now()
);
create index on refill_sales (date);

create table daily_expenses (
  id             uuid primary key default gen_random_uuid(),
  date           date not null,
  sn             int,
  description    text,
  total           numeric(12,2) not null,
  remarks         text,
  source_file      text not null,
  source_sheet      text not null,
  created_at        timestamptz not null default now()
);
create index on daily_expenses (date);

-- Daily Net Sales / Overall Total / Total Expenses: NEVER stored — always
--   overall_total(date) = SUM(refill_sales.total where date=date)
--   total_expenses(date) = SUM(daily_expenses.total where date=date)
--   net_sales(date) = overall_total(date) - total_expenses(date)
```

**Security note:** this is a single-tenant desktop app talking to its own project — the Electron **main process** should hold the Supabase **service-role key** (never exposed to the renderer/preload bridge). Keep RLS enabled with a simple "service role bypasses everything" posture rather than exposing the anon key anywhere in the app. Don't design public/anon-key access paths — there are none needed here.

---

## 4. Migration source inventory → table mapping

| Source | Row count (approx.) | Target table(s) |
|---|---|---|
| 60 Daily Log monthly files (2022–2026), ~31 day-sheets each | ~50,000+ transaction rows, ~1,800 day-sheets | `refill_sales`, `daily_expenses` |
| 35 Sales Report monthly files (2023–2026) | varies, ~100 rows/month typical | `item_sales` (and `items` for any not already in the catalog) |
| `STOCK REPORT -original file.xlsx` | 51 items, 214 historical movement rows, 16 buyers, 10 categories, 9 restock orders | `items`, `stock_movements`, `buyers`, `categories`, `restock_orders` — **already fully specified in the existing app spec; migrate using that exact logic (including the M324-typo fix and the row-15/16 merged-batch fix already applied in `STOCK_REPORT_refactored.xlsx`)** |
| `SRP1.xlsx`, `SRP2.xlsx` | ~90 rows total | `suppliers`, `supplier_price_list` |

---

## 5. Migration strategy

1. **Stock Report first** (smallest, already fully modeled, everything else references `items`/`categories`/`buyers`). Load directly from the logic already built for `STOCK_REPORT_refactored.xlsx` — the Item Catalog, Buyer Summary, Restock Orders, Categories, Buyers sheets map straight onto the tables above.
2. **Sales Report second.** For each `item_sales` row, resolve `item_id` by matching item name against the `items` table (same ambiguity risk already flagged in the app's code review — resolve by **exact `item_label` or a manually-reviewed mapping table**, not fuzzy substring matching, for the same reason `stockDbIpc.ts`'s `.includes(name)` fallback was flagged as unsafe). Every `item_sales` row also inserts one `stock_movements` row (`direction='out'`, `source='historical_import'`, own-shop buyer) — same rule as live operation, applied retroactively.
3. **Daily Log third** (largest, independent of the other two domains). For each day-sheet: insert `refill_sales` rows (attempt `container_type_id`/`water_type_id` resolution against the normalization tables; leave null with `container_type_raw` populated when unmapped), insert `daily_expenses` rows, skip fully-empty rows (`quantity` null/0 with no other data).
4. **Supplier prices last** (independent, low-risk).
5. **Validate**, per Section 6.
6. **Idempotency:** every migration script should be safely re-runnable — key on `(source_file, source_sheet, sn)` for Daily Log rows and skip-if-exists, so a partial run can be resumed without duplicating rows.

---

## 6. Validation checklist (must pass before calling the migration done)

- [ ] `items` count, `stock_movements` sum by item, `restock_orders` total all match the numbers already verified against `STOCK_REPORT_refactored.xlsx` in this conversation (Qty Stock Out 2,606; Qty Balance 4,165; restocking spend 522,564).
- [ ] Sum of `item_sales.quantity * srp - discount` for December 2023 equals `5,170` (the `I5` "Sales Total" value already extracted from `12-_SALES_REPORT__DEC-2023_.xlsx`).
- [ ] Sum of `refill_sales.total` for a spot-checked day (e.g. 2026-08-01) equals `3355`, and `net_sales` for that day equals `3355` (matches the source sheet's own "NET SALES FOR TODAY" cell).
- [ ] No `refill_sales` or `daily_expenses` row references a `source_file`/`source_sheet` that wasn't in the original 60 files (guards against double-import).
- [ ] Every `likely_miscategorized` row gets reviewed with the business owner before deciding whether to leave it in `refill_sales` or move it manually.

---

## 7. App architecture change (after migration)

- IPC handlers in `src/main/ipc/` (`stockDbIpc.ts`, `itemSalesIpc.ts`, and the Daily Log equivalent) stop opening `.xlsx` files with `exceljs` for reads/writes of live data. They call the Supabase client instead (service-role key, main process only).
- The `inventoryIpc.ts` legacy file (flagged as a live bug in the earlier code review — writes to a stale Excel path/format) is **deleted outright** as part of this change, not patched — it has no role once Excel isn't the source of truth.
- The row-number-as-identity bug found in `itemSalesIpc.ts`'s sync logic **disappears naturally** — Supabase rows get real primary keys, so there's no more need to derive identity from a volatile Excel row position.
- Excel export becomes a new, explicit "Export to Excel" action — reads current Supabase state, regenerates a workbook shaped like `STOCK_REPORT_refactored.xlsx` (or the Sales Report / Daily Log shapes) using the already-established formula/formatting patterns, and offers it as a download. Nothing reads it back in.

---

## 8. Super detailed implementation prompt

*(Everything below this line is meant to be handed to an AI coding agent — e.g. Claude Code — as a standalone, self-contained brief. It restates necessary context so it doesn't depend on this conversation.)*

```
You are implementing a migration of the "LIVING WATER A&G" water-refill Electron app from
Excel-file-as-source-of-truth to Supabase-as-source-of-truth. This is a TypeScript/Electron
app (main process in src/main, renderer in src/renderer, shared types in src/shared/types.ts,
IPC bridge in src/preload/index.ts). It currently reads/writes .xlsx files directly via
exceljs for all live data. After this change, it should read/write Supabase for all live
data, and only touch Excel for an explicit, on-demand "Export" action.

CONTEXT YOU NEED:
- The app tracks three domains: (1) Daily Log — day-by-day water refill service transactions
  (container brought in, water type, pickup/deliver, price, total) plus a small daily
  expenses log, going back to 2022; (2) Sales Report — monthly merchandise sales (containers/
  caps/filters sold as products), since Nov 2023; (3) Stock/Inventory — an item catalog,
  a stock-movement ledger, restock orders, buyers, and categories, already fully modeled in
  src/shared/types.ts (StockItem, StockMovement, RestockOrder, StockDB, etc.) and mirrored in
  a reference workbook at resources/templates/STOCK_REPORT_refactored.xlsx.
- A full data archive exists (95 .xlsx files: 60 Daily Log files 2022–2026, 35 Sales Report
  files 2023–2026, plus the current Stock Report and two supplier price sheets SRP1/SRP2)
  and needs one-time migration into Supabase.
- A known bug in the current codebase: src/main/ipc/itemSalesIpc.ts uses each sale's Excel
  row number as its identity when syncing to Stock Movements, which breaks when rows shift
  after a delete. This migration removes the underlying cause (Excel rows aren't identity
  anymore — Supabase primary keys are), so don't try to patch the old bug, just don't
  reproduce the pattern.
- Another known-dead file, src/main/ipc/inventoryIpc.ts, writes to a stale/incorrect Excel
  path and format. Delete it as part of this work — do not migrate its logic.

YOUR TASKS, IN ORDER:

1. SCHEMA. Create the Supabase schema exactly as specified below (PostgreSQL DDL). Use
   Supabase migrations (supabase/migrations/*.sql) so the schema is versioned. Enable RLS
   on every table; restrict access to the service role (this app has no public/anon-key
   access path — the Electron main process holds the service-role key).

   [paste the full DDL from Section 3 of this document here]

2. MIGRATION SCRIPTS. Write a set of idempotent Node/TypeScript scripts (e.g. under
   scripts/migrate/) that:
   a. Parse resources/templates/STOCK_REPORT_refactored.xlsx (or the live equivalent found
      at INFO/INVENTORY STOCK REPORT/STOCK REPORT -original file.xlsx) and load categories,
      buyers, items, stock_movements, restock_orders. Reuse the exact reconciliation logic
      already applied when that reference workbook was built: treat manual "+N+N+N..."
      addition-chain formulas as pure arithmetic sums (evaluate them), watch for stray
      cell-reference typos inside those chains (one is already known — row 37 of the
      original file had "+M324" where a number should be; treat any bare cell reference
      inside such a chain as 0, matching Excel's own behavior for a blank cell, and log a
      warning whenever this happens so any other instances get caught), and merge any rows
      that share a value via merged cells (one known case: two rows shared one packing/price/
      balance via merged cells C15:C16/D15:D16/H15:H16 — detect this generally by checking
      the sheet's actual merged-cell ranges, not just this one hardcoded case).
   b. Parse every file matching INFO/INVENTORY STOCK REPORT/{year}/*.xlsx (the Sales Report
      series) into item_sales, resolving item_id by exact match against items.name (fall
      back to a manual review list for anything that doesn't match — do not use fuzzy/
      substring matching). For each item_sales row inserted, also insert a matching
      stock_movements row (direction='out', source='historical_import', buyer = the
      is_own_shop buyer).
   c. Parse every file matching "INFO/*LOG/*.xlsx" (the Daily Log series) into refill_sales
      and daily_expenses. Each workbook has one sheet per day (sheet names like "AUG01");
      each sheet has: a transaction table in columns A–G (SN, Container Type, Water Type,
      Quantity, Price (Pick Up), Price (Deliver), Total) starting at row 2; a small price-
      reference panel in columns J–N (ignore for migration — it's a snapshot of the price
      list at that time, not a transaction; optionally load into refill_price_list if you
      want historical pricing, but this is not required for v1); an expenses table in
      columns Q–T (SN, Description, Total, Remarks) starting at row 2; and a summary row
      near the bottom with "OVER ALL TOTAL FOR TODAY", "NET SALES FOR TODAY", and
      "TOTAL EXPENSES FOR TODAY" labels — use these ONLY to cross-validate your computed
      sums (see step 3), never as the source of the actual stored numbers. Skip rows with
      no quantity and no total. Populate container_type_raw/water_type_raw always; attempt
      to resolve container_type_id/water_type_id against refill_container_types/
      refill_water_types (create new normalization rows as new raw values are encountered,
      but flag anything that isn't in this known set as needing review: SLIM, ROUND, HALF,
      350ML, 500ML, 6LITERS, 7LITERS, 8LITERS, 10LITERS, and their "NEW"/color-suffixed
      variants). Set likely_miscategorized=true for any row whose container_type_raw looks
      like a merchandise item rather than a container (contains "CAP", "REPLACEMENT", etc.).
   d. Parse SRP1.xlsx and SRP2.xlsx into suppliers and supplier_price_list. These are simple
      two-column-pair price lists (Description, Packing, Price) under category headers.
   e. Every script must be safely re-runnable: key inserts on (source_file, source_sheet, sn)
      or equivalent natural keys and skip-if-already-present, so a partial/interrupted run
      can resume without creating duplicates.

3. VALIDATION. After migration, verify and print a report confirming:
   - Total Qty Stock Out = 2606, Total Qty Balance = 4165, Total restocking spend = 522564
     (from the Stock Report domain).
   - item_sales for December 2023 sum to a Sales Total of 5170 (quantity*srp - discount,
     summed).
   - For at least 5 spot-checked days across different years, SUM(refill_sales.total) matches
     that day's "OVER ALL TOTAL FOR TODAY" cell, and SUM(refill_sales.total) -
     SUM(daily_expenses.total) matches "NET SALES FOR TODAY".
   Fail loudly (non-zero exit code, clear diff output) if any of these don't match — don't
   silently proceed.

4. APP REFACTOR. Once migration is verified:
   - Delete src/main/ipc/inventoryIpc.ts and its registration in src/main/index.ts.
   - Rewrite src/main/ipc/stockDbIpc.ts and src/main/ipc/itemSalesIpc.ts to read/write
     Supabase instead of opening .xlsx files. Keep the same IPC channel names/payloads the
     renderer already expects (check src/preload/index.ts and src/renderer/screens/
     stockInventory.ts, itemSales.ts for the current contract) so the renderer doesn't need
     to change.
   - Add a new equivalent IPC module for the Daily Log domain (refill_sales, daily_expenses),
     matching whatever the current Daily Log screen's IPC contract is.
   - Add a new, explicit "Export to Excel" IPC action per domain that reads current Supabase
     state and generates a workbook — reuse the exact sheet layout, formulas, and formatting
     already established in STOCK_REPORT_refactored.xlsx for the Stock Report export. This
     is the ONLY place exceljs should still be used for writing.
   - Store the Supabase service-role key via the app's existing secrets/config mechanism
     (check src/main/store for the current pattern) — never in renderer-accessible code.

Work through these in order and check in after step 3 (validation) before starting step 4
(app refactor), since step 4 depends on the validated data actually being correct.
```
