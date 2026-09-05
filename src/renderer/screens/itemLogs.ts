import type { LogEntry } from '../../shared/types'
import { Icons } from '../components/icons'
import flatpickr from 'flatpickr'
import monthSelectPlugin from 'flatpickr/dist/plugins/monthSelect/index.js'
import 'flatpickr/dist/flatpickr.min.css'
import 'flatpickr/dist/plugins/monthSelect/style.css'

export function renderItemLogsScreen(container: HTMLElement): void {
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  container.innerHTML = `
    <style>
      .il-screen{display:flex;flex-direction:column;height:100%;padding:24px 32px;box-sizing:border-box;gap:18px;overflow:hidden;}
      .il-header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;}
      .il-title-wrap{display:flex;align-items:center;gap:12px;}
      .il-icon-box{width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,rgba(99,102,241,0.15),rgba(168,85,247,0.15));display:flex;align-items:center;justify-content:center;color:var(--clr-primary);flex-shrink:0;}
      .il-icon-box svg{width:22px;height:22px;}
      .il-title{margin:0;font-size:20px;font-weight:700;color:var(--clr-text);letter-spacing:-0.02em;}
      .il-subtitle{font-size:12px;color:var(--clr-text-muted);margin-top:2px;}

      .il-toolbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;}
      .il-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
      
      .il-date-wrap{height:36px;width:170px;position:relative;background:var(--clr-surface);border:1px solid var(--clr-border);border-radius:10px;transition:border-color 0.2s;}
      .il-date-wrap:focus-within{border-color:var(--clr-primary);}
      .il-date-input{background:transparent;border:none;outline:none;width:100%;height:100%;padding:0 12px 0 34px;font-family:var(--font);font-size:13px;font-weight:600;color:var(--clr-text);cursor:pointer;}
      .il-date-icon{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--clr-primary);pointer-events:none;display:flex;align-items:center;}
      .il-date-icon svg{width:16px;height:16px;}

      .il-select{height:36px;padding:0 12px;border:1px solid var(--clr-border);border-radius:10px;background:var(--clr-surface);color:var(--clr-text);font-size:13px;font-family:var(--font);outline:none;cursor:pointer;}
      .il-select:focus{border-color:var(--clr-primary);}

      .il-search-wrap{height:36px;width:240px;position:relative;background:var(--clr-surface);border:1px solid var(--clr-border);border-radius:10px;display:flex;align-items:center;}
      .il-search-wrap:focus-within{border-color:var(--clr-primary);}
      .il-search-input{background:transparent;border:none;outline:none;width:100%;height:100%;padding:0 12px;font-family:var(--font);font-size:13px;color:var(--clr-text);}
      
      .il-btn-refresh{width:36px;height:36px;border-radius:10px;border:1px solid var(--clr-border);background:var(--clr-surface);color:var(--clr-text-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s;}
      .il-btn-refresh:hover{background:var(--clr-surface-2);color:var(--clr-text);border-color:var(--clr-primary);}
      .il-btn-refresh.spinning svg{animation:il-spin 0.75s linear infinite;}
      @keyframes il-spin{100%{transform:rotate(360deg);}}

      .il-metrics{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
      .il-metric-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:8px;font-size:11px;font-weight:700;background:var(--clr-surface-2);border:1px solid var(--clr-border);color:var(--clr-text);}
      .il-metric-chip.add{background:rgba(16,185,129,0.08);color:#10b981;border-color:rgba(16,185,129,0.2);}
      .il-metric-chip.edit{background:rgba(245,158,11,0.08);color:#f59e0b;border-color:rgba(245,158,11,0.2);}
      .il-metric-chip.del{background:rgba(239,68,68,0.08);color:#ef4444;border-color:rgba(239,68,68,0.2);}

      .il-card{flex:1;background:var(--clr-surface);border:1px solid var(--clr-border);border-radius:16px;overflow:hidden;display:flex;flex-direction:column;box-shadow:var(--shadow-sm);}
      .il-scroll-wrap{flex:1;overflow-y:auto;position:relative;}
      .il-table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;}
      .il-table th{position:sticky;top:0;z-index:5;background:var(--clr-surface-2);border-bottom:2px solid var(--clr-border);padding:11px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--clr-text-muted);}
      .il-table td{padding:12px 16px;border-bottom:1px solid var(--clr-border-light, rgba(148,163,184,0.1));color:var(--clr-text);vertical-align:middle;}
      .il-table tr:hover td{background:var(--clr-surface-2);}

      .il-ts{font-family:monospace;font-size:12px;color:var(--clr-text-muted);white-space:nowrap;}
      .il-badge{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:0.02em;white-space:nowrap;}
      .il-badge-dot{width:6px;height:6px;border-radius:50%;}
      .il-badge-add{background:rgba(16,185,129,0.12);color:#10b981;border:1px solid rgba(16,185,129,0.25);}
      .il-badge-add .il-badge-dot{background:#10b981;}
      .il-badge-edit{background:rgba(245,158,11,0.12);color:#f59e0b;border:1px solid rgba(245,158,11,0.25);}
      .il-badge-edit .il-badge-dot{background:#f59e0b;}
      .il-badge-del{background:rgba(239,68,68,0.12);color:#ef4444;border:1px solid rgba(239,68,68,0.25);}
      .il-badge-del .il-badge-dot{background:#ef4444;}
      .il-badge-sys{background:rgba(100,116,139,0.12);color:#64748b;border:1px solid rgba(100,116,139,0.25);}
      .il-badge-sys .il-badge-dot{background:#64748b;}

      .il-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;gap:12px;color:var(--clr-text-muted);}
      .il-empty-icon{width:48px;height:48px;border-radius:50%;background:var(--clr-surface-2);display:flex;align-items:center;justify-content:center;color:var(--clr-text-muted);opacity:0.8;}
      .il-empty-title{font-size:15px;font-weight:700;color:var(--clr-text);}
      .il-empty-desc{font-size:12px;max-width:340px;line-height:1.5;}
    </style>

    <div class="il-screen fade-in">
      <div class="il-header">
        <div class="il-title-wrap">
          <div class="il-icon-box">
            ${Icons.package}
          </div>
          <div>
            <h1 class="il-title">Item Sales Audit Trail</h1>
            <div class="il-subtitle">Chronological raw audit records for item transactions, edits, and deletions</div>
          </div>
        </div>
      </div>

      <div class="il-toolbar">
        <div class="il-controls">
          <div class="il-date-wrap">
            <input type="text" id="il-month-input" class="il-date-input" readonly />
            <span class="il-date-icon">${Icons.calendar}</span>
          </div>
          <select id="il-action-filter" class="il-select">
            <option value="">All Actions</option>
            <option value="ITEM_SALE_ADD">Sales Added</option>
            <option value="ITEM_SALE_EDIT">Sales Modified</option>
            <option value="ITEM_SALE_DELETE">Sales Voided / Deleted</option>
          </select>
          <div class="il-search-wrap">
            <input type="text" id="il-search-input" class="il-search-input" placeholder="Search logs (e.g. product, SN, buyer)..." />
          </div>
          <button id="il-refresh-btn" class="il-btn-refresh" title="Reload Logs" aria-label="Reload Logs">
            ${Icons.refreshCw || '↻'}
          </button>
        </div>

        <div class="il-metrics" id="il-metrics-bar">
          <span class="il-metric-chip" id="il-metric-total">0 events</span>
          <span class="il-metric-chip add" id="il-metric-add">0 added</span>
          <span class="il-metric-chip edit" id="il-metric-edit">0 edited</span>
          <span class="il-metric-chip del" id="il-metric-del">0 deleted</span>
        </div>
      </div>

      <div class="il-card">
        <div class="il-scroll-wrap custom-scroll">
          <table class="il-table">
            <colgroup>
              <col style="width:190px;min-width:190px;">
              <col style="width:160px;min-width:160px;">
              <col style="width:auto;">
            </colgroup>
            <thead>
              <tr>
                <th>TIMESTAMP</th>
                <th>ACTION</th>
                <th>DETAILS & EVENT DATA</th>
              </tr>
            </thead>
            <tbody id="il-tbody">
              <!-- Rendered via JS -->
            </tbody>
          </table>
          <div id="il-empty-state" class="il-empty hidden">
            <div class="il-empty-icon">${Icons.package}</div>
            <div class="il-empty-title">No Item Logs Found</div>
            <div class="il-empty-desc">No item sale audit logs found for this period. Audit logs are automatically stored in your backup logs when items are sold, edited, or removed.</div>
          </div>
        </div>
      </div>
    </div>
  `

  const q = <T extends HTMLElement>(s: string) => container.querySelector(s) as T

  const monthInput   = q<HTMLInputElement>('#il-month-input')
  const actionFilter = q<HTMLSelectElement>('#il-action-filter')
  const searchInput  = q<HTMLInputElement>('#il-search-input')
  const refreshBtn   = q<HTMLButtonElement>('#il-refresh-btn')
  const tbody        = q<HTMLElement>('#il-tbody')
  const emptyState   = q<HTMLElement>('#il-empty-state')

  const metricTotal  = q<HTMLElement>('#il-metric-total')
  const metricAdd    = q<HTMLElement>('#il-metric-add')
  const metricEdit   = q<HTMLElement>('#il-metric-edit')
  const metricDel    = q<HTMLElement>('#il-metric-del')

  flatpickr(monthInput, {
    plugins: [
      monthSelectPlugin({
        shorthand: true,
        dateFormat: 'Y-m',
        altFormat: 'F Y',
      })
    ],
    defaultDate: currentMonth,
    disableMobile: true,
    onChange: () => loadLogs()
  })

  let allLogs: LogEntry[] = []

  function getActionBadge(action: string): string {
    switch (action) {
      case 'ITEM_SALE_ADD':
        return `<span class="il-badge il-badge-add"><span class="il-badge-dot"></span>SALE ADD</span>`
      case 'ITEM_SALE_EDIT':
        return `<span class="il-badge il-badge-edit"><span class="il-badge-dot"></span>SALE EDIT</span>`
      case 'ITEM_SALE_DELETE':
        return `<span class="il-badge il-badge-del"><span class="il-badge-dot"></span>SALE DELETE</span>`
      default:
        return `<span class="il-badge il-badge-sys"><span class="il-badge-dot"></span>${action}</span>`
    }
  }

  const renderTable = () => {
    const query = searchInput.value.trim().toLowerCase()
    const selectedFilter = actionFilter.value

    const filtered = allLogs.filter(log => {
      if (selectedFilter && log.action !== selectedFilter) return false
      if (query) {
        return (
          log.action.toLowerCase().includes(query) ||
          log.details.toLowerCase().includes(query) ||
          log.timestamp.toLowerCase().includes(query)
        )
      }
      return true
    })

    // Update metrics based on total allLogs for this month
    const totalCount = allLogs.length
    const addCount = allLogs.filter(l => l.action === 'ITEM_SALE_ADD').length
    const editCount = allLogs.filter(l => l.action === 'ITEM_SALE_EDIT').length
    const delCount = allLogs.filter(l => l.action === 'ITEM_SALE_DELETE').length

    metricTotal.textContent = `${totalCount} ${totalCount === 1 ? 'event' : 'events'}`
    metricAdd.textContent = `${addCount} added`
    metricEdit.textContent = `${editCount} edited`
    metricDel.textContent = `${delCount} deleted`

    if (filtered.length === 0) {
      tbody.innerHTML = ''
      emptyState.classList.remove('hidden')
    } else {
      emptyState.classList.add('hidden')
      tbody.innerHTML = filtered.map(log => `
        <tr>
          <td><span class="il-ts">${log.timestamp}</span></td>
          <td>${getActionBadge(log.action)}</td>
          <td style="line-height:1.5;">${log.details}</td>
        </tr>
      `).join('')
    }
  }

  const loadLogs = async () => {
    const month = monthInput.value
    if (!month) return

    refreshBtn.classList.add('spinning')
    refreshBtn.disabled = true
    tbody.innerHTML = `<tr><td colspan="3" style="padding:48px;text-align:center;"><div class="spinner" style="width:22px;height:22px;border-width:2px;margin:0 auto;"></div></td></tr>`
    emptyState.classList.add('hidden')

    try {
      const res = await window.api.readItemLog(month)
      if (res.ok) {
        allLogs = res.data
        renderTable()
      } else {
        tbody.innerHTML = ''
        emptyState.classList.remove('hidden')
        emptyState.querySelector('.il-empty-desc')!.textContent = 'Failed to load logs: ' + res.error
      }
    } catch (e: any) {
      tbody.innerHTML = ''
      emptyState.classList.remove('hidden')
      emptyState.querySelector('.il-empty-desc')!.textContent = 'Error loading logs: ' + (e?.message || e)
    } finally {
      refreshBtn.classList.remove('spinning')
      refreshBtn.disabled = false
    }
  }

  refreshBtn.addEventListener('click', loadLogs)
  searchInput.addEventListener('input', renderTable)
  actionFilter.addEventListener('change', renderTable)

  // Initial load
  loadLogs()
}

