import { ipcMain, dialog, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import type {
  IpcResult, StockDB, StockItem, StockMovement,
  RestockOrder, StockBuyer, StockCategory, StockItemRow
} from '../../shared/types'
import { getSupabase } from '../supabase/client'
import { isOnline } from '../store/syncEngine'
import {
  getLocalDb, enqueueWrite,
  getCachedItems, getCachedCategories, getCachedBuyers,
  getCachedStockMovements, getCachedRestockOrders,
  cacheItems, cacheCategories, cacheBuyers, cacheStockMovements, cacheRestockOrders
} from '../store/localDb'

export function registerStockDbIpc(): void {
  // ── Read Full Stock DB from Supabase (with offline fallback) ──────────────
  ipcMain.handle('stockDb:get', async (): Promise<IpcResult<StockDB & { itemRows: StockItemRow[] }>> => {
    try {
      if (!isOnline()) {
        return buildStockDbFromCache()
      }

      const sb = await getSupabase()

      // 1. Categories
      const { data: catData, error: catErr } = await sb
        .from('categories')
        .select('id, name, sort_order')
        .order('sort_order', { ascending: true })

      if (catErr) return { ok: false, error: catErr.message }

      const categories: StockCategory[] = (catData || []).map(c => ({
        id: c.id,
        name: c.name,
        sortOrder: c.sort_order ?? 0
      }))

      // 2. Buyers
      const { data: buyerData, error: buyerErr } = await sb
        .from('buyers')
        .select('id, name, is_own_shop')
        .order('name', { ascending: true })

      if (buyerErr) return { ok: false, error: buyerErr.message }

      const buyers: StockBuyer[] = (buyerData || []).map(b => ({
        id: b.id,
        name: b.name,
        isOwnShop: !!b.is_own_shop
      }))

      // 3. Items
      const { data: itemData, error: itemErr } = await sb
        .from('items')
        .select(`
          id, name, code, packing, dealer_price, srp,
          batch_note, batch_date, low_stock_threshold,
          created_at, updated_at,
          category_id,
          categories (
            id, name
          )
        `)
        .order('name', { ascending: true })

      if (itemErr) return { ok: false, error: itemErr.message }

      const items: StockItem[] = (itemData || []).map(i => {
        const catName = (i.categories as any)?.name || 'CONTAINERS'
        return {
          id: i.id,
          itemLabel: `${i.code || i.id.substring(0, 8)} · ${i.name}`,
          name: i.name,
          code: i.code || undefined,
          categoryId: i.category_id || catName,
          packing: i.packing || undefined,
          dealerPrice: Number(i.dealer_price) || 0,
          srp: Number(i.srp) || 0,
          batchNote: i.batch_note || undefined,
          batchDate: i.batch_date || undefined,
          lowStockThreshold: i.low_stock_threshold !== null ? Number(i.low_stock_threshold) : undefined,
          isArchived: false,
          createdAt: i.created_at,
          updatedAt: i.updated_at
        }
      })

      // 4. Movements (fetch all chunked if large)
      let allMovements: any[] = []
      let from = 0
      const pageSize = 1000
      while (true) {
        const { data: movChunk, error: movErr } = await sb
          .from('stock_movements')
          .select(`
            id, item_id, direction, quantity, buyer_id, date, source, source_id, note,
            buyers (
              name
            ),
            items (
              name, code
            )
          `)
          .order('date', { ascending: true })
          .range(from, from + pageSize - 1)

        if (movErr) return { ok: false, error: movErr.message }
        if (!movChunk || movChunk.length === 0) break
        allMovements = allMovements.concat(movChunk)
        if (movChunk.length < pageSize) break
        from += pageSize
      }

      const movements: StockMovement[] = allMovements.map(m => {
        const itm = m.items || {}
        const itmLabel = `${itm.code || m.item_id?.substring(0, 8) || ''} · ${itm.name || 'Item'}`
        return {
          id: m.id,
          itemId: m.item_id,
          itemLabel: itmLabel,
          direction: m.direction as 'in' | 'out',
          quantity: Number(m.quantity) || 0,
          buyerId: m.buyer_id || undefined,
          buyerName: m.buyers?.name || undefined,
          date: m.date,
          source: m.source as any,
          sourceId: m.source_id || undefined,
          note: m.note || undefined
        }
      })

      // 5. Restock Orders
      const { data: orderData, error: orderErr } = await sb
        .from('restock_orders')
        .select('id, so_number, order_date, received_date, amount, trucking_fee, note')
        .order('order_date', { ascending: false })

      if (orderErr) return { ok: false, error: orderErr.message }

      const restockOrders: RestockOrder[] = (orderData || []).map(o => {
        const amt = Number(o.amount) || 0
        const fee = o.trucking_fee ? Number(o.trucking_fee) : 0
        return {
          id: o.id,
          soNumber: o.so_number || undefined,
          orderDate: o.order_date,
          receivedDate: o.received_date || undefined,
          amount: amt,
          truckingFee: fee > 0 ? fee : undefined,
          orderTotal: amt + fee,
          note: o.note || undefined
        }
      })

      // 6. Compute derived StockItemRow[]
      const movementsByItem = new Map<string, { qtyIn: number; qtyOut: number }>()
      for (const m of movements) {
        if (!m.itemId) continue
        const entry = movementsByItem.get(m.itemId) || { qtyIn: 0, qtyOut: 0 }
        if (m.direction === 'in') entry.qtyIn += m.quantity
        else entry.qtyOut += m.quantity
        movementsByItem.set(m.itemId, entry)
      }

      const itemRows: StockItemRow[] = items.map(item => {
        const cat = categories.find(c => c.id === item.categoryId || c.name === item.categoryId)
        const catName = cat ? cat.name : 'CONTAINERS'

        const mov = movementsByItem.get(item.id) || { qtyIn: 0, qtyOut: 0 }
        const qtyOrdered = mov.qtyIn
        const qtyStockOut = mov.qtyOut
        const qtyBalance = qtyOrdered - qtyStockOut

        const status: 'in_stock' | 'low' | 'out' = (
          qtyBalance <= 0 ? 'out' :
          (item.lowStockThreshold !== undefined && qtyBalance <= item.lowStockThreshold) ? 'low' :
          'in_stock'
        )

        return {
          ...item,
          categoryName: catName,
          qtyOrdered,
          qtyStockOut,
          qtyBalance,
          totalCost: qtyOrdered * item.dealerPrice,
          salesAmount: qtyStockOut * item.srp,
          profitPerUnit: item.srp - item.dealerPrice,
          status
        }
      })

      // Also populate local cache immediately for offline resilience
      try {
        cacheCategories(categories.map(c => ({ id: c.id, name: c.name, sort_order: c.sortOrder })))
        cacheBuyers(buyers.map(b => ({ id: b.id, name: b.name, is_own_shop: b.isOwnShop ? 1 : 0 })))
        cacheItems(items.map(i => ({
          id: i.id,
          name: i.name,
          code: i.code || null,
          category_id: i.categoryId || null,
          category_name: i.categoryId || 'CONTAINERS',
          packing: i.packing || null,
          dealer_price: i.dealerPrice,
          srp: i.srp,
          batch_note: i.batchNote || null,
          batch_date: i.batchDate || null,
          low_stock_threshold: i.lowStockThreshold ?? null,
          created_at: i.createdAt || '',
          updated_at: i.updatedAt || ''
        })))
        cacheStockMovements(movements.map(m => ({
          id: m.id,
          item_id: m.itemId,
          item_name: null,
          item_code: null,
          direction: m.direction,
          quantity: m.quantity,
          buyer_id: m.buyerId || null,
          buyer_name: m.buyerName || null,
          date: m.date,
          source: m.source,
          source_id: m.sourceId || null,
          note: m.note || null
        })))
        cacheRestockOrders(restockOrders.map(o => ({
          id: o.id,
          so_number: o.soNumber || null,
          order_date: o.orderDate,
          received_date: o.receivedDate || null,
          amount: o.amount,
          trucking_fee: o.truckingFee || null,
          note: o.note || null
        })))
      } catch (cacheErr) {
        console.warn('[stockDb:get] Cache write warning:', cacheErr)
      }

      return {
        ok: true,
        data: {
          isLegacySingleSheet: false,
          categories,
          buyers,
          items,
          movements,
          restockOrders,
          itemRows
        }
      }
    } catch (e: unknown) {
      console.warn('[stockDb:get] Supabase error, falling back to local cache:', String(e))
      return buildStockDbFromCache()
    }
  })

  // ── Migrate Legacy (Supabase is already active) ───────────────────────────
  ipcMain.handle('stockDb:migrateLegacy', async (): Promise<IpcResult<{ success: boolean; message: string }>> => {
    return { ok: true, data: { success: true, message: 'Supabase cloud database is active and synced.' } }
  })

  // ── Add Item ─────────────────────────────────────────────────────────────
  ipcMain.handle('stockDb:addItem', async (_e, payload: Omit<StockItem, 'id' | 'createdAt' | 'isArchived' | 'itemLabel'>): Promise<IpcResult<StockItem>> => {
    try {
      // ── Offline: queue locally and return a temporary item ─────────────────
      if (!isOnline()) {
        const tempId = randomUUID()
        const now = new Date().toISOString()
        const categoryName = payload.categoryId || 'CONTAINERS'
        const cacheRow = {
          id: tempId,
          name: payload.name.trim(),
          code: payload.code ? payload.code.trim() : null,
          category_id: null,
          category_name: categoryName,
          packing: payload.packing ? payload.packing.trim() : null,
          dealer_price: payload.dealerPrice || 0,
          srp: payload.srp || 0,
          batch_note: payload.batchNote || null,
          batch_date: payload.batchDate || null,
          low_stock_threshold: payload.lowStockThreshold ?? null,
          created_at: now,
          updated_at: now
        }
        const db = getLocalDb()
        db.prepare(`
          INSERT OR REPLACE INTO items_cache
            (id, name, code, category_id, category_name, packing, dealer_price, srp, batch_note, batch_date, low_stock_threshold, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(tempId, cacheRow.name, cacheRow.code, cacheRow.category_id, cacheRow.category_name, cacheRow.packing,
               cacheRow.dealer_price, cacheRow.srp, cacheRow.batch_note, cacheRow.batch_date,
               cacheRow.low_stock_threshold, cacheRow.created_at, cacheRow.updated_at)

        // Queue for Supabase sync (without the temp id, Supabase generates its own)
        const { id: _id, category_id: _catId, category_name: _catName, ...syncPayload } = cacheRow
        enqueueWrite('items', 'insert', syncPayload)

        return {
          ok: true,
          data: {
            id: tempId,
            itemLabel: `${cacheRow.code || tempId.substring(0, 8)} · ${cacheRow.name}`,
            name: cacheRow.name,
            code: cacheRow.code || undefined,
            categoryId: categoryName,
            packing: cacheRow.packing || undefined,
            dealerPrice: cacheRow.dealer_price,
            srp: cacheRow.srp,
            batchNote: cacheRow.batch_note || undefined,
            batchDate: cacheRow.batch_date || undefined,
            lowStockThreshold: cacheRow.low_stock_threshold ?? undefined,
            isArchived: false,
            createdAt: now,
            updatedAt: now
          }
        }
      }

      // ── Online ─────────────────────────────────────────────────────────────
      const sb = await getSupabase()

      // Resolve category safely without UUID cast crash
      let categoryId: string | null = null
      if (payload.categoryId) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.categoryId)
        if (isUuid) {
          const { data: cat } = await sb.from('categories').select('id').eq('id', payload.categoryId).limit(1)
          if (cat && cat.length > 0) categoryId = cat[0].id
        } else {
          const { data: cat } = await sb.from('categories').select('id').ilike('name', payload.categoryId).limit(1)
          if (cat && cat.length > 0) categoryId = cat[0].id
        }
      }

      const { data, error } = await sb
        .from('items')
        .insert({
          name: payload.name.trim(),
          code: payload.code ? payload.code.trim() : null,
          category_id: categoryId,
          packing: payload.packing ? payload.packing.trim() : null,
          dealer_price: payload.dealerPrice || 0,
          srp: payload.srp || 0,
          batch_note: payload.batchNote || null,
          batch_date: payload.batchDate || null,
          low_stock_threshold: payload.lowStockThreshold || null
        })
        .select(`*, categories (id, name)`)
        .single()

      if (error) return { ok: false, error: error.message }

      // Also cache in local SQLite
      try {
        const db = getLocalDb()
        db.prepare(`
          INSERT OR REPLACE INTO items_cache
            (id, name, code, category_id, category_name, packing, dealer_price, srp, batch_note, batch_date, low_stock_threshold, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          data.id, data.name, data.code, data.category_id,
          (data.categories as any)?.name || 'CONTAINERS',
          data.packing, data.dealer_price, data.srp,
          data.batch_note, data.batch_date, data.low_stock_threshold,
          data.created_at, data.updated_at
        )
      } catch (cacheErr) {
        console.warn('[stockDb:addItem] Cache insert warn:', cacheErr)
      }

      const catName = (data.categories as any)?.name || 'CONTAINERS'
      const item: StockItem = {
        id: data.id,
        itemLabel: `${data.code || data.id.substring(0, 8)} · ${data.name}`,
        name: data.name,
        code: data.code || undefined,
        categoryId: data.category_id || catName,
        packing: data.packing || undefined,
        dealerPrice: Number(data.dealer_price) || 0,
        srp: Number(data.srp) || 0,
        batchNote: data.batch_note || undefined,
        batchDate: data.batch_date || undefined,
        lowStockThreshold: data.low_stock_threshold !== null ? Number(data.low_stock_threshold) : undefined,
        isArchived: false,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      }

      return { ok: true, data: item }
    } catch (e: unknown) {
      console.error('[stockDb:addItem] Error:', e)
      return { ok: false, error: String(e) }
    }
  })

  // ── Update Item ───────────────────────────────────────────────────────────
  ipcMain.handle('stockDb:updateItem', async (_e, id: string, patch: Partial<StockItem>): Promise<IpcResult<StockItem>> => {
    try {
      const sb = await getSupabase()

      const updateData: any = { updated_at: new Date().toISOString() }
      if (patch.name !== undefined) updateData.name = patch.name.trim()
      if (patch.code !== undefined) updateData.code = patch.code ? patch.code.trim() : null
      if (patch.packing !== undefined) updateData.packing = patch.packing ? patch.packing.trim() : null
      if (patch.dealerPrice !== undefined) updateData.dealer_price = patch.dealerPrice
      if (patch.srp !== undefined) updateData.srp = patch.srp
      if (patch.batchNote !== undefined) updateData.batch_note = patch.batchNote || null
      if (patch.batchDate !== undefined) updateData.batch_date = patch.batchDate || null
      if (patch.lowStockThreshold !== undefined) updateData.low_stock_threshold = patch.lowStockThreshold != null ? patch.lowStockThreshold : null

      if (patch.categoryId !== undefined) {
        let catId: string | null = null
        if (patch.categoryId) {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(patch.categoryId)
          if (isUuid) {
            const { data: cat } = await sb.from('categories').select('id').eq('id', patch.categoryId).limit(1)
            if (cat && cat.length > 0) catId = cat[0].id
          } else {
            const { data: cat } = await sb.from('categories').select('id').ilike('name', patch.categoryId).limit(1)
            if (cat && cat.length > 0) catId = cat[0].id
          }
        }
        updateData.category_id = catId
      }

      const { data, error } = await sb
        .from('items')
        .update(updateData)
        .eq('id', id)
        .select(`
          *,
          categories (
            id, name
          )
        `)
        .single()

      if (error) return { ok: false, error: error.message }

      // Update local SQLite cache
      try {
        const db = getLocalDb()
        db.prepare(`
          UPDATE items_cache SET
            name = COALESCE(?, name),
            code = ?,
            category_id = COALESCE(?, category_id),
            category_name = COALESCE(?, category_name),
            packing = ?,
            dealer_price = COALESCE(?, dealer_price),
            srp = COALESCE(?, srp),
            batch_note = ?,
            batch_date = ?,
            low_stock_threshold = ?,
            updated_at = ?
          WHERE id = ?
        `).run(
          data.name,
          data.code,
          data.category_id,
          (data.categories as any)?.name || 'CONTAINERS',
          data.packing,
          data.dealer_price,
          data.srp,
          data.batch_note,
          data.batch_date,
          data.low_stock_threshold,
          data.updated_at,
          data.id
        )
      } catch (cacheErr) {
        console.warn('[stockDb:updateItem] Cache update warn:', cacheErr)
      }

      const catName = (data.categories as any)?.name || 'CONTAINERS'
      const item: StockItem = {
        id: data.id,
        itemLabel: `${data.code || data.id.substring(0, 8)} · ${data.name}`,
        name: data.name,
        code: data.code || undefined,
        categoryId: data.category_id || catName,
        packing: data.packing || undefined,
        dealerPrice: Number(data.dealer_price) || 0,
        srp: Number(data.srp) || 0,
        batchNote: data.batch_note || undefined,
        batchDate: data.batch_date || undefined,
        lowStockThreshold: data.low_stock_threshold !== null ? Number(data.low_stock_threshold) : undefined,
        isArchived: false,
        createdAt: data.created_at,
        updatedAt: data.updated_at
      }

      return { ok: true, data: item }
    } catch (e: unknown) {
      console.error('[stockDb:updateItem] Error:', e)
      return { ok: false, error: String(e) }
    }
  })

  // ── Archive / Delete Item ─────────────────────────────────────────────────
  ipcMain.handle('stockDb:archiveItem', async (_e, id: string): Promise<IpcResult<void>> => {
    try {
      const sb = await getSupabase()
      const { error } = await sb.from('items').delete().eq('id', id)
      if (error) return { ok: false, error: error.message }
      try {
        const db = getLocalDb()
        db.prepare('DELETE FROM items_cache WHERE id = ?').run(id)
      } catch {}
      return { ok: true, data: undefined }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle('stockDb:deleteItem', async (_e, id: string): Promise<IpcResult<void>> => {
    try {
      const sb = await getSupabase()
      const { error } = await sb.from('items').delete().eq('id', id)
      if (error) return { ok: false, error: error.message }
      try {
        const db = getLocalDb()
        db.prepare('DELETE FROM items_cache WHERE id = ?').run(id)
      } catch {}
      return { ok: true, data: undefined }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })


  // ── Add Movement ──────────────────────────────────────────────────────────
  ipcMain.handle('stockDb:addMovement', async (_e, mov: Omit<StockMovement, 'id'>): Promise<IpcResult<StockMovement>> => {
    try {
      const sb = await getSupabase()

      let itemId = mov.itemId

      // If itemId is a name or code, resolve uuid
      if (itemId && !itemId.includes('-')) {
        const { data: itm } = await sb.from('items').select('id').or(`code.ilike."${itemId}",name.ilike."${itemId}"`).limit(1)
        if (itm && itm.length > 0) itemId = itm[0].id
      }

      // Resolve buyer
      let buyerId = mov.buyerId || null
      if (!buyerId && mov.buyerName) {
        const { data: b } = await sb.from('buyers').select('id').ilike('name', mov.buyerName).limit(1)
        if (b && b.length > 0) buyerId = b[0].id
      }

      const { data, error } = await sb
        .from('stock_movements')
        .insert({
          item_id: itemId,
          direction: mov.direction,
          quantity: mov.quantity,
          buyer_id: buyerId,
          date: mov.date || new Date().toISOString().substring(0, 10),
          source: mov.source || 'sales_entry',
          source_id: mov.sourceId || null,
          note: mov.note || null
        })
        .select('*')
        .single()

      if (error) return { ok: false, error: error.message }

      const result: StockMovement = {
        id: data.id,
        itemId: data.item_id,
        direction: data.direction as 'in' | 'out',
        quantity: Number(data.quantity) || 0,
        buyerId: data.buyer_id || undefined,
        buyerName: mov.buyerName || undefined,
        date: data.date,
        source: data.source as any,
        sourceId: data.source_id || undefined,
        note: data.note || undefined
      }

      return { ok: true, data: result }
    } catch (e: unknown) {
      console.error('[stockDb:addMovement] Error:', e)
      return { ok: false, error: String(e) }
    }
  })

  // ── Update Movement ───────────────────────────────────────────────────────
  ipcMain.handle('stockDb:updateMovement', async (_e, id: string, patch: Partial<StockMovement>): Promise<IpcResult<StockMovement>> => {
    try {
      const sb = await getSupabase()

      const updateData: any = {}
      if (patch.date !== undefined) updateData.date = patch.date
      if (patch.direction !== undefined) updateData.direction = patch.direction
      if (patch.quantity !== undefined) updateData.quantity = patch.quantity
      if (patch.source !== undefined) updateData.source = patch.source
      if (patch.note !== undefined) updateData.note = patch.note || null

      if (patch.buyerName !== undefined) {
        const { data: b } = await sb.from('buyers').select('id').ilike('name', patch.buyerName).limit(1)
        if (b && b.length > 0) updateData.buyer_id = b[0].id
      }

      const { data, error } = await sb
        .from('stock_movements')
        .update(updateData)
        .eq('id', id)
        .select('*')
        .single()

      if (error) return { ok: false, error: error.message }

      const result: StockMovement = {
        id: data.id,
        itemId: data.item_id,
        direction: data.direction as 'in' | 'out',
        quantity: Number(data.quantity) || 0,
        buyerId: data.buyer_id || undefined,
        date: data.date,
        source: data.source as any,
        note: data.note || undefined
      }

      return { ok: true, data: result }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  // ── Delete Movement ───────────────────────────────────────────────────────
  ipcMain.handle('stockDb:deleteMovement', async (_e, id: string): Promise<IpcResult<void>> => {
    try {
      const sb = await getSupabase()
      const { error } = await sb.from('stock_movements').delete().eq('id', id)
      if (error) return { ok: false, error: error.message }
      return { ok: true, data: undefined }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  // ── Add Buyer ─────────────────────────────────────────────────────────────
  ipcMain.handle('stockDb:addBuyer', async (_e, buyer: Omit<StockBuyer, 'id'>): Promise<IpcResult<StockBuyer>> => {
    try {
      const sb = await getSupabase()
      const { data, error } = await sb
        .from('buyers')
        .insert({
          name: buyer.name.trim(),
          is_own_shop: !!buyer.isOwnShop
        })
        .select('*')
        .single()

      if (error) return { ok: false, error: error.message }

      // Also cache in local SQLite
      try {
        const db = getLocalDb()
        db.prepare(`
          INSERT OR REPLACE INTO buyers_cache (id, name, is_own_shop, synced_at)
          VALUES (?, ?, ?, ?)
        `).run(data.id, data.name, data.is_own_shop ? 1 : 0, new Date().toISOString())
      } catch {}

      return {
        ok: true,
        data: {
          id: data.id,
          name: data.name,
          isOwnShop: !!data.is_own_shop
        }
      }
    } catch (e: unknown) {
      console.error('[stockDb:addBuyer] Error:', e)
      return { ok: false, error: String(e) }
    }
  })

  // ── Update Buyer ──────────────────────────────────────────────────────────
  ipcMain.handle('stockDb:updateBuyer', async (_e, id: string, patch: Partial<StockBuyer>): Promise<IpcResult<StockBuyer>> => {
    try {
      const sb = await getSupabase()

      const updateData: any = {}
      if (patch.name !== undefined) updateData.name = patch.name.trim()
      if (patch.isOwnShop !== undefined) updateData.is_own_shop = patch.isOwnShop

      const { data, error } = await sb
        .from('buyers')
        .update(updateData)
        .eq('id', id)
        .select('*')
        .single()

      if (error) return { ok: false, error: error.message }

      // Also update local SQLite cache
      try {
        const db = getLocalDb()
        db.prepare(`
          UPDATE buyers_cache SET
            name = COALESCE(?, name),
            is_own_shop = COALESCE(?, is_own_shop),
            synced_at = ?
          WHERE id = ?
        `).run(data.name, data.is_own_shop !== undefined ? (data.is_own_shop ? 1 : 0) : null, new Date().toISOString(), data.id)
      } catch {}

      return {
        ok: true,
        data: {
          id: data.id,
          name: data.name,
          isOwnShop: !!data.is_own_shop
        }
      }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  // ── Delete Buyer ──────────────────────────────────────────────────────────
  ipcMain.handle('stockDb:deleteBuyer', async (_e, idOrName: string): Promise<IpcResult<void>> => {
    try {
      const sb = await getSupabase()
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrName)

      // Find buyer record first
      let query = sb.from('buyers').select('id, name')
      if (isUuid) {
        query = query.eq('id', idOrName)
      } else {
        query = query.ilike('name', idOrName)
      }
      const { data: foundList } = await query
      const targetId = foundList && foundList.length > 0 ? foundList[0].id : (isUuid ? idOrName : null)
      const targetName = foundList && foundList.length > 0 ? foundList[0].name : idOrName

      if (targetId) {
        // Unlink any movements referencing this buyer so FK doesn't fail
        await sb.from('stock_movements').update({ buyer_id: null }).eq('buyer_id', targetId)
        const { error } = await sb.from('buyers').delete().eq('id', targetId)
        if (error) return { ok: false, error: error.message }
      } else {
        const { error } = await sb.from('buyers').delete().ilike('name', targetName)
        if (error) return { ok: false, error: error.message }
      }

      // Also clean up local SQLite cache
      try {
        const db = getLocalDb()
        if (targetId) {
          db.prepare('DELETE FROM buyers_cache WHERE id = ?').run(targetId)
        }
        db.prepare('DELETE FROM buyers_cache WHERE LOWER(name) = LOWER(?)').run(targetName)
      } catch {}

      return { ok: true, data: undefined }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })


  // ── Add Restock Order ─────────────────────────────────────────────────────
  ipcMain.handle('stockDb:addRestockOrder', async (_e, order: Omit<RestockOrder, 'id'>): Promise<IpcResult<RestockOrder>> => {
    try {
      const sb = await getSupabase()

      const amount = order.amount || 0
      const truckingFee = order.truckingFee || 0
      const orderTotal = order.orderTotal || (amount + truckingFee)

      const { data, error } = await sb
        .from('restock_orders')
        .insert({
          so_number: order.soNumber || null,
          order_date: order.orderDate || new Date().toISOString().substring(0, 10),
          received_date: order.receivedDate || null,
          amount,
          trucking_fee: truckingFee > 0 ? truckingFee : null,
          note: order.note || null
        })
        .select('*')
        .single()

      if (error) return { ok: false, error: error.message }

      return {
        ok: true,
        data: {
          id: data.id,
          soNumber: data.so_number || undefined,
          orderDate: data.order_date,
          receivedDate: data.received_date || undefined,
          amount: Number(data.amount) || 0,
          truckingFee: data.trucking_fee ? Number(data.trucking_fee) : undefined,
          orderTotal: orderTotal,
          note: data.note || undefined
        }
      }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  // ── Update Restock Order ──────────────────────────────────────────────────
  ipcMain.handle('stockDb:updateRestockOrder', async (_e, id: string, patch: Partial<RestockOrder>): Promise<IpcResult<RestockOrder>> => {
    try {
      const sb = await getSupabase()

      const updateData: any = {}
      if (patch.soNumber !== undefined) updateData.so_number = patch.soNumber || null
      if (patch.orderDate !== undefined) updateData.order_date = patch.orderDate
      if (patch.receivedDate !== undefined) updateData.received_date = patch.receivedDate || null
      if (patch.amount !== undefined) updateData.amount = patch.amount
      if (patch.truckingFee !== undefined) updateData.trucking_fee = patch.truckingFee || null
      if (patch.note !== undefined) updateData.note = patch.note || null

      const { data, error } = await sb
        .from('restock_orders')
        .update(updateData)
        .eq('id', id)
        .select('*')
        .single()

      if (error) return { ok: false, error: error.message }

      const amt = Number(data.amount) || 0
      const fee = data.trucking_fee ? Number(data.trucking_fee) : 0

      return {
        ok: true,
        data: {
          id: data.id,
          soNumber: data.so_number || undefined,
          orderDate: data.order_date,
          receivedDate: data.received_date || undefined,
          amount: amt,
          truckingFee: fee > 0 ? fee : undefined,
          orderTotal: amt + fee,
          note: data.note || undefined
        }
      }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  // ── Delete Restock Order ──────────────────────────────────────────────────
  ipcMain.handle('stockDb:deleteRestockOrder', async (_e, id: string): Promise<IpcResult<void>> => {
    try {
      const sb = await getSupabase()
      const { error } = await sb.from('restock_orders').delete().eq('id', id)
      if (error) return { ok: false, error: error.message }
      return { ok: true, data: undefined }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  // ── Categories ────────────────────────────────────────────────────────────
  ipcMain.handle('stockDb:addCategory', async (_e, name: string): Promise<IpcResult<StockCategory>> => {
    try {
      const sb = await getSupabase()
      const { data, error } = await sb
        .from('categories')
        .insert({ name: name.trim() })
        .select('*')
        .single()

      if (error) return { ok: false, error: error.message }

      return {
        ok: true,
        data: {
          id: data.id,
          name: data.name,
          sortOrder: data.sort_order ?? 0
        }
      }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle('stockDb:deleteCategory', async (_e, id: string): Promise<IpcResult<void>> => {
    try {
      const sb = await getSupabase()
      const { error } = await sb.from('categories').delete().eq('id', id)
      if (error) return { ok: false, error: error.message }
      return { ok: true, data: undefined }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  // ── File Picking / No-op File Ops ─────────────────────────────────────────
  ipcMain.handle('stockDb:pickExcelFile', async (): Promise<IpcResult<string | undefined>> => {
    try {
      const win = BrowserWindow.getFocusedWindow() || undefined
      const res = await dialog.showOpenDialog(win as any, {
        title: 'Select Excel File',
        filters: [{ name: 'Excel Spreadsheets (*.xlsx)', extensions: ['xlsx'] }],
        properties: ['openFile']
      })
      if (res.canceled || res.filePaths.length === 0) {
        return { ok: true, data: undefined }
      }
      return { ok: true, data: res.filePaths[0] }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle('stockDb:importExcel', async (): Promise<IpcResult<{ itemsImported: number }>> => {
    return { ok: true, data: { itemsImported: 0 } }
  })

  ipcMain.handle('stockDb:openFile', async (): Promise<IpcResult<void>> => {
    return { ok: true, data: undefined }
  })
}

// ── Build full StockDB from local SQLite cache ────────────────────────────────
function buildStockDbFromCache(): IpcResult<StockDB & { itemRows: StockItemRow[] }> {
  try {
    const rawCats = getCachedCategories()
    const rawBuyers = getCachedBuyers()
    const rawItems = getCachedItems()
    const rawMovements = getCachedStockMovements()
    const rawOrders = getCachedRestockOrders()

    const categories: StockCategory[] = rawCats.map(c => ({
      id: c.id as string,
      name: c.name as string,
      sortOrder: Number(c.sort_order) || 0
    }))

    const buyers: StockBuyer[] = rawBuyers.map(b => ({
      id: b.id as string,
      name: b.name as string,
      isOwnShop: Boolean(b.is_own_shop)
    }))

    const items: StockItem[] = rawItems.map(i => ({
      id: i.id as string,
      itemLabel: `${i.code || String(i.id).substring(0, 8)} · ${i.name}`,
      name: i.name as string,
      code: (i.code as string) || undefined,
      categoryId: (i.category_id as string) || (i.category_name as string) || 'CONTAINERS',
      packing: (i.packing as string) || undefined,
      dealerPrice: Number(i.dealer_price) || 0,
      srp: Number(i.srp) || 0,
      batchNote: (i.batch_note as StockItem['batchNote']) || undefined,
      batchDate: (i.batch_date as string) || undefined,
      lowStockThreshold: i.low_stock_threshold != null ? Number(i.low_stock_threshold) : undefined,
      isArchived: false,
      createdAt: (i.created_at as string) || undefined,
      updatedAt: (i.updated_at as string) || undefined
    }))

    const movements: StockMovement[] = rawMovements.map(m => ({
      id: m.id as string,
      itemId: m.item_id as string,
      itemLabel: `${m.item_code || String(m.item_id).substring(0, 8)} · ${m.item_name || 'Item'}`,
      direction: m.direction as 'in' | 'out',
      quantity: Number(m.quantity) || 0,
      buyerId: (m.buyer_id as string) || undefined,
      buyerName: (m.buyer_name as string) || undefined,
      date: m.date as string,
      source: m.source as any,
      sourceId: (m.source_id as string) || undefined,
      note: (m.note as string) || undefined
    }))

    const restockOrders: RestockOrder[] = rawOrders.map(o => {
      const amt = Number(o.amount) || 0
      const fee = o.trucking_fee ? Number(o.trucking_fee) : 0
      return {
        id: o.id as string,
        soNumber: (o.so_number as string) || undefined,
        orderDate: o.order_date as string,
        receivedDate: (o.received_date as string) || undefined,
        amount: amt,
        truckingFee: fee > 0 ? fee : undefined,
        orderTotal: amt + fee,
        note: (o.note as string) || undefined
      }
    })

    // Compute itemRows
    const movementsByItem = new Map<string, { qtyIn: number; qtyOut: number }>()
    for (const m of movements) {
      if (!m.itemId) continue
      const entry = movementsByItem.get(m.itemId) || { qtyIn: 0, qtyOut: 0 }
      if (m.direction === 'in') entry.qtyIn += m.quantity
      else entry.qtyOut += m.quantity
      movementsByItem.set(m.itemId, entry)
    }

    const itemRows: StockItemRow[] = items.map(item => {
      const cat = categories.find(c => c.id === item.categoryId || c.name === item.categoryId)
      const catName = cat ? cat.name : 'CONTAINERS'
      const mov = movementsByItem.get(item.id) || { qtyIn: 0, qtyOut: 0 }
      const qtyOrdered = mov.qtyIn
      const qtyStockOut = mov.qtyOut
      const qtyBalance = qtyOrdered - qtyStockOut
      const status: 'in_stock' | 'low' | 'out' = (
        qtyBalance <= 0 ? 'out' :
        (item.lowStockThreshold !== undefined && qtyBalance <= item.lowStockThreshold) ? 'low' :
        'in_stock'
      )
      return {
        ...item,
        categoryName: catName,
        qtyOrdered,
        qtyStockOut,
        qtyBalance,
        totalCost: qtyOrdered * item.dealerPrice,
        salesAmount: qtyStockOut * item.srp,
        profitPerUnit: item.srp - item.dealerPrice,
        status
      }
    })

    return {
      ok: true,
      data: {
        isLegacySingleSheet: false,
        categories,
        buyers,
        items,
        movements,
        restockOrders,
        itemRows
      }
    }
  } catch (e: unknown) {
    return { ok: false, error: 'Offline and local cache unavailable: ' + String(e) }
  }
}

