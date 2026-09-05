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
  let activeTab: 'storage' | 'pricing' | 'containers' | 'backup' | 'about' = 'storage'
  let priceSearchFilter = ''
  let exportMonth = new Date().toISOString().substring(0, 7)

  // Initial fetch of Google Drive status
  window.api.driveStatus().then(res => {
    if (res.ok) {
      driveConnected = res.data.connected
      driveEmail = res.data.email
    }
    isFetchingDrive = false
    render()
  })

  render()

  function render(): void {
    const q = <T extends Element>(sel: string) => container.querySelector<T>(sel)!

    container.innerHTML = `
      <style>
        .st-screen {
          flex: 1;
          overflow-y: auto;
          padding: 32px 40px;
          display: flex;
          flex-direction: column;
          gap: 24px;
          max-width: 1100px;
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
          padding: 10px 16px;
          text-align: left;
          font-weight: 700;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: .05em;
          color: var(--clr-text-muted);
          border-bottom: 1px solid var(--clr-border);
        }
        .st-grid-table td {
          padding: 10px 16px;
          border-bottom: 1px solid var(--clr-border);
          vertical-align: middle;
        }
        .st-grid-table tr:hover td {
          background: rgba(255,255,255,0.02);
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
        .st-export-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
          gap: 16px;
        }
        .st-export-item {
          background: var(--clr-surface-2);
          border: 1px solid var(--clr-border);
          border-radius: 12px;
          padding: 18px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 14px;
          transition: all 0.2s ease;
        }
        .st-export-item:hover {
          border-color: var(--clr-primary);
          box-shadow: 0 4px 14px rgba(0,0,0,0.06);
          transform: translateY(-1px);
        }
        .st-export-item-header {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }
        .st-export-icon {
          width: 40px;
          height: 40px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .st-export-title {
          font-size: 14px;
          font-weight: 700;
          color: var(--clr-text);
          line-height: 1.3;
        }
        .st-export-desc {
          font-size: 12px;
          color: var(--clr-text-muted);
          line-height: 1.45;
          margin-top: 3px;
        }
        .st-export-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding-top: 12px;
          border-top: 1px solid var(--clr-border);
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

    bindEvents()
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
                      <div style="font-weight:700;font-size:13px;">Stock Inventory Report</div>
                      <div style="font-size:11px;color:var(--clr-text-muted);">Item catalog, movements, buyer dispatch &amp; restock orders</div>
                    </div>
                  </div>
                  <button class="btn btn-secondary btn-sm do-export" data-action="stock" style="flex-shrink:0;display:flex;align-items:center;gap:6px;">${Icons.download} Export</button>
                </div>

              </div>
            </div>



            <!-- FOLDER LOCATIONS -->
            <div class="st-card">
              <div class="st-card-header">
                <h3>${Icons.folder} Folder Locations</h3>
                <button id="btn-open-folder" class="btn btn-ghost btn-sm" style="display:flex;align-items:center;gap:6px;">${Icons.folderOpen} Open in Explorer</button>
              </div>
              <div class="st-card-body" style="gap:0;padding:0;">

                <div class="st-export-row">
                  <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                    <div style="width:32px;height:32px;border-radius:8px;background:rgba(14,165,233,0.1);color:#0ea5e9;display:flex;align-items:center;justify-content:center;flex-shrink:0;">${Icons.droplets}</div>
                    <div style="min-width:0;">
                      <div style="font-weight:700;font-size:12px;color:var(--clr-text-muted);text-transform:uppercase;letter-spacing:.04em;">Daily Water Logs</div>
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
        const filteredPrices = priceSearchFilter
          ? cfg.priceTable.filter(p =>
              p.container.toLowerCase().includes(priceSearchFilter.toLowerCase()) ||
              (p.water && p.water.toLowerCase().includes(priceSearchFilter.toLowerCase())) ||
              (p.note && p.note.toLowerCase().includes(priceSearchFilter.toLowerCase()))
            )
          : cfg.priceTable

        return `
          <div class="st-card">
            <div class="st-card-header">
              <div style="display:flex;align-items:center;gap:16px;">
                <h3>${Icons.tag} Water Refill Price Matrix</h3>
                <span style="font-size:12px;color:var(--clr-text-muted);font-weight:600;">(${cfg.priceTable.length} price combinations)</span>
              </div>
              <div style="display:flex;align-items:center;gap:12px;">
                <input type="text" id="st-price-search" placeholder="Filter prices…" value="${priceSearchFilter}"
                  style="padding:6px 12px;border-radius:8px;border:1px solid var(--clr-border);background:var(--clr-surface-2);color:var(--clr-text);font-size:13px;width:180px;" />
                <button id="btn-save-prices" class="btn btn-primary btn-sm" style="display:flex;align-items:center;gap:6px;">
                  ${Icons.check} Save Prices
                </button>
              </div>
            </div>
            <div style="overflow-x:auto;">
              <table class="st-grid-table" id="price-table">
                <thead>
                  <tr>
                    <th style="width:40px;">#</th>
                    <th style="min-width:180px;">Container Type</th>
                    <th style="min-width:140px;">Water Type</th>
                    <th style="width:140px;">Pick Up Price</th>
                    <th style="width:140px;">Delivery Price</th>
                    <th>Notes / Rules</th>
                  </tr>
                </thead>
                <tbody>
                  ${filteredPrices.map((row, i) => {
                    const originalIndex = cfg.priceTable.indexOf(row)
                    return `
                      <tr data-price-index="${originalIndex}">
                        <td style="color:var(--clr-text-muted);font-size:12px;">${i + 1}</td>
                        <td style="font-weight:700;color:var(--clr-text);">
                          ${row.container}
                        </td>
                        <td>
                          ${row.water ? `<span class="st-tag-pill" style="color:var(--clr-primary);background:var(--clr-primary-glow);border-color:rgba(14,165,233,0.3);">${row.water}</span>` : '<span style="color:var(--clr-text-muted);opacity:0.5;">—</span>'}
                        </td>
                        <td>
                          <div style="position:relative;display:flex;align-items:center;">
                            <span style="position:absolute;left:10px;font-size:12px;font-weight:700;color:var(--clr-text-muted);">₱</span>
                            <input type="number" step="any" class="price-pickup" data-index="${originalIndex}" value="${row.pickup}"
                              style="width:100%;padding:7px 10px 7px 24px;border-radius:8px;border:1px solid var(--clr-border);background:var(--clr-input-bg);color:var(--clr-text);font-size:13px;font-weight:700;font-family:monospace;" />
                          </div>
                        </td>
                        <td>
                          <div style="position:relative;display:flex;align-items:center;">
                            <span style="position:absolute;left:10px;font-size:12px;font-weight:700;color:var(--clr-text-muted);">₱</span>
                            <input type="number" step="any" class="price-deliver" data-index="${originalIndex}" value="${row.deliver}"
                              style="width:100%;padding:7px 10px 7px 24px;border-radius:8px;border:1px solid var(--clr-border);background:var(--clr-input-bg);color:var(--clr-text);font-size:13px;font-weight:700;font-family:monospace;" />
                          </div>
                        </td>
                        <td>
                          <input type="text" class="note-input" data-index="${originalIndex}" value="${row.note || ''}" placeholder="Optional rule or description…"
                            style="width:100%;padding:7px 10px;border-radius:8px;border:1px solid var(--clr-border);background:var(--clr-input-bg);color:var(--clr-text);font-size:13px;" />
                        </td>
                      </tr>
                    `
                  }).join('')}
                </tbody>
              </table>
            </div>
          </div>
        `
      }

      case 'containers':
        return `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start;">
            <!-- Container Types Card -->
            <div class="st-card">
              <div class="st-card-header">
                <h3>${Icons.package} Container Types</h3>
                <span style="font-size:12px;color:var(--clr-text-muted);font-weight:600;">${cfg.containerTypes.length} types</span>
              </div>
              <div class="st-card-body">
                <div style="display:flex;flex-direction:column;gap:8px;" id="container-types-list">
                  ${cfg.containerTypes.map((ct, i) => `
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-radius:10px;background:var(--clr-surface-2);border:1px solid var(--clr-border);">
                      <div>
                        <div style="font-weight:700;font-size:13px;color:var(--clr-text);">${ct.name}</div>
                        <div style="font-size:11px;color:var(--clr-text-muted);margin-top:2px;">
                          ${ct.requiresWaterType ? 'Requires water type selection' : 'Standard flat container'}
                        </div>
                      </div>
                      <div style="display:flex;align-items:center;gap:12px;">
                        <label class="toggle" title="Toggle Water Type Requirement">
                          <input type="checkbox" class="ct-requires-water" data-index="${i}" ${ct.requiresWaterType ? 'checked' : ''} />
                          <span class="slider"></span>
                        </label>
                        <button class="btn btn-ghost btn-icon btn-del-ct" data-index="${i}" title="Delete Container Type" style="color:var(--clr-error);">
                          ${Icons.trash}
                        </button>
                      </div>
                    </div>
                  `).join('')}
                </div>

                <!-- Add container row -->
                <div style="margin-top:12px;padding-top:16px;border-top:1px solid var(--clr-border);display:flex;flex-direction:column;gap:10px;">
                  <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--clr-text-muted);">Add New Container</span>
                  <div style="display:flex;gap:10px;">
                    <input type="text" id="new-ct-name" placeholder="e.g. 5 GAL SLIM"
                      style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid var(--clr-border);background:var(--clr-input-bg);color:var(--clr-text);font-size:13px;" />
                    <button id="btn-add-ct" class="btn btn-primary btn-sm" style="display:flex;align-items:center;gap:6px;">
                      ${Icons.plus} Add
                    </button>
                  </div>
                  <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--clr-text-muted);cursor:pointer;">
                    <input type="checkbox" id="new-ct-req" checked style="cursor:pointer;" />
                    Requires water type selection (Purified / Alkaline / Mineral)
                  </label>
                </div>
              </div>
            </div>

            <!-- Water Types Card -->
            <div class="st-card">
              <div class="st-card-header">
                <h3>${Icons.droplets} Water Types</h3>
                <span style="font-size:12px;color:var(--clr-text-muted);font-weight:600;">${cfg.waterTypes.length} types</span>
              </div>
              <div class="st-card-body">
                <div style="display:flex;flex-direction:column;gap:8px;" id="water-types-list">
                  ${cfg.waterTypes.map((wt, i) => `
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-radius:10px;background:var(--clr-surface-2);border:1px solid var(--clr-border);">
                      <div style="display:flex;align-items:center;gap:10px;">
                        <span style="color:var(--clr-primary);display:inline-flex;">${Icons.droplets}</span>
                        <span style="font-weight:700;font-size:13px;color:var(--clr-text);">${wt}</span>
                      </div>
                      <button class="btn btn-ghost btn-icon btn-del-wt" data-index="${i}" title="Delete Water Type" style="color:var(--clr-error);">
                        ${Icons.trash}
                      </button>
                    </div>
                  `).join('')}
                </div>

                <!-- Add water row -->
                <div style="margin-top:12px;padding-top:16px;border-top:1px solid var(--clr-border);display:flex;flex-direction:column;gap:10px;">
                  <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--clr-text-muted);">Add Water Type</span>
                  <div style="display:flex;gap:10px;">
                    <input type="text" id="new-water-name" placeholder="e.g. DISTILLED"
                      style="flex:1;padding:8px 12px;border-radius:8px;border:1px solid var(--clr-border);background:var(--clr-input-bg);color:var(--clr-text);font-size:13px;" />
                    <button id="btn-add-water" class="btn btn-primary btn-sm" style="display:flex;align-items:center;gap:6px;">
                      ${Icons.plus} Add
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `

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

      case 'about':
        return `
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
                  <div style="font-size:13px;color:var(--clr-text-muted);margin-top:2px;">Version 1.0.3 (Production Build)</div>
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
        `
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
    container.querySelectorAll<HTMLButtonElement>('.st-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        if (activeTab === 'pricing') syncPricesFromDOM()
        activeTab = btn.dataset.tab as any
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

    // Helper to get active export month
    const getActiveMonth = (): string => {
      const inp = q<HTMLInputElement>('#st-export-month')
      return (inp && inp.value) ? inp.value : (exportMonth || new Date().toISOString().substring(0, 7))
    }



    // Helper for file export actions
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
        const tabContent = q('#st-tab-content')
        if (tabContent) {
          tabContent.innerHTML = renderActiveTabContent()
          bindEvents()
          const restoredSearch = q<HTMLInputElement>('#st-price-search')
          if (restoredSearch) {
            restoredSearch.focus()
            restoredSearch.setSelectionRange(priceSearchFilter.length, priceSearchFilter.length)
          }
        }
      })
    }

    q('#btn-save-prices')?.addEventListener('click', async () => {
      syncPricesFromDOM()
      await persistConfig()
    })

    // ── Container & Water Events ──────────────────────────────────────────────
    container.querySelectorAll<HTMLInputElement>('.ct-requires-water').forEach(chk => {
      chk.addEventListener('change', async () => {
        const i = parseInt(chk.dataset.index!, 10)
        cfg.containerTypes[i].requiresWaterType = chk.checked
        await persistConfig()
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
          body: `Remove <strong>${name}</strong>? This will also remove ${priceCount} price row${priceCount !== 1 ? 's' : ''} associated with it.`,
          buttons: [
            { id: 'delete', label: 'Delete', className: 'btn-danger' },
            { id: 'cancel', label: 'Cancel', className: 'btn-ghost' },
          ],
        })
        if (choice !== 'delete') return

        cfg.containerTypes.splice(i, 1)
        cfg.priceTable = cfg.priceTable.filter(p => p.container !== name)
        await persistConfig()
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
          body: `Remove <strong>${wt}</strong>? This will also remove ${priceCount} price row${priceCount !== 1 ? 's' : ''} associated with it.`,
          buttons: [
            { id: 'delete', label: 'Delete', className: 'btn-danger' },
            { id: 'cancel', label: 'Cancel', className: 'btn-ghost' },
          ],
        })
        if (choice !== 'delete') return

        cfg.waterTypes.splice(i, 1)
        cfg.priceTable = cfg.priceTable.filter(p => p.water !== wt)
        await persistConfig()
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
      showToast('Supabase credentials saved.', 'success')
    })
  }

  async function persistConfig(): Promise<void> {
    const result = await window.api.updateSettings(cfg)
    if (result.ok) {
      onConfigChange(result.data)
      showToast('Settings saved successfully.', 'success', 1800)
    } else {
      showToast(`Failed to save: ${result.error}`, 'error')
    }
  }
}
