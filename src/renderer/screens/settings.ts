import type { AppConfig } from '../../shared/types'
import { showToast, showModal } from '../components/ui'
import { Icons } from '../components/icons'

export function renderSettingsScreen(
  container: HTMLElement,
  config: AppConfig,
  onConfigChange: (updated: AppConfig) => void
): void {
  let cfg: AppConfig = JSON.parse(JSON.stringify(config))
  let driveConnected = false
  let driveEmail: string | null = null
  let isFetchingDrive = true
  let activeTab: 'storage' | 'pricing' | 'containers' | 'backup' | 'about' =
    (sessionStorage.getItem('settingsActiveTab') as any) || 'storage'
  let priceSearchFilter = ''
  let priceCategoryFilter: 'all' | 'gallon' | 'bottle' = 'all'
  let priceWaterFilter: string = 'ALL'
  let containerSearchFilter = ''
  let exportMonth = new Date().toISOString().substring(0, 7)
  let savedScrollPosition = parseInt(sessionStorage.getItem('settingsScrollTop') || '0', 10) || 0

  let appVersion = '...'
  let updateState: any = { status: 'idle' }

  // Initial fetch of Google Drive status
  window.api.driveStatus().then(res => {
    if (res.ok) {
      driveConnected = res.data.connected
      driveEmail = res.data.email
    }
    isFetchingDrive = false
    render()
  })

  // Initial fetch of App Version and Update State
  window.api.getAppVersion().then(ver => {
    if (ver) {
      appVersion = ver
      if (activeTab === 'about') refreshTabContent()
    }
  }).catch(() => {})

  window.api.getUpdateState().then(res => {
    if (res?.ok && res.data) {
      updateState = res.data
      if (res.data.currentVersion) appVersion = res.data.currentVersion
      if (activeTab === 'about') refreshTabContent()
    }
  }).catch(() => {})

  // Listen to live auto-update events
  window.api.on('update:status', (payload: any) => {
    if (payload) {
      updateState = payload
      if (payload.currentVersion) appVersion = payload.currentVersion
      if (activeTab === 'about') {
        refreshTabContent()
      }
    }
  })

  render()

  function render(): void {
    const q = <T extends Element>(sel: string) => container.querySelector<T>(sel)!

    // Capture current scroll before re-rendering
    const existingScreen = container.querySelector<HTMLElement>('.st-screen')
    if (existingScreen) {
      savedScrollPosition = existingScreen.scrollTop
      try {
        sessionStorage.setItem('settingsScrollTop', String(savedScrollPosition))
      } catch {}
    } else {
      const stored = sessionStorage.getItem('settingsScrollTop')
      if (stored) savedScrollPosition = parseInt(stored, 10) || 0
    }

    container.innerHTML = `
      <style>
        .st-screen {
          flex: 1;
          overflow-y: auto;
          padding: 32px 40px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          max-width: 1120px;
          margin: 0 auto;
          width: 100%;
          box-sizing: border-box;
        }
        .st-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding-bottom: 20px;
          border-bottom: 1px solid var(--clr-border);
          flex-wrap: wrap;
          gap: 16px;
        }
        .st-tabs {
          display: flex;
          gap: 6px;
          background: var(--clr-surface-2);
          padding: 5px;
          border-radius: 12px;
          border: 1px solid var(--clr-border);
          flex-wrap: wrap;
        }
        .st-tab {
          padding: 8px 16px;
          border-radius: 8px;
          font-size: 13px;
          font-weight: 600;
          color: var(--clr-text-muted);
          background: transparent;
          border: none;
          cursor: pointer;
          font-family: var(--font);
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 0.2s;
        }
        .st-tab:hover:not(.active) {
          color: var(--clr-text);
          background: rgba(255,255,255,0.04);
        }
        .st-tab.active {
          background: var(--clr-surface);
          color: var(--clr-primary);
          box-shadow: var(--shadow-sm);
        }
        .st-card {
          background: var(--clr-surface);
          border: 1px solid var(--clr-border);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: var(--shadow-sm);
        }
        .st-card-header {
          padding: 18px 24px;
          border-bottom: 1px solid var(--clr-border);
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
        }
        .st-card-header h3 {
          margin: 0;
          font-size: 15px;
          font-weight: 700;
          color: var(--clr-text);
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .st-card-body {
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 20px;
        }
        .st-folder-row {
          background: var(--clr-surface-2);
          border: 1px solid var(--clr-border);
          border-radius: 12px;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .st-folder-path {
          font-family: monospace;
          font-size: 12px;
          color: var(--clr-text-muted);
          word-break: break-all;
        }
        .st-grid-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }
        .st-grid-table th {
          background: var(--clr-surface-2);
          padding: 12px 16px;
          text-align: left;
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: .06em;
          color: var(--clr-text-muted);
          border-bottom: 1px solid var(--clr-border);
        }
        .st-grid-table td {
          padding: 12px 16px;
          border-bottom: 1px solid var(--clr-border);
          vertical-align: middle;
        }
        .st-grid-table tr:hover td {
          background: rgba(255,255,255,0.02);
        }
        .st-grid-table tr:last-child td {
          border-bottom: none;
        }
        .st-tag-pill {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 8px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          border: 1px solid var(--clr-border);
        }
        .st-export-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 20px;
          gap: 12px;
          border-bottom: 1px solid var(--clr-border);
          transition: background 0.15s;
        }
        .st-export-row:last-child { border-bottom: none; }
        .st-export-row:hover { background: var(--clr-surface-2); }

        /* ── Modern Pricing & Container UI Enhancements ── */
        .st-hero-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          padding: 12px 18px;
          background: var(--clr-surface-2);
          border: 1px solid var(--clr-border);
          border-radius: 14px;
        }
        .st-stat-badges {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .st-stat-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 5px 12px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 600;
          background: var(--clr-surface);
          border: 1px solid var(--clr-border);
          color: var(--clr-text);
          box-shadow: 0 1px 2px rgba(0,0,0,0.03);
        }
        .st-stat-badge strong {
          font-weight: 800;
          color: var(--clr-primary);
        }
        .st-sync-pill {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 14px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          background: rgba(16, 185, 129, 0.1);
          color: var(--clr-success);
          border: 1px solid rgba(16, 185, 129, 0.25);
        }
        .st-sync-pill::before {
          content: '';
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--clr-success);
          box-shadow: 0 0 8px var(--clr-success);
          animation: st-pulse 2s infinite;
        }
        @keyframes st-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.3); opacity: 0.6; }
        }
        .st-pulse-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--clr-primary);
          animation: st-pulse 1.8s infinite;
          display: inline-block;
        }
        .st-btn-spinner {
          display: inline-block;
          width: 13px;
          height: 13px;
          border: 2px solid currentColor;
          border-top-color: transparent;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }

        /* Toolbar & Filters */
        .st-pricing-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
          padding: 14px 24px;
          border-bottom: 1px solid var(--clr-border);
          background: var(--clr-surface);
        }
        .st-filter-pills {
          display: flex;
          align-items: center;
          gap: 6px;
          flex-wrap: wrap;
        }
        .st-filter-btn {
          padding: 6px 14px;
          border-radius: 8px;
          font-size: 12px;
          font-weight: 600;
          border: 1px solid var(--clr-border);
          background: var(--clr-surface-2);
          color: var(--clr-text-muted);
          cursor: pointer;
          transition: all 0.15s ease;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }
        .st-filter-btn:hover {
          background: var(--clr-surface-3);
          color: var(--clr-text);
        }
        .st-filter-btn.active {
          background: var(--clr-primary);
          color: #ffffff;
          border-color: var(--clr-primary);
          box-shadow: 0 2px 8px var(--clr-primary-glow);
        }
        .st-search-wrap {
          position: relative;
          display: flex;
          align-items: center;
        }
        .st-search-icon {
          position: absolute;
          left: 10px;
          color: var(--clr-text-dim);
          pointer-events: none;
          display: flex;
          align-items: center;
        }
        .st-search-input {
          padding: 7px 30px 7px 32px;
          border-radius: 8px;
          border: 1px solid var(--clr-border);
          background: var(--clr-surface-2);
          color: var(--clr-text);
          font-size: 13px;
          width: 210px;
          transition: all 0.2s;
        }
        .st-search-input:focus {
          width: 250px;
          border-color: var(--clr-primary);
          background: var(--clr-surface);
          box-shadow: 0 0 0 3px var(--clr-primary-glow);
          outline: none;
        }
        .st-search-clear {
          position: absolute;
          right: 8px;
          background: none;
          border: none;
          cursor: pointer;
          color: var(--clr-text-dim);
          padding: 2px;
          border-radius: 50%;
          display: flex;
        }
        .st-search-clear:hover {
          color: var(--clr-text);
        }

        /* Price Currency Field */
        .st-currency-field {
          position: relative;
          display: flex;
          align-items: center;
          width: 100%;
          min-width: 110px;
        }
        .st-currency-symbol {
          position: absolute;
          left: 9px;
          font-size: 12px;
          font-weight: 700;
          color: var(--clr-text-muted);
          pointer-events: none;
        }
        .st-price-input {
          width: 100%;
          padding: 8px 10px 8px 24px;
          border-radius: 8px;
          border: 1px solid var(--clr-border);
          background: var(--clr-input-bg);
          color: var(--clr-text);
          font-size: 13px;
          font-weight: 700;
          font-family: monospace;
          transition: all 0.15s;
        }
        .st-price-input:focus {
          border-color: var(--clr-primary);
          box-shadow: 0 0 0 2px var(--clr-primary-glow);
          outline: none;
        }

        /* Delivery Margin / Spread Badges */
        .st-markup-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-size: 11px;
          font-weight: 700;
          padding: 4px 8px;
          border-radius: 6px;
          letter-spacing: .02em;
        }
        .st-markup-badge--positive {
          background: rgba(14, 165, 233, 0.12);
          color: #0284c7;
          border: 1px solid rgba(14, 165, 233, 0.25);
        }
        [data-theme="dark"] .st-markup-badge--positive {
          color: #38bdf8;
        }
        .st-markup-badge--equal {
          background: var(--clr-surface-2);
          color: var(--clr-text-muted);
          border: 1px solid var(--clr-border);
        }
        .st-markup-badge--negative {
          background: rgba(245, 158, 11, 0.12);
          color: #d97706;
          border: 1px solid rgba(245, 158, 11, 0.25);
        }

        /* Water Variant Badges */
        .st-water-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 10px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: .03em;
        }
        .st-water-badge--alkaline {
          background: rgba(168, 85, 247, 0.12);
          color: #9333ea;
          border: 1px solid rgba(168, 85, 247, 0.25);
        }
        [data-theme="dark"] .st-water-badge--alkaline {
          color: #c084fc;
        }
        .st-water-badge--purified {
          background: rgba(14, 165, 233, 0.12);
          color: #0284c7;
          border: 1px solid rgba(14, 165, 233, 0.25);
        }
        [data-theme="dark"] .st-water-badge--purified {
          color: #38bdf8;
        }
        .st-water-badge--mineral {
          background: rgba(16, 185, 129, 0.12);
          color: #059669;
          border: 1px solid rgba(16, 185, 129, 0.25);
        }
        [data-theme="dark"] .st-water-badge--mineral {
          color: #34d399;
        }
        .st-water-badge--none {
          background: var(--clr-surface-2);
          color: var(--clr-text-muted);
          border: 1px solid var(--clr-border);
        }

        /* Containers Tab Cards */
        .st-container-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          border-radius: 12px;
          background: var(--clr-surface-2);
          border: 1px solid var(--clr-border);
          transition: all 0.2s ease;
        }
        .st-container-item:hover {
          background: var(--clr-surface);
          border-color: var(--clr-primary);
          box-shadow: 0 4px 14px rgba(0,0,0,0.05);
          transform: translateY(-1px);
        }
        .st-container-icon-box {
          width: 38px;
          height: 38px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .st-container-icon-box--water {
          background: rgba(13, 148, 136, 0.12);
          color: var(--clr-primary);
        }
        .st-container-icon-box--flat {
          background: rgba(217, 119, 6, 0.12);
          color: var(--clr-deliver);
        }
        .st-add-box {
          background: var(--clr-surface-2);
          border: 1px dashed var(--clr-border-light);
          border-radius: 14px;
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          margin-top: 14px;
        }
        .st-water-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 14px 16px;
          border-radius: 12px;
          background: var(--clr-surface-2);
          border: 1px solid var(--clr-border);
          transition: all 0.2s ease;
        }
        .st-water-card:hover {
          background: var(--clr-surface);
          border-color: var(--clr-primary);
          box-shadow: 0 4px 14px rgba(0,0,0,0.05);
          transform: translateY(-1px);
        }
      </style>

      <div class="st-screen">

        <!-- Top Header -->
        <div class="st-header">
          <div>
            <h1 style="margin:0 0 4px 0;font-size:24px;font-weight:800;color:var(--clr-text);letter-spacing:-0.5px;">Settings</h1>
            <p style="margin:0;font-size:13px;color:var(--clr-text-muted);">Manage file exports, folder directories, product prices, container types, and backups.</p>
          </div>

          <!-- Tab Bar -->
          <div class="st-tabs">
            <button class="st-tab ${activeTab === 'storage' ? 'active' : ''}" data-tab="storage">
              ${Icons.folder} Storage & Folders
            </button>
            <button class="st-tab ${activeTab === 'pricing' ? 'active' : ''}" data-tab="pricing">
              ${Icons.tag} Water Pricing
            </button>
            <button class="st-tab ${activeTab === 'containers' ? 'active' : ''}" data-tab="containers">
              ${Icons.package} Containers & Water
            </button>
            <button class="st-tab ${activeTab === 'backup' ? 'active' : ''}" data-tab="backup">
              ${Icons.shieldCheck} Backup & Cloud
            </button>
            <button class="st-tab ${activeTab === 'about' ? 'active' : ''}" data-tab="about">
              ${Icons.info} About
            </button>
          </div>
        </div>

        <!-- Tab Content -->
        <div id="st-tab-content">
          ${renderActiveTabContent()}
        </div>

      </div>
    `

    // Restore scroll position
    const screenEl = container.querySelector<HTMLElement>('.st-screen')
    if (screenEl && savedScrollPosition > 0) {
      screenEl.scrollTop = savedScrollPosition
      requestAnimationFrame(() => {
        if (screenEl && savedScrollPosition > 0) {
          screenEl.scrollTop = savedScrollPosition
        }
      })
    }

    bindEvents()
  }

  function formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
  }

  function formatLastCheck(iso: string): string {
    try {
      const d = new Date(iso)
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    } catch {
      return 'Recently'
    }
  }

  function renderActiveTabContent(): string {
    switch (activeTab) {
      case 'storage':
        return `
          <div style="display:flex;flex-direction:column;gap:20px;">

            <!-- BULK EXPORT CARD -->
            <div class="st-card">
              <div class="st-card-header">
                <h3>${Icons.archive} Bulk Year Export</h3>
                <span style="font-size:12px;color:var(--clr-text-muted);font-weight:500;">Generates all files at once</span>
              </div>
              <div class="st-card-body" style="gap:16px;">
                <p style="margin:0;font-size:13px;color:var(--clr-text-muted);">
                  Export every month's <strong>Daily Refill Log</strong> + <strong>Item Sales Report</strong> for a full year into one folder — no clicking through each month.
                </p>
                <div style="display:flex;align-items:center;gap:12px;padding:16px;background:var(--clr-surface-2);border-radius:12px;border:1px solid var(--clr-border);">
                  <div style="display:flex;flex-direction:column;gap:4px;flex:1;">
                    <label style="font-size:11px;font-weight:700;color:var(--clr-text-muted);text-transform:uppercase;letter-spacing:.06em;">Select Year</label>
                    <select id="bulk-export-year"
                      style="padding:9px 12px;border-radius:8px;border:1px solid var(--clr-border);background:var(--clr-surface);color:var(--clr-text);font-size:14px;font-weight:700;cursor:pointer;max-width:160px;">
                      ${[...Array(5)].map((_, i) => {
                        const y = new Date().getFullYear() - i
                        return `<option value="${y}" ${i === 0 ? 'selected' : ''}>${y}</option>`
                      }).join('')}
                    </select>
                  </div>
                  <div style="display:flex;flex-direction:column;gap:6px;align-items:flex-end;">
                    <button id="btn-bulk-export" class="btn btn-primary" style="display:flex;align-items:center;gap:8px;padding:10px 20px;font-size:14px;">
                      ${Icons.download} Export Full Year
                    </button>
                    <span style="font-size:11px;color:var(--clr-text-muted);">Saves up to 24 .xlsx files to a folder you choose</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- SINGLE MONTH EXPORTS -->
            <div class="st-card">
              <div class="st-card-header">
                <h3>${Icons.download} Single Month Export</h3>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span style="font-size:12px;font-weight:600;color:var(--clr-text-muted);">Target Month:</span>
                  <input type="month" id="st-export-month" value="${exportMonth}"
                    style="padding:6px 12px;border-radius:8px;border:1px solid var(--clr-border);background:var(--clr-surface-2);color:var(--clr-text);font-size:13px;font-weight:700;cursor:pointer;" />
                </div>
              </div>
              <div class="st-card-body" style="gap:0;padding:0;">

                <div class="st-export-row">
                  <div style="display:flex;align-items:center;gap:12px;">
                    <div style="width:32px;height:32px;border-radius:8px;background:rgba(14,165,233,0.12);color:#0ea5e9;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${Icons.fileSheet}</div>
                    <div>
                      <div style="font-weight:700;font-size:13px;">Daily Refill Log</div>
                      <div style="font-size:11px;color:var(--clr-text-muted);">31-sheet DAILY LOG.xlsx with day-by-day sales &amp; expenses</div>
                    </div>
                  </div>
                  <button class="btn btn-secondary btn-sm do-export" data-action="dailylog" style="flex-shrink:0;display:flex;align-items:center;gap:6px;">${Icons.download} Export</button>
                </div>

                <div class="st-export-row">
                  <div style="display:flex;align-items:center;gap:12px;">
                    <div style="width:32px;height:32px;border-radius:8px;background:rgba(99,102,241,0.12);color:#6366f1;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${Icons.shoppingBag}</div>
                    <div>
                      <div style="font-weight:700;font-size:13px;">Item Sales Report</div>
                      <div style="font-size:11px;color:var(--clr-text-muted);">Monthly merchandise sales ledger with totals &amp; discounts</div>
                    </div>
                  </div>
                  <button class="btn btn-secondary btn-sm do-export" data-action="sales" style="flex-shrink:0;display:flex;align-items:center;gap:6px;">${Icons.download} Export</button>
                </div>

                <div class="st-export-row">
                  <div style="display:flex;align-items:center;gap:12px;">
                    <div style="width:32px;height:32px;border-radius:8px;background:rgba(16,185,129,0.12);color:#10b981;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${Icons.package}</div>
                    <div>
                      <div style="font-weight:700;font-size:13px;">Stock Inventory Movement</div>
                      <div style="font-size:11px;color:var(--clr-text-muted);">Monthly stock ins, outs, restock orders, and valuations</div>
                    </div>
                  </div>
                  <button class="btn btn-secondary btn-sm do-export" data-action="stock" style="flex-shrink:0;display:flex;align-items:center;gap:6px;">${Icons.download} Export</button>
                </div>

              </div>
            </div>

            <!-- FOLDERS CONFIG -->
            <div class="st-card">
              <div class="st-card-header">
                <h3>${Icons.folder} File Storage Directories</h3>
              </div>
              <div class="st-card-body" style="gap:0;padding:0;">

                <div class="st-export-row">
                  <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                    <div style="width:32px;height:32px;border-radius:8px;background:rgba(14,165,233,0.1);color:#0ea5e9;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${Icons.fileSheet}</div>
                    <div style="min-width:0;">
                      <div style="font-weight:700;font-size:12px;color:var(--clr-text-muted);text-transform:uppercase;letter-spacing:.04em;">Daily Water Log Files</div>
                      <div class="st-folder-path" style="margin-top:2px;">${cfg.saveFolder || '<span style="color:var(--clr-text-muted);">No folder set</span>'}</div>
                    </div>
                  </div>
                  <button id="btn-change-folder" class="btn btn-ghost btn-sm" style="flex-shrink:0;">Change</button>
                </div>

                <div class="st-export-row">
                  <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                    <div style="width:32px;height:32px;border-radius:8px;background:rgba(16,185,129,0.1);color:#10b981;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${Icons.package}</div>
                    <div style="min-width:0;">
                      <div style="font-weight:700;font-size:12px;color:var(--clr-text-muted);text-transform:uppercase;letter-spacing:.04em;">Stock &amp; Sales Reports</div>
                      <div class="st-folder-path" style="margin-top:2px;">${cfg.inventoryFolder || '<span style="color:var(--clr-text-muted);">No folder set</span>'}</div>
                    </div>
                  </div>
                  <button id="btn-change-inv-folder" class="btn btn-ghost btn-sm" style="flex-shrink:0;">Change</button>
                </div>

              </div>
            </div>

          </div>
        `

      case 'pricing': {
        // Compute metrics
        const distinctContainers = [...new Set(cfg.priceTable.map(p => p.container))]
        const gallonRows = cfg.priceTable.filter(p => {
          const ct = cfg.containerTypes.find(c => c.name === p.container)
          return ct ? ct.requiresWaterType : Boolean(p.water)
        })
        const bottleRows = cfg.priceTable.filter(p => {
          const ct = cfg.containerTypes.find(c => c.name === p.container)
          return ct ? !ct.requiresWaterType : !p.water
        })

        // Apply filters
        const filteredPrices = cfg.priceTable.filter(p => {
          const ct = cfg.containerTypes.find(c => c.name === p.container)
          const requiresWater = ct ? ct.requiresWaterType : Boolean(p.water)

          if (priceCategoryFilter === 'gallon' && !requiresWater) return false
          if (priceCategoryFilter === 'bottle' && requiresWater) return false

          if (priceWaterFilter !== 'ALL') {
            if (priceWaterFilter === 'NONE') {
              if (p.water) return false
            } else if (p.water.toUpperCase() !== priceWaterFilter.toUpperCase()) {
              return false
            }
          }

          if (priceSearchFilter) {
            const q = priceSearchFilter.toLowerCase()
            const matchC = p.container.toLowerCase().includes(q)
            const matchW = (p.water || '').toLowerCase().includes(q)
            const matchN = (p.note || '').toLowerCase().includes(q)
            const matchP = String(p.pickup).includes(q) || String(p.deliver).includes(q)
            if (!matchC && !matchW && !matchN && !matchP) return false
          }

          return true
        })

        return `
          <div style="display:flex;flex-direction:column;gap:18px;">

            <!-- Metric Overview & Sync Banner -->
            <div class="st-hero-bar">
              <div class="st-stat-badges">
                <div class="st-sync-pill">Database Live Synced</div>
                <div class="st-stat-badge">
                  <span>Price Combinations:</span>
                  <strong>${cfg.priceTable.length}</strong>
                </div>
                <div class="st-stat-badge">
                  <span>Containers:</span>
                  <strong>${distinctContainers.length}</strong>
                </div>
                <div class="st-stat-badge">
                  <span>Water Types:</span>
                  <strong>${cfg.waterTypes.length}</strong>
                </div>
              </div>

              <div style="display:flex;align-items:center;gap:10px;">
                <button type="button" class="btn btn-secondary btn-sm btn-sync-db" style="display:flex;align-items:center;gap:6px;">
                  ${Icons.refreshCw} Sync to DB
                </button>
                <button type="button" id="btn-save-prices" class="btn btn-primary btn-sm" style="display:flex;align-items:center;gap:6px;box-shadow:0 2px 10px var(--clr-primary-glow);">
                  ${Icons.check} Save Prices
                  <kbd style="font-size:10px;padding:2px 5px;background:rgba(255,255,255,0.2);border-radius:4px;margin-left:4px;font-family:monospace;">Ctrl+S</kbd>
                </button>
              </div>
            </div>

            <!-- Price Matrix Card -->
            <div class="st-card">
              <!-- Toolbar & Filtering -->
              <div class="st-pricing-toolbar">
                <div class="st-filter-pills">
                  <button type="button" class="st-filter-btn st-price-cat-btn ${priceCategoryFilter === 'all' ? 'active' : ''}" data-cat="all">
                    All Items <span style="font-size:11px;opacity:0.8;">(${cfg.priceTable.length})</span>
                  </button>
                  <button type="button" class="st-filter-btn st-price-cat-btn ${priceCategoryFilter === 'gallon' ? 'active' : ''}" data-cat="gallon">
                    💧 Gallon Refills <span style="font-size:11px;opacity:0.8;">(${gallonRows.length})</span>
                  </button>
                  <button type="button" class="st-filter-btn st-price-cat-btn ${priceCategoryFilter === 'bottle' ? 'active' : ''}" data-cat="bottle">
                    📦 Bottles / Flat <span style="font-size:11px;opacity:0.8;">(${bottleRows.length})</span>
                  </button>
                </div>

                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                  <!-- Water filter select -->
                  <select id="st-price-water-filter"
                    style="padding:6px 10px;border-radius:8px;border:1px solid var(--clr-border);background:var(--clr-surface-2);color:var(--clr-text);font-size:12px;font-weight:600;cursor:pointer;">
                    <option value="ALL" ${priceWaterFilter === 'ALL' ? 'selected' : ''}>All Water Types</option>
                    ${cfg.waterTypes.map(wt => `<option value="${wt}" ${priceWaterFilter === wt ? 'selected' : ''}>${wt}</option>`).join('')}
                    <option value="NONE" ${priceWaterFilter === 'NONE' ? 'selected' : ''}>No Water (Bottles / Flat)</option>
                  </select>

                  <!-- Search bar with clear button -->
                  <div class="st-search-wrap">
                    <span class="st-search-icon">${Icons.search}</span>
                    <input type="text" id="st-price-search" class="st-search-input" placeholder="Search price matrix…" value="${priceSearchFilter}" />
                    ${priceSearchFilter ? `<button type="button" id="btn-clear-price-search" class="st-search-clear" title="Clear filter">${Icons.x}</button>` : ''}
                  </div>
                </div>
              </div>

              <!-- Price Matrix Table -->
              <div style="overflow-x:auto;">
                <table class="st-grid-table" id="price-table">
                  <thead>
                    <tr>
                      <th style="width:44px;text-align:center;">#</th>
                      <th style="min-width:180px;">Container Type</th>
                      <th style="min-width:140px;">Water Variant</th>
                      <th style="min-width:140px;">Pick Up Rate</th>
                      <th style="min-width:140px;">Delivery Rate</th>
                      <th style="min-width:150px;">Spread / Margin</th>
                      <th style="min-width:200px;">Notes / Wholesale Rules</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${filteredPrices.length === 0 ? `
                      <tr>
                        <td colspan="7" style="text-align:center;padding:48px 24px;">
                          <div style="display:flex;flex-direction:column;align-items:center;gap:10px;color:var(--clr-text-muted);">
                            <div style="width:48px;height:48px;border-radius:12px;background:var(--clr-surface-2);display:flex;align-items:center;justify-content:center;color:var(--clr-text-dim);">
                              ${Icons.search}
                            </div>
                            <div style="font-weight:700;font-size:14px;color:var(--clr-text);">No matching price rows found</div>
                            <div style="font-size:12px;">Try adjusting your search query or switching active filter tabs.</div>
                            <button type="button" id="btn-reset-price-filter" class="btn btn-secondary btn-sm" style="margin-top:6px;">
                              Reset All Filters
                            </button>
                          </div>
                        </td>
                      </tr>
                    ` : filteredPrices.map((row, i) => {
                      const originalIndex = cfg.priceTable.indexOf(row)
                      const diff = row.deliver - row.pickup
                      const diffPct = row.pickup > 0 ? Math.round((diff / row.pickup) * 100) : 0

                      let waterBadgeHtml = '<span class="st-water-badge st-water-badge--none">— Flat / Bottle —</span>'
                      if (row.water) {
                        const wUpper = row.water.toUpperCase()
                        if (wUpper === 'ALKALINE') {
                          waterBadgeHtml = `<span class="st-water-badge st-water-badge--alkaline">💧 ALKALINE</span>`
                        } else if (wUpper === 'PURIFIED') {
                          waterBadgeHtml = `<span class="st-water-badge st-water-badge--purified">💧 PURIFIED</span>`
                        } else if (wUpper === 'MINERAL') {
                          waterBadgeHtml = `<span class="st-water-badge st-water-badge--mineral">💧 MINERAL</span>`
                        } else {
                          waterBadgeHtml = `<span class="st-water-badge" style="background:var(--clr-primary-glow);color:var(--clr-primary);border:1px solid rgba(13,148,136,0.3);">💧 ${row.water}</span>`
                        }
                      }

                      return `
                        <tr data-price-index="${originalIndex}">
                          <td style="color:var(--clr-text-muted);font-size:12px;text-align:center;font-weight:600;">${i + 1}</td>
                          <td>
                            <div style="display:flex;align-items:center;gap:8px;">
                              <span style="color:var(--clr-text-muted);">${row.water ? Icons.droplets : Icons.package}</span>
                              <span style="font-weight:700;color:var(--clr-text);letter-spacing:0.01em;">${row.container}</span>
                            </div>
                          </td>
                          <td>${waterBadgeHtml}</td>
                          <td>
                            <div class="st-currency-field">
                              <span class="st-currency-symbol">₱</span>
                              <input type="number" step="any" min="0" class="st-price-input price-pickup" data-index="${originalIndex}" value="${row.pickup}" />
                            </div>
                          </td>
                          <td>
                            <div class="st-currency-field">
                              <span class="st-currency-symbol">₱</span>
                              <input type="number" step="any" min="0" class="st-price-input price-deliver" data-index="${originalIndex}" value="${row.deliver}" />
                            </div>
                          </td>
                          <td>
                            ${diff > 0
                              ? `<span class="st-markup-badge st-markup-badge--positive" title="Delivery markup above pickup rate">+₱${diff.toFixed(2)} (+${diffPct}%)</span>`
                              : diff === 0
                                ? `<span class="st-markup-badge st-markup-badge--equal">Flat Rate (₱0)</span>`
                                : `<span class="st-markup-badge st-markup-badge--negative" title="Delivery discounted below pickup">-₱${Math.abs(diff).toFixed(2)} wholesale</span>`
                            }
                          </td>
                          <td>
                            <input type="text" class="note-input" data-index="${originalIndex}" value="${row.note || ''}" placeholder="e.g. 50 BOTTLE MINIMUM"
                              style="width:100%;padding:7px 10px;border-radius:8px;border:1px solid var(--clr-border);background:var(--clr-input-bg);color:var(--clr-text);font-size:12px;" />
                          </td>
                        </tr>
                      `
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
        `
      }

      case 'containers': {
        const filteredContainers = containerSearchFilter
          ? cfg.containerTypes.filter(ct => ct.name.toLowerCase().includes(containerSearchFilter.toLowerCase()))
          : cfg.containerTypes

        const waterCtCount = cfg.containerTypes.filter(ct => ct.requiresWaterType).length
        const flatCtCount = cfg.containerTypes.filter(ct => !ct.requiresWaterType).length

        return `
          <div style="display:flex;flex-direction:column;gap:20px;">

            <!-- Top Database Sync Notice & Actions -->
            <div class="st-hero-bar">
              <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                <div class="st-sync-pill">Database Synchronized</div>
                <span style="font-size:12px;color:var(--clr-text-muted);">
                  Container types &amp; water variants automatically sync to Supabase (<code>refill_container_types</code>, <code>refill_water_types</code>) and local SQLite.
                </span>
              </div>
              <button type="button" class="btn btn-secondary btn-sm btn-sync-db" style="display:flex;align-items:center;gap:6px;">
                ${Icons.refreshCw} Sync to Database Now
              </button>
            </div>

            <!-- Main Split Grid -->
            <div style="display:grid;grid-template-columns:1.15fr 0.85fr;gap:20px;align-items:start;">

              <!-- Container Types Column -->
              <div class="st-card">
                <div class="st-card-header">
                  <div>
                    <h3>${Icons.package} Container Types</h3>
                    <div style="font-size:12px;color:var(--clr-text-muted);margin-top:2px;">
                      ${cfg.containerTypes.length} configured (${waterCtCount} water variants · ${flatCtCount} flat)
                    </div>
                  </div>
                  <div style="display:flex;align-items:center;gap:8px;">
                    <input type="text" id="ct-search-input" placeholder="Search containers…" value="${containerSearchFilter}"
                      style="padding:6px 12px;border-radius:8px;border:1px solid var(--clr-border);background:var(--clr-surface-2);color:var(--clr-text);font-size:12px;width:150px;" />
                  </div>
                </div>

                <div class="st-card-body">
                  <div style="display:flex;flex-direction:column;gap:8px;" id="container-types-list">
                    ${filteredContainers.map((ct) => {
                      const originalIndex = cfg.containerTypes.indexOf(ct)
                      const priceRowCount = cfg.priceTable.filter(p => p.container === ct.name).length

                      return `
                        <div class="st-container-item">
                          <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                            <div class="st-container-icon-box ${ct.requiresWaterType ? 'st-container-icon-box--water' : 'st-container-icon-box--flat'}">
                              ${ct.requiresWaterType ? Icons.droplets : Icons.package}
                            </div>
                            <div style="min-width:0;">
                              <div style="display:flex;align-items:center;gap:8px;">
                                <span style="font-weight:800;font-size:13px;color:var(--clr-text);letter-spacing:0.02em;">${ct.name}</span>
                                ${ct.requiresWaterType
                                  ? `<span class="st-tag-pill" style="background:var(--clr-primary-glow);color:var(--clr-primary);border-color:rgba(13,148,136,0.3);">💧 Water Selection</span>`
                                  : `<span class="st-tag-pill" style="background:rgba(217,119,6,0.1);color:var(--clr-deliver);border-color:rgba(217,119,6,0.3);">📦 Flat Rate</span>`
                                }
                              </div>
                              <div style="font-size:11px;color:var(--clr-text-muted);margin-top:3px;">
                                ${ct.requiresWaterType
                                  ? `Multi-variant (${cfg.waterTypes.join(' / ')}) · ${priceRowCount} price rules`
                                  : `Single flat item / bottle price · ${priceRowCount} price rule`
                                }
                              </div>
                            </div>
                          </div>

                          <div style="display:flex;align-items:center;gap:12px;flex-shrink:0;">
                            <label class="toggle" title="Toggle Water Type Requirement (Multi-variant vs Flat)">
                              <input type="checkbox" class="ct-requires-water" data-index="${originalIndex}" ${ct.requiresWaterType ? 'checked' : ''} />
                              <span class="slider"></span>
                            </label>
                            <button class="btn btn-ghost btn-icon btn-del-ct" data-index="${originalIndex}" title="Delete Container Type" style="color:var(--clr-error);">
                              ${Icons.trash}
                            </button>
                          </div>
                        </div>
                      `
                    }).join('')}
                  </div>

                  <!-- Add Container Box -->
                  <div class="st-add-box">
                    <div style="display:flex;align-items:center;gap:8px;">
                      <span style="color:var(--clr-primary);">${Icons.plus}</span>
                      <span style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--clr-text);">Register New Container Type</span>
                    </div>

                    <div style="display:flex;gap:10px;">
                      <input type="text" id="new-ct-name" placeholder="e.g. 5 GAL SLIM, 20L DISPENSER"
                        style="flex:1;padding:9px 12px;border-radius:8px;border:1px solid var(--clr-border);background:var(--clr-input-bg);color:var(--clr-text);font-size:13px;text-transform:uppercase;font-weight:700;" />
                      <button id="btn-add-ct" class="btn btn-primary btn-sm" style="display:flex;align-items:center;gap:6px;padding:9px 16px;">
                        ${Icons.plus} Add Container
                      </button>
                    </div>

                    <label style="display:flex;align-items:flex-start;gap:8px;font-size:12px;color:var(--clr-text-muted);cursor:pointer;">
                      <input type="checkbox" id="new-ct-req" checked style="margin-top:2px;cursor:pointer;" />
                      <div>
                        <strong style="color:var(--clr-text);">Requires water type selection (Purified / Alkaline / Mineral)</strong>
                        <div style="font-size:11px;margin-top:1px;">When checked, generates separate price rows for each water variant. When unchecked, uses a single flat price (e.g. bottled water).</div>
                      </div>
                    </label>

                    <div style="font-size:11px;color:var(--clr-text-dim);display:flex;align-items:center;gap:6px;border-top:1px solid var(--clr-border);padding-top:8px;margin-top:2px;">
                      <span style="color:var(--clr-success);">✓</span> Automatically persists to local SQLite database and uploads to Supabase cloud.
                    </div>
                  </div>
                </div>
              </div>

              <!-- Water Types Column -->
              <div class="st-card">
                <div class="st-card-header">
                  <div>
                    <h3>${Icons.droplets} Water Types</h3>
                    <div style="font-size:12px;color:var(--clr-text-muted);margin-top:2px;">
                      ${cfg.waterTypes.length} configured refill variants
                    </div>
                  </div>
                </div>

                <div class="st-card-body">
                  <div style="display:flex;flex-direction:column;gap:8px;" id="water-types-list">
                    ${cfg.waterTypes.map((wt, i) => {
                      const wUpper = wt.toUpperCase()
                      let badgeClass = 'st-water-card'
                      let iconColor = 'var(--clr-primary)'
                      let desc = 'Custom refill drinking water variant'

                      if (wUpper === 'ALKALINE') {
                        iconColor = '#9333ea'
                        desc = 'High-pH ionized drinking water variant'
                      } else if (wUpper === 'PURIFIED') {
                        iconColor = '#0284c7'
                        desc = 'Reverse osmosis purified water variant'
                      } else if (wUpper === 'MINERAL') {
                        iconColor = '#059669'
                        desc = 'Mineral-enriched clean drinking water variant'
                      }

                      const containerCount = cfg.containerTypes.filter(ct => ct.requiresWaterType).length

                      return `
                        <div class="${badgeClass}">
                          <div style="display:flex;align-items:center;gap:12px;">
                            <div style="width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,0.06);display:flex;align-items:center;justify-content:center;color:${iconColor};flex-shrink:0;">
                              ${Icons.droplets}
                            </div>
                            <div>
                              <div style="font-weight:800;font-size:13px;color:var(--clr-text);letter-spacing:0.02em;">${wt}</div>
                              <div style="font-size:11px;color:var(--clr-text-muted);margin-top:2px;">${desc}</div>
                              <div style="font-size:10px;color:var(--clr-text-dim);margin-top:2px;font-weight:600;">
                                Linked to ${containerCount} container type${containerCount !== 1 ? 's' : ''}
                              </div>
                            </div>
                          </div>

                          <button class="btn btn-ghost btn-icon btn-del-wt" data-index="${i}" title="Delete Water Type" style="color:var(--clr-error);">
                            ${Icons.trash}
                          </button>
                        </div>
                      `
                    }).join('')}
                  </div>

                  <!-- Add Water Box -->
                  <div class="st-add-box">
                    <div style="display:flex;align-items:center;gap:8px;">
                      <span style="color:var(--clr-primary);">${Icons.plus}</span>
                      <span style="font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--clr-text);">Register New Water Type</span>
                    </div>

                    <div style="display:flex;gap:10px;">
                      <input type="text" id="new-water-name" placeholder="e.g. DISTILLED, OXYGENATED"
                        style="flex:1;padding:9px 12px;border-radius:8px;border:1px solid var(--clr-border);background:var(--clr-input-bg);color:var(--clr-text);font-size:13px;text-transform:uppercase;font-weight:700;" />
                      <button id="btn-add-water" class="btn btn-primary btn-sm" style="display:flex;align-items:center;gap:6px;padding:9px 16px;">
                        ${Icons.plus} Add Water
                      </button>
                    </div>

                    <div style="font-size:11px;color:var(--clr-text-muted);">
                      Adding a new water type automatically generates price matrix entries for all ${waterCtCount} containers requiring water.
                    </div>
                  </div>
                </div>
              </div>

            </div>

          </div>
        `
      }

      case 'backup':
        return `
          <div style="display:flex;flex-direction:column;gap:20px;">
            <!-- Local Automated Backup -->
            <div class="st-card">
              <div class="st-card-header">
                <h3>${Icons.shieldCheck} Local Automated Backup</h3>
                ${cfg.backupFolder ? `<button id="btn-run-backup-now" class="btn btn-primary btn-sm" style="display:flex;align-items:center;gap:6px;">${Icons.refreshCw} Run Backup Now</button>` : ''}
              </div>
              <div class="st-card-body">
                <div class="st-folder-row">
                  <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                    <span style="color:${cfg.backupFolder ? 'var(--clr-success)' : 'var(--clr-text-muted)'};display:inline-flex;">
                      ${cfg.backupFolder ? Icons.shieldCheck : Icons.archive}
                    </span>
                    <span class="st-folder-path">${cfg.backupFolder || 'No backup directory configured (Automatic backups paused)'}</span>
                  </div>
                  <div style="display:flex;gap:8px;flex-shrink:0;">
                    <button id="btn-choose-backup-folder" class="btn btn-secondary btn-sm">
                      ${cfg.backupFolder ? 'Change Folder' : 'Set Backup Folder'}
                    </button>
                    ${cfg.backupFolder ? `<button id="btn-clear-backup-folder" class="btn btn-ghost btn-sm text-error">Clear</button>` : ''}
                  </div>
                </div>

                <div style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-radius:12px;background:var(--clr-surface-2);border:1px solid var(--clr-border);flex-wrap:wrap;gap:12px;">
                  <div>
                    <div style="font-weight:700;font-size:13px;color:var(--clr-text);">Daily Backup Schedule</div>
                    <div style="font-size:12px;color:var(--clr-text-muted);margin-top:2px;">Runs automatically in background at the specified time</div>
                  </div>
                  <div style="display:flex;align-items:center;gap:10px;">
                    <input type="time" id="inp-backup-time" value="${cfg.backupTime || '19:00'}"
                      style="padding:7px 12px;border-radius:8px;border:1px solid var(--clr-border);background:var(--clr-input-bg);color:var(--clr-text);font-size:13px;font-family:monospace;" />
                    <button id="btn-save-backup-time" class="btn btn-secondary btn-sm">Save Time</button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Google Drive Cloud Backup -->
            <div class="st-card">
              <div class="st-card-header">
                <h3>${Icons.externalLink} Google Drive Cloud Sync</h3>
              </div>
              <div class="st-card-body">
                <p style="margin:0;font-size:13px;color:var(--clr-text-muted);">
                  Automatically mirror backups to your Google Drive account for off-site disaster recovery and safe multi-device preservation.
                </p>

                <div style="padding:18px 20px;border-radius:12px;background:var(--clr-surface-2);border:1px solid var(--clr-border);">
                  ${isFetchingDrive
                    ? `<div style="display:flex;align-items:center;gap:10px;font-size:13px;color:var(--clr-text-muted);"><span class="spinner" style="width:16px;height:16px"></span> Checking Google Drive connection…</div>`
                    : driveConnected
                      ? `
                        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
                          <div style="display:flex;align-items:center;gap:12px;">
                            <div style="width:36px;height:36px;border-radius:10px;background:rgba(16,185,129,0.15);color:#10b981;display:flex;align-items:center;justify-content:center;">
                              ${Icons.checkCircle}
                            </div>
                            <div>
                              <div style="font-weight:700;font-size:13px;color:var(--clr-text);">Connected to Google Drive</div>
                              <div style="font-size:12px;color:var(--clr-text-muted);">${driveEmail}</div>
                            </div>
                          </div>
                          <button id="btn-drive-disconnect" class="btn btn-outline btn-sm text-error">
                            Disconnect Account
                          </button>
                        </div>
                      `
                      : `
                        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
                          <div>
                            <div style="font-weight:700;font-size:13px;color:var(--clr-text);">Not Connected</div>
                            <div style="font-size:12px;color:var(--clr-text-muted);">Connect your Google Account to enable automatic cloud uploads.</div>
                          </div>
                          <button id="btn-drive-connect" class="btn btn-primary btn-sm">
                            Connect Google Drive
                          </button>
                        </div>
                      `
                  }
                </div>
              </div>
            </div>

            <!-- Supabase Cloud Database -->
            <div class="st-card">
              <div class="st-card-header">
                <h3>${Icons.shieldCheck} Supabase Cloud Database</h3>
                <button id="btn-test-supabase" type="button" class="btn btn-secondary btn-sm" style="display:flex;align-items:center;gap:6px;">
                  ${Icons.refreshCw} Test Connection
                </button>
              </div>
              <div class="st-card-body" style="gap:16px;">
                <p style="margin:0;font-size:13px;color:var(--clr-text-muted);">
                  App database credentials stored securely in your local machine profile (never bundled into installer binaries).
                </p>

                <div style="display:flex;flex-direction:column;gap:12px;">
                  <div style="display:flex;flex-direction:column;gap:6px;">
                    <label style="font-size:11px;font-weight:700;color:var(--clr-text-muted);text-transform:uppercase;letter-spacing:.05em;">Project URL</label>
                    <input type="text" id="inp-sb-url" value="${cfg.supabaseUrl || ''}" placeholder="https://ukjgbonqbufflwxdgian.supabase.co"
                      style="padding:8px 12px;border-radius:8px;border:1px solid var(--clr-border);background:var(--clr-input-bg);color:var(--clr-text);font-size:13px;font-family:monospace;" />
                  </div>

                  <div style="display:flex;flex-direction:column;gap:6px;">
                    <label style="font-size:11px;font-weight:700;color:var(--clr-text-muted);text-transform:uppercase;letter-spacing:.05em;">Supabase Anon Key (Public Key)</label>
                    <input type="password" id="inp-sb-anon-key" value="${cfg.supabaseAnonKey || ''}" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                      style="padding:8px 12px;border-radius:8px;border:1px solid var(--clr-border);background:var(--clr-input-bg);color:var(--clr-text);font-size:13px;font-family:monospace;" />
                  </div>

                  <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div style="display:flex;flex-direction:column;gap:6px;">
                      <label style="font-size:11px;font-weight:700;color:var(--clr-text-muted);text-transform:uppercase;letter-spacing:.05em;">App Account Email</label>
                      <input type="email" id="inp-app-email" value="${cfg.appAccountEmail || ''}" placeholder="app@agwaterrefill.internal"
                        style="padding:8px 12px;border-radius:8px;border:1px solid var(--clr-border);background:var(--clr-input-bg);color:var(--clr-text);font-size:13px;" />
                    </div>
                    <div style="display:flex;flex-direction:column;gap:6px;">
                      <label style="font-size:11px;font-weight:700;color:var(--clr-text-muted);text-transform:uppercase;letter-spacing:.05em;">App Account Password</label>
                      <input type="password" id="inp-app-pass" value="${cfg.appAccountPassword || ''}" placeholder="Generated app password"
                        style="padding:8px 12px;border-radius:8px;border:1px solid var(--clr-border);background:var(--clr-input-bg);color:var(--clr-text);font-size:13px;" />
                    </div>
                  </div>

                  <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:4px;">
                    <span id="st-supabase-test-status" style="font-size:12px;font-weight:600;"></span>
                    <button id="btn-save-supabase" type="button" class="btn btn-primary btn-sm" style="display:flex;align-items:center;gap:6px;">
                      ${Icons.check} Save Database Settings
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `

      case 'about': {
        const renderBadge = () => {
          switch (updateState.status) {
            case 'checking':
              return `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;background:rgba(14,165,233,0.12);color:var(--clr-primary);border:1px solid rgba(14,165,233,0.25);"><span class="st-btn-spinner" style="width:10px;height:10px;border-width:2px;"></span> Checking GitHub...</span>`
            case 'downloading':
              return `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;background:rgba(14,165,233,0.12);color:var(--clr-primary);border:1px solid rgba(14,165,233,0.25);"><span class="st-pulse-dot"></span> Downloading (${updateState.progress?.percent || 0}%)</span>`
            case 'downloaded':
              return `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;background:rgba(16,185,129,0.15);color:var(--clr-success);border:1px solid rgba(16,185,129,0.3);">${Icons.check} Update Ready</span>`
            case 'available':
              return `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;background:rgba(245,158,11,0.12);color:#d97706;border:1px solid rgba(245,158,11,0.25);">${Icons.download} Update Available</span>`
            case 'not-available':
              return `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;background:rgba(16,185,129,0.12);color:var(--clr-success);border:1px solid rgba(16,185,129,0.25);">${Icons.check} Up to Date</span>`
            case 'error':
              return `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;background:rgba(239,68,68,0.12);color:var(--clr-danger);border:1px solid rgba(239,68,68,0.25);">${Icons.alertTriangle} Check Notice</span>`
            default:
              return `<span style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:20px;font-size:11px;font-weight:700;background:var(--clr-surface-2);color:var(--clr-text-muted);border:1px solid var(--clr-border);">Ready</span>`
          }
        }

        return `
          <div style="display:flex;flex-direction:column;gap:20px;">

            <!-- APPLICATION UPDATES CARD -->
            <div class="st-card">
              <div class="st-card-header">
                <div style="display:flex;align-items:center;gap:10px;">
                  <span style="display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;background:rgba(14,165,233,0.12);color:var(--clr-primary);">
                    ${Icons.refreshCw}
                  </span>
                  <div>
                    <h3 style="margin:0;font-size:15px;font-weight:700;color:var(--clr-text);">Application Updates</h3>
                    <span style="font-size:12px;color:var(--clr-text-muted);">Automated online updates via GitHub Releases</span>
                  </div>
                </div>
                ${renderBadge()}
              </div>

              <div class="st-card-body" style="gap:18px;">
                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;">
                  <div style="padding:14px 16px;border-radius:12px;background:var(--clr-surface-2);border:1px solid var(--clr-border);">
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--clr-text-muted);">Installed Version</div>
                    <div style="font-size:16px;font-weight:800;color:var(--clr-text);margin-top:4px;display:flex;align-items:center;gap:8px;">
                      v${appVersion}
                      <span style="font-size:11px;font-weight:600;padding:2px 8px;border-radius:12px;background:rgba(255,255,255,0.06);color:var(--clr-text-muted);border:1px solid var(--clr-border);">Current</span>
                    </div>
                  </div>

                  <div style="padding:14px 16px;border-radius:12px;background:var(--clr-surface-2);border:1px solid var(--clr-border);">
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--clr-text-muted);">Update Channel</div>
                    <div style="font-size:13px;font-weight:700;color:var(--clr-text);margin-top:4px;display:flex;align-items:center;gap:6px;">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
                      kyber0/A-G-Daily-Log
                    </div>
                  </div>

                  <div style="padding:14px 16px;border-radius:12px;background:var(--clr-surface-2);border:1px solid var(--clr-border);">
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--clr-text-muted);">Last Check</div>
                    <div style="font-size:13px;font-weight:600;color:var(--clr-text);margin-top:4px;">
                      ${updateState.lastChecked ? formatLastCheck(updateState.lastChecked) : 'Not checked yet'}
                    </div>
                  </div>
                </div>

                ${updateState.status === 'downloading' ? `
                  <div style="padding:16px 20px;border-radius:12px;background:rgba(14,165,233,0.06);border:1px solid rgba(14,165,233,0.25);display:flex;flex-direction:column;gap:10px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;">
                      <span style="font-size:13px;font-weight:700;color:var(--clr-text);display:flex;align-items:center;gap:8px;">
                        <span class="st-pulse-dot"></span>
                        Downloading Update ${updateState.availableVersion ? `(v${updateState.availableVersion})` : ''}...
                      </span>
                      <span style="font-size:13px;font-weight:800;color:var(--clr-primary);font-family:monospace;">
                        ${updateState.progress?.percent || 0}%
                      </span>
                    </div>

                    <div style="width:100%;height:8px;border-radius:4px;background:var(--clr-surface);overflow:hidden;border:1px solid var(--clr-border);">
                      <div style="height:100%;background:linear-gradient(90deg,var(--clr-primary),#38bdf8);border-radius:4px;width:${updateState.progress?.percent || 0}%;transition:width 0.2s ease;"></div>
                    </div>

                    <div style="display:flex;align-items:center;justify-content:space-between;font-size:11px;color:var(--clr-text-muted);">
                      <span>${formatBytes(updateState.progress?.transferred || 0)} / ${formatBytes(updateState.progress?.total || 0)}</span>
                      <span>${formatBytes(updateState.progress?.bytesPerSecond || 0)}/s</span>
                    </div>
                  </div>
                ` : ''}

                ${updateState.status === 'downloaded' ? `
                  <div style="padding:16px 20px;border-radius:12px;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.3);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:14px;">
                    <div style="display:flex;align-items:center;gap:12px;">
                      <div style="width:36px;height:36px;border-radius:50%;background:rgba(16,185,129,0.15);color:var(--clr-success);display:flex;align-items:center;justify-content:center;">
                        ${Icons.checkCircle}
                      </div>
                      <div>
                        <div style="font-size:14px;font-weight:800;color:var(--clr-text);">Update Ready to Install!</div>
                        <div style="font-size:12px;color:var(--clr-text-muted);">Version ${updateState.availableVersion || 'latest'} has been downloaded and verified.</div>
                      </div>
                    </div>
                    <button id="btn-install-update" class="btn" style="background:var(--clr-success);color:#fff;font-weight:700;display:flex;align-items:center;gap:8px;padding:10px 20px;box-shadow:0 2px 8px rgba(16,185,129,0.3);cursor:pointer;">
                      ${Icons.refreshCw} Restart & Apply Update
                    </button>
                  </div>
                ` : ''}

                ${updateState.status === 'error' ? `
                  <div style="padding:14px 16px;border-radius:10px;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.25);display:flex;align-items:center;gap:12px;">
                    <span style="color:var(--clr-danger);display:flex;align-items:center;">${Icons.alertTriangle}</span>
                    <div style="flex:1;">
                      <div style="font-size:13px;font-weight:700;color:var(--clr-danger);">Notice</div>
                      <div style="font-size:12px;color:var(--clr-text-muted);margin-top:2px;">${updateState.error || 'Unable to fetch updates from GitHub.'}</div>
                    </div>
                  </div>
                ` : ''}

                <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding-top:4px;">
                  <button id="btn-check-updates" class="btn btn-secondary" style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;" ${updateState.status === 'checking' || updateState.status === 'downloading' ? 'disabled' : ''}>
                    ${updateState.status === 'checking'
                      ? `<span class="st-btn-spinner"></span> Checking GitHub...`
                      : `${Icons.refreshCw} Check for Updates Now`}
                  </button>

                  <span style="font-size:12px;color:var(--clr-text-muted);">
                    The app automatically checks for updates in the background upon launch.
                  </span>
                </div>
              </div>
            </div>

            <!-- APPLICATION DETAILS CARD -->
            <div class="st-card">
              <div class="st-card-header">
                <h3>${Icons.info} Application Details</h3>
              </div>
              <div class="st-card-body">
                <div style="display:flex;align-items:center;gap:20px;">
                  <div style="width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,var(--clr-primary),#6366f1);display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;font-weight:900;box-shadow:var(--shadow-md);">
                    A&G
                  </div>
                  <div>
                    <div style="font-size:18px;font-weight:800;color:var(--clr-text);">Living Water A&G System</div>
                    <div style="font-size:13px;color:var(--clr-text-muted);margin-top:2px;">Version ${appVersion} (Production Build)</div>
                  </div>
                </div>

                <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-top:10px;">
                  <div style="padding:14px;border-radius:10px;background:var(--clr-surface-2);border:1px solid var(--clr-border);">
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--clr-text-muted);">Architecture</div>
                    <div style="font-size:14px;font-weight:700;color:var(--clr-text);margin-top:4px;">Electron + Supabase Cloud</div>
                  </div>
                  <div style="padding:14px;border-radius:10px;background:var(--clr-surface-2);border:1px solid var(--clr-border);">
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--clr-text-muted);">Database Sync</div>
                    <div style="font-size:14px;font-weight:700;color:var(--clr-success);margin-top:4px;display:flex;align-items:center;gap:6px;">
                      ${Icons.check} Live Connected
                    </div>
                  </div>
                  <div style="padding:14px;border-radius:10px;background:var(--clr-surface-2);border:1px solid var(--clr-border);">
                    <div style="font-size:11px;font-weight:700;text-transform:uppercase;color:var(--clr-text-muted);">Developer</div>
                    <div style="font-size:14px;font-weight:700;color:var(--clr-text);margin-top:4px;">Keaneth Dave Berido</div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        `
      }
    }
  }

  function syncPricesFromDOM(): void {
    container.querySelectorAll<HTMLInputElement>('.price-pickup').forEach(inp => {
      const i = parseInt(inp.dataset.index!, 10)
      if (cfg.priceTable[i]) cfg.priceTable[i].pickup = parseFloat(inp.value) || 0
    })
    container.querySelectorAll<HTMLInputElement>('.price-deliver').forEach(inp => {
      const i = parseInt(inp.dataset.index!, 10)
      if (cfg.priceTable[i]) cfg.priceTable[i].deliver = parseFloat(inp.value) || 0
    })
    container.querySelectorAll<HTMLInputElement>('.note-input').forEach(inp => {
      const i = parseInt(inp.dataset.index!, 10)
      if (cfg.priceTable[i]) cfg.priceTable[i].note = inp.value.trim()
    })
  }

  function bindEvents(): void {
    const q = <T extends Element>(sel: string) => container.querySelector<T>(sel)

    // Tab Navigation
    // Scroll listener on .st-screen to persist scroll offset
    const currentScreenEl = container.querySelector<HTMLElement>('.st-screen')
    currentScreenEl?.addEventListener('scroll', () => {
      savedScrollPosition = currentScreenEl.scrollTop
      try {
        sessionStorage.setItem('settingsScrollTop', String(currentScreenEl.scrollTop))
      } catch {}
    }, { passive: true })

    // Tab Navigation
    container.querySelectorAll<HTMLButtonElement>('.st-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        if (activeTab === 'pricing') syncPricesFromDOM()
        const newTab = btn.dataset.tab as any
        if (newTab !== activeTab) {
          savedScrollPosition = 0
          try {
            sessionStorage.removeItem('settingsScrollTop')
          } catch {}
        }
        activeTab = newTab
        try {
          sessionStorage.setItem('settingsActiveTab', activeTab)
        } catch {}
        render()
      })
    })

    // ── Storage Events ────────────────────────────────────────────────────────
    q('#btn-change-folder')?.addEventListener('click', async () => {
      const result = await window.api.chooseFolder()
      if (!result.ok) return
      cfg.saveFolder = result.data
      await persistConfig()
      render()
    })

    q('#btn-open-folder')?.addEventListener('click', () => {
      window.api.openSaveFolder()
    })

    q('#btn-change-inv-folder')?.addEventListener('click', async () => {
      const result = await window.api.chooseFolder()
      if (!result.ok) return
      cfg.inventoryFolder = result.data
      await persistConfig()
      render()
    })

    // ── Export Center Events ──────────────────────────────────────────────────
    const monthInput = q<HTMLInputElement>('#st-export-month')
    if (monthInput) {
      monthInput.addEventListener('change', () => {
        exportMonth = monthInput.value || new Date().toISOString().substring(0, 7)
      })
      monthInput.addEventListener('click', () => {
        try {
          if ('showPicker' in HTMLInputElement.prototype) {
            monthInput.showPicker()
          }
        } catch {}
      })
    }

    const getActiveMonth = (): string => {
      const inp = q<HTMLInputElement>('#st-export-month')
      return (inp && inp.value) ? inp.value : (exportMonth || new Date().toISOString().substring(0, 7))
    }

    const handleFileExport = async (
      btnOrSelector: string | HTMLButtonElement,
      actionName: string,
      exportFn: (targetMonth: string) => Promise<{ ok: boolean; data?: string; error?: string }>
    ) => {
      const btn = typeof btnOrSelector === 'string'
        ? (container.querySelector<HTMLButtonElement>(btnOrSelector) || container.querySelector<HTMLButtonElement>(`${btnOrSelector} button`))
        : btnOrSelector
      if (!btn) return
      const targetMonth = getActiveMonth()
      const origHtml = btn.innerHTML
      btn.innerHTML = `<span class="spinner" style="width:14px;height:14px"></span> Exporting…`
      btn.disabled = true
      try {
        const res = await exportFn(targetMonth)
        if (res && res.ok && res.data) {
          showToast(`${actionName} exported successfully!`, 'success')
          const choice = await showModal({
            icon: Icons.checkCircle,
            iconColor: 'success',
            title: 'Export Complete',
            body: `File saved successfully:<br><code style="font-size:12px;color:var(--clr-primary);word-break:break-all;margin-top:6px;display:block;">${res.data}</code>`,
            buttons: [
              { id: 'open', label: 'Open in Explorer', className: 'btn-primary' },
              { id: 'close', label: 'Done', className: 'btn-ghost' }
            ]
          })
          if (choice === 'open') {
            window.api.exportOpenFile(res.data)
          }
        } else if (res && !res.ok) {
          showToast(`Export failed: ${res.error}`, 'error')
        }
      } catch (err: any) {
        showToast(`Export error: ${err.message || err}`, 'error')
      } finally {
        btn.innerHTML = origHtml
        btn.disabled = false
      }
    }

    // ── Bulk Year Export ──────────────────────────────────────────────────────
    q('#btn-bulk-export')?.addEventListener('click', async () => {
      const yearSelect = q<HTMLSelectElement>('#bulk-export-year')
      const year = yearSelect ? parseInt(yearSelect.value, 10) : new Date().getFullYear()
      const btn = q<HTMLButtonElement>('#btn-bulk-export')
      if (!btn) return
      const origHtml = btn.innerHTML
      btn.innerHTML = `<span class="spinner" style="width:14px;height:14px"></span> Exporting ${year}…`
      btn.disabled = true
      try {
        const res = await window.api.exportBulkYear(year)
        if (res.ok && res.data && res.data.filesWritten > 0) {
          showToast(`Successfully exported ${res.data.filesWritten} workbooks for ${year}!`, 'success')
          const choice = await showModal({
            icon: Icons.checkCircle,
            iconColor: 'success',
            title: 'Bulk Export Complete',
            body: `Exported <strong>${res.data.filesWritten}</strong> Excel spreadsheets for <strong>${year}</strong> to:<br><code style="font-size:12px;color:var(--clr-primary);word-break:break-all;margin-top:6px;display:block;">${res.data.folder}</code>`,
            buttons: [
              { id: 'open', label: 'Open Folder', className: 'btn-primary' },
              { id: 'close', label: 'Done', className: 'btn-ghost' }
            ]
          })
          if (choice === 'open') {
            window.api.exportOpenFile(res.data.folder)
          }
        } else if (res.ok && res.data && res.data.filesWritten === 0 && res.data.folder) {
          showToast(`No sales data found for year ${year}.`, 'info')
        } else if (!res.ok) {
          showToast(`Export failed: ${res.error}`, 'error')
        }
      } catch (err: any) {
        showToast(`Export error: ${err.message || err}`, 'error')
      } finally {
        btn.innerHTML = origHtml
        btn.disabled = false
      }
    })

    // ── Single Month Action Buttons ──────────────────────────────────────────
    container.querySelectorAll<HTMLButtonElement>('.do-export').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        const action = btn.dataset.action
        if (action === 'dailylog') {
          handleFileExport(btn, 'Daily Refill Log', (m) => window.api.exportDailyLog(m))
        } else if (action === 'sales') {
          handleFileExport(btn, 'Monthly Item Sales', (m) => window.api.exportSalesReport(m))
        } else if (action === 'stock') {
          handleFileExport(btn, 'Stock Inventory Report', () => window.api.exportStockReport())
        }
      })
    })

    // Helper for folder export actions
    const handleFolderExport = async (btnId: string, folderName: string, folderPath: string) => {
      if (!folderPath) {
        showToast(`Please configure ${folderName} path first.`, 'error')
        return
      }
      const btn = q<HTMLButtonElement>(btnId)
      if (!btn) return
      const origHtml = btn.innerHTML
      btn.innerHTML = `<span class="spinner" style="width:14px;height:14px"></span> Copying…`
      btn.disabled = true
      try {
        const res = await window.api.exportFolder(folderPath)
        if (res.ok && res.data && res.data.filesCopied > 0) {
          showToast(`Successfully copied ${res.data.filesCopied} file${res.data.filesCopied !== 1 ? 's' : ''}!`, 'success')
          const choice = await showModal({
            icon: Icons.checkCircle,
            iconColor: 'success',
            title: 'Folder Export Complete',
            body: `Copied <strong>${res.data.filesCopied}</strong> file${res.data.filesCopied !== 1 ? 's' : ''} to destination folder:<br><code style="font-size:12px;color:var(--clr-primary);word-break:break-all;margin-top:6px;display:block;">${res.data.destPath}</code>`,
            buttons: [
              { id: 'open', label: 'Open Destination', className: 'btn-primary' },
              { id: 'close', label: 'Done', className: 'btn-ghost' }
            ]
          })
          if (choice === 'open') {
            window.api.exportOpenFile(res.data.destPath)
          }
        } else if (res.ok && res.data && res.data.filesCopied === 0 && res.data.destPath) {
          showToast('Folder was copied (0 files found).', 'info')
        } else if (!res.ok) {
          showToast(`Folder export failed: ${res.error}`, 'error')
        }
      } catch (err: any) {
        showToast(`Folder export error: ${err.message || err}`, 'error')
      } finally {
        btn.innerHTML = origHtml
        btn.disabled = false
      }
    }

    q('#btn-export-water-folder')?.addEventListener('click', () => {
      handleFolderExport('#btn-export-water-folder', 'Daily Water Log Folder', cfg.saveFolder)
    })

    q('#btn-export-inv-folder')?.addEventListener('click', () => {
      handleFolderExport('#btn-export-inv-folder', 'Stock & Sales Folder', cfg.inventoryFolder)
    })

    q('#btn-export-backup-folder')?.addEventListener('click', () => {
      handleFolderExport('#btn-export-backup-folder', 'Backup Folder', cfg.backupFolder)
    })

    // ── Pricing Events ────────────────────────────────────────────────────────
    const priceSearch = q<HTMLInputElement>('#st-price-search')
    if (priceSearch) {
      priceSearch.addEventListener('input', () => {
        syncPricesFromDOM()
        priceSearchFilter = priceSearch.value
        refreshTabContent()
        const restoredSearch = q<HTMLInputElement>('#st-price-search')
        if (restoredSearch) {
          restoredSearch.focus()
          restoredSearch.setSelectionRange(priceSearchFilter.length, priceSearchFilter.length)
        }
      })
    }

    q('#btn-clear-price-search')?.addEventListener('click', () => {
      syncPricesFromDOM()
      priceSearchFilter = ''
      refreshTabContent()
    })

    q('#btn-reset-price-filter')?.addEventListener('click', () => {
      syncPricesFromDOM()
      priceSearchFilter = ''
      priceCategoryFilter = 'all'
      priceWaterFilter = 'ALL'
      refreshTabContent()
    })

    container.querySelectorAll<HTMLButtonElement>('.st-price-cat-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        syncPricesFromDOM()
        priceCategoryFilter = (btn.dataset.cat as any) || 'all'
        refreshTabContent()
      })
    })

    const waterSelect = q<HTMLSelectElement>('#st-price-water-filter')
    if (waterSelect) {
      waterSelect.addEventListener('change', () => {
        syncPricesFromDOM()
        priceWaterFilter = waterSelect.value
        refreshTabContent()
      })
    }

    q('#btn-save-prices')?.addEventListener('click', async () => {
      syncPricesFromDOM()
      await persistConfig()
      showToast('Price table saved and synchronized with database!', 'success')
    })

    // ── Global Sync to Database Button ────────────────────────────────────────
    container.querySelectorAll<HTMLButtonElement>('.btn-sync-db').forEach(btn => {
      btn.addEventListener('click', async () => {
        syncPricesFromDOM()
        const origHtml = btn.innerHTML
        btn.innerHTML = `<span class="spinner" style="width:14px;height:14px"></span> Syncing…`
        btn.disabled = true
        try {
          let res: { ok: boolean; data?: { containersSynced: number; waterTypesSynced: number; pricesSynced: number }; error?: string }

          if (typeof window.api.syncSettingsToDatabase === 'function') {
            res = await window.api.syncSettingsToDatabase()
          } else {
            const updateRes = await window.api.updateSettings({
              containerTypes: cfg.containerTypes,
              waterTypes: cfg.waterTypes,
              priceTable: cfg.priceTable
            })
            if (updateRes.ok) {
              res = {
                ok: true,
                data: {
                  containersSynced: cfg.containerTypes.length,
                  waterTypesSynced: cfg.waterTypes.length,
                  pricesSynced: cfg.priceTable.length
                }
              }
            } else {
              res = { ok: false, error: updateRes.error }
            }
          }

          if (res.ok && res.data) {
            showToast(
              `✓ Database synced: ${res.data.containersSynced} containers, ${res.data.waterTypesSynced} water types, ${res.data.pricesSynced} price combinations.`,
              'success',
              3500
            )
          } else {
            showToast(`Sync warning: ${res.error || 'Failed to sync'}`, 'info', 4000)
          }
        } catch (err: any) {
          showToast(`Database sync error: ${err.message || err}`, 'error')
        } finally {
          btn.innerHTML = origHtml
          btn.disabled = false
        }
      })
    })

    // ── Container & Water Events ──────────────────────────────────────────────
    const ctSearch = q<HTMLInputElement>('#ct-search-input')
    if (ctSearch) {
      ctSearch.addEventListener('input', () => {
        containerSearchFilter = ctSearch.value
        refreshTabContent()
        const restoredCtSearch = q<HTMLInputElement>('#ct-search-input')
        if (restoredCtSearch) {
          restoredCtSearch.focus()
          restoredCtSearch.setSelectionRange(containerSearchFilter.length, containerSearchFilter.length)
        }
      })
    }

    container.querySelectorAll<HTMLInputElement>('.ct-requires-water').forEach(chk => {
      chk.addEventListener('change', async () => {
        const i = parseInt(chk.dataset.index!, 10)
        const ct = cfg.containerTypes[i]
        ct.requiresWaterType = chk.checked

        // Adjust price matrix rows accordingly
        if (ct.requiresWaterType) {
          cfg.priceTable = cfg.priceTable.filter(p => !(p.container === ct.name && p.water === ''))
          cfg.waterTypes.forEach(wt => {
            if (!cfg.priceTable.find(p => p.container === ct.name && p.water === wt)) {
              cfg.priceTable.push({ container: ct.name, water: wt, pickup: 0, deliver: 0, note: '' })
            }
          })
        } else {
          cfg.priceTable = cfg.priceTable.filter(p => p.container !== ct.name)
          cfg.priceTable.push({ container: ct.name, water: '', pickup: 0, deliver: 0, note: '' })
        }

        await persistConfig()
        showToast(`Updated "${ct.name}" mode to ${ct.requiresWaterType ? 'Water Variants' : 'Flat Rate'}.`, 'info')
        render()
      })
    })

    container.querySelectorAll<HTMLButtonElement>('.btn-del-ct').forEach(btn => {
      btn.addEventListener('click', async () => {
        const i = parseInt(btn.dataset.index!, 10)
        const name = cfg.containerTypes[i].name
        const priceCount = cfg.priceTable.filter(p => p.container === name).length

        const choice = await showModal({
          icon: Icons.trash,
          iconColor: 'danger',
          title: 'Delete Container Type',
          body: `Remove <strong>${name}</strong>? This will remove it from the database and delete ${priceCount} associated price row${priceCount !== 1 ? 's' : ''}.`,
          buttons: [
            { id: 'delete', label: 'Delete', className: 'btn-danger' },
            { id: 'cancel', label: 'Cancel', className: 'btn-ghost' },
          ],
        })
        if (choice !== 'delete') return

        cfg.containerTypes.splice(i, 1)
        cfg.priceTable = cfg.priceTable.filter(p => p.container !== name)
        await persistConfig()
        showToast(`Container "${name}" removed from settings and database.`, 'info')
        render()
      })
    })

    q('#btn-add-ct')?.addEventListener('click', async () => {
      const nameInput = q<HTMLInputElement>('#new-ct-name')
      const reqInput = q<HTMLInputElement>('#new-ct-req')
      const name = nameInput?.value.trim().toUpperCase() || ''
      const requiresWater = reqInput?.checked ?? true

      if (!name) {
        showToast('Please enter a container name.', 'error')
        return
      }
      if (cfg.containerTypes.find(ct => ct.name === name)) {
        showToast('Container type already exists.', 'error')
        return
      }

      cfg.containerTypes.push({ name, requiresWaterType: requiresWater })
      if (requiresWater) {
        cfg.waterTypes.forEach(wt => {
          cfg.priceTable.push({ container: name, water: wt, pickup: 0, deliver: 0, note: '' })
        })
      } else {
        cfg.priceTable.push({ container: name, water: '', pickup: 0, deliver: 0, note: '' })
      }
      await persistConfig()
      showToast(`✓ Container "${name}" saved to database successfully!`, 'success')
      render()
    })

    container.querySelectorAll<HTMLButtonElement>('.btn-del-wt').forEach(btn => {
      btn.addEventListener('click', async () => {
        const i = parseInt(btn.dataset.index!, 10)
        const wt = cfg.waterTypes[i]
        const priceCount = cfg.priceTable.filter(p => p.water === wt).length

        const choice = await showModal({
          icon: Icons.trash,
          iconColor: 'danger',
          title: 'Delete Water Type',
          body: `Remove <strong>${wt}</strong>? This will remove it from the database and remove ${priceCount} price row${priceCount !== 1 ? 's' : ''} associated with it.`,
          buttons: [
            { id: 'delete', label: 'Delete', className: 'btn-danger' },
            { id: 'cancel', label: 'Cancel', className: 'btn-ghost' },
          ],
        })
        if (choice !== 'delete') return

        cfg.waterTypes.splice(i, 1)
        cfg.priceTable = cfg.priceTable.filter(p => p.water !== wt)
        await persistConfig()
        showToast(`Water type "${wt}" removed from settings and database.`, 'info')
        render()
      })
    })

    q('#btn-add-water')?.addEventListener('click', async () => {
      const nameInput = q<HTMLInputElement>('#new-water-name')
      const name = nameInput?.value.trim().toUpperCase() || ''

      if (!name) {
        showToast('Please enter a water type name.', 'error')
        return
      }
      if (cfg.waterTypes.includes(name)) {
        showToast('Water type already exists.', 'error')
        return
      }

      cfg.waterTypes.push(name)
      cfg.containerTypes.filter(ct => ct.requiresWaterType).forEach(ct => {
        cfg.priceTable.push({ container: ct.name, water: name, pickup: 0, deliver: 0, note: '' })
      })
      await persistConfig()
      showToast(`✓ Water type "${name}" added and synced to database!`, 'success')
      render()
    })

    // ── Backup Events ─────────────────────────────────────────────────────────
    q('#btn-choose-backup-folder')?.addEventListener('click', async () => {
      const result = await window.api.chooseBackupFolder()
      if (!result.ok) return
      cfg.backupFolder = result.data
      await persistConfig()
      showToast('Backup folder set — auto-backup active!', 'success')
      render()
    })

    q('#btn-clear-backup-folder')?.addEventListener('click', async () => {
      const confirmed = await showModal({
        icon: Icons.shieldCheck,
        iconColor: 'warning',
        title: 'Disable Auto-Backup?',
        body: 'This will remove the backup folder and pause automatic daily backups. Existing files will remain safe.',
        buttons: [
          { id: 'confirm', label: 'Disable', className: 'btn-danger' },
          { id: 'cancel', label: 'Cancel', className: 'btn-ghost' }
        ]
      })
      if (confirmed !== 'confirm') return
      await window.api.clearBackupFolder()
      cfg.backupFolder = ''
      await persistConfig()
      showToast('Auto-backup paused.', 'info')
      render()
    })

    q('#btn-save-backup-time')?.addEventListener('click', async () => {
      const inp = q<HTMLInputElement>('#inp-backup-time')
      const time = inp?.value || '19:00'
      cfg.backupTime = time
      await persistConfig()
      showToast(`Daily backup scheduled for ${time}`, 'success')
    })

    q('#btn-run-backup-now')?.addEventListener('click', async () => {
      const btn = q<HTMLButtonElement>('#btn-run-backup-now')
      if (!btn) return
      const origText = btn.innerHTML
      btn.innerHTML = `${Icons.refreshCw} Running Backup…`
      btn.disabled = true
      try {
        const res = await window.api.createBackup()
        if (res.ok) {
          showToast(`Backup created successfully! (${res.data.filesCopied} files copied)`, 'success')
        } else {
          showToast('Backup failed: ' + res.error, 'error')
        }
      } finally {
        btn.innerHTML = origText
        btn.disabled = false
      }
    })

    q('#btn-drive-connect')?.addEventListener('click', async () => {
      const btn = q<HTMLButtonElement>('#btn-drive-connect')
      if (btn) btn.textContent = 'Connecting…'
      const res = await window.api.driveAuth()
      if (res.ok) {
        driveConnected = res.data.connected
        driveEmail = res.data.email
        showToast('Connected to Google Drive!', 'success')
      } else {
        showToast('Google Drive connection failed: ' + res.error, 'error')
      }
      render()
    })

    q('#btn-drive-disconnect')?.addEventListener('click', async () => {
      const res = await window.api.driveDisconnect()
      if (res.ok) {
        driveConnected = false
        driveEmail = null
        showToast('Disconnected from Google Drive.', 'info')
      }
      render()
    })

    // ── Supabase Cloud Database Events ─────────────────────────────────────────
    q('#btn-test-supabase')?.addEventListener('click', async () => {
      const url = q<HTMLInputElement>('#inp-sb-url')?.value.trim() || ''
      const anonKey = q<HTMLInputElement>('#inp-sb-anon-key')?.value.trim() || ''
      const email = q<HTMLInputElement>('#inp-app-email')?.value.trim() || ''
      const password = q<HTMLInputElement>('#inp-app-pass')?.value || ''
      const statusEl = q<HTMLElement>('#st-supabase-test-status')
      const btn = q<HTMLButtonElement>('#btn-test-supabase')

      if (!url || !anonKey || !email || !password) {
        if (statusEl) {
          statusEl.style.color = 'var(--clr-error)'
          statusEl.textContent = 'Enter URL, Anon Key, Email, and Password first.'
        }
        return
      }

      if (btn) btn.disabled = true
      if (statusEl) {
        statusEl.style.color = 'var(--clr-text-muted)'
        statusEl.textContent = 'Testing authentication…'
      }

      try {
        const res = await window.api.testSupabaseAuth({ url, anonKey, email, password })
        if (statusEl) {
          if (res.ok) {
            statusEl.style.color = 'var(--clr-success)'
            statusEl.textContent = '✓ Connected and authenticated successfully!'
          } else {
            statusEl.style.color = 'var(--clr-error)'
            statusEl.textContent = `✗ Auth failed: ${res.error}`
          }
        }
      } catch (err: any) {
        if (statusEl) {
          statusEl.style.color = 'var(--clr-error)'
          statusEl.textContent = `✗ Error: ${err?.message || String(err)}`
        }
      } finally {
        if (btn) btn.disabled = false
      }
    })

    q('#btn-save-supabase')?.addEventListener('click', async () => {
      const url = q<HTMLInputElement>('#inp-sb-url')?.value.trim() || ''
      const anonKey = q<HTMLInputElement>('#inp-sb-anon-key')?.value.trim() || ''
      const email = q<HTMLInputElement>('#inp-app-email')?.value.trim() || ''
      const password = q<HTMLInputElement>('#inp-app-pass')?.value || ''

      cfg.supabaseUrl = url
      cfg.supabaseAnonKey = anonKey
      cfg.appAccountEmail = email
      cfg.appAccountPassword = password

      await persistConfig()
      showToast('Supabase credentials saved and active.', 'success')
    })

    // ── Application Updates Events ─────────────────────────────────────────────
    q('#btn-check-updates')?.addEventListener('click', async () => {
      const btn = q<HTMLButtonElement>('#btn-check-updates')
      if (btn) btn.disabled = true
      updateState.status = 'checking'
      refreshTabContent()

      try {
        const res = await window.api.checkForUpdates()
        if (res.ok) {
          if (res.data?.updateAvailable) {
            showToast(`New update v${res.data.version || ''} found! Starting download...`, 'info')
          } else {
            showToast(res.data?.message || 'You are running the latest version.', 'success')
          }
        } else {
          showToast(`Update notice: ${res.error}`, 'info')
        }
      } catch (err: any) {
        showToast(`Update check failed: ${err?.message || err}`, 'error')
      }
    })

    q('#btn-install-update')?.addEventListener('click', async () => {
      const btn = q<HTMLButtonElement>('#btn-install-update')
      if (btn) btn.disabled = true
      showToast('Restarting application to apply update...', 'info')
      await window.api.installUpdate()
    })
  }

  function refreshTabContent(): void {
    const screenEl = container.querySelector<HTMLElement>('.st-screen')
    const currentScroll = screenEl ? screenEl.scrollTop : savedScrollPosition

    const tabContent = container.querySelector('#st-tab-content')
    if (tabContent) {
      tabContent.innerHTML = renderActiveTabContent()
      bindEvents()
      if (screenEl && currentScroll > 0) {
        screenEl.scrollTop = currentScroll
      }
    }
  }

  async function persistConfig(): Promise<void> {
    const result = await window.api.updateSettings(cfg)
    if (result.ok) {
      cfg = JSON.parse(JSON.stringify(result.data))
      onConfigChange(result.data)
      showToast('Settings saved successfully.', 'success', 1800)
    } else {
      showToast(`Failed to save: ${result.error}`, 'error')
    }
  }
}
