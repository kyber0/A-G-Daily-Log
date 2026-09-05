import ExcelJS from 'exceljs'
import type { AppConfig } from '../../shared/types'

// Exact accounting format from the original template
const ACCOUNTING_FMT = '_-* #,##0.00_-;-* #,##0.00_-;_-* "-"??_-;_-@_-'

// Column widths measured from original file
const COL_WIDTHS: Record<number, number> = {
  1:  5.7109375,   // A: SN
  2:  22.7109375,  // B: Container Type
  3:  20.7109375,  // C: Water Type
  4:  15.7109375,  // D: Quantity
  5:  15.7109375,  // E: Price (Pick Up)
  6:  15.7109375,  // F: Price (Deliver)
  7:  15.7109375,  // G: Total
  8:  5.7109375,   // H: spacer
  9:  9,           // I: Reference container name
  10: 11.140625,   // J: Alkaline pickup
  11: 11.5703125,  // K: Delivered
  12: 11.42578125, // L: Purified pickup
  13: 10.42578125, // M: Delivered
  14: 10,          // N: Mineral pickup
  15: 10.42578125, // O: Delivered
  16: 8,           // P: spacer
  17: 5.7109375,   // Q: SN (expenses)
  18: 22.7109375,  // R: Description (expenses)
  19: 15.7109375,  // S: Total (expenses)
  20: 15.7109375,  // T: Remarks (expenses)
}

// Helper: thin border on all sides
function thinBorder(): Partial<ExcelJS.Borders> {
  const side: Partial<ExcelJS.Border> = { style: 'thin' }
  return { left: side, right: side, top: side, bottom: side }
}

// Helper: center alignment
function centerMiddle(): Partial<ExcelJS.Alignment> {
  return { horizontal: 'center', vertical: 'middle' }
}

// Helper: base Calibri 11 font
function baseFont(bold = false): Partial<ExcelJS.Font> {
  return { name: 'Calibri', size: 11, bold }
}

/**
 * Build a new daily sheet on an existing workbook.
 * sheetName: e.g. "AUG29"
 */
