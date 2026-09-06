import type { AppConfig, SaleRow, SaleMode, ExpenseEntry } from '../../shared/types'
import { showToast, showOverlay, hideOverlay, showModal } from '../components/ui'
import { Icons } from '../components/icons'
import { openDailyExpensesModal } from '../components/dailyExpensesModal'
import flatpickr from 'flatpickr'
import 'flatpickr/dist/flatpickr.min.css'

const MAX_ROWS = 30

// Month abbreviations for file indicator
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC']

// Debounce timer for draft autosave
let draftTimer: ReturnType<typeof setTimeout> | null = null

// Auto-save interval handle — cleared on re-render to prevent duplicates
let autoSaveIntervalId: ReturnType<typeof setInterval> | null = null

/** Format a number as Philippine-style currency */
function formatAmount(n: number): string {
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** Get today's date as YYYY-MM-DD */
function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

/** Derive file/sheet indicator text from date string */
function getIndicator(date: string): { file: string; sheet: string } {
  const d = new Date(date + 'T00:00:00')
  const monthIndex = d.getMonth()
  const mon  = MONTHS[monthIndex]
  const year = d.getFullYear()
  const day  = String(d.getDate()).padStart(2, '0')
  const monthNumStr = String(monthIndex + 1).padStart(2, '0')
  return {
    file:  `${monthNumStr}. DAILY LOG (${mon})-${year}.xlsx`,
    sheet: `${mon}${day}`,
  }
}

/** Look up price from config price table */
function lookupPrice(config: AppConfig, container: string, water: string, mode: SaleMode): number {
  const entry = config.priceTable.find(p =>
    p.container === container &&
    p.water === water
  )
  if (!entry) return 0
  return mode === 'PICKUP' ? entry.pickup : entry.deliver
}

export function renderEntryScreen(
  container: HTMLElement,
  config: AppConfig,
  onNavigate: (screen: string) => void
): void {
  // ── State ──────────────────────────────────────────────────────────────────
  let currentDate = todayISO()
  let rows: SaleRow[] = []
  let dayExpenses: ExpenseEntry[] = []
  let editingIndex: number | null = null
  let currentMode: SaleMode = 'PICKUP'
  let isClosed = false
  let closureReason = ''
  let lastAutoSaveDate = ''
  let isPastDayLocked = currentDate < todayISO()

  // ── Auto-save at 6:30 PM ──────────────────────────────────────────────────
  // Clear any previous interval (guard against re-renders creating duplicates)
  if (autoSaveIntervalId !== null) {
    clearInterval(autoSaveIntervalId)
    autoSaveIntervalId = null
  }
  autoSaveIntervalId = setInterval(async () => {
    const now = new Date()
    if (now.getHours() === 18 && now.getMinutes() === 30) {
      const todayStr = now.toISOString().split('T')[0]
      if (lastAutoSaveDate !== todayStr && !isClosed && rows.length > 0) {
        lastAutoSaveDate = todayStr
        const { sheet } = getIndicator(currentDate)
        showToast(`Auto-saving ${sheet} at 6:30 PM...`, 'info')
        await window.api.saveDay(currentDate, rows)
        await window.api.clearDraft(currentDate)
        window.api.appendLog('AUTO_SAVE', `Auto-saved day ${currentDate} (${rows.length} rows)`)
      }
    }
  }, 60000)

  // ── DOM ───────────────────────────────────────────────────────────────────
  container.innerHTML = buildHTML(config)
  bindEvents()
  refreshContainerDropdown()
  refreshTable()
  updateIndicator()
  checkForDraft()
  loadDayStatus()

  // ── HTML builder ──────────────────────────────────────────────────────────
  function buildHTML(cfg: AppConfig): string {
    const containerOptionItems = cfg.containerTypes
      .map(ct => `<div class="combo-option" data-value="${ct.name}">${ct.name}</div>`)
      .join('')
    const waterOptions = cfg.waterTypes
      .map(wt => `<option value="${wt}">${wt}</option>`)
      .join('')

    return `
      <!-- Top bar -->
      <div class="topbar">
        <button class="btn btn-ghost btn-icon" id="btn-toggle-sidebar" data-tooltip="Toggle Panel" aria-label="Toggle Panel" style="margin-right: 8px;">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
        </button>
        <div class="topbar__date-wrap">
          <input type="text" id="date-picker" value="${currentDate}" placeholder="Select Date..." readonly style="background-color:transparent" />
          <span class="date-icon">${Icons.calendar}</span>
        </div>
        <div class="file-indicator">
          <span class="file-indicator__name" id="indicator-file"></span>
          <span class="file-indicator__arrow">→</span>
          <span class="file-indicator__sheet" id="indicator-sheet"></span>
        </div>
        <button class="btn btn-ghost btn-icon" id="btn-refresh" data-tooltip="Reload today's data" aria-label="Reload today's data">
          ${Icons.refreshCw}
        </button>
        <div class="topbar__spacer"></div>
        <div class="row-counter-wrap" style="display:flex;align-items:center;gap:6px;">
          <div class="row-counter" id="row-counter">0 / 30 rows</div>
          <!-- 3-dots kebab menu -->
          <div class="day-menu-wrap" id="day-menu-wrap" style="position:relative;">
            <button class="btn btn-ghost btn-icon" id="btn-day-menu" aria-label="Day options" style="width:32px;height:32px;padding:0;display:flex;align-items:center;justify-content:center;border-radius:8px;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>
            </button>
            <div id="day-menu-dropdown" class="day-menu-dropdown hidden" style="
              position:absolute;right:0;top:calc(100% + 4px);z-index:999;
              background:var(--clr-surface);border:1px solid var(--clr-border);
              border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.25);
              min-width:200px;padding:6px;
            ">
              <button class="day-menu-item" id="btn-daily-expenses">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
                Expenses
                <span id="badge-expenses-count" style="display:none;background:rgba(239,68,68,0.15);color:#ef4444;font-size:11px;padding:1px 6px;border-radius:8px;font-weight:700;margin-left:auto;">0</span>
              </button>
              <button class="day-menu-item" id="btn-export-day">
                ${Icons.download}
                Export Daily Log
              </button>
              <div style="height:1px;background:var(--clr-border);margin:4px 0;"></div>
              <button class="day-menu-item day-menu-item--danger" id="btn-mark-closed">
                ${Icons.xCircle} Mark as Closed
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Closed day banner (hidden by default) -->
      <div id="closed-day-banner" class="closed-day-banner hidden">
        <span id="sunday-indicator" class="sunday-indicator hidden">🗓️ Sunday</span>
        <span id="closed-day-reason"></span>
      </div>

      <!-- Main layout -->
      <div class="entry-layout">

        <!-- Left sidebar: form -->
        <aside class="entry-sidebar">
          <div class="entry-sidebar__inner">
            <h3 style="color:var(--clr-text-muted);font-size:11px;text-transform:uppercase;letter-spacing:.07em">New Sale</h3>

            <!-- Container -->
            <div class="field">
              <label for="sel-container">Container Type</label>
              <div class="combo-wrap" id="combo-container-wrap">
                <input type="text" id="sel-container" placeholder="Choose or type..." autocomplete="off" />
                <button type="button" id="combo-container-btn" class="combo-arrow" tabindex="-1" aria-label="Show options">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div class="combo-dropdown hidden" id="combo-container-list">
                  ${containerOptionItems}
                </div>
              </div>
            </div>

            <!-- Water Type (conditionally shown) -->
            <div class="field" id="water-field">
              <label for="sel-water">Water Type</label>
              <select id="sel-water">${waterOptions}</select>
            </div>

            <!-- Quantity -->
            <div class="field">
              <label for="inp-qty">Quantity</label>
              <div class="qty-stepper">
                <button type="button" class="btn-step" id="btn-qty-minus">-</button>
                <input type="number" id="inp-qty" value="1" min="1" max="9999" class="monospace" />
                <button type="button" class="btn-step" id="btn-qty-plus">+</button>
              </div>
              <div id="qty-hint" class="field-hint hidden"></div>
            </div>

            <!-- Mode toggle -->
            <div class="field">
              <label>Mode</label>
              <div class="mode-toggle">
                <button class="mode-toggle__btn active-pickup" id="btn-pickup" data-mode="PICKUP">
                  ${Icons.shoppingBag} Pick Up
                </button>
                <button class="mode-toggle__btn" id="btn-deliver" data-mode="DELIVER">
                  ${Icons.truck} Deliver
                </button>
              </div>
            </div>

            <!-- Price -->
            <div class="field">
              <label for="inp-price">Price <span style="font-weight:400;font-size:11px;text-transform:none">(auto-filled, editable)</span></label>
              <input type="number" id="inp-price" placeholder="0.00" min="0" step="any" />
            </div>

            <div class="divider"></div>

            <!-- Edit mode indicator -->
            <div id="edit-banner" class="hidden" style="
              padding:8px 12px;
              background:rgba(245,158,11,0.1);
              border:1px solid rgba(245,158,11,0.3);
              border-radius:var(--radius-sm);
              font-size:13px;
              color:var(--clr-deliver);
              display:flex;align-items:center;gap:8px;
            ">
              <span style="display:flex;align-items:center">${Icons.pencil}</span> <span>Editing row <strong id="edit-row-num"></strong></span>
              <button id="btn-cancel-edit" class="btn btn-ghost btn-sm" style="margin-left:auto">Cancel</button>
            </div>
          </div>

          <div class="entry-sidebar__footer">
            <button id="btn-add" class="btn btn-primary" style="width:100%">
              ${Icons.plus} Add Sale
            </button>
          </div>
        </aside>

        <!-- Right: table -->
        <div class="entry-main" style="position:relative;">
          
          <!-- Closed day overlay — shown over the table when day is marked closed -->
          <div id="closed-table-overlay" class="closed-table-overlay hidden">
            <div class="closed-table-overlay__inner">
              <span id="overlay-sunday-indicator" class="sunday-indicator hidden" style="margin-bottom: 16px; display: inline-flex;">🗓️ Sunday</span>
              <span style="font-size:48px; margin-bottom: 12px; display: block;">🔴</span>
              <p style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:var(--clr-error); opacity:0.7; margin-bottom:8px;">Day Closed</p>
              <strong id="closed-overlay-reason" style="font-size:22px; font-weight:700; color:var(--clr-text); margin-bottom: 20px; display: block;">Closed</strong>
              <p style="color:var(--clr-text-muted); margin-bottom: 24px; font-size:13px;">No new sales can be added. You can reopen this day if needed.</p>
              <button id="btn-reopen-day" class="btn btn-secondary btn-lg" style="margin: 0 auto; display: flex; align-items: center; gap: 8px;">
                ${Icons.checkCircle} Reopen Day
              </button>
            </div>
          </div>

          <!-- Past day overlay — shown when viewing a past day -->
          <div id="past-day-overlay" class="closed-table-overlay hidden" style="background: rgba(15, 23, 42, 0.1); backdrop-filter: blur(12px);">
            <div class="closed-table-overlay__inner" style="border-top: 4px solid var(--clr-primary);">
              <span style="font-size:48px; margin-bottom: 12px; display: block;">⏳</span>
              <p style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.08em; color:var(--clr-primary); opacity:0.8; margin-bottom:8px;">Past Day</p>
              <strong style="font-size:22px; font-weight:700; color:var(--clr-text); margin-bottom: 20px; display: block;">Viewing History</strong>
              <p style="color:var(--clr-text-muted); margin-bottom: 24px; font-size:13px;">This day is in the past. It is locked to prevent accidental changes.</p>
              <button id="btn-unlock-past" class="btn btn-primary btn-lg" style="margin: 0 auto; display: flex; align-items: center; gap: 8px;">
                ${Icons.pencil} Unlock for Editing
              </button>
            </div>
          </div>

          <div class="table-wrap">
            <table class="sales-table" id="sales-table">
              <thead>
                <tr>
                  <th style="width:44px">#</th>
                  <th>Container</th>
                  <th>Water</th>
                  <th class="td-qty">Qty</th>
                  <th>Mode</th>
                  <th class="td-price">Price</th>
                  <th class="td-total">Total</th>
                  <th class="td-actions"></th>
                </tr>
              </thead>
              <tbody id="sales-tbody"></tbody>
            </table>
          </div>
          <div class="table-footer" style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:16px;">
            <div style="display:flex;align-items:center;gap:24px;">
              <div class="running-total">
                <span class="running-total__label">Water Sales</span>
                <span class="running-total__amount" id="running-total">₱0.00</span>
                <span class="running-total__qty" id="running-qty"></span>
              </div>
              <div class="running-total" style="cursor:pointer;" id="footer-expenses-wrap" title="Click to manage expenses">
                <span class="running-total__label" style="color:#ef4444;">Expenses</span>
                <span class="running-total__amount" id="running-expenses" style="color:#ef4444;">₱0.00</span>
                <span class="running-total__qty" id="running-expenses-count" style="color:var(--clr-text-muted);"></span>
              </div>
              <div class="running-total">
                <span class="running-total__label" style="color:#10b981;">Net Cash Flow</span>
                <span class="running-total__amount" id="running-net" style="color:#10b981;font-weight:800;">₱0.00</span>
              </div>
            </div>
            <div id="sync-status" style="font-size:12px;color:var(--clr-text-muted);display:flex;align-items:center;gap:6px;">
              <span style="display:inline-flex;align-items:center;gap:5px;color:var(--clr-text-muted);">${Icons.check} Auto-saved</span>
            </div>
          </div>
        </div>
      </div>
    `
  }

  // ── Events ────────────────────────────────────────────────────────────────
  function bindEvents(): void {
    const datePicker = document.getElementById('date-picker') as HTMLInputElement
    
    /** Hides the extra last row in flatpickr when all 7 cells are nextMonthDay placeholders */
    function trimExtraFpRow(fp: any): void {
      if (!fp?.calendarContainer) return
      const days = Array.from<HTMLElement>(fp.calendarContainer.querySelectorAll('.flatpickr-day'))
      // Reset any previous hiding
      days.forEach(d => (d.style.display = ''))
      // If the final 7 cells are all next-month padding, collapse that row
      const last7 = days.slice(-7)
      if (last7.length === 7 && last7.every(d => d.classList.contains('nextMonthDay'))) {
        last7.forEach(d => (d.style.display = 'none'))
      }
    }

    flatpickr(datePicker, {
      defaultDate: currentDate,
      maxDate: "today",
      dateFormat: "Y-m-d",
      disableMobile: true, // Prevents falling back to native picker on mobile view
      onReady:      (_, __, fp) => trimExtraFpRow(fp),
      onMonthChange:(_, __, fp) => trimExtraFpRow(fp),
      onYearChange: (_, __, fp) => trimExtraFpRow(fp),
      onChange: (selectedDates, dateStr) => {
        if (!dateStr || dateStr === currentDate) return
        
        // Immediately save any pending draft for the old date before switching
        if (draftTimer) {
          clearTimeout(draftTimer)
          draftTimer = null
          window.api.saveDraft(currentDate, rows)
        }

        currentDate = dateStr
        isPastDayLocked = currentDate < todayISO()
        updateIndicator()
        rows = []
        dayExpenses = []
        refreshTable()
        checkForDraft()
        loadDayStatus()
      }
    })

    document.getElementById('btn-refresh')!.addEventListener('click', () => {
      rows = []
      dayExpenses = []
      refreshTable()
      loadExistingDay()
      showToast('Reloaded from database', 'success')
    })

    // ── Custom Container Combobox ─────────────────────────────────────────────
    const comboInput   = document.getElementById('sel-container')  as HTMLInputElement
    const comboBtn     = document.getElementById('combo-container-btn')!
    const comboList    = document.getElementById('combo-container-list')!

    function openCombo(): void {
      comboList.classList.remove('hidden')
    }
    function closeCombo(): void {
      comboList.classList.add('hidden')
    }
    function isComboOpen(): boolean {
      return !comboList.classList.contains('hidden')
    }

    // Arrow button: toggle open/close, but prevent focus event from also triggering
    comboBtn.addEventListener('mousedown', (e) => {
      e.preventDefault() // prevent input from losing focus / gaining focus unexpectedly
      isComboOpen() ? closeCombo() : openCombo()
    })

    // Input click: always open
    comboInput.addEventListener('click', () => openCombo())

    comboInput.addEventListener('input', () => {
      refreshWaterVisibility()
      autofillPrice()
    })

    // Selecting an option — use mousedown so blur doesn't close before we read the value
    comboList.addEventListener('mousedown', (e) => {
      e.preventDefault()
      const target = (e.target as HTMLElement).closest('.combo-option') as HTMLElement | null
      if (!target) return
      comboInput.value = target.dataset.value ?? ''
      closeCombo()
      refreshWaterVisibility()
      autofillPrice()
    })

    // Close when focus leaves the input
    comboInput.addEventListener('blur', () => {
      setTimeout(() => closeCombo(), 150)
    })

    document.getElementById('sel-water')!.addEventListener('change', () => {
      autofillPrice()
    })

    document.getElementById('inp-qty')!.addEventListener('input', () => {
      autofillPrice()
    })

    document.getElementById('btn-qty-minus')!.addEventListener('click', () => {
      const inp = document.getElementById('inp-qty') as HTMLInputElement
      const val = parseInt(inp.value, 10) || 1
      if (val > 1) {
        inp.value = String(val - 1)
        inp.dispatchEvent(new Event('input'))
      }
    })

    document.getElementById('btn-qty-plus')!.addEventListener('click', () => {
      const inp = document.getElementById('inp-qty') as HTMLInputElement
      const val = parseInt(inp.value, 10) || 0
      inp.value = String(val + 1)
      inp.dispatchEvent(new Event('input'))
    })

    document.getElementById('btn-pickup')!.addEventListener('click', () => setMode('PICKUP'))
    document.getElementById('btn-deliver')!.addEventListener('click', () => setMode('DELIVER'))

    document.getElementById('btn-add')!.addEventListener('click', () => handleAdd())
    document.getElementById('btn-cancel-edit')!.addEventListener('click', () => cancelEdit())

    // Initial autofill
    autofillPrice()

    // ── Toggle Sidebar ───────────────────────────────────────────────────────
    document.getElementById('btn-toggle-sidebar')!.addEventListener('click', () => {
      const sidebar = document.querySelector('.entry-sidebar')
      if (sidebar) sidebar.classList.toggle('collapsed')
    })

    // ── Daily Expenses Buttons ─────────────────────────────────────────────────
    function openExpensesModal() {
      openDailyExpensesModal(currentDate, dayExpenses, (saved) => {
        dayExpenses = saved
        refreshExpenseTotals()
      })
    }

    document.getElementById('btn-daily-expenses')!.addEventListener('click', (e) => {
      e.stopPropagation()
      closeMenu()
      openExpensesModal()
    })
    document.getElementById('footer-expenses-wrap')!.addEventListener('click', openExpensesModal)

    // ── Mark as Closed / Past Day Unlock ──────────────────────────────────────
    document.getElementById('btn-mark-closed')!.addEventListener('click', (e) => {
      e.stopPropagation()
      closeMenu()
      handleToggleClosedDay()
    })
    document.getElementById('btn-unlock-past')!.addEventListener('click', () => {
      isPastDayLocked = false
      updateClosedBanner()
      showToast('Day unlocked for editing.', 'info')
    })

    // ── 3-dots kebab menu toggle ───────────────────────────────────────────────
    function closeMenu() {
      document.getElementById('day-menu-dropdown')?.classList.add('hidden')
    }

    document.getElementById('btn-day-menu')!.addEventListener('click', (e) => {
      e.stopPropagation()
      const dropdown = document.getElementById('day-menu-dropdown')!
      dropdown.classList.toggle('hidden')
    })

    document.addEventListener('click', (e) => {
      const wrap = document.getElementById('day-menu-wrap')
      if (wrap && !wrap.contains(e.target as Node)) closeMenu()
    }, true)

    // ── Export Daily Log from kebab menu ──────────────────────────────────────
    document.getElementById('btn-export-day')!.addEventListener('click', async (e) => {
      e.stopPropagation()
      closeMenu()
      const monthStr = currentDate.substring(0, 7)
      const btn = document.getElementById('btn-export-day') as HTMLButtonElement
      const origHtml = btn.innerHTML
      btn.innerHTML = `<span class="spinner" style="width:14px;height:14px"></span> Exporting…`
      btn.disabled = true
      try {
        const res = await window.api.exportDailyLog(monthStr)
        if (res && res.ok && res.data) {
          showToast('Daily Log exported successfully!', 'success')
          const choice = await showModal({
            icon: Icons.checkCircle,
            iconColor: 'success',
            title: 'Export Complete',
            body: `File saved:<br><code style="font-size:12px;color:var(--clr-primary);word-break:break-all;display:block;margin-top:6px;">${res.data}</code>`,
            buttons: [
              { id: 'open', label: 'Open in Explorer', className: 'btn-primary' },
              { id: 'close', label: 'Done', className: 'btn-ghost' }
            ]
          })
          if (choice === 'open') window.api.exportOpenFile(res.data)
        } else if (res && !res.ok) {
          showToast(`Export failed: ${res.error}`, 'error')
        }
      } catch (err: any) {
        showToast(`Export error: ${err.message || err}`, 'error')
      } finally {
        btn.innerHTML = origHtml
        btn.disabled = false
      }
    })
  }


  async function handleToggleClosedDay(): Promise<void> {
    const d = new Date(currentDate + 'T00:00:00')
    const isSunday = d.getDay() === 0
    const defaultReason = isSunday ? 'Sunday' : ''

    // Capture reason before modal is removed from DOM
    let capturedReason = defaultReason

    const choice = await showModal({
      icon: Icons.xCircle,
      iconColor: 'danger',
      title: isClosed ? 'Reopen this Day?' : 'Mark Day as Closed',
      body: isClosed
        ? `This day is currently marked as <strong>${closureReason}</strong>. Are you sure you want to reopen it?`
        : `Mark <strong>${currentDate}</strong> as a closed day? This will set the Excel sheet tab to red.
           <div style="margin-top:16px">
             <label style="display:block;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--clr-text-muted);margin-bottom:8px">Reason</label>
             <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">
               <button class="btn btn-sm btn-ghost reason-preset" data-reason="Sunday" style="border:1px solid var(--clr-border)">Sunday</button>
               <button class="btn btn-sm btn-ghost reason-preset" data-reason="Holiday" style="border:1px solid var(--clr-border)">Holiday</button>
               <button class="btn btn-sm btn-ghost reason-preset" data-reason="New Year's Day" style="border:1px solid var(--clr-border)">New Year's Day</button>
               <button class="btn btn-sm btn-ghost reason-preset" data-reason="Christmas" style="border:1px solid var(--clr-border)">Christmas</button>
             </div>
             <input type="text" id="close-reason-input" placeholder="Or type a custom reason…" value="${defaultReason}" style="display:block;width:100%;padding:10px 12px;background:var(--clr-input-bg);border:1px solid var(--clr-border);border-radius:var(--radius-md);color:var(--clr-text);font-size:14px;box-sizing:border-box" />
           </div>`,
      buttons: isClosed
        ? [
            { id: 'reopen', label: 'Reopen Day', className: 'btn-secondary' },
            { id: 'cancel', label: 'Cancel', className: 'btn-ghost' },
          ]
        : [
            { id: 'confirm', label: 'Mark as Closed', className: 'btn-danger' },
            { id: 'cancel', label: 'Cancel', className: 'btn-ghost' },
          ],
      onOpen: () => {
        // Wire preset buttons to fill input
        document.querySelectorAll<HTMLButtonElement>('.reason-preset').forEach(btn => {
          btn.addEventListener('click', () => {
            const inp = document.getElementById('close-reason-input') as HTMLInputElement
            if (inp) inp.value = btn.dataset.reason!
          })
        })
        // Track input changes live so we capture the value before modal is removed
        const inp = document.getElementById('close-reason-input') as HTMLInputElement | null
        if (inp) {
          inp.addEventListener('input', () => { capturedReason = inp.value })
          // Also wire the confirm button to snapshot the value right before close
          const confirmBtn = document.getElementById('modal-btn-confirm')
          if (confirmBtn) {
            confirmBtn.addEventListener('click', () => {
              capturedReason = inp.value.trim()
            }, { capture: true })
          }
        }
      }
    })

    if (isClosed && choice === 'reopen') {
      const result = await window.api.unmarkDayClosed(currentDate)
      if (!result.ok) {
        showToast(result.error ?? 'Failed to reopen day', 'error')
        return
      }
      isClosed = false
      closureReason = ''
      updateClosedBanner()
      window.api.appendLog('REOPEN_DAY', `Reopened day ${currentDate}`)
      showToast('Day reopened — sales can be added again', 'success')
      return
    }

    if (!isClosed && choice === 'confirm') {
      const reason = capturedReason.trim() || (isSunday ? 'Sunday' : 'Closed')
      
      // Save current UI data to Excel before marking closed
      showOverlay()
      const saveResult = await window.api.saveDay(currentDate, rows)
      if (!saveResult.ok) {
        hideOverlay()
        showToast(`Failed to save before closing: ${saveResult.error}`, 'error', 6000)
        return
      }

      const result = await window.api.markDayClosed(currentDate, reason)
      hideOverlay()
      
      if (!result.ok) {
        showToast(result.error ?? 'Failed to mark day as closed', 'error')
        return
      }
      isClosed = true
      closureReason = reason
      updateClosedBanner()
      await window.api.clearDraft(currentDate)
      window.api.appendLog('MARK_CLOSED', `Marked day ${currentDate} as closed (Reason: ${reason})`)
      showToast(`Day saved and marked as closed: ${reason}`, 'success')
    }
  }

  // ── Load day closed status ─────────────────────────────────────────────────
  async function loadDayStatus(): Promise<void> {
    const result = await window.api.getDayStatus(currentDate)
    if (result.ok) {
      isClosed = result.data.isClosed
      closureReason = result.data.reason
    } else {
      isClosed = false
      closureReason = ''
    }
    updateClosedBanner()
  }

  // ── Update the closed-day banner and button state ─────────────────────────
  function updateClosedBanner(): void {
    const banner    = document.getElementById('closed-day-banner')!
    const btn       = document.getElementById('btn-mark-closed')!
    const reasonEl  = document.getElementById('closed-day-reason')!
    const sunEl     = document.getElementById('sunday-indicator')!
    const overlay   = document.getElementById('closed-table-overlay')!
    const overlayReason = document.getElementById('closed-overlay-reason')!
    const addBtn    = document.getElementById('btn-add') as HTMLButtonElement
    const overlaySun = document.getElementById('overlay-sunday-indicator')

    const d = new Date(currentDate + 'T00:00:00')
    const isSunday = d.getDay() === 0

    // Always show Sunday pill if applicable
    sunEl.classList.toggle('hidden', !isSunday)
    if (overlaySun) {
      overlaySun.classList.toggle('hidden', !isSunday)
      if (isSunday) {
        overlaySun.style.display = 'inline-flex'
      } else {
        overlaySun.style.display = 'none'
      }
    }

    const pastOverlay = document.getElementById('past-day-overlay')!
    pastOverlay.classList.add('hidden')

    if (isClosed) {
      // Show banner
      banner.classList.remove('hidden')
      const displayReason = !closureReason || closureReason.toLowerCase() === 'closed'
        ? 'Closed'
        : closureReason.toLowerCase().startsWith('closed')
          ? closureReason
          : `Closed — ${closureReason}`
      reasonEl.textContent = displayReason

      // Show table overlay (blocks table area)
      overlay.classList.remove('hidden')
      overlayReason.textContent = displayReason

      // Disable Add button
      addBtn.disabled = true
      addBtn.style.opacity = '0.4'
      addBtn.style.cursor = 'not-allowed'

      // Update topbar button
      btn.innerHTML = `${Icons.checkCircle} Reopen Day`
      btn.className = 'btn btn-sm btn-secondary'

      // Wire the reopen button inside the overlay
      const reopenBtn = document.getElementById('btn-reopen-day')
      if (reopenBtn) {
        reopenBtn.onclick = () => {
          handleToggleClosedDay()
        }
      }
    } else if (isPastDayLocked) {
      // Show past day overlay instead of closed overlay
      banner.classList.toggle('hidden', !isSunday)
      reasonEl.textContent = ''
      overlay.classList.add('hidden')
      pastOverlay.classList.remove('hidden')

      // Disable Add button
      addBtn.disabled = true
      addBtn.style.opacity = '0.4'
      addBtn.style.cursor = 'not-allowed'

      // Update topbar button
      btn.innerHTML = `${Icons.xCircle} Mark as Closed`
      btn.className = 'btn btn-sm'
    } else {
      // Hide banner (unless Sunday)
      banner.classList.toggle('hidden', !isSunday)
      reasonEl.textContent = ''

      // Hide all overlays
      overlay.classList.add('hidden')
      pastOverlay.classList.add('hidden')

      // Re-enable Add button
      addBtn.disabled = false
      addBtn.style.opacity = ''
      addBtn.style.cursor = ''

      // Update topbar button
      btn.innerHTML = `${Icons.xCircle} Mark as Closed`
      btn.className = 'btn btn-sm'
    }
  }

  // ── Container dropdown refresh (after settings change) ────────────────────
  function refreshContainerDropdown(): void {
    // Already built in HTML — called once on init
    refreshWaterVisibility()
  }

  function refreshWaterVisibility(): void {
    const selContainer = document.getElementById('sel-container') as HTMLInputElement
    const waterField   = document.getElementById('water-field')!
    const selected = config.containerTypes.find(ct => ct.name === selContainer.value)
    // Hide water field when: no container selected, container type not in config (item entry), or container doesn't require water
    if (selected && selected.requiresWaterType) {
      waterField.classList.remove('hidden')
    } else {
      waterField.classList.add('hidden')
    }
  }

  function setMode(mode: SaleMode): void {
    currentMode = mode
    const pickupBtn  = document.getElementById('btn-pickup')!
    const deliverBtn = document.getElementById('btn-deliver')!
    if (mode === 'PICKUP') {
      pickupBtn.className  = 'mode-toggle__btn active-pickup'
      deliverBtn.className = 'mode-toggle__btn'
    } else {
      pickupBtn.className  = 'mode-toggle__btn'
      deliverBtn.className = 'mode-toggle__btn active-deliver'
    }
    autofillPrice()
  }

  function autofillPrice(): void {
    const container = (document.getElementById('sel-container') as HTMLInputElement).value.trim().toUpperCase()
    const water     = (document.getElementById('sel-water')     as HTMLSelectElement).value
    const qty       = parseInt((document.getElementById('inp-qty') as HTMLInputElement).value, 10) || 1
    const ct = config.containerTypes.find(c => c.name === container)
    const effectiveWater = (ct !== undefined && ct.requiresWaterType) ? water : ''
    const priceRow = config.priceTable.find(p => p.container === container && p.water === effectiveWater)
    const minQty   = parseMinQty(priceRow?.note ?? '')
    const hintEl   = document.getElementById('qty-hint')!
    const inp      = document.getElementById('inp-price') as HTMLInputElement

    // For bottle types with a minimum, auto-switch price based on qty + mode
    if (priceRow && minQty > 1) {
      const isWholesale = currentMode === 'DELIVER' && qty >= minQty
      const unitPrice   = isWholesale ? priceRow.deliver : priceRow.pickup
      if (unitPrice > 0) inp.value = String(unitPrice)
      else inp.value = ''

      if (currentMode === 'DELIVER') {
        if (qty >= minQty) {
          // Wholesale threshold met
          hintEl.className = 'field-hint field-hint--ok'
          hintEl.textContent = `Wholesale rate — ₱${priceRow.deliver}/bottle (min. ${minQty} met ✓)`
        } else {
          // Below minimum — show retail price instead, warn user
          hintEl.className = 'field-hint field-hint--warn'
          hintEl.textContent = `Below ${minQty}-bottle wholesale minimum — retail price ₱${priceRow.pickup}/bottle applies`
        }
      } else {
        // PICKUP mode — retail, any quantity allowed
        hintEl.className = 'field-hint'
        hintEl.textContent = `Retail: ₱${priceRow.pickup}/bottle — any quantity. Need ${minQty}+ for wholesale delivery at ₱${priceRow.deliver}/bottle`
      }
      hintEl.classList.remove('hidden')
    } else {
      // Regular gallon — standard price lookup
      const price = lookupPrice(config, container, effectiveWater, currentMode)
      if (price > 0) inp.value = String(price)
      else inp.value = ''
      hintEl.classList.add('hidden')
    }
  }

  /** Parse a minimum quantity from a note string like "50 BOTTLE MINIMUM" */
  function parseMinQty(note: string): number {
    const m = note.match(/(\d+)/)
    return m ? parseInt(m[1], 10) : 1
  }

  // ── Add / Edit ────────────────────────────────────────────────────────────
  function handleAdd(): void {
    const container = (document.getElementById('sel-container') as HTMLInputElement).value.trim().toUpperCase()
    const water     = (document.getElementById('sel-water')     as HTMLSelectElement).value
    const qty       = parseInt((document.getElementById('inp-qty')   as HTMLInputElement).value, 10)
    const price     = parseFloat((document.getElementById('inp-price') as HTMLInputElement).value)
    const ct        = config.containerTypes.find(c => c.name === container)
    const effectiveWater = (ct !== undefined && ct.requiresWaterType) ? water : ''

    if (!container) { showToast('Please select a container type.', 'error'); return }
    if (isNaN(qty) || qty < 1) { showToast('Quantity must be at least 1.', 'error'); return }
    if (isNaN(price) || price < 0) { showToast('Please enter a valid price.', 'error'); return }

    // Enforce minimum quantity from price table note
    const ct2 = config.containerTypes.find(c => c.name === container)
    const effectiveWater2 = (ct2 !== undefined && ct2.requiresWaterType) ? water : ''
    const priceRow = config.priceTable.find(p => p.container === container && p.water === effectiveWater2)
    const minQty = parseMinQty(priceRow?.note ?? '')
    if (currentMode === 'DELIVER' && minQty > 1 && qty < minQty) {
      showToast(`Minimum order for wholesale deliver is ${minQty} bottles.`, 'error', 4000)
      return
    }

    if (editingIndex !== null) {
      // Update existing row
      const oldRow = rows[editingIndex]
      const qtyDiff = qty - oldRow.qty
      let diffStr = ''
      if (qtyDiff > 0) diffStr = ` (Added +${qtyDiff} qty)`
      else if (qtyDiff < 0) diffStr = ` (Subtracted ${Math.abs(qtyDiff)} qty)`

      rows[editingIndex] = { sn: editingIndex + 1, container, water: effectiveWater, qty, mode: currentMode, price }
      window.api.appendLog('EDIT_SALE', `[For ${currentDate}] Edited row ${editingIndex + 1}: changed to ${qty}x ${container} ${effectiveWater} @ ₱${price}${diffStr}`)
      cancelEdit()
    } else {
      // Check for exact match to aggregate
      const existingIdx = rows.findIndex(r => 
        r.container === container && 
        r.water === effectiveWater && 
        r.mode === currentMode && 
        r.price === price
      )

      if (existingIdx !== -1) {
        // Aggregate qty
        rows[existingIdx].qty += qty
        const newQty = rows[existingIdx].qty
        window.api.appendLog('ADD_SALE', `[For ${currentDate}] Aggregated +${qty} qty into row ${existingIdx + 1} (New total: ${newQty}x ${container})`)
      } else {
        // Check 30-row limit
        if (rows.length >= MAX_ROWS) {
          showToast('Daily limit of 30 entries reached. Please consolidate quantities.', 'error', 5000)
          return
        }
        rows.push({ sn: rows.length + 1, container, water: effectiveWater, qty, mode: currentMode, price })
        window.api.appendLog('ADD_SALE', `[For ${currentDate}] Added ${qty}x ${container} ${effectiveWater} (${currentMode}) @ ₱${price}`)
      }
    }

    reassignSns()
    refreshTable()
    triggerAutoSave()

    // Reset qty to 1
    ;(document.getElementById('inp-qty') as HTMLInputElement).value = '1'
  }

  async function startEdit(index: number): Promise<void> {
    const row = rows[index]
    const label = [row.container, row.water, `x${row.qty}`].filter(Boolean).join(' · ')

    const choice = await showModal({
      icon: Icons.pencil,
      iconColor: 'primary',
      title: 'Edit Entry',
      body: `Are you sure you want to edit <strong>${label}</strong>?`,
      buttons: [
        { id: 'edit', label: 'Edit', className: 'btn-primary' },
        { id: 'cancel', label: 'Cancel', className: 'btn-ghost' },
      ],
    })

    if (choice !== 'edit') return

    // Ensure sidebar is open so the user can see the edit form
    const sidebar = document.querySelector('.entry-sidebar')
    if (sidebar && sidebar.classList.contains('collapsed')) {
      sidebar.classList.remove('collapsed')
    }

    editingIndex = index

    const selContainer = document.getElementById('sel-container') as HTMLInputElement
    const selWater     = document.getElementById('sel-water')     as HTMLSelectElement
    const inpQty       = document.getElementById('inp-qty')       as HTMLInputElement
    const inpPrice     = document.getElementById('inp-price')     as HTMLInputElement

    selContainer.value = row.container
    refreshWaterVisibility()
    selWater.value = row.water
    inpQty.value   = String(row.qty)
    inpPrice.value = String(row.price)
    setMode(row.mode)

    document.getElementById('edit-banner')!.classList.remove('hidden')
    document.getElementById('edit-row-num')!.textContent = String(index + 1)
    document.getElementById('btn-add')!.innerHTML = `${Icons.check} Update Sale`
  }

  function cancelEdit(): void {
    editingIndex = null
    document.getElementById('edit-banner')!.classList.add('hidden')
    document.getElementById('btn-add')!.innerHTML = `${Icons.plus} Add Sale`
    ;(document.getElementById('inp-qty') as HTMLInputElement).value = '1'
    autofillPrice()
  }

  async function deleteRow(index: number): Promise<void> {
    const row = rows[index]
    const label = [row.container, row.water, `x${row.qty}`].filter(Boolean).join(' · ')

    const choice = await showModal({
      icon: Icons.trash,
      iconColor: 'danger',
      title: 'Delete Entry',
      body: `Remove <strong>${label}</strong> from today's log?`,
      buttons: [
        { id: 'delete', label: 'Delete', className: 'btn-danger' },
        { id: 'cancel', label: 'Cancel', className: 'btn-ghost' },
      ],
    })

    if (choice !== 'delete') return

    rows.splice(index, 1)
    window.api.appendLog('DELETE_SALE', `[For ${currentDate}] Deleted row ${index + 1}: ${label}`)
    reassignSns()
    refreshTable()
    triggerAutoSave()
    if (editingIndex !== null) cancelEdit()
  }

  function reassignSns(): void {
    rows = rows.map((r, i) => ({ ...r, sn: i + 1 }))
  }

  // ── Table rendering ───────────────────────────────────────────────────────
  function refreshTable(): void {
    const tbody = document.getElementById('sales-tbody')!
    const counter = document.getElementById('row-counter')!
    const addBtn  = document.getElementById('btn-add')!

    if (rows.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="empty-state">
              <div class="empty-state__icon">${Icons.clipboardList}</div>
              <div class="empty-state__text">No sales logged yet. Add your first entry.</div>
            </div>
          </td>
        </tr>
      `
    } else {
      tbody.innerHTML = rows.map((row, i) => {
        const total = row.qty * row.price
        const modeClass = row.mode === 'PICKUP' ? 'pickup' : 'deliver'
        const modeLabel = row.mode === 'PICKUP' ? `${Icons.shoppingBag} Pick Up` : `${Icons.truck} Deliver`
        return `
          <tr class="${modeClass}-row" data-index="${i}">
            <td class="td-sn">${row.sn}</td>
            <td>${row.container}</td>
            <td>${row.water || '<span class="text-muted">—</span>'}</td>
            <td class="td-qty">${row.qty}</td>
            <td><span class="badge-mode ${modeClass}">${modeLabel}</span></td>
            <td class="td-price monospace">₱${formatAmount(row.price)}</td>
            <td class="td-total monospace">₱${formatAmount(total)}</td>
            <td class="td-actions">
              <button class="btn btn-ghost btn-icon btn-edit" data-index="${i}" title="Edit" style="color:var(--clr-primary)">${Icons.pencil}</button>
              <button class="btn btn-danger btn-icon btn-delete" data-index="${i}" title="Delete" style="background:transparent;color:var(--clr-error)">${Icons.trash}</button>
            </td>
          </tr>
        `
      }).join('')
    }

    // Row counter
    const atLimit = rows.length >= MAX_ROWS
    counter.textContent = `${rows.length} / ${MAX_ROWS} rows`
    counter.classList.toggle('at-limit', atLimit)
    addBtn.toggleAttribute('disabled', atLimit && editingIndex === null)

    // Running totals
    const totalAmount = rows.reduce((s, r) => s + r.qty * r.price, 0)
    const totalQty    = rows.reduce((s, r) => s + r.qty, 0)
    document.getElementById('running-total')!.textContent = `₱${formatAmount(totalAmount)}`
    document.getElementById('running-qty')!.textContent   = totalQty > 0 ? `(${totalQty} containers)` : ''
    refreshExpenseTotals()

    // Wire row actions
    tbody.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', e => {
        const idx = parseInt((e.currentTarget as HTMLElement).dataset.index!, 10)
        startEdit(idx)
      })
    })
    tbody.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', e => {
        const idx = parseInt((e.currentTarget as HTMLElement).dataset.index!, 10)
        deleteRow(idx)
      })
    })
  }

  // ── Indicator ─────────────────────────────────────────────────────────────
  function updateIndicator(): void {
    const ind = getIndicator(currentDate)
    document.getElementById('indicator-file')!.textContent  = ind.file
    document.getElementById('indicator-sheet')!.textContent = ind.sheet
  }

  // ── Expense totals refresh ────────────────────────────────────────────────
  function refreshExpenseTotals(): void {
    const totalAmt  = rows.reduce((s, r) => s + r.qty * r.price, 0)
    const expTotal  = dayExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
    const net       = totalAmt - expTotal

    const elExp     = document.getElementById('running-expenses')
    const elExpCnt  = document.getElementById('running-expenses-count')
    const elNet     = document.getElementById('running-net')
    const badge     = document.getElementById('badge-expenses-count')

    if (elExp)    elExp.textContent    = `₱${formatAmount(expTotal)}`
    if (elExpCnt) elExpCnt.textContent = dayExpenses.length > 0 ? `(${dayExpenses.length})` : ''
    if (elNet)    elNet.textContent    = `₱${formatAmount(net)}`
    if (badge) {
      if (dayExpenses.length > 0) {
        badge.style.display = 'inline'
        badge.textContent   = String(dayExpenses.length)
      } else {
        badge.style.display = 'none'
      }
    }
  }

  // ── Load existing day ─────────────────────────────────────────────────────
  async function loadExistingDay(): Promise<void> {
    const result = await window.api.loadDay(currentDate)
    if (result.ok && result.data.length > 0) {
      rows = result.data
      reassignSns()
      refreshTable()
      showToast(`Loaded ${rows.length} existing entries for this date.`, 'info')
    }
    // Also load expenses for this date
    const expResult = await window.api.loadDayExpenses(currentDate)
    if (expResult.ok) {
      dayExpenses = expResult.data
      refreshExpenseTotals()
    }
  }

  // ── Draft autosave ────────────────────────────────────────────────────────
  function scheduleDraftSave(): void {
    if (draftTimer) clearTimeout(draftTimer)
    const draftDate = currentDate
    const draftRows = JSON.parse(JSON.stringify(rows))
    draftTimer = setTimeout(async () => {
      await window.api.saveDraft(draftDate, draftRows)
    }, 800)
  }

  async function checkForDraft(): Promise<void> {
    const result = await window.api.getDraft(currentDate)
    if (!result.ok || !result.data || result.data.rows.length === 0) {
      // No draft — try to load from Excel if file exists
      await loadExistingDay()
      return
    }

    // Auto-restore silently — no blocking modal
    rows = result.data.rows
    reassignSns()
    refreshTable()
    showToast(`Restored ${rows.length} unsaved entr${rows.length === 1 ? 'y' : 'ies'} — save when ready.`, 'info', 4000)
  }

  // ── Auto-save to Supabase ──────────────────────────────────────────────────
  function updateSyncStatus(status: 'saving' | 'saved' | 'error', errorMsg?: string): void {
    const el = document.getElementById('sync-status')
    if (!el) return
    if (status === 'saving') {
      el.innerHTML = `<span style="display:inline-flex;align-items:center;gap:6px;color:var(--clr-primary);"><span class="spinner" style="width:12px;height:12px;border-width:2px;"></span> Saving...</span>`
    } else if (status === 'saved') {
      el.innerHTML = `<span style="display:inline-flex;align-items:center;gap:5px;color:#10b981;">${Icons.check} Auto-saved</span>`
    } else if (status === 'error') {
      el.innerHTML = `<span style="display:inline-flex;align-items:center;gap:5px;color:#ef4444;" title="${errorMsg || ''}">${Icons.alertTriangle} Save failed</span>`
    }
  }

  let autoSaveTimer: ReturnType<typeof setTimeout> | null = null
  let isAutoSaving = false
  let hasPendingAutoSave = false

  function triggerAutoSave(): void {
    updateSyncStatus('saving')
    if (autoSaveTimer) clearTimeout(autoSaveTimer)
    scheduleDraftSave()
    autoSaveTimer = setTimeout(async () => {
      await performAutoSave()
    }, 400)
  }

  async function performAutoSave(): Promise<void> {
    if (isAutoSaving) {
      hasPendingAutoSave = true
      return
    }
    isAutoSaving = true
    updateSyncStatus('saving')

    try {
      const result = await window.api.saveDay(currentDate, rows)
      if (result.ok) {
        await window.api.clearDraft(currentDate)
        window.api.appendLog('AUTO_SAVE', `Auto-saved day ${currentDate} (${rows.length} rows)`)
        updateSyncStatus('saved')
      } else {
        updateSyncStatus('error', result.error)
        showToast(`Auto-save error: ${result.error}`, 'error', 5000)
      }
    } catch (e: unknown) {
      updateSyncStatus('error', String(e))
    } finally {
      isAutoSaving = false
      if (hasPendingAutoSave) {
        hasPendingAutoSave = false
        performAutoSave()
      }
    }
  }

  /** Returns true if the given ISO date is the last day of its month */
  function isLastDayOfMonth(dateStr: string): boolean {
    const d = new Date(dateStr + 'T00:00:00')
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    return d.getDate() === lastDay
  }

  /** Fetch all days for the same month and show a month-end revenue summary */
  async function showMonthEndSummary(dateStr: string): Promise<void> {
    const histResult = await window.api.listHistory()
    if (!histResult.ok) return

    const d = new Date(dateStr + 'T00:00:00')
    const year  = d.getFullYear()
    const month = d.getMonth() + 1
    const monthName = d.toLocaleDateString('en-PH', { month: 'long' })

    const monthDays = histResult.data.filter(day => {
      const [y, m] = day.date.split('-').map(Number)
      return y === year && m === month
    })

    const totalRevenue = monthDays.reduce((sum, day) => sum + day.totalAmount, 0)
    const totalRows    = monthDays.reduce((sum, day) => sum + day.rowCount, 0)
    const closedDays   = monthDays.filter(d => d.isRed).length

    const fmt = (n: number) => '\u20b1' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

    await showModal({
      icon: Icons.fileSheet,
      iconColor: 'success',
      title: `\uD83C\uDF89 ${monthName} ${year} Complete!`,
      body: `
        <div style="text-align:center; margin-bottom: 16px;">
          <div style="font-size: 13px; color: var(--clr-text-muted); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 6px;">Total Monthly Revenue</div>
          <div style="font-size: 36px; font-weight: 800; color: var(--clr-success); letter-spacing: -0.02em;">${fmt(totalRevenue)}</div>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; background: var(--clr-surface-2); border-radius: 12px; padding: 16px;">
          <div style="text-align:center;">
            <div style="font-size: 22px; font-weight: 700; color: var(--clr-text);">${monthDays.length}</div>
            <div style="font-size: 11px; color: var(--clr-text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 2px;">Days Logged</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size: 22px; font-weight: 700; color: var(--clr-text);">${totalRows}</div>
            <div style="font-size: 11px; color: var(--clr-text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 2px;">Total Sales</div>
          </div>
          <div style="text-align:center;">
            <div style="font-size: 22px; font-weight: 700; color: var(--clr-error);">${closedDays}</div>
            <div style="font-size: 11px; color: var(--clr-text-muted); text-transform: uppercase; letter-spacing: 0.06em; margin-top: 2px;">Days Closed</div>
          </div>
        </div>
      `,
      buttons: [
        { id: 'ok', label: `${Icons.check} Great!`, className: 'btn-success' },
      ],
    })
  }
}
