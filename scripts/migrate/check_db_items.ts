import { supabase } from './supabaseClient'

async function checkDbItems() {
  const { data: dbItems } = await supabase.from('items').select('id, name, dealer_price, srp, batch_note, low_stock_threshold').order('name')
  console.log(`Total items in Supabase: ${dbItems?.length}`)

  // Find names that had duplicates in Excel
  const names = ['FAUCET SEAL FOR SLIM GENERIC', 'INDUSTRIAL SALT ART-COURSE', '350 ML PET BOTTLE (WITH CAP)']
  for (const n of names) {
    const matched = dbItems?.filter(i => i.name.toUpperCase().includes(n))
    console.log(`Matches for "${n}":`, matched)
  }
}
checkDbItems()
