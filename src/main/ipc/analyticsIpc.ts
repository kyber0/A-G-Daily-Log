import { ipcMain } from 'electron'
import type { IpcResult } from '../../shared/types'
import { getSupabase } from '../supabase/client'
import { isOnline } from '../store/syncEngine'
import { getLocalDb } from '../store/localDb'

export interface ExecutiveAnalyticsData {
  period: {
    year: number
    month: number // 0 = all year
    label: string
  }
  kpis: {
    totalRevenue: number
    waterRevenue: number
    itemRevenue: number
    totalExpenses: number
    restockSpend: number
    netProfit: number
    profitMargin: number
    totalContainersRefilled: number
    totalItemsSold: number
    totalDaysActive: number
    avgDailyRevenue: number
    bestDay: { date: string; revenue: number } | null
  }
  trends: {
    date: string
    waterRevenue: number
    itemRevenue: number
    expenses: number
    netProfit: number
    containers: number
  }[]
  waterTypeBreakdown: { type: string; volume: number; revenue: number; percentage: number }[]
  modeBreakdown: { mode: string; count: number; volume: number; revenue: number }[]
  topItems: { name: string; category: string; qty: number; revenue: number }[]
  topExpenses: { description: string; count: number; total: number }[]
  inventoryStats: {
    totalSkus: number
    totalInventoryValueCost: number
    totalInventoryValueSrp: number
    lowStockCount: number
    outOfStockCount: number
  }
}

