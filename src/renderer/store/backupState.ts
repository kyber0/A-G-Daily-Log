import type { FullBackupProgress, BackupResult, IpcResult } from '../../shared/types'

export interface FullBackupState {
  isRunning: boolean
  phase: 'idle' | 'daily' | 'sales' | 'stock' | 'drive' | 'done' | 'error'
  phaseText: string
  pct: number
  message: string
  error?: string
  result?: BackupResult
}

let currentState: FullBackupState = {
  isRunning: false,
  phase: 'idle',
  phaseText: '',
  pct: 0,
  message: ''
}

const listeners = new Set<(s: FullBackupState) => void>()

export function getFullBackupState(): FullBackupState {
  return { ...currentState }
}

export function subscribeFullBackup(fn: (s: FullBackupState) => void): () => void {
  listeners.add(fn)
  try {
    fn(getFullBackupState())
  } catch (e) {
    console.error('[backupState] error in subscriber:', e)
  }
  return () => {
    listeners.delete(fn)
  }
}

function notifyListeners() {
  const snapshot = getFullBackupState()
  listeners.forEach(fn => {
    try {
      fn(snapshot)
    } catch (e) {
      console.error('[backupState] listener error:', e)
    }
  })
}

function updateState(partial: Partial<FullBackupState>) {
  currentState = { ...currentState, ...partial }
  notifyListeners()
}

function handleProgressPayload(data: FullBackupProgress) {
  if (!data) return
  let phaseText = currentState.phaseText
  let pct = currentState.pct

  if (data.phase === 'daily') {
    phaseText = `Daily Logs (${data.current || 0}/${data.total || 0})`
    if (data.total && data.current) {
      pct = Math.round((data.current / data.total) * 40)
    }
  } else if (data.phase === 'sales') {
    phaseText = `Item Sales (${data.current || 0}/${data.total || 0})`
    if (data.total && data.current) {
      pct = 40 + Math.round((data.current / data.total) * 35)
    }
  } else if (data.phase === 'stock') {
    phaseText = 'Stock Report'
    pct = 78
  } else if (data.phase === 'drive') {
    phaseText = `Google Drive Sync (${data.current || 0}/${data.total || 0})`
    if (data.total && data.current) {
      pct = 80 + Math.round((data.current / data.total) * 20)
    }
  } else if (data.phase === 'done') {
    phaseText = 'Backup Complete'
    pct = 100
  }

  updateState({
    isRunning: data.phase !== 'done',
    phase: data.phase,
    phaseText,
    pct,
    message: data.message || currentState.message
  })
}

let isInitialized = false

export function initBackupStateListener(): void {
  if (isInitialized) return
  isInitialized = true

  // Initial check: is a backup already running in the background?
  if (window.api?.getFullBackupStatus) {
    window.api.getFullBackupStatus().then((res) => {
      if (res?.isRunning) {
        if (res.progress) {
          handleProgressPayload(res.progress)
        } else {
          updateState({
            isRunning: true,
            phase: 'daily',
            phaseText: 'Backup in progress...',
            pct: 10,
            message: 'Processing records...'
          })
        }
      }
    }).catch(() => {})
  }

  window.api?.on('backup:progress', (data: FullBackupProgress) => {
    handleProgressPayload(data)
  })
}

export async function triggerFullBackup(): Promise<IpcResult<BackupResult>> {
  if (currentState.isRunning) {
    return { ok: false, error: 'A full backup is already in progress.' }
  }

  updateState({
    isRunning: true,
    phase: 'daily',
    phaseText: 'Initializing backup...',
    pct: 0,
    message: 'Scanning database records from 2022 to present...',
    error: undefined,
    result: undefined
  })

  try {
    const res = await window.api.createFullBackup()
    if (res.ok) {
      updateState({
        isRunning: false,
        phase: 'done',
        phaseText: 'Backup completed successfully',
        pct: 100,
        result: res.data,
        message: `Created ${res.data.filesCopied} new file(s), skipped ${res.data.skipped || 0} existing.`
      })
      return res
    } else {
      updateState({
        isRunning: false,
        phase: 'error',
        phaseText: 'Backup failed',
        error: res.error,
        message: res.error || 'An error occurred during backup'
      })
      return res
    }
  } catch (err: any) {
    const errorMsg = err?.message || String(err)
    updateState({
      isRunning: false,
      phase: 'error',
      phaseText: 'Backup error',
      error: errorMsg,
      message: errorMsg
    })
    return { ok: false, error: errorMsg }
  }
}
