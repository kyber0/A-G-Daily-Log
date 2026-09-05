/**
 * Connectivity Banner
 * Shows a banner at the top of the app when offline, and a success flash on reconnect.
 */

let _bannerEl: HTMLDivElement | null = null
let _hideTimer: ReturnType<typeof setTimeout> | null = null

export function initConnectivityBanner(): void {
  // Create banner element
  _bannerEl = document.createElement('div')
  _bannerEl.id = 'connectivity-banner'
  _bannerEl.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9999;
    display: none;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 9px 20px;
    font-size: 13px;
    font-weight: 600;
    font-family: var(--font, 'Inter', sans-serif);
    letter-spacing: 0.01em;
    transition: background 0.3s, color 0.3s;
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  `
  document.body.prepend(_bannerEl)

  // Listen for connectivity events from main process
  window.api.on('connectivity:change', ({ isOnline, pendingCount }: { isOnline: boolean; pendingCount: number }) => {
    updateBanner(isOnline, pendingCount)
  })

  // Poll initial state
  pollStatus()
  setInterval(pollStatus, 20_000)
}

async function pollStatus(): Promise<void> {
  try {
    const status = await window.api.connectivityStatus()
    updateBanner(status.isOnline, status.pendingCount)
  } catch {}
}

function updateBanner(isOnline: boolean, pendingCount: number): void {
  if (!_bannerEl) return

  if (!isOnline) {
    // Show offline warning
    if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null }
    _bannerEl.style.display = 'flex'
    _bannerEl.style.background = '#b91c1c'
    _bannerEl.style.color = '#fff'
    _bannerEl.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M1 6c0 0 5-3 11-3s11 3 11 3"/>
        <path d="M5 10c0 0 3.5-2 7-2s7 2 7 2"/>
        <line x1="2" y1="2" x2="22" y2="22"/>
        <circle cx="12" cy="18" r="1" fill="currentColor"/>
      </svg>
      Offline Mode — Changes saved locally and will sync when reconnected.
      ${pendingCount > 0 ? `<span style="opacity:0.85;font-weight:400">(${pendingCount} pending)</span>` : ''}
    `
  } else if (pendingCount > 0) {
    // Online but still syncing
    if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null }
    _bannerEl.style.display = 'flex'
    _bannerEl.style.background = '#1d4ed8'
    _bannerEl.style.color = '#fff'
    _bannerEl.innerHTML = `
      <div style="width:14px;height:14px;border:2px solid rgba(255,255,255,0.4);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite"></div>
      Syncing ${pendingCount} offline change${pendingCount !== 1 ? 's' : ''} to cloud…
    `
    // Trigger a sync now
    window.api.syncNow().catch(() => {})
  } else if (_bannerEl.style.display !== 'none') {
    // Was showing something, now we're fully online + synced — flash green
    _bannerEl.style.background = '#15803d'
    _bannerEl.style.color = '#fff'
    _bannerEl.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M20 6 9 17l-5-5"/>
      </svg>
      Back online — all changes synced ✓
    `
    _hideTimer = setTimeout(() => {
      if (_bannerEl) _bannerEl.style.display = 'none'
    }, 4000)
  }
}
