import dotenv from 'dotenv'
dotenv.config()

import { app, BrowserWindow, Menu, shell } from 'electron'
import * as path from 'path'
import { fileURLToPath } from 'url'

// ── Global Exception Safety Nets ─────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[main] Uncaught Exception:', err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[main] Unhandled Promise Rejection:', reason)
})

// ── Single-Instance Lock ──────────────────────────────────────────────────────
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  console.log('[main] Another instance is already running. Quitting duplicate instance.')
  app.quit()
} else {
  app.on('second-instance', () => {
    const wins = BrowserWindow.getAllWindows()
    if (wins.length > 0) {
      const mainWin = wins[0]
      if (mainWin.isMinimized()) mainWin.restore()
      mainWin.focus()
    }
  })
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
import { registerSettingsIpc } from './ipc/settingsIpc'
import { registerDraftIpc }    from './ipc/draftIpc'
import { registerDayIpc }      from './ipc/dayIpc'
import { registerHistoryIpc }  from './ipc/historyIpc'
import { registerBackupIpc, startAutoBackupScheduler, stopAutoBackupScheduler } from './ipc/backupIpc'
import { registerLogIpc }      from './ipc/logIpc'
import { registerGoogleDriveIpc } from './ipc/googleDriveIpc'
import { registerInventoryIpc } from './ipc/inventoryIpc'
import { registerItemSalesIpc } from './ipc/itemSalesIpc'
import { registerStockReportIpc } from './ipc/stockReportIpc'
import { registerStockDbIpc } from './ipc/stockDbIpc'
import { registerExportIpc } from './ipc/exportIpc'
import { registerAnalyticsIpc } from './ipc/analyticsIpc'
import { registerUpdateIpc, initAutoUpdater } from './ipc/updateIpc'
import { startSyncEngine, stopSyncEngine, registerConnectivityIpc, drainQueue } from './store/syncEngine'
import { runInitialSync } from './store/initialSync'
import { closeDatabase } from './store/localDb'

// Register all IPC handlers before any window opens
registerSettingsIpc()
registerDraftIpc()
registerDayIpc()
registerHistoryIpc()
registerBackupIpc()
registerLogIpc()
registerGoogleDriveIpc()
registerInventoryIpc()
registerItemSalesIpc()
registerStockReportIpc()
registerStockDbIpc()
registerExportIpc()
registerAnalyticsIpc()
registerConnectivityIpc()
registerUpdateIpc()

// Initialize background auto-updater
initAutoUpdater()

// Start the background cron job for auto-backups at 7:00 PM
startAutoBackupScheduler()

// Start the offline sync engine (polls connectivity every 15s and drains queue on reconnect)
startSyncEngine()

// Populate local cache from Supabase in the background (non-blocking)
runInitialSync().catch(e => console.warn('[main] initialSync error:', e))

function createWindow(): void {
  Menu.setApplicationMenu(null)

  const win = new BrowserWindow({
    width:  1280,
    height: 800,
    minWidth:  900,
    minHeight: 600,
    title: 'Water Refill Daily Log',
    icon: path.join(__dirname, '../../resources/icon.png'),
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  // Route external URLs safely to OS browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:') || url.startsWith('http:')) {
      shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    // Dev mode: load from Vite dev server
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
    win.webContents.openDevTools()
  } else {
    // Production: load bundled HTML
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  if (gotTheLock) {
    createWindow()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && gotTheLock) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ── Graceful shutdown ─────────────────────────────────────────────────────────
// Ensures the SQLite WAL is fully flushed, the sync queue is drained, and
// all background timers are cleared before the process exits.
app.on('before-quit', (event) => {
  event.preventDefault()

  async function shutdown(): Promise<void> {
    console.log('[main] Shutting down — stopping timers…')

    // 1. Stop background timers
    stopSyncEngine()
    try { stopAutoBackupScheduler() } catch {}

    // 2. Drain any remaining sync queue (max 5 seconds)
    try {
      const drainTimeout = new Promise<void>(resolve => setTimeout(resolve, 5000))
      const drain = drainQueue().then(() => {})
      await Promise.race([drain, drainTimeout])
    } catch (e) {
      console.warn('[main] Queue drain on shutdown failed (non-fatal):', e)
    }

    // 3. Close SQLite connection cleanly (flushes WAL)
    try { closeDatabase() } catch {}

    console.log('[main] Shutdown complete.')
    app.exit(0)
  }

  shutdown().catch(e => {
    console.error('[main] Shutdown error:', e)
    app.exit(1)
  })
})
