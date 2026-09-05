import Database from 'better-sqlite3'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

// ── Database path ─────────────────────────────────────────────────────────────
function getDbPath(): string {
  try {
    if (app && typeof app.getPath === 'function') {
      const dir = app.getPath('userData')
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      return path.join(dir, 'local.db')
    }
  } catch {}
  const base = path.join(process.env.APPDATA || process.cwd(), 'ag-daily-log')
  if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true })
  return path.join(base, 'local.db')
}

let _db: Database.Database | null = null

export function getLocalDb(): Database.Database {
  if (_db) return _db

  const dbPath = getDbPath()
  try {
    _db = openDbWithPragmas(dbPath)
  } catch (err: any) {
    console.error(`[localDb] Failed to open SQLite database at ${dbPath}:`, err)
    // Quarantine corrupted database file so the app can self-heal
    try {
      if (fs.existsSync(dbPath)) {
        const corruptPath = `${dbPath}.corrupt-${Date.now()}`
        fs.renameSync(dbPath, corruptPath)
        if (fs.existsSync(`${dbPath}-wal`)) try { fs.renameSync(`${dbPath}-wal`, `${corruptPath}-wal`) } catch {}
        if (fs.existsSync(`${dbPath}-shm`)) try { fs.renameSync(`${dbPath}-shm`, `${corruptPath}-shm`) } catch {}
        console.warn(`[localDb] Quarantined damaged SQLite file to ${corruptPath}. Initializing fresh database...`)
      }
    } catch (quarantineErr) {
      console.error('[localDb] Could not quarantine damaged database:', quarantineErr)
    }
    _db = openDbWithPragmas(dbPath)
  }

  return _db
}

function openDbWithPragmas(dbPath: string): Database.Database {
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')
  initSchema(db)
  return db
}

/** Close the SQLite connection — call during app shutdown */
export function closeDatabase(): void {
  if (_db) {
    try { _db.close() } catch {}
    _db = null
  }
}