export function registerAnalyticsIpc(): void {
  ipcMain.handle('analytics:getExecutive', async (_event, year: number, month: number): Promise<IpcResult<ExecutiveAnalyticsData>> => {
    try {
      // Calculate date filters (year 0 = All Time — no date filter)
      const allTime = year === 0
      let startDate = ''
      let endDate = ''
      let periodLabel = 'All Time (Lifetime)'

      if (!allTime) {
        startDate = `${year}-01-01`
        endDate = `${year}-12-31`
        periodLabel = `${year} (Full Year)`

        if (month > 0) {
          const mStr = String(month).padStart(2, '0')
          const lastDay = new Date(year, month, 0).getDate()
          startDate = `${year}-${mStr}-01`
          endDate = `${year}-${mStr}-${String(lastDay).padStart(2, '0')}`
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
          periodLabel = `${monthNames[month - 1]} ${year}`
        }
      }

      let refillData: any[] = []
      let expenseData: any[] = []
      let itemSalesData: any[] = []
      let restockData: any[] = []
      let allItems: any[] = []
      let allMovements: any[] = []

      if (!isOnline()) {
        // ── Offline: load from local SQLite cache ────────────────────────────
        const db = getLocalDb()
        const dateClause = allTime ? '' : 'WHERE date >= ? AND date <= ?'
        const dateParams = allTime ? [] : [startDate, endDate]

        refillData = db.prepare(`SELECT date, quantity, unit_price, total, water_type_raw, mode FROM refill_sales_cache ${dateClause}`).all(...dateParams)
        expenseData = db.prepare(`SELECT date, description, total, remarks FROM daily_expenses_cache ${dateClause}`).all(...dateParams)

        const rawItemSales: any[] = db.prepare(`SELECT date, quantity, unit_price_at_sale, discount, item_name, category_name FROM item_sales_cache ${dateClause}`).all(...dateParams)
        itemSalesData = rawItemSales.map(r => ({
          date: r.date,
          quantity: r.quantity,
          unit_price_at_sale: r.unit_price_at_sale,
          discount: r.discount,
          items: {
            name: r.item_name,
            categories: { name: r.category_name }
          }
        }))

        const roDateClause = allTime ? '' : 'WHERE order_date >= ? AND order_date <= ?'
        restockData = db.prepare(`SELECT order_date, amount, trucking_fee FROM restock_orders_cache ${roDateClause}`).all(...dateParams)

        allItems = db.prepare(`SELECT id, name, dealer_price, srp, low_stock_threshold FROM items_cache`).all()
        allMovements = db.prepare(`SELECT item_id, direction, quantity FROM stock_movements_cache`).all()
      } else {
        // ── Online: load from Supabase ───────────────────────────────────────
        const sb = await getSupabase()

        function applyDateFilter(query: any): any {
          if (allTime) return query
          return query.gte('date', startDate).lte('date', endDate)
        }

        // 1. Fetch Refill Sales for period (with pagination)
        let rPage = 0
        const pageSize = 1000
        while (true) {
          let q = sb
            .from('refill_sales')
            .select('date, quantity, unit_price, total, water_type_raw, mode')
          q = applyDateFilter(q)
          const { data: chunk, error: refillErr } = await q.range(rPage * pageSize, (rPage + 1) * pageSize - 1)

          if (refillErr) throw new Error(refillErr.message)
          if (!chunk || chunk.length === 0) break
          refillData = refillData.concat(chunk)
          if (chunk.length < pageSize) break
          rPage++
        }

        // 2. Fetch Expenses for period
        let expQuery = sb.from('daily_expenses').select('date, description, total, remarks')
        if (!allTime) expQuery = expQuery.gte('date', startDate).lte('date', endDate)
        const { data: expResult, error: expErr } = await expQuery
        if (expErr) throw new Error(expErr.message)
        expenseData = expResult || []

        // 3. Fetch Item Sales for period
        let isPage = 0
        while (true) {
          let q = sb
            .from('item_sales')
            .select('date, quantity, unit_price_at_sale, discount, items(name, categories(name))')
          q = applyDateFilter(q)
          const { data: chunk, error: isErr } = await q.range(isPage * pageSize, (isPage + 1) * pageSize - 1)

          if (isErr) throw new Error(isErr.message)
          if (!chunk || chunk.length === 0) break
          itemSalesData = itemSalesData.concat(chunk)
          if (chunk.length < pageSize) break
          isPage++
        }

        // 4. Fetch Restock Orders for period
        let restockQuery = sb.from('restock_orders').select('order_date, amount, trucking_fee')
        if (!allTime) restockQuery = restockQuery.gte('order_date', startDate).lte('order_date', endDate)
        const { data: roResult } = await restockQuery
        restockData = roResult || []

        // 5. Fetch Inventory items & stock movements for inventory health
        const { data: itemsResult } = await sb.from('items').select('id, name, dealer_price, srp, low_stock_threshold')
        allItems = itemsResult || []

        let movPage = 0
        while (true) {
          const { data: chunk } = await sb
            .from('stock_movements')
            .select('item_id, direction, quantity')
            .range(movPage * pageSize, (movPage + 1) * pageSize - 1)
          if (!chunk || chunk.length === 0) break
          allMovements = allMovements.concat(chunk)
          if (chunk.length < pageSize) break
          movPage++
        }
      }


      // Process Refill Sales
      let waterRevenue = 0
      let totalContainers = 0
      const waterTypeMap = new Map<string, { volume: number; revenue: number }>()
      const modeMap = new Map<string, { count: number; volume: number; revenue: number }>()
      const dailyMap = new Map<string, { waterRevenue: number; itemRevenue: number; expenses: number; containers: number }>()

      for (const row of refillData || []) {
        const qty = Number(row.quantity) || 0
        const price = Number(row.unit_price) || 0
        const tot = Number(row.total) || (qty * price)
        waterRevenue += tot
        totalContainers += qty

        // Water type
        const wType = (row.water_type_raw || 'Purified').trim() || 'Purified'
        const wEntry = waterTypeMap.get(wType) || { volume: 0, revenue: 0 }
        wEntry.volume += qty
        wEntry.revenue += tot
        waterTypeMap.set(wType, wEntry)

        // Mode
        const mode = (row.mode || 'pickup').toUpperCase()
        const mEntry = modeMap.get(mode) || { count: 0, volume: 0, revenue: 0 }
        mEntry.count++
        mEntry.volume += qty
        mEntry.revenue += tot
        modeMap.set(mode, mEntry)

        // Daily
        const dEntry = dailyMap.get(row.date) || { waterRevenue: 0, itemRevenue: 0, expenses: 0, containers: 0 }
        dEntry.waterRevenue += tot
        dEntry.containers += qty
        dailyMap.set(row.date, dEntry)
      }

      // Process Item Sales
      let itemRevenue = 0
      let totalItemsSold = 0
      const itemAggMap = new Map<string, { name: string; category: string; qty: number; revenue: number }>()

      for (const is of itemSalesData || []) {
        const qty = Number(is.quantity) || 0
        const unitPrice = Number(is.unit_price_at_sale) || 0
        const discount = Number(is.discount) || 0
        const tot = (unitPrice * qty) - discount
        itemRevenue += tot
        totalItemsSold += qty

        const itmObj = (is.items as any) || {}
        const itmName = itmObj.name || 'Unknown Item'
        const catName = itmObj.categories?.name || 'CONTAINERS'

        const itmEntry = itemAggMap.get(itmName) || { name: itmName, category: catName, qty: 0, revenue: 0 }
        itmEntry.qty += qty
        itmEntry.revenue += tot
        itemAggMap.set(itmName, itmEntry)

        const dEntry = dailyMap.get(is.date) || { waterRevenue: 0, itemRevenue: 0, expenses: 0, containers: 0 }
        dEntry.itemRevenue += tot
        dailyMap.set(is.date, dEntry)
      }

      // Process Expenses
      let totalExpenses = 0
      const expAggMap = new Map<string, { count: number; total: number }>()

      for (const e of expenseData || []) {
        const amt = Number(e.total) || 0
        totalExpenses += amt
        const desc = (e.description || 'General Expense').trim()
        const expEntry = expAggMap.get(desc) || { count: 0, total: 0 }
        expEntry.count++
        expEntry.total += amt
        expAggMap.set(desc, expEntry)

        const dEntry = dailyMap.get(e.date) || { waterRevenue: 0, itemRevenue: 0, expenses: 0, containers: 0 }
        dEntry.expenses += amt
        dailyMap.set(e.date, dEntry)
      }

      // Process Restock Spend
      let restockSpend = 0
      for (const ro of restockData || []) {
        restockSpend += (Number(ro.amount) || 0) + (Number(ro.trucking_fee) || 0)
      }

      // Inventory valuation
      const movMap = new Map<string, { inQty: number; outQty: number }>()
      for (const m of allMovements || []) {
        if (!m.item_id) continue
        const entry = movMap.get(m.item_id) || { inQty: 0, outQty: 0 }
        if (m.direction === 'in') entry.inQty += Number(m.quantity) || 0
        else entry.outQty += Number(m.quantity) || 0
        movMap.set(m.item_id, entry)
      }

      let totalValCost = 0
      let totalValSrp = 0
      let lowStockCount = 0
      let outOfStockCount = 0

      for (const itm of allItems || []) {
        const mov = movMap.get(itm.id) || { inQty: 0, outQty: 0 }
        const bal = Math.max(0, mov.inQty - mov.outQty)
        const dp = Number(itm.dealer_price) || 0
        const srp = Number(itm.srp) || 0
        totalValCost += bal * dp
        totalValSrp += bal * srp

        if (bal <= 0) outOfStockCount++
        else if (itm.low_stock_threshold && bal <= itm.low_stock_threshold) lowStockCount++
      }

      // Build trends (grouped by month if All Time, daily if specific period)
      const sortedDates = [...dailyMap.keys()].sort()
      let bestDay: { date: string; revenue: number } | null = null

      for (const date of sortedDates) {
        const d = dailyMap.get(date)!
        const dayTotRev = d.waterRevenue + d.itemRevenue
        if (!bestDay || dayTotRev > bestDay.revenue) {
          bestDay = { date, revenue: dayTotRev }
        }
      }

      let trends: any[] = []
      if (year === 0) {
        const monthlyMap = new Map<string, { waterRevenue: number; itemRevenue: number; expenses: number; containers: number }>()
        for (const date of sortedDates) {
          const mKey = date.substring(0, 7)
          const d = dailyMap.get(date)!
          const mEntry = monthlyMap.get(mKey) || { waterRevenue: 0, itemRevenue: 0, expenses: 0, containers: 0 }
          mEntry.waterRevenue += d.waterRevenue
          mEntry.itemRevenue += d.itemRevenue
          mEntry.expenses += d.expenses
          mEntry.containers += d.containers
          monthlyMap.set(mKey, mEntry)
        }
        trends = [...monthlyMap.keys()].sort().map(mKey => {
          const m = monthlyMap.get(mKey)!
          const totRev = m.waterRevenue + m.itemRevenue
          return {
            date: mKey,
            waterRevenue: m.waterRevenue,
            itemRevenue: m.itemRevenue,
            expenses: m.expenses,
            netProfit: totRev - m.expenses,
            containers: m.containers
          }
        })
      } else {
        trends = sortedDates.map(date => {
          const d = dailyMap.get(date)!
          const dayTotRev = d.waterRevenue + d.itemRevenue
          return {
            date,
            waterRevenue: d.waterRevenue,
            itemRevenue: d.itemRevenue,
            expenses: d.expenses,
            netProfit: dayTotRev - d.expenses,
            containers: d.containers
          }
        })
      }

      const totalRevenue = waterRevenue + itemRevenue
      const netProfit = totalRevenue - totalExpenses
      const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0
      const activeDaysCount = sortedDates.length
      const avgDailyRevenue = activeDaysCount > 0 ? totalRevenue / activeDaysCount : 0

      // Water type breakdown list
      const waterTypeBreakdown = [...waterTypeMap.entries()].map(([type, val]) => ({
        type,
        volume: val.volume,
        revenue: val.revenue,
        percentage: totalContainers > 0 ? (val.volume / totalContainers) * 100 : 0
      })).sort((a, b) => b.volume - a.volume)

      // Mode breakdown list
      const modeBreakdown = [...modeMap.entries()].map(([mode, val]) => ({
        mode: mode === 'DELIVER' ? 'Delivery' : 'Pickup / Counter',
        count: val.count,
        volume: val.volume,
        revenue: val.revenue
      }))

      // Top Items list
      const topItems = [...itemAggMap.values()]
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8)

      // Top Expenses list
      const topExpenses = [...expAggMap.entries()]
        .map(([description, val]) => ({ description, count: val.count, total: val.total }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 8)

      return {
        ok: true,
        data: {
          period: { year, month, label: periodLabel },
          kpis: {
            totalRevenue,
            waterRevenue,
            itemRevenue,
            totalExpenses,
            restockSpend,
            netProfit,
            profitMargin,
            totalContainersRefilled: totalContainers,
            totalItemsSold,
            totalDaysActive: activeDaysCount,
            avgDailyRevenue,
            bestDay
          },
          trends,
          waterTypeBreakdown,
          modeBreakdown,
          topItems,
          topExpenses,
          inventoryStats: {
            totalSkus: allItems?.length || 0,
            totalInventoryValueCost: totalValCost,
            totalInventoryValueSrp: totalValSrp,
            lowStockCount,
            outOfStockCount
          }
        }
      }
    } catch (e: unknown) {
      console.error('[analytics:getExecutive] Error:', e)
      return { ok: false, error: String(e) }
    }
  })
}
