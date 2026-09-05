import { ipcMain } from 'electron'
import type { IpcResult, HistoryDay, SaleRow, SaleMode } from '../../shared/types'
import { getSupabase } from '../supabase/client'
import { isOnline } from '../store/syncEngine'
import { getCachedHistoryDays, getCachedRefillSalesByDate } from '../store/localDb'

const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']

// ── In-memory cache ──────────────────────────────────────────────────────────
let _historyCache: HistoryDay[] | null = null

/** Call this after any write operation to force a fresh scan next time */
export function invalidateHistoryCache(): void {
  _historyCache = null
}

export function registerHistoryIpc(): void {
  /** List all saved days from Supabase or local cache */
  ipcMain.handle('history:listDays', async (): Promise<IpcResult<HistoryDay[]>> => {
    try {
      // ── Stale-while-revalidate strategy ─────────────────────────────────────
      // If we have a cache hit, return it immediately for speed.
      // When online, kick off a background refresh so the next call is fresh.
      if (_historyCache !== null) {
        if (isOnline()) {
          // Background refresh — do not await
          refreshHistoryCacheFromSupabase().catch(e =>
            console.warn('[history:listDays] Background refresh error:', e)
          )
        }
        return { ok: true, data: _historyCache }
      }

      // ── No cache: load from Supabase or fall back ──────────────────────────
      if (isOnline()) {
        return await refreshHistoryCacheFromSupabase()
      }
      return buildHistoryFromCache()
    } catch (e: unknown) {
      console.warn('[history:listDays] Error, falling back to local cache:', String(e))
      return buildHistoryFromCache()
    }
  })

  /** Load full SaleRow[] for a given date */
  ipcMain.handle('history:loadDay', async (_event, date: string): Promise<IpcResult<SaleRow[]>> => {
    try {
      const sb = await getSupabase()
      const { data, error } = await sb
        .from('refill_sales')
        .select('sn, container_type_raw, water_type_raw, quantity, mode, unit_price')
        .eq('date', date)
        .order('sn', { ascending: true })

      if (error) return { ok: false, error: error.message }

      const rows: SaleRow[] = (data || []).map((r, idx) => {
        let mode: SaleMode = 'PICKUP'
        if (r.mode === 'deliver') mode = 'DELIVER'

        return {
          sn: r.sn || idx + 1,
          container: r.container_type_raw || '',
          water: r.water_type_raw || '',
          qty: Number(r.quantity) || 0,
          mode,
          price: Number(r.unit_price) || 0
        }
      })

      return { ok: true, data: rows }
    } catch (e: unknown) {
      // ── Offline fallback ────────────────────────────────────────────────
      console.warn('[history:loadDay] Offline fallback:', String(e))
      const cached = getCachedRefillSalesByDate(date)
      const rows: SaleRow[] = cached.map((r, idx) => ({
        sn: (r.sn as number) || idx + 1,
        container: (r.container_type_raw as string) || '',
        water: (r.water_type_raw as string) || '',
        qty: Number(r.quantity) || 0,
        mode: r.mode === 'deliver' ? 'DELIVER' : 'PICKUP' as SaleMode,
        price: Number(r.unit_price) || 0
      }))
      return { ok: true, data: rows }
    }
  })
}

// ── Supabase fetch + aggregate ─────────────────────────────────────────────────
async function refreshHistoryCacheFromSupabase(): Promise<IpcResult<HistoryDay[]>> {
  const sb = await getSupabase()
  const pageSize = 1000

  // 1. Sales (paginated)
  let salesData: any[] = []
  let page = 0
  while (true) {
    const { data: chunk, error } = await sb
      .from('refill_sales')
      .select('date, quantity, unit_price, total')
      .range(page * pageSize, (page + 1) * pageSize - 1)
    if (error) return { ok: false, error: error.message }
    if (!chunk || chunk.length === 0) break
    salesData = salesData.concat(chunk)
    if (chunk.length < pageSize) break
    page++
  }

  // 2. Expenses (paginated)
  let expData: any[] = []
  let expPage = 0
  while (true) {
    const { data: chunk, error } = await sb
      .from('daily_expenses')
      .select('date, description, total, remarks')
      .range(expPage * pageSize, (expPage + 1) * pageSize - 1)
    if (error) return { ok: false, error: error.message }
    if (!chunk || chunk.length === 0) break
    expData = expData.concat(chunk)
    if (chunk.length < pageSize) break
    expPage++
  }

  // Aggregate sales by date
  const salesByDate = new Map<string, { rowCount: number; totalAmount: number }>()
  for (const row of salesData) {
    const existing = salesByDate.get(row.date) || { rowCount: 0, totalAmount: 0 }
    existing.rowCount++
    existing.totalAmount += Number(row.total) || (Number(row.quantity) * Number(row.unit_price || 0))
    salesByDate.set(row.date, existing)
  }

  // Aggregate expenses by date
  const expByDate = new Map<string, { totalExpenses: number; expenses: { desc: string; amount: number; remarks: string }[] }>()
  for (const row of expData) {
    const existing = expByDate.get(row.date) || { totalExpenses: 0, expenses: [] }
    const amt = Number(row.total) || 0
    existing.totalExpenses += amt
    existing.expenses.push({ desc: row.description || '', amount: amt, remarks: row.remarks || '' })
    expByDate.set(row.date, existing)
  }

  const allDates = new Set([...salesByDate.keys(), ...expByDate.keys()])
  const days: HistoryDay[] = []

  for (const date of allDates) {
    const s = salesByDate.get(date) || { rowCount: 0, totalAmount: 0 }
    const e = expByDate.get(date) || { totalExpenses: 0, expenses: [] }
    const d = new Date(date + 'T00:00:00')
    const mon = MONTHS[d.getMonth()]
    const day = String(d.getDate()).padStart(2, '0')
    days.push({
      date,
      sheetName: `${mon}${day}`,
      rowCount: s.rowCount,
      totalAmount: s.totalAmount,
      totalExpenses: e.totalExpenses,
      netProfit: s.totalAmount - e.totalExpenses,
      expenses: e.expenses,
      filePath: `supabase://${date}`,
      isRed: d.getDay() === 0
    })
  }

  days.sort((a, b) => b.date.localeCompare(a.date))
  _historyCache = days
  return { ok: true, data: days }
}

// ── Build history from local cache ───────────────────────────────────────────
function buildHistoryFromCache(): IpcResult<HistoryDay[]> {
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']
  try {
    const days = getCachedHistoryDays()
    const result: HistoryDay[] = days.map(d => {
      const dObj = new Date(d.date + 'T00:00:00')
      const mon = MONTHS[dObj.getMonth()]
      const dayPad = String(dObj.getDate()).padStart(2, '0')
      return {
        date: d.date,
        sheetName: `${mon}${dayPad}`,
        rowCount: d.rowCount,
        totalAmount: d.totalAmount,
        totalExpenses: d.totalExpenses,
        netProfit: d.totalAmount - d.totalExpenses,
        expenses: [],
        filePath: `local://${d.date}`,
        isRed: dObj.getDay() === 0
      }
    })
    _historyCache = result
    return { ok: true, data: result }
  } catch (e: unknown) {
    return { ok: false, error: 'Offline and no local cache available: ' + String(e) }
  }
}
