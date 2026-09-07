import type { AppConfig, HistoryDay, BackupResult, SaleRow } from '../shared/types'
import { renderFirstLaunch }   from './screens/firstLaunch'
import { renderEntryScreen }   from './screens/entry'
import { renderSettingsScreen } from './screens/settings'
import { renderHistoryScreen }  from './screens/history'
import { Icons } from './components/icons'
import { showToast } from './components/ui'
import { initConnectivityBanner } from './components/connectivityBanner'

import logoImg from './assets/logo.png'

// Offline fonts
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'


// ─── App state ────────────────────────────────────────────────────────────────
let currentConfig: AppConfig | null = null
type Screen = 'entry' | 'history' | 'analytics' | 'settings' | 'logs' | 'inventory' | 'item-sales' | 'sales-report'
let activeScreen: Screen = 'entry'

// ─── Update Modal & Progress Pill ─────────────────────────────────────────────
let _dismissedUpdateVersion = ''

function showUpdateModal(payload: any): void {
  const existing = document.getElementById('update-modal-overlay')
  if (existing) existing.remove()

  const ver = payload.availableVersion || ''
  const currentVer = payload.currentVersion || ''
  const isDownloaded = payload.status === 'downloaded'

  // Don't re-show if the user already dismissed this version (unless ready to install)
  if (_dismissedUpdateVersion === ver && !isDownloaded) return

  const overlay = document.createElement('div')
  overlay.id = 'update-modal-overlay'

  // Format release notes
  let notesHtml = ''
  if (payload.releaseNotes && typeof payload.releaseNotes === 'string') {
    const lines = payload.releaseNotes.split('\n').map((l: string) => l.trim()).filter(Boolean)
    const bulletItems = lines.map((l: string) => {
      const clean = l.replace(/^[\*\-\•]\s*/, '')
      return `<li>${clean}</li>`
    }).join('')
    notesHtml = `<ul class="update-modal-notes-list">${bulletItems}</ul>`
  } else {
    notesHtml = `
      <ul class="update-modal-notes-list">
        <li>Includes the latest system performance improvements and bug fixes.</li>
        <li>Automated silent background updates and encrypted security hardening.</li>
        <li>Enhanced Google Drive backups and cloud synchronization.</li>
      </ul>
    `
  }

  overlay.innerHTML = `
    <div class="update-modal">
      <div class="update-modal-glow"></div>
      <button class="update-modal-close-btn" id="update-modal-close" title="Dismiss">&times;</button>

      <div class="update-modal-header">
        <div class="update-modal-icon-badge">
          ${isDownloaded ? `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
              <polyline points="22 4 12 14.01 9 11.01"/>
            </svg>
          ` : `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2v8m0 0l-3-3m3 3l3-3"/>
              <rect x="3" y="14" width="18" height="8" rx="3"/>
            </svg>
          `}
        </div>

        <div class="update-modal-badge-pill">
          <span class="update-modal-pulse-dot" style="${isDownloaded ? 'background:#10b981;box-shadow:0 0 8px #10b981;' : ''}"></span>
          <span>${isDownloaded ? 'READY TO INSTALL' : 'NEW UPDATE AVAILABLE'}</span>
        </div>

        <h2 class="update-modal-title">
          ${isDownloaded ? 'Update Ready to Install' : `A&G Daily Log v${ver}`}
        </h2>

        <div class="update-modal-versions">
          ${currentVer ? `<span class="update-version-badge update-version-old">Current: v${currentVer}</span>` : ''}
          <span class="update-version-arrow">➔</span>
          <span class="update-version-badge update-version-new">New: v${ver}</span>
        </div>
      </div>

      <div class="update-modal-body">
        <div class="update-modal-notes-card">
          <div class="update-modal-notes-header">
            ${Icons.clipboardList}
            <span>Release Highlights</span>
          </div>
          ${notesHtml}
        </div>

        <p class="update-modal-hint">
          ${isDownloaded
            ? 'The update is completely downloaded. Click <strong>Restart &amp; Install</strong> to apply it instantly in the background.'
            : 'Accepting will download the update quietly in the top-right corner. You can continue using the app without interruption.'}
        </p>
      </div>

      <div class="update-modal-actions">
        ${isDownloaded ? `
          <button id="update-modal-later" class="btn btn-ghost update-btn-later">Later</button>
          <button id="update-modal-install" class="btn btn-primary update-btn-accept" style="background:linear-gradient(135deg, #10b981, #059669);box-shadow:0 4px 16px rgba(16,185,129,0.35);">
            ${Icons.refreshCw} Restart &amp; Install Now
          </button>
        ` : `
          <button id="update-modal-later" class="btn btn-ghost update-btn-later">Remind Me Later</button>
          <button id="update-modal-accept" class="btn btn-primary update-btn-accept">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Accept &amp; Download Update
          </button>
        `}
      </div>
    </div>
  `

  document.body.appendChild(overlay)

  const closeModal = () => {
    overlay.classList.add('closing')
    setTimeout(() => overlay.remove(), 200)
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      _dismissedUpdateVersion = ver
      closeModal()
    }
  })

  document.getElementById('update-modal-close')?.addEventListener('click', () => {
    _dismissedUpdateVersion = ver
    closeModal()
  })

  document.getElementById('update-modal-later')?.addEventListener('click', () => {
    _dismissedUpdateVersion = ver
    closeModal()
  })

  document.getElementById('update-modal-accept')?.addEventListener('click', async () => {
    _dismissedUpdateVersion = ver
    closeModal()
    showToast(`Downloading update v${ver}...`, 'info')
    await window.api.downloadUpdate()
  })

  document.getElementById('update-modal-install')?.addEventListener('click', async () => {
    closeModal()
    showToast('Restarting application to apply update...', 'info')
    await window.api.installUpdate()
  })
}