// ── Schema ────────────────────────────────────────────────────────────────────
function initSchema(db: Database.Database): void {
  db.exec(`
    -- ── Cache Tables ──────────────────────────────────────────────────────────

    CREATE TABLE IF NOT EXISTS refill_sales_cache (
      id          TEXT PRIMARY KEY,
      date        TEXT NOT NULL,
      sn          INTEGER,
      container_type_id TEXT,
      container_type_raw TEXT,
      water_type_id TEXT,
      water_type_raw TEXT,
      quantity    REAL,
      mode        TEXT,
      unit_price  REAL,
      total       REAL,
      source_file TEXT,
      source_sheet TEXT,
      synced_at   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_refill_sales_date ON refill_sales_cache(date);

    CREATE TABLE IF NOT EXISTS daily_expenses_cache (
      id          TEXT PRIMARY KEY,
      date        TEXT NOT NULL,
      sn          INTEGER,
      description TEXT,
      total       REAL,
      remarks     TEXT,
      source_file TEXT,
      source_sheet TEXT,
      synced_at   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_daily_expenses_date ON daily_expenses_cache(date);

    CREATE TABLE IF NOT EXISTS items_cache (
      id                 TEXT PRIMARY KEY,
      name               TEXT NOT NULL,
      code               TEXT,
      category_id        TEXT,
      category_name      TEXT,
      packing            TEXT,
      dealer_price       REAL,
      srp                REAL,
      batch_note         TEXT,
      batch_date         TEXT,
      low_stock_threshold REAL,
      created_at         TEXT,
      updated_at         TEXT,
      synced_at          TEXT
    );

    CREATE TABLE IF NOT EXISTS categories_cache (
      id         TEXT PRIMARY KEY,
      name       TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      synced_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS buyers_cache (
      id          TEXT PRIMARY KEY,
      name        TEXT NOT NULL,
      is_own_shop INTEGER DEFAULT 0,
      synced_at   TEXT
    );

    CREATE TABLE IF NOT EXISTS stock_movements_cache (
      id          TEXT PRIMARY KEY,
      item_id     TEXT,
      item_name   TEXT,
      item_code   TEXT,
      direction   TEXT,
      quantity    REAL,
      buyer_id    TEXT,
      buyer_name  TEXT,
      date        TEXT,
      source      TEXT,
      source_id   TEXT,
      note        TEXT,
      synced_at   TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_movements_date ON stock_movements_cache(date);
    CREATE INDEX IF NOT EXISTS idx_movements_item ON stock_movements_cache(item_id);

    CREATE TABLE IF NOT EXISTS restock_orders_cache (
      id            TEXT PRIMARY KEY,
      so_number     TEXT,
      order_date    TEXT,
      received_date TEXT,
      amount        REAL,
      trucking_fee  REAL,
      note          TEXT,
      synced_at     TEXT
    );

    CREATE TABLE IF NOT EXISTS item_sales_cache (
      id                  TEXT PRIMARY KEY,
      item_id             TEXT,
      item_name           TEXT,
      item_code           TEXT,
      item_srp            REAL,
      category_name       TEXT,
      quantity            REAL,
      unit_price_at_sale  REAL,
      discount            REAL,
      date                TEXT,
      remarks             TEXT,
      stock_movement_id   TEXT,
      created_at          TEXT,
      synced_at           TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_item_sales_date ON item_sales_cache(date);

    CREATE TABLE IF NOT EXISTS refill_container_types_cache (
      id          TEXT PRIMARY KEY,
      raw_name    TEXT NOT NULL,
      synced_at   TEXT
    );

    CREATE TABLE IF NOT EXISTS refill_water_types_cache (
      id        TEXT PRIMARY KEY,
      name      TEXT NOT NULL,
      synced_at TEXT
    );

    -- ── Sync Queue ────────────────────────────────────────────────────────────
    -- Each row is one pending write operation to be replayed against Supabase.
    CREATE TABLE IF NOT EXISTS sync_queue (
      id          TEXT PRIMARY KEY,
      table_name  TEXT NOT NULL,
      operation   TEXT NOT NULL,  -- 'insert' | 'update' | 'delete' | 'upsert'
      payload     TEXT NOT NULL,  -- JSON string of the full record / patch
      created_at  TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'syncing' | 'done' | 'error' | 'dead'
      error_msg   TEXT,
      attempts    INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_sync_queue_status ON sync_queue(status, created_at);

    -- ── Audit Logs (SQLite) ───────────────────────────────────────────────────
    -- Replaces the legacy JSON flat file — bounded, indexed, zero-copy-on-write
    CREATE TABLE IF NOT EXISTS audit_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      log_type    TEXT NOT NULL DEFAULT 'water',  -- 'water' | 'item'
      action      TEXT NOT NULL,
      details     TEXT NOT NULL,
      timestamp   TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_type_ts ON audit_logs(log_type, timestamp);

    -- ── Sync Meta ─────────────────────────────────────────────────────────────
    -- Tracks last successful full-table sync timestamp per table.
    CREATE TABLE IF NOT EXISTS sync_meta (
      table_name TEXT PRIMARY KEY,
      last_synced_at TEXT
    );
  `)
}

// ── Sync Queue Helpers ────────────────────────────────────────────────────────

import { randomUUID } from 'crypto'

/** Maximum number of sync attempts before an item is moved to 'dead' status */
export const MAX_SYNC_ATTEMPTS = 5

export interface SyncQueueItem {
  id: string
  table_name: string
  operation: 'insert' | 'update' | 'delete' | 'upsert'
  payload: Record<string, unknown>
  created_at: string
  status: 'pending' | 'syncing' | 'done' | 'error' | 'dead'
  error_msg?: string
  attempts: number
}

export function enqueueWrite(
  tableName: string,
  operation: SyncQueueItem['operation'],
  payload: Record<string, unknown>
): void {
  const db = getLocalDb()
  const id = randomUUID()
  db.prepare(`
    INSERT INTO sync_queue (id, table_name, operation, payload, created_at, status, attempts)
    VALUES (?, ?, ?, ?, ?, 'pending', 0)
  `).run(id, tableName, operation, JSON.stringify(payload), new Date().toISOString())
}

export function getPendingQueue(): SyncQueueItem[] {
  const db = getLocalDb()
  return db.prepare(`
    SELECT * FROM sync_queue WHERE status = 'pending' ORDER BY created_at ASC
  `).all() as SyncQueueItem[]
}

export function markQueueItem(id: string, status: SyncQueueItem['status'], errorMsg?: string): void {
  const db = getLocalDb()
  db.prepare(`
    UPDATE sync_queue SET status = ?, error_msg = ?, attempts = attempts + 1 WHERE id = ?
  `).run(status, errorMsg || null, id)
}

/** Move an item to 'dead' status — it will no longer be retried automatically */
export function markQueueItemDead(id: string, errorMsg?: string): void {
  const db = getLocalDb()
  db.prepare(`
    UPDATE sync_queue SET status = 'dead', error_msg = ?, attempts = attempts + 1 WHERE id = ?
  `).run(errorMsg || null, id)
}

