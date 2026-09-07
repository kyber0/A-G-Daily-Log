import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { uploadToDrive, getOAuth2Client } from './googleDriveIpc'
import type { IpcResult, BackupResult, FullBackupProgress } from '../../shared/types'
import { readConfig, writeConfig } from '../store/config'
import { getLocalDb } from '../store/localDb'
import { getSupabase } from '../supabase/client'
import { isOnline } from '../store/syncEngine'
import {
  buildDailyLogWorkbook,
  buildItemSalesWorkbook,
  buildStockReportWorkbook
} from '../excel/workbookBuilders'

/** Safe file copy with mtime comparison, directory auto-creation, and EBUSY lock fallback */
function copyFileSafe(srcPath: string, destPath: string): boolean {
  try {
    if (!fs.existsSync(srcPath)) return false

    // Skip temporary lock files (e.g. ~$*.xlsx)
    const baseName = path.basename(srcPath)
    if (baseName.startsWith('~$') || baseName.endsWith('.tmp')) return false

    const destDir = path.dirname(destPath)
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true })
    }

    // Incremental sync check: skip if identical size and mtime
    if (fs.existsSync(destPath)) {
      const srcStat = fs.statSync(srcPath)
      const destStat = fs.statSync(destPath)
      if (srcStat.size === destStat.size && Math.abs(srcStat.mtimeMs - destStat.mtimeMs) < 2000) {
        return false // Unchanged, skip
      }
    }

    try {
      fs.copyFileSync(srcPath, destPath)
    } catch (copyErr) {
      // Fallback: try stream read in case file is opened with shared read lock
      const buf = fs.readFileSync(srcPath)
      fs.writeFileSync(destPath, buf)
    }

    return true
  } catch (err) {
    console.warn(`[backup] Could not copy ${srcPath}:`, (err as any).message)
    return false
  }
}

/** Recursively sync all Excel files and subfolders from srcDir to destDir */
function syncDirectoryRecursive(srcDir: string, destDir: string): number {
  if (!fs.existsSync(srcDir)) return 0
  let count = 0

  try {
    const entries = fs.readdirSync(srcDir, { withFileTypes: true })
    for (const entry of entries) {
      const srcChild = path.join(srcDir, entry.name)
      const destChild = path.join(destDir, entry.name)

      if (entry.isDirectory()) {
        // Skip node_modules or system hidden folders if any
        if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
        count += syncDirectoryRecursive(srcChild, destChild)
      } else if (entry.isFile()) {
        if (entry.name.toLowerCase().endsWith('.xlsx') && !entry.name.startsWith('~$')) {
          const copied = copyFileSafe(srcChild, destChild)
          if (copied) count++
        }
      }
    }
  } catch (err) {
    console.error(`[backup] Error reading directory ${srcDir}:`, err)
  }

  return count
}

/** Run full mirror backup of Daily Logs (saveFolder) and Inventory (inventoryFolder) */
async function runBackup(saveFolder: string, backupFolder: string, inventoryFolder: string): Promise<BackupResult> {
  const now = new Date()
  let filesCopied = 0

  // 1. Mirror all Daily Log folders
  if (saveFolder && fs.existsSync(saveFolder)) {
    filesCopied += syncDirectoryRecursive(saveFolder, backupFolder)
  }

  // 2. Mirror entire Inventory folder (including year subfolders: 2023, 2026, etc.)
  if (inventoryFolder && fs.existsSync(inventoryFolder)) {
    const invDestDir = path.join(backupFolder, 'INVENTORY_BACKUP')
    filesCopied += syncDirectoryRecursive(inventoryFolder, invDestDir)
  }

  // 3. Mirror to Google Drive asynchronously
  const driveBase = 'A&G Daily Log Backups'

  async function uploadDirToDrive(localDir: string, currentDrivePath: string) {
    if (!fs.existsSync(localDir)) return
    try {
      const entries = fs.readdirSync(localDir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(localDir, entry.name)
        if (entry.isDirectory()) {
          if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
          await uploadDirToDrive(fullPath, `${currentDrivePath}/${entry.name}`)
        } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.xlsx') && !entry.name.startsWith('~$')) {
          await uploadToDrive(fullPath, currentDrivePath)
        }
      }
    } catch (e) {
      console.error('[backup] Drive sync directory error:', e)
    }
  }

  // Non-blocking upload to Drive
  uploadDirToDrive(backupFolder, driveBase).catch(e => console.error('[backup] Drive upload failed:', e))

  return { backupPath: backupFolder, filesCopied, timestamp: now.toISOString() }
}

