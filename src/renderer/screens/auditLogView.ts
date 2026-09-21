import type { LogEntry } from '../../shared/types'
import { Icons } from '../components/icons'
import flatpickr from 'flatpickr'
import monthSelectPlugin from 'flatpickr/dist/plugins/monthSelect/index.js'
import 'flatpickr/dist/flatpickr.min.css'
import 'flatpickr/dist/plugins/monthSelect/style.css'

export interface AuditLogViewConfig {
  logType: 'water' | 'item'
  title: string
  subtitle: string
  icon: string
  fetchLogs: (prefix: string) => Promise<{ ok: boolean; data?: LogEntry[]; error?: string }>
  actionOptions: { value: string; label: string }[]
  exportFileNamePrefix: string
}

interface ParsedLog {
  raw: LogEntry
  eventDate: string // YYYY-MM-DD
  timeFormatted: string // e.g. "8:53:22 AM"
  dateFormatted: string // e.g. "Sep 21, 2026"
  isToday: boolean
  targetSheetDate: string | null // e.g. "2026-09-19"
  targetSheetFormatted: string | null // e.g. "Sep 19, 2026"
  isCrossDate: boolean // targetSheetDate !== eventDate
  badgeClass: string
  badgeLabel: string
  primaryTitle: string
  detailMeta: string
  tags: string[]
  isAutoSave: boolean
}

function padZero(n: number): string {
  return String(n).padStart(2, '0')
}

