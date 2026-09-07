import ExcelJS from 'exceljs'
import { getSupabase } from '../supabase/client'
import { readConfig } from '../store/config'
import { isOnline } from '../store/syncEngine'
import { getLocalDb } from '../store/localDb'

/**
 * Builds the template-accurate Daily Log workbook for a specific year and month.
 * Matches exact DAILY LOG.xlsx template layout with 31 day sheets and summary formulas.
 */
export async function buildDailyLogWorkbook(
  year: number,
  monthNum: number,
  cfg?: ReturnType<typeof readConfig>
): Promise<{ wb: ExcelJS.Workbook; hasData: boolean }> {
  const currentCfg = cfg || readConfig()
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  const mon = MONTHS[monthNum - 1] || 'JAN'
  const daysInMonth = new Date(year, monthNum, 0).getDate() || 31
  const monthPadded = String(monthNum).padStart(2, '0')

  const startDate = `${year}-${monthPadded}-01`
  const endDate = `${year}-${monthPadded}-${String(daysInMonth).padStart(2, '0')}`

  let sales: any[] = []
  let expenses: any[] = []

  if (!isOnline()) {
    const db = getLocalDb()
    sales = db.prepare('SELECT date, sn, container_type_raw, water_type_raw, quantity, mode, unit_price FROM refill_sales_cache WHERE date >= ? AND date <= ? ORDER BY date ASC, sn ASC').all(startDate, endDate)
    expenses = db.prepare('SELECT date, sn, description, total, remarks FROM daily_expenses_cache WHERE date >= ? AND date <= ? ORDER BY date ASC, sn ASC').all(startDate, endDate)
  } else {
    const sb = await getSupabase()
    const { data: sData } = await sb
      .from('refill_sales')
      .select('date, sn, container_type_raw, water_type_raw, quantity, mode, unit_price')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
      .order('sn', { ascending: true })
    sales = sData || []

    const { data: eData } = await sb
      .from('daily_expenses')
      .select('date, sn, description, total, remarks')
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true })
      .order('sn', { ascending: true })
    expenses = eData || []
  }

  // Group by date string
  const salesByDate = new Map<string, typeof sales>()
  const expByDate = new Map<string, typeof expenses>()
  for (const s of sales || []) {
    const d = s.date
    if (!salesByDate.has(d)) salesByDate.set(d, [])
    salesByDate.get(d)!.push(s)
  }
  for (const e of expenses || []) {
    const d = e.date
    if (!expByDate.has(d)) expByDate.set(d, [])
    expByDate.get(d)!.push(e)
  }

  // Price reference for the reference table (cols J–P)
  const priceRef: Record<string, { pickup: number; deliver: number }> = {}
  for (const p of currentCfg.priceTable) {
    if (p.water) {
      const key = `${p.container.toUpperCase()}|${p.water.toUpperCase()}`
      priceRef[key] = { pickup: p.pickup, deliver: p.deliver }
    }
  }

  const getPrice = (container: string, water: string, mode: string): number => {
    const key = `${container.toUpperCase()}|${water.toUpperCase()}`
    const ref = priceRef[key]
    if (!ref) return 0
    return mode === 'deliver' ? ref.deliver : ref.pickup
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'A&G Water Refill App'
  wb.created = new Date()

  // ── Shared palette ────────────────────────────────────────────────────────
  const C = {
    navyDark:   'FF1F4E79',  // deep navy – sales header
    blue:       'FF2E75B6',  // royal blue – sub-headers
    blueLight:  'FFDCE6F1',  // pale blue – even rows (sales)
    expDark:    'FF4B3869',  // purple – expense header
    expLight:   'FFEDE7F6',  // pale purple – even rows (expenses)
    refDark:    'FF375623',  // dark green – price ref header
    refLight:   'FFE2EFDA',  // pale green – price ref rows
    totBg:      'FF1F4E79',  // totals row bg
    monthBg:    'FF7B3F00',  // monthly totals – dark amber
    gold:       'FFFFD966',  // gold for totals highlights
    white:      'FFFFFFFF',
    dark:       'FF1E293B',
    muted:      'FF64748B',
    red:        'FFCC0000',
    green:      'FF006600',
    border:     'FFAAAAAA',
    borderDark: 'FF1F4E79',
  }

  const fill = (argb: string): ExcelJS.Fill =>
    ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

  const borders = (color = C.border, style: ExcelJS.BorderStyle = 'thin'): Partial<ExcelJS.Borders> => ({
    top: { style, color: { argb: color } },
    bottom: { style, color: { argb: color } },
    left: { style, color: { argb: color } },
    right: { style, color: { argb: color } },
  })

  const MONTHS_FULL = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER']
  const monFull = MONTHS_FULL[monthNum - 1] || 'JANUARY'

  const sheetNames: string[] = []

  for (let day = 1; day <= daysInMonth; day++) {
    const dayPad = String(day).padStart(2, '0')
    const dateStr = `${year}-${monthPadded}-${dayPad}`
    const sheetName = `${mon}${dayPad}`
    sheetNames.push(sheetName)

    const daySales   = salesByDate.get(dateStr)   || []
    const dayExpenses = expByDate.get(dateStr)    || []

    const dObj = new Date(year, monthNum - 1, day)
    const isSunday  = dObj.getDay() === 0
    const hasSales  = daySales.length > 0
    const isClosed  = isSunday || !hasSales

    const ws = wb.addWorksheet(sheetName, {
      properties: {
        tabColor: isSunday
          ? { argb: 'FFEF4444' }  // red — Sunday / closed
          : hasSales
            ? { argb: 'FF22C55E' }  // green — has data
            : { argb: 'FF94A3B8' }  // grey — no data
      },
      pageSetup: {
        orientation: 'landscape',
        fitToPage: true, fitToWidth: 1, fitToHeight: 0,
        margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.25, footer: 0.25 }
      }
    })

    ws.views = [{ state: 'frozen', ySplit: 2 }]

    ws.columns = [
      { width: 5 },   // A - SN
      { width: 20 },  // B - CONTAINER TYPE
      { width: 14 },  // C - WATER TYPE
      { width: 10 },  // D - QUANTITY
      { width: 14 },  // E - PRICE (PICK UP)
      { width: 14 },  // F - PRICE (DELIVER)
      { width: 14 },  // G - TOTAL
      { width: 2 },   // H - spacer
      { width: 16 },  // I - price ref container
      { width: 12 },  // J - ALKALINE
      { width: 12 },  // K - DELIVERED
      { width: 12 },  // L - PURIFIED
      { width: 12 },  // M - DELIVERED
      { width: 12 },  // N - MINERAL
      { width: 12 },  // O - DELIVERED
      { width: 2 },   // P - spacer
      { width: 5 },   // Q - SN (expenses)
      { width: 26 },  // R - DESCRIPTION
      { width: 14 },  // S - TOTAL (expenses)
      { width: 22 },  // T - REMARKS
    ]

    // ── Row 1 — Section title banner ─────────────────────────────────────────
    const DAYS_OF_WEEK = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday']
    const dayName = DAYS_OF_WEEK[dObj.getDay()]
    const titleRow = ws.getRow(1)
    titleRow.height = 24

    // Sales section banner (A1:G1)
    ws.mergeCells('A1:G1')
    const salesTitle = titleRow.getCell(1)
    salesTitle.value = `A&G WATER REFILL  ·  ${dayName}, ${monFull} ${dayPad}, ${year}`
    salesTitle.font  = { bold: true, size: 11, color: { argb: C.white }, name: 'Calibri' }
    salesTitle.fill  = fill(C.navyDark)
    salesTitle.alignment = { horizontal: 'center', vertical: 'middle' }
    salesTitle.border = borders(C.navyDark, 'medium')

    // Spacer (H1) — just color
    ws.getCell('H1').fill = fill('FFF1F5F9')

    // Price reference banner (I1:O1)
    ws.mergeCells('I1:O1')
    const refTitle = titleRow.getCell(9)
    refTitle.value = 'PRICE REFERENCE'
    refTitle.font  = { bold: true, size: 10, color: { argb: C.white }, name: 'Calibri' }
    refTitle.fill  = fill(C.refDark)
    refTitle.alignment = { horizontal: 'center', vertical: 'middle' }
    refTitle.border = borders(C.refDark, 'medium')

    // Spacer (P1)
    ws.getCell('P1').fill = fill('FFF1F5F9')

    // Expense section banner (Q1:T1)
    ws.mergeCells('Q1:T1')
    const expTitle = titleRow.getCell(17)
    expTitle.value = `DAILY EXPENSES  ·  ${dateStr}`
    expTitle.font  = { bold: true, size: 10, color: { argb: C.white }, name: 'Calibri' }
    expTitle.fill  = fill(C.expDark)
    expTitle.alignment = { horizontal: 'center', vertical: 'middle' }
    expTitle.border = borders(C.expDark, 'medium')

    // ── Row 2 — Column headers ────────────────────────────────────────────────
    const hRow = ws.getRow(2)
    hRow.height = 22

    const setH = (col: number, val: string, bgArgb = C.navyDark, textArgb = C.white) => {
      const cell = hRow.getCell(col)
      cell.value     = val
      cell.font      = { bold: true, size: 9, color: { argb: textArgb }, name: 'Calibri' }
      cell.fill      = fill(bgArgb)
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
      cell.border    = borders(bgArgb, 'medium')
    }

    // Sales headers (cols 1-7)
    setH(1, 'SN');             setH(2, 'CONTAINER TYPE')
    setH(3, 'WATER TYPE');     setH(4, 'QTY')
    setH(5, 'PICK UP\n(₱)');  setH(6, 'DELIVER\n(₱)')
    setH(7, 'TOTAL\n(₱)')

    // Price reference headers (cols 9-15)
    setH(9,  'TYPE',      C.refDark); setH(10, 'ALKALINE\nPICKUP',  C.refDark)
    setH(11, 'ALKALINE\nDELIVER', C.refDark)
    setH(12, 'PURIFIED\nPICKUP',  C.refDark); setH(13, 'PURIFIED\nDELIVER', C.refDark)
    setH(14, 'MINERAL\nPICKUP',   C.refDark); setH(15, 'MINERAL\nDELIVER',  C.refDark)

    // Expense headers (cols 17-20)
    setH(17, 'SN',          C.expDark); setH(18, 'DESCRIPTION', C.expDark)
    setH(19, 'AMOUNT\n(₱)', C.expDark); setH(20, 'REMARKS',     C.expDark)

    // Spacer cells
    ws.getCell(2, 8).fill  = fill('FFF1F5F9')
    ws.getCell(2, 16).fill = fill('FFF1F5F9')

    // ── Data rows (3–32, i.e. 30 rows) ──────────────────────────────────────
    for (let i = 0; i < 30; i++) {
      const rowNum = i + 3       // data starts at row 3 (header is now rows 1+2)
      const sale   = daySales[i]
      const exp    = dayExpenses[i]
      const row    = ws.getRow(rowNum)
      row.height   = 16

      const isEvenRow   = i % 2 === 1
      const salesBg     = isEvenRow ? C.blueLight : C.white
      const expBg       = isEvenRow ? C.expLight  : C.white
      const refBg       = isEvenRow ? C.refLight  : C.white

      // ── Sales section (A–G) ──────────────────────────────────────────────
      // SN counter
      if (i === 0) {
        row.getCell(1).value = 1
      } else {
        row.getCell(1).value = { formula: `A${rowNum - 1}+1`, result: i + 1 } as any
      }

      for (let c = 1; c <= 7; c++) {
        const cell = row.getCell(c)
        cell.fill   = fill(salesBg)
        cell.border = borders(C.border)
        cell.font   = { size: 10, name: 'Calibri' }
      }
      row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' }
      row.getCell(1).font = { size: 9, color: { argb: C.muted }, name: 'Calibri' }

      if (sale) {
        const unitPrice = Number(sale.unit_price) || getPrice(sale.container_type_raw, sale.water_type_raw || '', sale.mode)
        const isDeliver = sale.mode === 'deliver'

        row.getCell(2).value = sale.container_type_raw || ''
        row.getCell(2).alignment = { horizontal: 'left', vertical: 'middle' }
        row.getCell(3).value = sale.water_type_raw || ''
        row.getCell(3).alignment = { horizontal: 'center', vertical: 'middle' }
        row.getCell(4).value = Number(sale.quantity) || 0
        row.getCell(4).numFmt = '#,##0'
        row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' }

        if (isDeliver) {
          row.getCell(5).value = 0
          row.getCell(6).value = unitPrice
          row.getCell(7).value = { formula: `F${rowNum}*D${rowNum}` } as any
        } else {
          row.getCell(5).value = unitPrice
          row.getCell(6).value = 0
          row.getCell(7).value = { formula: `E${rowNum}*D${rowNum}` } as any
        }

        row.getCell(5).numFmt = '#,##0.00'
        row.getCell(6).numFmt = '#,##0.00'
        row.getCell(7).numFmt = '#,##0.00'
        row.getCell(7).font = { bold: true, size: 10, color: { argb: C.dark }, name: 'Calibri' }
        row.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' }
        row.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' }
        row.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' }
      } else {
        row.getCell(7).value = { formula: `E${rowNum}*D${rowNum}` } as any
        row.getCell(7).numFmt = '#,##0.00'
      }

      // ── Price reference section (I–O) ────────────────────────────────────
      for (let c = 9; c <= 15; c++) {
        const cell = row.getCell(c)
        cell.fill      = fill(refBg)
        cell.border    = borders(C.border)
        cell.font      = { size: 9, name: 'Calibri' }
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
      }

      if (i === 0) {
        row.getCell(9).value = 'ROUND'; row.getCell(9).font = { bold: true, size: 9 }
        const p = priceRef['ROUND|ALKALINE']; const p2 = priceRef['ROUND|PURIFIED']; const p3 = priceRef['ROUND|MINERAL']
        row.getCell(10).value = p?.pickup ?? 40;  row.getCell(11).value = p?.deliver ?? 45
        row.getCell(12).value = p2?.pickup ?? 30; row.getCell(13).value = p2?.deliver ?? 35
        row.getCell(14).value = p3?.pickup ?? 25; row.getCell(15).value = p3?.deliver ?? 30
      } else if (i === 1) {
        row.getCell(9).value = 'SLIM'; row.getCell(9).font = { bold: true, size: 9 }
        const p = priceRef['SLIM|ALKALINE']; const p2 = priceRef['SLIM|PURIFIED']; const p3 = priceRef['SLIM|MINERAL']
        row.getCell(10).value = p?.pickup ?? 40;  row.getCell(11).value = p?.deliver ?? 45
        row.getCell(12).value = p2?.pickup ?? 30; row.getCell(13).value = p2?.deliver ?? 35
        row.getCell(14).value = p3?.pickup ?? 25; row.getCell(15).value = p3?.deliver ?? 30
      } else if (i === 4) {
        row.getCell(10).value = 'PER BOTTLE'; row.getCell(11).value = 'WHOLESALE'
      } else if (i === 5) {
        row.getCell(9).value = '350ml'
        const p = priceRef['350ML|PURIFIED'] || priceRef['350ML|ALKALINE']
        row.getCell(10).value = p?.pickup ?? 10; row.getCell(11).value = p?.deliver ?? 8
        row.getCell(12).value = '50 BOTTLE'
      } else if (i === 6) {
        row.getCell(9).value = '500ml'
        const p = priceRef['500ML|PURIFIED'] || priceRef['500ML|ALKALINE']
        row.getCell(10).value = p?.pickup ?? 12; row.getCell(11).value = p?.deliver ?? 9
        row.getCell(12).value = 'MINIMUM'
      }

      // Numeric format on price ref values
      for (const c of [10,11,12,13,14,15]) {
        if (typeof row.getCell(c).value === 'number') row.getCell(c).numFmt = '#,##0.00'
      }

      // ── Expenses section (Q–T) ───────────────────────────────────────────
      if (i === 0) {
        row.getCell(17).value = 1
      } else {
        row.getCell(17).value = { formula: `Q${rowNum - 1}+1`, result: i + 1 } as any
      }

      for (let c = 17; c <= 20; c++) {
        const cell = row.getCell(c)
        cell.fill   = fill(expBg)
        cell.border = borders(C.border)
        cell.font   = { size: 10, name: 'Calibri' }
      }
      row.getCell(17).alignment = { horizontal: 'center', vertical: 'middle' }
      row.getCell(17).font = { size: 9, color: { argb: C.muted }, name: 'Calibri' }

      if (exp) {
        row.getCell(18).value = exp.description || ''
        row.getCell(18).alignment = { horizontal: 'left', vertical: 'middle' }
        row.getCell(19).value = Number(exp.total) || 0
        row.getCell(19).numFmt = '#,##0.00'
        row.getCell(19).alignment = { horizontal: 'right', vertical: 'middle' }
        row.getCell(19).font = { bold: true, size: 10, name: 'Calibri' }
        row.getCell(20).value = exp.remarks || ''
        row.getCell(20).alignment = { horizontal: 'left', vertical: 'middle' }
        row.getCell(20).font = { italic: true, size: 9, color: { argb: C.muted }, name: 'Calibri' }
      }

      // Spacer columns
      ws.getCell(rowNum, 8).fill  = fill('FFF1F5F9')
      ws.getCell(rowNum, 16).fill = fill('FFF1F5F9')
    }

    // ── Totals row (row 33 — after 30 data rows starting at row 3) ──────────
    const totRowNum = 33
    const totRow = ws.getRow(totRowNum)
    totRow.height = 24

    // Fill all columns navy
    for (let c = 1; c <= 20; c++) {
      const cell = totRow.getCell(c)
      cell.fill   = fill(C.totBg)
      cell.border = borders(C.navyDark, 'medium')
      cell.font   = { bold: true, size: 10, color: { argb: C.white }, name: 'Calibri' }
    }

    // Qty total
    totRow.getCell(4).value = { formula: 'SUM(D3:D32)' } as any
    totRow.getCell(4).numFmt = '#,##0'
    totRow.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' }

    // Sales total label + value
    totRow.getCell(6).value = 'TOTAL SALES TODAY'
    totRow.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' }
    totRow.getCell(7).value = { formula: 'SUM(G3:G32)' } as any
    totRow.getCell(7).numFmt = '#,##0.00'
    totRow.getCell(7).font = { bold: true, size: 11, color: { argb: C.gold }, name: 'Calibri' }
    totRow.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' }

    // Net sales label + value
    totRow.getCell(11).value = 'NET SALES TODAY'
    totRow.getCell(11).alignment = { horizontal: 'right', vertical: 'middle' }
    totRow.getCell(12).value = { formula: `G${totRowNum}-S${totRowNum}` } as any
    totRow.getCell(12).numFmt = '#,##0.00'
    totRow.getCell(12).font = { bold: true, size: 11, color: { argb: 'FF86EFAC' }, name: 'Calibri' }
    totRow.getCell(12).alignment = { horizontal: 'right', vertical: 'middle' }

    // Expenses total label + value
    totRow.getCell(18).value = 'TOTAL EXPENSES'
    totRow.getCell(18).alignment = { horizontal: 'right', vertical: 'middle' }
    totRow.getCell(19).value = { formula: 'SUM(S3:S32)' } as any
    totRow.getCell(19).numFmt = '#,##0.00'
    totRow.getCell(19).font = { bold: true, size: 11, color: { argb: 'FFFCA5A5' }, name: 'Calibri' }
    totRow.getCell(19).alignment = { horizontal: 'right', vertical: 'middle' }

    // ── Water & container type lookup rows ───────────────────────────────────
    const waterTypes = currentCfg.waterTypes.length > 0 ? currentCfg.waterTypes : ['ALKALINE', 'PURIFIED', 'MINERAL']
    const containerTypes = currentCfg.containerTypes.map(ct => ct.name)
    waterTypes.forEach((wt, idx)    => { ws.getRow(49 + idx).getCell(2).value = wt })
    containerTypes.forEach((ct, idx) => { ws.getRow(54 + idx).getCell(2).value = ct })

    // ── Print header / footer ────────────────────────────────────────────────
    ws.headerFooter.oddHeader = `&L&"Calibri,Bold"&11A&G WATER REFILLING STATION&R&"Calibri,Regular"&9${dayName}, ${monFull} ${dayPad}, ${year}`
    ws.headerFooter.oddFooter = `&CPage &P of &N`
  }

  // ── Monthly totals on the last day's sheet ────────────────────────────────
  const lastSheet = wb.getWorksheet(sheetNames[sheetNames.length - 1])!
  const totalSalesFormula = sheetNames.map(sn => `'${sn}'!G33`).join('+')
  const totalExpFormula   = sheetNames.map(sn => `'${sn}'!S33`).join('+')

  const mTotRowNum = 35
  const mTotRow = lastSheet.getRow(mTotRowNum)
  mTotRow.height = 26

  for (let c = 1; c <= 20; c++) {
    const cell = mTotRow.getCell(c)
    cell.fill   = fill(C.monthBg)
    cell.border = borders(C.monthBg, 'medium')
    cell.font   = { bold: true, size: 10, color: { argb: C.white }, name: 'Calibri' }
  }

  mTotRow.getCell(6).value = `TOTAL SALES  ·  ${monFull} ${year}`
  mTotRow.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' }
  mTotRow.getCell(7).value = { formula: totalSalesFormula } as any
  mTotRow.getCell(7).numFmt = '#,##0.00'
  mTotRow.getCell(7).font = { bold: true, size: 13, color: { argb: C.gold }, name: 'Calibri' }
  mTotRow.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' }

  mTotRow.getCell(11).value = `NET SALES  ·  ${monFull} ${year}`
  mTotRow.getCell(11).alignment = { horizontal: 'right', vertical: 'middle' }
  mTotRow.getCell(12).value = { formula: `G${mTotRowNum}-S${mTotRowNum}` } as any
  mTotRow.getCell(12).numFmt = '#,##0.00'
  mTotRow.getCell(12).font = { bold: true, size: 13, color: { argb: 'FF86EFAC' }, name: 'Calibri' }
  mTotRow.getCell(12).alignment = { horizontal: 'right', vertical: 'middle' }

  mTotRow.getCell(18).value = `TOTAL EXPENSES  ·  ${monFull} ${year}`
  mTotRow.getCell(18).alignment = { horizontal: 'right', vertical: 'middle' }
  mTotRow.getCell(19).value = { formula: totalExpFormula } as any
  mTotRow.getCell(19).numFmt = '#,##0.00'
  mTotRow.getCell(19).font = { bold: true, size: 13, color: { argb: 'FFFCA5A5' }, name: 'Calibri' }
  mTotRow.getCell(19).alignment = { horizontal: 'right', vertical: 'middle' }

  const hasData = sales.length > 0 || expenses.length > 0
  return { wb, hasData }
}

