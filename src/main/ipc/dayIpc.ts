import { ipcMain } from 'electron'
import { randomUUID } from 'crypto'
import type { SaleRow, IpcResult, DayTarget, ExpenseEntry } from '../../shared/types'
import { getSupabase } from '../supabase/client'
import { isOnline } from '../store/syncEngine'
import { invalidateHistoryCache } from './historyIpc'
import {
  enqueueWrite,
  cacheRefillSales,
  deleteRefillSalesByDate,
  getCachedRefillSalesByDate,
  cacheDailyExpenses,
  deleteDailyExpensesByDate,
  getCachedExpensesByDate,
  getCachedContainerTypes,
  getCachedWaterTypes,
} from '../store/localDb'

export function registerDayIpc(): void {
  ipcMain.handle('loadDay', async (_event, date: string): Promise<IpcResult<SaleRow[]>> => {
    try {
      // ── Online: fetch from Supabase and refresh cache ──────────────────────
      if (isOnline()) {
        const sb = await getSupabase()
        const { data, error } = await sb
          .from('refill_sales')
          .select('id, sn, container_type_id, container_type_raw, water_type_id, water_type_raw, quantity, mode, unit_price, total, source_file, source_sheet')
          .eq('date', date)
          .order('sn', { ascending: true })

        if (!error && data) {
          // Update local cache
          deleteRefillSalesByDate(date)
          if (data.length > 0) {
            cacheRefillSales(data.map(r => ({ ...r, date })))
          }
        }

        if (error) {
          console.warn('[loadDay] Supabase error, falling back to cache:', error.message)
          return loadDayFromCache(date)
        }

        const rows: SaleRow[] = (data || []).map((r, idx) => ({
          sn: r.sn || idx + 1,
          container: r.container_type_raw || '',
          water: r.water_type_raw || '',
          qty: Number(r.quantity) || 0,
          mode: (r.mode === 'deliver' ? 'DELIVER' : 'PICKUP') as 'PICKUP' | 'DELIVER',
          price: Number(r.unit_price) || 0
        }))
        return { ok: true, data: rows }
      }

      // ── Offline: read from local cache ─────────────────────────────────────
      return loadDayFromCache(date)
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle('day:loadExpenses', async (_event, date: string): Promise<IpcResult<ExpenseEntry[]>> => {
    try {
      if (isOnline()) {
        const sb = await getSupabase()
        const { data, error } = await sb
          .from('daily_expenses')
          .select('id, sn, description, total, remarks, source_file, source_sheet')
          .eq('date', date)
          .order('sn', { ascending: true })

        if (!error && data) {
          deleteDailyExpensesByDate(date)
          if (data.length > 0) {
            cacheDailyExpenses(data.map(r => ({ ...r, date })))
          }
        }

        if (error) {
          console.warn('[day:loadExpenses] Supabase error, falling back to cache:', error.message)
          return loadExpensesFromCache(date)
        }

        const expenses: ExpenseEntry[] = (data || []).map(e => ({
          desc: e.description || '',
          amount: Number(e.total) || 0,
          remarks: e.remarks || ''
        }))
        return { ok: true, data: expenses }
      }

      return loadExpensesFromCache(date)
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle('day:saveExpenses', async (_event, date: string, expenses: ExpenseEntry[]): Promise<IpcResult<void>> => {
    try {
      const d = new Date(date + 'T00:00:00')
      const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
      const mon = MONTHS[d.getMonth()]
      const year = d.getFullYear()
      const day = String(d.getDate()).padStart(2, '0')
      const monthNum = String(d.getMonth() + 1).padStart(2, '0')
      const sourceFile = `${monthNum}. DAILY LOG (${mon})-${year}.xlsx`
      const sourceSheet = `${mon}${day}`

      // Always update local cache immediately
      deleteDailyExpensesByDate(date)
      const expenseRows = expenses.map((exp, idx) => ({
        id: randomUUID(),
        date,
        sn: idx + 1,
        description: exp.desc || null,
        total: Number(exp.amount) || 0,
        remarks: exp.remarks || null,
        source_file: sourceFile,
        source_sheet: sourceSheet
      }))
      if (expenseRows.length > 0) {
        cacheDailyExpenses(expenseRows)
      }

      if (isOnline()) {
        const sb = await getSupabase()
        if (expenses.length > 0) {
          const rows = expenseRows.map(({ id: _id, ...r }) => r) // exclude local uuid
          const { data: insertedExp, error: expErr } = await sb.from('daily_expenses').insert(rows).select('id')
          if (expErr) return { ok: false, error: expErr.message }
          if (insertedExp && insertedExp.length > 0) {
            const newExpIds = insertedExp.map((r: any) => r.id)
            await sb.from('daily_expenses').delete().eq('date', date).not('id', 'in', `(${newExpIds.join(',')})`)
          }
        } else {
          await sb.from('daily_expenses').delete().eq('date', date)
        }
      } else {
        // Queue: delete-then-insert pattern for date
        enqueueWrite('daily_expenses', 'delete', { _deleteByDate: date })
        for (const row of expenseRows) {
          const { id: _id, ...r } = row
          enqueueWrite('daily_expenses', 'insert', r)
        }
      }

      invalidateHistoryCache()
      return { ok: true, data: undefined }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle('saveDay', async (_event, date: string, rows: SaleRow[], expenses: ExpenseEntry[] = []): Promise<IpcResult<DayTarget>> => {
    try {
      const d = new Date(date + 'T00:00:00')
      const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
      const mon = MONTHS[d.getMonth()]
      const year = d.getFullYear()
      const day = String(d.getDate()).padStart(2, '0')
      const monthNum = String(d.getMonth() + 1).padStart(2, '0')
      const sourceFile = `${monthNum}. DAILY LOG (${mon})-${year}.xlsx`
      const sourceSheet = `${mon}${day}`

      let result: IpcResult<DayTarget>
      if (isOnline()) {
        result = await saveDayOnline(date, rows, expenses, sourceFile, sourceSheet, mon, day)
      } else {
        result = saveDayOffline(date, rows, expenses, sourceFile, sourceSheet, mon, day)
      }

      // Invalidate history cache so the history list reflects the new save
      if (result.ok) invalidateHistoryCache()
      return result
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return { ok: false, error: msg }
    }
  })

  ipcMain.handle('day:markClosed', async (_event, date: string, _reason: string): Promise<IpcResult<DayTarget>> => {
    const d = new Date(date + 'T00:00:00')
    const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
    const mon = MONTHS[d.getMonth()]
    const day = String(d.getDate()).padStart(2, '0')
    return { ok: true, data: { filePath: `supabase://${date}`, sheetName: `${mon}${day}` } }
  })

  ipcMain.handle('day:getStatus', async (_event, _date: string): Promise<IpcResult<{ isClosed: boolean; reason: string }>> => {
    return { ok: true, data: { isClosed: false, reason: '' } }
  })

  ipcMain.handle('day:unmarkClosed', async (_event, date: string): Promise<IpcResult<DayTarget>> => {
    const d = new Date(date + 'T00:00:00')
    const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
    const mon = MONTHS[d.getMonth()]
    const day = String(d.getDate()).padStart(2, '0')
    return { ok: true, data: { filePath: `supabase://${date}`, sheetName: `${mon}${day}` } }
  })
}

// ── Cache read helpers ────────────────────────────────────────────────────────

function loadDayFromCache(date: string): IpcResult<SaleRow[]> {
  const cached = getCachedRefillSalesByDate(date)
  const rows: SaleRow[] = cached.map((r, idx) => ({
    sn: (r.sn as number) || idx + 1,
    container: (r.container_type_raw as string) || '',
    water: (r.water_type_raw as string) || '',
    qty: Number(r.quantity) || 0,
    mode: (r.mode === 'deliver' ? 'DELIVER' : 'PICKUP') as 'PICKUP' | 'DELIVER',
    price: Number(r.unit_price) || 0
  }))
  return { ok: true, data: rows }
}

function loadExpensesFromCache(date: string): IpcResult<ExpenseEntry[]> {
  const cached = getCachedExpensesByDate(date)
  const expenses: ExpenseEntry[] = cached.map(e => ({
    desc: (e.description as string) || '',
    amount: Number(e.total) || 0,
    remarks: (e.remarks as string) || ''
  }))
  return { ok: true, data: expenses }
}

// ── Online save (atomic: insert-first, then delete-old) ───────────────────────
// Classic delete-then-insert risks data loss if a crash occurs between the two
// operations. Instead we insert the new rows first, verify success, then clean up
// any previous rows for this date (identified by a different source_sheet or sn
// mismatch).  Because refill_sales has no UNIQUE constraint on (date, sn) we
// can safely have two sets of rows momentarily before pruning the old ones.

async function saveDayOnline(
  date: string, rows: SaleRow[], expenses: ExpenseEntry[],
  sourceFile: string, sourceSheet: string, mon: string, _day: string
): Promise<IpcResult<DayTarget>> {
  const sb = await getSupabase()

  // Resolve container & water type IDs (online from Supabase, fallback to cache)
  let containerMap = new Map<string, string>()
  let waterMap = new Map<string, string>()

  const { data: containers } = await sb.from('refill_container_types').select('id, raw_name')
  const { data: waterTypes } = await sb.from('refill_water_types').select('id, name')

  if (containers) for (const c of containers) containerMap.set(c.raw_name.toUpperCase(), c.id)
  if (waterTypes) for (const w of waterTypes) waterMap.set(w.name.toUpperCase(), w.id)

  // ── SALES: insert-first approach ─────────────────────────────────────────────
  if (rows.length > 0) {
    // Auto-create missing container types
    for (const row of rows) {
      if (!containerMap.has(row.container.toUpperCase())) {
        const { data: newC } = await sb.from('refill_container_types').insert({ raw_name: row.container }).select('id').single()
        if (newC) containerMap.set(row.container.toUpperCase(), newC.id)
      }
    }

    const salesRows = rows.map((row, idx) => ({
      date,
      sn: idx + 1,
      container_type_id: containerMap.get(row.container.toUpperCase()) || null,
      container_type_raw: row.container,
      water_type_id: row.water ? (waterMap.get(row.water.toUpperCase()) || null) : null,
      water_type_raw: row.water || null,
      quantity: row.qty,
      mode: row.mode === 'DELIVER' ? 'deliver' : 'pickup',
      unit_price: row.price > 0 ? row.price : null,
      total: row.qty * row.price,
      likely_miscategorized: false,
      source_file: sourceFile,
      source_sheet: sourceSheet
    }))

    // Step 1: INSERT new rows first (fails fast — previous data still intact)
    const { data: insertedSales, error: insertErr } = await sb.from('refill_sales').insert(salesRows).select('id')
    if (insertErr) return { ok: false, error: `Failed to save sales: ${insertErr.message}` }

    // Step 2: DELETE previous rows for this date that are not part of the new insert
    if (insertedSales && insertedSales.length > 0) {
      const newIds = insertedSales.map(r => r.id)
      await sb.from('refill_sales')
        .delete()
        .eq('date', date)
        .not('id', 'in', `(${newIds.join(',')})`)
    }

    // Refresh local cache with what was inserted
    deleteRefillSalesByDate(date)
    const { data: saved } = await sb.from('refill_sales')
      .select('id, date, sn, container_type_id, container_type_raw, water_type_id, water_type_raw, quantity, mode, unit_price, total, source_file, source_sheet')
      .eq('date', date)
    if (saved) cacheRefillSales(saved.map(r => ({ ...r })))
  } else {
    // No rows — safe to delete all for this date
    await sb.from('refill_sales').delete().eq('date', date)
    deleteRefillSalesByDate(date)
  }

  // ── EXPENSES: insert-first approach ──────────────────────────────────────────
  if (expenses.length > 0) {
    const expRows = expenses.map((exp, idx) => ({
      date,
      sn: idx + 1,
      description: exp.desc || null,
      total: Number(exp.amount) || 0,
      remarks: exp.remarks || null,
      source_file: sourceFile,
      source_sheet: sourceSheet
    }))

    // Insert new expenses first
    const { data: insertedExpenses, error: expErr } = await sb.from('daily_expenses').insert(expRows).select('id')
    if (expErr) return { ok: false, error: expErr.message }

    // Delete previous expenses for this date not part of the new insert
    if (insertedExpenses && insertedExpenses.length > 0) {
      const newExpIds = insertedExpenses.map(r => r.id)
      await sb.from('daily_expenses')
        .delete()
        .eq('date', date)
        .not('id', 'in', `(${newExpIds.join(',')})`)
    }

    // Cache expenses
    deleteDailyExpensesByDate(date)
    cacheDailyExpenses(expRows.map(r => ({ id: randomUUID(), ...r })))
  } else {
    await sb.from('daily_expenses').delete().eq('date', date)
    deleteDailyExpensesByDate(date)
  }

  return { ok: true, data: { filePath: `supabase://${date}`, sheetName: sourceSheet } }
}

// ── Offline save ──────────────────────────────────────────────────────────────

function saveDayOffline(
  date: string, rows: SaleRow[], expenses: ExpenseEntry[],
  sourceFile: string, sourceSheet: string, mon: string, _day: string
): IpcResult<DayTarget> {
  // Resolve container/water IDs from local cache
  const cachedContainers = getCachedContainerTypes()
  const cachedWater = getCachedWaterTypes()
  const containerMap = new Map<string, string>()
  const waterMap = new Map<string, string>()
  for (const c of cachedContainers) containerMap.set(String(c.raw_name).toUpperCase(), c.id as string)
  for (const w of cachedWater) waterMap.set(String(w.name).toUpperCase(), w.id as string)

  // Update local cache immediately
  deleteRefillSalesByDate(date)

  if (rows.length > 0) {
    const salesRows = rows.map((row, idx) => ({
      id: randomUUID(),
      date,
      sn: idx + 1,
      container_type_id: containerMap.get(row.container.toUpperCase()) || null,
      container_type_raw: row.container,
      water_type_id: row.water ? (waterMap.get(row.water.toUpperCase()) || null) : null,
      water_type_raw: row.water || null,
      quantity: row.qty,
      mode: row.mode === 'DELIVER' ? 'deliver' : 'pickup',
      unit_price: row.price > 0 ? row.price : null,
      total: row.qty * row.price,
      source_file: sourceFile,
      source_sheet: sourceSheet
    }))
    cacheRefillSales(salesRows)

    // Queue delete + insert for Supabase when back online
    enqueueWrite('refill_sales', 'delete', { _deleteByDate: date })
    for (const sr of salesRows) {
      const { id: _id, ...payload } = sr
      enqueueWrite('refill_sales', 'insert', payload)
    }
  } else {
    enqueueWrite('refill_sales', 'delete', { _deleteByDate: date })
  }

  // Expenses
  deleteDailyExpensesByDate(date)
  if (expenses.length > 0) {
    const expRows = expenses.map((exp, idx) => ({
      id: randomUUID(),
      date,
      sn: idx + 1,
      description: exp.desc || null,
      total: Number(exp.amount) || 0,
      remarks: exp.remarks || null,
      source_file: sourceFile,
      source_sheet: sourceSheet
    }))
    cacheDailyExpenses(expRows)
    enqueueWrite('daily_expenses', 'delete', { _deleteByDate: date })
    for (const er of expRows) {
      const { id: _id, ...payload } = er
      enqueueWrite('daily_expenses', 'insert', payload)
    }
  }

  return { ok: true, data: { filePath: `local://${date}`, sheetName: sourceSheet } }
}
