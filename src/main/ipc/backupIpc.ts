import { ipcMain, dialog, shell } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import { uploadToDrive } from './googleDriveIpc'
import type { IpcResult, BackupResult } from '../../shared/types'
import { readConfig, writeConfig } from '../store/config'

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
