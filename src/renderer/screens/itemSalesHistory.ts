import type { AppConfig, ItemSale } from '../../shared/types'
import { showToast } from '../components/ui'
import { Icons } from '../components/icons'
import flatpickr from 'flatpickr'
import monthSelectPlugin from 'flatpickr/dist/plugins/monthSelect/index.js'
import 'flatpickr/dist/flatpickr.min.css'
import 'flatpickr/dist/plugins/monthSelect/style.css'

function fmt(n: number): string {
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function friendlyDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
}

export function renderItemSalesHistoryScreen(container: HTMLElement, _config: AppConfig): void {
  let sales: ItemSale[] = []
  let selectedDate: string | null = null

  const today = new Date()
  const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  let selectedMonth = currentMonthStr

  const q = <T extends Element>(sel: string) => container.querySelector<T>(sel)!

  container.innerHTML = `
    <style>
      .ish-layout {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }

      /* ── Top Bar ─────────────────────────────────────────────── */
      .ish-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 24px;
        background: var(--clr-surface);
        border-bottom: 1px solid var(--clr-border);
        flex-shrink: 0;
        gap: 16px;
        flex-wrap: wrap;
      }
      .ish-topbar-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .ish-topbar-title {
        font-size: 15px;
        font-weight: 700;
        color: var(--clr-text);
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0;
      }
      .ish-topbar-title svg {
        width: 16px;
        height: 16px;
        color: var(--clr-primary);
      }
      .ish-topbar-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .ish-month-label {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--clr-text-muted);
      }
      .ish-month-input {
        padding: 7px 14px;
        border-radius: 10px;
        border: 1px solid var(--clr-border);
        background: var(--clr-surface-2);
        color: var(--clr-text);
        font-size: 13px;
        font-weight: 600;
        font-family: var(--font);
        cursor: pointer;
        width: 130px;
        text-align: center;
        transition: border-color 0.2s;
      }
      .ish-month-input:focus {
        outline: none;
        border-color: var(--clr-primary);
      }

      /* ── Body Split Layout ──────────────────────────────────── */
      .ish-body {
        display: flex;
        flex: 1;
        overflow: hidden;
      }

      /* ── Sidebar ─────────────────────────────────────────────── */
      .ish-sidebar {
        width: 300px;
        flex-shrink: 0;
        border-right: 1px solid var(--clr-border);
        background: var(--clr-surface);
        overflow-y: auto;
        display: flex;
        flex-direction: column;
      }
      .ish-day-list {
        padding: 8px;
        flex: 1;
      }
      .ish-day-btn {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 10px 12px;
        border: none;
        border-radius: 10px;
        cursor: pointer;
        background: transparent;
        margin-bottom: 4px;
        transition: background 0.15s, transform 0.1s;
        text-align: left;
      }
      .ish-day-btn:hover {
        background: var(--clr-surface-2);
      }
      .ish-day-btn.active {
        background: var(--clr-primary-glow);
      }
      .ish-day-btn-inner {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }
      .ish-day-badge {
        width: 38px;
        height: 38px;
        border-radius: 10px;
        background: var(--clr-surface-2);
        border: 1px solid var(--clr-border);
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        transition: background 0.15s;
      }
      .ish-day-btn.active .ish-day-badge {
        background: var(--clr-primary);
        border-color: var(--clr-primary);
      }
      .ish-day-badge-name {
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        color: var(--clr-text-muted);
        line-height: 1;
      }
      .ish-day-btn.active .ish-day-badge-name {
        color: rgba(255, 255, 255, 0.85);
      }
      .ish-day-badge-num {
        font-size: 16px;
        font-weight: 800;
        color: var(--clr-text);
        line-height: 1.1;
      }
      .ish-day-btn.active .ish-day-badge-num {
        color: #ffffff;
      }
      .ish-day-meta {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .ish-day-count {
        font-size: 13px;
        font-weight: 700;
        color: var(--clr-text);
      }
      .ish-day-btn.active .ish-day-count {
        color: var(--clr-primary);
      }
      .ish-day-total {
        font-size: 12px;
        color: var(--clr-text-muted);
        font-family: monospace;
      }

      /* ── Detail Panel ────────────────────────────────────────── */
      .ish-detail {
        flex: 1;
        overflow-y: auto;
        padding: 28px 32px;
        background: var(--clr-bg);
        display: flex;
        flex-direction: column;
        gap: 20px;
      }
      .ish-detail-header h2 {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 18px;
        font-weight: 700;
        color: var(--clr-text);
        margin: 0;
      }
      .ish-detail-header h2 svg {
        width: 18px;
        height: 18px;
        color: var(--clr-primary);
      }

      .ish-kpi-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
        flex-shrink: 0;
      }
      .ish-kpi {
        background: var(--clr-surface);
        border: 1px solid var(--clr-border);
        border-radius: 14px;
        padding: 14px 18px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        box-shadow: var(--shadow-sm);
      }
      .ish-kpi-label {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--clr-text-muted);
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .ish-kpi-label svg {
        width: 14px;
        height: 14px;
      }
      .ish-kpi-value {
        font-size: 20px;
        font-weight: 800;
        color: var(--clr-text);
        font-variant-numeric: tabular-nums;
      }
      .ish-kpi--net {
        background: linear-gradient(135deg, var(--clr-primary), var(--clr-primary-dim, #0284c7));
        border-color: transparent;
      }
      .ish-kpi--net .ish-kpi-label {
        color: rgba(255, 255, 255, 0.8);
      }
      .ish-kpi--net .ish-kpi-value {
        color: #ffffff;
      }
      .ish-kpi--discount .ish-kpi-value {
        color: var(--clr-error, #ef4444);
      }

      .ish-table-wrap {
        background: var(--clr-surface);
        border: 1px solid var(--clr-border);
        border-radius: 16px;
        overflow: hidden;
        box-shadow: var(--shadow-sm);
      }
      .ish-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      .ish-table thead th {
        background: var(--clr-surface-2);
        padding: 10px 16px;
        text-align: left;
        font-size: 10px;
        font-weight: 700;
        color: var(--clr-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        border-bottom: 1px solid var(--clr-border);
      }
      .ish-table tbody td {
        padding: 12px 16px;
        border-bottom: 1px solid var(--clr-border-light, rgba(148,163,184,0.08));
        color: var(--clr-text);
      }
      .ish-table tbody tr:last-child td {
        border-bottom: none;
      }
      .ish-table tbody tr:hover td {
        background: var(--clr-surface-2);
      }

      .ish-empty {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 80px 20px;
        gap: 12px;
        color: var(--clr-text-muted);
        text-align: center;
      }
      .ish-empty svg {
        width: 40px;
        height: 40px;
        opacity: 0.25;
      }
      .ish-empty h3 {
        font-size: 16px;
        font-weight: 700;
        color: var(--clr-text);
        margin: 0;
      }
      .ish-empty p {
        font-size: 13px;
        margin: 0;
        max-width: 320px;
        line-height: 1.5;
      }

      .ish-spinner-wrap {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 48px;
        gap: 12px;
        color: var(--clr-text-muted);
        font-size: 13px;
      }
    </style>

    <div class="ish-layout">
      <!-- Top Action Bar -->
      <div class="ish-topbar">
        <div class="ish-topbar-left">
          <h2 class="ish-topbar-title">${Icons.shoppingCart} Item Sales History</h2>
        </div>
        <div class="ish-topbar-actions">
          <span class="ish-month-label">Month</span>
          <input type="text" class="ish-month-input" data-el="month-input" />
          <button class="btn btn-primary btn-sm" data-el="export-btn" style="gap:6px;display:flex;align-items:center;">
            ${Icons.fileSheet} Export XLSX
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="ish-body">
        <!-- Sidebar -->
        <aside class="ish-sidebar custom-scroll">
          <div class="ish-day-list" data-el="day-list"></div>
        </aside>

        <!-- Detail Panel -->
        <main class="ish-detail custom-scroll" data-el="detail">
          <div class="ish-empty">
            ${Icons.history}
            <h3>Select a day to view item sales</h3>
            <p>Click any calendar date on the left to inspect item transactions and revenue breakdown.</p>
          </div>
        </main>
      </div>
    </div>
  `

  const elMonth = q<HTMLInputElement>('[data-el="month-input"]')
  const elDayList = q<HTMLDivElement>('[data-el="day-list"]')
  const elDetail = q<HTMLDivElement>('[data-el="detail"]')
  const elExportBtn = q<HTMLButtonElement>('[data-el="export-btn"]')

  elExportBtn.addEventListener('click', async () => {
    const origHtml = elExportBtn.innerHTML
    elExportBtn.setAttribute('disabled', 'true')
    elExportBtn.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;margin-right:6px"></div> Exporting…`
    try {
      const res = await window.api.exportSalesReport(selectedMonth)
      if (res.ok && res.data) {
        showToast('Sales Report exported successfully ✓', 'success')
      } else if (!res.ok) {
        showToast('Export failed: ' + res.error, 'error')
      }
    } catch (e) {
      showToast('Export error: ' + String(e), 'error')
    } finally {
      elExportBtn.removeAttribute('disabled')
      elExportBtn.innerHTML = origHtml
    }
  })

  flatpickr(elMonth, {
    defaultDate: today,
    plugins: [monthSelectPlugin({ shorthand: true, dateFormat: 'Y-m', altFormat: 'F Y' })],
    onChange: (_: Date[], dateStr: string) => {
      selectedMonth = dateStr
      loadData()
    }
  })

  async function loadData() {
    elDayList.innerHTML = `<div class="ish-spinner-wrap"><div class="spinner" style="width:20px;height:20px;border-width:2px"></div></div>`
    elDetail.innerHTML = `<div class="ish-spinner-wrap"><div class="spinner" style="width:28px;height:28px;border-width:3px"></div></div>`
    try {
      const res = await window.api.loadItemSalesMonth(selectedMonth)
      sales = res.ok ? res.data : []
    } catch {
      sales = []
    }
    selectedDate = null
    renderDayList()
    elDetail.innerHTML = `
      <div class="ish-empty">
        ${Icons.history}
        <h3>Select a day to view item sales</h3>
        <p>Click any calendar date on the left to inspect item transactions and revenue breakdown.</p>
      </div>`
  }

  function renderDayList() {
    if (sales.length === 0) {
      elDayList.innerHTML = `
        <div class="ish-empty" style="padding:40px 16px">
          ${Icons.fileSheet}
          <p>No item sales recorded for this month.</p>
        </div>`
      return
    }

    const byDate = new Map<string, ItemSale[]>()
    for (const s of sales) {
      if (!byDate.has(s.date)) byDate.set(s.date, [])
      byDate.get(s.date)!.push(s)
    }

    let html = ''
    for (const [date, items] of [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const dayTotal = items.reduce((sum, s) => sum + (s.salesTotal || 0), 0)
      const isActive = selectedDate === date
      const d = new Date(date + 'T00:00:00')
      const dayNum = d.getDate()
      const dayName = d.toLocaleDateString('en-PH', { weekday: 'short' })

      html += `
        <button class="ish-day-btn${isActive ? ' active' : ''}" data-date="${date}">
          <div class="ish-day-btn-inner">
            <div class="ish-day-badge">
              <span class="ish-day-badge-name">${dayName}</span>
              <span class="ish-day-badge-num">${dayNum}</span>
            </div>
            <div class="ish-day-meta">
              <span class="ish-day-count">${items.length} sale${items.length !== 1 ? 's' : ''}</span>
              <span class="ish-day-total">₱${fmt(dayTotal)}</span>
            </div>
          </div>
        </button>`
    }
    elDayList.innerHTML = html

    elDayList.querySelectorAll<HTMLButtonElement>('.ish-day-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectedDate = btn.dataset.date!
        renderDayList()
        renderDayDetail(selectedDate)
      })
    })
  }

  function renderDayDetail(date: string) {
    const items = sales.filter(s => s.date === date)
    const gross = items.reduce((sum, s) => sum + (s.salesAmount || 0), 0)
    const discTotal = items.reduce((sum, s) => sum + (s.discount || 0), 0)
    const net = items.reduce((sum, s) => sum + (s.salesTotal || 0), 0)
    const totalQty = items.reduce((sum, s) => sum + (s.qty || 0), 0)

    const rows = items.map(s => `
      <tr>
        <td style="font-weight:600">${s.item}</td>
        <td style="color:var(--clr-text-muted);font-size:12px">${s.category || '—'}</td>
        <td style="text-align:center;font-weight:700;font-family:monospace">${s.qty}</td>
        <td style="text-align:right;font-family:monospace;color:var(--clr-text-muted)">₱${fmt(s.price)}</td>
        <td style="text-align:right;font-family:monospace;color:${s.discount ? 'var(--clr-error)' : 'var(--clr-text-muted)'}">${s.discount ? '-₱' + fmt(s.discount) : '—'}</td>
        <td style="text-align:right;font-weight:700;font-family:monospace;color:var(--clr-primary)">₱${fmt(s.salesTotal)}</td>
      </tr>`).join('')

    elDetail.innerHTML = `
      <div class="ish-detail-header">
        <h2>${Icons.calendar} ${friendlyDate(date)}</h2>
      </div>

      <div class="ish-kpi-grid">
        <div class="ish-kpi">
          <span class="ish-kpi-label">Gross Amount</span>
          <span class="ish-kpi-value">₱${fmt(gross)}</span>
        </div>
        <div class="ish-kpi ish-kpi--discount">
          <span class="ish-kpi-label">Discounts</span>
          <span class="ish-kpi-value">${discTotal > 0 ? '-₱' + fmt(discTotal) : '₱0.00'}</span>
        </div>
        <div class="ish-kpi ish-kpi--net">
          <span class="ish-kpi-label">Net Total</span>
          <span class="ish-kpi-value">₱${fmt(net)}</span>
        </div>
        <div class="ish-kpi">
          <span class="ish-kpi-label">Items Sold</span>
          <span class="ish-kpi-value">${totalQty}</span>
        </div>
      </div>

      <div class="ish-table-wrap">
        <table class="ish-table">
          <thead>
            <tr>
              <th>Item</th>
              <th>Category</th>
              <th style="text-align:center">Qty</th>
              <th style="text-align:right">Price</th>
              <th style="text-align:right">Discount</th>
              <th style="text-align:right">Net Total</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
  }

  loadData()
}
