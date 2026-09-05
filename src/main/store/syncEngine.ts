import { net, ipcMain, BrowserWindow } from 'electron'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from '../supabase/client'
import { runInitialSync } from './initialSync'
import {
  getPendingQueue,
  markQueueItem,
  markQueueItemDead,
  getPendingCount,
  getDeadCount,
  getDeadQueueItems,
  retryDeadQueueItem,
  discardDeadQueueItem,
  SyncQueueItem,
  MAX_SYNC_ATTEMPTS,
  getLocalDb,
  cacheItems,
  cacheCategories,
  cacheBuyers,
  cacheStockMovements,
  cacheRestockOrders,
  cacheItemSales,
  cacheRefillSales,
  cacheDailyExpenses,
  cacheRefillContainerTypes,
  cacheRefillWaterTypes,
  setLastSyncedAt,
  getLastSyncedAt
} from './localDb'

// ── Connectivity state ────────────────────────────────────────────────────────
let _isOnline: boolean = true
let _syncInterval: ReturnType<typeof setInterval> | null = null
let _isDraining: boolean = false

export function isOnline(): boolean {
  return net.isOnline()
}

function notifyRenderer(): void {
  const pending = getPendingCount()
  const dead   = getDeadCount()
  const online = isOnline()
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('connectivity:change', { isOnline: online, pendingCount: pending, deadCount: dead })
    }
  }
}

// ── Start background sync scheduler ──────────────────────────────────────────
export function startSyncEngine(): void {
  // Check every 15 seconds — detect reconnect and drain queue
  _syncInterval = setInterval(async () => {
    const nowOnline = isOnline()
    const wasOffline = !_isOnline

    if (nowOnline !== _isOnline) {
      _isOnline = nowOnline
      notifyRenderer()
    }

    if (nowOnline && (wasOffline || getPendingCount() > 0)) {
      if (wasOffline) {
        runInitialSync().catch(e => console.warn('[syncEngine] initialSync on reconnect error:', e))
      }
      await drainQueue()
    }
  }, 15_000)
}

export function stopSyncEngine(): void {
  if (_syncInterval) {
    clearInterval(_syncInterval)
    _syncInterval = null
  }
}

// ── Drain the sync queue ──────────────────────────────────────────────────────
export async function drainQueue(): Promise<{ synced: number; failed: number; dead: number }> {
  if (_isDraining) return { synced: 0, failed: 0, dead: 0 }
  _isDraining = true

  const sb = await getSupabase()
  const pending = getPendingQueue()
  let synced = 0
  let failed = 0
  let movedToDead = 0

  for (const item of pending) {
    // Respect exponential back-off: skip items that failed recently
    if (item.attempts > 0 && item.status === 'error') {
      const backoffMs = Math.min(1000 * Math.pow(2, item.attempts - 1), 60_000) // max 1 min
      const lastTs = new Date(item.created_at).getTime()
      if (Date.now() - lastTs < backoffMs) continue
    }

    // Dead-letter: move to 'dead' after too many failures
    if (item.attempts >= MAX_SYNC_ATTEMPTS) {
      markQueueItemDead(item.id, `Exceeded max retry attempts (${MAX_SYNC_ATTEMPTS})`)
      movedToDead++
      console.warn(`[syncEngine] Item ${item.id} (${item.table_name}/${item.operation}) moved to dead-letter after ${item.attempts} attempts.`)
      continue
    }

    try {
      await replayOperation(sb, item)
      markQueueItem(item.id, 'done')
      synced++
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      markQueueItem(item.id, 'error', msg)
      console.error(`[syncEngine] Failed to replay queue item ${item.id} on ${item.table_name} (attempt ${item.attempts + 1}/${MAX_SYNC_ATTEMPTS}):`, msg)
      failed++
    }
  }

  _isDraining = false

  if (synced > 0 || failed > 0 || movedToDead > 0) {
    notifyRenderer()
    if (movedToDead > 0) {
      // Alert renderer so it can show a warning toast
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('sync:dead-items', { count: movedToDead })
        }
      }
    }
  }

  return { synced, failed, dead: movedToDead }
}

