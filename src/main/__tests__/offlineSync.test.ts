import { describe, it, expect, beforeEach } from 'vitest'
import Database from 'better-sqlite3'

describe('Offline Sync Queue & Pending Helpers', () => {
  let db: Database.Database

  beforeEach(() => {
    db = new Database(':memory:')
    db.exec(`
      CREATE TABLE sync_queue (
        id          TEXT PRIMARY KEY,
        table_name  TEXT NOT NULL,
        operation   TEXT NOT NULL,
        payload     TEXT NOT NULL,
        created_at  TEXT NOT NULL,
        status      TEXT NOT NULL DEFAULT 'pending',
        error_msg   TEXT,
        attempts    INTEGER DEFAULT 0
      );
    `)
  })

  function hasPendingSyncForDate(tableName: string, date: string): boolean {
    const row = db.prepare(`
      SELECT 1 FROM sync_queue
      WHERE table_name = ?
        AND status IN ('pending', 'syncing', 'error')
        AND (payload LIKE ? OR payload LIKE ?)
      LIMIT 1
    `).get(tableName, `%"date":"${date}"%`, `%"_deleteByDate":"${date}"%`)
    return !!row
  }

  function hasPendingSyncForMonth(tableName: string, monthStr: string): boolean {
    const row = db.prepare(`
      SELECT 1 FROM sync_queue
      WHERE table_name = ?
        AND status IN ('pending', 'syncing', 'error')
        AND payload LIKE ?
      LIMIT 1
    `).get(tableName, `%"date":"${monthStr}-%`)
    return !!row
  }

  function getPendingQueue() {
    return db.prepare(`
      SELECT * FROM sync_queue WHERE status IN ('pending', 'error') ORDER BY created_at ASC
    `).all()
  }

  it('detects pending sync for a specific date from insert payload', () => {
    expect(hasPendingSyncForDate('refill_sales', '2026-09-12')).toBe(false)

    db.prepare(`
      INSERT INTO sync_queue (id, table_name, operation, payload, created_at, status)
      VALUES ('1', 'refill_sales', 'insert', '{"date":"2026-09-12","quantity":5,"sn":1}', datetime('now'), 'pending')
    `).run()

    expect(hasPendingSyncForDate('refill_sales', '2026-09-12')).toBe(true)
    expect(hasPendingSyncForDate('refill_sales', '2026-09-13')).toBe(false)
  })

  it('detects pending sync for a specific date from _deleteByDate payload', () => {
    db.prepare(`
      INSERT INTO sync_queue (id, table_name, operation, payload, created_at, status)
      VALUES ('2', 'refill_sales', 'delete', '{"_deleteByDate":"2026-09-12"}', datetime('now'), 'pending')
    `).run()

    expect(hasPendingSyncForDate('refill_sales', '2026-09-12')).toBe(true)
    expect(hasPendingSyncForDate('refill_sales', '2026-09-11')).toBe(false)
  })

  it('does not flag done or dead queue items as pending', () => {
    db.prepare(`
      INSERT INTO sync_queue (id, table_name, operation, payload, created_at, status)
      VALUES ('3', 'refill_sales', 'insert', '{"date":"2026-09-12"}', datetime('now'), 'done')
    `).run()

    expect(hasPendingSyncForDate('refill_sales', '2026-09-12')).toBe(false)

    db.prepare(`
      INSERT INTO sync_queue (id, table_name, operation, payload, created_at, status)
      VALUES ('4', 'refill_sales', 'insert', '{"date":"2026-09-12"}', datetime('now'), 'dead')
    `).run()

    expect(hasPendingSyncForDate('refill_sales', '2026-09-12')).toBe(false)
  })

  it('detects pending sync for month (YYYY-MM)', () => {
    expect(hasPendingSyncForMonth('item_sales', '2026-09')).toBe(false)

    db.prepare(`
      INSERT INTO sync_queue (id, table_name, operation, payload, created_at, status)
      VALUES ('5', 'item_sales', 'insert', '{"date":"2026-09-15","quantity":2}', datetime('now'), 'pending')
    `).run()

    expect(hasPendingSyncForMonth('item_sales', '2026-09')).toBe(true)
    expect(hasPendingSyncForMonth('item_sales', '2026-10')).toBe(false)
  })

  it('retrieves both pending and error items in getPendingQueue', () => {
    db.prepare(`
      INSERT INTO sync_queue (id, table_name, operation, payload, created_at, status)
      VALUES ('6', 'refill_sales', 'insert', '{}', '2026-09-12T01:00:00Z', 'pending')
    `).run()

    db.prepare(`
      INSERT INTO sync_queue (id, table_name, operation, payload, created_at, status)
      VALUES ('7', 'refill_sales', 'insert', '{}', '2026-09-12T01:05:00Z', 'error')
    `).run()

    db.prepare(`
      INSERT INTO sync_queue (id, table_name, operation, payload, created_at, status)
      VALUES ('8', 'refill_sales', 'insert', '{}', '2026-09-12T01:10:00Z', 'done')
    `).run()

    const pending = getPendingQueue()
    expect(pending.length).toBe(2)
    expect(pending.map((p: any) => p.id)).toEqual(['6', '7'])
  })
})