let lastBackupDate = ''
let _backupInterval: ReturnType<typeof setInterval> | null = null

export function startAutoBackupScheduler(): void {
  _backupInterval = setInterval(() => {
    const now = new Date()
    const config = readConfig()
    const [targetHour, targetMin] = (config.backupTime || '19:00').split(':').map(Number)
    if (now.getHours() === targetHour && now.getMinutes() === targetMin) {
      const today = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
      if (lastBackupDate !== today && config.saveFolder && config.backupFolder) {
        lastBackupDate = today
        runBackup(config.saveFolder, config.backupFolder, config.inventoryFolder).catch(() => {})
      }
    }
  }, 60000) // check every minute
}

export function stopAutoBackupScheduler(): void {
  if (_backupInterval) {
    clearInterval(_backupInterval)
    _backupInterval = null
  }
}

function notifyBackupProgress(progress: FullBackupProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('backup:progress', progress)
    }
  }
}

/**
 * Runs full historical backup across all daily logs, item sales, and stock reports
 * with skip-if-exists deduplication and Google Drive synchronization.
 */
async function runFullBackup(backupFolder: string): Promise<BackupResult> {
  const config = readConfig()
  let createdCount = 0
  let skippedCount = 0
  let driveUploadedCount = 0
  const filesToUpload: { localPath: string; driveFolder: string }[] = []

  // Ensure root subdirectories exist
  const dailyLogsBaseDir = path.join(backupFolder, 'A&G Daily Logs')
  const itemSalesBaseDir = path.join(backupFolder, 'Item Sales')
  const stockReportBaseDir = path.join(backupFolder, 'Stock Report')

  if (!fs.existsSync(dailyLogsBaseDir)) fs.mkdirSync(dailyLogsBaseDir, { recursive: true })
  if (!fs.existsSync(itemSalesBaseDir)) fs.mkdirSync(itemSalesBaseDir, { recursive: true })
  if (!fs.existsSync(stockReportBaseDir)) fs.mkdirSync(stockReportBaseDir, { recursive: true })

  // Determine minYear and candidate months (default 2022 to present)
  const now = new Date()
  const maxYear = now.getFullYear()
  const maxMonth = now.getMonth() + 1
  let minYear = 2022

  try {
    const db = getLocalDb()
    const rMin = db.prepare(`SELECT MIN(date) as min_date FROM refill_sales_cache WHERE date IS NOT NULL AND length(date) >= 4`).get() as { min_date?: string } | undefined
    if (rMin?.min_date) {
      const y = parseInt(rMin.min_date.substring(0, 4), 10)
      if (y >= 2000 && y < minYear) minYear = y
    }
    const sMin = db.prepare(`SELECT MIN(date) as min_date FROM item_sales_cache WHERE date IS NOT NULL AND length(date) >= 4`).get() as { min_date?: string } | undefined
    if (sMin?.min_date) {
      const y = parseInt(sMin.min_date.substring(0, 4), 10)
      if (y >= 2000 && y < minYear) minYear = y
    }
  } catch (err) {
    console.warn('[backup] Local DB min date query error:', err)
  }

  if (isOnline()) {
    try {
      const sb = await getSupabase()
      const { data: firstRefill } = await sb.from('refill_sales').select('date').order('date', { ascending: true }).limit(1)
      if (firstRefill && firstRefill.length > 0 && firstRefill[0]?.date) {
        const y = parseInt(firstRefill[0].date.substring(0, 4), 10)
        if (y >= 2000 && y < minYear) minYear = y
      }
      const { data: firstItemSale } = await sb.from('item_sales').select('date').order('date', { ascending: true }).limit(1)
      if (firstItemSale && firstItemSale.length > 0 && firstItemSale[0]?.date) {
        const y = parseInt(firstItemSale[0].date.substring(0, 4), 10)
        if (y >= 2000 && y < minYear) minYear = y
      }
    } catch (err) {
      console.warn('[backup] Supabase min date query error:', err)
    }
  }

  // ── Phase 1: Water Daily Logs (Monthly Workbooks) ────────────────────────
  const candidateDailyMonths = new Set<string>()
  try {
    const db = getLocalDb()
    const rMonths = db.prepare(`SELECT DISTINCT substr(date, 1, 7) as m FROM refill_sales_cache WHERE date IS NOT NULL AND length(date) >= 7`).all() as { m: string }[]
    for (const r of rMonths) if (r.m && /^\d{4}-\d{2}$/.test(r.m)) candidateDailyMonths.add(r.m)
    const eMonths = db.prepare(`SELECT DISTINCT substr(date, 1, 7) as m FROM daily_expenses_cache WHERE date IS NOT NULL AND length(date) >= 7`).all() as { m: string }[]
    for (const e of eMonths) if (e.m && /^\d{4}-\d{2}$/.test(e.m)) candidateDailyMonths.add(e.m)
  } catch {}

  for (let y = minYear; y <= maxYear; y++) {
    const endM = (y === maxYear) ? maxMonth : 12
    for (let m = 1; m <= endM; m++) {
      candidateDailyMonths.add(`${y}-${String(m).padStart(2, '0')}`)
    }
  }

  const sortedDailyMonths = Array.from(candidateDailyMonths).sort()
  const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']

  for (let i = 0; i < sortedDailyMonths.length; i++) {
    const monthStr = sortedDailyMonths[i]
    const [yearStr, monthNumStr] = monthStr.split('-')
    const year = parseInt(yearStr, 10)
    const monthNum = parseInt(monthNumStr, 10)
    const mon = MONTHS[monthNum - 1] || 'JAN'
    const monthPadded = String(monthNum).padStart(2, '0')

    const fileName = `${monthPadded}. DAILY LOG (${mon})-${year}.xlsx`
    const yearFolder = path.join(dailyLogsBaseDir, String(year))
    const destPath = path.join(yearFolder, fileName)

    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
      skippedCount++
      notifyBackupProgress({
        phase: 'daily',
        current: i + 1,
        total: sortedDailyMonths.length,
        month: monthStr,
        file: fileName,
        message: `Existing log skipped: ${fileName}`
      })
      continue
    }

    notifyBackupProgress({
      phase: 'daily',
      current: i + 1,
      total: sortedDailyMonths.length,
      month: monthStr,
      file: fileName,
      message: `Checking database for Daily Log: ${monthStr}...`
    })

    try {
      const { wb, hasData } = await buildDailyLogWorkbook(year, monthNum, config)
      if (hasData) {
        if (!fs.existsSync(yearFolder)) fs.mkdirSync(yearFolder, { recursive: true })
        await wb.xlsx.writeFile(destPath)
        createdCount++
        filesToUpload.push({ localPath: destPath, driveFolder: `A&G Daily Log Backups/A&G Daily Logs/${year}` })
      }
    } catch (e) {
      console.error(`[backup] Failed to build daily log for ${monthStr}:`, e)
    }
  }

  // ── Phase 2: Monthly Item Sales Reports ──────────────────────────────────
  const candidateSalesMonths = new Set<string>()
  try {
    const db = getLocalDb()
    const sMonths = db.prepare(`SELECT DISTINCT substr(date, 1, 7) as m FROM item_sales_cache WHERE date IS NOT NULL AND length(date) >= 7`).all() as { m: string }[]
    for (const s of sMonths) if (s.m && /^\d{4}-\d{2}$/.test(s.m)) candidateSalesMonths.add(s.m)
  } catch {}

  for (let y = minYear; y <= maxYear; y++) {
    const endM = (y === maxYear) ? maxMonth : 12
    for (let m = 1; m <= endM; m++) {
      candidateSalesMonths.add(`${y}-${String(m).padStart(2, '0')}`)
    }
  }

  const sortedSalesMonths = Array.from(candidateSalesMonths).sort()

  for (let i = 0; i < sortedSalesMonths.length; i++) {
    const monthStr = sortedSalesMonths[i]
    const [yearStr, monthNumStr] = monthStr.split('-')
    const year = parseInt(yearStr, 10)
    const monthNum = parseInt(monthNumStr, 10)

    const fileName = `SALES REPORT (${monthStr}).xlsx`
    const yearFolder = path.join(itemSalesBaseDir, String(year))
    const destPath = path.join(yearFolder, fileName)

    if (fs.existsSync(destPath) && fs.statSync(destPath).size > 0) {
      skippedCount++
      notifyBackupProgress({
        phase: 'sales',
        current: i + 1,
        total: sortedSalesMonths.length,
        month: monthStr,
        file: fileName,
        message: `Existing sales report skipped: ${fileName}`
      })
      continue
    }

    notifyBackupProgress({
      phase: 'sales',
      current: i + 1,
      total: sortedSalesMonths.length,
      month: monthStr,
      file: fileName,
      message: `Checking database for Item Sales: ${monthStr}...`
    })

    try {
      const { wb, hasData } = await buildItemSalesWorkbook(year, monthNum, config)
      if (hasData) {
        if (!fs.existsSync(yearFolder)) fs.mkdirSync(yearFolder, { recursive: true })
        await wb.xlsx.writeFile(destPath)
        createdCount++
        filesToUpload.push({ localPath: destPath, driveFolder: `A&G Daily Log Backups/Item Sales/${year}` })
      }
    } catch (e) {
      console.error(`[backup] Failed to build item sales for ${monthStr}:`, e)
    }
  }

  // ── Phase 3: Stock Report ────────────────────────────────────────────────
  const todayStr = new Date().toISOString().substring(0, 10)
  const stockFileName = `STOCK REPORT (${todayStr}).xlsx`
  const stockDestPath = path.join(stockReportBaseDir, stockFileName)

  if (fs.existsSync(stockDestPath) && fs.statSync(stockDestPath).size > 0) {
    skippedCount++
    notifyBackupProgress({
      phase: 'stock',
      current: 1,
      total: 1,
      file: stockFileName,
      message: `Today's Stock Report already exists (skipped)`
    })
  } else {
    notifyBackupProgress({
      phase: 'stock',
      current: 1,
      total: 1,
      file: stockFileName,
      message: `Generating Stock Report for ${todayStr}...`
    })
    try {
      const { wb, hasData } = await buildStockReportWorkbook(config)
      if (hasData) {
        await wb.xlsx.writeFile(stockDestPath)
        createdCount++
        filesToUpload.push({ localPath: stockDestPath, driveFolder: 'A&G Daily Log Backups/Stock Report' })
      }
    } catch (e) {
      console.error(`[backup] Failed to build stock report:`, e)
    }
  }

  // ── Phase 4: Google Drive Sync ───────────────────────────────────────────
  const client = getOAuth2Client()
  const isDriveConnected = Boolean(client && client.credentials && client.credentials.access_token)

  if (isDriveConnected) {
    if (filesToUpload.length > 0) {
      for (let i = 0; i < filesToUpload.length; i++) {
        const item = filesToUpload[i]
        const baseName = path.basename(item.localPath)
        notifyBackupProgress({
          phase: 'drive',
          current: i + 1,
          total: filesToUpload.length,
          file: baseName,
          message: `Uploading to Google Drive (${i + 1}/${filesToUpload.length}): ${baseName}`
        })
        try {
          const uploaded = await uploadToDrive(item.localPath, item.driveFolder)
          if (uploaded) driveUploadedCount++
        } catch (e) {
          console.warn(`[backup] Failed to upload ${baseName} to Google Drive:`, e)
        }
      }
    } else {
      notifyBackupProgress({
        phase: 'drive',
        current: 1,
        total: 1,
        message: 'Google Drive connected. All files already up to date.'
      })
    }
  }

  notifyBackupProgress({
    phase: 'done',
    message: `Full Historical Backup completed. Created ${createdCount} file(s), skipped ${skippedCount} existing.`
  })

  return {
    backupPath: backupFolder,
    filesCopied: createdCount,
    skipped: skippedCount,
    driveUploaded: driveUploadedCount,
    timestamp: new Date().toISOString()
  }
}

