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

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function boot(): Promise<void> {
  const appEl = document.getElementById('app')!

  // Initialize offline/online connectivity banner
  initConnectivityBanner()

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
}

function navigateTo(screen: Screen): void {
  activeScreen = screen
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
