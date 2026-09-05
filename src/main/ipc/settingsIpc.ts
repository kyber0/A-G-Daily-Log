import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import type { AppConfig, IpcResult } from '../../shared/types'
import { readConfig, writeConfig } from '../store/config'
import { testSupabaseAuth, getSupabase } from '../supabase/client'
import {
  getLocalDb,
  enqueueWrite,
  deleteCachedContainerType,
  deleteCachedWaterType
} from '../store/localDb'

export async function syncRefillSettingsToDatabase(
  updated: AppConfig,
  prev?: AppConfig
): Promise<{ containersSynced: number; waterTypesSynced: number; pricesSynced: number }> {
  const db = getLocalDb()
  const now = new Date().toISOString()
  let containersSynced = 0
  let waterTypesSynced = 0
  let pricesSynced = 0

  // ── 1. Local SQLite Cache Sync ──────────────────────────────────────────────
  if (updated.containerTypes && Array.isArray(updated.containerTypes)) {
    for (const ct of updated.containerTypes) {
      const rawName = ct.name.trim().toUpperCase()
      if (!rawName) continue
      const existing = db.prepare('SELECT id FROM refill_container_types_cache WHERE UPPER(raw_name) = ?').get(rawName) as { id: string } | undefined
      if (!existing) {
        db.prepare('INSERT INTO refill_container_types_cache (id, raw_name, synced_at) VALUES (?, ?, ?)')
          .run(randomUUID(), rawName, now)
      }
      containersSynced++
    }

    if (prev && prev.containerTypes) {
      const currentNames = new Set(updated.containerTypes.map(c => c.name.trim().toUpperCase()))
      for (const oldCt of prev.containerTypes) {
        const oldName = oldCt.name.trim().toUpperCase()
        if (oldName && !currentNames.has(oldName)) {
          deleteCachedContainerType(oldName)
        }
      }
    }
  }

  if (updated.waterTypes && Array.isArray(updated.waterTypes)) {
    for (const wt of updated.waterTypes) {
      const name = wt.trim().toUpperCase()
      if (!name) continue
      const existing = db.prepare('SELECT id FROM refill_water_types_cache WHERE UPPER(name) = ?').get(name) as { id: string } | undefined
      if (!existing) {
        db.prepare('INSERT INTO refill_water_types_cache (id, name, synced_at) VALUES (?, ?, ?)')
          .run(randomUUID(), name, now)
      }
      waterTypesSynced++
    }

    if (prev && prev.waterTypes) {
      const currentWaters = new Set(updated.waterTypes.map(w => w.trim().toUpperCase()))
      for (const oldWt of prev.waterTypes) {
        const oldName = oldWt.trim().toUpperCase()
        if (oldName && !currentWaters.has(oldName)) {
          deleteCachedWaterType(oldName)
        }
      }
    }
  }

  // ── 2. Supabase Cloud Sync ──────────────────────────────────────────────────
  try {
    const sb = await getSupabase()

    // 2a. Sync Container Types
    const { data: dbContainers } = await sb.from('refill_container_types').select('id, raw_name')
    const containerIdMap = new Map<string, string>()
    if (dbContainers) {
      for (const c of dbContainers) {
        containerIdMap.set(c.raw_name.trim().toUpperCase(), c.id)
      }
    }

    for (const ct of updated.containerTypes) {
      const name = ct.name.trim().toUpperCase()
      if (!name) continue
      if (!containerIdMap.has(name)) {
        const { data: ins, error } = await sb
          .from('refill_container_types')
          .insert({ raw_name: name })
          .select('id, raw_name')
          .single()
        if (ins) {
          containerIdMap.set(name, ins.id)
          db.prepare('UPDATE refill_container_types_cache SET id = ?, synced_at = ? WHERE UPPER(raw_name) = ?')
            .run(ins.id, now, name)
        } else if (error) {
          console.warn('[settingsIpc] Supabase container insert warning:', error.message)
        }
      } else {
        const sbId = containerIdMap.get(name)!
        db.prepare('UPDATE refill_container_types_cache SET id = ?, synced_at = ? WHERE UPPER(raw_name) = ?')
          .run(sbId, now, name)
      }
    }

    // Handle removed containers in Supabase
    if (prev && prev.containerTypes) {
      const currentNames = new Set(updated.containerTypes.map(c => c.name.trim().toUpperCase()))
      for (const oldCt of prev.containerTypes) {
        const oldName = oldCt.name.trim().toUpperCase()
        if (oldName && !currentNames.has(oldName)) {
          try {
            await sb.from('refill_container_types').delete().ilike('raw_name', oldName)
          } catch (delErr) {
            console.warn('[settingsIpc] Could not delete old container in Supabase:', delErr)
          }
        }
      }
    }

    // 2b. Sync Water Types
    const { data: dbWater } = await sb.from('refill_water_types').select('id, name')
    const waterIdMap = new Map<string, string>()
    if (dbWater) {
      for (const w of dbWater) {
        waterIdMap.set(w.name.trim().toUpperCase(), w.id)
      }
    }

    for (const wt of updated.waterTypes) {
      const name = wt.trim().toUpperCase()
      if (!name) continue
      if (!waterIdMap.has(name)) {
        const { data: ins, error } = await sb
          .from('refill_water_types')
          .insert({ name })
          .select('id, name')
          .single()
        if (ins) {
          waterIdMap.set(name, ins.id)
          db.prepare('UPDATE refill_water_types_cache SET id = ?, synced_at = ? WHERE UPPER(name) = ?')
            .run(ins.id, now, name)
        } else if (error) {
          console.warn('[settingsIpc] Supabase water insert warning:', error.message)
        }
      } else {
        const sbId = waterIdMap.get(name)!
        db.prepare('UPDATE refill_water_types_cache SET id = ?, synced_at = ? WHERE UPPER(name) = ?')
          .run(sbId, now, name)
      }
    }

    // Handle removed water types in Supabase
    if (prev && prev.waterTypes) {
      const currentWaters = new Set(updated.waterTypes.map(w => w.trim().toUpperCase()))
      for (const oldWt of prev.waterTypes) {
        const oldName = oldWt.trim().toUpperCase()
        if (oldName && !currentWaters.has(oldName)) {
          try {
            await sb.from('refill_water_types').delete().ilike('name', oldName)
          } catch (delErr) {
            console.warn('[settingsIpc] Could not delete old water in Supabase:', delErr)
          }
        }
      }
    }

    // 2c. Sync Price Table to refill_price_list
    if (updated.priceTable && Array.isArray(updated.priceTable)) {
      for (const pt of updated.priceTable) {
        const cId = containerIdMap.get(pt.container.trim().toUpperCase())
        const wId = pt.water ? waterIdMap.get(pt.water.trim().toUpperCase()) : null
        if (!cId) continue

        const checkQuery = sb.from('refill_price_list').select('id').eq('container_type_id', cId)
        if (wId) checkQuery.eq('water_type_id', wId)
        else checkQuery.is('water_type_id', null)

        const { data: existingPrice } = await checkQuery.maybeSingle()
        if (existingPrice) {
          await sb.from('refill_price_list').update({
            price_pickup: pt.pickup,
            price_deliver: pt.deliver,
            effective_date: new Date().toISOString().substring(0, 10)
          }).eq('id', existingPrice.id)
        } else {
          await sb.from('refill_price_list').insert({
            container_type_id: cId,
            water_type_id: wId || null,
            price_pickup: pt.pickup,
            price_deliver: pt.deliver,
            effective_date: new Date().toISOString().substring(0, 10)
          })
        }
        pricesSynced++
      }
    }
  } catch (err: any) {
    console.warn('[settingsIpc] Supabase sync skipped or offline:', err?.message || err)
    // Offline queue fallback
    for (const ct of updated.containerTypes) {
      const rawName = ct.name.trim().toUpperCase()
      if (rawName) enqueueWrite('refill_container_types', 'upsert', { raw_name: rawName })
    }
    for (const wt of updated.waterTypes) {
      const name = wt.trim().toUpperCase()
      if (name) enqueueWrite('refill_water_types', 'upsert', { name })
    }
  }

  return { containersSynced, waterTypesSynced, pricesSynced }
}

