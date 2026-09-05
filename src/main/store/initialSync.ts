import { BrowserWindow } from 'electron'
import { getLastSyncedAt } from './localDb'
import { syncTableToCache, isOnline } from './syncEngine'

const ALL_TABLES = [
  'categories',
  'buyers',
  'items',
  'refill_container_types',
  'refill_water_types',
  'stock_movements',
  'restock_orders',
  'refill_sales',
  'daily_expenses',
  'item_sales',
]

let _isSyncing = false

/**
 * Runs an initial sync of all tables from Supabase into the local SQLite cache.
 * Only runs if:
 *  - The app is online
 *  - A table has never been synced (no entry in sync_meta), OR
 *  - The last sync for any table was more than 1 hour ago (to catch up on changes from Supabase)
 */
export async function runInitialSync(): Promise<void> {
  if (_isSyncing) return
  if (!isOnline()) {
    console.log('[initialSync] Offline — skipping initial sync, will use local cache.')
    return
  }

  _isSyncing = true
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()

    const tablesToSync = ALL_TABLES.filter(table => {
      const lastSynced = getLastSyncedAt(table)
      return !lastSynced || lastSynced < oneHourAgo
    })

    if (tablesToSync.length === 0) {
      console.log('[initialSync] All tables are up to date.')
      return
    }

    console.log(`[initialSync] Syncing ${tablesToSync.length} tables: ${tablesToSync.join(', ')}`)

    for (const table of tablesToSync) {
      try {
        await syncTableToCache(table)
        console.log(`[initialSync] ✓ ${table}`)
      } catch (e: unknown) {
        console.warn(`[initialSync] ✗ ${table} failed:`, e instanceof Error ? e.message : String(e))
        // Non-fatal — continue with other tables and fall back to cached data
      }
    }

    console.log('[initialSync] Complete.')

    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('sync:complete')
      }
    }
  } finally {
    _isSyncing = false
  }
}
