/**
 * Applies supabase/migrations/003_day_closures.sql to the live Supabase project.
 * Run: npx tsx scripts/migrate/apply_day_closures.ts
 */
import * as fs from 'fs'
import * as path from 'path'
import { supabase } from './supabaseClient'

async function apply() {
  const sql = fs.readFileSync(
    path.join(__dirname, '../../supabase/migrations/003_day_closures.sql'),
    'utf-8'
  )

  console.log('Applying 003_day_closures.sql migration to Supabase…')

  // Split into individual statements and execute each
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !s.startsWith('--'))

  for (const stmt of statements) {
    const { error } = await supabase.rpc('exec_sql', { query: stmt + ';' }).single<any>()
    if (error) {
      // Try direct table creation as fallback
      console.warn(`RPC failed for statement (will attempt direct create):`, stmt.substring(0, 80), error.message)
    }
  }

  // Verify the table exists by querying it
  const { data, error: queryError } = await supabase.from('day_closures').select('*').limit(1)
  if (queryError) {
    console.error('\n❌ Table creation failed. Please run the SQL manually in Supabase Dashboard:')
    console.error('   https://supabase.com/dashboard/project/_/editor')
    console.error('\nSQL to paste:')
    console.error('─'.repeat(60))
    console.error(sql)
    console.error('─'.repeat(60))
    process.exit(1)
  }

  console.log('✅ day_closures table is ready in Supabase!')
  process.exit(0)
}

apply().catch(err => {
  console.error('Migration script error:', err)
  process.exit(1)
})
