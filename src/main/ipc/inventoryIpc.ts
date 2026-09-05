import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import type { IpcResult, InventoryItem, AddProductPayload } from '../../shared/types'
import { getSupabase } from '../supabase/client'
import { isOnline } from '../store/syncEngine'
import { getCachedItems, cacheItems, enqueueWrite } from '../store/localDb'

export function registerInventoryIpc(): void {
  ipcMain.handle('inventory:list', async (): Promise<IpcResult<InventoryItem[]>> => {
    try {
      if (!isOnline()) {
        return listInventoryFromCache()
      }

      const sb = await getSupabase()

      // Fetch all non-archived items with category
      const { data: items, error: itemsErr } = await sb
        .from('items')
        .select(`
          id,
          name,
          code,
          srp,
          categories (
            name
          )
        `)
        .order('name', { ascending: true })

      if (itemsErr) {
        console.warn('[inventory:list] Supabase error, falling back to cache:', itemsErr.message)
        return listInventoryFromCache()
      }

      // Update local cache
      if (items) {
        cacheItems(items.map((i: any) => ({
          id: i.id || randomUUID(),
          name: i.name,
          code: i.code || null,
          category_id: null,
          category_name: i.categories?.name || 'CONTAINERS',
          packing: null,
          dealer_price: 0,
          srp: Number(i.srp) || 0,
          batch_note: null,
          batch_date: null,
          low_stock_threshold: null,
          created_at: null,
          updated_at: null
        })))
      }

      const result: InventoryItem[] = (items || []).map((item: any) => ({
        id: item.id,
        description: item.name,
        category: item.categories?.name || 'CONTAINERS',
        itemCode: item.code || '',
        price: Number(item.srp) || 0
      }))

      return { ok: true, data: result }
    } catch (e: unknown) {
      console.error('Failed to list inventory:', e)
      return listInventoryFromCache()
    }
  })

  ipcMain.handle('inventory:save', async (_event, items: InventoryItem[]): Promise<IpcResult<void>> => {
    try {
      const sb = await getSupabase()

      // 1. Fetch all existing categories
      const { data: existingCats } = await sb.from('categories').select('id, name')
      const catMap = new Map<string, string>()
      for (const cat of existingCats || []) {
        catMap.set(cat.name.toUpperCase(), cat.id)
      }

      // Ensure all categories exist
      for (const item of items) {
        const catName = (item.category || 'CONTAINERS').trim()
        if (!catMap.has(catName.toUpperCase())) {
          const { data: newCat } = await sb
            .from('categories')
            .insert({ name: catName })
            .select('id, name')
            .single()
          if (newCat) {
            catMap.set(newCat.name.toUpperCase(), newCat.id)
          }
        }
      }

      // Upsert inventory items
      for (const item of items) {
        const catName = (item.category || 'CONTAINERS').trim()
        const catId = catMap.get(catName.toUpperCase()) || null

        // Check if item exists by name or code
        const { data: existing } = await sb
          .from('items')
          .select('id')
          .or(`name.ilike."${item.description.replace(/"/g, '')}"${item.itemCode ? `,code.ilike."${item.itemCode.replace(/"/g, '')}"` : ''}`)
          .limit(1)

        if (existing && existing.length > 0) {
          await sb
            .from('items')
            .update({
              category_id: catId,
              code: item.itemCode || null,
              srp: item.price || 0,
              updated_at: new Date().toISOString()
            })
            .eq('id', existing[0].id)
        } else {
          await sb
            .from('items')
            .insert({
              name: item.description.trim(),
              category_id: catId,
              code: item.itemCode || null,
              srp: item.price || 0
            })
        }
      }

      return { ok: true, data: undefined }
    } catch (e: unknown) {
      console.error('Failed to save inventory:', e)
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle('inventory:addProduct', async (_event, payload: AddProductPayload): Promise<IpcResult<void>> => {
    try {
      const sb = await getSupabase()

      // Resolve category
      const catName = (payload.category || 'CONTAINERS').trim()
      let categoryId: string | null = null

      const { data: cat } = await sb
        .from('categories')
        .select('id')
        .ilike('name', catName)
        .limit(1)

      if (cat && cat.length > 0) {
        categoryId = cat[0].id
      } else {
        const { data: newCat } = await sb
          .from('categories')
          .insert({ name: catName })
          .select('id')
          .single()
        if (newCat) categoryId = newCat.id
      }

      const { error } = await sb
        .from('items')
        .insert({
          name: payload.item.trim(),
          code: payload.code ? payload.code.trim() : null,
          category_id: categoryId,
          packing: payload.packing ? payload.packing.trim() : null,
          dealer_price: payload.dealerPrice || 0,
          srp: payload.srp || 0
        })

      if (error) {
        return { ok: false, error: error.message }
      }

      return { ok: true, data: undefined }
    } catch (e: unknown) {
      console.error('Failed to add product:', e)
      return { ok: false, error: String(e) }
    }
  })
}

// ── Cache helpers ─────────────────────────────────────────────────────────────

function listInventoryFromCache(): import('../../shared/types').IpcResult<import('../../shared/types').InventoryItem[]> {
  const cached = getCachedItems()
  const result: import('../../shared/types').InventoryItem[] = cached.map((i) => ({
    id: (i.id as string) || undefined,
    description: (i.name as string) || '',
    category: (i.category_name as string) || 'CONTAINERS',
    itemCode: (i.code as string) || '',
    price: Number(i.srp) || 0
  }))
  return { ok: true, data: result }
}

