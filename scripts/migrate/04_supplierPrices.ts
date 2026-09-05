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

export async function migrateSupplierPrices() {
  console.log('--- 4. Migrating Supplier Price Lists ---')

  const baseDir = path.join(__dirname, '../../plan/INFO/INVENTORY STOCK REPORT')
  const files = ['SRP1.xlsx', 'SRP2.xlsx']

  // Preload items map for matching
  const { data: dbItems } = await supabase.from('items').select('id, name')
  const itemMap = new Map<string, string>()
  if (dbItems) {
    for (const itm of dbItems) itemMap.set(itm.name.toUpperCase().trim(), itm.id)
  }

  // Create or get supplier
  let supplierId: string | null = null
  const { data: existingSup } = await supabase
    .from('suppliers')
    .select('id')
    .eq('name', 'Jaime Bañaria')
    .maybeSingle()

  if (existingSup) {
    supplierId = existingSup.id
  } else {
    const { data: newSup } = await supabase
      .from('suppliers')
      .insert({
        name: 'Jaime Bañaria',
        contact: '(054) 871-1385 / 09213513360',
        address: 'Zone 3, Sagrada, Baao, Camarines Sur',
        source_file: 'SRP1.xlsx'
      })
      .select('id')
      .single()
    if (newSup) supplierId = newSup.id
  }

  let totalPricesInserted = 0

  for (const file of files) {
    const filePath = path.join(baseDir, file)
    if (!fs.existsSync(filePath)) continue

    console.log(`Processing Supplier Price List: ${file}`)
    const wb = new ExcelJS.Workbook()
    try {
      await wb.xlsx.readFile(filePath)
    } catch (err: any) {
      console.error(`Error reading ${file}:`, err.message)
      continue
    }

    for (const ws of wb.worksheets) {
      for (let r = 10; r <= ws.rowCount; r++) {
        // Table 1 (Left): Col 1 = Description, Col 2 = Packing, Col 3 = Price
        const desc1 = getString(ws.getCell(r, 1))
        const packing1 = getString(ws.getCell(r, 2))
        const price1 = getNumeric(ws.getCell(r, 3))

        // Ignore category header rows where Description == Packing == Price
        if (desc1 && price1 > 0 && desc1 !== packing1) {
          let matchedItemId = itemMap.get(desc1.toUpperCase())
          if (!matchedItemId) {
            for (const [name, id] of itemMap.entries()) {
              if (desc1.toUpperCase().includes(name) || name.includes(desc1.toUpperCase())) {
                matchedItemId = id
                break
              }
            }
          }

          const { data: existing } = await supabase
            .from('supplier_price_list')
            .select('id')
            .eq('source_file', `${file} (${ws.name})`)
            .eq('description', desc1)
            .maybeSingle()

          if (!existing) {
            await supabase.from('supplier_price_list').insert({
              supplier_id: supplierId,
              item_id: matchedItemId || null,
              description: desc1,
              packing: packing1 || null,
              price: price1,
              source_file: `${file} (${ws.name})`
            })
            totalPricesInserted++
          }
        }

        // Table 2 (Right): Col 5 = Description, Col 6 = Packing, Col 7 = Price
        const desc2 = getString(ws.getCell(r, 5))
        const packing2 = getString(ws.getCell(r, 6))
        const price2 = getNumeric(ws.getCell(r, 7))

        if (desc2 && price2 > 0 && desc2 !== packing2) {
          let matchedItemId = itemMap.get(desc2.toUpperCase())
          if (!matchedItemId) {
            for (const [name, id] of itemMap.entries()) {
              if (desc2.toUpperCase().includes(name) || name.includes(desc2.toUpperCase())) {
                matchedItemId = id
                break
              }
            }
          }

          const { data: existing } = await supabase
            .from('supplier_price_list')
            .select('id')
            .eq('source_file', `${file} (${ws.name})`)
            .eq('description', desc2)
            .maybeSingle()

          if (!existing) {
            await supabase.from('supplier_price_list').insert({
              supplier_id: supplierId,
              item_id: matchedItemId || null,
              description: desc2,
              packing: packing2 || null,
              price: price2,
              source_file: `${file} (${ws.name})`
            })
            totalPricesInserted++
          }
        }
      }
    }
  }

  console.log(`✓ Supplier Price List Migration Completed (${totalPricesInserted} entries inserted).\n`)
}

if (require.main === module) {
  migrateSupplierPrices().catch(err => {
    console.error('Fatal error in Supplier Price List migration:', err)
    process.exit(1)
  })
}
