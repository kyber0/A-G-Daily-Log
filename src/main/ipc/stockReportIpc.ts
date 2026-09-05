import { ipcMain } from 'electron'
import type { IpcResult, LegacyStockItem } from '../../shared/types'
import { getSupabase } from '../supabase/client'

export function registerStockReportIpc(): void {
  ipcMain.handle('stock:list', async (): Promise<IpcResult<LegacyStockItem[]>> => {
    try {
      const sb = await getSupabase()

      // Fetch all items
      const { data: items, error: itemErr } = await sb
        .from('items')
        .select('id, name, code, packing, dealer_price, srp, low_stock_threshold')
        .order('name', { ascending: true })

      if (itemErr) return { ok: false, error: itemErr.message }

      // Fetch movements
      const { data: movements, error: movErr } = await sb
        .from('stock_movements')
        .select('item_id, direction, quantity')

      if (movErr) return { ok: false, error: movErr.message }

      const movMap = new Map<string, { inQty: number; outQty: number }>()
      for (const m of movements || []) {
        if (!m.item_id) continue
        const entry = movMap.get(m.item_id) || { inQty: 0, outQty: 0 }
        if (m.direction === 'in') entry.inQty += Number(m.quantity) || 0
        else entry.outQty += Number(m.quantity) || 0
        movMap.set(m.item_id, entry)
      }

      const result: LegacyStockItem[] = (items || []).map(item => {
        const mov = movMap.get(item.id) || { inQty: 0, outQty: 0 }
        const qtyOrdered = mov.inQty
        const qtyStockOut = mov.outQty
        const qtyBalance = qtyOrdered - qtyStockOut
        const dealerPrice = Number(item.dealer_price) || 0
        const srp = Number(item.srp) || 0

        const status = qtyBalance <= 0 ? 'Out of Stock' : (item.low_stock_threshold && qtyBalance <= item.low_stock_threshold) ? 'Low Stock' : 'In Stock'

        return {
          code: item.code || '',
          item: item.name,
          packing: item.packing || '',
          dealerPrice,
          qtyOrdered,
          totalAmount: qtyOrdered * dealerPrice,
          qtyStockOut,
          qtyBalance,
          srp,
          status
        }
      })

      return { ok: true, data: result }
    } catch (e: unknown) {
      console.error('Failed to list stock:', e)
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle('stock:addOrder', async (_event, item: string, qty: number, soNum: string): Promise<IpcResult<void>> => {
    try {
      const sb = await getSupabase()

      // Resolve item
      const { data: matched } = await sb
        .from('items')
        .select('id, name, code')
        .ilike('name', item.trim())
        .limit(1)

      const itm = matched && matched.length > 0 ? matched[0] : null
      if (!itm) {
        return { ok: false, error: 'Item not found in database' }
      }

      await sb
        .from('stock_movements')
        .insert({
          item_id: itm.id,
          direction: 'in',
          quantity: qty,
          source: 'restock',
          note: soNum ? `PO/SO: ${soNum}` : 'Restock order',
          date: new Date().toISOString().substring(0, 10)
        })

      return { ok: true, data: undefined }
    } catch (e: unknown) {
      console.error('Failed to add order:', e)
      return { ok: false, error: String(e) }
    }
  })
}