/** Return all dead-letter items so the renderer can show them to the user */
export function getDeadQueueItems(): SyncQueueItem[] {
  const db = getLocalDb()
  return db.prepare(`
    SELECT * FROM sync_queue WHERE status = 'dead' ORDER BY created_at ASC
  `).all() as SyncQueueItem[]
}

/** Retry a dead-letter item by resetting it to pending */
export function retryDeadQueueItem(id: string): void {
  const db = getLocalDb()
  db.prepare(`
    UPDATE sync_queue SET status = 'pending', error_msg = NULL, attempts = 0 WHERE id = ? AND status = 'dead'
  `).run(id)
}

/** Discard a dead-letter item permanently */
export function discardDeadQueueItem(id: string): void {
  const db = getLocalDb()
  db.prepare(`DELETE FROM sync_queue WHERE id = ? AND status = 'dead'`).run(id)
}

export function getPendingCount(): number {
  const db = getLocalDb()
  const row = db.prepare(`SELECT COUNT(*) as n FROM sync_queue WHERE status IN ('pending', 'error')`).get() as { n: number }
  return row.n
}

export function getDeadCount(): number {
  const db = getLocalDb()
  const row = db.prepare(`SELECT COUNT(*) as n FROM sync_queue WHERE status = 'dead'`).get() as { n: number }
  return row.n
}

export function getLastSyncedAt(tableName: string): string | null {
  const db = getLocalDb()
  const row = db.prepare(`SELECT last_synced_at FROM sync_meta WHERE table_name = ?`).get(tableName) as { last_synced_at: string } | undefined
  return row?.last_synced_at ?? null
}

export function setLastSyncedAt(tableName: string): void {
  const db = getLocalDb()
  db.prepare(`
    INSERT INTO sync_meta (table_name, last_synced_at) VALUES (?, ?)
    ON CONFLICT(table_name) DO UPDATE SET last_synced_at = excluded.last_synced_at
  `).run(tableName, new Date().toISOString())
}

// ── Cache Read/Write Helpers ──────────────────────────────────────────────────

export function cacheRefillSales(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return
  const db = getLocalDb()
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO refill_sales_cache
    (id, date, sn, container_type_id, container_type_raw, water_type_id, water_type_raw,
     quantity, mode, unit_price, total, source_file, source_sheet, synced_at)
    VALUES (@id, @date, @sn, @container_type_id, @container_type_raw, @water_type_id, @water_type_raw,
            @quantity, @mode, @unit_price, @total, @source_file, @source_sheet, @synced_at)
  `)
  const now = new Date().toISOString()
  const insert = db.transaction((data: Record<string, unknown>[]) => {
    for (const r of data) stmt.run({ synced_at: now, ...r })
  })
  insert(rows)
}

export function deleteRefillSalesByDate(date: string): void {
  const db = getLocalDb()
  db.prepare(`DELETE FROM refill_sales_cache WHERE date = ?`).run(date)
}

export function getCachedRefillSalesByDate(date: string): Record<string, unknown>[] {
  const db = getLocalDb()
  return db.prepare(`SELECT * FROM refill_sales_cache WHERE date = ? ORDER BY sn ASC`).all(date) as Record<string, unknown>[]
}

export function cacheDailyExpenses(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return
  const db = getLocalDb()
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO daily_expenses_cache
    (id, date, sn, description, total, remarks, source_file, source_sheet, synced_at)
    VALUES (@id, @date, @sn, @description, @total, @remarks, @source_file, @source_sheet, @synced_at)
  `)
  const now = new Date().toISOString()
  const insert = db.transaction((data: Record<string, unknown>[]) => {
    for (const r of data) stmt.run({ synced_at: now, ...r })
  })
  insert(rows)
}

export function deleteDailyExpensesByDate(date: string): void {
  const db = getLocalDb()
  db.prepare(`DELETE FROM daily_expenses_cache WHERE date = ?`).run(date)
}

export function getCachedExpensesByDate(date: string): Record<string, unknown>[] {
  const db = getLocalDb()
  return db.prepare(`SELECT * FROM daily_expenses_cache WHERE date = ? ORDER BY sn ASC`).all(date) as Record<string, unknown>[]
}

