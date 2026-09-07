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

// ─── Top-Right Update Prompt & Download Bar ──────────────────────────────────
let _dismissedUpdateVersion = ''

function handleUpdateStatus(payload: any): void {
  if (!payload || !payload.status) return

  let panel = document.getElementById('update-panel')
  const ver = payload.availableVersion || ''
  const currentVer = payload.currentVersion || ''
  const isDownloaded = payload.status === 'downloaded'
  const isDownloading = payload.status === 'downloading'
  const isAvailable = payload.status === 'available'

  // If dismissed and not downloading/downloaded, ignore
  if (_dismissedUpdateVersion === ver && isAvailable) {
    panel?.remove()
    return
  }

  // If status is idle, checking, not-available, or error -> remove floating panel
  if (!isAvailable && !isDownloading && !isDownloaded) {
    if (panel) {
      panel.classList.add('closing')
      setTimeout(() => panel?.remove(), 250)
    }
    return
  }

  // If panel doesn't exist, create it
  if (!panel) {
    panel = document.createElement('div')
    panel.id = 'update-panel'
    document.body.appendChild(panel)
  }

  // If already downloading and the progress DOM is already there, update in-place!
  if (isDownloading && panel.dataset.state === 'downloading') {
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

    const fillEl = document.getElementById('up-fill')
    const pctEl = document.getElementById('up-pct')
    const detailsEl = document.getElementById('up-details')
    const speedEl = document.getElementById('up-speed')
    const trackEl = document.getElementById('up-track')

    if (fillEl && pctEl && detailsEl && speedEl && trackEl) {
      if (pct > 0) {
        trackEl.classList.remove('indeterminate')
        fillEl.style.width = `${pct}%`
      } else {
        trackEl.classList.add('indeterminate')
      }
      pctEl.textContent = `${pct}%`
      detailsEl.textContent = transferred && total ? `${transferred} / ${total}` : 'Downloading in background…'
      speedEl.textContent = mbps
      return
    }
  }

  // 1. STATE: AVAILABLE (Prompt First in Upper-Right Corner)
  if (isAvailable) {
    panel.dataset.state = 'available'
    panel.innerHTML = `
      <button class="up-close-btn" id="up-close-btn" title="Dismiss">&times;</button>
      <div class="up-header">
        <div class="up-icon-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2v8m0 0l-3-3m3 3l3-3"/>
            <rect x="3" y="14" width="18" height="8" rx="3"/>
          </svg>
        </div>
        <div class="up-titles">
          <div class="up-badge-pill">
            <span class="up-pulse-dot"></span>
            <span>NEW UPDATE AVAILABLE</span>
          </div>
          <span class="up-title">A&G Daily Log v${ver}</span>
        </div>
      </div>

      <div class="up-body">
        <div class="up-version-row">
          ${currentVer ? `<span class="up-ver-tag up-ver-old">Current: v${currentVer}</span>` : ''}
          <span class="up-ver-arrow">➔</span>
          <span class="up-ver-tag up-ver-new">New: v${ver}</span>
        </div>
        <p class="up-desc">A new version is ready. Would you like to download and install this update now?</p>
      </div>

      <div class="up-actions">
        <button id="up-btn-later" class="btn btn-ghost up-btn-later">Later</button>
        <button id="up-btn-download" class="btn btn-primary up-btn-accept">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
          Download Update
        </button>
      </div>
    `

    const dismiss = () => {
      _dismissedUpdateVersion = ver
      panel.classList.add('closing')
      setTimeout(() => panel.remove(), 250)
    }

    document.getElementById('up-close-btn')?.addEventListener('click', dismiss)
    document.getElementById('up-btn-later')?.addEventListener('click', dismiss)

    document.getElementById('up-btn-download')?.addEventListener('click', async () => {
      // Immediately switch to downloading state in the same panel
      handleUpdateStatus({
        ...payload,
        status: 'downloading',
        progress: { percent: 0, bytesPerSecond: 0, transferred: 0, total: 0 }
      })
      showToast(`Downloading update v${ver}...`, 'info')
      await window.api.downloadUpdate()
    })
    return
  }

  // 2. STATE: DOWNLOADING (Smooth progress bar in Upper-Right Corner)
  if (isDownloading) {
    panel.dataset.state = 'downloading'
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

    panel.innerHTML = `
      <div class="up-header">
        <div class="up-icon-box up-icon-pulse">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"/>
            <polyline points="19 12 12 19 5 12"/>
          </svg>
        </div>
        <div class="up-titles">
          <span class="up-title">Downloading Update</span>
          <span class="up-sub">v${ver || 'latest'}</span>
        </div>
        <div id="up-pct" class="up-pct">${pct}%</div>
      </div>

      <div id="up-track" class="up-track ${pct === 0 ? 'indeterminate' : ''}">
        <div id="up-fill" class="up-fill" style="width: ${pct}%"></div>
      </div>

      <div class="up-footer">
        <span id="up-details">${transferred && total ? `${transferred} / ${total}` : 'Downloading in background…'}</span>
        <span id="up-speed" class="up-speed">${mbps}</span>
      </div>
    `
    return
  }

  // 3. STATE: DOWNLOADED (Ready to install)
  if (isDownloaded) {
    panel.dataset.state = 'downloaded'
    panel.innerHTML = `
      <div class="up-header">
        <div class="up-icon-box up-icon-success">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </div>
        <div class="up-titles">
          <div class="up-badge-pill up-badge-success">
            <span class="up-pulse-dot up-dot-success"></span>
            <span>READY TO INSTALL</span>
          </div>
          <span class="up-title">Update Ready!</span>
        </div>
      </div>

      <div class="up-body">
        <p class="up-desc">Version v${ver} has finished downloading. Restart the app now to apply the update immediately.</p>
      </div>

      <div class="up-actions">
        <button id="up-btn-ready-later" class="btn btn-ghost up-btn-later">Later</button>
        <button id="up-btn-restart" class="btn btn-primary up-btn-accept up-btn-success">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="23 4 23 10 17 10"/>
            <polyline points="1 20 1 14 7 14"/>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
          </svg>
          Restart Now
        </button>
      </div>
    `

    document.getElementById('up-btn-ready-later')?.addEventListener('click', () => {
      panel.classList.add('closing')
      setTimeout(() => panel.remove(), 250)
    })

    document.getElementById('up-btn-restart')?.addEventListener('click', async () => {
      showToast('Restarting application to apply update...', 'info')
      await window.api.installUpdate()
    })
    return
  }
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function boot(): Promise<void> {
  const appEl = document.getElementById('app')!

  // Initialize offline/online connectivity banner
  initConnectivityBanner()

  // Global update notifications (Top-right corner panel)
  window.api.on('update:status', (payload: any) => {
    handleUpdateStatus(payload)
  })

  // Check initial update state on startup
  window.api.getUpdateState().then((res: any) => {
    if (res?.ok && res?.data) {
      handleUpdateStatus(res.data)
    }
  }).catch(() => {})

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
    const navBtn = document.getElementById(`nav-${savedScreen}`)
    if (navBtn) {
      navBtn.click()
    } else {
      navigateTo(savedScreen)
    }
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
