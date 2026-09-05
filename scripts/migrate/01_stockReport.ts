import * as path from 'path'
import * as fs from 'fs'
import ExcelJS from 'exceljs'
import { supabase } from './supabaseClient'

function getNumeric(cell: ExcelJS.Cell | undefined): number {
  if (!cell || cell.value === null || cell.value === undefined) return 0
  const val = cell.value
  if (typeof val === 'number') return val
  if (typeof val === 'object') {
    if ('result' in val && val.result !== undefined) {
      if (typeof val.result === 'number') return val.result
      const parsed = Number(String(val.result).replace(/,/g, ''))
      if (!isNaN(parsed)) return parsed
    }
  }
  const n = Number(String(cell.text || '').trim().replace(/,/g, ''))
  return isNaN(n) ? 0 : n
}

function getString(cell: ExcelJS.Cell | undefined): string {
  if (!cell || cell.value === null || cell.value === undefined) return ''
  if (typeof cell.value === 'string') return cell.value.trim()
  if (typeof cell.value === 'object' && 'result' in cell.value && cell.value.result !== undefined) {
    return String(cell.value.result).trim()
  }
  return String(cell.text || '').trim()
}

function formatDate(val: any): string | null {
  if (!val) return null
  if (val instanceof Date) {
    return val.toISOString().substring(0, 10)
  }
  const str = String(val).trim()
  if (!str) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
  const d = new Date(str)
  if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10)
  return null
}