export function cacheItems(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return
  const db = getLocalDb()
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO items_cache
    (id, name, code, category_id, category_name, packing, dealer_price, srp,
     batch_note, batch_date, low_stock_threshold, created_at, updated_at, synced_at)
    VALUES (@id, @name, @code, @category_id, @category_name, @packing, @dealer_price, @srp,
            @batch_note, @batch_date, @low_stock_threshold, @created_at, @updated_at, @synced_at)
  `)
  const now = new Date().toISOString()
  const insert = db.transaction((data: Record<string, unknown>[]) => {
    for (const r of data) stmt.run({ synced_at: now, ...r })
  })
  insert(rows)
}

export function getCachedItems(): Record<string, unknown>[] {
  const db = getLocalDb()
  return db.prepare(`SELECT * FROM items_cache ORDER BY name ASC`).all() as Record<string, unknown>[]
}

export function cacheCategories(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return
  const db = getLocalDb()
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO categories_cache (id, name, sort_order, synced_at)
    VALUES (@id, @name, @sort_order, @synced_at)
  `)
  const now = new Date().toISOString()
  const insert = db.transaction((data: Record<string, unknown>[]) => {
    for (const r of data) stmt.run({ synced_at: now, ...r })
  })
  insert(rows)
}

export function getCachedCategories(): Record<string, unknown>[] {
  const db = getLocalDb()
  return db.prepare(`SELECT * FROM categories_cache ORDER BY sort_order ASC`).all() as Record<string, unknown>[]
}

export function cacheBuyers(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return
  const db = getLocalDb()
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO buyers_cache (id, name, is_own_shop, synced_at)
    VALUES (@id, @name, @is_own_shop, @synced_at)
  `)
  const now = new Date().toISOString()
  const insert = db.transaction((data: Record<string, unknown>[]) => {
    for (const r of data) stmt.run({ synced_at: now, ...r })
  })
  insert(rows)
}

export function getCachedBuyers(): Record<string, unknown>[] {
  const db = getLocalDb()
  return db.prepare(`SELECT * FROM buyers_cache ORDER BY name ASC`).all() as Record<string, unknown>[]
}

export function cacheStockMovements(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return
  const db = getLocalDb()
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO stock_movements_cache
    (id, item_id, item_name, item_code, direction, quantity, buyer_id, buyer_name,
     date, source, source_id, note, synced_at)
    VALUES (@id, @item_id, @item_name, @item_code, @direction, @quantity, @buyer_id, @buyer_name,
            @date, @source, @source_id, @note, @synced_at)
  `)
  const now = new Date().toISOString()
  const insert = db.transaction((data: Record<string, unknown>[]) => {
    for (const r of data) stmt.run({ synced_at: now, ...r })
  })
  insert(rows)
}

export function getCachedStockMovements(): Record<string, unknown>[] {
  const db = getLocalDb()
  return db.prepare(`SELECT * FROM stock_movements_cache ORDER BY date ASC`).all() as Record<string, unknown>[]
}

export function cacheRestockOrders(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return
  const db = getLocalDb()
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO restock_orders_cache
    (id, so_number, order_date, received_date, amount, trucking_fee, note, synced_at)
    VALUES (@id, @so_number, @order_date, @received_date, @amount, @trucking_fee, @note, @synced_at)
  `)
  const now = new Date().toISOString()
  const insert = db.transaction((data: Record<string, unknown>[]) => {
    for (const r of data) stmt.run({ synced_at: now, ...r })
  })
  insert(rows)
}

export function getCachedRestockOrders(): Record<string, unknown>[] {
  const db = getLocalDb()
  return db.prepare(`SELECT * FROM restock_orders_cache ORDER BY order_date DESC`).all() as Record<string, unknown>[]
}

export function cacheItemSales(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return
  const db = getLocalDb()
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO item_sales_cache
    (id, item_id, item_name, item_code, item_srp, category_name, quantity,
     unit_price_at_sale, discount, date, remarks, stock_movement_id, created_at, synced_at)
    VALUES (@id, @item_id, @item_name, @item_code, @item_srp, @category_name, @quantity,
            @unit_price_at_sale, @discount, @date, @remarks, @stock_movement_id, @created_at, @synced_at)
  `)
  const now = new Date().toISOString()
  const insert = db.transaction((data: Record<string, unknown>[]) => {
    for (const r of data) stmt.run({ synced_at: now, ...r })
  })
  insert(rows)
}

export function getCachedItemSalesByMonth(startDate: string, endDate: string): Record<string, unknown>[] {
  const db = getLocalDb()
  return db.prepare(`
    SELECT * FROM item_sales_cache
    WHERE date >= ? AND date <= ?
    ORDER BY date ASC, created_at ASC
  `).all(startDate, endDate) as Record<string, unknown>[]
}