export function registerBackupIpc(): void {
  /** Choose backup folder and persist it to config */
  ipcMain.handle('backup:chooseFolder', async (): Promise<IpcResult<string>> => {
    try {
      const result = await dialog.showOpenDialog({
        title: 'Select Backup Folder',
        properties: ['openDirectory', 'createDirectory'],
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, error: 'cancelled' }
      }
      const folder = result.filePaths[0]
      const config = readConfig()
      writeConfig({ ...config, backupFolder: folder })
      return { ok: true, data: folder }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  /** Clear the backup folder (disables auto-backup) */
  ipcMain.handle('backup:clearFolder', (): IpcResult<void> => {
    try {
      const config = readConfig()
      writeConfig({ ...config, backupFolder: '' })
      return { ok: true, data: undefined }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  /** Manual backup: user-triggered from Settings / History */
  ipcMain.handle('backup:create', async (): Promise<IpcResult<BackupResult>> => {
    try {
      const config = readConfig()
      if (!config.saveFolder) return { ok: false, error: 'No save folder configured.' }
      if (!config.backupFolder) return { ok: false, error: 'No backup folder configured. Set one in Settings first.' }
      if (!fs.existsSync(config.backupFolder)) {
        return { ok: false, error: 'Backup folder no longer exists. Please choose a new one in Settings.' }
      }
      const result = await runBackup(config.saveFolder, config.backupFolder, config.inventoryFolder)
      return { ok: true, data: result }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  /** Open backup folder in File Explorer */
  ipcMain.handle('backup:openFolder', (): void => {
    const cfg = readConfig()
    if (cfg.backupFolder) shell.openPath(cfg.backupFolder)
  })

  /** Get current backup folder path */
  ipcMain.handle('backup:getFolder', (): IpcResult<string> => {
    try {
      return { ok: true, data: readConfig().backupFolder ?? '' }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  /** Full historical backup of all database logs from 2022 to present */
  ipcMain.handle('backup:fullBackup', async (): Promise<IpcResult<BackupResult>> => {
    try {
      const config = readConfig()
      if (!config.backupFolder) {
        return { ok: false, error: 'No backup folder configured. Please select a backup folder in Settings first.' }
      }
      if (!fs.existsSync(config.backupFolder)) {
        try {
          fs.mkdirSync(config.backupFolder, { recursive: true })
        } catch {
          return { ok: false, error: 'Backup folder no longer exists. Please choose a new one in Settings.' }
        }
      }
      const result = await runFullBackup(config.backupFolder)
      return { ok: true, data: result }
    } catch (e: unknown) {
      console.error('[backup] Full backup failed:', e)
      return { ok: false, error: String(e) }
    }
  })
}

/** Auto-backup: silently called after a successful save. Errors do not throw. */
export async function autoBackup(): Promise<void> {
  try {
    const config = readConfig()
    if (!config.saveFolder || !config.backupFolder) return
    if (!fs.existsSync(config.backupFolder)) return
    await runBackup(config.saveFolder, config.backupFolder, config.inventoryFolder)
  } catch {
    // Silent — never block the user's save
  }
}
