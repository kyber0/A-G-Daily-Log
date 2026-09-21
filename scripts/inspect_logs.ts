import * as fs from 'fs'
import * as path from 'path'
import { createClient } from '@supabase/supabase-js'

async function run() {
  const appData = process.env.APPDATA || ''
  const configPath = path.join(appData, 'ag-daily-log', 'config.json')
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  const sb = createClient(config.supabaseUrl, config.supabaseAnonKey)
  await sb.auth.signInWithPassword({
    email: config.appAccountEmail,
    password: config.appAccountPassword
  })

  const { data: logs } = await sb
    .from('audit_logs')
    .select('*')
    .gte('timestamp', '2026-09-20T16:00:00.000Z')
    .lte('timestamp', '2026-09-21T03:30:00.000Z')
    .order('timestamp', { ascending: true })

  console.log('=== ALL AUDIT LOGS FROM TODAY UP TO 11:30 AM (MANILA TIME) ===')
  console.log(`Total: ${logs?.length || 0} events\n`)

  for (const l of logs || []) {
    const phDate = new Date(l.timestamp).toLocaleString('en-US', { timeZone: 'Asia/Manila', hour12: true })
    console.log(`[${phDate}] [${l.action}] ${l.details}`)
  }
}

run().catch(console.error)