async function replayOperation(sb: SupabaseClient, item: SyncQueueItem): Promise<void> {
  const payload = typeof item.payload === 'string' ? JSON.parse(item.payload) : item.payload

  switch (item.operation) {
    case 'insert': {
      const { error } = await sb.from(item.table_name).insert(payload)
      if (error) {
        // Postgres unique violation (23505) means already present, which is successful for idempotent inserts
        if (error.code === '23505') break
        throw new Error(error.message)
      }
      break
    }
    case 'upsert': {
      const onConflict = item.table_name === 'refill_container_types'
        ? 'raw_name'
        : (item.table_name === 'refill_water_types' ? 'name' : undefined)
      const { error } = await sb.from(item.table_name).upsert(payload, onConflict ? { onConflict } : undefined)
      if (error) throw new Error(error.message)
      break
    }
    case 'update': {
      const { id, ...patch } = payload
      if (!id) throw new Error('update operation missing id')
      const { error } = await sb.from(item.table_name).update(patch).eq('id', id)
      if (error) throw new Error(error.message)
      break
    }
    case 'delete': {
      if (payload._deleteByDate) {
        const { error } = await sb.from(item.table_name).delete().eq('date', payload._deleteByDate)
        if (error) throw new Error(error.message)
        break
      }
      const { id } = payload
      if (!id) throw new Error('delete operation missing id')
      const { error } = await sb.from(item.table_name).delete().eq('id', id)
      if (error) throw new Error(error.message)
      break
    }
  }
}