export function createDailySheet(
  wb: ExcelJS.Workbook,
  sheetName: string,
  config: AppConfig,
  dateStr?: string
): ExcelJS.Worksheet {
  const ws = wb.addWorksheet(sheetName)

  // ── Page setup ─────────────────────────────────────────────────────────────
  ws.pageSetup = {
    paperSize: 9, // Letter
    orientation: 'portrait',
    fitToPage: false,
    margins: {
      left: 0.7, right: 0.7,
      top: 0.75, bottom: 0.75,
      header: 0.3, footer: 0.3
    }
  }

  // ── Freeze pane at B2 ─────────────────────────────────────────────────────
  ws.views = [{
    state: 'frozen',
    xSplit: 1,
    ySplit: 1,
    topLeftCell: 'B2',
    activeCell: 'B32',
  }]

  // ── Column widths ──────────────────────────────────────────────────────────
  for (const [colNum, width] of Object.entries(COL_WIDTHS)) {
    ws.getColumn(Number(colNum)).width = width
  }

  // ── Row 1 height ──────────────────────────────────────────────────────────
  ws.getRow(1).height = 24.95

  // ── Row 32 height ─────────────────────────────────────────────────────────
  ws.getRow(32).height = 47.25

  // ── Header row (Row 1) ────────────────────────────────────────────────────
  const headers: Array<{ col: number; value: string; fillArgb?: string }> = [
    { col: 1,  value: 'SN' },
    { col: 2,  value: 'CONTAINER TYPE' },
    { col: 3,  value: 'WATER TYPE' },
    { col: 4,  value: 'QUANTITY' },
    { col: 5,  value: 'PRICE (PICK UP)',  fillArgb: 'FF8EA9DB' },  // theme 6 tint ~0.6 ≈ light blue
    { col: 6,  value: 'PRICE (DELIVER)',  fillArgb: 'FFFFE699' },  // theme 9 tint ~0.8 ≈ light yellow
    { col: 7,  value: 'TOTAL' },
    { col: 17, value: 'SN' },
    { col: 18, value: 'DESCRIPTION' },
    { col: 19, value: 'TOTAL' },
    { col: 20, value: 'REMARKS' },
  ]

  for (const h of headers) {
    const cell = ws.getCell(1, h.col)
    cell.value = h.value
    cell.font = baseFont()
    cell.alignment = centerMiddle()
    cell.border = thinBorder()
    if (h.fillArgb) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: h.fillArgb } }
    }
  }

  // Reference table header row 1, cols J–O
  const refHeaders = [
    { col: 10, value: 'ALKALINE' },
    { col: 11, value: 'DELIVERED' },
    { col: 12, value: 'PURIFIED' },
    { col: 13, value: 'DELIVERED' },
    { col: 14, value: 'MINERAL' },
    { col: 15, value: 'DELIVERED' },
  ]
  for (const h of refHeaders) {
    const cell = ws.getCell(1, h.col)
    cell.value = h.value
    cell.font = baseFont()
    cell.alignment = centerMiddle()
    // Template has NO border on J1-O1 ref table headers
  }

  // ── Data rows 2–31 ────────────────────────────────────────────────────────
  for (let r = 2; r <= 31; r++) {
    const row = ws.getRow(r)

    // Col A: SN
    const snCell = ws.getCell(r, 1)
    if (r === 2) {
      snCell.value = 1
    } else {
      snCell.value = { formula: `A${r-1}+1`, result: r - 1 } as any
    }
    snCell.alignment = centerMiddle()
    snCell.border = thinBorder()
    snCell.font = baseFont()

    // Col B: Container Type (border only, value written by save engine)
    for (const col of [2, 3, 4]) {
      const c = ws.getCell(r, col)
      c.border = thinBorder()
      c.alignment = centerMiddle()
      c.font = baseFont()
    }

    // Col E: Price Pick Up (border + accounting format)
    const eCell = ws.getCell(r, 5)
    eCell.border = thinBorder()
    eCell.alignment = centerMiddle()
    eCell.numFmt = ACCOUNTING_FMT
    eCell.font = baseFont()

    // Col F: Price Deliver
    const fCell = ws.getCell(r, 6)
    fCell.border = thinBorder()
    fCell.alignment = centerMiddle()
    fCell.numFmt = ACCOUNTING_FMT
    fCell.font = baseFont()

    // Col G: Total formula (default to F*D; save engine will set correct one per row)
    const gCell = ws.getCell(r, 7)
    gCell.value = { formula: `F${r}*D${r}`, result: 0 } as any
    gCell.border = thinBorder()
    gCell.alignment = centerMiddle()
    gCell.numFmt = ACCOUNTING_FMT
    gCell.font = baseFont()

    // Expenses SN col Q
    const qCell = ws.getCell(r, 17)
    if (r === 2) {
      qCell.value = 1
    } else {
      qCell.value = { formula: `Q${r-1}+1`, result: r - 1 } as any
    }
    qCell.border = thinBorder()
    qCell.alignment = centerMiddle()
    qCell.font = baseFont()

    // Expenses cols R, S, T
    for (const col of [18, 19, 20]) {
      const c = ws.getCell(r, col)
      c.border = thinBorder()
      c.alignment = centerMiddle()
      c.font = baseFont()
      if (col === 19) c.numFmt = ACCOUNTING_FMT
    }

    row.commit()
  }

  // ── Row 32: Totals ────────────────────────────────────────────────────────
  const totRow = ws.getRow(32)

  // D32: SUM of quantities — NO border (matches template)
  const d32 = ws.getCell(32, 4)
  d32.value = { formula: 'SUM(D2:D31)', result: 0 } as any
  d32.alignment = centerMiddle()
  d32.font = { name: 'Calibri', size: 12, bold: true }

  // F32: label
  const f32 = ws.getCell(32, 6)
  f32.value = 'OVER ALL TOTAL FOR TODAY'
  f32.border = thinBorder()
  f32.alignment = { horizontal: 'center', vertical: 'bottom', wrapText: true }
  f32.font = { name: 'Calibri', size: 12, bold: false }

  // G32: SUM of totals
  const g32 = ws.getCell(32, 7)
  g32.value = { formula: 'SUM(G2:G31)', result: 0 } as any
  g32.border = thinBorder()
  g32.alignment = centerMiddle()
  g32.numFmt = ACCOUNTING_FMT
  g32.font = { name: 'Calibri', size: 14, bold: true }
  g32.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFCE4D6' } } // Theme 8 tint ~0.8

  // K32: NET SALES label — NO border (matches template)
  const k32 = ws.getCell(32, 11)
  k32.value = 'NET SALES FOR TODAY'
  k32.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true }
  k32.font = baseFont()

  // L32: NET SALES = G32 - S32 — NO border (matches template, has fill)
  const l32 = ws.getCell(32, 12)
  l32.value = { formula: 'SUM(G32-S32)', result: 0 } as any
  l32.numFmt = ACCOUNTING_FMT
  l32.alignment = centerMiddle()
  l32.font = baseFont()
  l32.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } } // Theme 5 tint ~0.6

  // R32: TOTAL EXPENSES label
  const r32 = ws.getCell(32, 18)
  r32.value = 'TOTAL EXPENSES FOR TODAY'
  r32.border = thinBorder()
  r32.alignment = { horizontal: 'center', vertical: 'bottom', wrapText: true }
  r32.font = { name: 'Calibri', size: 12, bold: false }

  // S32: SUM of expenses
  const s32 = ws.getCell(32, 19)
  s32.value = { formula: 'SUM(S2:S31)', result: 0 } as any
  s32.border = thinBorder()
  s32.alignment = centerMiddle()
  s32.numFmt = ACCOUNTING_FMT
  s32.font = { name: 'Calibri', size: 14, bold: true }
  s32.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD0CECE' } } // Theme 2 tint -0.25

  totRow.commit()

  // ── Reference table (Rows 2–3: gallon pricing, Rows 6–11: bottle pricing) ─
  _writeReferenceTable(ws, config)

  // ── Hidden list rows for dropdowns ────────────────────────────────────────
  _writeHiddenLists(ws, config)

  // ── Data Validations ──────────────────────────────────────────────────────
  _applyDataValidations(ws)

  // ── Month-end total row ───────────────────────────────────────────────────
  if (dateStr) {
    const d = new Date(dateStr + 'T00:00:00')
    const nextDay = new Date(d)
    nextDay.setDate(d.getDate() + 1)
    
    // If tomorrow is a different month, today is the last day!
    if (nextDay.getMonth() !== d.getMonth()) {
      const mon = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][d.getMonth()]
      const numDays = d.getDate()
      const r34 = ws.getRow(34)
      
      // F34
      const f34 = ws.getCell(34, 6)
      f34.value = 'TOTAL SALES FOR THIS MONTH'
      f34.alignment = { horizontal: 'center', wrapText: true }
      f34.font = { name: 'Calibri', size: 11, color: { theme: 1 } }
      
      // G34
      const g34 = ws.getCell(34, 7)
      const g34Formula = Array.from({length: numDays}, (_, i) => `'${mon}${String(i+1).padStart(2, '0')}'!G32`).join('+')
      g34.value = { formula: g34Formula, result: 0 } as any
      g34.alignment = centerMiddle()
      g34.font = { name: 'Calibri', size: 14, bold: true, color: { theme: 1 } }
      g34.numFmt = ACCOUNTING_FMT
      
      // L34
      const l34 = ws.getCell(34, 12)
      l34.value = { formula: 'SUM(G34-S34)', result: 0 } as any
      l34.font = { name: 'Calibri', size: 11, color: { theme: 1 } }
      l34.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF8EA9DB' } } // Theme 6 tint ~0.6 approx
      l34.numFmt = ACCOUNTING_FMT
      
      // R34
      const r34_18 = ws.getCell(34, 18)
      r34_18.value = 'TOTAL EXPENSES FOR THIS MONTH'
      r34_18.font = { name: 'Calibri', size: 11, color: { theme: 1 } }
      
      // S34
      const s34 = ws.getCell(34, 19)
      const s34Formula = Array.from({length: numDays}, (_, i) => `'${mon}${String(i+1).padStart(2, '0')}'!S32`).join('+')
      s34.value = { formula: s34Formula, result: 0 } as any
      s34.font = { name: 'Calibri', size: 14, bold: true, color: { theme: 1 } }
      s34.numFmt = ACCOUNTING_FMT
      
      r34.commit()
    }
  }

  return ws
}

