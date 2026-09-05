import ExcelJS from 'exceljs'
import type { SaleRow, ExpenseEntry } from '../../shared/types'

export interface DailyLogSheetData {
  date: string
  entries: SaleRow[]
  expenses?: ExpenseEntry[]
}

export interface CatalogExportItem {
  id: string
  code?: string
  name: string
  category: string
  dealerPrice: number
  srp: number
  inQty: number
  outQty: number
}

/**
 * Builds a formatted Daily Log worksheet on the given workbook.
 */
export function buildDailyLogSheet(
  workbook: ExcelJS.Workbook,
  data: DailyLogSheetData
): ExcelJS.Worksheet {
  const parts = data.date.split('-')
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  const monthIdx = parseInt(parts[1] || '1', 10) - 1
  const sheetName = `${MONTHS[monthIdx] || 'DAY'}${parts[2] || '01'}`

  const sheet = workbook.addWorksheet(sheetName)

  // Title Banner
  sheet.mergeCells('A1:G1')
  sheet.getCell('A1').value = `A&G WATER REFILL STATION — DAILY LOG (${data.date})`
  sheet.getCell('A1').font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } }
  sheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }
  sheet.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }

  // Headers
  const headers = ['S/N', 'Container Type', 'Water Type', 'Qty', 'Mode', 'Unit Price', 'Line Total']
  sheet.getRow(2).values = headers
  sheet.getRow(2).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
  sheet.getRow(2).alignment = { vertical: 'middle', horizontal: 'center' }

  // Rows
  let rIdx = 3
  for (let i = 0; i < data.entries.length; i++) {
    const entry = data.entries[i]
    const row = sheet.getRow(rIdx)
    row.values = [
      entry.sn ?? (i + 1),
      entry.container,
      entry.water || '—',
      entry.qty,
      entry.mode,
      entry.price,
      { formula: `D${rIdx}*F${rIdx}`, result: entry.qty * entry.price } as any
    ]
    rIdx++
  }

  // Summary Row
  if (data.entries.length > 0) {
    const sumRow = sheet.getRow(rIdx)
    sumRow.getCell(1).value = 'TOTALS'
    sumRow.getCell(1).font = { bold: true }
    sumRow.getCell(4).value = { formula: `SUM(D3:D${rIdx - 1})` } as any
    sumRow.getCell(7).value = { formula: `SUM(G3:G${rIdx - 1})` } as any
    sumRow.font = { bold: true }
  }

  return sheet
}

/**
 * Builds an Inventory Item Catalog worksheet with stock movements on the given workbook.
 */
export function buildCatalogSheet(
  workbook: ExcelJS.Workbook,
  items: CatalogExportItem[]
): ExcelJS.Worksheet {
  const sheet = workbook.addWorksheet('Item Catalog')

  // Header row
  const headers = [
    'Item ID',
    'Item Code',
    'Item Name',
    'Category',
    'Dealer Price (₱)',
    'SRP (₱)',
    'Qty In',
    'Qty Out',
    'Balance',
    'Status',
    'Unit Profit (₱)'
  ]
  sheet.getRow(1).values = headers
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } }

  let rIdx = 2
  for (const item of items) {
    const bal = item.inQty - item.outQty
    const status = bal <= 0 ? 'Out of Stock' : 'In Stock'
    const profit = item.srp - item.dealerPrice

    const row = sheet.getRow(rIdx)
    row.values = [
      item.id,
      item.code || '',
      item.name,
      item.category,
      item.dealerPrice,
      item.srp,
      item.inQty,
      item.outQty,
      bal,
      status,
      profit
    ]
    rIdx++
  }

  return sheet
}
