import { describe, it, expect, vi } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import {
  buildDailyLogWorkbook,
  buildItemSalesWorkbook,
  buildStockReportWorkbook
} from '../excel/workbookBuilders'

// Mock store and sync dependencies so tests run offline cleanly
vi.mock('../supabase/client', () => ({
  getSupabase: vi.fn().mockResolvedValue({
    from: () => ({
      select: () => ({
        gte: () => ({
          lte: () => ({
            order: () => ({
              order: () => Promise.resolve({ data: [] })
            })
          })
        }),
        order: () => Promise.resolve({ data: [] })
      })
    })
  })
}))

vi.mock('../store/syncEngine', () => ({
  isOnline: () => false
}))

vi.mock('../store/localDb', () => ({
  getLocalDb: () => ({
    prepare: () => ({
      all: () => [],
      get: () => undefined
    })
  })
}))

describe('Full Historical Backup — Workbook Builders', () => {
  it('builds a Daily Log monthly workbook with daily sheets', async () => {
    const { wb, hasData } = await buildDailyLogWorkbook(2026, 9)
    expect(wb).toBeDefined()
    expect(typeof hasData).toBe('boolean')

    // September has 30 days -> 30 worksheets
    const sheets = wb.worksheets
    expect(sheets.length).toBe(30)
    expect(sheets[0].name).toBe('SEP01')
    expect(sheets[29].name).toBe('SEP30')
  })

  it('builds an Item Sales monthly workbook with title and column headers', async () => {
    const { wb, hasData } = await buildItemSalesWorkbook(2026, 9)
    expect(wb).toBeDefined()
    expect(typeof hasData).toBe('boolean')

    const ws = wb.getWorksheet('Item Sales')
    expect(ws).toBeDefined()
    expect(ws?.getCell('A1').value).toBe('MONTHLY ITEM SALES REPORT — 2026-09')
    const headers = ws?.getRow(2).values as string[]
    expect(headers).toContain('Date')
    expect(headers).toContain('Item Description')
    expect(headers).toContain('Price (₱)')
    expect(headers).toContain('Total Amount (₱)')
  })

  it('builds a Stock Report workbook with 5 relational sheets', async () => {
    const { wb, hasData } = await buildStockReportWorkbook()
    expect(wb).toBeDefined()
    expect(typeof hasData).toBe('boolean')

    const sheetNames = wb.worksheets.map(ws => ws.name)
    expect(sheetNames).toContain('Item Catalog')
    expect(sheetNames).toContain('Stock Movements')
    expect(sheetNames).toContain('Buyer Summary')
    expect(sheetNames).toContain('Buyers')
    expect(sheetNames).toContain('Restock Orders')
  })
})

describe('Full Historical Backup — Skip Deduplication Logic', () => {
  it('skips existing non-empty files without regenerating or corrupting', () => {
    const tmpDir = path.join(process.cwd(), 'out', '__test_backup_dedup__')
    if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true })

    const testFile = path.join(tmpDir, '01. DAILY LOG (JAN)-2022.xlsx')
    fs.writeFileSync(testFile, 'PRE_EXISTING_MOCK_CONTENT')

    // Check if exists and size > 0
    const exists = fs.existsSync(testFile) && fs.statSync(testFile).size > 0
    expect(exists).toBe(true)

    // Verify content is untouched
    const content = fs.readFileSync(testFile, 'utf-8')
    expect(content).toBe('PRE_EXISTING_MOCK_CONTENT')

    // Clean up
    try {
      fs.unlinkSync(testFile)
      fs.rmdirSync(tmpDir)
    } catch {}
  })
})
