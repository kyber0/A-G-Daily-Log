import * as fs from 'fs'
import ExcelJS from 'exceljs'
import type { SaleRow, SaleMode, ExpenseEntry } from '../../shared/types'
import { resolveTarget } from './saveEngine'

/** Extract numeric value from a cell, handling formula result objects */
function getNumericValue(cellValue: any): number {
  if (cellValue === null || cellValue === undefined) return 0
  if (typeof cellValue === 'object' && 'result' in cellValue) {
    return Number(cellValue.result) || 0
  }
  return Number(cellValue) || 0
}

/** Read an existing daily sheet back into SaleRow[] */
export async function loadDay(date: string, saveFolder: string): Promise<SaleRow[]> {
  const { filePath, sheetName } = resolveTarget(saveFolder, date)
  if (!fs.existsSync(filePath)) return []

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)

  const ws = wb.getWorksheet(sheetName)
  if (!ws) return []

  const rows: SaleRow[] = []
  for (let r = 2; r <= 31; r++) {
    const container = ws.getCell(r, 2).value
    if (!container) continue  // skip empty rows

    const sn        = getNumericValue(ws.getCell(r, 1).value) || (r - 1)
    const water     = String(ws.getCell(r, 3).value ?? '')
    const qty       = getNumericValue(ws.getCell(r, 4).value)
    const pickupVal = getNumericValue(ws.getCell(r, 5).value)
    const deliverVal= getNumericValue(ws.getCell(r, 6).value)

    let mode: SaleMode = 'PICKUP'
    let price = 0

    if (pickupVal > 0) {
      mode  = 'PICKUP'
      price = pickupVal
    } else if (deliverVal > 0) {
      mode  = 'DELIVER'
      price = deliverVal
    }

    if (qty === 0) continue  // skip rows that have a name but no quantity

    rows.push({ sn, container: String(container), water, qty, mode, price })
  }

  return rows
}

/** Read expenses (cols Q=17, R=18, S=19, T=20) from a daily sheet */
export async function loadExpenses(date: string, saveFolder: string): Promise<ExpenseEntry[]> {
  const { filePath, sheetName } = resolveTarget(saveFolder, date)
  if (!fs.existsSync(filePath)) return []

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)

  const ws = wb.getWorksheet(sheetName)
  if (!ws) return []

  const expenses: ExpenseEntry[] = []
  for (let r = 2; r <= 31; r++) {
    const desc    = String(ws.getCell(r, 18).value || '').trim()
    const amount  = getNumericValue(ws.getCell(r, 19).value)
    const remarks = String(ws.getCell(r, 20).value || '').trim()
    if (amount > 0 || desc) {
      expenses.push({ desc, amount, remarks })
    }
  }

  return expenses
}
