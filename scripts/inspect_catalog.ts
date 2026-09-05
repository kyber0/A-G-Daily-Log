import ExcelJS from 'exceljs'
import path from 'path'

async function checkCatalog() {
  const wb = new ExcelJS.Workbook()
  const filePath = path.join(process.cwd(), 'plan/INFO/INVENTORY STOCK REPORT/STOCK_REPORT_refactored.xlsx')
  await wb.xlsx.readFile(filePath)
  const ws = wb.getWorksheet('Item Catalog')
  console.log('--- Item Catalog Rows in STOCK_REPORT_refactored.xlsx ---')
  if (ws) {
    for (let r = 3; r <= ws.rowCount; r++) {
      const id = ws.getCell(r, 1).text?.trim()
      const label = ws.getCell(r, 2).text?.trim()
      const name = ws.getCell(r, 3).text?.trim()
      const code = ws.getCell(r, 4).text?.trim()
      const dealerPrice = ws.getCell(r, 9).text?.trim()
      const srp = ws.getCell(r, 10).text?.trim()
      const note = ws.getCell(r, 7).text?.trim()
      if (name) {
        console.log(`Row ${r}: ID=${id} | Code=${code} | Name=${name} | DP=${dealerPrice} | SRP=${srp} | Note=${note}`)
      }
    }
  }

  const wb2 = new ExcelJS.Workbook()
  const srpPath = path.join(process.cwd(), 'plan/INFO/INVENTORY STOCK REPORT/SRP1.xlsx')
  await wb2.xlsx.readFile(srpPath)
  const ws2 = wb2.worksheets[0]
  console.log('\n--- SRP1 Rows (original single-sheet Stock Report) ---')
  for (let r = 13; r <= ws2.rowCount; r++) {
    const code = ws2.getCell(r, 1).text?.trim()
    const name = ws2.getCell(r, 2).text?.trim()
    const dealerPrice = ws2.getCell(r, 4).text?.trim()
    const qtyOrdered = ws2.getCell(r, 5).text?.trim()
    const qtyOut = ws2.getCell(r, 7).text?.trim()
    const srp = ws2.getCell(r, 15).text?.trim()
    if (name) {
      console.log(`Row ${r}: Code=${code} | Name=${name} | DP=${dealerPrice} | QtyOrd=${qtyOrdered} | QtyOut=${qtyOut} | SRP=${srp}`)
    }
  }
}

checkCatalog().catch(console.error)
