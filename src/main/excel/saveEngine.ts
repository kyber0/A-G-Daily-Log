import * as fs from 'fs'
import * as path from 'path'
import ExcelJS from 'exceljs'
import type { SaleRow, AppConfig, DayTarget, ExpenseEntry } from '../../shared/types'
import { createDailySheet } from './templateBuilder'

// Month abbreviations matching the naming convention
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']

/** Resolve the monthly file path and sheet name from a date string (YYYY-MM-DD) */
export function resolveTarget(saveFolder: string, date: string): DayTarget {
  const d = new Date(date + 'T00:00:00')
  const monthIndex = d.getMonth()
  const mon  = MONTHS[monthIndex]
  const year = d.getFullYear()
  const day  = String(d.getDate()).padStart(2, '0')
  const monthNumStr = String(monthIndex + 1).padStart(2, '0')
  const fileName = `${monthNumStr}. DAILY LOG (${mon})-${year}.xlsx`
  const yearFolder = path.join(saveFolder, `${year} LOG`)
  return {
    filePath: path.join(yearFolder, fileName),
    sheetName: `${mon}${day}`,
  }
}

/** Check if file is locked (open in Excel) */
async function isFileLocked(filePath: string): Promise<boolean> {
  if (!fs.existsSync(filePath)) return false
  return new Promise(resolve => {
    fs.open(filePath, 'r+', (err, fd) => {
      if (err) {
        // EBUSY or EPERM = locked
        resolve(true)
      } else {
        fs.close(fd, () => resolve(false))
      }
    })
  })
}

/** Sort worksheets in chronological order by extracting the day number */
function sortWorksheets(wb: ExcelJS.Workbook): void {
  const sheets = wb.worksheets
  sheets.sort((a, b) => {
    // Sheet names are like "AUG01", "AUG15" - sort by the digits
    const dayA = parseInt(a.name.replace(/\D/g, ''), 10) || 0
    const dayB = parseInt(b.name.replace(/\D/g, ''), 10) || 0
    return dayA - dayB
  })
  
  sheets.forEach((ws, idx) => {
    (ws as any).orderNo = idx + 1
  })
}

/** Full-replace save: clear rows 2–31 cols A–G, write sale rows, leave row 32+ untouched */
export async function saveDay(
  date: string,
  rows: SaleRow[],
  config: AppConfig,
  expenses: ExpenseEntry[] = []
): Promise<DayTarget> {
  const target = resolveTarget(config.saveFolder, date)
  const { filePath, sheetName } = target

  // ── File lock check ────────────────────────────────────────────────────────
  if (await isFileLocked(filePath)) {
    throw new Error('FILE_LOCKED')
  }

  // ── Load or create workbook ────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook()
  
  if (!fs.existsSync(filePath)) {
    const { app } = require('electron')
    const templatePath = path.join(app.getAppPath(), 'resources', 'templates', 'DAILY LOG.xlsx')
    
    if (fs.existsSync(templatePath)) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.copyFileSync(templatePath, filePath)
      
      // Rename template sheets (JAN01 -> AUG01) for the current month
      await wb.xlsx.readFile(filePath)
      
      const targetDate = new Date(date + 'T00:00:00')
      const mIdx = targetDate.getMonth()
      const mon = MONTHS[mIdx]
      const year = targetDate.getFullYear()
      const daysInMonth = new Date(year, mIdx + 1, 0).getDate()
      
      const sheetsToRemove: ExcelJS.Worksheet[] = []
      
      wb.worksheets.forEach(ws => {
        const match = ws.name.match(/^[A-Z]{3}(\d{2})$/)
        if (match) {
          const dayNum = parseInt(match[1], 10)
          if (dayNum > daysInMonth) {
            sheetsToRemove.push(ws)
          } else {
            ws.name = `${mon}${match[1]}`
            // Dynamically set tab color based on the actual calendar
            const currentDayDate = new Date(year, mIdx, dayNum)
            const isSunday = currentDayDate.getDay() === 0
            
            if (isSunday) {
              ws.properties.tabColor = { argb: 'FFFF0000' } // Red for Sunday
            } else {
              delete (ws.properties as any).tabColor // Default for weekdays
            }
          }
        }
      })
      
      sheetsToRemove.forEach(ws => wb.removeWorksheet(ws.id))
      await wb.xlsx.writeFile(filePath)
    }
  }

  // Load the workbook (either pre-existing or just created from template)
  if (fs.existsSync(filePath)) {
    await wb.xlsx.readFile(filePath)
  }

  // ── Get or create sheet ────────────────────────────────────────────────────
  let ws = wb.getWorksheet(sheetName)
  if (!ws) {
    // Fallback if the sheet somehow doesn't exist in the template
    ws = createDailySheet(wb, sheetName, config, date)
  }

  // ── Clear rows 2–31, cols A–G and Q–T ────────────────────────────────────
  for (let r = 2; r <= 31; r++) {
    for (let c = 1; c <= 7; c++) {
      const cell = ws.getCell(r, c)
      cell.value = null
      // Reset G formula so empty rows don't show stale values
      if (c === 7) cell.value = { formula: `F${r}*D${r}`, result: 0 } as any
    }
    // Clear expense columns Q(17), R(18), S(19), T(20)
    for (let c = 17; c <= 20; c++) {
      ws.getCell(r, c).value = null
    }
  }

  // ── Write sale rows ───────────────────────────────────────────────────────
  rows.forEach((row, idx) => {
    const r = idx + 2  // rows start at 2
    const sn = idx + 1

    // Col A: sequential integer SN
    ws!.getCell(r, 1).value = sn

    // Col B: Container Type
    ws!.getCell(r, 2).value = row.container

    // Col C: Water Type (blank for bottle types)
    ws!.getCell(r, 3).value = row.water || null

    // Col D: Quantity
    ws!.getCell(r, 4).value = row.qty

    if (row.mode === 'PICKUP') {
      // Col E: Price; Col G: =E{r}*D{r}
      ws!.getCell(r, 5).value = row.price
      ws!.getCell(r, 6).value = null
      ws!.getCell(r, 7).value = { formula: `E${r}*D${r}`, result: row.price * row.qty } as any
    } else {
      // Col F: Price; Col G: =F{r}*D{r}
      ws!.getCell(r, 5).value = null
      ws!.getCell(r, 6).value = row.price
      ws!.getCell(r, 7).value = { formula: `F${r}*D${r}`, result: row.price * row.qty } as any
    }

    ws!.getRow(r).commit()
  })

  // ── Write expense rows (cols Q=17, R=18, S=19, T=20) ─────────────────────
  expenses.forEach((exp, idx) => {
    const r = idx + 2  // rows start at 2
    ws!.getCell(r, 17).value = idx + 1      // SN
    ws!.getCell(r, 18).value = exp.desc || null
    ws!.getCell(r, 19).value = exp.amount || null
    ws!.getCell(r, 20).value = exp.remarks || null
    ws!.getRow(r).commit()
  })

  // ── Save ──────────────────────────────────────────────────────────────────
  sortWorksheets(wb)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  await wb.xlsx.writeFile(filePath)

  return target
}