export function registerSettingsIpc(): void {
  ipcMain.handle('getSettings', (): IpcResult<AppConfig> => {
    try {
      return { ok: true, data: readConfig() }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle('updateSettings', async (_event, partial: Partial<AppConfig>): Promise<IpcResult<AppConfig>> => {
    try {
      const current = readConfig()
      const updated = { ...current, ...partial }
      writeConfig(updated)

      // Automatically sync container types, water types, and price table to local DB and Supabase
      if (partial.containerTypes || partial.waterTypes || partial.priceTable) {
        await syncRefillSettingsToDatabase(updated, current).catch(err => {
          console.error('[updateSettings] Database sync error:', err)
        })
      }

      return { ok: true, data: updated }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle('syncSettingsToDatabase', async (): Promise<IpcResult<{ containersSynced: number; waterTypesSynced: number; pricesSynced: number }>> => {
    try {
      const current = readConfig()
      const res = await syncRefillSettingsToDatabase(current)
      return { ok: true, data: res }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle('testSupabaseAuth', async (
    _event,
    creds: { url: string; anonKey: string; email: string; password: string }
  ): Promise<IpcResult<void>> => {
    try {
      const res = await testSupabaseAuth(creds.url, creds.anonKey, creds.email, creds.password)
      if (!res.ok) {
        return { ok: false, error: res.error || 'Authentication failed.' }
      }
      return { ok: true, data: undefined }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  /** Open folder dialog and return selected path without mutating config directly */
  ipcMain.handle('chooseFolder', async (_event, title?: string): Promise<IpcResult<string>> => {
    try {
      const win = BrowserWindow.getFocusedWindow() || undefined
      const result = await dialog.showOpenDialog(win as any, {
        title: title || 'Select Folder',
        properties: ['openDirectory', 'createDirectory'],
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, error: 'cancelled' }
      }
      return { ok: true, data: result.filePaths[0] }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle('openSaveFolder', (): void => {
    const cfg = readConfig()
    if (cfg.saveFolder) shell.openPath(cfg.saveFolder)
  })

  // Synchronize existing settings into database on launch (deferred)
  setTimeout(() => {
    try {
      const cfg = readConfig()
      syncRefillSettingsToDatabase(cfg).catch(err => {
        console.warn('[registerSettingsIpc] Initial database sync notice:', err?.message || err)
      })
    } catch {}
  }, 1200)
}
