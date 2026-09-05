import { ipcMain, dialog, shell, BrowserWindow } from 'electron'
import type { AppConfig, IpcResult } from '../../shared/types'
import { readConfig, writeConfig } from '../store/config'
import { testSupabaseAuth } from '../supabase/client'

export function registerSettingsIpc(): void {
  ipcMain.handle('getSettings', (): IpcResult<AppConfig> => {
    try {
      return { ok: true, data: readConfig() }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle('updateSettings', (_event, partial: Partial<AppConfig>): IpcResult<AppConfig> => {
    try {
      const current = readConfig()
      const updated = { ...current, ...partial }
      writeConfig(updated)
      return { ok: true, data: updated }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle('testSupabaseAuth', async (
    _event,
    creds: { url: string; anonKey: string; email: string; password: string }
  ): Promise<IpcResult<void>> => {
    try {
      const res = await testSupabaseAuth(creds.url, creds.anonKey, creds.email, creds.password)
      if (!res.ok) {
        return { ok: false, error: res.error || 'Authentication failed.' }
      }
      return { ok: true, data: undefined }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  /** Open folder dialog and return selected path without mutating config directly */
  ipcMain.handle('chooseFolder', async (_event, title?: string): Promise<IpcResult<string>> => {
    try {
      const win = BrowserWindow.getFocusedWindow() || undefined
      const result = await dialog.showOpenDialog(win as any, {
        title: title || 'Select Folder',
        properties: ['openDirectory', 'createDirectory'],
      })
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: false, error: 'cancelled' }
      }
      return { ok: true, data: result.filePaths[0] }
    } catch (e: unknown) {
      return { ok: false, error: String(e) }
    }
  })

  ipcMain.handle('openSaveFolder', (): void => {
    const cfg = readConfig()
    if (cfg.saveFolder) shell.openPath(cfg.saveFolder)
  })
}
