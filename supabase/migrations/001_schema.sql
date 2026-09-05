-- ============================================================
-- SHARED / REFERENCE
-- ============================================================

create table if not exists categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  sort_order    int not null default 0
);

create table if not exists buyers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null unique,
  is_own_shop   boolean not null default false
);

create table if not exists suppliers (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  contact       text,
  address       text,
  source_file   text
);

-- ============================================================
-- INVENTORY (Stock Report domain)
-- ============================================================

create table if not exists items (
  id                    uuid primary key default gen_random_uuid(),
  item_label            text generated always as (id::text || ' · ' || name) stored,
  code                  text,
  name                  text not null,
  category_id           uuid references categories(id) on delete set null,
  packing               text,
  dealer_price          numeric(12,2),
  srp                   numeric(12,2),
  batch_note            text check (batch_note in ('SOLD','NEW BATCH') or batch_note is null),
  batch_date            date,
  low_stock_threshold   int,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table if not exists supplier_price_list (
  id              uuid primary key default gen_random_uuid(),
  supplier_id     uuid references suppliers(id) on delete cascade,
  item_id         uuid references items(id) on delete set null,
  description     text not null,
  packing         text,
  price           numeric(12,2) not null,
  effective_date  date,
  source_file     text not null
);

create table if not exists stock_movements (
  id            uuid primary key default gen_random_uuid(),
  item_id       uuid not null references items(id) on delete cascade,
  direction     text not null check (direction in ('in','out')),
  quantity      numeric(12,2) not null,
  buyer_id      uuid references buyers(id) on delete set null,
  date          date not null,
  source        text not null check (source in ('sales_entry','wholesale_dispatch','restock','historical_import')),
  source_id     uuid,
  note          text,
  created_at    timestamptz not null default now()
);
create index if not exists idx_stock_movements_item_id on stock_movements (item_id);
create index if not exists idx_stock_movements_date on stock_movements (date);
create index if not exists idx_stock_movements_source on stock_movements (source, source_id);

create table if not exists restock_orders (
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

create table if not exists item_sales (
  id                  uuid primary key default gen_random_uuid(),
  item_id             uuid not null references items(id) on delete cascade,
  quantity            numeric(12,2) not null,
  unit_price_at_sale  numeric(12,2),
  discount            numeric(12,2) default 0,
  date                date not null,
  remarks             text,
  stock_movement_id   uuid references stock_movements(id) on delete set null,
  created_at          timestamptz not null default now()
);
create index if not exists idx_item_sales_date on item_sales (date);
create index if not exists idx_item_sales_item_id on item_sales (item_id);

-- ============================================================
-- DAILY LOG (water refill service domain)
-- ============================================================

create table if not exists refill_container_types (
  id             uuid primary key default gen_random_uuid(),
  raw_name       text not null unique,
  canonical_id   uuid references refill_container_types(id) on delete set null,
  is_canonical   boolean not null default false
);

create table if not exists refill_water_types (
  id      uuid primary key default gen_random_uuid(),
  name    text not null unique
);

create table if not exists refill_price_list (
  id                  uuid primary key default gen_random_uuid(),
  container_type_id   uuid references refill_container_types(id) on delete cascade,
  water_type_id       uuid references refill_water_types(id) on delete cascade,
  price_pickup        numeric(12,2),
  price_deliver       numeric(12,2),
  effective_date      date not null default current_date
);

create table if not exists refill_sales (
  id                    uuid primary key default gen_random_uuid(),
  date                  date not null,
  sn                    int,
  container_type_id     uuid references refill_container_types(id) on delete set null,
  container_type_raw    text not null,
  water_type_id         uuid references refill_water_types(id) on delete set null,
  water_type_raw        text,
  quantity              numeric(12,2) not null,
  mode                  text not null check (mode in ('pickup','deliver')),
  unit_price            numeric(12,2),
  total                 numeric(12,2) not null,
  likely_miscategorized boolean not null default false,
  source_file           text not null,
  source_sheet          text not null,
  created_at            timestamptz not null default now()
);
create index if not exists idx_refill_sales_date on refill_sales (date);
create index if not exists idx_refill_sales_source on refill_sales (source_file, source_sheet, sn);

create table if not exists daily_expenses (
  id             uuid primary key default gen_random_uuid(),
  date           date not null,
  sn             int,
  description    text,
  total          numeric(12,2) not null,
  remarks        text,
  source_file    text not null,
  source_sheet   text not null,
  created_at     timestamptz not null default now()
);
create index if not exists idx_daily_expenses_date on daily_expenses (date);
create index if not exists idx_daily_expenses_source on daily_expenses (source_file, source_sheet, sn);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================
alter table categories enable row level security;
alter table buyers enable row level security;
alter table suppliers enable row level security;
alter table supplier_price_list enable row level security;
alter table items enable row level security;
alter table stock_movements enable row level security;
alter table restock_orders enable row level security;
alter table item_sales enable row level security;
alter table refill_container_types enable row level security;
alter table refill_water_types enable row level security;
alter table refill_price_list enable row level security;
alter table refill_sales enable row level security;
alter table daily_expenses enable row level security;
