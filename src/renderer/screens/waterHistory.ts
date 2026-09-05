import type { AppConfig, SaleRow, HistoryDay } from '../../shared/types'
import { showToast } from '../components/ui'
import { Icons } from '../components/icons'
import flatpickr from 'flatpickr'
import monthSelectPlugin from 'flatpickr/dist/plugins/monthSelect/index.js'
import 'flatpickr/dist/flatpickr.min.css'
import 'flatpickr/dist/plugins/monthSelect/style.css'

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']

function formatAmount(n: number): string {
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function friendlyDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return d.toLocaleDateString('en-PH', { weekday: 'short', year: 'numeric', month: 'long', day: 'numeric' })
}

function monthLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00')
  return `${MONTH_NAMES[d.getMonth()].toUpperCase()} ${d.getFullYear()}`
}

export function renderWaterHistoryScreen(
  container: HTMLElement,
  _config: AppConfig,
  _onNavigate: (screen: string) => void
): void {
  let allDays: HistoryDay[] = []
  let selectedDate: string | null = null
  let selectedRows: SaleRow[] = []

  const today = new Date()
  const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`
  let selectedMonth = currentMonthStr

  const q = <T extends Element>(sel: string) => container.querySelector<T>(sel)!

  container.innerHTML = `
    <style>
      .wh-layout {
        display: flex;
        flex-direction: column;
        flex: 1;
        overflow: hidden;
        height: 100%;
      }

      /* ── Top Action Bar ─────────────────────────────────────────── */
      .wh-topbar {
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
      .wh-topbar-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .wh-topbar-title {
        font-size: 15px;
        font-weight: 700;
        color: var(--clr-text);
        display: flex;
        align-items: center;
        gap: 8px;
        margin: 0;
      }
      .wh-topbar-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .wh-month-label {
        font-size: 12px;
        font-weight: 600;
        color: var(--clr-text-muted);
      }
      .wh-month-input {
        width: 140px;
        padding: 7px 12px;
        border: 1px solid var(--clr-border);
        border-radius: 8px;
        background: var(--clr-surface-2);
        color: var(--clr-text);
        font-size: 13px;
        font-weight: 600;
        text-align: center;
        cursor: pointer;
        font-family: var(--font);
        transition: border-color 0.15s;
      }
      .wh-month-input:focus {
        outline: none;
        border-color: var(--clr-primary);
      }
      .wh-body {
        display: flex;
        flex: 1;
        overflow: hidden;
      }

      /* ── Sidebar ─────────────────────────────────────────────── */
      .wh-sidebar {
        width: 300px;
        flex-shrink: 0;
        border-right: 1px solid var(--clr-border);
        background: var(--clr-surface);
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .wh-sidebar-header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 18px 20px 14px;
        border-bottom: 1px solid var(--clr-border);
        flex-shrink: 0;
      }
      .wh-sidebar-header h2 {
        margin: 0;
        font-size: 15px;
        font-weight: 700;
        color: var(--clr-text);
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .wh-sidebar-header h2 svg { width: 16px; height: 16px; }

      .wh-day-list {
        flex: 1;
        overflow-y: auto;
        padding: 6px 0;
      }
      .wh-month-label {
        padding: 12px 20px 4px;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.08em;
        color: var(--clr-text-muted);
        text-transform: uppercase;
        position: sticky;
        top: 0;
        background: var(--clr-surface);
        z-index: 1;
      }
      .wh-day-btn {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 10px 20px;
        background: none;
        border: none;
        cursor: pointer;
        text-align: left;
        transition: background 0.15s;
        gap: 8px;
        border-left: 3px solid transparent;
      }
      .wh-day-btn:hover { background: var(--clr-surface-2); }
      .wh-day-btn.active {
        background: var(--clr-primary-glow);
        border-left-color: var(--clr-primary);
      }
      .wh-day-btn--red { border-left-color: #ef4444 !important; }
      .wh-day-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        flex: 1;
        min-width: 0;
      }
      .wh-day-date {
        font-size: 13px;
        font-weight: 600;
        color: var(--clr-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .wh-day-btn--red .wh-day-date { color: #ef4444; }
      .wh-day-meta {
        font-size: 11px;
        color: var(--clr-text-muted);
      }
      .wh-day-amount {
        font-size: 13px;
        font-weight: 700;
        color: var(--clr-primary);
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }
      .wh-day-btn--red .wh-day-amount { color: var(--clr-text-muted); }

      .wh-holiday-badge {
        display: inline-block;
        font-size: 9px;
        font-weight: 700;
        padding: 1px 6px;
        border-radius: 10px;
        background: rgba(239,68,68,0.12);
        color: #ef4444;
        vertical-align: middle;
        margin-left: 6px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
      }

      /* ── Detail panel ────────────────────────────────────────── */
      .wh-detail {
        flex: 1;
        overflow-y: auto;
        padding: 28px 32px;
        display: flex;
        flex-direction: column;
        gap: 20px;
        background: var(--clr-bg);
      }
      .wh-detail-header h2 {
        display: flex;
        align-items: center;
        gap: 10px;
        font-size: 18px;
        font-weight: 700;
        color: var(--clr-text);
        margin: 0;
      }
      .wh-detail-header h2 svg { width: 18px; height: 18px; color: var(--clr-primary); }

      .wh-kpi-grid {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 12px;
        flex-shrink: 0;
      }
      .wh-kpi {
        background: var(--clr-surface);
        border: 1px solid var(--clr-border);
        border-radius: 14px;
        padding: 14px 18px;
        display: flex;
        flex-direction: column;
        gap: 6px;
        box-shadow: var(--shadow-sm);
      }
      .wh-kpi-label {
        font-size: 10px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--clr-text-muted);
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .wh-kpi-label svg { width: 14px; height: 14px; }
      .wh-kpi-value {
        font-size: 20px;
        font-weight: 800;
        color: var(--clr-text);
        font-variant-numeric: tabular-nums;
      }
      .wh-kpi--pickup .wh-kpi-value { color: var(--clr-pickup); }
      .wh-kpi--deliver .wh-kpi-value { color: var(--clr-deliver); }

      .wh-table-wrap {
        background: var(--clr-surface);
        border: 1px solid var(--clr-border);
        border-radius: 16px;
        overflow: hidden;
        box-shadow: var(--shadow-sm);
        flex: 1;
      }
      .wh-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      .wh-table thead th {
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
      .wh-table tbody td {
        padding: 10px 16px;
        border-bottom: 1px solid var(--clr-border-light, rgba(148,163,184,0.08));
        color: var(--clr-text);
      }
      .wh-table tbody tr:last-child td { border-bottom: none; }
      .wh-table tbody tr:hover td { background: var(--clr-surface-2); }

      .wh-mode-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        font-weight: 700;
        padding: 3px 8px;
        border-radius: 6px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .wh-mode-badge svg { width: 12px; height: 12px; }
      .wh-mode-badge--pickup {
        background: rgba(16,185,129,0.1);
        color: var(--clr-pickup, #10b981);
      }
      .wh-mode-badge--deliver {
        background: rgba(59,130,246,0.1);
        color: var(--clr-deliver, #3b82f6);
      }

      .wh-empty {
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
      .wh-empty svg { width: 40px; height: 40px; opacity: 0.25; }
      .wh-empty h3 { font-size: 16px; font-weight: 700; color: var(--clr-text); margin: 0; }
      .wh-empty p  { font-size: 13px; margin: 0; max-width: 320px; line-height: 1.5; }

      .wh-spinner-wrap {
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

    <div class="wh-layout">
      <!-- Top Action Bar -->
      <div class="wh-topbar">
        <div class="wh-topbar-left">
          <h2 class="wh-topbar-title">${Icons.droplets} Water Sales History</h2>
        </div>
        <div class="wh-topbar-actions">
          <span class="wh-month-label">Month</span>
          <input type="text" class="wh-month-input" data-el="month-input" />
          <button class="btn btn-primary btn-sm" data-el="export-btn" style="gap:6px;display:flex;align-items:center;">
            ${Icons.fileSheet} Export XLSX
          </button>
        </div>
      </div>

      <!-- Body -->
      <div class="wh-body">
        <!-- Sidebar -->
        <aside class="wh-sidebar">
          <div class="wh-day-list" data-el="day-list">
            <div class="wh-spinner-wrap">
              <div class="spinner" style="width:20px;height:20px;border-width:2px"></div>
              <span>Loading history...</span>
            </div>
          </div>
        </aside>

        <!-- Detail Panel -->
        <main class="wh-detail" data-el="detail">
          <div class="wh-empty">
            ${Icons.history}
            <h3>Select a day to view details</h3>
            <p>Click any date on the left to see that day's water sales breakdown.</p>
          </div>
        </main>
      </div>
    </div>
  `

  const elMonth = q<HTMLInputElement>('[data-el="month-input"]')
  const elExportBtn = q<HTMLButtonElement>('[data-el="export-btn"]')

  flatpickr(elMonth, {
    defaultDate: today,
    plugins: [monthSelectPlugin({ shorthand: true, dateFormat: 'Y-m', altFormat: 'F Y' })],
    onChange: (_: Date[], dateStr: string) => {
      selectedMonth = dateStr
      selectedDate = null
      renderDayList()
      const detailEl = q<HTMLDivElement>('[data-el="detail"]')
      if (detailEl) {
        detailEl.innerHTML = `
          <div class="wh-empty">
            ${Icons.history}
            <h3>Select a day to view details</h3>
            <p>Click any date on the left to see that day's water sales breakdown.</p>
          </div>`
      }
    }
  })

  elExportBtn.addEventListener('click', async () => {
    const origHtml = elExportBtn.innerHTML
    elExportBtn.setAttribute('disabled', 'true')
    elExportBtn.innerHTML = `<div class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;margin-right:6px"></div> Exporting…`
    try {
      const res = await window.api.exportDailyLog(selectedMonth)
      if (res.ok && res.data) {
        showToast('Daily Log (.xlsx) exported successfully ✓', 'success')
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

  loadData()

  // ── Load data ─────────────────────────────────────────────────────────────
  async function loadData(): Promise<void> {
    const histResult = await window.api.listHistory()
    if (histResult.ok) allDays = histResult.data
    renderDayList()
  }

  // ── Day list (grouped by month) ───────────────────────────────────────────
  function renderDayList(): void {
    const el = q<HTMLDivElement>('[data-el="day-list"]')

    const filteredDays = selectedMonth
      ? allDays.filter(day => day.date.startsWith(selectedMonth))
      : allDays

    if (filteredDays.length === 0) {
      el.innerHTML = `
        <div class="wh-empty" style="padding:32px 16px">
          ${Icons.fileSheet}
          <span>No saved logs found for this month</span>
        </div>`
      return
    }

    const grouped = new Map<string, HistoryDay[]>()
    for (const day of filteredDays) {
      const key = monthLabel(day.date)
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(day)
    }

    let html = ''
    for (const [month, days] of grouped) {
      html += `<div class="wh-month-label">${month}</div>`
      for (const day of days) {
        const active = day.date === selectedDate ? ' active' : ''
        const red = day.isRed ? ' wh-day-btn--red' : ''
        html += `
          <button class="wh-day-btn${active}${red}" data-date="${day.date}">
            <div class="wh-day-info">
              <span class="wh-day-date">${friendlyDate(day.date)}${day.isRed ? ' <span class="wh-holiday-badge">Sunday / Holiday</span>' : ''}</span>
              <span class="wh-day-meta">${day.rowCount > 0 ? `${day.rowCount} item${day.rowCount !== 1 ? 's' : ''}` : 'No sales'}</span>
            </div>
            <span class="wh-day-amount">${day.rowCount > 0 ? `₱${formatAmount(day.totalAmount)}` : '—'}</span>
          </button>`
      }
    }
    el.innerHTML = html

    el.querySelectorAll<HTMLButtonElement>('.wh-day-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        selectDay(btn.dataset.date!)
      })
    })
  }

  // ── Select day ────────────────────────────────────────────────────────────
  async function selectDay(date: string): Promise<void> {
    selectedDate = date
    renderDayList()

    const detailEl = q<HTMLDivElement>('[data-el="detail"]')
    detailEl.innerHTML = `<div class="wh-spinner-wrap"><div class="spinner" style="width:28px;height:28px;border-width:3px"></div><p>Loading...</p></div>`

    const result = await window.api.loadHistoryDay(date)
    if (!result.ok) {
      detailEl.innerHTML = `<div class="wh-empty">${Icons.xCircle}<p style="color:var(--clr-error)">${result.error}</p></div>`
      return
    }
    selectedRows = result.data
    const dayInfo = allDays.find(d => d.date === date)
    renderDetail(date, selectedRows, dayInfo?.isRed ?? false)
  }

  // ── Detail panel ──────────────────────────────────────────────────────────
  function renderDetail(date: string, rows: SaleRow[], isRed = false): void {
    const detailEl = q<HTMLDivElement>('[data-el="detail"]')

    if (rows.length === 0) {
      const msg = isRed
        ? '<h3>Sunday / Holiday</h3><p>This day is marked as a rest day — no sales were recorded.</p>'
        : '<h3>No data for this day</h3>'
      detailEl.innerHTML = `<div class="wh-empty">${Icons.calendar}${msg}</div>`
      return
    }

    const totalQty     = rows.reduce((s, r) => s + r.qty, 0)
    const totalAmt     = rows.reduce((s, r) => s + r.qty * r.price, 0)
    const pickupCount  = rows.filter(r => r.mode === 'PICKUP').length
    const deliverCount = rows.filter(r => r.mode === 'DELIVER').length

    const tableRows = rows.map(r => `
      <tr>
        <td style="text-align:center;font-family:monospace;color:var(--clr-text-muted)">${r.sn}</td>
        <td style="font-weight:600">${r.container}</td>
        <td>${r.water || '<span style="color:var(--clr-text-muted)">—</span>'}</td>
        <td style="text-align:center;font-weight:700;font-family:monospace">${r.qty}</td>
        <td>
          <span class="wh-mode-badge wh-mode-badge--${r.mode === 'PICKUP' ? 'pickup' : 'deliver'}">
            ${r.mode === 'PICKUP' ? Icons.shoppingBag : Icons.truck}
            ${r.mode}
          </span>
        </td>
        <td style="text-align:right;font-family:monospace;color:var(--clr-text-muted)">₱${formatAmount(r.price)}</td>
        <td style="text-align:right;font-weight:700;font-family:monospace;color:var(--clr-primary)">₱${formatAmount(r.qty * r.price)}</td>
      </tr>`).join('')

    detailEl.innerHTML = `
      <div class="wh-detail-header">
        <h2>${Icons.calendar} ${friendlyDate(date)}</h2>
      </div>

      <div class="wh-kpi-grid">
        <div class="wh-kpi">
          <span class="wh-kpi-label">Total Sales</span>
          <span class="wh-kpi-value">₱${formatAmount(totalAmt)}</span>
        </div>
        <div class="wh-kpi">
          <span class="wh-kpi-label">Items Sold</span>
          <span class="wh-kpi-value">${totalQty}</span>
        </div>
        <div class="wh-kpi wh-kpi--pickup">
          <span class="wh-kpi-label">${Icons.shoppingBag} Pick Up</span>
          <span class="wh-kpi-value">${pickupCount} row${pickupCount !== 1 ? 's' : ''}</span>
        </div>
        <div class="wh-kpi wh-kpi--deliver">
          <span class="wh-kpi-label">${Icons.truck} Deliver</span>
          <span class="wh-kpi-value">${deliverCount} row${deliverCount !== 1 ? 's' : ''}</span>
        </div>
      </div>

      <div class="wh-table-wrap">
        <table class="wh-table">
          <thead>
            <tr>
              <th style="width:40px;text-align:center">#</th>
              <th>Container</th>
              <th>Water</th>
              <th style="text-align:center">Qty</th>
              <th>Mode</th>
              <th style="text-align:right">Unit Price</th>
              <th style="text-align:right">Amount</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>`
  }
}
