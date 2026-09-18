import { Icons } from './icons'
import { subscribeFullBackup, FullBackupState } from '../store/backupState'

let widgetEl: HTMLElement | null = null
let autoDismissTimer: any = null

export function initGlobalBackupWidget(onNavigateToSettingsBackup: () => void): void {
  if (widgetEl) return

  widgetEl = document.createElement('div')
  widgetEl.id = 'global-backup-widget'
  widgetEl.className = 'global-backup-widget hidden'
  document.body.appendChild(widgetEl)

  // Listen to state changes
  subscribeFullBackup((state: FullBackupState) => {
    renderWidget(state, onNavigateToSettingsBackup)
  })
}

function renderWidget(state: FullBackupState, onNavigateToSettingsBackup: () => void): void {
  if (!widgetEl) return

  // 1. Idle state -> hide widget
  if (state.phase === 'idle') {
    widgetEl.classList.add('hidden')
    document.body.classList.remove('backup-widget-active')
    return
  }

  // 2. Running state
  if (state.isRunning) {
    if (autoDismissTimer) {
      clearTimeout(autoDismissTimer)
      autoDismissTimer = null
    }

    widgetEl.classList.remove('hidden', 'gbw-done', 'gbw-error')
    document.body.classList.add('backup-widget-active')

    // If structure already exists, do in-place updates for performance and smooth transitions
    const titleEl = widgetEl.querySelector<HTMLElement>('#gbw-phase-title')
    const pctEl = widgetEl.querySelector<HTMLElement>('#gbw-pct')
    const barFillEl = widgetEl.querySelector<HTMLElement>('#gbw-bar-fill')
    const msgEl = widgetEl.querySelector<HTMLElement>('#gbw-msg')
    const iconBox = widgetEl.querySelector<HTMLElement>('#gbw-icon')

    if (titleEl && pctEl && barFillEl && msgEl && iconBox) {
      titleEl.textContent = state.phaseText || 'Backing up history...'
      pctEl.textContent = `${state.pct}%`
      barFillEl.style.width = `${state.pct}%`
      msgEl.textContent = state.message || 'Processing database records...'
      return
    }

    // Otherwise render full markup
    widgetEl.innerHTML = `
      <div class="gbw-top">
        <div class="gbw-title-wrap">
          <span id="gbw-icon" class="gbw-icon">
            <span class="spinner" style="width:14px;height:14px;display:inline-block;border-width:2px;vertical-align:middle;"></span>
          </span>
          <span id="gbw-phase-title" class="gbw-title">${state.phaseText || 'Backing up history...'}</span>
        </div>
        <span id="gbw-pct" class="gbw-pct">${state.pct}%</span>
      </div>

      <div class="gbw-bar-track">
        <div id="gbw-bar-fill" class="gbw-bar-fill" style="width: ${state.pct}%;"></div>
      </div>

      <div class="gbw-footer">
        <span id="gbw-msg" class="gbw-msg">${state.message || 'Processing database records...'}</span>
        <button type="button" id="gbw-view-btn" class="gbw-nav-btn">View in Settings</button>
      </div>
    `

    widgetEl.querySelector('#gbw-view-btn')?.addEventListener('click', () => {
      onNavigateToSettingsBackup()
    })
    return
  }

  // 3. Completed state
  if (state.phase === 'done') {
    widgetEl.classList.remove('hidden', 'gbw-error')
    widgetEl.classList.add('gbw-done')
    document.body.classList.add('backup-widget-active')

    widgetEl.innerHTML = `
      <div class="gbw-top">
        <div class="gbw-title-wrap">
          <span class="gbw-icon" style="color:var(--clr-success);display:inline-flex;align-items:center;">
            ${Icons.checkCircle}
          </span>
          <span class="gbw-title">Backup Complete</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span class="gbw-pct" style="color:var(--clr-success);">100%</span>
          <button type="button" id="gbw-close-btn" class="gbw-close-btn" title="Dismiss" aria-label="Dismiss">${Icons.x}</button>
        </div>
      </div>

      <div class="gbw-bar-track">
        <div class="gbw-bar-fill" style="width: 100%;"></div>
      </div>

      <div class="gbw-footer">
        <span class="gbw-msg">${state.message || 'All historical records saved.'}</span>
        <button type="button" id="gbw-view-btn" class="gbw-nav-btn">View in Settings</button>
      </div>
    `

    widgetEl.querySelector('#gbw-close-btn')?.addEventListener('click', () => {
      dismissWidget()
    })

    widgetEl.querySelector('#gbw-view-btn')?.addEventListener('click', () => {
      onNavigateToSettingsBackup()
    })

    // Auto-dismiss after 6 seconds
    if (autoDismissTimer) clearTimeout(autoDismissTimer)
    autoDismissTimer = setTimeout(() => {
      dismissWidget()
    }, 6500)
    return
  }

  // 4. Error state
  if (state.phase === 'error') {
    widgetEl.classList.remove('hidden', 'gbw-done')
    widgetEl.classList.add('gbw-error')
    document.body.classList.add('backup-widget-active')

    widgetEl.innerHTML = `
      <div class="gbw-top">
        <div class="gbw-title-wrap">
          <span class="gbw-icon" style="color:var(--clr-error);display:inline-flex;align-items:center;">
            ${Icons.alertTriangle}
          </span>
          <span class="gbw-title">Backup Failed</span>
        </div>
        <button type="button" id="gbw-close-btn" class="gbw-close-btn" title="Dismiss" aria-label="Dismiss">${Icons.x}</button>
      </div>

      <div class="gbw-bar-track">
        <div class="gbw-bar-fill" style="width: 100%;"></div>
      </div>

      <div class="gbw-footer">
        <span class="gbw-msg">${state.error || state.message || 'An error occurred'}</span>
        <button type="button" id="gbw-view-btn" class="gbw-nav-btn">View in Settings</button>
      </div>
    `

    widgetEl.querySelector('#gbw-close-btn')?.addEventListener('click', () => {
      dismissWidget()
    })

    widgetEl.querySelector('#gbw-view-btn')?.addEventListener('click', () => {
      onNavigateToSettingsBackup()
    })
  }
}

function dismissWidget(): void {
  if (autoDismissTimer) {
    clearTimeout(autoDismissTimer)
    autoDismissTimer = null
  }
  widgetEl?.classList.add('hidden')
  document.body.classList.remove('backup-widget-active')
}
