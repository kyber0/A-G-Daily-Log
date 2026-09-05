import { getSupabase } from '../src/main/supabase/client'
import dotenv from 'dotenv'
dotenv.config()

async function testFetchAll() {
  const sb = await getSupabase()

  // Default select
  const { data: unpaged, error: err1 } = await sb.from('refill_sales').select('date, quantity, unit_price, total')
  console.log(`Unpaged refill_sales returned: ${unpaged?.length} rows (out of 13,133)`)

  // Let's compute sum of unpaged vs sum of all rows
  const unpagedTotal = (unpaged || []).reduce((s, r) => s + (Number(r.total) || (Number(r.quantity) * Number(r.unit_price || 0))), 0)
  console.log(`Unpaged total revenue: ₱${unpagedTotal.toLocaleString()}`)

  // Paged fetch
  let allRows: any[] = []
  let page = 0
  const pageSize = 1000
  while (true) {
    const { data: chunk, error } = await sb
      .from('refill_sales')
      .select('date, quantity, unit_price, total')
      .range(page * pageSize, (page + 1) * pageSize - 1)
    if (error || !chunk || chunk.length === 0) break
    allRows = allRows.concat(chunk)
    if (chunk.length < pageSize) break
    page++
  }

  console.log(`Paged refill_sales fetched: ${allRows.length} rows`)
  const trueTotal = allRows.reduce((s, r) => s + (Number(r.total) || (Number(r.quantity) * Number(r.unit_price || 0))), 0)
  console.log(`True all-time total revenue: ₱${trueTotal.toLocaleString()}`)
}

testFetchAll()