function formatDateFriendly(dateStr: string): string {
  try {
    const [y, m, d] = dateStr.split('-').map(Number)
    if (!y || !m || !d) return dateStr
    const dt = new Date(y, m - 1, d)
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch {
    return dateStr
  }
}

function parseTimestamp(ts: string): { eventDate: string; timeFormatted: string; dateFormatted: string; isToday: boolean } {
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${padZero(now.getMonth() + 1)}-${padZero(now.getDate())}`

  let d = new Date(ts)
  // Handle "YYYY-MM-DD HH:mm:ss"
  if (isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(ts)) {
    d = new Date(ts.replace(' ', 'T'))
  }

  if (isNaN(d.getTime())) {
    const prefix = ts.slice(0, 10)
    return {
      eventDate: prefix,
      timeFormatted: ts.slice(11) || ts,
      dateFormatted: prefix,
      isToday: prefix === todayStr
    }
  }

  const eventDate = `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`
  const timeFormatted = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })
  const dateFormatted = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  return {
    eventDate,
    timeFormatted,
    dateFormatted,
    isToday: eventDate === todayStr
  }
}

function parseLogEntry(entry: LogEntry, todayStr: string): ParsedLog {
  const { eventDate, timeFormatted, dateFormatted, isToday } = parseTimestamp(entry.timestamp)
  let targetSheetDate: string | null = null
  let cleanDetails = entry.details
  let primaryTitle = ''
  let detailMeta = ''
  const tags: string[] = []
  let badgeClass = 'sys'
  let badgeLabel = entry.action
  const isAutoSave = entry.action === 'AUTO_SAVE' || entry.action === 'SAVE_DAY'

  // 1. Extract [For YYYY-MM-DD] if present
  const forMatch = entry.details.match(/^\[For\s+(\d{4}-\d{2}-\d{2})\]\s*(.*)$/)
  if (forMatch) {
    targetSheetDate = forMatch[1]
    cleanDetails = forMatch[2]
  }

  // 2. Action badge classification (pure text & dots, no emojis)
  switch (entry.action) {
    case 'ADD_SALE':
      badgeClass = 'add'
      badgeLabel = 'SALE ADDED'
      break
    case 'EDIT_SALE':
      badgeClass = 'edit'
      badgeLabel = 'SALE MODIFIED'
      break
    case 'DELETE_SALE':
      badgeClass = 'del'
      badgeLabel = 'SALE DELETED'
      break
    case 'ITEM_SALE_ADD':
      badgeClass = 'add'
      badgeLabel = 'SALE ADDED'
      break
    case 'ITEM_SALE_EDIT':
      badgeClass = 'edit'
      badgeLabel = 'SALE MODIFIED'
      break
    case 'ITEM_SALE_DELETE':
      badgeClass = 'del'
      badgeLabel = 'SALE VOIDED'
      break
    case 'STOCK_DISPATCH':
      badgeClass = 'dispatch'
      badgeLabel = 'DISPATCH'
      break
    case 'STOCK_OUT':
      badgeClass = 'del'
      badgeLabel = 'STOCK OUT'
      break
    case 'STOCK_IN':
      badgeClass = 'add'
      badgeLabel = 'STOCK IN'
      break
    case 'ITEM_CATALOG_ADD':
      badgeClass = 'add'
      badgeLabel = 'CATALOG ADD'
      break
    case 'ITEM_CATALOG_EDIT':
      badgeClass = 'edit'
      badgeLabel = 'CATALOG EDIT'
      break
    case 'ITEM_CATALOG_DELETE':
      badgeClass = 'del'
      badgeLabel = 'CATALOG DEL'
      break
    case 'STOCK_MOVEMENT_EDIT':
      badgeClass = 'edit'
      badgeLabel = 'STOCK EDIT'
      break
    case 'STOCK_MOVEMENT_DELETE':
      badgeClass = 'del'
      badgeLabel = 'STOCK VOID'
      break
    case 'MARK_CLOSED':
      badgeClass = 'close'
      badgeLabel = 'DAY CLOSED'
      break
    case 'REOPEN_DAY':
      badgeClass = 'reopen'
      badgeLabel = 'DAY REOPENED'
      break
    case 'AUTO_SAVE':
    case 'SAVE_DAY':
      badgeClass = 'sys'
      badgeLabel = 'AUTO-SAVED'
      break
    default:
      badgeClass = 'sys'
      badgeLabel = entry.action
  }

  // 3. Structured parsing for water sales
  // Case A: Added 5x SLIM PURIFIED (PICKUP) @ ₱30
  const addMatch = cleanDetails.match(/^Added\s+(\d+(?:\.\d+)?)x\s+(.+?)\s+\((PICKUP|DELIVER)\)\s+@\s+₱([0-9.,]+)/i)
  if (addMatch) {
    const qty = addMatch[1]
    const item = addMatch[2]
    const mode = addMatch[3].toUpperCase()
    const price = addMatch[4]
    primaryTitle = `${qty}x ${item}`
    detailMeta = `Unit Price: ₱${price}`
    tags.push(mode)
  }

  // Case B: Aggregated +1 qty into row 4 (New total: 3x ROUND)
  const aggMatch = cleanDetails.match(/^Aggregated\s+(\+\d+)\s+qty\s+into\s+row\s+(\d+)\s+\((.+?)\)/i)
  if (aggMatch) {
    primaryTitle = `Aggregated ${aggMatch[1]} Qty into Row ${aggMatch[2]}`
    detailMeta = aggMatch[3]
    tags.push('Combined')
  }

  // Case C: Edited row 4: changed to 2x ROUND ALKALINE @ ₱50 (Subtracted 1 qty)
  const editMatch = cleanDetails.match(/^Edited\s+row\s+(\d+):\s+changed\s+to\s+(.+?)(?:\s+@\s+₱([0-9.,]+))?(?:\s*\((.+?)\))?$/i)
  if (editMatch) {
    primaryTitle = `Edited Row ${editMatch[1]}: ${editMatch[2]}`
    if (editMatch[3]) detailMeta = `Price: ₱${editMatch[3]}`
    if (editMatch[4]) tags.push(editMatch[4])
  }

  // Case D: Deleted row 1: 5x SLIM PURIFIED
  const delMatch = cleanDetails.match(/^Deleted\s+row\s+(\d+):\s*(.+)$/i)
  if (delMatch) {
    primaryTitle = `Deleted Row ${delMatch[1]}`
    detailMeta = delMatch[2]
  }

  // Case E: Item sale added: Added: 2026-09-21 | 5 GAL SLIM CONTAINER W/ CAP BLUE-WOW x5 | Net: ₱725
  const itemAddMatch = cleanDetails.match(/^Added:\s*(\d{4}-\d{2}-\d{2})\s*\|\s*(.+?)\s*x(\d+)\s*\|\s*Net:\s*₱([0-9.,]+)/i)
  if (itemAddMatch) {
    if (!targetSheetDate) targetSheetDate = itemAddMatch[1]
    primaryTitle = `${itemAddMatch[3]}x ${itemAddMatch[2]}`
    detailMeta = `Net Total: ₱${itemAddMatch[4]}`
    tags.push('Item Sale')
  }

  // Case F: Item sale edit: Updated: 5 GAL SLIM CONTAINER W/ CAP BLUE-WOW x5 @ ₱145
  const itemEditMatch = cleanDetails.match(/^Updated:\s*(.+?)\s*x(\d+)\s*@\s*₱([0-9.,]+)/i)
  if (itemEditMatch) {
    primaryTitle = `Updated: ${itemEditMatch[2]}x ${itemEditMatch[1]}`
    detailMeta = `Price: ₱${itemEditMatch[3]}`
  }

  // Case G: Item sale delete: Deleted: 5 GAL SLIM CONTAINER W/ CAP BLUE-WOW x5 on 2026-09-21
  const itemDelMatch = cleanDetails.match(/^Deleted:\s*(.+?)\s*x(\d+)\s*on\s*(\d{4}-\d{2}-\d{2})/i)
  if (itemDelMatch) {
    if (!targetSheetDate) targetSheetDate = itemDelMatch[3]
    primaryTitle = `Deleted: ${itemDelMatch[2]}x ${itemDelMatch[1]}`
    detailMeta = `Sheet Date: ${formatDateFriendly(itemDelMatch[3])}`
  }

  // Case H: Auto-saved day 2026-09-19 (4 rows)
  const autoMatch = cleanDetails.match(/^Auto-saved\s+day\s+(\d{4}-\d{2}-\d{2})\s*\((.+?)\)/i)
  if (autoMatch) {
    if (!targetSheetDate) targetSheetDate = autoMatch[1]
    primaryTitle = `Auto-saved ${autoMatch[2]}`
    detailMeta = `Target Sheet: ${formatDateFriendly(autoMatch[1])}`
  }

  // Case I: Marked day 2026-09-21 as closed (Reason: Sunday)
  const closeMatch = cleanDetails.match(/^Marked\s+day\s+(\d{4}-\d{2}-\d{2})\s+as\s+closed\s*\(Reason:\s*(.+?)\)/i)
  if (closeMatch) {
    if (!targetSheetDate) targetSheetDate = closeMatch[1]
    primaryTitle = `Day Marked Closed`
    detailMeta = `Reason: ${closeMatch[2]}`
    tags.push(closeMatch[2])
  }

  // Case J: Reopened day
  const reopenMatch = cleanDetails.match(/(?:Reopened\s+day|Unlocked\s+&\s+reopened\s+past\s+day)\s+(\d{4}-\d{2}-\d{2})/i)
  if (reopenMatch) {
    if (!targetSheetDate) targetSheetDate = reopenMatch[1]
    primaryTitle = `Day Reopened for Editing`
    detailMeta = `Date: ${formatDateFriendly(reopenMatch[1])}`
  }

  // Case K: Stock Dispatch
  const dispatchMatch = cleanDetails.match(/^Dispatched:\s*(\d+(?:\.\d+)?)x\s*(.+?)\s+to\s+(.+?)\s+on\s+(\d{4}-\d{2}-\d{2})(?:\s*\((.*?)\))?$/i)
  if (dispatchMatch) {
    if (!targetSheetDate) targetSheetDate = dispatchMatch[4]
    primaryTitle = `Dispatched: ${dispatchMatch[1]}x ${dispatchMatch[2]}`
    detailMeta = `To: ${dispatchMatch[3]}${dispatchMatch[5] ? ` (${dispatchMatch[5]})` : ''}`
    tags.push('Wholesale Dispatch')
  }

  // Case L: Stock Out
  const stockOutMatch = cleanDetails.match(/^Stock OUT:\s*(\d+(?:\.\d+)?)x\s*(.+?)(?:\s+to\s+(.+?))?\s+\[(.+?)\]\s+on\s+(\d{4}-\d{2}-\d{2})(?:\s*\((.*?)\))?$/i)
  if (stockOutMatch) {
    if (!targetSheetDate) targetSheetDate = stockOutMatch[5]
    primaryTitle = `Stock Out: ${stockOutMatch[1]}x ${stockOutMatch[2]}`
    detailMeta = `${stockOutMatch[3] ? `To: ${stockOutMatch[3]} | ` : ''}Source: ${stockOutMatch[4]}${stockOutMatch[6] ? ` (${stockOutMatch[6]})` : ''}`
    tags.push('Out')
  }

  // Case M: Stock In
  const stockInMatch = cleanDetails.match(/^Stock IN:\s*(\d+(?:\.\d+)?)x\s*(.+?)\s+\[(.+?)\]\s+on\s+(\d{4}-\d{2}-\d{2})(?:\s*\((.*?)\))?$/i)
  if (stockInMatch) {
    if (!targetSheetDate) targetSheetDate = stockInMatch[4]
    primaryTitle = `Stock In: ${stockInMatch[1]}x ${stockInMatch[2]}`
    detailMeta = `Source: ${stockInMatch[3]}${stockInMatch[5] ? ` (${stockInMatch[5]})` : ''}`
    tags.push('Restock')
  }

  // Case N: Catalog Product Added
  const catAddMatch = cleanDetails.match(/^Added product to catalog(?:\s+\(Offline\))?:\s*(.+?)\s*\|\s*SRP:\s*₱([0-9.,]+)\s*\|\s*Cat:\s*(.+)$/i)
  if (catAddMatch) {
    primaryTitle = `Product Added: ${catAddMatch[1]}`
    detailMeta = `SRP: ₱${catAddMatch[2]} | Category: ${catAddMatch[3]}`
    tags.push('Catalog')
  }

  // Fallback for unparsed entries
  if (!primaryTitle) {
    primaryTitle = cleanDetails
  }

  // Default target sheet date to event date if not explicitly specified
  if (!targetSheetDate) {
    targetSheetDate = eventDate
  }

  const isCrossDate = !!targetSheetDate && targetSheetDate !== eventDate

  return {
    raw: entry,
    eventDate,
    timeFormatted,
    dateFormatted,
    isToday,
    targetSheetDate,
    targetSheetFormatted: formatDateFriendly(targetSheetDate),
    isCrossDate,
    badgeClass,
    badgeLabel,
    primaryTitle,
    detailMeta,
    tags,
    isAutoSave
  }
}

export function renderAuditLogView(container: HTMLElement, config: AuditLogViewConfig): void {
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${padZero(now.getMonth() + 1)}-${padZero(now.getDate())}`
  const yestDate = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const yesterdayStr = `${yestDate.getFullYear()}-${padZero(yestDate.getMonth() + 1)}-${padZero(yestDate.getDate())}`
  const currentMonth = `${now.getFullYear()}-${padZero(now.getMonth() + 1)}`

  container.innerHTML = `
    <style>
      .al-screen {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 20px 28px;
        box-sizing: border-box;
        gap: 16px;
        overflow: hidden;
        background: var(--clr-bg);
      }

      /* ── Header ── */
      .al-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
      }
      .al-title-wrap {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .al-icon-box {
        width: 40px;
        height: 40px;
        border-radius: 10px;
        background: var(--clr-surface-2);
        border: 1px solid var(--clr-border);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--clr-primary);
        flex-shrink: 0;
      }
      .al-icon-box svg { width: 20px; height: 20px; }
      .al-title {
        margin: 0;
        font-size: 18px;
        font-weight: 700;
        color: var(--clr-text);
        letter-spacing: -0.01em;
      }
      .al-subtitle {
        font-size: 12px;
        color: var(--clr-text-muted);
        margin-top: 1px;
      }
      .al-header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .al-btn-action {
        height: 34px;
        padding: 0 12px;
        border-radius: 8px;
        border: 1px solid var(--clr-border);
        background: var(--clr-surface);
        color: var(--clr-text);
        font-size: 12px;
        font-weight: 600;
        font-family: var(--font);
        display: inline-flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .al-btn-action:hover {
        background: var(--clr-surface-2);
        border-color: var(--clr-primary);
        color: var(--clr-primary);
      }
      .al-btn-action svg { width: 14px; height: 14px; }

      /* ── Toolbar ── */
      .al-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
        background: var(--clr-surface);
        padding: 10px 14px;
        border-radius: 12px;
        border: 1px solid var(--clr-border);
      }
      .al-controls {
        display: flex;
        flex-direction: column;
        gap: 8px;
        flex: 1;
      }
      .al-controls-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      /* Date group */
      .al-date-group {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .al-date-wrap {
        height: 34px;
        width: 155px;
        position: relative;
        background: var(--clr-surface-2);
        border: 1px solid var(--clr-border);
        border-radius: 8px;
        transition: border-color 0.2s;
      }
      .al-date-wrap:focus-within { border-color: var(--clr-primary); }
      .al-date-input {
        background: transparent;
        border: none;
        outline: none;
        width: 100%;
        height: 100%;
        padding: 0 10px 0 30px;
        font-family: var(--font);
        font-size: 12px;
        font-weight: 600;
        color: var(--clr-text);
        cursor: pointer;
      }
      .al-date-icon {
        position: absolute;
        left: 8px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--clr-primary);
        pointer-events: none;
        display: flex;
      }
      .al-date-icon svg { width: 15px; height: 15px; }

      .al-scope-chips {
        display: flex;
        align-items: center;
        background: var(--clr-surface-2);
        border: 1px solid var(--clr-border);
        border-radius: 8px;
        padding: 2px;
        gap: 2px;
      }
      .al-scope-chip {
        padding: 4px 10px;
        border: none;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        background: transparent;
        color: var(--clr-text-muted);
        font-family: var(--font);
        transition: all 0.15s;
        white-space: nowrap;
      }
      .al-scope-chip:hover:not(.active) {
        color: var(--clr-text);
      }
      .al-scope-chip.active {
        background: var(--clr-surface);
        color: var(--clr-primary);
        font-weight: 700;
        box-shadow: 0 1px 3px rgba(0,0,0,0.08);
      }

      /* Select dropdown */
      .al-select {
        height: 34px;
        padding: 0 10px;
        border: 1px solid var(--clr-border);
        border-radius: 8px;
        background: var(--clr-surface-2);
        color: var(--clr-text);
        font-size: 12px;
        font-family: var(--font);
        outline: none;
        cursor: pointer;
      }
      .al-select:focus { border-color: var(--clr-primary); }

      /* Search */
      .al-search-wrap {
        height: 34px;
        position: relative;
        background: var(--clr-surface-2);
        border: 1px solid var(--clr-border);
        border-radius: 8px;
        display: flex;
        align-items: center;
      }
      .al-search-wrap:focus-within { border-color: var(--clr-primary); }
      .al-search-icon {
        position: absolute;
        left: 9px;
        color: var(--clr-text-muted);
        pointer-events: none;
        display: flex;
      }
      .al-search-icon svg { width: 14px; height: 14px; }
      .al-search-input {
        background: transparent;
        border: none;
        outline: none;
        width: 100%;
        height: 100%;
        padding: 0 10px 0 28px;
        font-family: var(--font);
        font-size: 12px;
        color: var(--clr-text);
      }

      /* Toggle Hide Auto-Saves */
      .al-toggle-wrap {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        color: var(--clr-text);
        cursor: pointer;
        user-select: none;
        padding: 4px 8px;
        border-radius: 6px;
        transition: background 0.15s;
      }
      .al-toggle-wrap:hover { background: var(--clr-surface-2); }
      .al-toggle-checkbox {
        cursor: pointer;
        accent-color: var(--clr-primary);
        width: 15px;
        height: 15px;
      }

      /* Refresh btn */
      .al-btn-refresh {
        width: 34px;
        height: 34px;
        border-radius: 8px;
        border: 1px solid var(--clr-border);
        background: var(--clr-surface-2);
        color: var(--clr-text-muted);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: all 0.2s;
      }
      .al-btn-refresh:hover {
        background: var(--clr-surface-3);
        color: var(--clr-text);
        border-color: var(--clr-primary);
      }
      .al-btn-refresh.spinning svg {
        animation: al-spin 0.75s linear infinite;
      }
      @keyframes al-spin { 100% { transform: rotate(360deg); } }

      /* ── Summary Metrics Bar ── */
      .al-metrics-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .al-metric-chip {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 5px 12px;
        border-radius: 8px;
        font-size: 12px;
        font-weight: 600;
        background: var(--clr-surface);
        border: 1px solid var(--clr-border);
        color: var(--clr-text);
        cursor: pointer;
        transition: all 0.2s;
        user-select: none;
      }
      .al-metric-chip:hover {
        transform: translateY(-1px);
        border-color: var(--clr-primary);
      }
      .al-metric-chip.active {
        border-color: var(--clr-primary);
        box-shadow: 0 0 0 2px var(--clr-primary-glow);
        background: var(--clr-surface-2);
      }
      .al-metric-chip.add { color: #10b981; }
      .al-metric-chip.add.active { border-color: #10b981; box-shadow: 0 0 0 2px rgba(16,185,129,0.2); }
      .al-metric-chip.edit { color: #f59e0b; }
      .al-metric-chip.edit.active { border-color: #f59e0b; box-shadow: 0 0 0 2px rgba(245,158,11,0.2); }
      .al-metric-chip.del { color: #ef4444; }
      .al-metric-chip.del.active { border-color: #ef4444; box-shadow: 0 0 0 2px rgba(239,68,68,0.2); }
      .al-metric-chip.sys { color: var(--clr-text-muted); }

      /* ── Table Card ── */
      .al-card {
        flex: 1;
        background: var(--clr-surface);
        border: 1px solid var(--clr-border);
        border-radius: 14px;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        box-shadow: var(--shadow-sm);
      }
      .al-scroll-wrap {
        flex: 1;
        overflow-y: auto;
        position: relative;
      }
      .al-table {
        width: 100%;
        border-collapse: separate;
        border-spacing: 0;
        font-size: 13px;
      }
      .al-table th {
        position: sticky;
        top: 0;
        z-index: 5;
        background: var(--clr-surface-2);
        border-bottom: 2px solid var(--clr-border);
        padding: 10px 16px;
        text-align: left;
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--clr-text-muted);
      }
      .al-table td {
        padding: 10px 16px;
        border-bottom: 1px solid var(--clr-border);
        color: var(--clr-text);
        vertical-align: middle;
      }
      .al-table tr:hover td {
        background: var(--clr-surface-2);
      }

      /* Table Content Styling */
      .al-time-col {
        display: flex;
        flex-direction: column;
        gap: 2px;
      }
      .al-time-primary {
        font-size: 13px;
        font-weight: 700;
        color: var(--clr-text);
        font-family: var(--font);
      }
      .al-time-sub {
        font-size: 11px;
        color: var(--clr-text-muted);
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .al-today-pill {
        display: inline-block;
        padding: 1px 5px;
        border-radius: 4px;
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        background: rgba(13,148,136,0.12);
        color: var(--clr-primary);
      }

      /* Target Sheet Pill */
      .al-sheet-pill {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 600;
        background: var(--clr-surface-2);
        border: 1px solid var(--clr-border);
        color: var(--clr-text);
        white-space: nowrap;
      }
      .al-sheet-pill.cross-date {
        background: rgba(245,158,11,0.12);
        color: #b45309;
        border-color: rgba(245,158,11,0.3);
      }
      [data-theme="dark"] .al-sheet-pill.cross-date {
        background: rgba(245,158,11,0.18);
        color: #fbbf24;
      }
      .al-cross-warning {
        font-size: 10px;
        font-weight: 700;
        padding: 1px 4px;
        border-radius: 4px;
        background: #f59e0b;
        color: #fff;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      /* Action Badges (Dots instead of emojis) */
      .al-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 3px 8px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.03em;
        white-space: nowrap;
      }
      .al-badge-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        display: inline-block;
      }
      .al-badge-add {
        background: rgba(16,185,129,0.12);
        color: #10b981;
        border: 1px solid rgba(16,185,129,0.25);
      }
      .al-badge-add .al-badge-dot { background: #10b981; }

      .al-badge-edit {
        background: rgba(245,158,11,0.12);
        color: #f59e0b;
        border: 1px solid rgba(245,158,11,0.25);
      }
      .al-badge-edit .al-badge-dot { background: #f59e0b; }

      .al-badge-del {
        background: rgba(239,68,68,0.12);
        color: #ef4444;
        border: 1px solid rgba(239,68,68,0.25);
      }
      .al-badge-del .al-badge-dot { background: #ef4444; }

      .al-badge-dispatch {
        background: rgba(249,115,22,0.12);
        color: #f97316;
        border: 1px solid rgba(249,115,22,0.25);
      }
      .al-badge-dispatch .al-badge-dot { background: #f97316; }

      .al-badge-close {
        background: rgba(168,85,247,0.12);
        color: #a855f7;
        border: 1px solid rgba(168,85,247,0.25);
      }
      .al-badge-close .al-badge-dot { background: #a855f7; }

      .al-badge-reopen {
        background: rgba(14,165,233,0.12);
        color: #0ea5e9;
        border: 1px solid rgba(14,165,233,0.25);
      }
      .al-badge-reopen .al-badge-dot { background: #0ea5e9; }

      .al-badge-sys {
        background: var(--clr-surface-2);
        color: var(--clr-text-muted);
        border: 1px solid var(--clr-border);
      }
      .al-badge-sys .al-badge-dot { background: var(--clr-text-muted); }

      /* Detail Box */
      .al-detail-box {
        display: flex;
        flex-direction: column;
        gap: 3px;
      }
      .al-detail-title-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }
      .al-detail-title {
        font-weight: 600;
        color: var(--clr-text);
        font-size: 13px;
      }
      .al-detail-meta {
        font-size: 11px;
        color: var(--clr-text-muted);
      }
      .al-tag-pill {
        display: inline-block;
        padding: 1px 6px;
        border-radius: 4px;
        font-size: 10px;
        font-weight: 700;
        background: var(--clr-surface-2);
        color: var(--clr-text-muted);
        border: 1px solid var(--clr-border);
      }
      .al-tag-pill.pickup {
        background: rgba(14,165,233,0.1);
        color: #0284c7;
        border-color: rgba(14,165,233,0.25);
      }
      .al-tag-pill.deliver {
        background: rgba(217,119,6,0.1);
        color: #d97706;
        border-color: rgba(217,119,6,0.25);
      }
      .al-raw-toggle {
        font-size: 10px;
        color: var(--clr-text-muted);
        cursor: pointer;
        text-decoration: underline;
        margin-left: 4px;
      }
      .al-raw-toggle:hover { color: var(--clr-primary); }
      .al-raw-text {
        font-family: monospace;
        font-size: 11px;
        color: var(--clr-text-muted);
        background: var(--clr-surface-2);
        padding: 4px 8px;
        border-radius: 4px;
        margin-top: 4px;
        word-break: break-all;
      }

      /* Empty State */
      .al-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 60px 20px;
        text-align: center;
        gap: 12px;
        color: var(--clr-text-muted);
      }
      .al-empty-icon {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: var(--clr-surface-2);
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--clr-text-muted);
      }
      .al-empty-icon svg { width: 24px; height: 24px; }
      .al-empty-title {
        font-size: 15px;
        font-weight: 700;
        color: var(--clr-text);
      }
      .al-empty-desc {
        font-size: 12px;
        max-width: 320px;
        line-height: 1.5;
      }
    </style>

    <div class="al-screen fade-in">
      <!-- Header -->
      <div class="al-header">
        <div class="al-title-wrap">
          <div class="al-icon-box">
            ${config.icon}
          </div>
          <div>
            <h1 class="al-title">${config.title}</h1>
            <div class="al-subtitle">${config.subtitle}</div>
          </div>
        </div>
        <div class="al-header-actions">
          <button id="al-btn-export" class="al-btn-action" title="Export current logs as CSV">
            ${Icons.download} Export CSV
          </button>
        </div>
      </div>

      <!-- Toolbar -->
      <div class="al-toolbar">
        <div class="al-controls">
          <!-- Row 1: Month & Quick Scope -->
          <div class="al-controls-row">
            <div class="al-date-group">
              <div class="al-date-wrap">
                <input type="text" id="al-month-input" class="al-date-input" readonly />
                <span class="al-date-icon">${Icons.calendar}</span>
              </div>
              <div class="al-scope-chips">
                <button class="al-scope-chip active" data-scope="month" type="button">All Month</button>
                <button class="al-scope-chip" data-scope="today" type="button">Today</button>
                <button class="al-scope-chip" data-scope="yesterday" type="button">Yesterday</button>
              </div>
            </div>
          </div>

          <!-- Row 2: Filter + Search + Toggle + Refresh -->
          <div class="al-controls-row">
            <select id="al-action-filter" class="al-select">
              <option value="">All Actions</option>
              ${config.actionOptions.map(opt => `<option value="${opt.value}">${opt.label}</option>`).join('')}
            </select>

            <div class="al-search-wrap" style="flex:1;min-width:160px;">
              <span class="al-search-icon">${Icons.search}</span>
              <input type="text" id="al-search-input" class="al-search-input" placeholder="Search item, date, price, action..." />
            </div>

            <label class="al-toggle-wrap" title="Hide repetitive system auto-save logs to view real transactions only">
              <input type="checkbox" id="al-toggle-autosaves" class="al-toggle-checkbox" checked />
              <span>Hide Auto-Saves</span>
            </label>

            <button id="al-refresh-btn" class="al-btn-refresh" title="Reload Logs" aria-label="Reload Logs">
              ${Icons.refreshCw}
            </button>
          </div>
        </div>
      </div>

      <!-- Summary Metrics Bar -->
      <div class="al-metrics-bar" id="al-metrics-bar">
        <button class="al-metric-chip active" id="al-metric-total" data-filter="">0 Total Events</button>
        <button class="al-metric-chip add" id="al-metric-add" data-filter="ADD">0 Added</button>
        <button class="al-metric-chip edit" id="al-metric-edit" data-filter="EDIT">0 Edited</button>
        <button class="al-metric-chip del" id="al-metric-del" data-filter="DEL">0 Deleted</button>
        <button class="al-metric-chip sys" id="al-metric-sys" data-filter="SYS">0 Auto-Saves</button>
      </div>

      <!-- Log Table Card -->
      <div class="al-card">
        <div class="al-scroll-wrap custom-scroll">
          <table class="al-table">
            <colgroup>
              <col style="width: 170px; min-width: 170px;">
              <col style="width: 170px; min-width: 170px;">
              <col style="width: 140px; min-width: 140px;">
              <col style="width: auto;">
            </colgroup>
            <thead>
              <tr>
                <th>TIMESTAMP</th>
                <th>FOR SHEET</th>
                <th>ACTION</th>
                <th>DETAILS & EVENT DATA</th>
              </tr>
            </thead>
            <tbody id="al-tbody">
              <!-- Rendered dynamically -->
            </tbody>
          </table>
          <div id="al-empty-state" class="al-empty hidden">
            <div class="al-empty-icon">${Icons.clipboardList}</div>
            <div class="al-empty-title">No Audit Logs Found</div>
            <div class="al-empty-desc">There are no matching log events recorded for the selected filter or search query.</div>
          </div>
        </div>
      </div>
    </div>
  `

  const q = <T extends HTMLElement>(s: string) => container.querySelector(s) as T

  const monthInput     = q<HTMLInputElement>('#al-month-input')
  const actionFilter   = q<HTMLSelectElement>('#al-action-filter')
  const searchInput    = q<HTMLInputElement>('#al-search-input')
  const hideAutoSaves  = q<HTMLInputElement>('#al-toggle-autosaves')
  const refreshBtn     = q<HTMLButtonElement>('#al-refresh-btn')
  const exportBtn      = q<HTMLButtonElement>('#al-btn-export')
  const tbody          = q<HTMLElement>('#al-tbody')
  const emptyState     = q<HTMLElement>('#al-empty-state')

  const metricTotal    = q<HTMLButtonElement>('#al-metric-total')
  const metricAdd      = q<HTMLButtonElement>('#al-metric-add')
  const metricEdit     = q<HTMLButtonElement>('#al-metric-edit')
  const metricDel      = q<HTMLButtonElement>('#al-metric-del')
  const metricSys      = q<HTMLButtonElement>('#al-metric-sys')

  const scopeChips     = container.querySelectorAll<HTMLButtonElement>('.al-scope-chip')

  let parsedLogs: ParsedLog[] = []
  let activeScope: 'month' | 'today' | 'yesterday' = 'month'
  let activeMetricFilter: string = ''

  // Initialize flatpickr for Month selection
  flatpickr(monthInput, {
    plugins: [
      monthSelectPlugin({
        shorthand: true,
        dateFormat: 'Y-m',
        altFormat: 'F Y'
      })
    ],
    defaultDate: currentMonth,
    maxDate: 'today',
    disableMobile: true,
    onChange: () => {
      // Reset scope to month when user changes month picker
      setScope('month')
      loadLogs()
    }
  })

  function setScope(scope: 'month' | 'today' | 'yesterday') {
    activeScope = scope
    scopeChips.forEach(chip => {
      chip.classList.toggle('active', chip.dataset.scope === scope)
    })
    renderTable()
  }

  scopeChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const scope = chip.dataset.scope as 'month' | 'today' | 'yesterday'
      setScope(scope)
    })
  })

  // Metric chip filtering
  const metricChips = [metricTotal, metricAdd, metricEdit, metricDel, metricSys]
  metricChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const filter = chip.dataset.filter || ''
      if (activeMetricFilter === filter && filter !== '') {
        activeMetricFilter = ''
      } else {
        activeMetricFilter = filter
      }

      // If user clicked Auto-Saves, uncheck "Hide Auto-Saves" automatically so they become visible
      if (filter === 'SYS' && hideAutoSaves.checked) {
        hideAutoSaves.checked = false
      }

      metricChips.forEach(c => {
        c.classList.toggle('active', (c.dataset.filter || '') === activeMetricFilter)
      })
      renderTable()
    })
  })

  const renderTable = () => {
    const query = searchInput.value.trim().toLowerCase()
    const selectedAction = actionFilter.value
    const shouldHideAutoSaves = hideAutoSaves.checked

    // 1. Calculate overall counts for the current month loaded
    const totalCount = parsedLogs.length
    const addCount = parsedLogs.filter(l => l.badgeClass === 'add').length
    const editCount = parsedLogs.filter(l => l.badgeClass === 'edit').length
    const delCount = parsedLogs.filter(l => l.badgeClass === 'del').length
    const sysCount = parsedLogs.filter(l => l.isAutoSave).length

    metricTotal.textContent = `${totalCount} Total`
    metricAdd.textContent = `${addCount} Added`
    metricEdit.textContent = `${editCount} Edited`
    metricDel.textContent = `${delCount} Deleted`
    metricSys.textContent = `${sysCount} Auto-Saves`

    // 2. Filter parsed logs
    const filtered = parsedLogs.filter(log => {
      // Scope filter (Today / Yesterday / Month)
      if (activeScope === 'today') {
        if (log.eventDate !== todayStr && log.targetSheetDate !== todayStr) return false
      } else if (activeScope === 'yesterday') {
        if (log.eventDate !== yesterdayStr && log.targetSheetDate !== yesterdayStr) return false
      }

      // Hide auto-saves toggle
      if (shouldHideAutoSaves && log.isAutoSave) {
        // If metric filter is specifically SYS, don't hide
        if (activeMetricFilter !== 'SYS') return false
      }

      // Metric filter (ADD / EDIT / DEL / SYS)
      if (activeMetricFilter) {
        if (activeMetricFilter === 'ADD' && log.badgeClass !== 'add') return false
        if (activeMetricFilter === 'EDIT' && log.badgeClass !== 'edit') return false
        if (activeMetricFilter === 'DEL' && log.badgeClass !== 'del') return false
        if (activeMetricFilter === 'SYS' && !log.isAutoSave) return false
      }

      // Action dropdown filter
      if (selectedAction) {
        const allowed = selectedAction.split(',')
        if (!allowed.includes(log.raw.action)) return false
      }

      // Search query
      if (query) {
        const fullSearchString = `
          ${log.raw.action} 
          ${log.raw.details} 
          ${log.primaryTitle} 
          ${log.detailMeta} 
          ${log.timeFormatted} 
          ${log.dateFormatted} 
          ${log.targetSheetFormatted || ''}
        `.toLowerCase()
        if (!fullSearchString.includes(query)) return false
      }

      return true
    })

    if (filtered.length === 0) {
      tbody.innerHTML = ''
      emptyState.classList.remove('hidden')
    } else {
      emptyState.classList.add('hidden')
      tbody.innerHTML = filtered.map((log, idx) => {
        // Tag pills
        const tagsHtml = log.tags.map(t => {
          const cls = t === 'PICKUP' ? 'pickup' : (t === 'DELIVER' ? 'deliver' : '')
          return `<span class="al-tag-pill ${cls}">${t}</span>`
        }).join('')

        // Target Sheet Pill (no emojis)
        let sheetPill = ''
        if (log.isCrossDate) {
          sheetPill = `
            <div class="al-sheet-pill cross-date" title="This action was recorded on ${log.dateFormatted}, but assigned to the ${log.targetSheetFormatted} sales sheet.">
              <span class="al-cross-warning">Diff Date</span>
              <span>Sheet: ${log.targetSheetFormatted}</span>
            </div>
          `
        } else {
          sheetPill = `
            <div class="al-sheet-pill" title="Assigned to ${log.targetSheetFormatted} sales sheet">
              <span>Sheet: ${log.targetSheetFormatted}</span>
            </div>
          `
        }

        return `
          <tr>
            <td>
              <div class="al-time-col">
                <span class="al-time-primary">${log.timeFormatted}</span>
                <span class="al-time-sub">
                  ${log.dateFormatted}
                  ${log.isToday ? '<span class="al-today-pill">Today</span>' : ''}
                </span>
              </div>
            </td>
            <td>
              ${sheetPill}
            </td>
            <td>
              <span class="al-badge al-badge-${log.badgeClass}">
                <span class="al-badge-dot"></span>
                <span>${log.badgeLabel}</span>
              </span>
            </td>
            <td>
              <div class="al-detail-box">
                <div class="al-detail-title-row">
                  <span class="al-detail-title">${log.primaryTitle}</span>
                  ${tagsHtml}
                  <a class="al-raw-toggle" data-idx="${idx}">raw</a>
                </div>
                ${log.detailMeta ? `<div class="al-detail-meta">${log.detailMeta}</div>` : ''}
                <div id="al-raw-${idx}" class="al-raw-text hidden">${log.raw.details}</div>
              </div>
            </td>
          </tr>
        `
      }).join('')

      // Bind raw toggles
      tbody.querySelectorAll<HTMLAnchorElement>('.al-raw-toggle').forEach(el => {
        el.addEventListener('click', (e) => {
          e.preventDefault()
          const idx = el.dataset.idx
          const rawEl = tbody.querySelector(`#al-raw-${idx}`)
          if (rawEl) {
            rawEl.classList.toggle('hidden')
          }
        })
      })
    }
  }

  const loadLogs = async () => {
    const month = monthInput.value
    if (!month) return

    refreshBtn.classList.add('spinning')
    refreshBtn.disabled = true
    tbody.innerHTML = `<tr><td colspan="4" style="padding:48px;text-align:center;"><div class="spinner" style="width:22px;height:22px;border-width:2px;margin:0 auto;"></div></td></tr>`
    emptyState.classList.add('hidden')

    try {
      const res = await config.fetchLogs(month)
      if (res.ok && res.data) {
        parsedLogs = res.data.map(entry => parseLogEntry(entry, todayStr))
        renderTable()
      } else {
        tbody.innerHTML = ''
        emptyState.classList.remove('hidden')
        emptyState.querySelector('.al-empty-desc')!.textContent = 'Failed to load logs: ' + (res.error || 'Unknown error')
      }
    } catch (e: any) {
      tbody.innerHTML = ''
      emptyState.classList.remove('hidden')
      emptyState.querySelector('.al-empty-desc')!.textContent = 'Error loading logs: ' + (e?.message || e)
    } finally {
      refreshBtn.classList.remove('spinning')
      refreshBtn.disabled = false
    }
  }

  // Export to CSV
  exportBtn.addEventListener('click', () => {
    if (parsedLogs.length === 0) {
      alert('No logs available to export.')
      return
    }

    const headers = ['Timestamp', 'Event Date', 'Event Time', 'Target Sheet Date', 'Cross Date Warning', 'Action', 'Action Label', 'Summary', 'Meta', 'Raw Details']
    const rows = parsedLogs.map(l => [
      `"${l.raw.timestamp}"`,
      `"${l.eventDate}"`,
      `"${l.timeFormatted}"`,
      `"${l.targetSheetDate || l.eventDate}"`,
      `"${l.isCrossDate ? 'YES (Different Date)' : 'NO'}"`,
      `"${l.raw.action}"`,
      `"${l.badgeLabel}"`,
      `"${l.primaryTitle.replace(/"/g, '""')}"`,
      `"${l.detailMeta.replace(/"/g, '""')}"`,
      `"${l.raw.details.replace(/"/g, '""')}"`
    ])

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${config.exportFileNamePrefix}_audit_logs_${monthInput.value}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  })

  refreshBtn.addEventListener('click', loadLogs)
  searchInput.addEventListener('input', renderTable)
  actionFilter.addEventListener('change', renderTable)
  hideAutoSaves.addEventListener('change', renderTable)

  // Initial load
  loadLogs()
}
