import { ipcMain, dialog, BrowserWindow, shell, app } from 'electron'
import * as path from 'path'
import * as fs from 'fs'
import ExcelJS from 'exceljs'
import type { IpcResult } from '../../shared/types'
import { getSupabase } from '../supabase/client'
import { readConfig } from '../store/config'
import { isOnline } from '../store/syncEngine'
import { getLocalDb } from '../store/localDb'

/**
 * Returns the ISO timestamp for the very last millisecond of the given month.
 * month format: "YYYY-MM"
 */
function monthEndIso(month: string): string {
  const parts = month.split('-')
  const y = parseInt(parts[0], 10)
  const m = parseInt(parts[1], 10)
  const lastDay = new Date(y, m, 0).getDate()
  return `${month}-${String(lastDay).padStart(2, '0')}T23:59:59.999Z`
}

export function registerExportIpc(): void {
  // ── Export Stock Report (Full Relational Workbook) ────────────────────────
  ipcMain.handle('export:stockReport', async (): Promise<IpcResult<string | undefined>> => {
    try {
      const win = BrowserWindow.getFocusedWindow() || undefined
      const dateStr = new Date().toISOString().substring(0, 10)
      const saveRes = await dialog.showSaveDialog(win as any, {
        title: 'Export Stock Report to Excel',
        defaultPath: `STOCK REPORT (${dateStr}).xlsx`,
        filters: [{ name: 'Excel Spreadsheets (*.xlsx)', extensions: ['xlsx'] }]
      })

      if (saveRes.canceled || !saveRes.filePath) {
        return { ok: true, data: undefined }
      }

      const destPath = saveRes.filePath

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


      // Create new workbook
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
              if (m.buyer_id) return false         // has a different buyer_id
              if (m.buyers?.name) return false     // has a named buyer that didn't match
              if (m.note?.startsWith('Retail sale to ')) return false  // note names a different buyer
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

        // Number formats
        for (let c = 4; c <= colCount; c++) {
          row.getCell(c).numFmt = '#,##0'
          row.getCell(c).alignment = { vertical: 'middle', horizontal: 'right' }
        }
        // Total column highlight
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

      // Column widths
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

      // ── Sheet 4: Restock Orders ───────────────────────────────────────────
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

      await wb.xlsx.writeFile(destPath)
      return { ok: true, data: destPath }
    } catch (e: unknown) {
      console.error('Failed to export stock report:', e)
      return { ok: false, error: String(e) }
    }
  })

  // ── Export Item Sales Report ──────────────────────────────────────────────
  ipcMain.handle('export:salesReport', async (_e, monthStr: string): Promise<IpcResult<string | undefined>> => {
    try {
      const win = BrowserWindow.getFocusedWindow() || undefined
      const cfg = readConfig()
      const invDir = (cfg.inventoryFolder && fs.existsSync(cfg.inventoryFolder)) ? cfg.inventoryFolder : undefined
      const saveRes = await dialog.showSaveDialog(win as any, {
        title: 'Export Sales Report to Excel',
        defaultPath: invDir ? path.join(invDir, `SALES REPORT (${monthStr}).xlsx`) : `SALES REPORT (${monthStr}).xlsx`,
        filters: [{ name: 'Excel Spreadsheets (*.xlsx)', extensions: ['xlsx'] }]
      })

      if (saveRes.canceled || !saveRes.filePath) {
        return { ok: true, data: undefined }
      }

      const destPath = saveRes.filePath
      const parts = monthStr.split('-')
      const year = parseInt(parts[0], 10)
      const month = parseInt(parts[1], 10)
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const lastDay = new Date(year, month, 0).getDate()
      const endDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

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
          items: {
            name: r.item_name,
            code: r.item_code,
            categories: { name: r.category_name }
          }
        }))
      } else {
        const sb = await getSupabase()
        const { data, error } = await sb
          .from('item_sales')
          .select(`
            date, quantity, unit_price_at_sale, discount, remarks,
            items (
              name, code, categories(name)
            )
          `)
          .gte('date', startDate)
          .lte('date', endDate)
          .order('date', { ascending: true })

        if (error) return { ok: false, error: error.message }
        sales = data || []
      }


      const wb = new ExcelJS.Workbook()
      const ws = wb.addWorksheet('Item Sales', { properties: { tabColor: { argb: 'FF2563EB' } } })

      ws.mergeCells('A1:H1')
      ws.getCell('A1').value = `MONTHLY ITEM SALES REPORT — ${monthStr}`
      ws.getCell('A1').font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }
      ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }
      ws.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }
      ws.getRow(1).height = 32

      const headers = ['Date', 'Item Description', 'Category', 'Item Code', 'Price (₱)', 'Qty', 'Discount (₱)', 'Total Amount (₱)', 'Buyer / Remarks']
      ws.getRow(2).values = headers
      ws.getRow(2).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      ws.getRow(2).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } }
      ws.getRow(2).alignment = { vertical: 'middle', horizontal: 'center' }
      ws.getRow(2).height = 24

      let r = 3
      let totalQty = 0
      let grandTotal = 0

      for (const s of sales || []) {
        const itm = (s.items as any) || {}
        const price = Number(s.unit_price_at_sale) || 0
        const qty = Number(s.quantity) || 0
        const discount = Number(s.discount) || 0
        const total = (price * qty) - discount

        totalQty += qty
        grandTotal += total

        const row = ws.getRow(r)
        row.values = [
          s.date,
          itm.name || 'Item',
          itm.categories?.name || '',
          itm.code || '',
          price,
          qty,
          discount,
          total,
          s.remarks || ''
        ]

        row.getCell(5).numFmt = '₱#,##0.00'
        row.getCell(6).numFmt = '#,##0'
        row.getCell(7).numFmt = '₱#,##0.00'
        row.getCell(8).numFmt = '₱#,##0.00'
        r++
      }

      // Summary Row
      const sumRow = ws.getRow(r)
      sumRow.values = ['TOTAL', '', '', '', '', totalQty, '', grandTotal, '']
      sumRow.font = { bold: true }
      sumRow.getCell(6).numFmt = '#,##0'
      sumRow.getCell(8).numFmt = '₱#,##0.00'
      sumRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } }

      ws.columns = [
        { width: 14 }, { width: 35 }, { width: 18 }, { width: 15 },
        { width: 14 }, { width: 10 }, { width: 14 }, { width: 18 }, { width: 25 }
      ]

      await wb.xlsx.writeFile(destPath)
      return { ok: true, data: destPath }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  // ── Reveal Exported File ──────────────────────────────────────────────────
  ipcMain.handle('export:openFile', async (_e, filePath: string): Promise<IpcResult<void>> => {
    try {
      if (fs.existsSync(filePath)) {
        shell.showItemInFolder(filePath)
        return { ok: true, data: undefined }
      }
      return { ok: false, error: 'File not found' }
    } catch (e) {
      return { ok: false, error: String(e) }
    }
  })

  // ── Helper: Build Template-Accurate Daily Log Workbook ────────────────────
  async function buildDailyLogWorkbook(
    year: number,
    monthNum: number,
    cfg: ReturnType<typeof readConfig>
  ): Promise<{ wb: ExcelJS.Workbook; hasData: boolean }> {
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
    for (const p of cfg.priceTable) {
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

    const headerFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } }
    const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
    const subHeaderFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2E75B6' } }
    const totalsFill: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFD966' } }

    const sheetNames: string[] = []

    for (let day = 1; day <= daysInMonth; day++) {
      const dayPad = String(day).padStart(2, '0')
      const dateStr = `${year}-${monthPadded}-${dayPad}`
      const sheetName = `${mon}${dayPad}`
      sheetNames.push(sheetName)

      const daySales = salesByDate.get(dateStr) || []
      const dayExpenses = expByDate.get(dateStr) || []

      const dObj = new Date(year, monthNum - 1, day)
      const isSunday = dObj.getDay() === 0
      const isClosed = isSunday || daySales.length === 0

      const ws = wb.addWorksheet(sheetName, {
        properties: {
          tabColor: isClosed ? { argb: 'FFFF0000' } : undefined
        }
      })
      ws.views = [{ state: 'frozen', ySplit: 1 }]

      ws.columns = [
        { width: 5 },   // A - SN
        { width: 20 },  // B - CONTAINER TYPE
        { width: 12 },  // C - WATER TYPE
        { width: 10 },  // D - QUANTITY
        { width: 14 },  // E - PRICE (PICK UP)
        { width: 14 },  // F - PRICE (DELIVER)
        { width: 12 },  // G - TOTAL
        { width: 3 },   // H - spacer
        { width: 16 },  // I - price ref container
        { width: 12 },  // J - ALKALINE
        { width: 12 },  // K - DELIVERED
        { width: 12 },  // L - PURIFIED
        { width: 12 },  // M - DELIVERED
        { width: 12 },  // N - MINERAL
        { width: 12 },  // O - DELIVERED
        { width: 3 },   // P - spacer
        { width: 5 },   // Q - SN (expenses)
        { width: 24 },  // R - DESCRIPTION
        { width: 12 },  // S - TOTAL (expenses)
        { width: 20 },  // T - REMARKS
      ]

      const hRow = ws.getRow(1)
      hRow.height = 20
      const setH = (col: number, val: string, fill = headerFill) => {
        const cell = hRow.getCell(col)
        cell.value = val
        cell.font = headerFont
        cell.fill = fill
        cell.alignment = { horizontal: 'center', vertical: 'middle' }
        cell.border = { bottom: { style: 'thin', color: { argb: 'FFAAAAAA' } } }
      }
      setH(1, 'SN'); setH(2, 'CONTAINER TYPE'); setH(3, 'WATER TYPE')
      setH(4, 'QUANTITY'); setH(5, 'PRICE (PICK UP)'); setH(6, 'PRICE (DELIVER)')
      setH(7, 'TOTAL')
      setH(10, 'ALKALINE', subHeaderFill); setH(11, 'DELIVERED', subHeaderFill)
      setH(12, 'PURIFIED', subHeaderFill); setH(13, 'DELIVERED', subHeaderFill)
      setH(14, 'MINERAL', subHeaderFill);  setH(15, 'DELIVERED', subHeaderFill)
      setH(17, 'SN'); setH(18, 'DESCRIPTION'); setH(19, 'TOTAL'); setH(20, 'REMARKS')

      for (let i = 0; i < 30; i++) {
        const rowNum = i + 2
        const sale = daySales[i]
        const exp = dayExpenses[i]
        const row = ws.getRow(rowNum)
        row.height = 16

        if (i === 0) {
          row.getCell(1).value = 1
        } else {
          row.getCell(1).value = { formula: `A${rowNum - 1}+1`, result: i + 1 } as any
        }
        row.getCell(1).alignment = { horizontal: 'center' }

        if (sale) {
          row.getCell(2).value = sale.container_type_raw || ''
          row.getCell(3).value = sale.water_type_raw || ''
          row.getCell(4).value = Number(sale.quantity) || 0

          const unitPrice = Number(sale.unit_price) || getPrice(sale.container_type_raw, sale.water_type_raw || '', sale.mode)
          const isDeliver = sale.mode === 'deliver'

          if (isDeliver) {
            row.getCell(5).value = 0
            row.getCell(6).value = unitPrice
            row.getCell(7).value = { formula: `F${rowNum}*D${rowNum}` } as any
          } else {
            row.getCell(5).value = unitPrice
            row.getCell(6).value = 0
            row.getCell(7).value = { formula: `E${rowNum}*D${rowNum}` } as any
          }

          row.getCell(4).numFmt = '#,##0'
          row.getCell(5).numFmt = '₱#,##0.00'
          row.getCell(6).numFmt = '₱#,##0.00'
          row.getCell(7).numFmt = '₱#,##0.00'
          row.getCell(7).font = { bold: true }
        } else {
          row.getCell(7).value = { formula: `E${rowNum}*D${rowNum}` } as any
          row.getCell(7).numFmt = '₱#,##0.00'
        }

        if (i === 0) {
          row.getCell(9).value = 'ROUND'
          const rndAlk = priceRef['ROUND|ALKALINE']
          const rndPur = priceRef['ROUND|PURIFIED']
          const rndMin = priceRef['ROUND|MINERAL']
          row.getCell(10).value = rndAlk?.pickup ?? 40
          row.getCell(11).value = rndAlk?.deliver ?? 45
          row.getCell(12).value = rndPur?.pickup ?? 30
          row.getCell(13).value = rndPur?.deliver ?? 35
          row.getCell(14).value = rndMin?.pickup ?? 25
          row.getCell(15).value = rndMin?.deliver ?? 30
        } else if (i === 1) {
          row.getCell(9).value = 'SLIM'
          const slmAlk = priceRef['SLIM|ALKALINE']
          const slmPur = priceRef['SLIM|PURIFIED']
          const slmMin = priceRef['SLIM|MINERAL']
          row.getCell(10).value = slmAlk?.pickup ?? 40
          row.getCell(11).value = slmAlk?.deliver ?? 45
          row.getCell(12).value = slmPur?.pickup ?? 30
          row.getCell(13).value = slmPur?.deliver ?? 35
          row.getCell(14).value = slmMin?.pickup ?? 25
          row.getCell(15).value = slmMin?.deliver ?? 30
        } else if (i === 4) {
          row.getCell(10).value = 'PER BOTTLE'
          row.getCell(11).value = 'WHOLESALE'
        } else if (i === 5) {
          row.getCell(9).value = '350ml'
          const p350 = priceRef['350ML|PURIFIED'] || priceRef['350ML|ALKALINE']
          row.getCell(10).value = p350?.pickup ?? 10
          row.getCell(11).value = p350?.deliver ?? 8
          row.getCell(12).value = '50 BOTTLE'
        } else if (i === 6) {
          row.getCell(9).value = '500ml'
          const p500 = priceRef['500ML|PURIFIED'] || priceRef['500ML|ALKALINE']
          row.getCell(10).value = p500?.pickup ?? 12
          row.getCell(11).value = p500?.deliver ?? 9
          row.getCell(12).value = 'MINIMUM'
        }

        if (i === 0) {
          row.getCell(17).value = 1
        } else {
          row.getCell(17).value = { formula: `Q${rowNum - 1}+1`, result: i + 1 } as any
        }
        row.getCell(17).alignment = { horizontal: 'center' }

        if (exp) {
          row.getCell(18).value = exp.description || ''
          row.getCell(19).value = Number(exp.total) || 0
          row.getCell(19).numFmt = '₱#,##0.00'
          row.getCell(20).value = exp.remarks || ''
        }

        if (i % 2 === 1 && sale) {
          for (let c = 1; c <= 7; c++) {
            row.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F7FD' } }
          }
        }
      }

      const totRow = ws.getRow(32)
      totRow.height = 20
      totRow.font = { bold: true }
      totRow.fill = totalsFill
      totRow.getCell(4).value = { formula: 'SUM(D2:D31)' } as any
      totRow.getCell(4).numFmt = '#,##0'
      totRow.getCell(6).value = 'OVER ALL TOTAL FOR TODAY'
      totRow.getCell(6).font = { bold: true, size: 10 }
      totRow.getCell(6).alignment = { horizontal: 'right' }
      totRow.getCell(7).value = { formula: 'SUM(G2:G31)' } as any
      totRow.getCell(7).numFmt = '₱#,##0.00'
      totRow.getCell(7).font = { bold: true, color: { argb: 'FFCC0000' } }
      totRow.getCell(11).value = 'NET SALES FOR TODAY'
      totRow.getCell(11).font = { bold: true }
      totRow.getCell(11).alignment = { horizontal: 'right' }
      totRow.getCell(12).value = { formula: 'SUM(G32-S32)' } as any
      totRow.getCell(12).numFmt = '₱#,##0.00'
      totRow.getCell(12).font = { bold: true, color: { argb: 'FF006600' } }
      totRow.getCell(18).value = 'TOTAL EXPENSES FOR TODAY'
      totRow.getCell(18).font = { bold: true }
      totRow.getCell(18).alignment = { horizontal: 'right' }
      totRow.getCell(19).value = { formula: 'SUM(S2:S31)' } as any
      totRow.getCell(19).numFmt = '₱#,##0.00'
      totRow.getCell(19).font = { bold: true, color: { argb: 'FFCC0000' } }

      const waterTypes = cfg.waterTypes.length > 0 ? cfg.waterTypes : ['ALKALINE', 'PURIFIED', 'MINERAL']
      const containerTypes = cfg.containerTypes.map(ct => ct.name)
      waterTypes.forEach((wt, idx) => {
        ws.getRow(49 + idx).getCell(2).value = wt
      })
      containerTypes.forEach((ct, idx) => {
        ws.getRow(54 + idx).getCell(2).value = ct
      })
    }

    const lastSheet = wb.getWorksheet(sheetNames[sheetNames.length - 1])!
    const totalSalesFormula = sheetNames.map(sn => `'${sn}'!G32`).join('+')
    const totalExpFormula   = sheetNames.map(sn => `'${sn}'!S32`).join('+')

    const mTotRow = lastSheet.getRow(34)
    mTotRow.height = 20
    mTotRow.font = { bold: true }
    mTotRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE699' } }
    mTotRow.getCell(6).value = 'TOTAL SALES FOR THIS MONTH'
    mTotRow.getCell(6).font = { bold: true }
    mTotRow.getCell(6).alignment = { horizontal: 'right' }
    mTotRow.getCell(7).value = { formula: totalSalesFormula } as any
    mTotRow.getCell(7).numFmt = '₱#,##0.00'
    mTotRow.getCell(7).font = { bold: true, color: { argb: 'FFCC0000' } }
    mTotRow.getCell(11).value = 'NET SALES FOR THIS MONTH'
    mTotRow.getCell(11).font = { bold: true }
    mTotRow.getCell(11).alignment = { horizontal: 'right' }
    mTotRow.getCell(12).value = { formula: `SUM(G34-S34)` } as any
    mTotRow.getCell(12).numFmt = '₱#,##0.00'
    mTotRow.getCell(12).font = { bold: true, color: { argb: 'FF006600' } }
    mTotRow.getCell(18).value = 'TOTAL EXPENSES FOR THIS MONTH'
    mTotRow.getCell(18).font = { bold: true }
    mTotRow.getCell(18).alignment = { horizontal: 'right' }
    mTotRow.getCell(19).value = { formula: totalExpFormula } as any
    mTotRow.getCell(19).numFmt = '₱#,##0.00'
    mTotRow.getCell(19).font = { bold: true, color: { argb: 'FFCC0000' } }

    const hasData = sales.length > 0 || expenses.length > 0
    return { wb, hasData }
  }

  // ── Export Daily Log (Monthly — exact DAILY LOG.xlsx template replica) ────
  ipcMain.handle('export:dailyLog', async (_e, monthStr: string): Promise<IpcResult<string | undefined>> => {
    try {
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || undefined
      const cfg = readConfig()

      if (!monthStr || typeof monthStr !== 'string' || !monthStr.includes('-')) {
        const now = new Date()
        monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
      }

      const [yearStr, monthNumStr] = monthStr.split('-')
      const year = parseInt(yearStr, 10) || new Date().getFullYear()
      const monthNum = parseInt(monthNumStr, 10) || (new Date().getMonth() + 1)
      const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
      const mon = MONTHS[monthNum - 1] || 'JAN'
      const monthPadded = String(monthNum).padStart(2, '0')

      const defaultName = `${monthPadded}. DAILY LOG (${mon})-${year}.xlsx`

      let defaultDir = cfg.saveFolder
      if (!defaultDir || !fs.existsSync(defaultDir)) {
        try {
          defaultDir = app.getPath('documents') || app.getPath('downloads')
        } catch {
          defaultDir = ''
        }
      }

      const saveRes = await dialog.showSaveDialog(win as any, {
        title: 'Export Daily Log to Excel',
        defaultPath: defaultDir ? path.join(defaultDir, defaultName) : defaultName,
        filters: [{ name: 'Excel Spreadsheets (*.xlsx)', extensions: ['xlsx'] }]
      })

      if (saveRes.canceled || !saveRes.filePath) return { ok: true, data: undefined }

      const { wb } = await buildDailyLogWorkbook(year, monthNum, cfg)

      const destPath = saveRes.filePath
      const destDir = path.dirname(destPath)
      if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })

      await wb.xlsx.writeFile(destPath)
      return { ok: true, data: destPath }
    } catch (e: any) {
      console.error('Failed to export daily log:', e)
      const msg = e?.message || String(e)
      if (e?.code === 'EBUSY' || msg.includes('EBUSY')) {
        return { ok: false, error: 'The file is currently open in Excel or another program. Please close Excel and try again.' }
      }
      return { ok: false, error: msg }
    }
  })


  // ── Export Water Audit Log (CSV) ──────────────────────────────────────────
  ipcMain.handle('export:waterLog', async (_e, monthStr: string): Promise<IpcResult<string | undefined>> => {
    try {
      const win = BrowserWindow.getFocusedWindow() || undefined
      const cfg = readConfig()
      const saveDir = (cfg.saveFolder && fs.existsSync(cfg.saveFolder)) ? cfg.saveFolder : undefined
      const saveRes = await dialog.showSaveDialog(win as any, {
        title: 'Export Water Audit Log',
        defaultPath: saveDir ? path.join(saveDir, `audit-${monthStr}.csv`) : `audit-${monthStr}.csv`,
        filters: [
          { name: 'CSV Files (*.csv)', extensions: ['csv'] },
          { name: 'Text Files (*.txt)', extensions: ['txt'] }
        ]
      })
      if (saveRes.canceled || !saveRes.filePath) return { ok: true, data: undefined }

      const sb = await getSupabase()
      const startIso = `${monthStr}-01T00:00:00.000Z`
      const endIso   = monthEndIso(monthStr)

      let rows: { timestamp: string; action: string; details: string }[] = []

      const { data, error } = await sb
        .from('audit_logs')
        .select('action, details, timestamp')
        .eq('log_type', 'water')
        .gte('timestamp', startIso)
        .lte('timestamp', endIso)
        .order('timestamp', { ascending: true })

      if (!error && data && data.length > 0) {
        rows = data.map(r => {
          let ts = r.timestamp
          try { const d = new Date(r.timestamp); if (!isNaN(d.getTime())) ts = d.toISOString().replace('T', ' ').substring(0, 19) } catch {}
          return { timestamp: ts, action: r.action, details: r.details }
        })
      } else {
        // Fallback: try reading from legacy txt backup
        try {
          const cfg = readConfig()
          if (cfg.backupFolder) {
            const logFile = path.join(cfg.backupFolder, 'logs', `audit-${monthStr}.txt`)
            if (fs.existsSync(logFile)) {
              const pattern = /^\[(.*?)\] \[(.*?)\] (.*)$/
              for (const line of fs.readFileSync(logFile, 'utf-8').split('\n')) {
                const m = line.trim().match(pattern)
                if (m) rows.push({ timestamp: m[1], action: m[2], details: m[3] })
              }
            }
          }
        } catch {}
      }

      const csvLines = ['Timestamp,Action,Details']
      for (const r of rows) {
        const esc = (s: string) => `"${(s || '').replace(/"/g, '""')}"`
        csvLines.push(`${esc(r.timestamp)},${esc(r.action)},${esc(r.details)}`)
      }

      fs.writeFileSync(saveRes.filePath, csvLines.join('\r\n'), 'utf-8')
      return { ok: true, data: saveRes.filePath }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  // ── Export Item Sales Audit Log (CSV) ─────────────────────────────────────
  ipcMain.handle('export:itemLog', async (_e, monthStr: string): Promise<IpcResult<string | undefined>> => {
    try {
      const win = BrowserWindow.getFocusedWindow() || undefined
      const cfg = readConfig()
      const invDir = (cfg.inventoryFolder && fs.existsSync(cfg.inventoryFolder)) ? cfg.inventoryFolder : undefined
      const saveRes = await dialog.showSaveDialog(win as any, {
        title: 'Export Item Sales Audit Log',
        defaultPath: invDir ? path.join(invDir, `item-audit-${monthStr}.csv`) : `item-audit-${monthStr}.csv`,
        filters: [
          { name: 'CSV Files (*.csv)', extensions: ['csv'] },
          { name: 'Text Files (*.txt)', extensions: ['txt'] }
        ]
      })
      if (saveRes.canceled || !saveRes.filePath) return { ok: true, data: undefined }

      const sb = await getSupabase()
      const startIso = `${monthStr}-01T00:00:00.000Z`
      const endIso   = monthEndIso(monthStr)

      let rows: { timestamp: string; action: string; details: string }[] = []

      const { data, error } = await sb
        .from('audit_logs')
        .select('action, details, timestamp')
        .eq('log_type', 'item')
        .gte('timestamp', startIso)
        .lte('timestamp', endIso)
        .order('timestamp', { ascending: true })

      if (!error && data && data.length > 0) {
        rows = data.map(r => {
          let ts = r.timestamp
          try { const d = new Date(r.timestamp); if (!isNaN(d.getTime())) ts = d.toISOString().replace('T', ' ').substring(0, 19) } catch {}
          return { timestamp: ts, action: r.action, details: r.details }
        })
      } else {
        try {
          const cfg = readConfig()
          if (cfg.backupFolder) {
            const logFile = path.join(cfg.backupFolder, 'logs', `item-audit-${monthStr}.txt`)
            if (fs.existsSync(logFile)) {
              const pattern = /^\[(.*?)\] \[(.*?)\] (.*)$/
              for (const line of fs.readFileSync(logFile, 'utf-8').split('\n')) {
                const m = line.trim().match(pattern)
                if (m) rows.push({ timestamp: m[1], action: m[2], details: m[3] })
              }
            }
          }
        } catch {}
      }

      const csvLines = ['Timestamp,Action,Details']
      for (const r of rows) {
        const esc = (s: string) => `"${(s || '').replace(/"/g, '""')}"`
        csvLines.push(`${esc(r.timestamp)},${esc(r.action)},${esc(r.details)}`)
      }

      fs.writeFileSync(saveRes.filePath, csvLines.join('\r\n'), 'utf-8')
      return { ok: true, data: saveRes.filePath }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  // ── Export Folder (recursive copy to user-chosen destination) ─────────────
  ipcMain.handle('export:folder', async (_e, srcPath: string): Promise<IpcResult<{ destPath: string; filesCopied: number }>> => {
    try {
      if (!srcPath || !fs.existsSync(srcPath)) {
        return { ok: false, error: 'Source folder does not exist.' }
      }
      const win = BrowserWindow.getFocusedWindow() || undefined
      const folderRes = await dialog.showOpenDialog(win as any, {
        title: 'Choose Destination Folder',
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: 'Export Here'
      })
      if (folderRes.canceled || !folderRes.filePaths[0]) return { ok: true, data: { destPath: '', filesCopied: 0 } }

      const destPath = folderRes.filePaths[0]
      if (destPath === srcPath) return { ok: false, error: 'Source and destination cannot be the same folder.' }

      let filesCopied = 0

      function copyRecursive(src: string, dest: string): void {
        if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })
        for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
          if (entry.name.startsWith('~$') || entry.name.endsWith('.tmp')) continue
          const srcEntry = path.join(src, entry.name)
          const destEntry = path.join(dest, entry.name)
          if (entry.isDirectory()) {
            copyRecursive(srcEntry, destEntry)
          } else {
            try {
              fs.copyFileSync(srcEntry, destEntry)
              filesCopied++
            } catch {}
          }
        }
      }

      copyRecursive(srcPath, destPath)
      return { ok: true, data: { destPath, filesCopied } }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  // ── Bulk Year Export ──────────────────────────────────────────────────────
  // Generates all 12 Daily Log + 12 Item Sales workbooks for a given year,
  // saving them directly into a user-chosen folder (no per-file save dialogs).
  ipcMain.handle('export:bulkYear', async (_e, year: number, type: 'dailylog' | 'sales' | 'both' = 'both'): Promise<IpcResult<{ folder: string; filesWritten: number }>> => {
    try {
      const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0] || undefined
      const cfg = readConfig()
      const sb = await getSupabase()

      // 1. Let user pick destination folder (default to saved directory)
      const savedDefault = type === 'sales'
        ? ((cfg.inventoryFolder && fs.existsSync(cfg.inventoryFolder)) ? cfg.inventoryFolder : undefined)
        : ((cfg.saveFolder && fs.existsSync(cfg.saveFolder)) ? cfg.saveFolder : undefined)
      const folderRes = await dialog.showOpenDialog(win as any, {
        title: `Choose destination folder for ${year} exports`,
        defaultPath: savedDefault,
        properties: ['openDirectory', 'createDirectory'],
        buttonLabel: `Export ${year} Here`
      })
      if (folderRes.canceled || folderRes.filePaths.length === 0) {
        return { ok: true, data: { folder: '', filesWritten: 0 } }
      }
      const destFolder = folderRes.filePaths[0]

      const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
      let filesWritten = 0

      // 2. Loop through each month
      for (let monthNum = 1; monthNum <= 12; monthNum++) {
        const mon = MONTHS[monthNum - 1]
        const monthPadded = String(monthNum).padStart(2, '0')
        const daysInMonth = new Date(year, monthNum, 0).getDate()
        const startDate = `${year}-${monthPadded}-01`
        const endDate = `${year}-${monthPadded}-${String(daysInMonth).padStart(2, '0')}`

        // ── A. Daily Refill Log ─────────────────────────────────────────────
        if (type === 'dailylog' || type === 'both') {
          const { wb, hasData } = await buildDailyLogWorkbook(year, monthNum, cfg)
          if (hasData) {
            const dailyLogDestPath = path.join(destFolder, `${monthPadded}. DAILY LOG (${mon})-${year}.xlsx`)
            if (!fs.existsSync(destFolder)) fs.mkdirSync(destFolder, { recursive: true })
            await wb.xlsx.writeFile(dailyLogDestPath)
            filesWritten++
          }
        }

        // ── B. Item Sales Report ───────────────────────────────────────────
        if (type === 'sales' || type === 'both') {
          let salesData: any[] = []
          if (!isOnline()) {
            const db = getLocalDb()
            const raw = db.prepare('SELECT date, quantity, unit_price_at_sale, discount, remarks, item_name, item_code, category_name FROM item_sales_cache WHERE date >= ? AND date <= ? ORDER BY date ASC').all(startDate, endDate)
            salesData = raw.map((r: any) => ({
              date: r.date,
              quantity: r.quantity,
              unit_price_at_sale: r.unit_price_at_sale,
              discount: r.discount,
              remarks: r.remarks,
              items: {
                name: r.item_name,
                code: r.item_code,
                categories: { name: r.category_name }
              }
            }))
          } else {
            const { data } = await sb
            .from('item_sales')
            .select(`id, quantity, unit_price_at_sale, discount, date, remarks, items(name, code, srp, categories(name))`)
            .gte('date', startDate).lte('date', endDate)
            .order('date', { ascending: true }).order('created_at', { ascending: true })
            salesData = data || []
          }


        if (salesData && salesData.length > 0) {
          const salesWb = new ExcelJS.Workbook()
          salesWb.creator = 'A&G Water Refill App'
          salesWb.created = new Date()

          const salesWs = salesWb.addWorksheet(`${mon} ${year} ITEM SALES`, {
            properties: { tabColor: { argb: 'FF6366F1' } }
          })
          salesWs.views = [{ state: 'frozen', ySplit: 2 }]
          salesWs.getColumn(1).width = 5
          salesWs.getColumn(2).width = 30
          salesWs.getColumn(3).width = 18
          salesWs.getColumn(4).width = 12
          salesWs.getColumn(5).width = 12
          salesWs.getColumn(6).width = 12
          salesWs.getColumn(7).width = 14
          salesWs.getColumn(8).width = 14
          salesWs.getColumn(9).width = 20
          salesWs.getColumn(10).width = 14

          salesWs.mergeCells('A1:J1')
          salesWs.getCell('A1').value = `A&G WATER REFILL — Item Sales Report — ${mon} ${year}`
          salesWs.getCell('A1').font = { bold: true, size: 13, color: { argb: 'FFFFFFFF' } }
          salesWs.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }
          salesWs.getCell('A1').alignment = { vertical: 'middle', horizontal: 'center' }
          salesWs.getRow(1).height = 26

          const salesHdr = salesWs.getRow(2)
          salesHdr.height = 22
          const salesCols = ['#', 'Item Name', 'Category', 'Code', 'Qty', 'Unit Price', 'Amount', 'Discount', 'Remarks', 'Date']
          salesCols.forEach((h, ci) => {
            const cell = salesHdr.getCell(ci + 1)
            cell.value = h
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 }
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }
            cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }
            cell.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }
          })

          salesData.forEach((row: any, idx: number) => {
            const ri = idx + 3
            const itemObj = row.items || {}
            const price = Number(row.unit_price_at_sale) || Number(itemObj.srp) || 0
            const qty = Number(row.quantity) || 0
            const discount = Number(row.discount) || 0
            const salesAmount = price * qty
            const salesRow = salesWs.getRow(ri)
            salesRow.height = 17
            salesRow.getCell(1).value = idx + 1
            salesRow.getCell(2).value = itemObj.name || ''
            salesRow.getCell(3).value = (itemObj.categories as any)?.name || ''
            salesRow.getCell(4).value = itemObj.code || ''
            salesRow.getCell(5).value = qty
            salesRow.getCell(6).value = price
            salesRow.getCell(6).numFmt = '₱#,##0.00'
            salesRow.getCell(7).value = salesAmount
            salesRow.getCell(7).numFmt = '₱#,##0.00'
            salesRow.getCell(8).value = discount
            salesRow.getCell(8).numFmt = '₱#,##0.00'
            salesRow.getCell(9).value = row.remarks || ''
            salesRow.getCell(10).value = row.date
            const isEven = ri % 2 === 0
            for (let c = 1; c <= 10; c++) {
              salesRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isEven ? 'FFF5F3FF' : 'FFFFFFFF' } }
              salesRow.getCell(c).border = { top: { style: 'hair' }, bottom: { style: 'hair' }, left: { style: 'thin' }, right: { style: 'thin' } }
            }
          })

          const totRi = salesData.length + 3
          const totRow = salesWs.getRow(totRi)
          totRow.height = 22
          salesWs.mergeCells(`A${totRi}:D${totRi}`)
          totRow.getCell(1).value = 'MONTHLY TOTALS'
          totRow.getCell(1).font = { bold: true }
          totRow.getCell(1).alignment = { horizontal: 'right' }
          totRow.getCell(5).value = { formula: `SUM(E3:E${totRi - 1})` } as any
          totRow.getCell(5).font = { bold: true }
          totRow.getCell(7).value = { formula: `SUM(G3:G${totRi - 1})` } as any
          totRow.getCell(7).numFmt = '₱#,##0.00'
          totRow.getCell(7).font = { bold: true, color: { argb: 'FF1E6600' } }
          totRow.getCell(8).value = { formula: `SUM(H3:H${totRi - 1})` } as any
          totRow.getCell(8).numFmt = '₱#,##0.00'
          totRow.getCell(8).font = { bold: true, color: { argb: 'FFCC0000' } }

          const salesDestPath = path.join(destFolder, `ITEM SALES (${mon})-${year}.xlsx`)
          await salesWb.xlsx.writeFile(salesDestPath)
          filesWritten++
        } // if salesData.length > 0
        } // end if type === sales
      } // end for monthNum

      return { ok: true, data: { folder: destFolder, filesWritten } }
    } catch (e: unknown) {
      console.error('[export:bulkYear]', e)
      return { ok: false, error: String(e) }
    }
  })
}

