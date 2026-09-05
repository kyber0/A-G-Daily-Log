import { describe, it, expect } from 'vitest'
import {
  computeStockBalance,
  aggregateMovementsByItem,
  calculateDaySummary,
  calculateRefillLineTotal
} from '../../shared/stockLogic'

describe('Stock Balance Logic', () => {
  it('correctly calculates balance by subtracting stock-out from ordered quantity', () => {
    const res = computeStockBalance({ ordered: 100, stockOut: 35 })
    expect(res.qtyBalance).toBe(65)
    expect(res.status).toBe('in_stock')
  })

  it('handles exact zero balance as out of stock', () => {
    const res = computeStockBalance({ ordered: 50, stockOut: 50 })
    expect(res.qtyBalance).toBe(0)
    expect(res.status).toBe('out')
  })

  it('clamps negative balance to zero when preventNegative is true', () => {
    const res = computeStockBalance({ ordered: 10, stockOut: 25, preventNegative: true })
    expect(res.qtyBalance).toBe(0)
    expect(res.status).toBe('out')
  })

  it('identifies low stock status when balance is at or below threshold', () => {
    const res = computeStockBalance({ ordered: 100, stockOut: 90, lowStockThreshold: 15 })
    expect(res.qtyBalance).toBe(10)
    expect(res.status).toBe('low')
  })

  it('computes financial metrics correctly', () => {
    const res = computeStockBalance({
      ordered: 200,
      stockOut: 50,
      dealerPrice: 30,
      srp: 45
    })
    expect(res.totalCost).toBe(6000) // 200 * 30
    expect(res.salesAmount).toBe(2250) // 50 * 45
    expect(res.profitPerUnit).toBe(15) // 45 - 30
  })

  it('aggregates multiple in and out stock movements per item', () => {
    const movements = [
      { itemId: 'item-1', direction: 'in' as const, quantity: 100 },
      { itemId: 'item-1', direction: 'out' as const, quantity: 20 },
      { itemId: 'item-2', direction: 'in' as const, quantity: 50 },
      { itemId: 'item-1', direction: 'out' as const, quantity: 15 },
      { itemId: 'item-2', direction: 'out' as const, quantity: 50 }
    ]

    const agg = aggregateMovementsByItem(movements)
    expect(agg.get('item-1')).toEqual({ inQty: 100, outQty: 35 })
    expect(agg.get('item-2')).toEqual({ inQty: 50, outQty: 50 })
  })
})

describe('Daily Refill Sales & Cash Reconciliation Logic', () => {
  it('calculates refill line totals properly', () => {
    expect(calculateRefillLineTotal(10, 45)).toBe(450)
    expect(calculateRefillLineTotal(0, 40)).toBe(0)
  })

  it('computes complete daily summary with pickup and delivery sub-totals and expenses', () => {
    const sales = [
      { qty: 10, price: 40, mode: 'PICKUP' as const },
      { qty: 20, price: 45, mode: 'DELIVER' as const },
      { qty: 5,  price: 35, mode: 'DELIVER' as const }
    ]
    const expenses = [
      { amount: 200 }, // Gasoline
      { amount: 150 }  // Staff lunch
    ]

    const summary = calculateDaySummary(sales, expenses)

    expect(summary.totalQty).toBe(35)
    expect(summary.pickupSales).toBe(400)   // 10 * 40
    expect(summary.deliverSales).toBe(1075) // (20 * 45) + (5 * 35) = 900 + 175
    expect(summary.totalSales).toBe(1475)   // 400 + 1075
    expect(summary.totalExpenses).toBe(350) // 200 + 150
    expect(summary.netCash).toBe(1125)      // 1475 - 350
  })
})
