import * as fs from 'fs'
import * as path from 'path'
import { supabase } from './supabaseClient'

interface ParsedLog {
  log_type: 'water' | 'item'
  action: string
  details: string
  timestamp: string
}

export async function migrateAuditLogs() {
  console.log('--- 6. Migrating Historical Raw Logs to Database ---')

  const candidateDirs = [
    'C:\\livingwaterbackup\\logs',
    path.join(process.cwd(), 'backup', 'logs')
  ]

  let logDir = ''
  for (const d of candidateDirs) {
    if (fs.existsSync(d)) {
      logDir = d
      break
    }
  }

  if (!logDir) {
    console.log('No historical logs folder found to migrate.')
    return
  }

  console.log(`Reading legacy logs from: ${logDir}`)
  const files = fs.readdirSync(logDir).filter(f => f.endsWith('.txt'))

  const pattern = /^\[(.*?)\] \[(.*?)\] (.*)$/
  const logsToInsert: ParsedLog[] = []

  for (const file of files) {
    const isItem = file.startsWith('item-audit-')
    const logType: 'water' | 'item' = isItem ? 'item' : 'water'

    const content = fs.readFileSync(path.join(logDir, file), 'utf-8')
    const lines = content.split('\n')

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      const m = trimmed.match(pattern)
      if (m) {
        // Convert "YYYY-MM-DD HH:mm:ss" to ISO string if possible
        let isoTs = m[1]
        try {
          const d = new Date(m[1].replace(' ', 'T') + '+08:00')
          if (!isNaN(d.getTime())) {
            isoTs = d.toISOString()
          }
        } catch {}

        logsToInsert.push({
          log_type: logType,
          action: m[2],
          details: m[3],
          timestamp: isoTs
        })
      }
    }
  }

  console.log(`Parsed ${logsToInsert.length} legacy log entries.`)

  if (logsToInsert.length === 0) return

  // Check if audit_logs table exists in Supabase
  const { error: testErr } = await supabase.from('audit_logs').select('id').limit(1)

  if (testErr) {
    console.warn('\n⚠️ Supabase audit_logs table not yet available:', testErr.message)
    console.log('Please execute the migration in: supabase/migrations/002_audit_logs.sql\n')
    return
  }

  // Insert in batches of 50
  const BATCH_SIZE = 50
  let inserted = 0
  for (let i = 0; i < logsToInsert.length; i += BATCH_SIZE) {
    const batch = logsToInsert.slice(i, i + BATCH_SIZE)
    const { error } = await supabase.from('audit_logs').insert(batch)
    if (error) {
      console.error('Batch insert error:', error.message)
    } else {
      inserted += batch.length
    }
  }

  console.log(`Successfully migrated ${inserted} of ${logsToInsert.length} log records to Supabase audit_logs!`)
}

if (require.main === module) {
  migrateAuditLogs()
}