// ── Full table sync (populate local cache from Supabase) ──────────────────────
export async function syncTableToCache(tableName: string): Promise<void> {
  const sb = await getSupabase()
  const pageSize = 1000

  switch (tableName) {
    case 'items': {
      const { data } = await sb
        .from('items')
        .select('id, name, code, category_id, packing, dealer_price, srp, batch_note, batch_date, low_stock_threshold, created_at, updated_at, categories(id, name)')
        .order('name', { ascending: true })
      if (data) {
        cacheItems(data.map((i: any) => ({
          id: i.id,
          name: i.name,
          code: i.code || null,
          category_id: i.category_id || null,
          category_name: (i.categories as any)?.name || 'CONTAINERS',
          packing: i.packing || null,
          dealer_price: Number(i.dealer_price) || 0,
          srp: Number(i.srp) || 0,
          batch_note: i.batch_note || null,
          batch_date: i.batch_date || null,
          low_stock_threshold: i.low_stock_threshold ?? null,
          created_at: i.created_at,
          updated_at: i.updated_at
        })))
      }
      setLastSyncedAt('items')
      break
    }

    case 'categories': {
      const { data } = await sb.from('categories').select('id, name, sort_order').order('sort_order', { ascending: true })
      if (data) cacheCategories(data.map((c: any) => ({ id: c.id, name: c.name, sort_order: c.sort_order ?? 0 })))
      setLastSyncedAt('categories')
      break
    }

    case 'buyers': {
      const { data } = await sb.from('buyers').select('id, name, is_own_shop').order('name', { ascending: true })
      if (data) cacheBuyers(data.map((b: any) => ({ id: b.id, name: b.name, is_own_shop: b.is_own_shop ? 1 : 0 })))
      setLastSyncedAt('buyers')
      break
    }

    case 'stock_movements': {
      let all: any[] = []
      let from = 0
      while (true) {
        const { data: chunk } = await sb
          .from('stock_movements')
          .select('id, item_id, direction, quantity, buyer_id, date, source, source_id, note, buyers(name), items(name, code)')
          .order('date', { ascending: true })
          .range(from, from + pageSize - 1)
        if (!chunk || chunk.length === 0) break
        all = all.concat(chunk)
        if (chunk.length < pageSize) break
        from += pageSize
      }
      cacheStockMovements(all.map((m: any) => ({
        id: m.id,
        item_id: m.item_id,
        item_name: m.items?.name || null,
        item_code: m.items?.code || null,
        direction: m.direction,
        quantity: Number(m.quantity) || 0,
        buyer_id: m.buyer_id || null,
        buyer_name: m.buyers?.name || null,
        date: m.date,
        source: m.source,
        source_id: m.source_id || null,
        note: m.note || null
      })))
      setLastSyncedAt('stock_movements')
      break
    }

    case 'restock_orders': {
      const { data } = await sb.from('restock_orders').select('id, so_number, order_date, received_date, amount, trucking_fee, note').order('order_date', { ascending: false })
      if (data) cacheRestockOrders(data.map((o: any) => ({
        id: o.id,
        so_number: o.so_number || null,
        order_date: o.order_date,
        received_date: o.received_date || null,
        amount: Number(o.amount) || 0,
        trucking_fee: o.trucking_fee ? Number(o.trucking_fee) : null,
        note: o.note || null
      })))
      setLastSyncedAt('restock_orders')
      break
    }

    case 'item_sales': {
      let all: any[] = []
      let from = 0
      while (true) {
        const { data: chunk } = await sb
          .from('item_sales')
          .select('id, item_id, quantity, unit_price_at_sale, discount, date, remarks, stock_movement_id, created_at, items(name, code, srp, categories(name))')
          .order('date', { ascending: true })
          .range(from, from + pageSize - 1)
        if (!chunk || chunk.length === 0) break
        all = all.concat(chunk)
        if (chunk.length < pageSize) break
        from += pageSize
      }
      cacheItemSales(all.map((r: any) => ({
        id: r.id,
        item_id: r.item_id,
        item_name: r.items?.name || null,
        item_code: r.items?.code || null,
        item_srp: r.items?.srp ? Number(r.items.srp) : null,
        category_name: (r.items as any)?.categories?.name || null,
        quantity: Number(r.quantity) || 0,
        unit_price_at_sale: Number(r.unit_price_at_sale) || 0,
        discount: Number(r.discount) || 0,
        date: r.date,
        remarks: r.remarks || null,
        stock_movement_id: r.stock_movement_id || null,
        created_at: r.created_at
      })))
      setLastSyncedAt('item_sales')
      break
    }

    case 'refill_sales': {
      let all: any[] = []
      let from = 0
      while (true) {
        const { data: chunk } = await sb
          .from('refill_sales')
          .select('id, date, sn, container_type_id, container_type_raw, water_type_id, water_type_raw, quantity, mode, unit_price, total, source_file, source_sheet')
          .order('date', { ascending: true })
          .range(from, from + pageSize - 1)
        if (!chunk || chunk.length === 0) break
        all = all.concat(chunk)
        if (chunk.length < pageSize) break
        from += pageSize
      }
      cacheRefillSales(all.map((r: any) => ({ ...r })))
      setLastSyncedAt('refill_sales')
      break
    }

    case 'daily_expenses': {
      let all: any[] = []
      let from = 0
      while (true) {
        const { data: chunk } = await sb
          .from('daily_expenses')
          .select('id, date, sn, description, total, remarks, source_file, source_sheet')
          .order('date', { ascending: true })
          .range(from, from + pageSize - 1)
        if (!chunk || chunk.length === 0) break
        all = all.concat(chunk)
        if (chunk.length < pageSize) break
        from += pageSize
      }
      cacheDailyExpenses(all.map((r: any) => ({ ...r })))
      setLastSyncedAt('daily_expenses')
      break
    }

    case 'refill_container_types': {
      const { data } = await sb.from('refill_container_types').select('id, raw_name')
      if (data) cacheRefillContainerTypes(data.map((r: any) => ({ id: r.id, raw_name: r.raw_name })))
      setLastSyncedAt('refill_container_types')
      break
    }

    case 'refill_water_types': {
      const { data } = await sb.from('refill_water_types').select('id, name')
      if (data) cacheRefillWaterTypes(data.map((r: any) => ({ id: r.id, name: r.name })))
      setLastSyncedAt('refill_water_types')
      break
    }
  }
}

// ── IPC registration ──────────────────────────────────────────────────────────
export function registerConnectivityIpc(): void {
  ipcMain.handle('connectivity:status', (): { isOnline: boolean; pendingCount: number; deadCount: number } => {
    return { isOnline: isOnline(), pendingCount: getPendingCount(), deadCount: getDeadCount() }
  })

  ipcMain.handle('sync:now', async (): Promise<{ synced: number; failed: number; dead: number }> => {
    if (!isOnline()) return { synced: 0, failed: 0, dead: 0 }
    runInitialSync().catch(() => {})
    return drainQueue()
  })

  // ── Dead-letter queue management ────────────────────────────────────────────
  ipcMain.handle('sync:deadItems', (): SyncQueueItem[] => {
    return getDeadQueueItems()
  })

  ipcMain.handle('sync:retryDead', (_e, id: string): void => {
    if (typeof id === 'string' && id.length > 0) retryDeadQueueItem(id)
  })

  ipcMain.handle('sync:discardDead', (_e, id: string): void => {
    if (typeof id === 'string' && id.length > 0) discardDeadQueueItem(id)
  })
}