function updateProgressPill(payload: any): void {
  let pill = document.getElementById('update-progress-pill')

  if (payload?.status !== 'downloading' && payload?.status !== 'downloaded') {
    pill?.remove()
    return
  }

  if (!pill) {
    pill = document.createElement('div')
    pill.id = 'update-progress-pill'
    document.body.appendChild(pill)
  }

  const ver = payload.availableVersion || ''

  if (payload.status === 'downloaded') {
    pill.innerHTML = `
      <div class="upp-ready-card">
        <div class="upp-header-left">
          <div class="upp-ready-badge">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div class="upp-titles">
            <span class="upp-title">Update Ready</span>
            <span class="upp-sub">v${ver} downloaded</span>
          </div>
        </div>
        <button id="upp-btn-restart" class="upp-ready-btn">Restart Now</button>
      </div>
    `
    document.getElementById('upp-btn-restart')?.addEventListener('click', async () => {
      pill?.remove()
      await window.api.installUpdate()
    })
    return
  }

  // Downloading state
  const pct = Math.min(100, Math.max(0, Math.round(payload.progress?.percent ?? 0)))
  const mbps = payload.progress?.bytesPerSecond
    ? `${(payload.progress.bytesPerSecond / (1024 * 1024)).toFixed(1)} MB/s`
    : ''
  const transferred = payload.progress?.transferred
    ? `${(payload.progress.transferred / (1024 * 1024)).toFixed(1)} MB`
    : ''
  const total = payload.progress?.total
    ? `${(payload.progress.total / (1024 * 1024)).toFixed(1)} MB`
    : ''

  pill.innerHTML = `
    <div class="upp-header">
      <div class="upp-header-left">
        <div class="upp-icon-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <polyline points="19 12 12 19 5 12"/>
          </svg>
        </div>
        <div class="upp-titles">
          <span class="upp-title">Downloading Update</span>
          <span class="upp-sub">v${ver || 'latest'}</span>
        </div>
      </div>
      <div class="upp-pct">${pct}%</div>
    </div>
    <div class="upp-track">
      <div class="upp-fill" style="width:${pct}%"></div>
    </div>
    <div class="upp-footer">
      <span>${transferred && total ? `${transferred} / ${total}` : 'Downloading…'}</span>
      ${mbps ? `<span class="upp-speed">${mbps}</span>` : ''}
    </div>
  `
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function boot(): Promise<void> {
  const appEl = document.getElementById('app')!

  // Initialize offline/online connectivity banner
  initConnectivityBanner()

  // Global update notifications
  window.api.on('update:status', (payload: any) => {
    // Always update the progress pill
    updateProgressPill(payload)

    if (payload?.status === 'available') {
      showUpdateModal(payload)
    } else if (payload?.status === 'downloaded') {
      showUpdateModal(payload)
    }
  })

  // 1. Load config
  const configResult = await window.api.getSettings()
  if (!configResult.ok) {
    appEl.innerHTML = `<div style="padding:40px;color:red">Failed to load settings: ${configResult.error}</div>`
    return
  }
  currentConfig = configResult.data

  const needsSetup = !currentConfig.saveFolder ||
    !currentConfig.supabaseAnonKey ||
    !currentConfig.appAccountEmail ||
    !currentConfig.appAccountPassword

  if (needsSetup) {
    renderFirstLaunchScreen(appEl)
  } else {
    // 2. Main app (Supabase backend active)
    renderAppShell(appEl)
  }
}


// ─── First launch ─────────────────────────────────────────────────────────────
function renderFirstLaunchScreen(appEl: HTMLElement): void {
  appEl.innerHTML = ''
  const screen = document.createElement('div')
  screen.style.cssText = 'display:flex;flex-direction:column;min-height:100vh;'
  appEl.appendChild(screen)

  renderFirstLaunch(screen, currentConfig!, async () => {
    const result = await window.api.getSettings()
    if (result.ok) currentConfig = result.data
    renderAppShell(appEl)
  })
}

// ─── App shell (nav + screens) ────────────────────────────────────────────────
function renderAppShell(appEl: HTMLElement): void {
  document.documentElement.setAttribute('data-theme', currentConfig!.theme)

  appEl.innerHTML = `
    <div class="app-shell">
      <!-- Sidebar nav -->
      <nav class="nav-sidebar" aria-label="Navigation">
        <div class="nav-logo" id="nav-logo" title="Water Refill Daily Log"><img src="${logoImg}" alt="Logo" style="width:100%;height:100%;object-fit:contain;cursor:pointer;" /></div>
        
        <!-- Input Tasks (Top) -->
        <button class="nav-btn active" id="nav-entry" data-tooltip="Daily Log" aria-label="Daily Log">${Icons.clipboardList}</button>
        <button class="nav-btn" id="nav-item-sales" data-tooltip="Log Item Sale" aria-label="Log Item Sale">${Icons.shoppingCart}</button>
        <button class="nav-btn" id="nav-inventory" data-tooltip="Stock Inventory" aria-label="Stock Inventory">${Icons.package}</button>
        
        <div style="flex:1"></div>
        
        <!-- Reports & Settings (Bottom) -->
        <div class="divider" style="margin:8px 12px;opacity:0.2"></div>
        <button class="nav-btn" id="nav-history" data-tooltip="History" aria-label="History">${Icons.history}</button>
        <button class="nav-btn" id="nav-logs" data-tooltip="Raw Logs" aria-label="Raw Logs">${Icons.clipboardList}</button>
        <button class="nav-btn" id="nav-analytics" data-tooltip="Analytics" aria-label="Analytics">${Icons.pieChart}</button>
        <button class="nav-btn" id="nav-settings" data-tooltip="Settings" aria-label="Settings">${Icons.settings}</button>
        <button class="nav-btn theme-toggle-btn" id="nav-theme" data-tooltip="Toggle Theme" aria-label="Toggle Theme">
          ${currentConfig!.theme === 'dark' ? Icons.moon : Icons.sun}
        </button>
      </nav>

      <!-- Content area -->
      <main class="main-content">
        <div class="screen active" id="screen-entry"></div>
        <div class="screen" id="screen-item-sales"></div>
        <div class="screen" id="screen-inventory"></div>
        
        <div class="screen" id="screen-history"></div>
        <div class="screen" id="screen-logs"></div>
        <div class="screen" id="screen-analytics"></div>
        <div class="screen" id="screen-settings"></div>
      </main>
    </div>
  `

  // Render all screens
  renderEntryScreen(
    document.getElementById('screen-entry')!,
    currentConfig!,
    (screen: string) => navigateTo(screen as Screen)
  )

  renderHistoryScreen(
    document.getElementById('screen-history')!,
    currentConfig!,
    (screen: string) => navigateTo(screen as Screen)
  )

  renderSettingsScreen(
    document.getElementById('screen-settings')!,
    currentConfig!,
    (updated: AppConfig) => {
      currentConfig = updated
      renderEntryScreen(
        document.getElementById('screen-entry')!,
        currentConfig,
        (screen: string) => navigateTo(screen as Screen)
      )
    }
  )

  // Nav listeners
  document.getElementById('nav-entry')!.addEventListener('click', () => navigateTo('entry'))
  document.getElementById('nav-history')!.addEventListener('click', () => {
    navigateTo('history')
    // Re-render history each time so it shows fresh data
    renderHistoryScreen(
      document.getElementById('screen-history')!,
      currentConfig!,
      (screen: string) => navigateTo(screen as Screen)
    )
  })
  document.getElementById('nav-analytics')!.addEventListener('click', () => {
    navigateTo('analytics')
    import('./screens/analytics').then(m => m.renderAnalyticsScreen(document.getElementById('screen-analytics')!, currentConfig!))
  })
  document.getElementById('nav-settings')!.addEventListener('click', () => navigateTo('settings'))
  document.getElementById('nav-logs')!.addEventListener('click', () => {
    navigateTo('logs')
    import('./screens/logs').then(m => m.renderLogsScreen(document.getElementById('screen-logs')!, currentConfig!))
  })
  
  document.getElementById('nav-inventory')!.addEventListener('click', () => {
    navigateTo('inventory')
    const el = document.getElementById('screen-inventory')!
    el.innerHTML = ''
    import('./screens/stockInventory').then(m => m.renderStockInventoryScreen(el, currentConfig!))
  })
  
  document.getElementById('nav-item-sales')!.addEventListener('click', () => {
    navigateTo('item-sales')
    import('./screens/itemSales').then(m => m.renderItemSalesScreen(document.getElementById('screen-item-sales')!, currentConfig!))
  })

  // Theme toggle
  document.getElementById('nav-theme')!.addEventListener('click', async () => {
    const newTheme = currentConfig!.theme === 'light' ? 'dark' : 'light'
    const result = await window.api.updateSettings({ theme: newTheme })
    if (result.ok) {
      currentConfig!.theme = newTheme
      document.documentElement.setAttribute('data-theme', newTheme)
      document.getElementById('nav-theme')!.innerHTML = newTheme === 'dark' ? Icons.moon : Icons.sun
      // Re-render charts if analytics is open so colors update immediately
      if (activeScreen === 'analytics') {
        import('./screens/analytics').then(m => m.renderAnalyticsScreen(document.getElementById('screen-analytics')!))
      }
    }
  })

  // Fun logo interaction
  document.getElementById('nav-logo')?.addEventListener('click', (e) => {
    const img = (e.currentTarget as HTMLElement).querySelector('img')
    img?.animate([
      { transform: 'scale(1, 1)' },
      { transform: 'scale(1.3, 0.7)', offset: 0.25 },
      { transform: 'scale(0.7, 1.3)', offset: 0.5 },
      { transform: 'scale(1.1, 0.9)', offset: 0.75 },
      { transform: 'scale(1, 1)' }
    ], {
      duration: 400,
      easing: 'cubic-bezier(0.25, 1, 0.5, 1)'
    })
  })
  // Restore previously active screen across dev reloads
  const savedScreen = (sessionStorage.getItem('activeScreen') as Screen | null) || 'entry'
  if (savedScreen && savedScreen !== 'entry' && document.getElementById(`screen-${savedScreen}`)) {
    navigateTo(savedScreen)
  }
}

function navigateTo(screen: Screen): void {
  activeScreen = screen
  try {
    sessionStorage.setItem('activeScreen', screen)
  } catch {}
  document.querySelectorAll('.screen').forEach(el => el.classList.remove('active'))
  document.querySelectorAll('.nav-btn').forEach(el => el.classList.remove('active'))
  document.getElementById(`screen-${screen}`)?.classList.add('active')
  document.getElementById(`nav-${screen}`)?.classList.add('active')
}

// ─── Global Error & Rejection Boundary ─────────────────────────────────────────
window.addEventListener('error', (event) => {
  console.error('[Renderer Error]', event.error || event.message)
  document.getElementById('save-overlay')?.classList.add('hidden')
  showToast('An unexpected application error occurred', 'error')
})

window.addEventListener('unhandledrejection', (event) => {
  console.error('[Renderer Unhandled Rejection]', event.reason)
  document.getElementById('save-overlay')?.classList.add('hidden')
  showToast('An asynchronous operation failed', 'error')
})

// ─── Start ────────────────────────────────────────────────────────────────────
boot()