/**
 * Builds the monthly Item Sales workbook.
 */
export async function buildItemSalesWorkbook(
  year: number,
  month: number,
  _cfg?: ReturnType<typeof readConfig>
): Promise<{ wb: ExcelJS.Workbook; hasData: boolean }> {
  const monthPadded = String(month).padStart(2, '0')
  const startDate = `${year}-${monthPadded}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const endDate = `${year}-${monthPadded}-${String(lastDay).padStart(2, '0')}`
  const MONTHS_FULL  = ['JANUARY','FEBRUARY','MARCH','APRIL','MAY','JUNE','JULY','AUGUST','SEPTEMBER','OCTOBER','NOVEMBER','DECEMBER']
  const MONTHS_SHORT = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  const monFull  = MONTHS_FULL[month - 1]  || 'JANUARY'
  const monShort = MONTHS_SHORT[month - 1] || 'JAN'

  let sales: any[] = []
  if (!isOnline()) {
    const db = getLocalDb()
    const raw = db.prepare('SELECT date, quantity, unit_price_at_sale, discount, remarks, item_name, item_code, category_name FROM item_sales_cache WHERE date >= ? AND date <= ? ORDER BY date ASC').all(startDate, endDate)
    sales = raw.map((r: any) => ({
      date: r.date,
      quantity: r.quantity,
      unit_price_at_sale: r.unit_price_at_sale,
      discount: r.discount,
      remarks: r.remarks,
      items: { name: r.item_name, code: r.item_code, categories: { name: r.category_name } }
    }))
  } else {
    const sb = await getSupabase()
    const { data, error } = await sb
      .from('item_sales')
      .select('date, quantity, unit_price_at_sale, discount, remarks, items(name, code, categories(name))')
      .gte('date', startDate).lte('date', endDate)
      .order('date', { ascending: true })
    if (error) throw new Error(error.message)
    sales = data || []
  }

  // ── Palette ───────────────────────────────────────────────────────────────
  const C = {
    navyDark:   'FF1E3A8A',
    blue:       'FF2563EB',
    blueLight:  'FFE8F0FE',
    rowEven:    'FFF0F5FF',
    rowOdd:     'FFFFFFFF',
    summaryBg:  'FFEFF6FF',
    summaryHdr: 'FFBFDBFE',
    netGreen:   'FFD1FAE5',
    gold:       'FFFBBF24',
    green:      'FF065F46',
    border:     'FFB8C8E8',
    white:      'FFFFFFFF',
    dark:       'FF1E293B',
    muted:      'FF64748B',
    blue700:    'FF1D4ED8',
  }

  const solidFill = (argb: string): ExcelJS.Fill =>
    ({ type: 'pattern', pattern: 'solid', fgColor: { argb } })

  const thinBorder = (color = C.border): Partial<ExcelJS.Borders> => ({
    top:    { style: 'thin',   color: { argb: color } },
    bottom: { style: 'thin',   color: { argb: color } },
    left:   { style: 'thin',   color: { argb: color } },
    right:  { style: 'thin',   color: { argb: color } },
  })

  const medBorder = (): Partial<ExcelJS.Borders> => ({
    top:    { style: 'medium', color: { argb: C.navyDark } },
    bottom: { style: 'medium', color: { argb: C.navyDark } },
    left:   { style: 'medium', color: { argb: C.navyDark } },
    right:  { style: 'medium', color: { argb: C.navyDark } },
  })

  // ── Workbook ──────────────────────────────────────────────────────────────
  const wb = new ExcelJS.Workbook()
  wb.creator = 'A&G Water Refill App'
  wb.created = new Date()

  const ws = wb.addWorksheet(`${monShort} ${year} ITEM SALES`, {
    properties: { tabColor: { argb: C.blue } },
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true, fitToWidth: 1, fitToHeight: 0,
      margins: { left: 0.5, right: 0.5, top: 0.65, bottom: 0.65, header: 0.3, footer: 0.3 }
    }
  })

  // Columns: #, Date, Item, Category, Code, Qty, Unit Price, Discount, Total, Remarks
  const COL_W = [5, 14, 36, 18, 14, 10, 14, 14, 16, 28]
  COL_W.forEach((w, i) => { ws.getColumn(i + 1).width = w })
  const LAST_COL = 'J'
  const N = 10

  // ── Row 1 — Company banner ────────────────────────────────────────────────
  ws.mergeCells(`A1:${LAST_COL}1`)
  Object.assign(ws.getCell('A1'), {
    value:     'A&G WATER REFILLING STATION',
    font:      { bold: true, size: 16, color: { argb: C.white }, name: 'Calibri' },
    fill:      solidFill(C.navyDark),
    alignment: { vertical: 'middle', horizontal: 'center' },
  })
  ws.getRow(1).height = 36

  // ── Row 2 — Report title ──────────────────────────────────────────────────
  ws.mergeCells(`A2:${LAST_COL}2`)
  Object.assign(ws.getCell('A2'), {
    value:     `ITEM SALES REPORT  ·  ${monFull} ${year}`,
    font:      { bold: true, size: 12, color: { argb: C.white }, name: 'Calibri' },
    fill:      solidFill(C.blue),
    alignment: { vertical: 'middle', horizontal: 'center' },
  })
  ws.getRow(2).height = 26

  // ── Row 3 — Period / generated date ──────────────────────────────────────
  ws.mergeCells(`A3:${LAST_COL}3`)
  const genDate = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })
  Object.assign(ws.getCell('A3'), {
    value:     `Period: ${startDate}  to  ${endDate}     |     Generated: ${genDate}`,
    font:      { italic: true, size: 9, color: { argb: C.muted }, name: 'Calibri' },
    fill:      solidFill(C.blueLight),
    alignment: { vertical: 'middle', horizontal: 'center' },
  })
  ws.getRow(3).height = 17

  // ── Row 4 — Column headers ────────────────────────────────────────────────
  const HDR = ['#', 'Date', 'Item Description', 'Category', 'Code', 'Qty', 'Unit Price\n(₱)', 'Discount\n(₱)', 'Total\n(₱)', 'Remarks']
  const hdrRow = ws.getRow(4)
  hdrRow.height = 30
  HDR.forEach((h, ci) => {
    const cell = hdrRow.getCell(ci + 1)
    cell.value     = h
    cell.font      = { bold: true, size: 10, color: { argb: C.white }, name: 'Calibri' }
    cell.fill      = solidFill(C.blue)
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
    cell.border    = medBorder()
  })

  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: N } }
  ws.views = [{ state: 'frozen', ySplit: 4 }]

  // ── Data rows ─────────────────────────────────────────────────────────────
  let ri = 5
  let totQty = 0, totDisc = 0, totNet = 0

  sales.forEach((s, i) => {
    const itm      = (s.items as any) || {}
    const price    = Number(s.unit_price_at_sale) || 0
    const qty      = Number(s.quantity) || 0
    const discount = Number(s.discount) || 0
    const total    = price * qty - discount
    totQty += qty; totDisc += discount; totNet += total

    const bg  = i % 2 === 0 ? C.rowEven : C.rowOdd
    const row = ws.getRow(ri)
    row.height = 17

    const cells: [any, string, string?, boolean?][] = [
      [i + 1,                                'center'],
      [s.date,                               'center', 'yyyy-mm-dd'],
      [itm.name || '',                       'left'],
      [(itm.categories as any)?.name || '',  'left'],
      [itm.code || '',                       'center'],
      [qty,                                  'center', '#,##0'],
      [price,                                'right',  '#,##0.00'],
      [discount,                             'right',  '#,##0.00'],
      [total,                                'right',  '#,##0.00', true],
      [s.remarks || '',                      'left'],
    ]

    cells.forEach(([val, align, fmt, bold], ci) => {
      const cell = row.getCell(ci + 1)
      cell.value     = val
      cell.fill      = solidFill(bg)
      cell.border    = thinBorder()
      cell.alignment = { horizontal: align as any, vertical: 'middle', wrapText: ci === 2 }
      cell.font = {
        size: 10, name: 'Calibri', bold: !!bold,
        italic: ci === 9,
        color: { argb: ci === 9 ? C.muted : ci === 8 ? C.blue700 : C.dark },
      }
      if (fmt) cell.numFmt = fmt
    })

    ri++
  })

  // ── Totals row ────────────────────────────────────────────────────────────
  ws.mergeCells(`A${ri}:E${ri}`)
  const totRow = ws.getRow(ri)
  totRow.height = 26

  const setTot = (col: number, val: any, fmt?: string, color = C.white) => {
    const cell = totRow.getCell(col)
    cell.value     = val
    cell.fill      = solidFill(C.navyDark)
    cell.border    = medBorder()
    cell.font      = { bold: true, size: 11, color: { argb: color }, name: 'Calibri' }
    cell.alignment = { horizontal: fmt ? 'right' : col === 1 ? 'right' : 'center', vertical: 'middle' }
    if (fmt) cell.numFmt = fmt
  }

  setTot(1,  `TOTALS  (${sales.length} item${sales.length !== 1 ? 's' : ''} sold)`)
  setTot(6,  totQty,  '#,##0')
  setTot(7,  null)
  setTot(8,  totDisc, '#,##0.00', C.gold)
  setTot(9,  totNet,  '#,##0.00', C.gold)
  setTot(10, null)
  ri++

  // ── Spacer ────────────────────────────────────────────────────────────────
  ri++

  // ── Summary block ─────────────────────────────────────────────────────────
  ws.mergeCells(`A${ri}:${LAST_COL}${ri}`)
  Object.assign(ws.getCell(`A${ri}`), {
    value:     'MONTHLY SUMMARY',
    font:      { bold: true, size: 11, color: { argb: C.navyDark }, name: 'Calibri' },
    fill:      solidFill(C.summaryHdr),
    alignment: { horizontal: 'center', vertical: 'middle' },
    border:    medBorder(),
  })
  ws.getRow(ri).height = 22
  ri++

  const gross = totNet + totDisc
  const summaryData: [string, any, string?][] = [
    ['Total Transactions',  sales.length,  undefined],
    ['Total Units Sold',    totQty,        '#,##0'],
    ['Gross Sales',         gross,         '#,##0.00'],
    ['Total Discounts',     totDisc,       '#,##0.00'],
    ['Net Sales Revenue',   totNet,        '#,##0.00'],
  ]

  summaryData.forEach(([label, value, fmt], si) => {
    const isNet = si === summaryData.length - 1
    const rowBg = si % 2 === 0 ? C.summaryBg : C.rowOdd
    const sr = ws.getRow(ri)
    sr.height = 20

    ws.mergeCells(`A${ri}:F${ri}`)
    const lc = sr.getCell(1)
    lc.value     = label
    lc.font      = { size: 10, bold: isNet, color: { argb: C.dark }, name: 'Calibri' }
    lc.fill      = solidFill(rowBg)
    lc.alignment = { horizontal: 'right', vertical: 'middle' }
    lc.border    = thinBorder()

    ws.mergeCells(`G${ri}:${LAST_COL}${ri}`)
    const vc = sr.getCell(7)
    vc.value     = value
    if (fmt) vc.numFmt = fmt
    vc.font      = { bold: true, size: isNet ? 12 : 10, name: 'Calibri', color: { argb: isNet ? C.green : C.dark } }
    vc.fill      = solidFill(isNet ? C.netGreen : rowBg)
    vc.alignment = { horizontal: 'right', vertical: 'middle' }
    vc.border    = thinBorder()

    ri++
  })

  // ── Print header / footer ─────────────────────────────────────────────────
  ws.headerFooter.oddHeader = `&C&"Calibri,Bold"&14A&G WATER REFILLING STATION\n&"Calibri,Regular"&10Item Sales Report — ${monFull} ${year}`
  ws.headerFooter.oddFooter = `&LGenerated: ${genDate}&RPage &P of &N`

  return { wb, hasData: sales.length > 0 }
}

/**
 * Builds the full relational Stock Report workbook (Item Catalog, Movements, Buyer Matrix, Buyers, Restock Orders).
 */
export async function buildStockReportWorkbook(
  _cfg?: ReturnType<typeof readConfig>
): Promise<{ wb: ExcelJS.Workbook; hasData: boolean }> {
  let categories: any[] = []
  let buyers: any[] = []
  let items: any[] = []
  let movements: any[] = []
  let orders: any[] = []

  if (!isOnline()) {
    const db = getLocalDb()
    categories = db.prepare('SELECT * FROM categories_cache ORDER BY sort_order ASC').all()
    buyers = db.prepare('SELECT * FROM buyers_cache ORDER BY name ASC').all()
    items = db.prepare('SELECT * FROM items_cache ORDER BY name ASC').all()
    movements = db.prepare('SELECT * FROM stock_movements_cache ORDER BY date ASC').all()
    orders = db.prepare('SELECT * FROM restock_orders_cache ORDER BY order_date DESC').all()
  } else {
    const sb = await getSupabase()
    const { data: catData } = await sb.from('categories').select('*').order('sort_order', { ascending: true })
    categories = catData || []
    const { data: bData } = await sb.from('buyers').select('*').order('name', { ascending: true })
    buyers = bData || []
    const { data: iData } = await sb.from('items').select('*, categories(name)').order('name', { ascending: true })
    items = iData || []
    const { data: mData } = await sb.from('stock_movements').select('*, buyers(name), items(name, code)').order('date', { ascending: true })
    movements = mData || []
    const { data: oData } = await sb.from('restock_orders').select('*').order('order_date', { ascending: false })
    orders = oData || []
  }

  const wb = new ExcelJS.Workbook()
  wb.creator = 'A&G Water Refill App'
  wb.created = new Date()

  // ── Sheet 1: Item Catalog ─────────────────────────────────────────────
  const wsCatalog = wb.addWorksheet('Item Catalog', { properties: { tabColor: { argb: 'FF2563EB' } } })
  wsCatalog.views = [{ state: 'frozen', ySplit: 2 }]

  wsCatalog.mergeCells('A1:P1')
  wsCatalog.getCell('A1').value = 'INVENTORY ITEM CATALOG & STOCK SUMMARY'
  wsCatalog.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  wsCatalog.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }
  wsCatalog.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }
  wsCatalog.getRow(1).height = 32

  const catalogHeaders = [
    'Item ID', 'Item Label', 'Item Name', 'Supplier Code', 'Category',
    'Packing', 'Batch Note', 'Batch Date', 'Dealer Price (₱)', 'SRP (₱)',
    'Low Stock Limit', 'Qty In', 'Qty Out', 'Qty Balance', 'Stock Status', 'Profit/Unit (₱)'
  ]
  wsCatalog.getRow(2).values = catalogHeaders
  wsCatalog.getRow(2).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  wsCatalog.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
  wsCatalog.getRow(2).alignment = { vertical: 'middle', horizontal: 'center' }
  wsCatalog.getRow(2).height = 24

  // Pre-compute movements
  const movMap = new Map<string, { inQty: number; outQty: number }>()
  for (const m of movements || []) {
    if (!m.item_id) continue
    const entry = movMap.get(m.item_id) || { inQty: 0, outQty: 0 }
    if (m.direction === 'in') entry.inQty += Number(m.quantity) || 0
    else entry.outQty += Number(m.quantity) || 0
    movMap.set(m.item_id, entry)
  }

  let rIdx = 3
  for (const itm of items || []) {
    const mov = movMap.get(itm.id) || { inQty: 0, outQty: 0 }
    const inQty = mov.inQty
    const outQty = mov.outQty
    const bal = inQty - outQty
    const dp = Number(itm.dealer_price) || 0
    const srp = Number(itm.srp) || 0
    const status = bal <= 0 ? 'Out of Stock' : (itm.low_stock_threshold && bal <= itm.low_stock_threshold) ? 'Low Stock' : 'In Stock'

    const row = wsCatalog.getRow(rIdx)
    row.values = [
      itm.code || itm.id.substring(0, 8),
      `${itm.code || itm.id.substring(0, 8)} · ${itm.name}`,
      itm.name,
      itm.code || '',
      (itm.categories as any)?.name || 'CONTAINERS',
      itm.packing || '',
      itm.batch_note || '',
      itm.batch_date || '',
      dp,
      srp,
      itm.low_stock_threshold || '',
      inQty,
      outQty,
      bal,
      status,
      srp - dp
    ]

    // Format currency & numbers
    row.getCell(9).numFmt = '₱#,##0.00'
    row.getCell(10).numFmt = '₱#,##0.00'
    row.getCell(16).numFmt = '₱#,##0.00'
    row.getCell(12).numFmt = '#,##0'
    row.getCell(13).numFmt = '#,##0'
    row.getCell(14).numFmt = '#,##0'

    // Highlight status
    if (status === 'Out of Stock') {
      row.getCell(15).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } }
      row.getCell(15).font = { color: { argb: 'FFDC2626' }, bold: true }
    } else if (status === 'Low Stock') {
      row.getCell(15).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } }
      row.getCell(15).font = { color: { argb: 'FFD97706' }, bold: true }
    }

    rIdx++
  }

  wsCatalog.columns = [
    { width: 14 }, { width: 35 }, { width: 32 }, { width: 16 }, { width: 18 },
    { width: 14 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 14 },
    { width: 16 }, { width: 12 }, { width: 12 }, { width: 14 }, { width: 16 }, { width: 16 }
  ]

  // ── Sheet 2: Stock Movements ──────────────────────────────────────────
  const wsMov = wb.addWorksheet('Stock Movements', { properties: { tabColor: { argb: 'FF10B981' } } })
  wsMov.views = [{ state: 'frozen', ySplit: 2 }]

  wsMov.mergeCells('A1:G1')
  wsMov.getCell('A1').value = 'STOCK MOVEMENTS TRANSACTION LEDGER'
  wsMov.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
  wsMov.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF065F46' } }
  wsMov.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }
  wsMov.getRow(1).height = 32

  const movHeaders = ['Date', 'Item Description', 'Direction', 'Quantity', 'Buyer / Destination', 'Source', 'Notes / Reference']
  wsMov.getRow(2).values = movHeaders
  wsMov.getRow(2).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  wsMov.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF10B981' } }
  wsMov.getRow(2).alignment = { vertical: 'middle', horizontal: 'center' }
  wsMov.getRow(2).height = 24

  let mIdx = 3
  for (const m of movements || []) {
    const itmName = m.items?.name || 'Item'
    const itmCode = m.items?.code || m.item_id?.substring(0, 8) || ''
    const label = `${itmCode} · ${itmName}`
    const buyerName = m.buyers?.name || 'A&G (LW-BAAO)'

    const row = wsMov.getRow(mIdx)
    row.values = [
      m.date,
      label,
      m.direction === 'in' ? 'IN' : 'OUT',
      Number(m.quantity) || 0,
      buyerName,
      m.source || 'sales_entry',
      m.note || ''
    ]

    row.getCell(4).numFmt = '#,##0'
    if (m.direction === 'in') {
      row.getCell(3).font = { color: { argb: 'FF059669' }, bold: true }
    } else {
      row.getCell(3).font = { color: { argb: 'FFDC2626' }, bold: true }
    }
    mIdx++
  }

  wsMov.columns = [
    { width: 14 }, { width: 38 }, { width: 12 }, { width: 12 }, { width: 22 }, { width: 18 }, { width: 40 }
  ]

  // ── Sheet 3: Buyer Summary (Dispatch Matrix) ───────────────────────────
  const wsSummary = wb.addWorksheet('Buyer Summary', { properties: { tabColor: { argb: 'FF6366F1' } } })
  wsSummary.views = [{ state: 'frozen', xSplit: 2, ySplit: 2 }]

  const buyerList = buyers || []
  const colCount = 3 + buyerList.length + 1 // Item Code, Item Name, Category, [Buyers...], TOTAL OUT

  // Title row
  wsSummary.mergeCells(1, 1, 1, colCount)
  wsSummary.getCell(1, 1).value = 'WHOLESALE & RETAIL DISPATCH / BUYER SUMMARY MATRIX'
  wsSummary.getCell(1, 1).font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
  wsSummary.getCell(1, 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF312E81' } }
  wsSummary.getCell(1, 1).alignment = { vertical: 'middle', horizontal: 'center' }
  wsSummary.getRow(1).height = 30

  // Header row
  const summaryHeaders = ['Item Code', 'Item Description', 'Category']
  for (const b of buyerList) {
    summaryHeaders.push(b.name)
  }
  summaryHeaders.push('TOTAL OUT')

  const headerRow = wsSummary.getRow(2)
  headerRow.values = summaryHeaders
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }
  headerRow.alignment = { vertical: 'middle', horizontal: 'center' }
  headerRow.height = 24

  headerRow.getCell(1).alignment = { vertical: 'middle', horizontal: 'left' }
  headerRow.getCell(2).alignment = { vertical: 'middle', horizontal: 'left' }
  headerRow.getCell(3).alignment = { vertical: 'middle', horizontal: 'left' }

  // Map movements by item_id and buyer
  const buyerTotalMap = new Map<string, number>()
  for (const b of buyerList) buyerTotalMap.set(b.id, 0)
  let grandTotalOut = 0

  let sIdx = 3
  for (const itm of items || []) {
    const itemMovements = (movements || []).filter(m =>
      m.direction === 'out' && m.item_id === itm.id
    )

    let rowTotal = 0
    const rowVals: any[] = [
      itm.code || itm.id.substring(0, 8),
      itm.name,
      (itm.categories as any)?.name || 'CONTAINERS'
    ]

    for (const b of buyerList) {
      const bQty = itemMovements.filter(m => {
        if (m.buyer_id && m.buyer_id === b.id) return true
        if (m.buyers?.name && m.buyers.name.toLowerCase() === b.name.toLowerCase()) return true
        const noteBuyer = m.note?.match(/^Retail sale to (.+)$/)?.[1]?.trim()
        if (noteBuyer && noteBuyer.toLowerCase() === b.name.toLowerCase()) return true
        if (b.is_own_shop) {
          if (m.buyer_id) return false
          if (m.buyers?.name) return false
          if (m.note?.startsWith('Retail sale to ')) return false
          return true
        }
        return false
      }).reduce((sum, m) => sum + (Number(m.quantity) || 0), 0)

      rowVals.push(bQty > 0 ? bQty : 0)
      rowTotal += bQty
      buyerTotalMap.set(b.id, (buyerTotalMap.get(b.id) || 0) + bQty)
    }

    rowVals.push(rowTotal)
    grandTotalOut += rowTotal

    const row = wsSummary.getRow(sIdx)
    row.values = rowVals

    for (let c = 4; c <= colCount; c++) {
      row.getCell(c).numFmt = '#,##0'
      row.getCell(c).alignment = { vertical: 'middle', horizontal: 'right' }
    }
    row.getCell(colCount).font = { bold: true, color: { argb: 'FFDC2626' } }

    sIdx++
  }

  // Totals footer row
  const totalsRow = wsSummary.getRow(sIdx)
  const footerVals: any[] = ['TOTALS', '', '']
  for (const b of buyerList) {
    footerVals.push(buyerTotalMap.get(b.id) || 0)
  }
  footerVals.push(grandTotalOut)
  totalsRow.values = footerVals
  totalsRow.font = { bold: true, color: { argb: 'FF1E1B4B' } }
  totalsRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }
  totalsRow.height = 22

  for (let c = 4; c <= colCount; c++) {
    totalsRow.getCell(c).numFmt = '#,##0'
    totalsRow.getCell(c).alignment = { vertical: 'middle', horizontal: 'right' }
  }
  totalsRow.getCell(colCount).font = { bold: true, color: { argb: 'FFDC2626' } }

  const summaryColWidths = [
    { width: 14 },
    { width: 35 },
    { width: 18 }
  ]
  for (const b of buyerList) {
    summaryColWidths.push({ width: Math.max(14, b.name.length + 3) })
  }
  summaryColWidths.push({ width: 16 })
  wsSummary.columns = summaryColWidths

  // ── Sheet 4: Buyers ───────────────────────────────────────────────────
  const wsBuyers = wb.addWorksheet('Buyers', { properties: { tabColor: { argb: 'FF8B5CF6' } } })
  wsBuyers.getRow(1).values = ['Buyer Name', 'Is Own Shop']
  wsBuyers.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  wsBuyers.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8B5CF6' } }
  let bIdx = 2
  for (const b of buyers || []) {
    wsBuyers.getRow(bIdx).values = [b.name, b.is_own_shop ? 'Yes' : 'No']
    bIdx++
  }
  wsBuyers.columns = [{ width: 30 }, { width: 15 }]

  // ── Sheet 5: Restock Orders ───────────────────────────────────────────
  const wsOrders = wb.addWorksheet('Restock Orders', { properties: { tabColor: { argb: 'FFF59E0B' } } })
  wsOrders.getRow(1).values = ['SO Number', 'Order Date', 'Received Date', 'Amount (₱)', 'Trucking Fee (₱)', 'Total (₱)', 'Notes']
  wsOrders.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  wsOrders.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF59E0B' } }

  let oIdx = 2
  for (const o of orders || []) {
    const amt = Number(o.amount) || 0
    const fee = Number(o.trucking_fee) || 0
    const row = wsOrders.getRow(oIdx)
    row.values = [o.so_number || '', o.order_date, o.received_date || '', amt, fee, amt + fee, o.note || '']
    row.getCell(4).numFmt = '₱#,##0.00'
    row.getCell(5).numFmt = '₱#,##0.00'
    row.getCell(6).numFmt = '₱#,##0.00'
    oIdx++
  }
  wsOrders.columns = [
    { width: 16 }, { width: 14 }, { width: 14 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 35 }
  ]

  const hasData = items.length > 0 || movements.length > 0 || orders.length > 0
  return { wb, hasData }
}
