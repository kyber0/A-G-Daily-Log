import * as path from 'path'
import * as fs from 'fs'
import ExcelJS from 'exceljs'
import { supabase } from './supabaseClient'

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']

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

function sheetToDate(sheetName: string, year: number): string | null {
  const m = sheetName.match(/^([A-Z]+)(\d{1,2})$/i)
  if (!m) return null
  const mon = m[1].toUpperCase()
  const day = m[2].padStart(2, '0')
  const monthIdx = MONTHS.indexOf(mon)
  if (monthIdx === -1) return null
  return `${year}-${String(monthIdx + 1).padStart(2, '0')}-${day}`
}

export async function migrateDailyLog() {
  console.log('--- 3. Migrating Daily Logs ---')

  // 1. Preload / cache container types & water types
  const { data: dbContainers } = await supabase.from('refill_container_types').select('id, raw_name')
  const containerTypeMap = new Map<string, string>()
  if (dbContainers) {
    for (const c of dbContainers) containerTypeMap.set(c.raw_name.toUpperCase(), c.id)
  }

  const { data: dbWater } = await supabase.from('refill_water_types').select('id, name')
  const waterTypeMap = new Map<string, string>()
  if (dbWater) {
    for (const w of dbWater) waterTypeMap.set(w.name.toUpperCase(), w.id)
  }

  // Pre-seed known water types
  for (const wt of ['PURIFIED', 'ALKALINE', 'MINERAL']) {
    if (!waterTypeMap.has(wt)) {
      const { data: inserted } = await supabase
        .from('refill_water_types')
        .insert({ name: wt })
        .select('id, name')
        .single()
      if (inserted) waterTypeMap.set(wt, inserted.id)
    }
  }

  // Check already imported source files to support idempotency/fast resume
  const { data: importedFiles } = await supabase
    .from('refill_sales')
    .select('source_file')
    .limit(1000)

  const baseDir = path.join(__dirname, '../../plan/INFO')
  const logFolders = ['2022 LOG', '2023 LOG', '2024 LOG', '2025 LOG', '2026 LOG']

  let totalSalesInserted = 0
  let totalExpensesInserted = 0

  for (const folder of logFolders) {
    const folderDir = path.join(baseDir, folder)
    if (!fs.existsSync(folderDir)) continue

    const yearMatch = folder.match(/^(\d{4})/)
    const folderYear = yearMatch ? parseInt(yearMatch[1], 10) : 2026

    const files = fs.readdirSync(folderDir).filter(f => f.endsWith('.xlsx') && !f.startsWith('~$'))
    files.sort((a, b) => a.localeCompare(b))

    for (const file of files) {
      const filePath = path.join(folderDir, file)
      console.log(`Processing Daily Log: ${folder}/${file}`)

      // Determine year from filename or folder
      const yrMatch = file.match(/-(\d{4})\.xlsx$/i)
      const year = yrMatch ? parseInt(yrMatch[1], 10) : folderYear

      // Check if this file was already imported for this specific year
      const { data: fileCheck } = await supabase
        .from('refill_sales')
        .select('id')
        .gte('date', `${year}-01-01`)
        .lte('date', `${year}-12-31`)
        .eq('source_file', file)
        .limit(1)

      if (fileCheck && fileCheck.length > 0) {
        console.log(`  -> Already migrated (${year}/${file}), skipping.`)
        continue
      }

      const wb = new ExcelJS.Workbook()
      try {
        await wb.xlsx.readFile(filePath)
      } catch (err: any) {
        console.error(`Error reading ${file}:`, err.message)
        continue
      }

      const salesBatch: any[] = []
      const expensesBatch: any[] = []

      for (const ws of wb.worksheets) {
        const date = sheetToDate(ws.name, year)
        if (!date) continue

        // Parse Sales Rows (rows 2 to 31)
        for (let r = 2; r <= 31; r++) {
          const containerRaw = getString(ws.getCell(r, 2))
          if (!containerRaw) continue

          const sn = Math.round(getNumeric(ws.getCell(r, 1))) || (r - 1)
          const waterRaw = getString(ws.getCell(r, 3))
          const qty = getNumeric(ws.getCell(r, 4))
          const pickupVal = getNumeric(ws.getCell(r, 5))
          const deliverVal = getNumeric(ws.getCell(r, 6))

          if (qty === 0) continue

          const mode: 'pickup' | 'deliver' = deliverVal > 0 && pickupVal === 0 ? 'deliver' : 'pickup'
          const unitPrice = pickupVal > 0 ? pickupVal : (deliverVal > 0 ? deliverVal : 0)

          let totalVal = getNumeric(ws.getCell(r, 7))
          if (totalVal === 0 && unitPrice > 0 && qty > 0) {
            totalVal = unitPrice * qty
          }

          // Container type normalization / creation
          let containerTypeId = containerTypeMap.get(containerRaw.toUpperCase())
          if (!containerTypeId) {
            const { data: newContainer } = await supabase
              .from('refill_container_types')
              .insert({ raw_name: containerRaw })
              .select('id')
              .single()
            if (newContainer) {
              containerTypeId = newContainer.id
              containerTypeMap.set(containerRaw.toUpperCase(), newContainer.id)
            }
          }

          // Water type resolution
          let waterTypeId: string | null = null
          if (waterRaw) {
            waterTypeId = waterTypeMap.get(waterRaw.toUpperCase()) || null
            if (!waterTypeId && waterRaw.length > 0) {
              const { data: newWater } = await supabase
                .from('refill_water_types')
                .insert({ name: waterRaw.toUpperCase() })
                .select('id')
                .single()
              if (newWater) {
                waterTypeId = newWater.id
                waterTypeMap.set(waterRaw.toUpperCase(), newWater.id)
              }
            }
          }

          const rawUpper = containerRaw.toUpperCase()
          const likelyMiscategorized = (
            rawUpper.includes('CAP') ||
            rawUpper.includes('REPLACEMENT') ||
            rawUpper.includes('SEAL')
          )

          salesBatch.push({
            date,
            sn,
            container_type_id: containerTypeId || null,
            container_type_raw: containerRaw,
            water_type_id: waterTypeId,
            water_type_raw: waterRaw || null,
            quantity: qty,
            mode,
            unit_price: unitPrice > 0 ? unitPrice : null,
            total: totalVal,
            likely_miscategorized: likelyMiscategorized,
            source_file: file,
            source_sheet: ws.name
          })
        }

        // Parse Expenses Rows (cols Q=17, R=18, S=19, T=20)
        for (let r = 2; r <= 31; r++) {
          const desc = getString(ws.getCell(r, 18))
          const amount = getNumeric(ws.getCell(r, 19))
          const remarks = getString(ws.getCell(r, 20)) || null
          const sn = Math.round(getNumeric(ws.getCell(r, 17))) || (r - 1)

          if (amount > 0 || desc) {
            expensesBatch.push({
              date,
              sn,
              description: desc || null,
              total: amount,
              remarks,
              source_file: file,
              source_sheet: ws.name
            })
          }
        }
      }

      // Bulk insert sales in chunks of 500
      for (let i = 0; i < salesBatch.length; i += 500) {
        const chunk = salesBatch.slice(i, i + 500)
        const { error } = await supabase.from('refill_sales').insert(chunk)
        if (error) {
          console.error(`Error inserting sales chunk for ${file}:`, error.message)
        } else {
          totalSalesInserted += chunk.length
        }
      }

      // Bulk insert expenses in chunks of 500
      for (let i = 0; i < expensesBatch.length; i += 500) {
        const chunk = expensesBatch.slice(i, i + 500)
        const { error } = await supabase.from('daily_expenses').insert(chunk)
        if (error) {
          console.error(`Error inserting expenses chunk for ${file}:`, error.message)
        } else {
          totalExpensesInserted += chunk.length
        }
      }
    }
  }

  console.log(`✓ Daily Log Migration Completed (${totalSalesInserted} sales, ${totalExpensesInserted} expenses inserted).\n`)
}

if (require.main === module) {
  migrateDailyLog().catch(err => {
    console.error('Fatal error in Daily Log migration:', err)
    process.exit(1)
  })
}
