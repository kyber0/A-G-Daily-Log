import type { AppConfig, ItemSale, InventoryItem } from '../../shared/types'
import { showToast, showOverlay, hideOverlay, showModal } from '../components/ui'
import { Icons } from '../components/icons'
import flatpickr from 'flatpickr'
import monthSelectPlugin from 'flatpickr/dist/plugins/monthSelect/index.js'
import 'flatpickr/dist/flatpickr.min.css'
import 'flatpickr/dist/plugins/monthSelect/style.css'

function fmt(n: number): string {
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtDate(iso: string): string {
  try {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch { return iso }
}

export function renderItemSalesScreen(
  container: HTMLElement,
  _config: AppConfig
): void {
  let inventoryItems: InventoryItem[] = []
  let monthSales: ItemSale[] = []
  let selectedSale: ItemSale | null = null
  let editingSale: ItemSale | null = null
  let stockItemsMap: Map<string, { balance: number; status: 'in_stock' | 'low' | 'out' }> = new Map()
  let availableBuyers: { id: string; name: string; isOwnShop?: boolean }[] = []

  const today = todayISO()
  let currentMonth = today.substring(0, 7)

  container.innerHTML = `
    <!-- Top bar -->
    <div class="topbar">
      <button class="btn btn-ghost btn-icon" id="is-btn-toggle-sidebar" data-tooltip="Toggle Form" aria-label="Toggle Form" style="margin-right:8px;">
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
      </button>

      <div class="topbar__date-wrap">
        <input type="text" id="is-month-picker" class="topbar-picker" value="${currentMonth}" placeholder="Select Month..." readonly style="cursor:pointer;" />
        <span class="date-icon">${Icons.calendar}</span>
      </div>

      <div class="file-indicator">
        <span class="file-indicator__name" style="color:var(--clr-primary);font-weight:700;">Item Sales Log</span>
        <span class="file-indicator__arrow">→</span>
        <span class="file-indicator__sheet" id="is-indicator-month">${currentMonth}</span>
      </div>

      <button class="btn btn-ghost btn-icon" id="is-btn-refresh-sales" data-tooltip="Reload" aria-label="Reload">
        ${Icons.refreshCw}
      </button>

      <div class="topbar__spacer"></div>
      <div class="row-counter" id="is-sales-counter">0 sales</div>
    </div>

    <!-- 3-column layout: [Add Form] | [Sales List] | [Detail Panel] -->
    <div class="entry-layout" style="position:relative;">

      <!-- LEFT: Add Sale Form -->
      <aside class="entry-sidebar" id="is-sidebar">
        <div class="entry-sidebar__inner">

          <!-- Edit banner -->
          <div id="is-edit-banner" class="edit-banner hidden" style="background:rgba(14,165,233,0.12);border:1px solid rgba(14,165,233,0.3);border-radius:10px;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;">
            <div style="font-size:12px;color:var(--clr-primary);font-weight:700;display:flex;align-items:center;gap:6px;">
              ${Icons.pencil} Editing Sale <span id="is-edit-num"></span>
            </div>
            <button class="btn btn-xs btn-ghost" id="is-btn-cancel-edit" style="color:var(--clr-text-muted);">Cancel</button>
          </div>

          <h3 id="is-form-heading" style="color:var(--clr-text-muted);font-size:11px;text-transform:uppercase;letter-spacing:.07em;margin:0">New Sale</h3>

          <!-- Sale Date -->
          <div class="field">
            <label for="is-date" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--clr-text-muted);margin-bottom:6px">Sale Date</label>
            <input type="text" id="is-date" value="${today}" style="width:100%;padding:9px 12px;border-radius:10px;border:1px solid var(--clr-border);background:var(--clr-input-bg);color:var(--clr-text);font-size:14px;font-family:var(--font);box-sizing:border-box;cursor:pointer" />
          </div>

          <!-- Product -->
          <div class="field" style="position:relative;z-index:100">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <label for="is-item-search" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--clr-text-muted)">Product / Item</label>
              <span id="is-stock-badge" style="display:none;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px"></span>
            </div>
            <div style="position:relative;display:flex;align-items:center">
              <input type="text" id="is-item-search" placeholder="Search products…" autocomplete="off"
                style="width:100%;padding:9px 34px 9px 12px;border-radius:10px;border:1px solid var(--clr-border);background:var(--clr-input-bg);color:var(--clr-text);font-size:14px;font-family:var(--font);box-sizing:border-box" />
              <button type="button" id="is-item-toggle" tabindex="-1"
                style="position:absolute;right:8px;background:transparent;border:none;color:var(--clr-text-muted);cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;border-radius:6px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            </div>
            <input type="hidden" id="is-item" value="" />
            <div id="is-item-dropdown" class="custom-scroll"
              style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:500;background:var(--clr-surface);border:1px solid var(--clr-border);border-radius:14px;box-shadow:0 18px 45px rgba(0,0,0,.35);max-height:280px;overflow-y:auto;padding:6px;box-sizing:border-box"></div>
          </div>

          <!-- Qty + Discount -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="field">
              <label for="is-qty" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--clr-text-muted);margin-bottom:6px">Quantity</label>
              <input type="number" id="is-qty" min="1" value="1" style="width:100%;padding:9px 12px;border-radius:10px;border:1px solid var(--clr-border);background:var(--clr-input-bg);color:var(--clr-text);font-size:14px;font-family:var(--font);box-sizing:border-box" />
            </div>
            <div class="field">
              <label for="is-discount" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--clr-text-muted);margin-bottom:6px">Discount (₱)</label>
              <input type="number" id="is-discount" min="0" value="0" style="width:100%;padding:9px 12px;border-radius:10px;border:1px solid var(--clr-border);background:var(--clr-input-bg);color:var(--clr-text);font-size:14px;font-family:var(--font);box-sizing:border-box" />
            </div>
          </div>

          <!-- Remarks / Buyer -->
          <div class="field" style="position:relative">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
              <label for="is-remarks" style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:var(--clr-text-muted)">Remarks / Buyer</label>
              <span style="font-size:10px;color:var(--clr-text-muted)">Select or type</span>
            </div>
            <div style="position:relative;display:flex;align-items:center">
              <input type="text" id="is-remarks" placeholder="Select buyer or enter remarks…" autocomplete="off"
                style="width:100%;padding:9px 34px 9px 12px;border-radius:10px;border:1px solid var(--clr-border);background:var(--clr-input-bg);color:var(--clr-text);font-size:14px;font-family:var(--font);box-sizing:border-box" />
              <button type="button" id="is-remarks-toggle" tabindex="-1"
                style="position:absolute;right:8px;background:transparent;border:none;color:var(--clr-text-muted);cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;border-radius:6px">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
            </div>
            <div id="is-buyer-dropdown" class="custom-scroll"
              style="display:none;position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:200;background:var(--clr-surface);border:1px solid var(--clr-border);border-radius:12px;box-shadow:0 14px 36px rgba(0,0,0,0.25);max-height:220px;overflow-y:auto;padding:6px;box-sizing:border-box"></div>
          </div>

          <!-- Price summary -->
          <div style="background:var(--clr-surface-2);border-radius:12px;padding:16px;border:1px solid var(--clr-border);">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <span style="font-size:13px;color:var(--clr-text-muted)">Unit Price</span>
              <span id="is-price" style="font-size:14px;font-weight:600;font-family:monospace">₱0.00</span>
            </div>
            <div style="border-top:1px solid var(--clr-border);padding-top:10px;display:flex;justify-content:space-between;align-items:center">
              <span style="font-size:14px;font-weight:700;color:var(--clr-text)">Net Total</span>
              <span id="is-total" style="font-size:18px;font-weight:800;color:var(--clr-primary);font-family:monospace">₱0.00</span>
            </div>
          </div>

        </div>

        <div class="entry-sidebar__footer">
          <button id="is-btn-save" class="btn btn-primary btn-lg" style="width:100%;box-shadow:var(--shadow-md);display:flex;align-items:center;justify-content:center;gap:8px;">
            ${Icons.plus} Add Sale
          </button>
        </div>
      </aside>

      <!-- CENTER: Sales List Table -->
      <main class="entry-main" id="is-main" style="position:relative;">
        <div class="table-wrap">
          <table class="sales-table" id="is-sales-table">
            <thead>
              <tr>
                <th style="width:44px" class="td-sn">#</th>
                <th style="width:110px">Date</th>
                <th>Product / Item</th>
                <th style="width:70px;text-align:right;" class="td-qty">Qty</th>
                <th style="width:120px;text-align:right;" class="td-total">Total</th>
              </tr>
            </thead>
            <tbody id="is-sales-tbody"></tbody>
          </table>
        </div>

        <!-- Footer totals -->
        <div class="table-footer" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
          <div style="display:flex;align-items:center;gap:24px;">
            <div class="running-total">
              <span class="running-total__label">Revenue</span>
              <span class="running-total__amount" id="rt-revenue">₱0.00</span>
              <span class="running-total__qty" id="rt-count"></span>
            </div>
            <div class="running-total">
              <span class="running-total__label">Qty Sold</span>
              <span class="running-total__amount" id="rt-qty" style="color:var(--clr-text)">0</span>
            </div>
            <div class="running-total">
              <span class="running-total__label" style="color:var(--clr-text-muted)">Discounts</span>
              <span class="running-total__amount" id="rt-discount" style="color:var(--clr-text-muted);font-weight:600">₱0.00</span>
            </div>
          </div>
          <div style="font-size:12px;color:var(--clr-text-muted);display:flex;align-items:center;gap:5px;">
            ${Icons.check} Synced
          </div>
        </div>
      </main>

      <!-- RIGHT: Detail Panel (slide-in from right) -->
      <div id="is-detail-panel" style="
        width: 320px;
        flex-shrink: 0;
        border-left: 1px solid var(--clr-border);
        background: var(--clr-surface);
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transform: translateX(100%);
        margin-right: -320px;
        transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1), margin-right 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        z-index: 3;
      ">
        <!-- Panel Header -->
        <div style="padding:20px 20px 16px;border-bottom:1px solid var(--clr-border);display:flex;align-items:center;justify-content:space-between;flex-shrink:0;">
          <div>
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--clr-text-muted)">Sale Details</div>
            <div id="dp-title" style="font-size:15px;font-weight:700;color:var(--clr-text);margin-top:2px">—</div>
          </div>
          <button id="dp-close" class="btn btn-ghost btn-icon" title="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Panel Body -->
        <div id="dp-body" style="flex:1;overflow-y:auto;padding:20px;display:flex;flex-direction:column;gap:16px;">
          <!-- filled by JS -->
        </div>

        <!-- Panel Footer -->
        <div style="padding:16px 20px;border-top:1px solid var(--clr-border);display:flex;gap:10px;flex-shrink:0;">
          <button id="dp-edit" class="btn btn-primary" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;">
            ${Icons.pencil} Edit
          </button>
          <button id="dp-delete" class="btn btn-danger" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;">
            ${Icons.trash} Delete
          </button>
        </div>
      </div>

    </div>
  `

  // ── Element handles (all scoped to container to avoid ID collisions) ────────
  const q = <T extends HTMLElement = HTMLElement>(sel: string) => container.querySelector<T>(sel)!
  const elItemSearch   = q<HTMLInputElement>('#is-item-search')
  const elItemHidden   = q<HTMLInputElement>('#is-item')
  const elItemToggle   = q<HTMLButtonElement>('#is-item-toggle')
  const elItemDrop     = q('#is-item-dropdown')
  const elStockBadge   = q('#is-stock-badge')
  const elQty          = q<HTMLInputElement>('#is-qty')
  const elDisc         = q<HTMLInputElement>('#is-discount')
  const elDate         = q<HTMLInputElement>('#is-date')
  const elMonthPicker  = q<HTMLInputElement>('#is-month-picker')
  const elRemarks      = q<HTMLInputElement>('#is-remarks')
  const elPrice        = q('#is-price')
  const elTotal        = q('#is-total')
  const btnSave        = q<HTMLButtonElement>('#is-btn-save')
  const elSidebar      = q('#is-sidebar')
  const btnToggle      = q<HTMLButtonElement>('#is-btn-toggle-sidebar')
  const tbody          = q('#is-sales-tbody')
  const salesCounter   = q('#is-sales-counter')
  const btnRefresh     = q<HTMLButtonElement>('#is-btn-refresh-sales')
  const editBanner     = q('#is-edit-banner')
  const editNum        = q('#is-edit-num')
  const btnCancelEdit  = q<HTMLButtonElement>('#is-btn-cancel-edit')
  const formHeading    = q('#is-form-heading')
  const monthIndicator = q('#is-indicator-month')
  const detailPanel    = q('#is-detail-panel')
  const dpTitle        = q('#dp-title')
  const dpBody         = q('#dp-body')
  const dpClose        = q<HTMLButtonElement>('#dp-close')
  const dpEdit         = q<HTMLButtonElement>('#dp-edit')
  const dpDelete       = q<HTMLButtonElement>('#dp-delete')

  // ── Sidebar toggle ─────────────────────────────────────────────────────────
  btnToggle.addEventListener('click', () => elSidebar.classList.toggle('collapsed'))

  // ── Date Pickers ───────────────────────────────────────────────────────────
  flatpickr(elDate, { defaultDate: today, maxDate: 'today', dateFormat: 'Y-m-d' })

  flatpickr(elMonthPicker, {
    defaultDate: currentMonth,
    plugins: [monthSelectPlugin({ shorthand: true, dateFormat: 'Y-m', altFormat: 'F Y' })],
    onChange: (_: Date[], dateStr: string) => {
      if (!dateStr || dateStr === currentMonth) return
      currentMonth = dateStr
      monthIndicator.textContent = currentMonth
      closeDetailPanel()
      loadRecent()
    }
  })

  btnRefresh.addEventListener('click', () => {
    loadData()
    showToast('Reloaded.', 'info')
  })

  // ── Close panel when clicking outside it ──────────────────────────────────
  container.addEventListener('click', (e) => {
    if (!selectedSale) return                              // panel already closed
    if (detailPanel.contains(e.target as Node)) return    // click was inside panel
    closeDetailPanel()
  })

  // ── Detail Panel ───────────────────────────────────────────────────────────
  function openDetailPanel(sale: ItemSale): void {
    selectedSale = sale
    const net = sale.salesTotal ?? (sale.price * sale.qty - (sale.discount || 0))
    const gross = sale.price * sale.qty

    dpTitle.textContent = sale.item

    dpBody.innerHTML = `
      <div style="background:linear-gradient(135deg,rgba(14,165,233,0.08),rgba(99,102,241,0.06));border:1px solid var(--clr-border);border-radius:14px;padding:16px;text-align:center;">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--clr-text-muted);margin-bottom:6px">Net Total</div>
        <div style="font-size:28px;font-weight:900;color:var(--clr-primary);font-family:monospace;letter-spacing:-0.5px">₱${fmt(net)}</div>
        ${sale.discount && sale.discount > 0 ? `<div style="font-size:12px;color:var(--clr-error);margin-top:4px">Discount applied: -₱${fmt(sale.discount)}</div>` : ''}
      </div>

      <div style="display:flex;flex-direction:column;gap:0;border:1px solid var(--clr-border);border-radius:12px;overflow:hidden;">
        ${dpRow('Date', fmtDate(sale.date), Icons.calendar)}
        ${dpRow('Item / Product', sale.item, Icons.package)}
        ${sale.itemCode ? dpRow('Item Code', sale.itemCode, Icons.tag) : ''}
        ${dpRow('Category', sale.category || 'General', Icons.folder)}
        ${dpRow('Quantity', String(sale.qty), Icons.layers)}
        ${dpRow('Unit Price', `₱${fmt(sale.price)}`, Icons.dollar)}
        ${sale.discount && sale.discount > 0 ? dpRow('Discount', `-₱${fmt(sale.discount)}`, Icons.percent, true) : ''}
        ${dpRow('Gross Amount', `₱${fmt(gross)}`, Icons.trendingUp)}
        ${dpRow('Remarks / Buyer', sale.remarks || '—', Icons.messageSquare)}
      </div>
    `

    // Open panel
    detailPanel.style.transform = 'translateX(0)'
    detailPanel.style.marginRight = '0'

    // Highlight selected row
    tbody.querySelectorAll<HTMLTableRowElement>('tr').forEach(tr => {
      tr.style.background = ''
    })
    const sel = tbody.querySelector<HTMLTableRowElement>(`tr[data-sale-id="${sale.id || sale.rowNum}"]`)
    if (sel) sel.style.background = 'rgba(14,165,233,0.08)'
  }

  function dpRow(label: string, value: string, icon: string, danger = false): string {
    return `
      <div style="display:flex;align-items:center;gap:10px;padding:11px 14px;border-bottom:1px solid var(--clr-border-light);background:var(--clr-surface);">
        <span style="color:var(--clr-primary);display:inline-flex;opacity:0.7;flex-shrink:0">${icon}</span>
        <span style="font-size:12px;color:var(--clr-text-muted);flex-shrink:0;min-width:90px;">${label}</span>
        <span style="font-size:13px;font-weight:600;color:${danger ? 'var(--clr-error)' : 'var(--clr-text)'};flex:1;text-align:right;word-break:break-word;">${value}</span>
      </div>`
  }

  function closeDetailPanel(): void {
    selectedSale = null
    detailPanel.style.transform = 'translateX(100%)'
    detailPanel.style.marginRight = '-320px'
    tbody.querySelectorAll<HTMLTableRowElement>('tr').forEach(tr => {
      tr.style.background = ''
    })
  }

  dpClose.addEventListener('click', closeDetailPanel)

  dpEdit.addEventListener('click', () => {
    if (!selectedSale) return
    const saleToEdit = selectedSale  // capture before closeDetailPanel nullifies selectedSale
    const idx = monthSales.findIndex(s => (s.id && s.id === saleToEdit.id) || (s.rowNum && s.rowNum === saleToEdit.rowNum))
    closeDetailPanel()
    startEditSale(saleToEdit, idx >= 0 ? idx : 0)
  })

  dpDelete.addEventListener('click', () => {
    if (!selectedSale) return
    handleDeleteSale(selectedSale)
  })

  // ── Price Calculation ──────────────────────────────────────────────────────
  function calculateTotal(): void {
    const itemId = elItemHidden.dataset.itemId
    const itemCode = elItemHidden.value
    const itemName = elItemSearch.value.trim().toLowerCase()
    const inv = (itemId ? inventoryItems.find(i => i.id === itemId) : null) ||
                inventoryItems.find(i => i.description.toLowerCase() === itemName) ||
                (itemCode ? inventoryItems.find(i => i.itemCode && i.itemCode.toLowerCase() === itemCode.toLowerCase()) : null) ||
                inventoryItems.find(i => i.itemCode === itemCode || i.description === itemCode)

    if (!inv) {
      elPrice.textContent = '₱0.00'
      elTotal.textContent = '₱0.00'
      return
    }

    const qty   = Number(elQty.value) || 0
    const disc  = Number(elDisc.value) || 0
    const total = Math.max(0, inv.price * qty - disc)

    elPrice.textContent = `₱${fmt(inv.price)}`
    elTotal.textContent = `₱${fmt(total)}`
  }

  elQty.addEventListener('input', calculateTotal)
  elDisc.addEventListener('input', calculateTotal)

  function updateStockBadge(itemName: string): void {
    const st = stockItemsMap.get(itemName.toUpperCase().trim())
    if (!st) { elStockBadge.style.display = 'none'; return }
    elStockBadge.style.display = 'inline-block'
    if (st.status === 'out') {
      Object.assign(elStockBadge, { textContent: 'OUT OF STOCK' })
      Object.assign(elStockBadge.style, { background: 'rgba(239,68,68,.15)', color: '#ef4444' })
    } else if (st.status === 'low') {
      elStockBadge.textContent = `LOW · ${st.balance}`
      Object.assign(elStockBadge.style, { background: 'rgba(245,158,11,.15)', color: '#f59e0b' })
    } else {
      elStockBadge.textContent = `IN STOCK · ${st.balance}`
      Object.assign(elStockBadge.style, { background: 'rgba(16,185,129,.15)', color: '#10b981' })
    }
  }

  // ── Item Dropdown ──────────────────────────────────────────────────────────
  function setupItemDropdown(): void {
    function dot(name: string): string {
      const st = stockItemsMap.get(name.toUpperCase().trim())
      const color = !st ? 'var(--clr-border)' : st.status === 'out' ? '#ef4444' : st.status === 'low' ? '#f59e0b' : '#10b981'
      return `<span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0;display:inline-block"></span>`
    }

    function render(filter = ''): void {
      const q = filter.toLowerCase().trim()
      const list = q ? inventoryItems.filter(i => i.description.toLowerCase().includes(q) || (i.category||'').toLowerCase().includes(q)) : inventoryItems
      if (list.length === 0) {
        elItemDrop.innerHTML = `<div style="padding:16px;text-align:center;font-size:12px;color:var(--clr-text-muted)">No matching products</div>`
        elItemDrop.style.display = 'block'; return
      }
      elItemDrop.innerHTML = list.map(item => {
        const st = stockItemsMap.get(item.description.toUpperCase().trim())
        return `<div class="is-item-opt" data-id="${item.id || ''}" data-code="${item.itemCode || ''}" data-name="${item.description.replace(/"/g,'&quot;')}" data-price="${item.price}"
          style="padding:9px 12px;border-radius:10px;display:flex;align-items:center;gap:10px;cursor:pointer;transition:background .12s;${st?.status==='out'?'opacity:.55':''}">
          ${dot(item.description)}
          <div style="flex:1;min-width:0">
            <div style="font-size:13px;font-weight:600;color:var(--clr-text)">${item.description}</div>
            <div style="font-size:11px;color:var(--clr-text-muted);margin-top:2px">₱${fmt(item.price)}${item.itemCode ? ` · ${item.itemCode}` : ''}</div>
          </div>
        </div>`
      }).join('')
      elItemDrop.querySelectorAll<HTMLElement>('.is-item-opt').forEach(opt => {
        opt.addEventListener('mouseenter', () => opt.style.background = 'var(--clr-surface-2)')
        opt.addEventListener('mouseleave', () => opt.style.background = 'transparent')
        opt.addEventListener('mousedown', e => {
          e.preventDefault()
          elItemSearch.value = opt.dataset.name || ''
          elItemHidden.value = opt.dataset.code || ''
          if (opt.dataset.id) elItemHidden.dataset.itemId = opt.dataset.id
          else delete elItemHidden.dataset.itemId
          elItemDrop.style.display = 'none'
          updateStockBadge(opt.dataset.name || '')
          calculateTotal()
        })
      })
      elItemDrop.style.display = 'block'
    }

    elItemSearch.addEventListener('focus', () => render(elItemSearch.value))
    elItemSearch.addEventListener('blur', () => setTimeout(() => { elItemDrop.style.display = 'none' }, 150))
    elItemSearch.addEventListener('input', () => {
      const q = elItemSearch.value.trim().toLowerCase()
      const match = inventoryItems.find(i => i.description.toLowerCase() === q)
      if (match) {
        if (match.id) elItemHidden.dataset.itemId = match.id
        else delete elItemHidden.dataset.itemId
        elItemHidden.value = match.itemCode || ''
        updateStockBadge(match.description)
      } else {
        delete elItemHidden.dataset.itemId
        elItemHidden.value = ''
      }
      calculateTotal()
      render(elItemSearch.value)
    })
    elItemToggle.addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation()
      elItemDrop.style.display === 'block' ? elItemDrop.style.display = 'none' : (elItemSearch.focus(), render(''))
    })
    document.addEventListener('click', e => {
      if (!elItemDrop.contains(e.target as Node) && e.target !== elItemSearch && e.target !== elItemToggle)
        elItemDrop.style.display = 'none'
    })
  }

  // ── Buyer Dropdown ─────────────────────────────────────────────────────────
  function setupBuyerDropdown(inputEl: HTMLInputElement, toggleBtn: HTMLElement | null, dropdownEl: HTMLElement): void {
    function render(filter = ''): void {
      const q = filter.toLowerCase().trim()
      const list = q ? availableBuyers.filter(b => b.name.toLowerCase().includes(q)) : availableBuyers
      if (list.length === 0) {
        dropdownEl.innerHTML = `<div style="padding:10px 12px;font-size:12px;color:var(--clr-text-muted);text-align:center">No matching buyers. Type custom remarks.</div>`
        dropdownEl.style.display = 'block'; return
      }
      dropdownEl.innerHTML = list.map(b => `
        <div class="buyer-opt" data-id="${b.id}" data-name="${b.name}" style="padding:7px 10px;border-radius:8px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-size:13px;color:var(--clr-text);transition:background .15s">
          <span style="font-weight:600">${b.name}</span>
          ${b.isOwnShop ? '<span style="font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;background:var(--clr-primary-glow);color:var(--clr-primary)">Own Shop</span>' : ''}
        </div>`).join('')
      dropdownEl.querySelectorAll<HTMLElement>('.buyer-opt').forEach(item => {
        item.addEventListener('mouseenter', () => item.style.background = 'var(--clr-surface-2)')
        item.addEventListener('mouseleave', () => item.style.background = 'transparent')
        item.addEventListener('mousedown', e => {
          e.preventDefault()
          inputEl.value = item.dataset.name || ''
          inputEl.dataset.buyerId = item.dataset.id || ''
          dropdownEl.style.display = 'none'
        })
      })
      dropdownEl.style.display = 'block'
    }
    inputEl.addEventListener('focus', () => render(inputEl.value))
    inputEl.addEventListener('input', () => {
      const q = inputEl.value.trim().toLowerCase()
      const match = availableBuyers.find(b => b.name.toLowerCase() === q)
      if (match) {
        inputEl.dataset.buyerId = match.id
      } else {
        delete inputEl.dataset.buyerId
      }
      render(inputEl.value)
    })
    if (toggleBtn) {
      toggleBtn.addEventListener('click', e => {
        e.preventDefault(); e.stopPropagation()
        dropdownEl.style.display === 'block' ? dropdownEl.style.display = 'none' : (inputEl.focus(), render(''))
      })
    }
    document.addEventListener('click', e => {
      if (!dropdownEl.contains(e.target as Node) && e.target !== inputEl && e.target !== toggleBtn)
        dropdownEl.style.display = 'none'
    })
  }

  // ── Data Loading ───────────────────────────────────────────────────────────
  async function loadData(): Promise<void> {
    try {
      const [invRes, stockRes] = await Promise.all([window.api.listInventory(), window.api.stockDbGet()])

      if (stockRes.ok && stockRes.data) {
        if (stockRes.data.items?.length) {
          inventoryItems = stockRes.data.items.map(it => ({
            id: it.id,
            description: it.name,
            category: it.categoryId || 'CONTAINERS',
            itemCode: it.code || '',
            price: it.srp || 0
          }))
        } else if (invRes.ok) inventoryItems = invRes.data

        if (stockRes.data.buyers) availableBuyers = stockRes.data.buyers
        if ((stockRes.data as any).itemRows) {
          stockItemsMap.clear()
          for (const row of (stockRes.data as any).itemRows) {
            stockItemsMap.set((row.name || '').toUpperCase().trim(), {
              balance: row.qtyBalance ?? 0,
              status: row.status === 'out' ? 'out' : row.status === 'low' ? 'low' : 'in_stock'
            })
          }
        }
      } else if (invRes.ok) inventoryItems = invRes.data

      setupBuyerDropdown(elRemarks, container.querySelector('#is-remarks-toggle'), container.querySelector('#is-buyer-dropdown')!)
      setupItemDropdown()
      await loadRecent()
    } catch (e) {
      showToast('Failed to load products: ' + String(e), 'error')
    }
  }

  async function loadRecent(): Promise<void> {
    const res = await window.api.loadItemSalesMonth(currentMonth)
    if (res.ok) { monthSales = res.data; renderTable() }
    else showToast('Failed to load sales: ' + res.error, 'error')
  }

  // ── Render Table (simplified columns) ─────────────────────────────────────
  function renderTable(): void {
    salesCounter.textContent = `${monthSales.length} sale${monthSales.length === 1 ? '' : 's'}`

    if (monthSales.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5">
            <div class="empty-state" style="padding:48px 24px;">
              <div class="empty-state__icon">${Icons.shoppingCart}</div>
              <div class="empty-state__text">No item sales for ${currentMonth}. Add your first sale using the form on the left.</div>
            </div>
          </td>
        </tr>`
    } else {
      tbody.innerHTML = monthSales.map((sale, i) => {
        const net = sale.salesTotal ?? (sale.price * sale.qty - (sale.discount || 0))
        const saleKey = sale.id || sale.rowNum
        const isSelected = selectedSale && (selectedSale.id === sale.id || selectedSale.rowNum === sale.rowNum)
        return `
          <tr data-sale-id="${saleKey}" style="cursor:pointer;${isSelected ? 'background:rgba(14,165,233,0.08);' : ''}">
            <td class="td-sn">${i + 1}</td>
            <td style="font-size:13px;white-space:nowrap;">${sale.date}</td>
            <td>
              <div style="font-weight:600;color:var(--clr-text);">${sale.item}</div>
              ${sale.category ? `<div style="font-size:11px;color:var(--clr-text-muted);">${sale.category}</div>` : ''}
            </td>
            <td style="text-align:right;font-weight:700;font-family:monospace;">${sale.qty}</td>
            <td style="text-align:right;font-weight:800;font-family:monospace;color:var(--clr-primary);">₱${fmt(net)}</td>
          </tr>`
      }).join('')
    }

    // Update footer totals
    const totalRevenue  = monthSales.reduce((s, x) => s + (x.salesTotal ?? (x.price * x.qty - (x.discount || 0))), 0)
    const totalQty      = monthSales.reduce((s, x) => s + (x.qty || 0), 0)
    const totalDiscount = monthSales.reduce((s, x) => s + (x.discount || 0), 0)
    const el = (id: string) => document.getElementById(id)
    const r = el('rt-revenue'); if (r) r.textContent = `₱${fmt(totalRevenue)}`
    const c = el('rt-count');   if (c) c.textContent = monthSales.length > 0 ? `(${monthSales.length})` : ''
    const q = el('rt-qty');     if (q) q.textContent = String(totalQty)
    const d = el('rt-discount'); if (d) d.textContent = totalDiscount > 0 ? `-₱${fmt(totalDiscount)}` : '₱0.00'

    // Wire row click → detail panel (stopPropagation so container click-outside doesn't fire)
    tbody.querySelectorAll<HTMLTableRowElement>('tr[data-sale-id]').forEach(tr => {
      tr.addEventListener('click', (e) => {
        e.stopPropagation()
        const key = tr.dataset.saleId
        const sale = monthSales.find(s => String(s.id || s.rowNum) === key)
        if (sale) openDetailPanel(sale)
      })
    })
  }

  // ── Edit Mode ──────────────────────────────────────────────────────────────
  function startEditSale(sale: ItemSale, idx: number): void {
    editingSale = sale
    if (elSidebar.classList.contains('collapsed')) elSidebar.classList.remove('collapsed')

    elDate.value = sale.date || today
    elItemSearch.value = sale.item
    elItemHidden.value = sale.itemCode || ''
    if (sale.itemId) {
      elItemHidden.dataset.itemId = sale.itemId
    } else {
      const match = inventoryItems.find(i => i.description.toLowerCase() === sale.item.toLowerCase() || (sale.itemCode && i.itemCode && i.itemCode.toLowerCase() === sale.itemCode.toLowerCase()))
      if (match?.id) elItemHidden.dataset.itemId = match.id
      else delete elItemHidden.dataset.itemId
    }
    elQty.value = String(sale.qty || 1)
    elDisc.value = String(sale.discount || 0)
    elRemarks.value = sale.remarks || ''

    if (sale.buyerId) {
      elRemarks.dataset.buyerId = sale.buyerId
    } else {
      const match = availableBuyers.find(b => b.name.toLowerCase() === (sale.remarks || '').trim().toLowerCase())
      if (match) elRemarks.dataset.buyerId = match.id
      else delete elRemarks.dataset.buyerId
    }

    updateStockBadge(sale.item)
    calculateTotal()

    editBanner.classList.remove('hidden')
    editNum.textContent = `#${idx + 1}`
    formHeading.textContent = `Edit Sale #${idx + 1}`
    btnSave.innerHTML = `${Icons.check} Update Sale`
    btnSave.className = 'btn btn-success btn-lg'
    btnSave.style.cssText = 'width:100%;box-shadow:var(--shadow-md);display:flex;align-items:center;justify-content:center;gap:8px;'
  }

  function cancelEdit(): void {
    editingSale = null
    editBanner.classList.add('hidden')
    formHeading.textContent = 'New Sale'
    btnSave.innerHTML = `${Icons.plus} Add Sale`
    btnSave.className = 'btn btn-primary btn-lg'
    btnSave.style.cssText = 'width:100%;box-shadow:var(--shadow-md);display:flex;align-items:center;justify-content:center;gap:8px;'
    elItemSearch.value = ''; elItemHidden.value = ''
    delete elItemHidden.dataset.itemId
    elQty.value = '1'; elDisc.value = '0'; elRemarks.value = ''
    delete elRemarks.dataset.buyerId
    elStockBadge.style.display = 'none'
    calculateTotal()
    renderTable()
  }

  btnCancelEdit.addEventListener('click', cancelEdit)

  // ── Save / Update ──────────────────────────────────────────────────────────
  btnSave.addEventListener('click', async () => {
    const itemName = elItemSearch.value.trim()
    if (!itemName) { showToast('Please select or search for a product.', 'error'); return }

    const itemId = elItemHidden.dataset.itemId
    const itemCode = elItemHidden.value.trim()

    const item = (itemId ? inventoryItems.find(i => i.id === itemId) : null) ||
                 inventoryItems.find(i => i.description.toLowerCase() === itemName.toLowerCase()) ||
                 (itemCode ? inventoryItems.find(i => i.itemCode && i.itemCode.toLowerCase() === itemCode.toLowerCase()) : null) ||
                 inventoryItems.find(i => i.description.toLowerCase().includes(itemName.toLowerCase()))

    const qty  = Number(elQty.value) || 1
    const disc = Number(elDisc.value) || 0
    const price = item ? item.price : Number(elPrice.textContent?.replace(/[^0-9.]/g, '') || 0)

    if (qty < 1) { showToast('Quantity must be at least 1.', 'error'); return }

    const buyerId = elRemarks.dataset.buyerId || undefined
    const payload: ItemSale = {
      itemId: item?.id || itemId || undefined,
      item: item?.description ?? itemName,
      category: item?.category || 'CONTAINERS',
      itemCode: item?.itemCode || (itemCode && itemCode.toLowerCase() !== itemName.toLowerCase() ? itemCode : ''),
      price, qty, salesAmount: price * qty,
      discount: disc, salesTotal: Math.max(0, price * qty - disc),
      remarks: elRemarks.value.trim(),
      date: elDate.value || today,
      buyerId
    }

    btnSave.disabled = true
    showOverlay(editingSale ? 'Updating sale…' : 'Logging sale…')
    try {
      if (editingSale) {
        const rowIdOrNum = editingSale.id || editingSale.rowNum!
        const res = await window.api.updateItemSale(currentMonth, rowIdOrNum, { ...editingSale, ...payload })
        if (!res.ok) throw new Error(res.error)
        window.api.appendItemLog('ITEM_SALE_EDIT', `Updated: ${payload.item} x${payload.qty} @ ₱${payload.price}`)
        showToast('Sale updated!', 'success')
        cancelEdit()
      } else {
        const res = await window.api.saveItemSale(payload)
        if (!res.ok) throw new Error(res.error)
        const warning = (res as any).warning
        if (warning) showToast(warning, 'info', 6000)
        else showToast('Sale logged!', 'success')
        window.api.appendItemLog('ITEM_SALE_ADD', `Added: ${payload.date} | ${payload.item} x${payload.qty} | Net: ₱${payload.salesTotal}`)
        elQty.value = '1'; elDisc.value = '0'; elRemarks.value = ''
        delete elRemarks.dataset.buyerId
        elItemHidden.value = ''; elItemSearch.value = ''
        delete elItemHidden.dataset.itemId
        elStockBadge.style.display = 'none'
        calculateTotal()
      }
      await loadRecent()
    } catch (e: unknown) {
      showToast('Failed to save sale: ' + String(e), 'error', 5000)
    } finally {
      hideOverlay()
      btnSave.disabled = false
    }
  })

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function handleDeleteSale(sale: ItemSale): Promise<void> {
    const net = sale.salesTotal ?? (sale.price * sale.qty - (sale.discount || 0))
    const choice = await showModal({
      icon: Icons.trash, iconColor: 'danger',
      title: 'Delete Sale Entry',
      body: `Delete the sale of <strong>${sale.item} (x${sale.qty})</strong> on <strong>${sale.date}</strong> for <strong>₱${fmt(net)}</strong>?`,
      buttons: [
        { id: 'delete', label: 'Delete Sale', className: 'btn-danger' },
        { id: 'cancel', label: 'Cancel',      className: 'btn-ghost'  }
      ]
    })
    if (choice !== 'delete') return

    showOverlay('Deleting sale…')
    try {
      const rowIdOrNum = sale.id || sale.rowNum!
      const res = await window.api.deleteItemSale(currentMonth, rowIdOrNum)
      if (!res.ok) throw new Error(res.error)
      window.api.appendItemLog('ITEM_SALE_DELETE', `Deleted: ${sale.item} x${sale.qty} on ${sale.date}`)
      showToast('Sale deleted.', 'success')
      if (editingSale && (editingSale.id === sale.id || editingSale.rowNum === sale.rowNum)) cancelEdit()
      closeDetailPanel()
      await loadRecent()
    } catch (e: unknown) {
      showToast('Failed to delete: ' + String(e), 'error', 5000)
    } finally {
      hideOverlay()
    }
  }

  // Initial load
  loadData()
}
