import { supabase } from './supabaseClient'

export async function validateMigration(): Promise<boolean> {
  console.log('====================================================')
  console.log('--- 5. VALIDATING SUPABASE MIGRATION ---')
  console.log('====================================================\n')

  let passed = true

  // 1. Stock Report Totals
  console.log('[Check 1] Stock Report totals...')

  // Restock orders spend
  const { data: orders, error: ordErr } = await supabase
    .from('restock_orders')
    .select('amount, trucking_fee')

  if (ordErr || !orders) {
    console.error('FAIL: Could not query restock_orders:', ordErr?.message)
    passed = false
  } else {
    const totalSpend = orders.reduce((sum, o) => sum + (Number(o.amount) || 0) + (Number(o.trucking_fee) || 0), 0)
    console.log(`  Restocking spend: ${totalSpend} (Expected: 522,564)`)
    if (Math.abs(totalSpend - 522564) > 1) {
      console.error(`  FAIL: Restocking spend mismatch: ${totalSpend} vs 522,564`)
      passed = false
    } else {
      console.log('  ✓ Restocking spend MATCHES 522,564')
    }
  }

  // Stock movements: Qty Stock Out and Balance (using pagination to handle >1000 rows)
  const pageSize = 1000
  let page = 0
  let allMovements: any[] = []
  while (true) {
    const { data, error } = await supabase
      .from('stock_movements')
      .select('direction, quantity, source, note')
      .range(page * pageSize, (page + 1) * pageSize - 1)
    if (error || !data || data.length === 0) break
    allMovements = allMovements.concat(data)
    if (data.length < pageSize) break
    page++
  }

  const stockReportMovs = allMovements.filter(m => m.note && m.note.startsWith('['))
  const qtyIn = stockReportMovs.filter(m => m.direction === 'in').reduce((s, m) => s + (Number(m.quantity) || 0), 0)
  const qtyOut = stockReportMovs.filter(m => m.direction === 'out').reduce((s, m) => s + (Number(m.quantity) || 0), 0)
  const qtyBalance = qtyIn - qtyOut

  console.log(`  Stock Report Qty Stock Out: ${qtyOut} (Expected: 2,606)`)
  console.log(`  Stock Report Qty Balance: ${qtyBalance} (Expected: 4,165)`)

  if (qtyOut === 2606) {
    console.log('  ✓ Qty Stock Out MATCHES 2,606')
  } else {
    console.error(`  FAIL: Qty Stock Out mismatch: ${qtyOut} vs 2,606`)
    passed = false
  }

  if (qtyBalance === 4165) {
    console.log('  ✓ Qty Balance MATCHES 4,165')
  } else {
    console.error(`  FAIL: Qty Balance mismatch: ${qtyBalance} vs 4,165`)
    passed = false
  }

  // 2. Sales Report: December 2023
  console.log('\n[Check 2] December 2023 Item Sales Total...')
  const { data: decSales, error: decErr } = await supabase
    .from('item_sales')
    .select('quantity, unit_price_at_sale, discount')
    .gte('date', '2023-12-01')
    .lte('date', '2023-12-31')

  if (decErr || !decSales) {
    console.error('FAIL: Could not query December 2023 item_sales:', decErr?.message)
    passed = false
  } else {
    const decTotal = decSales.reduce((sum, s) => {
      const price = Number(s.unit_price_at_sale) || 0
      const qty = Number(s.quantity) || 0
      const disc = Number(s.discount) || 0
      return sum + (price * qty - disc)
    }, 0)

    console.log(`  Dec 2023 Sales Total: ${decTotal} (Expected: 5,170)`)
    if (Math.abs(decTotal - 5170) <= 0.01) {
      console.log('  ✓ Dec 2023 Sales Total MATCHES 5,170')
    } else {
      console.error(`  FAIL: Dec 2023 Sales Total mismatch: ${decTotal} vs 5,170`)
      passed = false
    }
  }

  // 3. Daily Log Spot Checks
  console.log('\n[Check 3] Daily Log spot check (2026-08-01)...')
  const { data: aug1Sales, error: aug1Err } = await supabase
    .from('refill_sales')
    .select('total')
    .eq('date', '2026-08-01')

  const { data: aug1Exp, error: aug1ExpErr } = await supabase
    .from('daily_expenses')
    .select('total')
    .eq('date', '2026-08-01')

  if (aug1Err || aug1ExpErr) {
    console.error('FAIL: Could not query 2026-08-01 refill data')
    passed = false
  } else if (aug1Sales && aug1Exp) {
    const overallTotal = aug1Sales.reduce((s, r) => s + (Number(r.total) || 0), 0)
    const totalExpenses = aug1Exp.reduce((s, e) => s + (Number(e.total) || 0), 0)
    const netSales = overallTotal - totalExpenses

    console.log(`  2026-08-01 Overall Total: ${overallTotal} (Expected: 3,355)`)
    console.log(`  2026-08-01 Net Sales: ${netSales} (Expected: 3,355)`)
    if (overallTotal === 3355 && netSales === 3355) {
      console.log('  ✓ 2026-08-01 Daily Log MATCHES 3,355')
    } else {
      console.error(`  FAIL: 2026-08-01 mismatch: Overall ${overallTotal}, Net ${netSales}`)
      passed = false
    }
  }

  // 4. Record counts summary
  console.log('\n[Summary] Overall database counts:')
  const tables = [
    'categories', 'buyers', 'suppliers', 'supplier_price_list',
    'items', 'stock_movements', 'restock_orders',
    'item_sales', 'refill_container_types', 'refill_water_types',
    'refill_sales', 'daily_expenses'
  ]

  for (const t of tables) {
    const { count, error } = await supabase.from(t).select('*', { count: 'exact', head: true })
    if (error) {
      console.log(`  ${t.padEnd(25)}: Error - ${error.message}`)
    } else {
      console.log(`  ${t.padEnd(25)}: ${count} rows`)
    }
  }

  console.log('\n====================================================')
  return passed
}

if (require.main === module) {
  validateMigration().then(ok => {
    if (!ok) process.exit(1)
  }).catch(err => {
    console.error('Validation error:', err)
    process.exit(1)
  })
}