/** Mark a day's sheet tab as red (closed day) and write the reason to a note cell */
export async function markDayClosed(
  date: string,
  reason: string,
  config: AppConfig
): Promise<DayTarget> {
  const target = resolveTarget(config.saveFolder, date)
  const { filePath, sheetName } = target

  if (await isFileLocked(filePath)) throw new Error('FILE_LOCKED')

  const wb = new ExcelJS.Workbook()
  if (fs.existsSync(filePath)) {
    await wb.xlsx.readFile(filePath)
  }

  let ws = wb.getWorksheet(sheetName)
  if (!ws) {
    ws = createDailySheet(wb, sheetName, config, date)
  }

  // Set tab to red
  ws.properties = { ...ws.properties, tabColor: { argb: 'FFFF0000' } }

  // Write reason into row 1, col H (column 8) as a note — outside the data range
  ws.getCell(1, 8).value = `CLOSED: ${reason}`

  sortWorksheets(wb)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  await wb.xlsx.writeFile(filePath)

  return target
}

/** Read whether a day's sheet tab is red (closed) and the stored reason */
export async function getDayStatus(
  date: string,
  config: AppConfig
): Promise<{ isClosed: boolean; reason: string }> {
  const { filePath, sheetName } = resolveTarget(config.saveFolder, date)

  if (!fs.existsSync(filePath)) return { isClosed: false, reason: '' }

  const wb = new ExcelJS.Workbook()
  try { await wb.xlsx.readFile(filePath) } catch { return { isClosed: false, reason: '' } }

  const ws = wb.getWorksheet(sheetName)
  if (!ws) return { isClosed: false, reason: '' }

  const tabColor = (ws.properties as { tabColor?: { argb?: string } })?.tabColor
  const isClosed = !!(tabColor?.argb && tabColor.argb.toUpperCase().endsWith('FF0000'))
  const noteCell = ws.getCell(1, 8).value
  const reason = typeof noteCell === 'string' ? noteCell.replace(/^CLOSED:\s*/i, '') : ''

  return { isClosed, reason }
}

/** Remove the red tab and reason to reopen a day */
export async function unmarkDayClosed(
  date: string,
  config: AppConfig
): Promise<DayTarget> {
  const target = resolveTarget(config.saveFolder, date)
  const { filePath, sheetName } = target

  if (!fs.existsSync(filePath)) {
    // If the file doesn't exist, it wasn't closed in the first place
    return target
  }
  if (await isFileLocked(filePath)) throw new Error('FILE_LOCKED')

  const wb = new ExcelJS.Workbook()
  await wb.xlsx.readFile(filePath)

  const ws = wb.getWorksheet(sheetName)
  if (ws) {
    // Remove tab color
    if (ws.properties && ws.properties.tabColor) {
      delete (ws.properties as any).tabColor
    }
    // Clear reason cell
    ws.getCell(1, 8).value = null
  }

  await wb.xlsx.writeFile(filePath)

  return target
}
