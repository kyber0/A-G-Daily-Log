import { describe, it, expect } from 'vitest'
import ExcelJS from 'exceljs'
import { buildDailyLogSheet, buildCatalogSheet } from '../export/excelBuilder'

describe('Excel Export — Daily Log Sheet Builder', () => {
  it('generates sheet with correct name derived from date', () => {
    const wb = new ExcelJS.Workbook()
    const sheet = buildDailyLogSheet(wb, {
      date: '2026-09-05',
      entries: []
    })
    expect(sheet.name).toBe('SEP05')
  })

  it('produces expected column headers for daily log records', () => {
    const wb = new ExcelJS.Workbook()
    const sheet = buildDailyLogSheet(wb, {
      date: '2026-09-05',
      entries: [
        { sn: 1, container: 'SLIM', water: 'ALKALINE', qty: 10, mode: 'PICKUP', price: 40 }
      ]
    })

    const headerRow = sheet.getRow(2).values as string[]
    expect(headerRow).toContain('Container Type')
    expect(headerRow).toContain('Water Type')
    expect(headerRow).toContain('Qty')
    expect(headerRow).toContain('Mode')
    expect(headerRow).toContain('Unit Price')
    expect(headerRow).toContain('Line Total')
  })

  it('populates row data and line total formulas accurately', () => {
    const wb = new ExcelJS.Workbook()
    const sheet = buildDailyLogSheet(wb, {
      date: '2026-09-05',
      entries: [
        { sn: 1, container: 'SLIM', water: 'ALKALINE', qty: 5, mode: 'DELIVER', price: 45 }
      ]
    })

    const row3 = sheet.getRow(3)
    expect(row3.getCell(2).value).toBe('SLIM')
    expect(row3.getCell(3).value).toBe('ALKALINE')
    expect(row3.getCell(4).value).toBe(5)
    expect(row3.getCell(5).value).toBe('DELIVER')
    expect(row3.getCell(6).value).toBe(45)

    const formulaCell = row3.getCell(7).value as { formula: string; result?: number }
    expect(formulaCell.formula).toBe('D3*F3')
    expect(formulaCell.result).toBe(225)
  })

  it('adds a totals row with SUM formulas when entries exist', () => {
    const wb = new ExcelJS.Workbook()
    const sheet = buildDailyLogSheet(wb, {
      date: '2026-09-05',
      entries: [
        { sn: 1, container: 'SLIM', water: 'ALKALINE', qty: 10, mode: 'PICKUP', price: 40 },
        { sn: 2, container: 'ROUND', water: 'MINERAL', qty: 15, mode: 'DELIVER', price: 30 }
      ]
    })

    const totalsRow = sheet.getRow(5)
    expect(totalsRow.getCell(1).value).toBe('TOTALS')
    const qtySum = totalsRow.getCell(4).value as { formula: string }
    const totalSum = totalsRow.getCell(7).value as { formula: string }
    expect(qtySum.formula).toBe('SUM(D3:D4)')
    expect(totalSum.formula).toBe('SUM(G3:G4)')
  })
})

describe('Excel Export — Catalog & Stock Movements Sheet Builder', () => {
  it('generates item catalog with balance calculations and headers', async () => {
    const wb = new ExcelJS.Workbook()
    const sheet = buildCatalogSheet(wb, [
      {
        id: 'itm-001',
        code: 'SLM-BLU',
        name: 'Slim Container Blue',
        category: 'CONTAINERS',
        dealerPrice: 150,
        srp: 220,
        inQty: 50,
        outQty: 20
      }
    ])

    const headers = sheet.getRow(1).values as string[]
    expect(headers).toContain('Item Code')
    expect(headers).toContain('Item Name')
    expect(headers).toContain('Qty In')
    expect(headers).toContain('Qty Out')
    expect(headers).toContain('Balance')
    expect(headers).toContain('Status')

    const row2 = sheet.getRow(2)
    expect(row2.getCell(2).value).toBe('SLM-BLU')
    expect(row2.getCell(3).value).toBe('Slim Container Blue')
    expect(row2.getCell(9).value).toBe(30) // 50 - 20 = 30
    expect(row2.getCell(10).value).toBe('In Stock')
    expect(row2.getCell(11).value).toBe(70) // 220 - 150 = 70 profit

    // Verify valid Excel binary buffer generation
    const buffer = await wb.xlsx.writeBuffer()
    expect(buffer).toBeDefined()
    expect(buffer.byteLength).toBeGreaterThan(0)
  })
})
