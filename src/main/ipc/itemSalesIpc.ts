import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import type { IpcResult, ItemSale } from '../../shared/types'
import { getSupabase } from '../supabase/client'
import { isOnline } from '../store/syncEngine'
import { getCachedItemSalesByMonth, cacheItemSales, enqueueWrite, getCachedItems } from '../store/localDb'

export function registerItemSalesIpc(): void {
  ipcMain.handle('itemSales:save', async (_event, sale: ItemSale): Promise<IpcResult<void>> => {
    try {
      if (!isOnline()) {
        const cachedItems = getCachedItems()
        const matched = cachedItems.find((i: any) =>
          (sale.itemId && i.id === sale.itemId) ||
          (sale.item && (i.name as string).toLowerCase() === sale.item.toLowerCase()) ||
          (sale.itemCode && i.code && (i.code as string).toLowerCase() === sale.itemCode.toLowerCase())
        )
        const resolvedItemId = (matched?.id as string) || sale.itemId || randomUUID()
        const unitPrice = sale.price > 0 ? sale.price : Number(matched?.srp) || 0
        const saleId = randomUUID()
        const movementId = randomUUID()

        // 1. Cache to local SQLite immediately
        cacheItemSales([{
          id: saleId,
          item_id: resolvedItemId,
          item_name: (matched?.name as string) || sale.item || 'Unknown Item',
          item_code: (matched?.code as string) || sale.itemCode || null,
          item_srp: unitPrice,
          category_name: (matched?.category_name as string) || sale.category || null,
          quantity: sale.qty || 0,
          unit_price_at_sale: unitPrice,
          discount: sale.discount || 0,
          date: sale.date,
          remarks: sale.remarks || null,
          stock_movement_id: movementId,
          created_at: new Date().toISOString()
        }])

        // 2. Queue for background sync when back online
        enqueueWrite('stock_movements', 'insert', {
          id: movementId,
          item_id: resolvedItemId,
          direction: 'out',
          quantity: sale.qty || 0,
          buyer_id: sale.buyerId || null,
          date: sale.date,
          source: 'sales_entry',
          note: sale.remarks ? `Retail sale to ${sale.remarks}` : 'Retail counter sale'
        })
        enqueueWrite('item_sales', 'insert', {
          id: saleId,
          item_id: resolvedItemId,
          quantity: sale.qty || 0,
          unit_price_at_sale: unitPrice,
          discount: sale.discount || 0,
          date: sale.date,
          remarks: sale.remarks || null,
          stock_movement_id: movementId
        })

        return { ok: true, data: undefined }
      }

      const sb = await getSupabase()

      // 1. Resolve item ID
      const { itemId, unitPrice } = await resolveItemId(sb, sale, true)

      if (!itemId) {
        return { ok: false, error: `Product "${sale.item}" not found in catalog. Please select a valid product.` }
      }

      // Resolve buyer from the passed buyerId first, then match by remarks, then fall back to own-shop.
      let buyerId: string | null = null
      const OWN_SHOP_NAME = 'A&G (LW-BAAO)'

      if (sale.buyerId) {
        // Caller already resolved the buyer (e.g. user picked from dropdown)
        buyerId = sale.buyerId
      } else {
        const remarkTrimmed = sale.remarks && sale.remarks.trim() ? sale.remarks.trim() : ''
        if (remarkTrimmed) {
          // Try to match by name in buyers table
          const { data: buyerData } = await sb.from('buyers').select('id').ilike('name', remarkTrimmed).limit(1)
          if (buyerData && buyerData.length > 0) {
            buyerId = buyerData[0].id
          }
        }
        // If no buyer matched by remarks, check if it looks like own-shop (empty or contains 'A&G')
        if (!buyerId) {
          const isOwnShop = !remarkTrimmed || remarkTrimmed.toUpperCase().includes('A&G')
          if (isOwnShop) {
            const { data: ownData } = await sb.from('buyers').select('id').ilike('name', OWN_SHOP_NAME).limit(1)
            if (ownData && ownData.length > 0) {
              buyerId = ownData[0].id
            } else {
              const { data: newBuyer } = await sb.from('buyers').insert({ name: OWN_SHOP_NAME, is_own_shop: true }).select('id').single()
              if (newBuyer) buyerId = newBuyer.id
            }
          }
        }
      }

      // 2. Insert into stock_movements
      const { data: movement, error: movErr } = await sb
        .from('stock_movements')
        .insert({
          item_id: itemId,
          direction: 'out',
          quantity: sale.qty || 0,
          buyer_id: buyerId,
          date: sale.date,
          source: 'sales_entry',
          note: sale.remarks ? `Retail sale to ${sale.remarks}` : 'Retail counter sale'
        })
        .select('id')
        .single()

      if (movErr) {
        console.error('[itemSales:save] Movement insert error:', movErr)
      }

      // 3. Insert into item_sales
      const { error: saleErr } = await sb
        .from('item_sales')
        .insert({
          item_id: itemId,
          quantity: sale.qty || 0,
          unit_price_at_sale: unitPrice,
          discount: sale.discount || 0,
          date: sale.date,
          remarks: sale.remarks || null,
          stock_movement_id: movement?.id || null
        })

      if (saleErr) {
        return { ok: false, error: saleErr.message }
      }

      return { ok: true, data: undefined }
    } catch (e: unknown) {
      console.error('Failed to save item sale:', e)
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle('itemSales:loadMonth', async (_event, monthStr: string): Promise<IpcResult<ItemSale[]>> => {
    // monthStr: YYYY-MM
    try {
      if (!isOnline()) {
        return loadItemSalesFromCache(monthStr)
      }

      const sb = await getSupabase()

      const parts = monthStr.split('-')
      const year = parseInt(parts[0], 10)
      const month = parseInt(parts[1], 10)
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const lastDay = new Date(year, month, 0).getDate()
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

      const { data, error } = await sb
        .from('item_sales')
        .select(`
          id, quantity, unit_price_at_sale, discount, date, remarks, stock_movement_id, created_at,
          items (
            id, name, code, srp,
            categories (
              name
            )
          ),
          stock_movements (
            buyer_id,
            buyers (
              id,
              name
            )
          )
        `)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })
        .order('created_at', { ascending: true })

      if (error) {
        console.warn('[itemSales:loadMonth] Supabase error, falling back to cache:', error.message)
        return loadItemSalesFromCache(monthStr)
      }

      if (data && data.length > 0) {
        cacheItemSales(data.map((r: any) => ({
          id: r.id,
          item_id: r.items?.id || null,
          item_name: r.items?.name || null,
          item_code: r.items?.code || null,
          item_srp: Number(r.items?.srp) || 0,
          category_name: r.items?.categories?.name || null,
          quantity: r.quantity,
          unit_price_at_sale: r.unit_price_at_sale,
          discount: r.discount,
          date: r.date,
          remarks: r.remarks,
          stock_movement_id: r.stock_movement_id,
          created_at: r.created_at
        })))
      }

      const sales: ItemSale[] = (data || []).map((row: any, idx: number) => {
        const itemObj = row.items || {}
        const price = Number(row.unit_price_at_sale) || Number(itemObj.srp) || 0
        const qty = Number(row.quantity) || 0
        const discount = Number(row.discount) || 0
        const salesAmount = price * qty
        const salesTotal = salesAmount - discount
        const movObj = row.stock_movements || {}

        return {
          id: row.id,
          itemId: itemObj.id || undefined,
          item: itemObj.name || 'Unknown Item',
          category: itemObj.categories?.name || '',
          itemCode: itemObj.code || '',
          price,
          qty,
          salesAmount,
          discount,
          salesTotal,
          remarks: row.remarks || '',
          date: row.date,
          rowNum: idx + 8,
          buyerId: movObj.buyer_id || movObj.buyers?.id || undefined
        }
      })

      return { ok: true, data: sales }
    } catch (e: unknown) {
      console.error('Failed to load item sales:', e)
      // ── Offline fallback ────────────────────────────────────────────────
      return loadItemSalesFromCache(monthStr)
    }
  })

  ipcMain.handle('itemSales:delete', async (_event, monthStr: string, rowNumOrId: any): Promise<IpcResult<void>> => {
    try {
      const sb = await getSupabase()

      let saleId: string | null = null
      let movementId: string | null = null

      if (typeof rowNumOrId === 'string' && isNaN(Number(rowNumOrId))) {
        // Preferred: caller passed a Supabase UUID directly
        saleId = rowNumOrId
      } else {
        // Legacy / fallback: find by month-order index. This is fragile —
        // callers should be updated to pass the record UUID instead.
        console.warn('[itemSales:delete] Called with row index instead of UUID — prefer passing the record id.')
        const parts = monthStr.split('-')
        const year = parseInt(parts[0], 10)
        const month = parseInt(parts[1], 10)
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`
        const lastDay = new Date(year, month, 0).getDate()
        const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

        const { data } = await sb
          .from('item_sales')
          .select('id, stock_movement_id')
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: true })
          .order('created_at', { ascending: true })

        const index = typeof rowNumOrId === 'number' ? rowNumOrId - 8 : parseInt(rowNumOrId, 10) - 8
        if (data && data[index]) {
          saleId = data[index].id
          movementId = data[index].stock_movement_id
        }
      }

      if (saleId) {
        if (!movementId) {
          const { data } = await sb.from('item_sales').select('stock_movement_id').eq('id', saleId).single()
          movementId = data?.stock_movement_id || null
        }

        // Delete item_sale
        await sb.from('item_sales').delete().eq('id', saleId)

        // Delete stock_movement
        if (movementId) {
          await sb.from('stock_movements').delete().eq('id', movementId)
        }
      }

      return { ok: true, data: undefined }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle('itemSales:update', async (_event, monthStr: string, rowNumOrId: any, sale: ItemSale): Promise<IpcResult<void>> => {
    try {
      const sb = await getSupabase()

      let saleId: string | null = null
      let movementId: string | null = null

      if (typeof rowNumOrId === 'string' && isNaN(Number(rowNumOrId))) {
        // Preferred: caller passed a Supabase UUID directly
        saleId = rowNumOrId
      } else {
        // Legacy / fallback — prefer passing UUID.
        console.warn('[itemSales:update] Called with row index instead of UUID — prefer passing the record id.')
        const parts = monthStr.split('-')
        const year = parseInt(parts[0], 10)
        const month = parseInt(parts[1], 10)
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`
        const lastDay = new Date(year, month, 0).getDate()
        const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

        const { data } = await sb
          .from('item_sales')
          .select('id, stock_movement_id')
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: true })
          .order('created_at', { ascending: true })

        const index = typeof rowNumOrId === 'number' ? rowNumOrId - 8 : 0
        if (data && data[index]) {
          saleId = data[index].id
          movementId = data[index].stock_movement_id
        }
      }

      if (saleId) {
        // Resolve item ID
        const { itemId, unitPrice } = await resolveItemId(sb, sale, false)

        // Resolve buyer the same way as save
        let resolvedBuyerId: string | null = null
        const OWN_SHOP_NAME_UPD = 'A&G (LW-BAAO)'
        if (sale.buyerId) {
          resolvedBuyerId = sale.buyerId
        } else {
          const remarkTrimmed = sale.remarks && sale.remarks.trim() ? sale.remarks.trim() : ''
          if (remarkTrimmed) {
            const { data: bd } = await sb.from('buyers').select('id').ilike('name', remarkTrimmed).limit(1)
            if (bd && bd.length > 0) resolvedBuyerId = bd[0].id
          }
          if (!resolvedBuyerId) {
            const isOwnShop = !sale.remarks?.trim() || (sale.remarks.toUpperCase().includes('A&G'))
            if (isOwnShop) {
              const { data: od } = await sb.from('buyers').select('id').ilike('name', OWN_SHOP_NAME_UPD).limit(1)
              if (od && od.length > 0) resolvedBuyerId = od[0].id
            }
          }
        }

        // Update item_sales
        await sb
          .from('item_sales')
          .update({
            item_id: itemId,
            quantity: sale.qty || 0,
            unit_price_at_sale: unitPrice || sale.price || 0,
            discount: sale.discount || 0,
            date: sale.date,
            remarks: sale.remarks || null
          })
          .eq('id', saleId)

        // Update movement — including buyer_id
        if (movementId) {
          await sb
            .from('stock_movements')
            .update({
              item_id: itemId,
              quantity: sale.qty || 0,
              buyer_id: resolvedBuyerId,
              date: sale.date,
              note: sale.remarks ? `Retail sale to ${sale.remarks}` : 'Retail counter sale'
            })
            .eq('id', movementId)
        } else if (itemId) {
          const { data: newMov } = await sb
            .from('stock_movements')
            .insert({
              item_id: itemId,
              direction: 'out',
              quantity: sale.qty || 0,
              buyer_id: resolvedBuyerId,
              date: sale.date,
              source: 'sales_entry',
              note: sale.remarks ? `Retail sale to ${sale.remarks}` : 'Retail counter sale'
            })
            .select('id')
            .single()

          if (newMov?.id) {
            await sb.from('item_sales').update({ stock_movement_id: newMov.id }).eq('id', saleId)
          }
        }
      }

      return { ok: true, data: undefined }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })
}