export async function migrateStockReport() {
  console.log('--- 1. Migrating Stock Report ---')

  const candidates = [
    path.join(__dirname, '../../plan/INFO/INVENTORY STOCK REPORT/STOCK_REPORT_refactored.xlsx'),
    path.join(__dirname, '../../resources/templates/STOCK_REPORT_refactored.xlsx'),
    path.join(__dirname, '../../STOCK REPORT.xlsx')
  ]

  let filePath = ''
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      filePath = c
      break
    }
  }

  if (!filePath) {
    throw new Error('Could not find STOCK_REPORT_refactored.xlsx')
  }

  console.log(`Reading Stock Report from: ${filePath}`)
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)

  const wsCategories = wb.getWorksheet('Categories')
  const wsBuyers = wb.getWorksheet('Buyers')
  const wsCatalog = wb.getWorksheet('Item Catalog')
  const wsMovements = wb.getWorksheet('Stock Movements')
  const wsOrders = wb.getWorksheet('Restock Orders')

  if (!wsCatalog || !wsMovements) {
    throw new Error('Required worksheets (Item Catalog, Stock Movements) missing in workbook')
  }

  // 1. Categories
  const categoryMap = new Map<string, string>() // name -> uuid
  if (wsCategories) {
    console.log('Migrating Categories...')
    for (let r = 3; r <= wsCategories.rowCount; r++) {
      const name = getString(wsCategories.getCell(r, 1))
      if (!name) continue

      const sortOrder = r - 2
      const { data: existing } = await supabase
        .from('categories')
        .select('id, name')
        .eq('name', name)
        .maybeSingle()

      if (existing) {
        categoryMap.set(name.toUpperCase(), existing.id)
      } else {
        const { data: inserted, error } = await supabase
          .from('categories')
          .insert({ name, sort_order: sortOrder })
          .select('id, name')
          .single()

        if (error) {
          console.error(`Error inserting category "${name}":`, error.message)
        } else if (inserted) {
          categoryMap.set(name.toUpperCase(), inserted.id)
        }
      }
    }
  }

  // 2. Buyers
  const buyerMap = new Map<string, string>() // name -> uuid
  if (wsBuyers) {
    console.log('Migrating Buyers...')
    for (let r = 3; r <= wsBuyers.rowCount; r++) {
      const name = getString(wsBuyers.getCell(r, 1))
      if (!name) continue

      const isOwnVal = wsBuyers.getCell(r, 2).value
      const isOwnShop = isOwnVal === true || String(isOwnVal).toLowerCase().includes('true') || name.includes('A&G')

      const { data: existing } = await supabase
        .from('buyers')
        .select('id, name')
        .eq('name', name)
        .maybeSingle()

      if (existing) {
        buyerMap.set(name.toUpperCase(), existing.id)
      } else {
        const { data: inserted, error } = await supabase
          .from('buyers')
          .insert({ name, is_own_shop: isOwnShop })
          .select('id, name')
          .single()

        if (error) {
          console.error(`Error inserting buyer "${name}":`, error.message)
        } else if (inserted) {
          buyerMap.set(name.toUpperCase(), inserted.id)
        }
      }
    }
  }

  // 3. Items
  console.log('Migrating Items Catalog...')
  const itemMap = new Map<string, string>() // clean name (upper) -> uuid
  const itemIdCodeMap = new Map<string, string>() // original xlsx id (e.g. ITM-001) -> uuid

  for (let r = 3; r <= wsCatalog.rowCount; r++) {
    const xlsxId = getString(wsCatalog.getCell(r, 1))
    const name = getString(wsCatalog.getCell(r, 3))
    if (!name) continue

    const code = getString(wsCatalog.getCell(r, 4)) || null
    const categoryName = getString(wsCatalog.getCell(r, 5)) || 'CONTAINERS'
    const categoryId = categoryMap.get(categoryName.toUpperCase()) || null
    const packing = getString(wsCatalog.getCell(r, 6)) || null

    const batchNoteRaw = getString(wsCatalog.getCell(r, 7)).toUpperCase()
    const batchNote = (batchNoteRaw === 'SOLD' || batchNoteRaw === 'NEW BATCH') ? batchNoteRaw : null
    const batchDate = formatDate(wsCatalog.getCell(r, 8).value)

    const dealerPrice = getNumeric(wsCatalog.getCell(r, 9)) || null
    const srp = getNumeric(wsCatalog.getCell(r, 10)) || null

    const threshCell = wsCatalog.getCell(r, 11).value
    const lowStockThreshold = (threshCell !== null && threshCell !== undefined && threshCell !== '')
      ? Math.round(getNumeric(wsCatalog.getCell(r, 11)))
      : null

    // Match by exact name + dealer_price + srp + batch_note
    let query = supabase.from('items').select('id, name').eq('name', name)
    if (dealerPrice !== null) query = query.eq('dealer_price', dealerPrice)
    if (srp !== null) query = query.eq('srp', srp)
    if (batchNote !== null) query = query.eq('batch_note', batchNote)
    else query = query.is('batch_note', null)

    const { data: existing } = await query.maybeSingle()

    let itemId = existing?.id
    if (!itemId) {
      const { data: inserted, error } = await supabase
        .from('items')
        .insert({
          name,
          code: code || xlsxId,
          category_id: categoryId,
          packing,
          dealer_price: dealerPrice,
          srp,
          batch_note: batchNote,
          batch_date: batchDate,
          low_stock_threshold: lowStockThreshold
        })
        .select('id')
        .single()

      if (error) {
        console.error(`Error inserting item "${name}":`, error.message)
      } else if (inserted) {
        itemId = inserted.id
      }
    }

    if (itemId) {
      if (xlsxId) {
        itemIdCodeMap.set(xlsxId.toUpperCase(), itemId)
      }
      const fullLabel = `${xlsxId} · ${name}`.toUpperCase()
      itemIdCodeMap.set(fullLabel, itemId)
      if (!itemMap.has(name.toUpperCase())) {
        itemMap.set(name.toUpperCase(), itemId)
      }
    }
  }

  console.log(`Loaded ${itemIdCodeMap.size} item mappings into catalog.`)

  // 4. Stock Movements (Delete old baseline stock movements first if re-running to avoid duplicates)
  console.log('Migrating Stock Movements (all 214 reference ledger entries)...')
  
  // Clear any previously imported reference movements to do a clean insert of all 214
  await supabase
    .from('stock_movements')
    .delete()
    .not('note', 'like', 'Sales Report import:%')

  const movementsToInsert: any[] = []

  for (let r = 3; r <= wsMovements.rowCount; r++) {
    const rawId = getString(wsMovements.getCell(r, 1)) || `MV-${String(r - 2).padStart(4, '0')}`
    const rawDate = wsMovements.getCell(r, 2).value
    const date = formatDate(rawDate) || '2023-01-01'
    const itemLabel = getString(wsMovements.getCell(r, 3))
    const dirStr = getString(wsMovements.getCell(r, 4)).toLowerCase()
    const qty = getNumeric(wsMovements.getCell(r, 5))
    const buyerName = getString(wsMovements.getCell(r, 6))
    const srcStr = getString(wsMovements.getCell(r, 7)).toLowerCase().replace(/[\s_-]+/g, '_')
    const reference = getString(wsMovements.getCell(r, 8))
    const note = getString(wsMovements.getCell(r, 9))

    if (!itemLabel && !rawId) continue
    if (qty === 0) continue

    // Resolve item_id by exact ITM-XXX prefix first
    let itemId: string | undefined
    const prefixMatch = itemLabel.match(/^([A-Z0-9_-]+)\s*·\s*(.+)$/i)
    if (prefixMatch) {
      const pId = prefixMatch[1].toUpperCase()
      itemId = itemIdCodeMap.get(pId)
    }
    if (!itemId) {
      itemId = itemIdCodeMap.get(itemLabel.toUpperCase()) || itemMap.get(itemLabel.toUpperCase())
    }

    if (!itemId) {
      console.warn(`[Row ${r}] Could not resolve item for movement "${itemLabel}" — skipping`)
      continue
    }

    const direction: 'in' | 'out' = dirStr.includes('in') ? 'in' : 'out'
    const buyerId = buyerName ? buyerMap.get(buyerName.toUpperCase()) || null : null

    const source: 'sales_entry' | 'wholesale_dispatch' | 'restock' | 'historical_import' = (
      srcStr.includes('sales') ? 'sales_entry' :
      srcStr.includes('wholesale') ? 'wholesale_dispatch' :
      srcStr.includes('restock') ? 'restock' : 'historical_import'
    )

    const fullNote = [rawId ? `[${rawId}]` : null, note, reference ? `Ref: ${reference}` : null].filter(Boolean).join(' | ') || null

    movementsToInsert.push({
      item_id: itemId,
      direction,
      quantity: qty,
      buyer_id: buyerId,
      date,
      source,
      note: fullNote
    })
  }

  // Insert in batches of 100
  for (let i = 0; i < movementsToInsert.length; i += 100) {
    const chunk = movementsToInsert.slice(i, i + 100)
    const { error } = await supabase.from('stock_movements').insert(chunk)
    if (error) {
      console.error('Error inserting stock movements chunk:', error.message)
    }
  }

  console.log(`Inserted ${movementsToInsert.length} stock movements.`)

  // 5. Restock Orders
  if (wsOrders) {
    console.log('Migrating Restock Orders...')
    let ordersCount = 0
    for (let r = 3; r <= wsOrders.rowCount; r++) {
      const soNum = getString(wsOrders.getCell(r, 1))
      const orderDate = formatDate(wsOrders.getCell(r, 2).value)
      const receivedDate = formatDate(wsOrders.getCell(r, 3).value)
      const amount = getNumeric(wsOrders.getCell(r, 4))
      const truckingFee = getNumeric(wsOrders.getCell(r, 5)) || null
      const note = getString(wsOrders.getCell(r, 7)) || null

      if (soNum.includes('TOTAL') || (!soNum && !orderDate && amount === 0)) {
        continue
      }

      const { data: existingOrder } = await supabase
        .from('restock_orders')
        .select('id')
        .eq('amount', amount)
        .eq('order_date', orderDate || '2023-01-01')
        .maybeSingle()

      if (!existingOrder) {
        const { error } = await supabase
          .from('restock_orders')
          .insert({
            so_number: soNum || null,
            order_date: orderDate || '2023-01-01',
            received_date: receivedDate,
            amount,
            trucking_fee: truckingFee,
            note
          })

        if (error) {
          console.error(`Error inserting restock order row ${r}:`, error.message)
        } else {
          ordersCount++
        }
      }
    }
    console.log(`Migrated Restock Orders complete.`)
  }

  console.log('✓ Stock Report Migration Completed.\n')
}

if (require.main === module) {
  migrateStockReport().catch(err => {
    console.error('Fatal error in Stock Report migration:', err)
    process.exit(1)
  })
}
