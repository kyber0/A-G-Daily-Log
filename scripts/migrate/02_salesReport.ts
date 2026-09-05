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

function formatDate(val: any, fallbackYear?: number, fallbackMonth?: number): string {
  if (val instanceof Date && !isNaN(val.getTime())) {
    return val.toISOString().substring(0, 10)
  }
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
    return val
  }
  if (typeof val === 'string' && val.trim()) {
    const d = new Date(val.trim())
    if (!isNaN(d.getTime())) return d.toISOString().substring(0, 10)
  }
  if (fallbackYear && fallbackMonth) {
    return `${fallbackYear}-${String(fallbackMonth).padStart(2, '0')}-01`
  }
  return new Date().toISOString().substring(0, 10)
}

export async function migrateSalesReport() {
  console.log('--- 2. Migrating Sales Reports ---')

  // Load items map from DB
  const { data: dbItems, error: itemsErr } = await supabase.from('items').select('id, name, srp')
  if (itemsErr || !dbItems) {
    throw new Error('Failed to fetch items from Supabase: ' + itemsErr?.message)
  }
  const itemMap = new Map<string, { id: string; srp: number | null }>()
  for (const itm of dbItems) {
    itemMap.set(itm.name.toUpperCase().trim(), { id: itm.id, srp: itm.srp })
  }

  // Find own shop buyer
  const { data: ownBuyer } = await supabase
    .from('buyers')
    .select('id')
    .eq('is_own_shop', true)
    .maybeSingle()

  const ownShopBuyerId = ownBuyer?.id || null

  const baseDir = path.join(__dirname, '../../plan/INFO/INVENTORY STOCK REPORT')
  const years = ['2023', '2024', '2025', '2026']

  let totalSalesInserted = 0

  for (const yr of years) {
    const yrDir = path.join(baseDir, yr)
    if (!fs.existsSync(yrDir)) continue

    const files = fs.readdirSync(yrDir).filter(f => f.endsWith('.xlsx') && !f.startsWith('~$'))
    // Sort files by month number
    files.sort((a, b) => a.localeCompare(b))

    for (const file of files) {
      const filePath = path.join(yrDir, file)
      console.log(`Processing Sales Report: ${yr}/${file}`)

      const match = file.match(/^(\d{2})[-_]/)
      const monthNum = match ? parseInt(match[1], 10) : 1
      const yearNum = parseInt(yr, 10)

      const wb = new ExcelJS.Workbook()
      try {
        await wb.xlsx.readFile(filePath)
      } catch (err: any) {
        console.error(`Error opening ${file}:`, err.message)
        continue
      }

      const ws = wb.worksheets[0] // First worksheet is the sales sheet
      if (!ws) continue

      for (let r = 8; r <= ws.rowCount; r++) {
        const itemName = getString(ws.getCell(r, 2))
        if (!itemName) continue

        const price = getNumeric(ws.getCell(r, 5))
        const qty = getNumeric(ws.getCell(r, 6))
        const discount = getNumeric(ws.getCell(r, 8))
        const remarks = getString(ws.getCell(r, 11)) || null
        const rawDate = ws.getCell(r, 12).value
        const saleDate = formatDate(rawDate, yearNum, monthNum)

        if (qty === 0) continue

        // Match item
        let matchedItem = itemMap.get(itemName.toUpperCase())
        if (!matchedItem) {
          // Check substring or similar
          for (const [name, info] of itemMap.entries()) {
            if (name.includes(itemName.toUpperCase()) || itemName.toUpperCase().includes(name)) {
              matchedItem = info
              break
            }
          }
        }

        if (!matchedItem) {
          // Create new item in catalog
          const { data: newItem, error: newItmErr } = await supabase
            .from('items')
            .insert({
              name: itemName,
              srp: price > 0 ? price : null
            })
            .select('id, srp')
            .single()

          if (newItem) {
            matchedItem = { id: newItem.id, srp: newItem.srp }
            itemMap.set(itemName.toUpperCase(), matchedItem)
          } else {
            console.error(`Could not match or create item "${itemName}" at row ${r}:`, newItmErr?.message)
            continue
          }
        }

        const unitPrice = price > 0 ? price : (matchedItem.srp || 0)

        // Check if item_sales already exists
        const { data: existingSale } = await supabase
          .from('item_sales')
          .select('id')
          .eq('item_id', matchedItem.id)
          .eq('date', saleDate)
          .eq('quantity', qty)
          .eq('discount', discount)
          .maybeSingle()

        if (existingSale) continue

        // 1. Insert Stock Movement
        const { data: movement, error: movErr } = await supabase
          .from('stock_movements')
          .insert({
            item_id: matchedItem.id,
            direction: 'out',
            quantity: qty,
            buyer_id: ownShopBuyerId,
            date: saleDate,
            source: 'historical_import',
            note: `Sales Report import: ${file} (Row ${r})`
          })
          .select('id')
          .single()

        if (movErr) {
          console.error(`Error creating movement for sale row ${r}:`, movErr.message)
        }

        // 2. Insert Item Sale
        const { error: saleErr } = await supabase
          .from('item_sales')
          .insert({
            item_id: matchedItem.id,
            quantity: qty,
            unit_price_at_sale: unitPrice,
            discount: discount,
            date: saleDate,
            remarks: remarks,
            stock_movement_id: movement?.id || null
          })

        if (saleErr) {
          console.error(`Error inserting sale row ${r}:`, saleErr.message)
        } else {
          totalSalesInserted++
        }
      }
    }
  }

  console.log(`✓ Sales Report Migration Completed (${totalSalesInserted} sales inserted).\n`)
}

if (require.main === module) {
  migrateSalesReport().catch(err => {
    console.error('Fatal error in Sales Report migration:', err)
    process.exit(1)
  })
}