// ── Cache helper ──────────────────────────────────────────────────────────────
function loadItemSalesFromCache(monthStr: string): import('../../shared/types').IpcResult<import('../../shared/types').ItemSale[]> {
  const parts = monthStr.split('-')
  const year = parseInt(parts[0], 10)
  const month = parseInt(parts[1], 10)
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const cached = getCachedItemSalesByMonth(startDate, endDate)
  const sales: import('../../shared/types').ItemSale[] = cached.map((row, idx) => {
    const price = Number(row.unit_price_at_sale) || Number(row.item_srp) || 0
    const qty = Number(row.quantity) || 0
    const discount = Number(row.discount) || 0
    const salesAmount = price * qty
    const salesTotal = salesAmount - discount
    return {
      id: row.id as string,
      itemId: (row.item_id as string) || undefined,
      item: (row.item_name as string) || 'Unknown Item',
      category: (row.category_name as string) || '',
      itemCode: (row.item_code as string) || '',
      price,
      qty,
      salesAmount,
      discount,
      salesTotal,
      remarks: (row.remarks as string) || '',
      date: row.date as string,
      rowNum: idx + 8
    }
  })
  return { ok: true, data: sales }
}

// ── Helper: Resolve item ID with multi-tier matching ────────────────────────
async function resolveItemId(
  sb: any,
  sale: ItemSale,
  autoCreate = false
): Promise<{ itemId: string | null; unitPrice: number; itemName: string }> {
  let itemId: string | null = null
  let unitPrice = sale.price || 0
  let itemName = (sale.item || '').trim()

  // 1. Exact UUID provided
  if (sale.itemId) {
    const { data: itm } = await sb.from('items').select('id, name, srp').eq('id', sale.itemId).maybeSingle()
    if (itm) {
      itemId = itm.id
      if (itm.name) itemName = itm.name
      if (!unitPrice && itm.srp) unitPrice = itm.srp
      return { itemId, unitPrice, itemName }
    }
  }

  // 2. Match by exact name (case-insensitive)
  if (itemName) {
    const { data: byName } = await sb.from('items').select('id, name, code, srp').ilike('name', itemName).limit(1)
    if (byName && byName.length > 0) {
      itemId = byName[0].id
      if (byName[0].name) itemName = byName[0].name
      if (!unitPrice && byName[0].srp) unitPrice = byName[0].srp
      return { itemId, unitPrice, itemName }
    }
  }

  // 3. Match by code if provided and not identical to itemName
  const code = sale.itemCode && sale.itemCode.trim()
  if (code && code.toLowerCase() !== itemName.toLowerCase()) {
    const { data: byCode } = await sb.from('items').select('id, name, code, srp').eq('code', code).limit(1)
    if (byCode && byCode.length > 0) {
      itemId = byCode[0].id
      if (byCode[0].name) itemName = byCode[0].name
      if (!unitPrice && byCode[0].srp) unitPrice = byCode[0].srp
      return { itemId, unitPrice, itemName }
    }
  }

  // 4. Fuzzy / partial match on name
  if (itemName) {
    const { data: byFuzzy } = await sb.from('items').select('id, name, code, srp').ilike('name', `%${itemName}%`).limit(1)
    if (byFuzzy && byFuzzy.length > 0) {
      itemId = byFuzzy[0].id
      if (byFuzzy[0].name) itemName = byFuzzy[0].name
      if (!unitPrice && byFuzzy[0].srp) unitPrice = byFuzzy[0].srp
      return { itemId, unitPrice, itemName }
    }
  }

  // 5. Auto-create if requested
  if (autoCreate && itemName) {
    const codeVal = code && code.toLowerCase() !== itemName.toLowerCase() ? code : null
    const { data: newItem, error: createErr } = await sb
      .from('items')
      .insert({
        name: itemName,
        code: codeVal,
        srp: unitPrice || null
      })
      .select('id, name, srp')
      .single()

    if (newItem) {
      itemId = newItem.id
      if (newItem.name) itemName = newItem.name
      if (!unitPrice && newItem.srp) unitPrice = newItem.srp
      console.log(`[itemSales] Auto-created new item in catalog: "${itemName}" (${itemId})`)
      return { itemId, unitPrice, itemName }
    } else {
      console.error('[itemSales] Failed to auto-create item in catalog:', createErr)
    }
  }

  return { itemId, unitPrice, itemName }
}

