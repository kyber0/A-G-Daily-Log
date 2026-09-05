import type { LogEntry } from '../../shared/types'
import { Icons } from '../components/icons'
import flatpickr from 'flatpickr'
import monthSelectPlugin from 'flatpickr/dist/plugins/monthSelect/index.js'
import 'flatpickr/dist/flatpickr.min.css'
import 'flatpickr/dist/plugins/monthSelect/style.css'

export function renderWaterLogsScreen(container: HTMLElement): void {
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  container.innerHTML = `
    <style>
      .wl-screen{display:flex;flex-direction:column;height:100%;padding:24px 32px;box-sizing:border-box;gap:18px;overflow:hidden;}
      .wl-header{display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;}
      .wl-title-wrap{display:flex;align-items:center;gap:12px;}
      .wl-icon-box{width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,rgba(59,130,246,0.15),rgba(14,165,233,0.15));display:flex;align-items:center;justify-content:center;color:var(--clr-primary);flex-shrink:0;}
      .wl-icon-box svg{width:22px;height:22px;}
      .wl-title{margin:0;font-size:20px;font-weight:700;color:var(--clr-text);letter-spacing:-0.02em;}
      .wl-subtitle{font-size:12px;color:var(--clr-text-muted);margin-top:2px;}

      .wl-toolbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;}
      .wl-controls{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}
      
      .wl-date-wrap{height:36px;width:170px;position:relative;background:var(--clr-surface);border:1px solid var(--clr-border);border-radius:10px;transition:border-color 0.2s;}
      .wl-date-wrap:focus-within{border-color:var(--clr-primary);}
      .wl-date-input{background:transparent;border:none;outline:none;width:100%;height:100%;padding:0 12px 0 34px;font-family:var(--font);font-size:13px;font-weight:600;color:var(--clr-text);cursor:pointer;}
      .wl-date-icon{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--clr-primary);pointer-events:none;display:flex;align-items:center;}
      .wl-date-icon svg{width:16px;height:16px;}

      .wl-select{height:36px;padding:0 12px;border:1px solid var(--clr-border);border-radius:10px;background:var(--clr-surface);color:var(--clr-text);font-size:13px;font-family:var(--font);outline:none;cursor:pointer;}
      .wl-select:focus{border-color:var(--clr-primary);}

      .wl-search-wrap{height:36px;width:240px;position:relative;background:var(--clr-surface);border:1px solid var(--clr-border);border-radius:10px;display:flex;align-items:center;}
      .wl-search-wrap:focus-within{border-color:var(--clr-primary);}
      .wl-search-input{background:transparent;border:none;outline:none;width:100%;height:100%;padding:0 12px;font-family:var(--font);font-size:13px;color:var(--clr-text);}
      
      .wl-btn-refresh{width:36px;height:36px;border-radius:10px;border:1px solid var(--clr-border);background:var(--clr-surface);color:var(--clr-text-muted);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.2s;}
      .wl-btn-refresh:hover{background:var(--clr-surface-2);color:var(--clr-text);border-color:var(--clr-primary);}
      .wl-btn-refresh.spinning svg{animation:wl-spin 0.75s linear infinite;}
      @keyframes wl-spin{100%{transform:rotate(360deg);}}

      .wl-metrics{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
      .wl-metric-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:8px;font-size:11px;font-weight:700;background:var(--clr-surface-2);border:1px solid var(--clr-border);color:var(--clr-text);}
      .wl-metric-chip.add{background:rgba(16,185,129,0.08);color:#10b981;border-color:rgba(16,185,129,0.2);}
      .wl-metric-chip.edit{background:rgba(245,158,11,0.08);color:#f59e0b;border-color:rgba(245,158,11,0.2);}
      .wl-metric-chip.del{background:rgba(239,68,68,0.08);color:#ef4444;border-color:rgba(239,68,68,0.2);}

      .wl-card{flex:1;background:var(--clr-surface);border:1px solid var(--clr-border);border-radius:16px;overflow:hidden;display:flex;flex-direction:column;box-shadow:var(--shadow-sm);}
      .wl-scroll-wrap{flex:1;overflow-y:auto;position:relative;}
      .wl-table{width:100%;border-collapse:separate;border-spacing:0;font-size:13px;}
      .wl-table th{position:sticky;top:0;z-index:5;background:var(--clr-surface-2);border-bottom:2px solid var(--clr-border);padding:11px 16px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--clr-text-muted);}
      .wl-table td{padding:12px 16px;border-bottom:1px solid var(--clr-border-light, rgba(148,163,184,0.1));color:var(--clr-text);vertical-align:middle;}
      .wl-table tr:hover td{background:var(--clr-surface-2);}

      .wl-ts{font-family:monospace;font-size:12px;color:var(--clr-text-muted);white-space:nowrap;}
      .wl-badge{display:inline-flex;align-items:center;gap:6px;padding:3px 9px;border-radius:6px;font-size:11px;font-weight:700;letter-spacing:0.02em;white-space:nowrap;}
      .wl-badge-dot{width:6px;height:6px;border-radius:50%;}
      .wl-badge-add{background:rgba(16,185,129,0.12);color:#10b981;border:1px solid rgba(16,185,129,0.25);}
      .wl-badge-add .wl-badge-dot{background:#10b981;}
      .wl-badge-edit{background:rgba(245,158,11,0.12);color:#f59e0b;border:1px solid rgba(245,158,11,0.25);}
      .wl-badge-edit .wl-badge-dot{background:#f59e0b;}
      .wl-badge-del{background:rgba(239,68,68,0.12);color:#ef4444;border:1px solid rgba(239,68,68,0.25);}
      .wl-badge-del .wl-badge-dot{background:#ef4444;}
      .wl-badge-close{background:rgba(168,85,247,0.12);color:#a855f7;border:1px solid rgba(168,85,247,0.25);}
      .wl-badge-close .wl-badge-dot{background:#a855f7;}
      .wl-badge-sys{background:rgba(100,116,139,0.12);color:#64748b;border:1px solid rgba(100,116,139,0.25);}
      .wl-badge-sys .wl-badge-dot{background:#64748b;}

      .wl-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;gap:12px;color:var(--clr-text-muted);}
      .wl-empty-icon{width:48px;height:48px;border-radius:50%;background:var(--clr-surface-2);display:flex;align-items:center;justify-content:center;color:var(--clr-text-muted);opacity:0.8;}
      .wl-empty-title{font-size:15px;font-weight:700;color:var(--clr-text);}
      .wl-empty-desc{font-size:12px;max-width:320px;line-height:1.5;}
    </style>

    <div class="wl-screen fade-in">
      <div class="wl-header">
        <div class="wl-title-wrap">
          <div class="wl-icon-box">
            ${Icons.droplets}
          </div>
          <div>
            <h1 class="wl-title">Water Audit Trail</h1>
            <div class="wl-subtitle">Chronological raw event records for water sales, day closes, edits, and deletions</div>
          </div>
        </div>
      </div>

      <div class="wl-toolbar">
        <div class="wl-controls">
          <div class="wl-date-wrap">
            <input type="text" id="wl-month-input" class="wl-date-input" readonly />
            <span class="wl-date-icon">${Icons.calendar}</span>
          </div>
          <select id="wl-action-filter" class="wl-select">
            <option value="">All Actions</option>
            <option value="ADD_SALE">Sales Added</option>
            <option value="EDIT_SALE">Sales Modified</option>
            <option value="DELETE_SALE">Sales Deleted</option>
            <option value="MARK_CLOSED">Day Closed</option>
            <option value="REOPEN_DAY">Day Reopened</option>
            <option value="AUTO_SAVE,SAVE_DAY">System Saves</option>
          </select>
          <div class="wl-search-wrap">
            <input type="text" id="wl-search-input" class="wl-search-input" placeholder="Search logs (e.g. invoice, item, user)..." />
          </div>
          <button id="wl-refresh-btn" class="wl-btn-refresh" title="Reload Logs" aria-label="Reload Logs">
            ${Icons.refreshCw || '↻'}
          </button>
        </div>

        <div class="wl-metrics" id="wl-metrics-bar">
          <span class="wl-metric-chip" id="wl-metric-total">0 events</span>
          <span class="wl-metric-chip add" id="wl-metric-add">0 added</span>
          <span class="wl-metric-chip edit" id="wl-metric-edit">0 edited</span>
          <span class="wl-metric-chip del" id="wl-metric-del">0 deleted</span>
        </div>
      </div>

      <div class="wl-card">
        <div class="wl-scroll-wrap custom-scroll">
          <table class="wl-table">
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
            <tbody id="wl-tbody">
              <!-- Rendered via JS -->
            </tbody>
          </table>
          <div id="wl-empty-state" class="wl-empty hidden">
            <div class="wl-empty-icon">${Icons.clipboardList}</div>
            <div class="wl-empty-title">No Log Entries Found</div>
            <div class="wl-empty-desc">There are no matching audit log events recorded for the selected month or search query.</div>
          </div>
        </div>
      </div>
    </div>
  `

  const q = <T extends HTMLElement>(s: string) => container.querySelector(s) as T

  const monthInput   = q<HTMLInputElement>('#wl-month-input')
  const actionFilter = q<HTMLSelectElement>('#wl-action-filter')
  const searchInput  = q<HTMLInputElement>('#wl-search-input')
  const refreshBtn   = q<HTMLButtonElement>('#wl-refresh-btn')
  const tbody        = q<HTMLElement>('#wl-tbody')
  const emptyState   = q<HTMLElement>('#wl-empty-state')

  const metricTotal  = q<HTMLElement>('#wl-metric-total')
  const metricAdd    = q<HTMLElement>('#wl-metric-add')
  const metricEdit   = q<HTMLElement>('#wl-metric-edit')
  const metricDel    = q<HTMLElement>('#wl-metric-del')

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
    onChange: () => {
      loadLogs()
    }
  })

  let allLogs: LogEntry[] = []

  function getActionBadge(action: string): string {
    switch (action) {
      case 'ADD_SALE':
        return `<span class="wl-badge wl-badge-add"><span class="wl-badge-dot"></span>ADD SALE</span>`
      case 'EDIT_SALE':
        return `<span class="wl-badge wl-badge-edit"><span class="wl-badge-dot"></span>EDIT SALE</span>`
      case 'DELETE_SALE':
        return `<span class="wl-badge wl-badge-del"><span class="wl-badge-dot"></span>DELETE SALE</span>`
      case 'MARK_CLOSED':
        return `<span class="wl-badge wl-badge-close"><span class="wl-badge-dot"></span>CLOSED DAY</span>`
      case 'REOPEN_DAY':
        return `<span class="wl-badge wl-badge-close"><span class="wl-badge-dot"></span>REOPENED</span>`
      case 'SAVE_DAY':
      case 'AUTO_SAVE':
        return `<span class="wl-badge wl-badge-sys"><span class="wl-badge-dot"></span>AUTO SAVE</span>`
      default:
        return `<span class="wl-badge wl-badge-sys"><span class="wl-badge-dot"></span>${action}</span>`
    }
  }

  const renderTable = () => {
    const query = searchInput.value.trim().toLowerCase()
    const selectedFilter = actionFilter.value

    const filtered = allLogs.filter(log => {
      if (selectedFilter) {
        const allowed = selectedFilter.split(',')
        if (!allowed.includes(log.action)) return false
      }
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
    const addCount = allLogs.filter(l => l.action === 'ADD_SALE').length
    const editCount = allLogs.filter(l => l.action === 'EDIT_SALE').length
    const delCount = allLogs.filter(l => l.action === 'DELETE_SALE').length

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
          <td><span class="wl-ts">${log.timestamp}</span></td>
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
      const res = await window.api.readLogs(month)
      if (res.ok) {
        allLogs = res.data
        renderTable()
      } else {
        tbody.innerHTML = ''
        emptyState.classList.remove('hidden')
        emptyState.querySelector('.wl-empty-desc')!.textContent = 'Failed to load logs: ' + res.error
      }
    } catch (e: any) {
      tbody.innerHTML = ''
      emptyState.classList.remove('hidden')
      emptyState.querySelector('.wl-empty-desc')!.textContent = 'Error loading logs: ' + (e?.message || e)
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

