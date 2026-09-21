import { ipcMain, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { IpcResult, LogEntry } from '../../shared/types'
import { appendAuditLog, getAuditLogs } from '../store/localDb'
import { withSupabaseRetry } from '../supabase/client'

// ── Timestamp helpers ─────────────────────────────────────────────────────────

function formatTs(dateObj: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dateObj.getFullYear()}-${pad(dateObj.getMonth() + 1)}-${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}:${pad(dateObj.getSeconds())}`
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
    withSupabaseRetry(async (sb) => sb.from('audit_logs').insert({
      log_type: 'water', action, details, timestamp: tsIso
    })).then(res => {
      if (res && 'error' in res && res.error) console.warn('[log:append] Supabase audit_logs insert failed (non-fatal):', (res.error as any).message)
    }).catch(() => {})
  })

function getUtcQueryRange(prefix: string): { startIso: string; endIso: string } {
  // If prefix is a full date YYYY-MM-DD
  if (prefix.length === 10) {
    const d = new Date(prefix + 'T00:00:00Z')
    const prev = new Date(d.getTime() - 24 * 60 * 60 * 1000)
    const next = new Date(d.getTime() + 48 * 60 * 60 * 1000 - 1)
    return { startIso: prev.toISOString(), endIso: next.toISOString() }
  }
  // If prefix is YYYY-MM
  const parts = prefix.split('-')
  const y = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  const startDate = new Date(Date.UTC(y, m - 1, 1))
  const lastDay = new Date(y, m, 0).getDate()
  const endDate = new Date(Date.UTC(y, m - 1, lastDay, 23, 59, 59, 999))

  // Buffer ±24 hours so any UTC vs local time differences never omit boundary records
  const expandedStart = new Date(startDate.getTime() - 24 * 60 * 60 * 1000)
  const expandedEnd = new Date(endDate.getTime() + 24 * 60 * 60 * 1000)
  return { startIso: expandedStart.toISOString(), endIso: expandedEnd.toISOString() }
}

async function fetchMergedAuditLogs(logType: 'water' | 'item', prefix: string): Promise<IpcResult<LogEntry[]>> {
  try {
    const entriesMap = new Map<string, LogEntry>()

    // 1. Primary: read from local SQLite
    const localLogs = getAuditLogs(logType, prefix)
    for (const row of localLogs) {
      const key = `${row.timestamp}|${row.action}|${row.details}`
      entriesMap.set(key, { timestamp: row.timestamp, action: row.action, details: row.details })
    }

    // 2. Supplement from Supabase for any records synced from elsewhere or re-installed
    try {
      await withSupabaseRetry(async (sb) => {
        const { startIso, endIso } = getUtcQueryRange(prefix)
        const { data } = await sb
          .from('audit_logs')
          .select('action, details, timestamp')
          .eq('log_type', logType)
          .gte('timestamp', startIso)
          .lte('timestamp', endIso)
          .order('timestamp', { ascending: false })

        for (const row of data || []) {
          let ts = row.timestamp
          try {
            const d = new Date(row.timestamp)
            if (!isNaN(d.getTime())) ts = formatTs(d)
          } catch {}

          // Filter by local date/month prefix
          if (!ts.startsWith(prefix)) continue

          const key = `${ts}|${row.action}|${row.details}`
          if (!entriesMap.has(key)) {
            entriesMap.set(key, { timestamp: ts, action: row.action, details: row.details })
          }
        }
      })
    } catch (sbErr) {
      console.warn(`[logIpc] Supabase audit_logs supplement query failed (non-fatal):`, sbErr)
    }

    // Strictly sort newest first
    const sorted = Array.from(entriesMap.values()).sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    return { ok: true, data: sorted }
  } catch (e: unknown) {
    return { ok: false, error: String(e) }
  }
}

  ipcMain.handle('log:read', async (_event, monthOrDate: string): Promise<IpcResult<LogEntry[]>> => {
    return fetchMergedAuditLogs('water', monthOrDate)
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
    withSupabaseRetry(async (sb) => sb.from('audit_logs').insert({
      log_type: 'item', action, details, timestamp: tsIso
    })).then(res => {
      if (res && 'error' in res && res.error) console.warn('[itemLog:append] Supabase audit_logs insert failed (non-fatal):', (res.error as any).message)
    }).catch(() => {})
  })

  ipcMain.handle('itemLog:read', async (_event, monthOrDate: string): Promise<IpcResult<LogEntry[]>> => {
    return fetchMergedAuditLogs('item', monthOrDate)
  })
}
