import { supabase } from './supabaseClient'

async function verifyIsolatedRows() {
  const { data: items } = await supabase.from('items').select('id, name, code, dealer_price, srp, batch_note').order('created_at')
  const { data: movements } = await supabase.from('stock_movements').select('item_id, direction, quantity')

  console.log(`Total items in Supabase: ${items?.length}`)

  const movMap = new Map<string, { inQty: number; outQty: number }>()
  for (const m of movements || []) {
    if (!m.item_id) continue
    const entry = movMap.get(m.item_id) || { inQty: 0, outQty: 0 }
    if (m.direction === 'in') entry.inQty += Number(m.quantity) || 0
    else entry.outQty += Number(m.quantity) || 0
    movMap.set(m.item_id, entry)
  }

  const targetNames = [
    '5 GAL (PET) ROUND CONTAINER BLUE W/ CAP (CLASS A)',
    'FAUCET SEAL FOR SLIM GENERIC',
    'INDUSTRIAL SALT ART-COURSE',
    '350 ML PET BOTTLE (WITH CAP)'
  ]

  for (const name of targetNames) {
    console.log(`\n--- Items for "${name}" ---`)
    const matched = items?.filter(i => i.name === name)
    for (const itm of matched || []) {
      const mov = movMap.get(itm.id) || { inQty: 0, outQty: 0 }
      const bal = mov.inQty - mov.outQty
      console.log(`  [Code: ${itm.code}] DP: ₱${itm.dealer_price}, SRP: ₱${itm.srp}, Batch: ${itm.batch_note || 'none'} | Qty In: ${mov.inQty}, Qty Out: ${mov.outQty}, Balance: ${bal}`)
    }
  }
}

verifyIsolatedRows()