export function cacheRefillContainerTypes(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return
  const db = getLocalDb()
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO refill_container_types_cache (id, raw_name, synced_at)
    VALUES (@id, @raw_name, @synced_at)
  `)
  const now = new Date().toISOString()
  const insert = db.transaction((data: Record<string, unknown>[]) => {
    for (const r of data) stmt.run({ synced_at: now, ...r })
  })
  insert(rows)
}

export function cacheRefillWaterTypes(rows: Record<string, unknown>[]): void {
  if (rows.length === 0) return
  const db = getLocalDb()
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO refill_water_types_cache (id, name, synced_at)
    VALUES (@id, @name, @synced_at)
  `)
  const now = new Date().toISOString()
  const insert = db.transaction((data: Record<string, unknown>[]) => {
    for (const r of data) stmt.run({ synced_at: now, ...r })
  })
  insert(rows)
}

export function getCachedContainerTypes(): Record<string, unknown>[] {
  const db = getLocalDb()
  return db.prepare(`SELECT * FROM refill_container_types_cache`).all() as Record<string, unknown>[]
}

export function getCachedWaterTypes(): Record<string, unknown>[] {
  const db = getLocalDb()
  return db.prepare(`SELECT * FROM refill_water_types_cache`).all() as Record<string, unknown>[]
}

export function deleteCachedContainerType(rawName: string): void {
  const db = getLocalDb()
  db.prepare(`DELETE FROM refill_container_types_cache WHERE UPPER(raw_name) = UPPER(?)`).run(rawName)
}

export function deleteCachedWaterType(name: string): void {
  const db = getLocalDb()
  db.prepare(`DELETE FROM refill_water_types_cache WHERE UPPER(name) = UPPER(?)`).run(name)
}

// ── History helpers (aggregate from cache) ────────────────────────────────────

export function getCachedHistoryDays(): { date: string; rowCount: number; totalAmount: number; totalExpenses: number }[] {
  const db = getLocalDb()

  const salesRows = db.prepare(`
    SELECT date, COUNT(*) as row_count, SUM(total) as total_amount
    FROM refill_sales_cache
    GROUP BY date
  `).all() as { date: string; row_count: number; total_amount: number }[]

  const expenseRows = db.prepare(`
    SELECT date, SUM(total) as total_expenses
    FROM daily_expenses_cache
    GROUP BY date
  `).all() as { date: string; total_expenses: number }[]

  const salesByDate = new Map<string, { rowCount: number; totalAmount: number }>()
  for (const r of salesRows) salesByDate.set(r.date, { rowCount: r.row_count, totalAmount: r.total_amount || 0 })

  const expByDate = new Map<string, number>()
  for (const r of expenseRows) expByDate.set(r.date, r.total_expenses || 0)

  const allDates = new Set([...salesByDate.keys(), ...expByDate.keys()])
  const result: { date: string; rowCount: number; totalAmount: number; totalExpenses: number }[] = []

  for (const date of allDates) {
    const s = salesByDate.get(date) || { rowCount: 0, totalAmount: 0 }
    const totalExpenses = expByDate.get(date) || 0
    result.push({ date, rowCount: s.rowCount, totalAmount: s.totalAmount, totalExpenses })
  }

  result.sort((a, b) => b.date.localeCompare(a.date))
  return result
}

// ── SQLite Audit Log Helpers ──────────────────────────────────────────────────
// These replace the legacy unbounded JSON flat file (audit_logs_db.json).

export interface AuditLogEntry {
  id?: number
  log_type: 'water' | 'item'
  action: string
  details: string
  timestamp: string
}

/** Append a single audit log entry — O(1), no full-file rewrite */
export function appendAuditLog(entry: Omit<AuditLogEntry, 'id'>): void {
  const db = getLocalDb()
  db.prepare(`
    INSERT INTO audit_logs (log_type, action, details, timestamp)
    VALUES (?, ?, ?, ?)
  `).run(entry.log_type, entry.action, entry.details, entry.timestamp)
}

/** Read audit logs for a given month prefix (YYYY-MM) and log type */
export function getAuditLogs(logType: 'water' | 'item', monthPrefix: string): AuditLogEntry[] {
  const db = getLocalDb()
  return db.prepare(`
    SELECT id, log_type, action, details, timestamp
    FROM audit_logs
    WHERE log_type = ? AND timestamp LIKE ?
    ORDER BY timestamp DESC
    LIMIT 2000
  `).all(logType, `${monthPrefix}%`) as AuditLogEntry[]
}
