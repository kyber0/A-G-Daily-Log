import { supabase } from './supabaseClient'

async function cleanDuplicateMovements() {
  console.log('Cleaning duplicate historical sales movements...')
  const { error } = await supabase
    .from('stock_movements')
    .delete()
    .like('note', 'Sales Report import:%')

  if (error) {
    console.error('Error deleting duplicate movements:', error.message)
  } else {
    console.log('✓ Successfully removed duplicate sales report movements.')
  }

  const { count } = await supabase.from('stock_movements').select('*', { count: 'exact', head: true })
  console.log(`Current official stock movements in Supabase: ${count}`)
}

cleanDuplicateMovements()
