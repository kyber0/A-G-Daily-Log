import ExcelJS from 'exceljs'
import path from 'path'

async function inspectAllMovementsAndItems() {
  const wb = new ExcelJS.Workbook()
  const filePath = path.join(process.cwd(), 'plan/INFO/INVENTORY STOCK REPORT/STOCK_REPORT_refactored.xlsx')
  await wb.xlsx.readFile(filePath)

  const wsCatalog = wb.getWorksheet('Item Catalog')!
  const wsMovements = wb.getWorksheet('Stock Movements')!

  console.log('--- All 51 Item Catalog Rows in Excel ---')
  const catalogRows: { row: number; id: string; label: string; name: string; dp: number; srp: number; note: string }[] = []

  for (let r = 3; r <= wsCatalog.rowCount; r++) {
    const id = wsCatalog.getCell(r, 1).text?.trim()
    const label = wsCatalog.getCell(r, 2).text?.trim()
    const name = wsCatalog.getCell(r, 3).text?.trim()
    const dp = Number(wsCatalog.getCell(r, 9).value) || 0
    const srp = Number(wsCatalog.getCell(r, 10).value) || 0
    const note = wsCatalog.getCell(r, 7).text?.trim() || ''

    if (id && name) {
      catalogRows.push({ row: r, id, label, name, dp, srp, note })
    }
  }

  console.log(`Found ${catalogRows.length} catalog rows in Excel.`)
  for (const item of catalogRows) {
    console.log(`[${item.id}] ${item.name} | DP: ₱${item.dp} | SRP: ₱${item.srp} | Note: ${item.note || 'none'}`)
  }

  // Count movements per item in Excel
  console.log('\n--- Excel Movements per Item ---')
  const movCounts = new Map<string, { inQty: number; outQty: number }>()

  for (let r = 3; r <= wsMovements.rowCount; r++) {
    const itemLabel = wsMovements.getCell(r, 3).text?.trim()
    const dir = wsMovements.getCell(r, 4).text?.trim().toLowerCase()
    const qty = Number(wsMovements.getCell(r, 5).value) || 0

    if (!itemLabel) continue
    const entry = movCounts.get(itemLabel) || { inQty: 0, outQty: 0 }
    if (dir === 'in') entry.inQty += qty
    else if (dir === 'out') entry.outQty += qty
    movCounts.set(itemLabel, entry)
  }

  for (const [label, counts] of movCounts.entries()) {
    console.log(`Item "${label}": Qty In = ${counts.inQty}, Qty Out = ${counts.outQty}`)
  }
}

inspectAllMovementsAndItems().catch(console.error)
