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
  const isDownloaded = payload.status === 'downloaded'

  // Don't re-show if the user already dismissed this version
  if (_dismissedUpdateVersion === ver && !isDownloaded) return

  const overlay = document.createElement('div')
  overlay.id = 'update-modal-overlay'
  overlay.innerHTML = `
    <div class="update-modal">
      <div class="update-modal-icon">${isDownloaded ? '✅' : '🔔'}</div>
      <div class="update-modal-body">
        <h3 class="update-modal-title">${isDownloaded ? 'Update Ready to Install' : 'New Update Available'}</h3>
        <p class="update-modal-sub">Version <strong>v${ver}</strong> ${isDownloaded ? 'has been downloaded and is ready to install.' : 'is available and downloading in the background.'}</p>
        ${payload.releaseNotes ? `<p class="update-modal-notes">${payload.releaseNotes}</p>` : ''}
      </div>
      <div class="update-modal-actions">
        ${isDownloaded
          ? `<button id="update-modal-install" class="btn btn-primary">Restart &amp; Install</button>`
          : `<button id="update-modal-later" class="btn btn-ghost">Dismiss</button>`
        }
        ${isDownloaded ? `<button id="update-modal-later" class="btn btn-ghost">Later</button>` : ''}
      </div>
    </div>
  `

  document.body.appendChild(overlay)

  document.getElementById('update-modal-later')?.addEventListener('click', () => {
    _dismissedUpdateVersion = ver
    overlay.remove()
  })

  document.getElementById('update-modal-install')?.addEventListener('click', async () => {
    overlay.remove()
    await window.api.installUpdate()
  })
}

function updateProgressPill(payload: any): void {
  let pill = document.getElementById('update-progress-pill')

  if (payload?.status !== 'downloading') {
    pill?.remove()
    return
  }

  if (!pill) {
    pill = document.createElement('div')
    pill.id = 'update-progress-pill'
    document.body.appendChild(pill)
  }

  const pct = Math.round(payload.progress?.percent ?? 0)
  const mbps = payload.progress?.bytesPerSecond
    ? `${(payload.progress.bytesPerSecond / 1024 / 1024).toFixed(1)} MB/s`
    : ''

  pill.innerHTML = `
    <div class="upp-label">
      <span>⬇ Downloading update…</span>
      <span class="upp-pct">${pct}%</span>
    </div>
    <div class="upp-track"><div class="upp-fill" style="width:${pct}%"></div></div>
    ${mbps ? `<div class="upp-speed">${mbps}</div>` : ''}
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
