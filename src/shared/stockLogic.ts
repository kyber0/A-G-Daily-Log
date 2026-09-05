import type { SaleMode } from './types'

export interface StockMovementInput {
  itemId: string
  direction: 'in' | 'out'
  quantity: number
}

export interface StockBalanceResult {
  qtyOrdered: number
  qtyStockOut: number
  qtyBalance: number
  totalCost: number
  salesAmount: number
  profitPerUnit: number
  status: 'in_stock' | 'low' | 'out'
}

/**
 * Aggregates in/out movements by item ID.
 */
export function aggregateMovementsByItem(
  movements: StockMovementInput[]
): Map<string, { inQty: number; outQty: number }> {
  const map = new Map<string, { inQty: number; outQty: number }>()
  for (const m of movements) {
    if (!m.itemId) continue
    const curr = map.get(m.itemId) || { inQty: 0, outQty: 0 }
    const qty = Number(m.quantity) || 0
    if (m.direction === 'in') {
      curr.inQty += qty
    } else if (m.direction === 'out') {
      curr.outQty += qty
    }
    map.set(m.itemId, curr)
  }
  return map
}

/**
 * Calculates stock balance, financial metrics, and stock level status.
 */
export function computeStockBalance(opts: {
  ordered: number
  stockOut: number
  dealerPrice?: number
  srp?: number
  lowStockThreshold?: number
  preventNegative?: boolean
}): StockBalanceResult {
  const ordered = Math.max(0, Number(opts.ordered) || 0)
  const stockOut = Math.max(0, Number(opts.stockOut) || 0)
  let rawBalance = ordered - stockOut

  const qtyBalance = opts.preventNegative ? Math.max(0, rawBalance) : rawBalance
  const dealerPrice = Number(opts.dealerPrice) || 0
  const srp = Number(opts.srp) || 0

  const status: 'in_stock' | 'low' | 'out' =
    qtyBalance <= 0
      ? 'out'
      : opts.lowStockThreshold !== undefined && qtyBalance <= opts.lowStockThreshold
      ? 'low'
      : 'in_stock'

  return {
    qtyOrdered: ordered,
    qtyStockOut: stockOut,
    qtyBalance,
    totalCost: ordered * dealerPrice,
    salesAmount: stockOut * srp,
    profitPerUnit: srp - dealerPrice,
    status
  }
}

/**
 * Calculates line total for water refill sale.
 */
export function calculateRefillLineTotal(qty: number, unitPrice: number): number {
  const q = Math.max(0, Number(qty) || 0)
  const p = Math.max(0, Number(unitPrice) || 0)
  return q * p
}

/**
 * Summarizes sales and expenses for day reconciliation.
 */
export function calculateDaySummary(
  sales: Array<{ qty: number; price: number; mode: SaleMode }>,
  expenses: Array<{ amount: number }>
): {
  totalQty: number
  totalSales: number
  pickupSales: number
  deliverSales: number
  totalExpenses: number
  netCash: number
} {
  let totalQty = 0
  let totalSales = 0
  let pickupSales = 0
  let deliverSales = 0

  for (const s of sales) {
    const lineTotal = calculateRefillLineTotal(s.qty, s.price)
    totalQty += Number(s.qty) || 0
    totalSales += lineTotal
    if (s.mode === 'PICKUP') {
      pickupSales += lineTotal
    } else {
      deliverSales += lineTotal
    }
  }

  const totalExpenses = expenses.reduce((acc, e) => acc + (Math.max(0, Number(e.amount) || 0)), 0)
  const netCash = totalSales - totalExpenses

  return {
    totalQty,
    totalSales,
    pickupSales,
    deliverSales,
    totalExpenses,
    netCash
  }
}
