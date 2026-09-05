import { app, ipcMain, BrowserWindow } from 'electron'
import electronUpdater from 'electron-updater'
import type { IpcResult } from '../../shared/types'

// Handle default or named export gracefully across Vite/Rollup ESM bundles
const autoUpdater = (electronUpdater as any).autoUpdater || (electronUpdater as any).default?.autoUpdater || electronUpdater

export interface UpdateProgress {
  percent: number
  bytesPerSecond: number
  transferred: number
  total: number
}

export type UpdateStateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateState {
  status: UpdateStateStatus
  currentVersion: string
  availableVersion?: string
  releaseDate?: string
  releaseNotes?: string
  progress?: UpdateProgress
  error?: string
  lastChecked?: string
}

let updateState: UpdateState = {
  status: 'idle',
  currentVersion: app.getVersion()
}

let isInitialized = false

function broadcastState(): void {
  const payload = { ...updateState, currentVersion: app.getVersion() }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) {
      win.webContents.send('update:status', payload)
    }
  }
}

export function registerUpdateIpc(): void {
  // Return current application version
  ipcMain.handle('app:getVersion', () => {
    return app.getVersion()
  })

  // Get current update status/cached state
  ipcMain.handle('update:getState', (): IpcResult<UpdateState> => {
    return {
      ok: true,
      data: {
        ...updateState,
        currentVersion: app.getVersion()
      }
    }
  })

  // Trigger a check for updates
  ipcMain.handle('update:check', async (): Promise<IpcResult<{ updateAvailable: boolean; version?: string; message?: string }>> => {
    console.log('[autoUpdater] Manual check requested. Packaged:', app.isPackaged)

    if (!app.isPackaged) {
      updateState = {
        ...updateState,
        status: 'not-available',
        lastChecked: new Date().toISOString()
      }
      broadcastState()
      return {
        ok: true,
        data: {
          updateAvailable: false,
          version: app.getVersion(),
          message: 'Development mode active (unpackaged). Auto-updates operate on production installer builds.'
        }
      }
    }

    try {
      updateState = {
        ...updateState,
        status: 'checking',
        error: undefined
      }
      broadcastState()

      const result = await autoUpdater.checkForUpdates()
      const isAvailable = Boolean(result && result.updateInfo && result.updateInfo.version !== app.getVersion())

      return {
        ok: true,
        data: {
          updateAvailable: isAvailable,
          version: result?.updateInfo?.version
        }
      }
    } catch (err: any) {
      console.error('[autoUpdater] Check for updates failed:', err)
      updateState = {
        ...updateState,
        status: 'error',
        error: err?.message || 'Failed to check for updates'
      }
      broadcastState()
      return {
        ok: false,
        error: err?.message || 'Failed to check for updates'
      }
    }
  })

  // Restart and apply the downloaded update
  ipcMain.handle('update:install', async (): Promise<IpcResult<void>> => {
    console.log('[autoUpdater] Restart & Install requested')
    if (updateState.status !== 'downloaded') {
      return { ok: false, error: 'No update has been downloaded yet.' }
    }

    // Give renderer brief moment before quit
    setTimeout(() => {
      try {
        autoUpdater.quitAndInstall(false, true)
      } catch (err: any) {
        console.error('[autoUpdater] quitAndInstall error:', err)
      }
    }, 500)

    return { ok: true, data: undefined }
  })
}

export function initAutoUpdater(): void {
  if (isInitialized) return
  isInitialized = true

  try {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.allowPrerelease = false

    // Explicitly configure GitHub Releases provider
    autoUpdater.setFeedURL({
      provider: 'github',
      owner: 'kyber0',
      repo: 'A-G-Daily-Log'
    })

    autoUpdater.on('checking-for-update', () => {
      console.log('[autoUpdater] Checking for update...')
      updateState = {
        ...updateState,
        status: 'checking',
        error: undefined
      }
      broadcastState()
    })

    autoUpdater.on('update-available', (info: any) => {
      console.log('[autoUpdater] Update available:', info?.version)
      updateState = {
        ...updateState,
        status: 'available',
        availableVersion: info?.version,
        releaseDate: info?.releaseDate,
        releaseNotes: typeof info?.releaseNotes === 'string' ? info.releaseNotes : undefined,
        lastChecked: new Date().toISOString()
      }
      broadcastState()
    })

    autoUpdater.on('update-not-available', (info: any) => {
      console.log('[autoUpdater] Update not available. Current is latest:', info?.version)
      updateState = {
        ...updateState,
        status: 'not-available',
        availableVersion: info?.version,
        lastChecked: new Date().toISOString()
      }
      broadcastState()
    })

    autoUpdater.on('download-progress', (progress: any) => {
      const roundedPercent = Math.round((progress.percent || 0) * 10) / 10
      console.log(`[autoUpdater] Download progress: ${roundedPercent}%`)
      updateState = {
        ...updateState,
        status: 'downloading',
        progress: {
          percent: roundedPercent,
          bytesPerSecond: progress.bytesPerSecond || 0,
          transferred: progress.transferred || 0,
          total: progress.total || 0
        }
      }
      broadcastState()
    })

    autoUpdater.on('update-downloaded', (info: any) => {
      console.log('[autoUpdater] Update downloaded successfully:', info?.version)
      updateState = {
        ...updateState,
        status: 'downloaded',
        availableVersion: info?.version,
        releaseDate: info?.releaseDate,
        progress: {
          percent: 100,
          bytesPerSecond: 0,
          transferred: updateState.progress?.total || 0,
          total: updateState.progress?.total || 0
        }
      }
      broadcastState()
    })

    autoUpdater.on('error', (err: any) => {
      console.warn('[autoUpdater] Error event:', err?.message || err)
      // Only set error state if not unpackaged error
      updateState = {
        ...updateState,
        status: 'error',
        error: err?.message || 'Error occurred during auto-update'
      }
      broadcastState()
    })

    // If running in packaged production build, check 10 seconds after launch
    if (app.isPackaged) {
      setTimeout(() => {
        console.log('[autoUpdater] Initial background update check running...')
        autoUpdater.checkForUpdates().catch((err: any) => {
          console.warn('[autoUpdater] Initial background check error:', err?.message || err)
        })
      }, 10000)

      // Background periodic check every 4 hours
      setInterval(() => {
        console.log('[autoUpdater] Periodic background update check running...')
        autoUpdater.checkForUpdates().catch((err: any) => {
          console.warn('[autoUpdater] Periodic check error:', err?.message || err)
        })
      }, 4 * 60 * 60 * 1000)
    }
  } catch (err: any) {
    console.error('[autoUpdater] Failed to initialize autoUpdater:', err)
  }
}
