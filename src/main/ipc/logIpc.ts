import { ipcMain, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { IpcResult, LogEntry } from '../../shared/types'
import { appendAuditLog, getAuditLogs } from '../store/localDb'
import { getSupabase } from '../supabase/client'

// ── Timestamp helpers ─────────────────────────────────────────────────────────

function formatTs(dateObj: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}:${pad(dateObj.getSeconds())}`
}

function monthEndIso(month: string): string {
  const parts = month.split('-')
  const y = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  const lastDay = new Date(y, m, 0).getDate()
  return `${month}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`
}

// ── Legacy migration helpers (one-time, backward-compat) ──────────────────────

/** Migrate old audit_logs_db.json into SQLite on first startup */
function migrateJsonLogToSqlite(): void {
  try {
    const udir = app && typeof app.getPath === 'function' ? app.getPath('userData') : null
    if (!udir) return
    const jsonPath = path.join(udir, 'audit_logs_db.json')
    if (!fs.existsSync(jsonPath)) return

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
    if (!Array.isArray(data) || data.length === 0) return

    let migrated = 0
    for (const entry of data) {
      if (entry.log_type && entry.action && entry.details && entry.timestamp) {
        try {
          appendAuditLog({
            log_type: entry.log_type === 'item' ? 'item' : 'water',
            action: entry.action,
            details: entry.details,
            timestamp: entry.timestamp
          })
          migrated++
        } catch { /* skip duplicates */ }
      }
    }

    // Rename the JSON file so we don't re-migrate on next startup
    fs.renameSync(jsonPath, jsonPath + '.migrated')
    console.log(`[logIpc] Migrated ${migrated} audit log entries from JSON to SQLite.`)
  } catch (e) {
    console.warn('[logIpc] JSON log migration skipped:', e)
  }
}

export function registerLogIpc(): void {
  // One-time migration from legacy JSON log file
  migrateJsonLogToSqlite()

  // ─── Water / General Logs ─────────────────────────────────────────────────

  ipcMain.handle('log:append', async (_event, action: string, details: string): Promise<void> => {
    const now = new Date()
    const tsFormatted = formatTs(now)
    const tsIso = now.toISOString()

    // 1. Save to local SQLite (primary, always available, O(1) append)
    try {
      appendAuditLog({ log_type: 'water', action, details, timestamp: tsFormatted })
    } catch (e) {
      console.error('[log:append] SQLite write failed:', e)
    }

    // 2. Mirror to Supabase audit_logs (best-effort, non-blocking)
    getSupabase().then(sb => sb.from('audit_logs').insert({
      log_type: 'water', action, details, timestamp: tsIso
    })).then(res => {
      if (res && 'error' in res && res.error) console.warn('[log:append] Supabase audit_logs insert failed (non-fatal):', res.error.message)
    }).catch(() => {})
  })

  ipcMain.handle('log:read', async (_event, month: string): Promise<IpcResult<LogEntry[]>> => {
    try {
      const entriesMap = new Map<string, LogEntry>()

      // 1. Primary: read from local SQLite
      const localLogs = getAuditLogs('water', month)
      for (const row of localLogs) {
        const key = `${row.timestamp}|${row.action}|${row.details}`
        entriesMap.set(key, { timestamp: row.timestamp, action: row.action, details: row.details })
      }

      // 2. Supplement with Supabase for any entries not in local cache
      try {
        const sb = await getSupabase()
        const startIso = `${month}-01T00:00:00.000Z`
        const endIso = monthEndIso(month)
        const { data } = await sb
          .from('audit_logs')
          .select('action, details, timestamp')
          .eq('log_type', 'water')
          .gte('timestamp', startIso)
          .lte('timestamp', endIso)
          .order('timestamp', { ascending: false })

        for (const row of data || []) {
          let ts = row.timestamp
          try {
            const d = new Date(row.timestamp)
            if (!isNaN(d.getTime())) ts = formatTs(d)
          } catch {}
          const key = `${ts}|${row.action}|${row.details}`
          if (!entriesMap.has(key)) {
            entriesMap.set(key, { timestamp: ts, action: row.action, details: row.details })
          }
        }
      } catch {}

      const sorted = Array.from(entriesMap.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      return { ok: true, data: sorted }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  // ─── Item Sales Logs ──────────────────────────────────────────────────────

  ipcMain.handle('itemLog:append', async (_event, action: string, details: string): Promise<void> => {
    const now = new Date()
    const tsFormatted = formatTs(now)
    const tsIso = now.toISOString()

    // 1. Save to local SQLite (primary)
    try {
      appendAuditLog({ log_type: 'item', action, details, timestamp: tsFormatted })
    } catch (e) {
      console.error('[itemLog:append] SQLite write failed:', e)
    }

    // 2. Mirror to Supabase (best-effort)
    getSupabase().then(sb => sb.from('audit_logs').insert({
      log_type: 'item', action, details, timestamp: tsIso
    })).then(res => {
      if (res && 'error' in res && res.error) console.warn('[itemLog:append] Supabase audit_logs insert failed (non-fatal):', res.error.message)
    }).catch(() => {})
  })

  ipcMain.handle('itemLog:read', async (_event, month: string): Promise<IpcResult<LogEntry[]>> => {
    try {
      const entriesMap = new Map<string, LogEntry>()

      // 1. Primary: local SQLite
      const localLogs = getAuditLogs('item', month)
      for (const row of localLogs) {
        const key = `${row.timestamp}|${row.action}|${row.details}`
        entriesMap.set(key, { timestamp: row.timestamp, action: row.action, details: row.details })
      }

      // 2. Supplement from Supabase
      try {
        const sb = await getSupabase()
        const startIso = `${month}-01T00:00:00.000Z`
        const endIso = monthEndIso(month)
        const { data } = await sb
          .from('audit_logs')
          .select('action, details, timestamp')
          .eq('log_type', 'item')
          .gte('timestamp', startIso)
          .lte('timestamp', endIso)
          .order('timestamp', { ascending: false })

        for (const row of data || []) {
          let ts = row.timestamp
          try {
            const d = new Date(row.timestamp)
            if (!isNaN(d.getTime())) ts = formatTs(d)
          } catch {}
          const key = `${ts}|${row.action}|${row.details}`
          if (!entriesMap.has(key)) {
            entriesMap.set(key, { timestamp: ts, action: row.action, details: row.details })
          }
        }
      } catch {}

      const sorted = Array.from(entriesMap.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      return { ok: true, data: sorted }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })
}
