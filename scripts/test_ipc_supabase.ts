import { getSupabase } from '../src/main/supabase/client'
import dotenv from 'dotenv'
dotenv.config()

async function testSupabaseHandlers() {
  console.log('Testing Supabase Cloud Backend Integration...')
  const sb = await getSupabase()

  // 1. Test Refill Sales
  const { count: salesCount, error: salesErr } = await sb.from('refill_sales').select('*', { count: 'exact', head: true })
  if (salesErr) throw salesErr
  console.log(`✓ refill_sales count: ${salesCount}`)

  // 2. Test Daily Expenses
  const { count: expCount, error: expErr } = await sb.from('daily_expenses').select('*', { count: 'exact', head: true })
  if (expErr) throw expErr
  console.log(`✓ daily_expenses count: ${expCount}`)

  // 3. Test Items & Categories
  const { data: items, error: itemErr } = await sb.from('items').select('id, name, code, srp, categories(name)').limit(5)
  if (itemErr) throw itemErr
  console.log(`✓ items sample:`, items?.map(i => `${i.name} (₱${i.srp})`))

  // 4. Test Stock Movements
  const { count: movCount, error: movErr } = await sb.from('stock_movements').select('*', { count: 'exact', head: true })
  if (movErr) throw movErr
  console.log(`✓ stock_movements count: ${movCount}`)

  // 5. Test Item Sales
  const { count: itemSalesCount, error: isErr } = await sb.from('item_sales').select('*', { count: 'exact', head: true })
  if (isErr) throw isErr
  console.log(`✓ item_sales count: ${itemSalesCount}`)

  // 6. Test Buyers
  const { data: buyers, error: buyerErr } = await sb.from('buyers').select('name, is_own_shop')
  if (buyerErr) throw buyerErr
  console.log(`✓ buyers count: ${buyers?.length}`)

  // 7. Test Restock Orders
  const { data: orders, error: orderErr } = await sb.from('restock_orders').select('so_number, order_date, amount')
  if (orderErr) throw orderErr
  console.log(`✓ restock_orders count: ${orders?.length}`)

  console.log('\n=========================================')
  console.log('ALL SUPABASE BACKEND INTEGRATIONS PASSED!')
  console.log('=========================================')
}

testSupabaseHandlers().catch(err => {
  console.error('Test failed:', err)
  process.exit(1)
})
