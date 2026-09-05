import type { AppConfig, StockDB, StockItem, StockItemRow, StockMovement, StockBuyer, RestockOrder } from '../../shared/types'
import { showToast, showModal } from '../components/ui'
import { Icons } from '../components/icons'
import flatpickr from 'flatpickr'
import 'flatpickr/dist/flatpickr.min.css'

function fmt(n: number) {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
function todayStr() { return new Date().toISOString().substring(0, 10) }

type Tab = 'products' | 'movements' | 'summary' | 'buyers' | 'orders'

let unbindSync: (() => void) | null = null

export async function renderStockInventoryScreen(container: HTMLElement, config: AppConfig): Promise<void> {
  let db: StockDB & { itemRows: StockItemRow[] } = {
    categories: [], buyers: [], items: [], movements: [], restockOrders: [], itemRows: []
  }
  let activeTab: Tab = 'products'
  let filterCategory = ''
  let filterSearch   = ''
  let filterMovementSource = ''
  let filterMovementDir = ''
  let showArchived   = false
  let filterSummarySearch = ''

  container.innerHTML = `
    <style>
      .inv-tab-bar{display:flex;gap:4px;padding:8px 24px;background:var(--clr-surface);border-bottom:1px solid var(--clr-border);flex-wrap:wrap;}
      .inv-tab{padding:9px 16px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;background:transparent;color:var(--clr-text-muted);font-family:var(--font);transition:all .2s;display:flex;align-items:center;gap:6px;}
      .inv-tab.active{background:var(--clr-primary-glow);color:var(--clr-primary);}
      .inv-tab:hover:not(.active){background:var(--clr-surface-2);color:var(--clr-text);}
      .inv-content{padding:24px;overflow-y:auto;flex:1;}
      .inv-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:18px;flex-wrap:wrap;}
      .inv-search{padding:8px 12px;border:1px solid var(--clr-border);border-radius:10px;background:var(--clr-surface);color:var(--clr-text);font-size:13px;font-family:var(--font);width:220px;}
      .inv-select{padding:8px 12px;border:1px solid var(--clr-border);border-radius:10px;background:var(--clr-surface);color:var(--clr-text);font-size:13px;font-family:var(--font);}
      .inv-table{width:100%;border-collapse:collapse;}
      .inv-table th{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--clr-text-muted);padding:10px 14px;border-bottom:2px solid var(--clr-border);text-align:left;}
      .inv-table td{padding:11px 14px;border-bottom:1px solid var(--clr-border);font-size:13px;color:var(--clr-text);}
      .inv-table tr:hover td{background:var(--clr-surface-2);}
      .inv-table .tr-archived td{opacity:.45;}
      .inv-card{background:var(--clr-surface);border:1px solid var(--clr-border);border-radius:16px;overflow:hidden;}
      .sm-card{background:var(--clr-surface);border:1px solid var(--clr-border);border-radius:16px;overflow:hidden;box-shadow:var(--shadow-sm);display:flex;flex-direction:column;}
      .sm-scroll-wrap{overflow:auto;max-height:calc(100vh - 240px);position:relative;}
      .sm-table{min-width:100%;width:max-content;border-collapse:separate;border-spacing:0;font-size:12px;}
      .sm-table th,.sm-table td{box-sizing:border-box;}
      .sm-col-item{width:310px!important;min-width:310px!important;max-width:310px!important;position:sticky;left:0;background:var(--clr-surface)!important;z-index:15;border-right:2px solid var(--clr-border);border-bottom:1px solid var(--clr-border-light,rgba(148,163,184,0.1));box-shadow:4px 0 8px -2px rgba(0,0,0,0.12);padding:10px 16px;}
      .sm-th-item{width:310px!important;min-width:310px!important;max-width:310px!important;position:sticky;top:0;left:0;z-index:30;background:var(--clr-surface-2)!important;border-right:2px solid var(--clr-border);border-bottom:2px solid var(--clr-border);box-shadow:4px 0 8px -2px rgba(0,0,0,0.12);padding:10px 16px;font-size:11px;font-weight:700;color:var(--clr-text-muted);text-transform:uppercase;letter-spacing:.06em;}
      .sm-th{position:sticky;top:0;z-index:10;background:var(--clr-surface-2)!important;border-bottom:2px solid var(--clr-border);border-right:1px solid var(--clr-border-light,rgba(148,163,184,0.1));padding:8px 12px;font-size:11px;font-weight:700;color:var(--clr-text-muted);width:100px!important;min-width:100px!important;max-width:100px!important;text-align:right;}
      .sm-col-total{width:110px!important;min-width:110px!important;max-width:110px!important;border-left:2px solid var(--clr-border);border-bottom:1px solid var(--clr-border-light,rgba(148,163,184,0.1));text-align:right;padding:10px 14px;background:rgba(239,68,68,0.04);}
      .sm-th-total{position:sticky;top:0;z-index:10;background:var(--clr-surface-2)!important;border-left:2px solid var(--clr-border);border-bottom:2px solid var(--clr-border);text-align:right;padding:8px 14px;width:110px!important;min-width:110px!important;max-width:110px!important;}
      .sm-cell{width:100px!important;min-width:100px!important;max-width:100px!important;padding:10px 12px;border-bottom:1px solid var(--clr-border-light,rgba(148,163,184,0.1));border-right:1px solid var(--clr-border-light,rgba(148,163,184,0.06));text-align:right;font-family:monospace;font-size:12px;background:var(--clr-surface);}
      .sm-table tr:hover td{background:var(--clr-surface-2);}
      .sm-table tr:hover .sm-col-item{background:var(--clr-surface-2)!important;}
      .sm-footer-cell{position:sticky;bottom:0;z-index:10;background:var(--clr-surface-2)!important;border-top:2px solid var(--clr-border);border-right:1px solid var(--clr-border-light,rgba(148,163,184,0.1));padding:10px 12px;font-family:monospace;font-weight:800;text-align:right;width:100px!important;min-width:100px!important;max-width:100px!important;}
      .sm-footer-item{width:310px!important;min-width:310px!important;max-width:310px!important;position:sticky;bottom:0;left:0;z-index:30;background:var(--clr-surface-2)!important;border-top:2px solid var(--clr-border);border-right:2px solid var(--clr-border);box-shadow:4px 0 8px -2px rgba(0,0,0,0.12);font-weight:800;font-size:11px;text-transform:uppercase;letter-spacing:.06em;padding:10px 16px;color:var(--clr-text);}
      .sm-footer-grand{position:sticky;bottom:0;z-index:10;background:var(--clr-surface-2)!important;border-top:2px solid var(--clr-border);border-left:2px solid var(--clr-border);font-weight:900;font-size:13px;color:#ef4444;padding:10px 14px;text-align:right;width:110px!important;min-width:110px!important;max-width:110px!important;}
      .st-tag-pill{display:inline-flex;align-items:center;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;background:var(--clr-surface-2);border:1px solid var(--clr-border);color:var(--clr-text);}
      .st-in{background:rgba(16,185,129,.12);color:#10b981;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;}
      .st-low{background:rgba(245,158,11,.12);color:#f59e0b;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;}
      .st-out{background:rgba(239,68,68,.12);color:#ef4444;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;}
      .dir-in{background:rgba(16,185,129,.12);color:#10b981;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;}
      .dir-out{background:rgba(239,68,68,.12);color:#ef4444;padding:3px 8px;border-radius:6px;font-size:11px;font-weight:700;}
      .src-badge{font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:.04em;}
      .src-sales{background:rgba(59,130,246,.15);color:#3b82f6;}
      .src-wholesale{background:rgba(168,85,247,.15);color:#a855f7;}
      .src-restock{background:rgba(16,185,129,.15);color:#10b981;}
      .src-hist{background:rgba(107,114,128,.15);color:#9ca3af;}
      .batch-sold{background:rgba(245,158,11,.18);color:#d97706;padding:2px 7px;border-radius:5px;font-size:10px;font-weight:800;letter-spacing:.05em;}
      .batch-new{background:rgba(6,182,212,.18);color:#0891b2;padding:2px 7px;border-radius:5px;font-size:10px;font-weight:800;letter-spacing:.05em;}
      .cat-div td{background:var(--clr-primary-glow);color:var(--clr-primary);font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;padding:8px 14px;}
      .form-ov{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:200;display:flex;align-items:center;justify-content:center;}
      .form-card{background:var(--clr-surface);border-radius:20px;padding:32px;width:540px;max-width:95vw;max-height:90vh;overflow-y:auto;box-shadow:0 25px 60px rgba(0,0,0,.3);border:1px solid var(--clr-border);}
      .form-card h3{margin:0 0 20px;font-size:18px;font-weight:700;display:flex;align-items:center;gap:8px;}
      .ff{margin-bottom:14px;}
      .ff label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--clr-text-muted);display:block;margin-bottom:5px;}
      .ff input,.ff select{width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--clr-border);border-radius:10px;background:var(--clr-surface-2);color:var(--clr-text);font-size:13px;font-family:var(--font);}
      .ff input:focus,.ff select:focus{outline:none;border-color:var(--clr-primary);}
      .fr{display:flex;gap:12px;}.fr>.ff{flex:1;}
      .fa{display:flex;gap:10px;justify-content:flex-end;margin-top:20px;}
      .legacy-banner{margin-bottom:18px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);border-radius:12px;padding:16px 20px;display:flex;align-items:center;gap:16px;}
    </style>
    <div style="display:flex;flex-direction:column;height:100%;">
      <div class="inv-tab-bar">
        <button class="inv-tab active" id="itab-products">Products</button>
        <button class="inv-tab" id="itab-movements">Stock Movements</button>
        <button class="inv-tab" id="itab-summary">Buyer Summary</button>
        <button class="inv-tab" id="itab-buyers">Buyers</button>
        <button class="inv-tab" id="itab-orders">Restock Orders</button>
        <div style="margin-left:auto;display:flex;align-items:center;gap:6px;">
          <div id="inv-sync-badge" style="display:none;align-items:center;gap:6px;padding:4px 10px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.25);border-radius:8px;font-size:11px;font-weight:600;color:#10b981;max-width:320px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">
            <span style="width:6px;height:6px;border-radius:50%;background:#10b981;flex-shrink:0;display:inline-block;"></span>
            <span id="inv-sync-label">Synced</span>
            <button class="btn btn-ghost btn-sm" id="btn-open-stock-file" title="Reveal in File Explorer" style="padding:2px 6px;font-size:11px;height:auto;line-height:1;margin-left:4px;color:#10b981;">${Icons.folderOpen || '📂'}</button>
          </div>
          <button class="btn btn-primary btn-sm" id="inv-export-xlsx" data-tooltip="Export Stock Report to Excel (.xlsx)" style="font-size:12px;gap:6px;display:flex;align-items:center;">${Icons.fileSheet || '📊'} Export XLSX</button>
          <button class="btn btn-ghost btn-icon" id="inv-refresh" data-tooltip="Refresh">${Icons.refreshCw}</button>
        </div>
      </div>
      <div class="inv-content" id="inv-content">
        <div style="display:flex;justify-content:center;padding:60px"><div class="spinner"></div></div>
      </div>
    </div>
    <div id="inv-form-area"></div>
  `

  let isExporting = false

  async function loadDb() {
    const res = await window.api.stockDbGet()
    if (res.ok) {
      db = res.data as any
      // Update sync status badge
      const badge = document.getElementById('inv-sync-badge')
      const label = document.getElementById('inv-sync-label')
      if (badge && label) {
        const xlsxPath: string | undefined = (db as any).sourceXlsxPath
        if (xlsxPath) {
          const fileName = xlsxPath.split(/[\\/]/).pop() || xlsxPath
          label.textContent = `Synced: ${fileName}`
          badge.title = xlsxPath
          badge.style.display = 'flex'
        } else {
          badge.style.display = 'none'
        }
      }
    } else {
      showToast('Failed to load stock DB: ' + res.error, 'error')
    }
  }

  function switchTab(tab: Tab) {
    activeTab = tab
    filterSearch = ''
    filterSummarySearch = ''
    document.querySelectorAll('.inv-tab').forEach(b => b.classList.remove('active'))
    document.getElementById('itab-' + tab)?.classList.add('active')
    render()
  }

  async function doExport() {
    if (isExporting) return
    isExporting = true
    const btn = document.getElementById('inv-export-xlsx') as HTMLButtonElement | null
    const originalText = btn?.innerHTML ?? ''
    if (btn) {
      btn.disabled = true
      btn.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;margin-right:6px;"></div> Exporting…`
    }
    try {
      const res = await window.api.exportStockReport()
      if (res.ok && res.data) {
        showToast('Stock Report exported to Excel successfully ✓', 'success')
      } else if (!res.ok) {
        showToast('Export failed: ' + res.error, 'error')
      }
    } catch (e) {
      showToast('Export error: ' + String(e), 'error')
    } finally {
      isExporting = false
      if (btn) {
        btn.disabled = false
        btn.innerHTML = originalText
      }
    }
  }

  async function promptLegacyMigration() {
    const choice = await showModal({
      icon: Icons.package,
      iconColor: 'warning',
      title: 'Upgrade STOCK REPORT to Relational Structure?',
      body: 'Your STOCK REPORT.xlsx is currently using the legacy single-sheet format. Would you like to upgrade it to the new 7-sheet relational structure (Item Catalog, Stock Movements, Restock Orders, Buyer Summary)?\n\nA full backup of your original file will be saved automatically.',
      buttons: [
        { id: 'cancel', label: 'Cancel', className: 'btn-outline' },
        { id: 'confirm', label: 'Upgrade & Backup', className: 'btn-primary' }
      ]
    })
    if (choice === 'confirm') {
      const res = await window.api.stockDbMigrateLegacy(true)
      if (res.ok) {
        showToast('Successfully upgraded to 7-sheet relational structure!', 'success')
        await loadDb()
        render()
      } else {
        showToast('Migration error: ' + res.error, 'error')
      }
    }
  }

  function render() {
    const el = document.getElementById('inv-content')!

    // If legacy single-sheet detected, display migration banner
    let legacyBanner = ''
    if (db.isLegacySingleSheet) {
      legacyBanner = `
        <div class="legacy-banner">
          <div style="color:#f59e0b;font-size:24px;">${Icons.info || '⚠️'}</div>
          <div style="flex:1">
            <div style="font-weight:700;font-size:14px;color:var(--clr-text);margin-bottom:2px;">Legacy Format Detected</div>
            <div style="font-size:12px;color:var(--clr-text-muted);">This workbook is using the old single-sheet layout. Upgrade to unlock the 7-sheet relational transaction ledger.</div>
          </div>
          <button class="btn btn-primary btn-sm" id="btn-migrate-legacy">Upgrade Workbook</button>
        </div>`
    }

    // Show empty state banner if no items
    if (db.items.length === 0 && activeTab === 'products' && !db.isLegacySingleSheet) {
      el.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px 20px;text-align:center;gap:16px;">
          <div style="background:var(--clr-primary-glow);color:var(--clr-primary);padding:20px;border-radius:20px;display:inline-flex;margin-bottom:8px;">${Icons.package}</div>
          <h3 style="margin:0;color:var(--clr-text);font-size:20px">No products in catalog</h3>
          <p style="color:var(--clr-text-muted);margin:0;max-width:440px;line-height:1.6">
            No products found in catalog. If this is a new setup, ensure your internet connection is active to sync the product catalog from the cloud.
          </p>
          <div style="display:flex;gap:12px;margin-top:8px;">
            <button class="btn btn-primary" id="btn-add-product-empty" style="gap:8px;display:flex;align-items:center;">${Icons.plus} Add Product</button>
            <button class="btn btn-secondary" id="btn-sync-cloud-empty" style="gap:8px;display:flex;align-items:center;">${Icons.refreshCw} Sync from Cloud</button>
          </div>
        </div>`

      document.getElementById('btn-add-product-empty')?.addEventListener('click', () => {
        document.getElementById('btn-add-product')?.click()
      })
      document.getElementById('btn-sync-cloud-empty')?.addEventListener('click', async () => {
        showToast('Syncing catalog from cloud...', 'info')
        await loadDb()
        render()
      })
      return
    }

    let tabHtml = ''
    if (activeTab === 'products')  tabHtml = buildProducts()
    if (activeTab === 'movements') tabHtml = buildMovements()
    if (activeTab === 'summary')   tabHtml = buildSummary()
    if (activeTab === 'buyers')    tabHtml = buildBuyers()
    if (activeTab === 'orders')    tabHtml = buildOrders()

    el.innerHTML = legacyBanner + tabHtml
    document.getElementById('btn-migrate-legacy')?.addEventListener('click', promptLegacyMigration)
    bindTabEvents()
  }

  function getFilteredProducts(): StockItemRow[] {
    let rows = db.itemRows
    if (filterCategory) rows = rows.filter(r => r.categoryId === filterCategory || r.categoryName === filterCategory)
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      rows = rows.filter(r =>
        r.name.toLowerCase().includes(q) ||
        (r.code || '').toLowerCase().includes(q) ||
        (r.id || '').toLowerCase().includes(q)
      )
    }
    if (!showArchived) rows = rows.filter(r => !r.isArchived)
    return rows
  }

  function renderProductsRows(rows: StockItemRow[]): string {
    const grouped = new Map<string, StockItemRow[]>()
    for (const row of rows) {
      const catKey = row.categoryName || row.categoryId || 'Uncategorized'
      if (!grouped.has(catKey)) grouped.set(catKey, [])
      grouped.get(catKey)!.push(row)
    }

    let html = ''
    for (const [catName, catRows] of grouped) {
      html += `<tr class="cat-div"><td colspan="12">${catName}</td></tr>`
      for (const r of catRows) {
        const sb = r.status === 'out' ? `<span class="st-out">OUT</span>`
          : r.status === 'low' ? `<span class="st-low">LOW</span>`
          : `<span class="st-in">IN STOCK</span>`

        const batchBadge = r.batchNote === 'SOLD' ? `<span class="batch-sold">SOLD</span>`
          : r.batchNote === 'NEW BATCH' ? `<span class="batch-new">NEW BATCH</span>`
          : '&mdash;'

        html += `<tr class="${r.isArchived ? 'tr-archived' : ''}">
          <td class="monospace" style="color:var(--clr-text-muted);font-size:11px;">${r.code || '&mdash;'}</td>
          <td style="font-weight:600">${r.name}</td>
          <td style="color:var(--clr-text-muted);font-size:12px;">${r.packing || '&mdash;'}</td>
          <td>${batchBadge}</td>
          <td class="text-right monospace">${fmt(r.dealerPrice)}</td>
          <td class="text-right monospace">${fmt(r.srp)}</td>
          <td class="text-right monospace" style="color:var(--clr-primary)">${fmt(r.profitPerUnit || (r.srp - r.dealerPrice))}</td>
          <td class="text-right monospace" style="color:#10b981;font-weight:600">${r.qtyOrdered}</td>
          <td class="text-right monospace" style="color:#ef4444;font-weight:600">${r.qtyStockOut}</td>
          <td class="text-right monospace" style="font-weight:700;${r.status !== 'in_stock' ? 'color:var(--clr-error)' : ''}">${r.qtyBalance}</td>
          <td>${sb}</td>
          <td><div style="display:flex;gap:4px">
            <button class="btn btn-ghost btn-icon btn-edit-item" data-id="${r.id}" data-tooltip="Edit">${Icons.pencil}</button>
            <button class="btn btn-ghost btn-icon btn-dispatch" data-id="${r.id}" data-label="${(r.itemLabel || r.name).replace(/"/g,'&quot;')}" data-tooltip="Quick Dispatch">${Icons.truck}</button>
          </div></td>
        </tr>`
      }
    }

    if (rows.length === 0) {
      html += `<tr><td colspan="12" style="text-align:center;padding:48px;color:var(--clr-text-muted)">No products found matching criteria.</td></tr>`
    }
    return html
  }

  function updateProductsView(): void {
    const rows = getFilteredProducts()
    const tbody = document.getElementById('inv-products-tbody')
    if (tbody) tbody.innerHTML = renderProductsRows(rows)
    const countEl = document.getElementById('inv-product-count')
    if (countEl) countEl.textContent = `${rows.length} product(s)`
    bindProductRowEvents()
  }

  function buildProducts(): string {
    const catOpts = db.categories.map(c =>
      `<option value="${c.id}" ${filterCategory === c.id ? 'selected' : ''}>${c.name}</option>`
    ).join('')

    const rows = getFilteredProducts()

    let html = `
      <div class="inv-toolbar">
        <button class="btn btn-primary" id="btn-add-product">${Icons.plus} Add Product</button>
        <input type="text" class="inv-search" id="inv-search" placeholder="Search item, code..." value="${filterSearch}">
        <select class="inv-select" id="inv-cat-filter"><option value="">All Categories</option>${catOpts}</select>
        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--clr-text-muted);cursor:pointer">
          <input type="checkbox" id="inv-show-archived" ${showArchived ? 'checked' : ''}> Show Archived
        </label>
        <div id="inv-product-count" style="margin-left:auto;font-size:13px;color:var(--clr-text-muted)">${rows.length} product(s)</div>
      </div>
      <div class="inv-card"><table class="inv-table">
        <thead><tr>
          <th>CODE</th><th>ITEM NAME</th><th>PACKING</th><th>BATCH</th>
          <th class="text-right">DEALER</th><th class="text-right">SRP</th><th class="text-right">PROFIT</th>
          <th class="text-right">QTY IN</th><th class="text-right">QTY OUT</th><th class="text-right">BALANCE</th>
          <th>STATUS</th><th></th>
        </tr></thead><tbody id="inv-products-tbody">${renderProductsRows(rows)}</tbody></table></div>`

    return html
  }

  function getFilteredMovements(): StockMovement[] {
    let sorted = [...db.movements].sort((a, b) => b.date.localeCompare(a.date))
    if (filterMovementDir) sorted = sorted.filter(m => m.direction === filterMovementDir)
    if (filterMovementSource) sorted = sorted.filter(m => m.source === filterMovementSource)
    if (filterSearch) {
      const q = filterSearch.toLowerCase()
      sorted = sorted.filter(m =>
        (m.itemLabel || '').toLowerCase().includes(q) ||
        (m.buyerName || '').toLowerCase().includes(q) ||
        (m.note || '').toLowerCase().includes(q) ||
        (m.id || '').toLowerCase().includes(q)
      )
    }
    return sorted
  }

  function renderMovementsRows(sorted: StockMovement[]): string {
    let html = ''
    for (const m of sorted) {
      const srcClass = (
        m.source === 'sales_entry' ? 'src-sales' :
        m.source === 'wholesale_dispatch' ? 'src-wholesale' :
        m.source === 'restock' ? 'src-restock' : 'src-hist'
      )
      const srcLabel = (
        m.source === 'sales_entry' ? 'Sales Entry' :
        m.source === 'wholesale_dispatch' ? 'Wholesale' :
        m.source === 'restock' ? 'Restock' : 'Historical'
      )

      html += `<tr>
        <td class="monospace" style="color:var(--clr-text-muted);font-size:12px;">${m.date}</td>
        <td style="font-weight:600">${m.itemLabel || m.itemId}</td>
        <td>${m.direction === 'in' ? '<span class="dir-in">IN</span>' : '<span class="dir-out">OUT</span>'}</td>
        <td class="text-right monospace" style="font-weight:700">${m.quantity}</td>
        <td>${m.buyerName || (m.note?.match(/^Retail sale to (.+)$/)?.[1] ?? '&mdash;')}</td>
        <td><span class="src-badge ${srcClass}">${srcLabel}</span></td>
        <td class="monospace" style="color:var(--clr-text-muted);font-size:11px;">${m.reference || '&mdash;'}</td>
        <td style="color:var(--clr-text-muted);font-size:12px;">${m.note || '&mdash;'}</td>
        <td><div style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-icon btn-edit-movement" data-id="${m.id}" data-tooltip="Edit">${Icons.pencil}</button>
          <button class="btn btn-ghost btn-icon btn-del-movement" data-id="${m.id}" data-tooltip="Delete" style="color:var(--clr-error)">${Icons.trash}</button>
        </div></td>
      </tr>`
    }

    if (sorted.length === 0) {
      html += `<tr><td colspan="9" style="text-align:center;padding:48px;color:var(--clr-text-muted)">No movements found.</td></tr>`
    }
    return html
  }

  function updateMovementsView(): void {
    const sorted = getFilteredMovements()
    const tbody = document.getElementById('inv-movements-tbody')
    if (tbody) tbody.innerHTML = renderMovementsRows(sorted)
    const countEl = document.getElementById('inv-mov-count')
    if (countEl) countEl.textContent = `${sorted.length} movement(s)`
    bindMovementRowEvents()
  }

  function buildMovements(): string {
    const sorted = getFilteredMovements()

    let html = `
      <div class="inv-toolbar">
        <button class="btn btn-primary" id="btn-add-movement">${Icons.plus} Log Movement</button>
        <input type="text" class="inv-search" id="inv-search-mov" placeholder="Search movements..." value="${filterSearch}">
        <select class="inv-select" id="inv-mov-dir">
          <option value="">All Directions</option>
          <option value="in" ${filterMovementDir === 'in' ? 'selected' : ''}>IN — Stock Received</option>
          <option value="out" ${filterMovementDir === 'out' ? 'selected' : ''}>OUT — Dispatched / Sold</option>
        </select>
        <select class="inv-select" id="inv-mov-src">
          <option value="">All Sources</option>
          <option value="sales_entry" ${filterMovementSource === 'sales_entry' ? 'selected' : ''}>Sales Entry (Retail)</option>
          <option value="wholesale_dispatch" ${filterMovementSource === 'wholesale_dispatch' ? 'selected' : ''}>Wholesale Dispatch</option>
          <option value="restock" ${filterMovementSource === 'restock' ? 'selected' : ''}>Restock</option>
          <option value="historical_import" ${filterMovementSource === 'historical_import' ? 'selected' : ''}>Historical Import</option>
        </select>
        <div id="inv-mov-count" style="margin-left:auto;font-size:13px;color:var(--clr-text-muted)">${sorted.length} movement(s)</div>
      </div>
      <div class="inv-card"><table class="inv-table">
        <thead><tr>
          <th>DATE</th><th>ITEM</th><th>DIR</th><th class="text-right">QTY</th>
          <th>BUYER / OUTLET</th><th>SOURCE</th><th>REF</th><th>NOTE</th><th></th>
        </tr></thead><tbody id="inv-movements-tbody">${renderMovementsRows(sorted)}</tbody></table></div>`

    return html
  }

  interface SummaryRow {
    id: string
    name: string
    code: string
    category: string
    dealerPrice: number
    srp: number
    packing: string
    batchNote: string | null
    cells: number[]
    total: number
  }

  let summaryCachedAllRows: SummaryRow[] = []
  let summaryCachedBuyers: StockBuyer[] = []
  let summaryCachedItems: StockItem[] = []

  function renderSummaryTbodyRows(rowData: SummaryRow[], buyers: StockBuyer[], maxVal: number): string {
    if (rowData.length === 0) {
      return `<tr><td colspan="${buyers.length + 2}" style="text-align:center;padding:48px;color:var(--clr-text-muted);font-size:13px;">No items match the current search.</td></tr>`
    }
    let html = ''
    for (const row of rowData) {
      html += `<tr>
        <td class="sm-col-item" title="${row.name}">
          <div style="display:flex;flex-direction:column;gap:3px;max-width:275px;overflow:hidden;">
            <div style="display:flex;align-items:center;gap:6px;overflow:hidden;">
              <span style="font-weight:700;font-size:13px;color:var(--clr-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="${row.name}">${row.name}</span>
              ${row.batchNote ? `<span class="batch-${row.batchNote === 'SOLD' ? 'sold' : 'new'}" style="font-size:9px;padding:1px 5px;flex-shrink:0;">${row.batchNote}</span>` : ''}
            </div>
            <div style="display:flex;align-items:center;gap:6px;font-size:11px;color:var(--clr-text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
              ${row.code ? `<span style="font-family:monospace;font-weight:600;color:var(--clr-text-muted);">${row.code}</span><span style="opacity:0.4;">•</span>` : ''}
              <span style="color:var(--clr-primary);font-weight:600;font-family:monospace;">₱${row.srp ? row.srp.toFixed(2) : '0.00'}</span>
              ${row.dealerPrice ? `<span style="opacity:0.65;font-size:10px;">(Cost ₱${row.dealerPrice.toFixed(2)})</span>` : ''}
              ${row.packing ? `<span style="opacity:0.6;font-size:10px;">• ${row.packing}</span>` : ''}
              ${row.category ? `<span style="opacity:0.5;font-size:10px;">• ${row.category}</span>` : ''}
            </div>
          </div>
        </td>`

      for (let ci = 0; ci < row.cells.length; ci++) {
        const v = row.cells[ci]
        const intensity = v > 0 ? Math.min(0.25, (v / maxVal) * 0.25) : 0
        const bg = v > 0 ? `background:rgba(99,102,241,${intensity.toFixed(2)});` : ''
        const color = v > 0 ? 'var(--clr-text)' : 'var(--clr-text-muted)'
        const weight = v > 0 ? '700' : '400'
        const opacity = v > 0 ? '1' : '0.35'
        html += `<td class="sm-cell" style="font-weight:${weight};color:${color};opacity:${opacity};${bg}">${v > 0 ? v : '&mdash;'}</td>`
      }

      html += `<td class="sm-col-total monospace" style="font-weight:800;color:#ef4444;background:rgba(239,68,68,0.04);">${row.total > 0 ? row.total : '&mdash;'}</td></tr>`
    }
    return html
  }

  function renderSummaryTfootRows(buyers: StockBuyer[], buyerTotals: Map<string, number>, grandTotal: number): string {
    let html = `<tr>
      <td class="sm-footer-item">TOTALS</td>`
    for (const b of buyers) {
      const bt = buyerTotals.get(b.id) || 0
      html += `<td class="sm-footer-cell" style="color:${bt > 0 ? 'var(--clr-primary)' : 'var(--clr-text-muted)'};">${bt > 0 ? bt : '&mdash;'}</td>`
    }
    html += `<td class="sm-footer-grand monospace">${grandTotal}</td></tr>`
    return html
  }

  function updateSummaryView(): void {
    let rowData = summaryCachedAllRows
    if (filterSummarySearch.trim()) {
      const q = filterSummarySearch.trim().toLowerCase()
      rowData = rowData.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        String(r.srp).includes(q) ||
        String(r.dealerPrice).includes(q)
      )
    }

    const maxVal = Math.max(1, ...summaryCachedAllRows.flatMap(r => r.cells))
    const tbody = document.getElementById('inv-summary-tbody')
    if (tbody) tbody.innerHTML = renderSummaryTbodyRows(rowData, summaryCachedBuyers, maxVal)

    const buyerTotals: Map<string, number> = new Map()
    for (const b of summaryCachedBuyers) buyerTotals.set(b.id, 0)
    let grandTotal = 0
    for (const row of rowData) {
      grandTotal += row.total
      for (let ci = 0; ci < summaryCachedBuyers.length; ci++) {
        const b = summaryCachedBuyers[ci]
        buyerTotals.set(b.id, (buyerTotals.get(b.id) || 0) + row.cells[ci])
      }
    }

    const tfoot = document.getElementById('inv-summary-tfoot')
    if (tfoot) tfoot.innerHTML = renderSummaryTfootRows(summaryCachedBuyers, buyerTotals, grandTotal)

    const statsEl = document.getElementById('inv-summary-stats')
    if (statsEl) {
      statsEl.innerHTML = `
        <span class="st-tag-pill">${rowData.length} of ${summaryCachedItems.length} items</span>
        <span class="st-tag-pill">${summaryCachedBuyers.length} accounts</span>
        <span class="st-tag-pill" style="color:#ef4444;background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.2);font-weight:800;">${grandTotal} units total</span>
      `
    }

    const headerCount = document.getElementById('inv-summary-header-count')
    if (headerCount) headerCount.textContent = String(rowData.length)
  }

  function buildSummary(): string {
    const buyers = db.buyers
    const items = db.items
    summaryCachedBuyers = buyers
    summaryCachedItems = items
    const catMap = new Map<string, string>()
    for (const c of db.categories) catMap.set(c.id, c.name)

    const allRowData: SummaryRow[] = []

    for (const item of items) {
      const itemMovements = db.movements.filter(m =>
        m.direction === 'out' && (
          m.itemId === item.id ||
          (!m.itemId && m.itemLabel && m.itemLabel === item.itemLabel)
        )
      )
      const cells: number[] = []
      let rowTotal = 0

      for (const b of buyers) {
        const bQty = itemMovements.filter(m => {
          if (m.buyerId && m.buyerId === b.id) return true
          if (m.buyerName && m.buyerName.toLowerCase() === b.name.toLowerCase()) return true
          const noteBuyer = m.note?.match(/^Retail sale to (.+)$/)?.[1]?.trim()
          if (noteBuyer && noteBuyer.toLowerCase() === b.name.toLowerCase()) return true
          if (b.isOwnShop) {
            if (m.buyerId) return false
            if (m.buyerName) return false
            if (m.note?.startsWith('Retail sale to ')) return false
            return true
          }
          return false
        }).reduce((sum, m) => sum + m.quantity, 0)

        cells.push(bQty)
        rowTotal += bQty
      }

      const catName = (item.categoryId ? catMap.get(item.categoryId) : '') || ''
      allRowData.push({
        id: item.id,
        name: item.name,
        code: item.code || '',
        category: catName,
        dealerPrice: item.dealerPrice || 0,
        srp: item.srp || 0,
        packing: item.packing || '',
        batchNote: (item.batchNote as any) || null,
        cells,
        total: rowTotal
      })
    }

    summaryCachedAllRows = allRowData

    let rowData = allRowData
    if (filterSummarySearch.trim()) {
      const q = filterSummarySearch.trim().toLowerCase()
      rowData = rowData.filter(r =>
        r.name.toLowerCase().includes(q) ||
        r.code.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q) ||
        String(r.srp).includes(q) ||
        String(r.dealerPrice).includes(q)
      )
    }

    const maxVal = Math.max(1, ...allRowData.flatMap(r => r.cells))

    const buyerTotals: Map<string, number> = new Map()
    for (const b of buyers) buyerTotals.set(b.id, 0)
    let grandTotal = 0
    for (const row of rowData) {
      grandTotal += row.total
      for (let ci = 0; ci < buyers.length; ci++) {
        const b = buyers[ci]
        buyerTotals.set(b.id, (buyerTotals.get(b.id) || 0) + row.cells[ci])
      }
    }

    let html = `
      <div class="inv-toolbar" style="justify-content:space-between;align-items:center;">
        <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:36px;height:36px;border-radius:10px;background:linear-gradient(135deg,rgba(99,102,241,0.15),rgba(168,85,247,0.15));display:flex;align-items:center;justify-content:center;color:var(--clr-primary);">
              ${Icons.barChart}
            </div>
            <div>
              <div style="font-size:15px;font-weight:700;color:var(--clr-text);">Buyer Dispatch Matrix</div>
              <div style="font-size:12px;color:var(--clr-text-muted);">Cross-tabulation of catalog products dispatched across accounts</div>
            </div>
          </div>
          <div style="height:22px;width:1px;background:var(--clr-border);margin:0 4px;"></div>
          <input type="text" class="inv-search" id="inv-search-summary" placeholder="Search product, code, price..." value="${filterSummarySearch}" style="width:240px;" />
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;" id="inv-summary-stats">
          <span class="st-tag-pill">${rowData.length} of ${items.length} items</span>
          <span class="st-tag-pill">${buyers.length} accounts</span>
          <span class="st-tag-pill" style="color:#ef4444;background:rgba(239,68,68,0.08);border-color:rgba(239,68,68,0.2);font-weight:800;">${grandTotal} units total</span>
        </div>
      </div>

      <div class="sm-card">
        <div class="sm-scroll-wrap custom-scroll">
          <table class="sm-table">
            <colgroup>
              <col style="width:310px;min-width:310px;">
              ${buyers.map(() => '<col style="width:100px;min-width:100px;">').join('')}
              <col style="width:110px;min-width:110px;">
            </colgroup>
            <thead>
              <tr>
                <th class="sm-th-item">
                  <div style="display:flex;align-items:center;justify-content:space-between;">
                    <span>PRODUCT / ITEM ROW</span>
                    <span id="inv-summary-header-count" style="font-size:9px;font-weight:700;color:var(--clr-text-muted);letter-spacing:0;">${rowData.length}</span>
                  </div>
                </th>`

    for (const b of buyers) {
      const short = b.name.replace(/\s*\(.*\)/, '')
      html += `<th class="sm-th" title="${b.name}">
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;overflow:hidden;">
          <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:86px;font-size:11px;">${short}</span>
          <span style="font-size:8px;font-weight:700;padding:1px 5px;border-radius:4px;letter-spacing:0;text-transform:none;background:${b.isOwnShop ? 'rgba(16,185,129,0.12)' : 'rgba(168,85,247,0.12)'};color:${b.isOwnShop ? '#10b981' : '#a855f7'};">${b.isOwnShop ? 'Shop' : 'Buyer'}</span>
        </div>
      </th>`
    }

    html += `<th class="sm-th-total">
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;">
        <span>TOTAL OUT</span>
        <span style="font-size:8px;font-weight:700;color:#ef4444;text-transform:none;letter-spacing:0;">Dispatched</span>
      </div>
    </th></tr></thead>
    <tbody id="inv-summary-tbody">
      ${renderSummaryTbodyRows(rowData, buyers, maxVal)}
    </tbody>
    <tfoot id="inv-summary-tfoot">
      ${renderSummaryTfootRows(buyers, buyerTotals, grandTotal)}
    </tfoot>
    </table></div></div>`

    return html
  }

  function buildBuyers(): string {
    const matchesBuyer = (m: any, bName: string, bId: string, isOwn: boolean) => {
      if (m.buyerId && m.buyerId === bId) return true
      if (m.buyerName && m.buyerName.toLowerCase() === bName.toLowerCase()) return true
      const noteBuyer = m.note?.match(/^Retail sale to (.+)$/)?.[1]?.trim()
      if (noteBuyer && noteBuyer.toLowerCase() === bName.toLowerCase()) return true
      if (isOwn) {
        if (m.buyerId && m.buyerId !== bId) return false
        if (m.buyerName && !m.buyerName.toUpperCase().includes('A&G')) return false
        if (m.note?.startsWith('Retail sale to ')) return false
        return true
      }
      return false
    }

    const totalOut = (name: string, id: string, isOwn: boolean) =>
      db.movements.filter(m =>
        m.direction === 'out' && matchesBuyer(m, name, id, isOwn)
      ).reduce((s, m) => s + m.quantity, 0)

    const totalItems = (name: string, id: string, isOwn: boolean) => {
      const itemIds = new Set<string>()
      db.movements.filter(m =>
        m.direction === 'out' && matchesBuyer(m, name, id, isOwn)
      ).forEach(m => { if (m.itemId) itemIds.add(m.itemId); else if (m.itemLabel) itemIds.add(m.itemLabel) })
      return itemIds.size
    }

    const grandTotal = db.buyers.reduce((s, b) => s + totalOut(b.name, b.id, b.isOwnShop), 0)

    let html = `
      <div class="inv-toolbar">
        <button class="btn btn-primary" id="btn-add-buyer" style="display:flex;align-items:center;gap:6px;">${Icons.plus} Add Buyer Account</button>
        <div style="margin-left:auto;font-size:13px;color:var(--clr-text-muted);">
          <span style="font-weight:700;color:var(--clr-text);">${db.buyers.length}</span> account(s) • <span style="font-weight:700;color:var(--clr-primary);">${grandTotal}</span> total units dispatched
        </div>
      </div>

      <div class="inv-card">
        <table class="inv-table">
          <thead>
            <tr>
              <th style="width:44px;">#</th>
              <th>BUYER / OUTLET NAME</th>
              <th style="width:160px;">ACCOUNT TYPE</th>
              <th class="text-right" style="width:140px;">ITEM TYPES</th>
              <th class="text-right" style="width:170px;">TOTAL DISPATCHED</th>
              <th style="width:90px;text-align:right;"></th>
            </tr>
          </thead>
          <tbody>`

    if (db.buyers.length === 0) {
      html += `
        <tr>
          <td colspan="6" style="text-align:center;padding:36px 20px;color:var(--clr-text-muted);">
            No buyer accounts configured. Click "Add Buyer Account" above.
          </td>
        </tr>`
    } else {
      db.buyers.forEach((b, idx) => {
        const dispatched = totalOut(b.name, b.id, b.isOwnShop)
        const uniqueItems = totalItems(b.name, b.id, b.isOwnShop)
        const initials = b.name.split(/\s+/).map(w => w[0]).join('').substring(0, 2).toUpperCase()
        const badgeBg = b.isOwnShop ? 'rgba(16,185,129,0.12)' : 'rgba(139,92,246,0.12)'
        const badgeColor = b.isOwnShop ? '#10b981' : '#8b5cf6'
        const badgeText = b.isOwnShop ? 'Own Shop' : 'Wholesale Buyer'

        html += `
          <tr>
            <td style="color:var(--clr-text-muted);font-weight:600;font-size:12px;">${idx + 1}</td>
            <td style="font-weight:600;color:var(--clr-text);">${b.name}</td>
            <td>
              <span style="font-size:11px;font-weight:700;padding:3px 8px;border-radius:6px;background:${badgeBg};color:${badgeColor};display:inline-block;">${badgeText}</span>
            </td>
            <td class="text-right" style="color:var(--clr-text-muted);font-size:13px;font-weight:600;">
              ${uniqueItems} product${uniqueItems === 1 ? '' : 's'}
            </td>
            <td class="text-right monospace" style="font-weight:800;font-size:14px;color:${dispatched > 0 ? '#ef4444' : 'var(--clr-text-muted)'};">
              ${dispatched}
            </td>
            <td>
              <div style="display:flex;gap:4px;justify-content:flex-end;">
                <button class="btn btn-ghost btn-icon btn-edit-buyer" data-id="${b.id}" data-name="${b.name.replace(/"/g,'&quot;')}" data-own="${b.isOwnShop}" data-tooltip="Edit" style="color:var(--clr-primary);">${Icons.pencil}</button>
                ${!b.isOwnShop ? `<button class="btn btn-ghost btn-icon btn-del-buyer" data-id="${b.id}" data-name="${b.name.replace(/"/g,'&quot;')}" data-tooltip="Delete" style="color:var(--clr-error);">${Icons.trash}</button>` : ''}
              </div>
            </td>
          </tr>`
      })
    }

    html += `</tbody></table></div>`
    return html
  }

  function buildOrders(): string {
    const sorted = [...db.restockOrders].sort((a, b) => b.orderDate.localeCompare(a.orderDate))

    let html = `
      <div class="inv-toolbar">
        <button class="btn btn-primary" id="btn-add-order">${Icons.plus} Add Restock Order</button>
        <div style="margin-left:auto;font-size:13px;color:var(--clr-text-muted)">${sorted.length} order(s)</div>
      </div>
      <div class="inv-card"><table class="inv-table">
        <thead><tr>
          <th>SO #</th><th>ORDER DATE</th><th>RECEIVED DATE</th>
          <th class="text-right">AMOUNT</th><th class="text-right">TRUCKING FEE</th><th class="text-right">ORDER TOTAL</th>
          <th>NOTE</th><th></th>
        </tr></thead><tbody>`

    for (const o of sorted) {
      const total = o.orderTotal || (o.amount + (o.truckingFee ?? 0))
      html += `<tr>
        <td class="monospace" style="font-weight:700">${o.soNumber || '&mdash;'}</td>
        <td class="monospace" style="color:var(--clr-text-muted)">${o.orderDate}</td>
        <td class="monospace" style="color:var(--clr-text-muted)">${o.receivedDate || '&mdash;'}</td>
        <td class="text-right monospace">${fmt(o.amount)}</td>
        <td class="text-right monospace">${o.truckingFee ? fmt(o.truckingFee) : '&mdash;'}</td>
        <td class="text-right monospace" style="font-weight:700;color:var(--clr-primary)">${fmt(total)}</td>
        <td style="color:var(--clr-text-muted);font-size:12px;">${o.note || '&mdash;'}</td>
        <td><div style="display:flex;gap:4px">
          <button class="btn btn-ghost btn-icon btn-edit-order" data-id="${o.id}" data-tooltip="Edit">${Icons.pencil}</button>
          <button class="btn btn-ghost btn-icon btn-del-order" data-id="${o.id}" data-tooltip="Delete" style="color:var(--clr-error)">${Icons.trash}</button>
        </div></td>
      </tr>`
    }

    if (sorted.length === 0) {
      html += `<tr><td colspan="8" style="text-align:center;padding:48px;color:var(--clr-text-muted)">No restock orders found.</td></tr>`
    }
    html += `</tbody></table></div>`
    return html
  }

  function showForm(html: string): Promise<Record<string, string> | null> {
    return new Promise(resolve => {
      const area = document.getElementById('inv-form-area')!
      area.innerHTML = `<div class="form-ov" id="inv-overlay"><div class="form-card">${html}</div></div>`
      area.querySelector('#inv-overlay')!.addEventListener('click', e => {
        if (e.target === e.currentTarget) { area.innerHTML = ''; resolve(null) }
      })
      area.querySelector('#inv-cancel')?.addEventListener('click', () => { area.innerHTML = ''; resolve(null) })
      area.querySelector('#inv-submit')?.addEventListener('click', () => {
        const result: Record<string, string> = {}
        area.querySelectorAll('[data-field]').forEach((el: any) => {
          result[el.dataset.field] = el.type === 'checkbox' ? String(el.checked) : el.value
        })
        area.innerHTML = ''
        resolve(result)
      })
      area.querySelector('#inv-delete-item')?.addEventListener('click', () => {
        area.innerHTML = ''
        resolve({ __action__: '__DELETE__' })
      })
      area.querySelectorAll('input[data-date]').forEach((el: any) => {
        flatpickr(el, { dateFormat: 'Y-m-d', disableMobile: true })
      })
    })
  }

  function catSelect(selectedIdOrName = '') {
    return db.categories.map(c =>
      `<option value="${c.id}" ${(c.id === selectedIdOrName || c.name.toLowerCase() === selectedIdOrName.toLowerCase()) ? 'selected' : ''}>${c.name}</option>`
    ).join('')
  }
  function buyerSelect(selectedName = '') {
    return db.buyers.map(b =>
      `<option value="${b.name}" ${b.name === selectedName ? 'selected' : ''}>${b.name}${b.isOwnShop ? ' (Own Shop)' : ''}</option>`
    ).join('')
  }
  function itemSelect(selectedLabel = '') {
    return db.items.map(i =>
      `<option value="${i.itemLabel || i.name}" ${(i.itemLabel === selectedLabel || i.name === selectedLabel) ? 'selected' : ''}>${i.name}${i.code ? ` (${i.code})` : ''}</option>`
    ).join('')
  }

  function bindProductRowEvents() {
    document.querySelectorAll('.btn-edit-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.id!
        const item = db.items.find(i => i.id === id)!
        if (!item) return showToast('Item not found', 'error')

        const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

        const data = await showForm(`
          <h3>Edit Product</h3>
          <div class="fr">
            <div class="ff"><label>Code</label><input data-field="code" type="text" value="${esc(item.code || '')}"></div>
            <div class="ff"><label>Category</label><select data-field="categoryId">${catSelect(item.categoryId)}</select></div>
          </div>
          <div class="ff"><label>Item Name *</label><input data-field="name" type="text" value="${esc(item.name)}"></div>
          <div class="fr">
            <div class="ff"><label>Packing</label><input data-field="packing" type="text" value="${esc(item.packing || '')}"></div>
            <div class="ff"><label>Dealer Price (₱)</label><input data-field="dealerPrice" type="number" value="${item.dealerPrice}" step="0.01"></div>
            <div class="ff"><label>SRP (₱)</label><input data-field="srp" type="number" value="${item.srp}" step="0.01"></div>
          </div>
          <div class="fr">
            <div class="ff"><label>Batch Note</label>
              <select data-field="batchNote">
                <option value="" ${!item.batchNote ? 'selected' : ''}>— None —</option>
                <option value="NEW BATCH" ${item.batchNote === 'NEW BATCH' ? 'selected' : ''}>NEW BATCH</option>
                <option value="SOLD" ${item.batchNote === 'SOLD' ? 'selected' : ''}>SOLD</option>
              </select>
            </div>
            <div class="ff"><label>Batch Date</label><input data-field="batchDate" type="text" data-date value="${item.batchDate || ''}"></div>
          </div>
          <div class="ff"><label>Low Stock Threshold</label><input data-field="lowStockThreshold" type="number" value="${item.lowStockThreshold ?? ''}"></div>
          <div class="fa" style="justify-content:space-between">
            <button class="btn btn-danger" id="inv-delete-item" type="button" style="background:var(--clr-error);color:#fff;border:none">${Icons.trash} Delete</button>
            <div style="display:flex;gap:8px">
              <button class="btn btn-outline" id="inv-cancel">Cancel</button>
              <button class="btn btn-primary" id="inv-submit">Save Changes</button>
            </div>
          </div>`)
        if (!data) return
        if (data.__action__ === '__DELETE__' || (data as any).action === 'delete') {
          const clicked = await showModal({
            icon: Icons.trash, iconColor: 'danger',
            title: 'Delete product?',
            body: `"${item.name}" will be removed from Item Catalog and Buyer Summary in STOCK REPORT.xlsx.`,
            buttons: [
              { id: 'cancel', label: 'Cancel', className: 'btn-outline' },
              { id: 'confirm', label: 'Delete', className: 'btn-danger' },
            ]
          })
          if (clicked !== 'confirm') return
          const delRes = await window.api.stockDbDeleteItem(id)
          if (delRes.ok) { showToast('Product deleted', 'success'); await loadDb(); render() }
          else showToast('Delete error: ' + delRes.error, 'error')
          return
        }

        const res = await window.api.stockDbUpdateItem(id, {
          name: data.name?.trim() || item.name,
          code: data.code !== undefined ? (data.code.trim() || undefined) : undefined,
          categoryId: data.categoryId || item.categoryId,
          packing: data.packing !== undefined ? (data.packing.trim() || undefined) : undefined,
          dealerPrice: parseFloat(data.dealerPrice) || 0,
          srp: parseFloat(data.srp) || 0,
          batchNote: data.batchNote !== undefined ? ((data.batchNote as any) || null) : undefined,
          batchDate: data.batchDate !== undefined ? (data.batchDate || null) : undefined,
          lowStockThreshold: data.lowStockThreshold !== undefined ? (data.lowStockThreshold ? parseFloat(data.lowStockThreshold) : null) : undefined,
        })
        if (res.ok) { showToast('Product updated ✓', 'success'); await loadDb(); render() }
        else showToast('Error: ' + res.error, 'error')
      })
    })

    document.querySelectorAll('.btn-dispatch').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.id!
        const label = (btn as HTMLElement).dataset.label!
        const data = await showForm(`
          <h3>Dispatch: ${label}</h3>
          <div class="fr">
            <div class="ff"><label>Date *</label><input data-field="date" type="text" data-date value="${todayStr()}"></div>
            <div class="ff"><label>Quantity *</label><input data-field="quantity" type="number" value="1" min="1"></div>
          </div>
          <div class="ff"><label>Buyer / Outlet *</label><select data-field="buyerName">${buyerSelect()}</select></div>
          <div class="ff"><label>Note</label><input data-field="note" type="text" placeholder="e.g. Wholesale delivery"></div>
          <div class="fa">
            <button class="btn btn-outline" id="inv-cancel">Cancel</button>
            <button class="btn btn-primary" id="inv-submit">Dispatch</button>
          </div>`)
        if (!data) return
        const res = await window.api.stockDbAddMovement({
          itemId: id,
          itemLabel: label,
          direction: 'out',
          quantity: parseInt(data.quantity) || 1,
          buyerName: data.buyerName,
          source: 'wholesale_dispatch',
          date: data.date,
          note: data.note || undefined,
        })
        if (res.ok) { showToast('Dispatched ✓', 'success'); await loadDb(); render() }
        else showToast('Error: ' + res.error, 'error')
      })
    })
  }

  function bindMovementRowEvents() {
    document.querySelectorAll('.btn-edit-movement').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.id!
        const m = db.movements.find(x => x.id === id)!
        if (!m) return

        const data = await showForm(`
          <h3>Edit Movement</h3>
          <div class="fr">
            <div class="ff"><label>Date *</label><input data-field="date" type="text" data-date value="${m.date}"></div>
            <div class="ff"><label>Direction *</label>
              <select data-field="direction">
                <option value="in" ${m.direction === 'in' ? 'selected' : ''}>IN</option>
                <option value="out" ${m.direction === 'out' ? 'selected' : ''}>OUT</option>
              </select>
            </div>
          </div>
          <div class="ff"><label>Item *</label><select data-field="itemLabel">${itemSelect(m.itemLabel)}</select></div>
          <div class="fr">
            <div class="ff"><label>Quantity *</label><input data-field="quantity" type="number" value="${m.quantity}" min="1"></div>
            <div class="ff"><label>Buyer / Outlet</label><select data-field="buyerName">${buyerSelect(m.buyerName || '')}</select></div>
          </div>
          <div class="ff"><label>Note</label><input data-field="note" type="text" value="${m.note || ''}"></div>
          <div class="fa">
            <button class="btn btn-outline" id="inv-cancel">Cancel</button>
            <button class="btn btn-primary" id="inv-submit">Save</button>
          </div>`)
        if (!data) return
        const res = await window.api.stockDbUpdateMovement(id, {
          itemLabel: data.itemLabel,
          direction: data.direction as 'in' | 'out',
          quantity: parseInt(data.quantity) || 1,
          date: data.date,
          buyerName: data.direction === 'out' ? data.buyerName : undefined,
          note: data.note || undefined,
        })
        if (res.ok) { showToast('Movement updated ✓', 'success'); await loadDb(); render() }
        else showToast('Error: ' + res.error, 'error')
      })
    })

    document.querySelectorAll('.btn-del-movement').forEach(btn => {
      btn.addEventListener('click', async () => {
        const clicked = await showModal({
          icon: Icons.trash,
          iconColor: 'danger',
          title: 'Delete movement?',
          body: 'This will permanently remove the movement and update the stock balance.',
          buttons: [
            { id: 'cancel', label: 'Cancel', className: 'btn-outline' },
            { id: 'confirm', label: 'Delete', className: 'btn-danger' },
          ]
        })
        if (clicked !== 'confirm') return
        const res = await window.api.stockDbDeleteMovement((btn as HTMLElement).dataset.id!)
        if (res.ok) { showToast('Movement deleted', 'success'); await loadDb(); render() }
        else showToast('Error: ' + res.error, 'error')
      })
    })
  }

  function bindTabEvents() {
    const q    = (s: string) => document.querySelector(s)
    const qAll = (s: string) => document.querySelectorAll(s)

    q('#inv-search')?.addEventListener('input', e => {
      filterSearch = (e.target as HTMLInputElement).value
      updateProductsView()
    })
    q('#inv-cat-filter')?.addEventListener('change', e => {
      filterCategory = (e.target as HTMLSelectElement).value
      updateProductsView()
    })
    q('#inv-show-archived')?.addEventListener('change', e => {
      showArchived = (e.target as HTMLInputElement).checked
      updateProductsView()
    })

    q('#inv-search-mov')?.addEventListener('input', e => {
      filterSearch = (e.target as HTMLInputElement).value
      updateMovementsView()
    })
    q('#inv-mov-dir')?.addEventListener('change', e => {
      filterMovementDir = (e.target as HTMLSelectElement).value
      updateMovementsView()
    })
    q('#inv-mov-src')?.addEventListener('change', e => {
      filterMovementSource = (e.target as HTMLSelectElement).value
      updateMovementsView()
    })

    q('#inv-search-summary')?.addEventListener('input', e => {
      filterSummarySearch = (e.target as HTMLInputElement).value
      updateSummaryView()
    })

    bindProductRowEvents()
    bindMovementRowEvents()

    // Add Product
    q('#btn-add-product')?.addEventListener('click', async () => {
      const data = await showForm(`
        <h3>Add Product to Catalog</h3>
        <div class="fr">
          <div class="ff"><label>Code (Supplier)</label><input data-field="code" type="text" placeholder="e.g. 10-150-105"></div>
          <div class="ff"><label>Category *</label><select data-field="categoryId">${catSelect()}</select></div>
        </div>
        <div class="ff"><label>Item Name *</label><input data-field="name" type="text" placeholder="e.g. 5 GAL SLIM CONTAINER W/ CAP BLUE"></div>
        <div class="fr">
          <div class="ff"><label>Packing</label><input data-field="packing" type="text" placeholder="e.g. 1 PC"></div>
          <div class="ff"><label>Dealer Price (₱) *</label><input data-field="dealerPrice" type="number" value="0" step="0.01"></div>
          <div class="ff"><label>SRP (₱) *</label><input data-field="srp" type="number" value="0" step="0.01"></div>
        </div>
        <div class="fr">
          <div class="ff"><label>Batch Note</label>
            <select data-field="batchNote">
              <option value="">— None —</option>
              <option value="NEW BATCH">NEW BATCH</option>
              <option value="SOLD">SOLD</option>
            </select>
          </div>
          <div class="ff"><label>Batch Date</label><input data-field="batchDate" type="text" data-date placeholder="Optional"></div>
        </div>
        <div class="ff"><label>Low Stock Alert Threshold (optional)</label><input data-field="lowStockThreshold" type="number" placeholder="Leave blank to disable"></div>
        <div class="fa">
          <button class="btn btn-outline" id="inv-cancel">Cancel</button>
          <button class="btn btn-primary" id="inv-submit">Add Product</button>
        </div>`)
      if (!data || !data.name?.trim()) return

      const res = await window.api.stockDbAddItem({
        name: data.name.trim(),
        code: data.code?.trim() || undefined,
        categoryId: data.categoryId,
        packing: data.packing?.trim() || undefined,
        dealerPrice: parseFloat(data.dealerPrice) || 0,
        srp: parseFloat(data.srp) || 0,
        batchNote: (data.batchNote as any) || undefined,
        batchDate: data.batchDate || undefined,
        lowStockThreshold: data.lowStockThreshold ? parseFloat(data.lowStockThreshold) : undefined,
      })
      if (res.ok) { showToast('Product added to Item Catalog', 'success'); await loadDb(); render() }
      else showToast('Error: ' + res.error, 'error')
    })

    // Add Movement Modal
    q('#btn-add-movement')?.addEventListener('click', async () => {
      const data = await showForm(`
        <h3>Log Stock Movement</h3>
        <div class="fr">
          <div class="ff"><label>Date *</label><input data-field="date" type="text" data-date value="${todayStr()}"></div>
          <div class="ff"><label>Direction *</label>
            <select data-field="direction">
              <option value="out">OUT — Dispatch / Sale</option>
              <option value="in">IN — Restock Received</option>
            </select>
          </div>
        </div>
        <div class="ff"><label>Item *</label><select data-field="itemLabel">${itemSelect()}</select></div>
        <div class="fr">
          <div class="ff"><label>Quantity *</label><input data-field="quantity" type="number" value="1" min="1"></div>
          <div class="ff"><label>Buyer / Outlet (for OUT)</label><select data-field="buyerName">${buyerSelect()}</select></div>
        </div>
        <div class="fr">
          <div class="ff"><label>Source</label>
            <select data-field="source">
              <option value="wholesale_dispatch">Wholesale Dispatch</option>
              <option value="restock">Restock</option>
              <option value="sales_entry">Sales Entry (Retail)</option>
              <option value="historical_import">Historical Import</option>
            </select>
          </div>
          <div class="ff"><label>Reference / PO #</label><input data-field="reference" type="text" placeholder="e.g. SO141459"></div>
        </div>
        <div class="ff"><label>Note</label><input data-field="note" type="text" placeholder="Optional notes"></div>
        <div class="fa">
          <button class="btn btn-outline" id="inv-cancel">Cancel</button>
          <button class="btn btn-primary" id="inv-submit">Save Movement</button>
        </div>`)
      if (!data) return

      const res = await window.api.stockDbAddMovement({
        itemId: data.itemLabel.split(' · ')[0] || data.itemLabel,
        itemLabel: data.itemLabel,
        direction: data.direction as 'in' | 'out',
        quantity: parseInt(data.quantity) || 1,
        buyerName: data.direction === 'out' ? data.buyerName : undefined,
        source: data.source as any,
        reference: data.reference || undefined,
        date: data.date,
        note: data.note || undefined,
      })
      if (res.ok) { showToast('Movement logged ✓', 'success'); await loadDb(); render() }
      else showToast('Error: ' + res.error, 'error')
    })

    // Add Buyer
    q('#btn-add-buyer')?.addEventListener('click', async () => {
      const data = await showForm(`
        <h3>Add Buyer Account</h3>
        <div class="ff"><label>Buyer Name *</label><input data-field="name" type="text" placeholder="e.g. PURE DROP"></div>
        <div class="fa">
          <button class="btn btn-outline" id="inv-cancel">Cancel</button>
          <button class="btn btn-primary" id="inv-submit">Add Buyer</button>
        </div>`)
      if (!data || !data.name?.trim()) return
      const res = await window.api.stockDbAddBuyer({ name: data.name.trim(), isOwnShop: false })
      if (res.ok) {
        showToast(`Buyer "${data.name.trim()}" added to Buyers tab & Excel sheet ✓`, 'success')
        await loadDb()
        switchTab('buyers')
      } else {
        showToast('Error: ' + res.error, 'error')
      }
    })

    // Edit Buyer
    qAll('.btn-edit-buyer').forEach(btn => btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.id!
      const name = (btn as HTMLElement).dataset.name!
      const data = await showForm(`
        <h3>Edit Buyer Account</h3>
        <div class="ff"><label>Buyer Name *</label><input data-field="name" type="text" value="${name}"></div>
        <div class="fa">
          <button class="btn btn-outline" id="inv-cancel">Cancel</button>
          <button class="btn btn-primary" id="inv-submit">Save</button>
        </div>`)
      if (!data || !data.name?.trim()) return
      const res = await window.api.stockDbUpdateBuyer(id, { name: data.name.trim() })
      if (res.ok) { showToast('Buyer updated', 'success'); await loadDb(); render() }
      else showToast('Error: ' + res.error, 'error')
    }))

    // Delete Buyer
    qAll('.btn-del-buyer').forEach(btn => btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.id || ''
      const name = (btn as HTMLElement).dataset.name || id
      const clicked = await showModal({
        icon: Icons.trash,
        iconColor: 'danger',
        title: `Delete buyer "${name}"?`,
        body: 'This buyer will be removed from the buyers list and the summary pivot sheet. Associated ledger records will remain.',
        buttons: [
          { id: 'cancel', label: 'Cancel', className: 'btn-outline' },
          { id: 'confirm', label: 'Delete', className: 'btn-danger' },
        ]
      })
      if (clicked !== 'confirm') return
      const res = await window.api.stockDbDeleteBuyer(id || name)
      if (res.ok) {
        showToast(`Buyer "${name}" deleted ✓`, 'success')
        await loadDb()
        render()
      } else {
        showToast('Error: ' + res.error, 'error')
      }
    }))

    // Add Restock Order
    q('#btn-add-order')?.addEventListener('click', async () => {
      const data = await showForm(`
        <h3>Add Restock / Purchase Order</h3>
        <div class="fr">
          <div class="ff"><label>SO Number</label><input data-field="soNumber" type="text" placeholder="e.g. SO141459"></div>
          <div class="ff"><label>Order Date *</label><input data-field="orderDate" type="text" data-date value="${todayStr()}"></div>
        </div>
        <div class="fr">
          <div class="ff"><label>Received Date</label><input data-field="receivedDate" type="text" data-date placeholder="Optional"></div>
          <div class="ff"><label>Order Amount (₱) *</label><input data-field="amount" type="number" value="0" step="0.01"></div>
        </div>
        <div class="ff"><label>Trucking Fee (₱)</label><input data-field="truckingFee" type="number" value="0" step="0.01"></div>
        <div class="ff"><label>Note</label><input data-field="note" type="text" placeholder="Optional order details"></div>
        <div class="fa">
          <button class="btn btn-outline" id="inv-cancel">Cancel</button>
          <button class="btn btn-primary" id="inv-submit">Add Order</button>
        </div>`)
      if (!data) return
      const res = await window.api.stockDbAddRestockOrder({
        soNumber: data.soNumber?.trim() || undefined,
        orderDate: data.orderDate,
        receivedDate: data.receivedDate || undefined,
        amount: parseFloat(data.amount) || 0,
        truckingFee: parseFloat(data.truckingFee) || undefined,
        note: data.note || undefined,
      })
      if (res.ok) { showToast('Restock order added ✓', 'success'); await loadDb(); render() }
      else showToast('Error: ' + res.error, 'error')
    })

    // Edit Restock Order
    qAll('.btn-edit-order').forEach(btn => btn.addEventListener('click', async () => {
      const id = (btn as HTMLElement).dataset.id!
      const o = db.restockOrders.find(x => x.id === id)!
      if (!o) return

      const data = await showForm(`
        <h3>Edit Restock Order</h3>
        <div class="fr">
          <div class="ff"><label>SO Number</label><input data-field="soNumber" type="text" value="${o.soNumber || ''}"></div>
          <div class="ff"><label>Order Date *</label><input data-field="orderDate" type="text" data-date value="${o.orderDate}"></div>
        </div>
        <div class="fr">
          <div class="ff"><label>Received Date</label><input data-field="receivedDate" type="text" data-date value="${o.receivedDate || ''}"></div>
          <div class="ff"><label>Order Amount (₱) *</label><input data-field="amount" type="number" value="${o.amount}" step="0.01"></div>
        </div>
        <div class="ff"><label>Trucking Fee (₱)</label><input data-field="truckingFee" type="number" value="${o.truckingFee ?? 0}" step="0.01"></div>
        <div class="ff"><label>Note</label><input data-field="note" type="text" value="${o.note || ''}"></div>
        <div class="fa">
          <button class="btn btn-outline" id="inv-cancel">Cancel</button>
          <button class="btn btn-primary" id="inv-submit">Save</button>
        </div>`)
      if (!data) return
      const res = await window.api.stockDbUpdateRestockOrder(id, {
        soNumber: data.soNumber?.trim() || undefined,
        orderDate: data.orderDate,
        receivedDate: data.receivedDate || undefined,
        amount: parseFloat(data.amount) || 0,
        truckingFee: parseFloat(data.truckingFee) || undefined,
        note: data.note || undefined,
      })
      if (res.ok) { showToast('Order updated ✓', 'success'); await loadDb(); render() }
      else showToast('Error: ' + res.error, 'error')
    }))

    // Delete Restock Order
    qAll('.btn-del-order').forEach(btn => btn.addEventListener('click', async () => {
      const clicked = await showModal({
        icon: Icons.trash,
        iconColor: 'danger',
        title: 'Delete restock order?',
        body: 'This order will be removed from the purchase log.',
        buttons: [
          { id: 'cancel', label: 'Cancel', className: 'btn-outline' },
          { id: 'confirm', label: 'Delete', className: 'btn-danger' },
        ]
      })
      if (clicked !== 'confirm') return
      const res = await window.api.stockDbDeleteRestockOrder((btn as HTMLElement).dataset.id!)
      if (res.ok) { showToast('Order deleted', 'success'); await loadDb(); render() }
      else showToast('Error: ' + res.error, 'error')
    }))
  }

  // ── One-time bindings ───────────────────────────────────────────────────────
  document.getElementById('itab-products')! .addEventListener('click', () => switchTab('products'))
  document.getElementById('itab-movements')!.addEventListener('click', () => switchTab('movements'))
  document.getElementById('itab-summary')!  .addEventListener('click', () => switchTab('summary'))
  document.getElementById('itab-buyers')!   .addEventListener('click', () => switchTab('buyers'))
  document.getElementById('itab-orders')!   .addEventListener('click', () => switchTab('orders'))
  document.getElementById('inv-refresh')!   .addEventListener('click', async () => { await loadDb(); render(); showToast('Refreshed', 'success') })
  document.getElementById('inv-export-xlsx')?.addEventListener('click', doExport)
  document.getElementById('btn-open-stock-file')?.addEventListener('click', async () => {
    const res = await window.api.stockDbOpenFile()
    if (!res.ok) showToast(res.error || 'Could not open file location', 'error')
  })

  if (unbindSync) {
    unbindSync()
    unbindSync = null
  }
  unbindSync = window.api.on('sync:complete', async () => {
    if (db.items.length === 0) {
      await loadDb()
      render()
    }
  })

  await loadDb()
  render()
}
