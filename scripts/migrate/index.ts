import { migrateStockReport } from './01_stockReport'
import { migrateSalesReport } from './02_salesReport'
import { migrateDailyLog } from './03_dailyLog'
import { migrateSupplierPrices } from './04_supplierPrices'
import { validateMigration } from './05_validate'

async function runAll() {
  console.log('====================================================')
  console.log('STARTING FULL SUPABASE MIGRATION (LIVING WATER A&G)')
  console.log('====================================================\n')

  const startTime = Date.now()

  try {
    // 1. Stock Report
    await migrateStockReport()

    // 2. Sales Report
    await migrateSalesReport()

    // 3. Daily Log
    await migrateDailyLog()

    // 4. Supplier Prices
    await migrateSupplierPrices()

    // 5. Validation
    const isValid = await validateMigration()

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1)
    console.log(`\nMigration run completed in ${elapsed}s.`)

    if (!isValid) {
      console.error('\n⚠️ Validation reported warnings/mismatches. Please review above output.')
      process.exit(1)
    } else {
      console.log('\n🎉 ALL MIGRATIONS AND VALIDATIONS COMPLETED SUCCESSFULLY!')
    }
  } catch (err) {
    console.error('\n❌ Migration failed with error:', err)
    process.exit(1)
  }
}

runAll()