// ─────────────────────────────────────────────────────────────────────────────
// Reference table (cols I–O)
// ─────────────────────────────────────────────────────────────────────────────
function _writeReferenceTable(ws: ExcelJS.Worksheet, config: AppConfig): void {
  const { priceTable } = config

  // Gallon types: ROUND in row 2, SLIM in row 3 (matches template order)
  const gallonContainers = ['ROUND', 'SLIM']

  // Row 2: SLIM/ROUND pricing
  // Row 3: second gallon type if present
  const gallonRows = gallonContainers.slice(0, 2)
  gallonRows.forEach((cname, idx) => {
    const rowNum = 2 + idx
    const alk  = priceTable.find(p => p.container === cname && p.water === 'ALKALINE')
    const pur  = priceTable.find(p => p.container === cname && p.water === 'PURIFIED')
    const min  = priceTable.find(p => p.container === cname && p.water === 'MINERAL')

    ws.getCell(rowNum, 9).value  = cname
    ws.getCell(rowNum, 10).value = alk?.pickup  ?? ''
    ws.getCell(rowNum, 11).value = alk?.deliver ?? ''
    ws.getCell(rowNum, 12).value = pur?.pickup  ?? ''
    ws.getCell(rowNum, 13).value = pur?.deliver ?? ''
    ws.getCell(rowNum, 14).value = min?.pickup  ?? ''
    ws.getCell(rowNum, 15).value = min?.deliver ?? ''

    for (const col of [9, 10, 11, 12, 13, 14, 15]) {
      const cell = ws.getCell(rowNum, col)
      cell.alignment = centerMiddle()
      // Entire ref table area (cols I-O) has NO borders in the template
      cell.font = baseFont()
      if (col >= 10) cell.numFmt = ACCOUNTING_FMT
    }
    ws.getRow(rowNum).commit()
  })

  // Row 6: bottle sub-table header — NO borders in ref table area
  ws.getCell(6, 10).value = 'PER BOTTLE'
  ws.getCell(6, 10).font = baseFont()
  ws.getCell(6, 11).value = 'WHOLESALE'
  ws.getCell(6, 11).font = baseFont()
  ws.getCell(6, 11).alignment = centerMiddle()
  ws.getRow(6).commit()

  // Rows 7–8: 350ml, 500ml
  const bottleTypes = [
    { name: '350ml', row: 7 },
    { name: '500ml', row: 8 },
  ]
  for (const bt of bottleTypes) {
    const entry = priceTable.find(p =>
      p.container.toLowerCase() === bt.name.toLowerCase() ||
      p.container === bt.name.toUpperCase()
    )
    ws.getCell(bt.row, 9).value  = bt.name
    ws.getCell(bt.row, 10).value = entry?.pickup  ?? ''
    ws.getCell(bt.row, 11).value = entry?.deliver ?? ''
    // Static note text in col L (matches original)
    if (bt.row === 7) ws.getCell(bt.row, 12).value = '50 BOTTLE'
    if (bt.row === 8) ws.getCell(bt.row, 12).value = 'MINIMUM'
    
    for (const col of [9, 10, 11, 12]) {
      const cell = ws.getCell(bt.row, col)
      // Entire ref table area has NO borders
      cell.font = baseFont()
      if (col >= 10) cell.numFmt = ACCOUNTING_FMT
      // Yellow fill for K (11) and L (12)
      if (col === 11 || col === 12) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } }
        if (col === 12) cell.alignment = { horizontal: 'center', vertical: 'middle' }
      }
    }
    ws.getRow(bt.row).commit()
  }

  // Rows 10–11: "TO CECIL" special pricing
  ws.getCell(10, 9).value  = '350ml'
  ws.getCell(10, 10).value = 7
  ws.getCell(10, 11).value = 'TO CECIL'
  ws.getCell(11, 9).value  = '500ml'
  ws.getCell(11, 10).value = 8.5
  ws.getCell(11, 11).value = 'TO CECIL'

  for (const r of [10, 11]) {
    for (const c of [9, 10, 11]) {
      const cell = ws.getCell(r, c)
      // Entire ref table has NO borders
      cell.font = baseFont()
      if (c === 10) {
        cell.numFmt = ACCOUNTING_FMT
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
      }
      if (c === 11) {
        cell.alignment = centerMiddle()
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9E1F2' } }
      }
    }
  }

  // Merge K10:K11 for 'TO CECIL' label
  ws.mergeCells('K10:K11')
  ws.getRow(10).commit()
  ws.getRow(11).commit()
}

// ─────────────────────────────────────────────────────────────────────────────
// Hidden dropdown source lists (rows 49–68)
// ─────────────────────────────────────────────────────────────────────────────
function _writeHiddenLists(ws: ExcelJS.Worksheet, config: AppConfig): void {
  // Water types: B49–B51
  config.waterTypes.slice(0, 10).forEach((wt, i) => {
    ws.getCell(49 + i, 2).value = wt
  })

  // Container types: B54–B68
  config.containerTypes.slice(0, 15).forEach((ct, i) => {
    ws.getCell(54 + i, 2).value = ct.name
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Data validations for columns B (container) and C (water type)
// ─────────────────────────────────────────────────────────────────────────────
function _applyDataValidations(ws: ExcelJS.Worksheet): void {
  for (let r = 2; r <= 31; r++) {
    // Col B: container dropdown
    ws.getCell(r, 2).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['$B$54:$B$68'],
      showErrorMessage: false,
    }

    // Col C: water type dropdown
    ws.getCell(r, 3).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['$B$49:$B$51'],
      showErrorMessage: false,
    }
  }
}
