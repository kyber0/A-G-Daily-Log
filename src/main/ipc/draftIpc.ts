import { ipcMain, app } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { SaleRow, DraftPayload } from '../../shared/types'

const draftsDir = (): string => path.join(app.getPath('userData'), 'drafts')

function draftPath(date: string): string {
  return path.join(draftsDir(), `${date}.json`)
}

export function registerDraftIpc(): void {
  ipcMain.handle('getDraft', (_event, date: string): { ok: boolean; data: DraftPayload | null; error?: string } => {
    try {
      const p = draftPath(date)
      if (!fs.existsSync(p)) return { ok: true, data: null }
      const raw = fs.readFileSync(p, 'utf-8')
      return { ok: true, data: JSON.parse(raw) as DraftPayload }
    } catch (e: unknown) {
      return { ok: false, data: null, error: String(e) }
    }
  })

  ipcMain.handle('saveDraft', (_event, date: string, rows: SaleRow[]): void => {
    try {
      fs.mkdirSync(draftsDir(), { recursive: true })
      const payload: DraftPayload = { date, rows, savedAt: new Date().toISOString() }
      fs.writeFileSync(draftPath(date), JSON.stringify(payload, null, 2), 'utf-8')
    } catch {
      // silent fail — draft is best-effort
    }
  })

  ipcMain.handle('clearDraft', (_event, date: string): void => {
    try {
      const p = draftPath(date)
      if (fs.existsSync(p)) fs.unlinkSync(p)
    } catch {
      // silent fail
    }
  })
}
