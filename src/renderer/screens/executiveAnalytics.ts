import { Icons } from '../components/icons'
import Chart from 'chart.js/auto'
import type { ExecutiveAnalyticsData } from '../../main/ipc/analyticsIpc'

let chartRevenueTrend: Chart | null = null
let chartRevenueMix: Chart | null = null
let chartWaterTypes: Chart | null = null
let chartModes: Chart | null = null

function fmtCurrency(n: number | undefined | null): string {
  const val = Number(n) || 0
  return '₱' + val.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtNumber(n: number | undefined | null): string {
  const val = Number(n) || 0
  return val.toLocaleString('en-PH')
}

function fmtCompact(n: number | undefined | null): string {
  const val = Number(n) || 0
  if (Math.abs(val) >= 1_000_000) return '₱' + (val / 1_000_000).toFixed(2) + 'M'
  if (Math.abs(val) >= 1_000) return '₱' + (val / 1_000).toFixed(1) + 'K'
  return fmtCurrency(val)
}

export async function renderExecutiveAnalyticsScreen(container: HTMLElement): Promise<void> {
  const now = new Date()
  const currentYear = now.getFullYear()

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;overflow-y:auto;" class="custom-scroll">
      <!-- Top Control Bar -->
      <div style="padding:14px 28px;background:var(--clr-surface);border-bottom:1px solid var(--clr-border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;position:sticky;top:0;z-index:10;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:34px;height:34px;border-radius:8px;background:var(--clr-surface-2);border:1px solid var(--clr-border);display:flex;align-items:center;justify-content:center;color:var(--clr-primary);">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
          </div>
          <div>
            <h2 style="margin:0;font-size:15px;font-weight:700;color:var(--clr-text);letter-spacing:-0.01em;">Executive Dashboard</h2>
            <p style="margin:1px 0 0;font-size:11px;color:var(--clr-text-muted);">Business performance overview &amp; key indicators</p>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <select id="exec-sel-year" style="padding:6px 12px;border-radius:8px;border:1px solid var(--clr-border);background:var(--clr-surface);color:var(--clr-text);font-size:13px;font-weight:600;cursor:pointer;"></select>
          <select id="exec-sel-month" style="padding:6px 12px;border-radius:8px;border:1px solid var(--clr-border);background:var(--clr-surface);color:var(--clr-text);font-size:13px;font-weight:600;cursor:pointer;">
            <option value="0">All Months</option>
            <option value="1">January</option><option value="2">February</option><option value="3">March</option>
            <option value="4">April</option><option value="5">May</option><option value="6">June</option>
            <option value="7">July</option><option value="8">August</option><option value="9">September</option>
            <option value="10">October</option><option value="11">November</option><option value="12">December</option>
          </select>
          <button class="btn btn-ghost btn-icon" id="exec-refresh-btn" title="Refresh Dashboard" style="padding:7px;border:1px solid var(--clr-border);border-radius:8px;">${Icons.refreshCw}</button>
        </div>
      </div>

      <!-- Dashboard Main Body -->
      <div id="exec-dashboard-content" style="padding:22px 28px 40px;display:flex;flex-direction:column;gap:20px;">
        <div style="display:flex;justify-content:center;padding:60px;"><div class="spinner"></div></div>
      </div>
    </div>
  `

  const yearSel = document.getElementById('exec-sel-year') as HTMLSelectElement
  const monthSel = document.getElementById('exec-sel-month') as HTMLSelectElement
  const refreshBtn = document.getElementById('exec-refresh-btn')

  const years = [currentYear + 1, currentYear, 2026, 2025, 2024, 2023, 2022]
  const uniqueYears = [...new Set(years)].sort((a, b) => b - a)
  yearSel.innerHTML = `<option value="0">All Time</option>` + uniqueYears.map(y => `<option value="${y}">${y}</option>`).join('')
  yearSel.value = '0'
  monthSel.style.display = 'none'

  async function loadDashboard() {
    const y = parseInt(yearSel.value, 10)
    monthSel.style.display = y === 0 ? 'none' : 'inline-block'
    const m = y === 0 ? 0 : parseInt(monthSel.value, 10)
    const contentArea = document.getElementById('exec-dashboard-content')!
    contentArea.innerHTML = `<div style="display:flex;justify-content:center;padding:60px;"><div class="spinner"></div></div>`

    try {
      const res = await (window.api as any).getExecutiveAnalytics(y, m)
      if (!res.ok) throw new Error(res.error)
      const data: ExecutiveAnalyticsData = res.data
      renderDashboard(contentArea, data)
    } catch (e) {
      contentArea.innerHTML = `<div style="padding:40px;text-align:center;color:var(--clr-error);">Failed to load analytics: ${String(e)}</div>`
    }
  }

  yearSel.addEventListener('change', loadDashboard)
  monthSel.addEventListener('change', loadDashboard)
  refreshBtn?.addEventListener('click', loadDashboard)

  await loadDashboard()
}

// ─── Analytics Reusable UI Helpers ──────────────────────────────────────────

/** Section Header to group dashboard tiers */
function sectionHeader(title: string, subtitle: string, tag?: string): string {
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;gap:8px;">
      <div>
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:var(--clr-text-muted);">${title}</div>
        <div style="font-size:11px;color:var(--clr-text-dim);margin-top:1px;">${subtitle}</div>
      </div>
      ${tag ? `<span style="font-size:10px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:var(--clr-text-muted);background:var(--clr-surface-2);border:1px solid var(--clr-border);padding:2px 8px;border-radius:4px;">${tag}</span>` : ''}
    </div>
  `
}

/** Standard Chart Container Card */
function chartCard(title: string, subtitle: string, canvasId: string, height = 260, headerRightHtml = ''): string {
  return `
    <div style="background:var(--clr-surface);border:1px solid var(--clr-border);border-radius:10px;padding:18px 20px;display:flex;flex-direction:column;">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:14px;gap:12px;">
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--clr-text);">${title}</div>
          <div style="font-size:11px;color:var(--clr-text-muted);margin-top:2px;">${subtitle}</div>
        </div>
        ${headerRightHtml}
      </div>
      <div style="height:${height}px;position:relative;width:100%;">
        <canvas id="${canvasId}"></canvas>
      </div>
    </div>
  `
}

function legendDot(color: string, label: string): string {
  return `<span style="display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:600;color:var(--clr-text-muted);"><span style="width:8px;height:8px;border-radius:2px;background:${color};flex-shrink:0;"></span>${label}</span>`
}

/** Horizontal bar showing category breakdown */
function breakdownBar(label: string, pct: number, value: string, color: string): string {
  const safePct = Math.min(Math.max(pct, 0), 100)
  return `
    <div style="display:flex;flex-direction:column;gap:4px;">
      <div style="display:flex;justify-content:space-between;align-items:center;font-size:11.5px;">
        <span style="font-weight:600;color:var(--clr-text);">${label}</span>
        <span style="color:var(--clr-text-muted);">${value} &nbsp;<span style="color:${color};font-weight:700;">${safePct.toFixed(1)}%</span></span>
      </div>
      <div style="height:5px;background:var(--clr-surface-2);border-radius:4px;overflow:hidden;">
        <div style="height:100%;width:${safePct}%;background:${color};border-radius:4px;"></div>
      </div>
    </div>
  `
}

/** Ranked table list for top items & expenses */
function rankTable(rows: { rank: number; name: string; primary: string; secondary: string }[], emptyMsg: string): string {
  if (rows.length === 0) {
    return `<div style="padding:28px;text-align:center;font-size:12px;color:var(--clr-text-dim);">${emptyMsg}</div>`
  }
  return `
    <div style="display:flex;flex-direction:column;">
      ${rows.map(r => `
        <div style="display:flex;align-items:center;gap:12px;padding:9px 0;border-bottom:1px solid var(--clr-border);">
          <span style="font-size:11px;font-weight:700;color:var(--clr-text-dim);width:20px;text-align:center;flex-shrink:0;">#${r.rank}</span>
          <span style="font-size:12.5px;font-weight:600;color:var(--clr-text);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${r.name}">${r.name}</span>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-size:12.5px;font-weight:700;color:var(--clr-text);">${r.primary}</div>
            <div style="font-size:10.5px;color:var(--clr-text-muted);">${r.secondary}</div>
          </div>
        </div>
      `).join('')}
    </div>
  `
}

// ─── Main Dashboard Renderer ────────────────────────────────────────────────

function renderDashboard(container: HTMLElement, data: ExecutiveAnalyticsData): void {
  const {
    kpis,
    trends = [],
    waterTypeBreakdown = [],
    modeBreakdown = [],
    topItems = [],
    topExpenses = [],
    inventoryStats,
    period = { year: 0, month: 0, label: 'All Time' }
  } = data || {}

  // Safe numerical accessors
  const safeKpis = {
    totalRevenue:          Number(kpis?.totalRevenue) || 0,
    waterRevenue:          Number(kpis?.waterRevenue) || 0,
    itemRevenue:           Number(kpis?.itemRevenue) || 0,
    netProfit:             Number(kpis?.netProfit) || 0,
    totalExpenses:         Number(kpis?.totalExpenses) || 0,
    profitMargin:          Number(kpis?.profitMargin) || 0,
    totalContainersRefilled: Number(kpis?.totalContainersRefilled) || 0,
    totalDaysActive:       Number(kpis?.totalDaysActive) || 0,
    avgDailyRevenue:       Number(kpis?.avgDailyRevenue) || 0,
  }
  const safeInv = {
    totalInventoryValueCost: Number(inventoryStats?.totalInventoryValueCost) || 0,
    totalInventoryValueSrp:  Number(inventoryStats?.totalInventoryValueSrp) || 0,
    totalSkus:               Number(inventoryStats?.totalSkus) || 0,
    lowStockCount:           Number(inventoryStats?.lowStockCount) || 0,
  }

  // Calculated shares
  const waterRevShare = safeKpis.totalRevenue > 0 ? (safeKpis.waterRevenue / safeKpis.totalRevenue) * 100 : 0
  const itemRevShare  = safeKpis.totalRevenue > 0 ? (safeKpis.itemRevenue  / safeKpis.totalRevenue) * 100 : 0
  const expenseRatio  = safeKpis.totalRevenue > 0 ? (safeKpis.totalExpenses / safeKpis.totalRevenue) * 100 : 0

  // Palette: Clean, solid, no eye-straining gradients
  const WATER_COLORS = ['#0284c7', '#2563eb', '#0d9488', '#eab308', '#ec4899', '#7c3aed']
  const MODE_COLORS  = ['#2563eb', '#10b981', '#f59e0b', '#ec4899']

  const marginColor = safeKpis.profitMargin >= 50 ? '#10b981' : safeKpis.profitMargin >= 25 ? '#f59e0b' : '#ef4444'
  const profitColor = safeKpis.netProfit >= 0 ? '#10b981' : '#ef4444'

  const waterTotalVolume = waterTypeBreakdown.reduce((s, w) => s + (Number(w.volume) || 0), 0) || 1
  const modeTotalVolume  = modeBreakdown.reduce((s, m) => s + (Number(m.volume) || 0), 0) || 1

  // Dark / light mode styling
  const isDark    = document.documentElement.getAttribute('data-theme') === 'dark'
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
  const tickColor = isDark ? '#64748b' : '#94a3b8'
  const borderBg  = isDark ? '#171a21' : '#ffffff'

  container.innerHTML = `
    <!-- ── Filter Period Indicator ────────────────────────────────────────── -->
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:var(--clr-surface);border:1px solid var(--clr-border);border-radius:8px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--clr-text-muted);">Reporting Window:</span>
        <span style="font-size:12.5px;font-weight:700;color:var(--clr-text);">${period.label}</span>
      </div>
      <div style="font-size:11px;color:var(--clr-text-dim);">
        Data consolidated from Refill Logs, POS Sales, and Daily Expenses
      </div>
    </div>

    <!-- ── LEVEL 1: PRIMARY FINANCIAL PERFORMANCE (P&L) ───────────────────── -->
    <div>
      ${sectionHeader('Level 1: Financial Performance (P&L)', 'Top-line business revenue and bottom-line retained earnings', 'Core Performance')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        
        <!-- Card 1: Gross Revenue (Hero) -->
        <div style="background:var(--clr-surface);border:1px solid var(--clr-border);border-top:3px solid #0284c7;border-radius:10px;padding:20px;display:flex;flex-direction:column;gap:14px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
            <div>
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--clr-text-muted);">Total Gross Revenue</div>
              <div style="font-size:28px;font-weight:800;color:var(--clr-text);letter-spacing:-0.03em;margin-top:4px;line-height:1.1;">
                ${fmtCurrency(safeKpis.totalRevenue)}
              </div>
            </div>
            <span style="font-size:11px;font-weight:700;color:#0284c7;background:rgba(2,132,199,0.08);border:1px solid rgba(2,132,199,0.2);padding:3px 8px;border-radius:6px;white-space:nowrap;">
              Inflow
            </span>
          </div>

          <!-- Revenue Composition Breakdown -->
          <div style="background:var(--clr-surface-2);border:1px solid var(--clr-border);border-radius:8px;padding:10px 14px;display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:600;color:var(--clr-text-muted);">
              <span>Revenue Streams</span>
              <span>Water: ${waterRevShare.toFixed(1)}% &nbsp;|&nbsp; Merch: ${itemRevShare.toFixed(1)}%</span>
            </div>
            <!-- Split Bar -->
            <div style="height:6px;background:var(--clr-surface);border-radius:4px;overflow:hidden;display:flex;">
              <div style="width:${waterRevShare}%;background:#0284c7;" title="Water Refills: ${waterRevShare.toFixed(1)}%"></div>
              <div style="width:${itemRevShare}%;background:#7c3aed;" title="Merchandise: ${itemRevShare.toFixed(1)}%"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:2px;">
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="width:8px;height:8px;border-radius:2px;background:#0284c7;"></span>
                <span style="color:var(--clr-text-muted);">Refills:</span>
                <strong style="color:var(--clr-text);">${fmtCurrency(safeKpis.waterRevenue)}</strong>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="width:8px;height:8px;border-radius:2px;background:#7c3aed;"></span>
                <span style="color:var(--clr-text-muted);">Merchandise:</span>
                <strong style="color:var(--clr-text);">${fmtCurrency(safeKpis.itemRevenue)}</strong>
              </div>
            </div>
          </div>
        </div>

        <!-- Card 2: Net Operating Income (Hero) -->
        <div style="background:var(--clr-surface);border:1px solid var(--clr-border);border-top:3px solid ${profitColor};border-radius:10px;padding:20px;display:flex;flex-direction:column;gap:14px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
            <div>
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--clr-text-muted);">Net Operating Income</div>
              <div style="font-size:28px;font-weight:800;color:${profitColor};letter-spacing:-0.03em;margin-top:4px;line-height:1.1;">
                ${fmtCurrency(safeKpis.netProfit)}
              </div>
            </div>
            <span style="font-size:11px;font-weight:700;color:${marginColor};background:color-mix(in srgb, ${marginColor} 10%, transparent);border:1px solid color-mix(in srgb, ${marginColor} 25%, transparent);padding:3px 8px;border-radius:6px;white-space:nowrap;">
              ${safeKpis.profitMargin.toFixed(1)}% Margin
            </span>
          </div>

          <!-- Profit Breakdown -->
          <div style="background:var(--clr-surface-2);border:1px solid var(--clr-border);border-radius:8px;padding:10px 14px;display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:600;color:var(--clr-text-muted);">
              <span>Expense Burn</span>
              <span>Deductions: ${expenseRatio.toFixed(1)}% of Revenue</span>
            </div>
            <!-- Expense Burn Bar -->
            <div style="height:6px;background:var(--clr-surface);border-radius:4px;overflow:hidden;display:flex;">
              <div style="width:${Math.min(expenseRatio, 100)}%;background:#ef4444;" title="Expenses: ${expenseRatio.toFixed(1)}%"></div>
              <div style="width:${Math.max(100 - expenseRatio, 0)}%;background:#10b981;" title="Retained Net: ${(100 - expenseRatio).toFixed(1)}%"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:2px;">
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="width:8px;height:8px;border-radius:2px;background:#ef4444;"></span>
                <span style="color:var(--clr-text-muted);">Operating Expenses:</span>
                <strong style="color:#ef4444;">-${fmtCurrency(safeKpis.totalExpenses)}</strong>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="width:8px;height:8px;border-radius:2px;background:#10b981;"></span>
                <span style="color:var(--clr-text-muted);">Retained Profit:</span>
                <strong style="color:#10b981;">${fmtCurrency(safeKpis.netProfit)}</strong>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- ── LEVEL 2 & 3: OPERATIONS & ASSET INVENTORY ──────────────────────── -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      
      <!-- Operations & Throughput -->
      <div>
        ${sectionHeader('Level 2: Operational Throughput', 'Production activity and sales pace across this period', 'Activity')}
        <div style="background:var(--clr-surface);border:1px solid var(--clr-border);border-left:3px solid #2563eb;border-radius:10px;padding:16px 18px;display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--clr-text-muted);">Water Volume Refilled</div>
            <span style="font-size:10.5px;font-weight:700;color:#2563eb;background:rgba(37,99,235,0.08);border:1px solid rgba(37,99,235,0.2);padding:2px 7px;border-radius:4px;">
              ${safeKpis.totalDaysActive} Active Days
            </span>
          </div>
          <div style="display:flex;align-items:baseline;gap:6px;">
            <span style="font-size:24px;font-weight:800;color:var(--clr-text);">${fmtNumber(safeKpis.totalContainersRefilled)}</span>
            <span style="font-size:12px;color:var(--clr-text-muted);font-weight:600;">containers refilled</span>
          </div>
          <div style="font-size:11.5px;color:var(--clr-text-muted);border-top:1px solid var(--clr-border);padding-top:8px;display:flex;justify-content:space-between;">
            <span>Average Daily Pace:</span>
            <strong style="color:var(--clr-text);">${fmtCurrency(safeKpis.avgDailyRevenue)} / day</strong>
          </div>
        </div>
      </div>

      <!-- Inventory Asset Valuation (Snapshot) -->
      <div>
        ${sectionHeader('Level 3: Inventory Valuation', 'Capital tied in stock (Current warehouse snapshot)', 'Asset State')}
        <div style="background:var(--clr-surface);border:1px solid var(--clr-border);border-left:3px solid #f59e0b;border-radius:10px;padding:16px 18px;display:flex;flex-direction:column;gap:10px;">
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--clr-text-muted);">Current Stock Asset Value</div>
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:10.5px;font-weight:700;color:#f59e0b;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.2);padding:2px 7px;border-radius:4px;">
                ${safeInv.totalSkus} SKUs
              </span>
              ${safeInv.lowStockCount > 0 ? `
                <span style="font-size:10.5px;font-weight:700;color:#ef4444;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);padding:2px 7px;border-radius:4px;">
                  ${safeInv.lowStockCount} Low Stock
                </span>
              ` : ''}
            </div>
          </div>
          <div style="display:flex;align-items:baseline;gap:6px;">
            <span style="font-size:24px;font-weight:800;color:var(--clr-text);">${fmtCurrency(safeInv.totalInventoryValueCost)}</span>
            <span style="font-size:12px;color:var(--clr-text-muted);font-weight:600;">at purchase cost</span>
          </div>
          <div style="font-size:11.5px;color:var(--clr-text-muted);border-top:1px solid var(--clr-border);padding-top:8px;display:flex;justify-content:space-between;">
            <span>Retail Valuation (SRP):</span>
            <strong style="color:var(--clr-text);">${fmtCurrency(safeInv.totalInventoryValueSrp)}</strong>
          </div>
        </div>
      </div>

    </div>

    <!-- ── CHARTS: TRAJECTORY TIMELINE ────────────────────────────────────── -->
    <div>
      ${sectionHeader('Revenue & Profit Trajectory', 'Daily financial progression across the selected period')}
      ${chartCard(
        'Financial Timeline',
        'Water sales, merchandise, operational expenses, and net profit over time',
        'exec-chart-trend',
        260,
        `
          <div style="display:flex;gap:12px;flex-wrap:wrap;justify-content:flex-end;">
            ${legendDot('#0284c7', 'Water Sales')}
            ${legendDot('#7c3aed', 'Item Sales')}
            ${legendDot('#ef4444', 'Expenses')}
            ${legendDot('#10b981', 'Net Profit')}
          </div>
        `
      )}
    </div>

    <!-- ── REVENUE COMPOSITION & TOP MERCHANDISE ──────────────────────────── -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      
      <!-- Revenue Mix Bar Chart -->
      <div>
        ${sectionHeader('Revenue Mix', 'Contribution by primary business activity')}
        ${chartCard('Revenue by Stream', 'Direct comparison between water refills and merchandise sales', 'exec-chart-mix', 200)}
      </div>

      <!-- Top Merchandise Leaderboard -->
      <div>
        ${sectionHeader('Top Merchandise', 'Highest grossing inventory products')}
        <div style="background:var(--clr-surface);border:1px solid var(--clr-border);border-radius:10px;padding:16px 20px;height:258px;overflow-y:auto;" class="custom-scroll">
          ${rankTable(
            (topItems || []).slice(0, 8).map((item, i) => ({
              rank: i + 1,
              name: item.name || 'Product',
              primary: fmtCurrency(item.revenue),
              secondary: `${fmtNumber(item.qty)} units sold`
            })),
            'No merchandise sales recorded for this period.'
          )}
        </div>
      </div>

    </div>

    <!-- ── DISTRIBUTION: WATER TYPES & CHANNELS ───────────────────────────── -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      
      <!-- Water Type Distribution -->
      <div>
        ${sectionHeader('Water Type Distribution', 'Breakdown of refill volume by purification type')}
        <div style="background:var(--clr-surface);border:1px solid var(--clr-border);border-radius:10px;padding:18px 20px;">
          <div style="display:grid;grid-template-columns:160px 1fr;gap:20px;align-items:center;">
            <div style="height:150px;position:relative;">
              <canvas id="exec-chart-watertypes"></canvas>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">
              ${(waterTypeBreakdown || []).slice(0, 5).map((w, i) => {
                const vol = Number(w.volume) || 0
                return breakdownBar(w.type, (vol / waterTotalVolume) * 100, `${fmtNumber(vol)} cntr`, WATER_COLORS[i % WATER_COLORS.length])
              }).join('')}
            </div>
          </div>
        </div>
      </div>

      <!-- Sales Channel Distribution -->
      <div>
        ${sectionHeader('Fulfillment Mode', 'Delivery vs. Walk-in counter distribution')}
        <div style="background:var(--clr-surface);border:1px solid var(--clr-border);border-radius:10px;padding:18px 20px;">
          <div style="display:grid;grid-template-columns:160px 1fr;gap:20px;align-items:center;">
            <div style="height:150px;position:relative;">
              <canvas id="exec-chart-modes"></canvas>
            </div>
            <div style="display:flex;flex-direction:column;gap:10px;">
              ${(modeBreakdown || []).map((m, i) => {
                const vol = Number(m.volume) || 0
                return breakdownBar(m.mode, (vol / modeTotalVolume) * 100, fmtCurrency(m.revenue), MODE_COLORS[i % MODE_COLORS.length])
              }).join('')}
            </div>
          </div>
        </div>
      </div>

    </div>

    <!-- ── OPERATING EXPENSES LEADERBOARD ─────────────────────────────────── -->
    ${topExpenses && topExpenses.length > 0 ? `
    <div>
      ${sectionHeader('Top Operating Expenses', 'Largest operational costs recorded during this period')}
      <div style="background:var(--clr-surface);border:1px solid var(--clr-border);border-radius:10px;padding:16px 20px;">
        ${rankTable(
          topExpenses.slice(0, 6).map((exp: any, i: number) => ({
            rank: i + 1,
            name: exp.description || 'Operating Expense',
            primary: fmtCurrency(exp.total ?? exp.amount),
            secondary: `${exp.count ?? 1} ${(exp.count ?? 1) === 1 ? 'record' : 'records'}`
          })),
          'No expenses recorded for this period.'
        )}
      </div>
    </div>
    ` : ''}
  `

  // ─── Destroy & Re-instantiate Chart.js Instances ─────────────────────────
  if (chartRevenueTrend) { chartRevenueTrend.destroy(); chartRevenueTrend = null }
  if (chartRevenueMix)   { chartRevenueMix.destroy();   chartRevenueMix   = null }
  if (chartWaterTypes)   { chartWaterTypes.destroy();   chartWaterTypes   = null }
  if (chartModes)        { chartModes.destroy();        chartModes        = null }

  // 1. Trajectory Trend Line Chart
  const ctxTrend = (document.getElementById('exec-chart-trend') as HTMLCanvasElement)?.getContext('2d')
  if (ctxTrend && trends && trends.length > 0) {
    const labels = trends.map(t => (t.date || '').substring(5))
    chartRevenueTrend = new Chart(ctxTrend, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Net Profit',
            data: trends.map(t => Number(t.netProfit) || 0),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.08)',
            fill: true,
            tension: 0.3,
            borderWidth: 2.2,
            pointRadius: trends.length > 35 ? 0 : 3
          },
          {
            label: 'Water Sales',
            data: trends.map(t => Number(t.waterRevenue) || 0),
            borderColor: '#0284c7',
            backgroundColor: 'transparent',
            borderDash: [4, 4],
            tension: 0.3,
            borderWidth: 2,
            pointRadius: trends.length > 35 ? 0 : 2
          },
          {
            label: 'Item Sales',
            data: trends.map(t => Number(t.itemRevenue) || 0),
            borderColor: '#7c3aed',
            backgroundColor: 'transparent',
            tension: 0.3,
            borderWidth: 2,
            pointRadius: trends.length > 35 ? 0 : 2
          },
          {
            label: 'Expenses',
            data: trends.map(t => Number(t.expenses) || 0),
            borderColor: '#ef4444',
            backgroundColor: 'transparent',
            tension: 0.3,
            borderWidth: 1.5,
            pointRadius: trends.length > 35 ? 0 : 2
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` ${ctx.dataset.label}: ${fmtCurrency(Number(ctx.raw) || 0)}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: tickColor, maxTicksLimit: 12, font: { size: 11 } }
          },
          y: {
            grid: { color: gridColor },
            ticks: { color: tickColor, font: { size: 11 }, callback: (v) => fmtCompact(Number(v) || 0) }
          }
        }
      }
    })
  }

  // 2. Revenue Mix Horizontal Bar Chart
  const ctxMix = (document.getElementById('exec-chart-mix') as HTMLCanvasElement)?.getContext('2d')
  if (ctxMix) {
    chartRevenueMix = new Chart(ctxMix, {
      type: 'bar',
      data: {
        labels: ['Water Refills', 'Merchandise'],
        datasets: [{
          label: 'Revenue',
          data: [safeKpis.waterRevenue, safeKpis.itemRevenue],
          backgroundColor: ['#0284c7', '#7c3aed'],
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${fmtCurrency(Number(ctx.raw) || 0)}` } }
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: tickColor, font: { size: 11 }, callback: (v) => fmtCompact(Number(v) || 0) }
          },
          y: {
            grid: { display: false },
            ticks: { color: tickColor, font: { size: 12, weight: 600 } }
          }
        }
      }
    })
  }

  // 3. Water Types Doughnut
  const ctxWater = (document.getElementById('exec-chart-watertypes') as HTMLCanvasElement)?.getContext('2d')
  if (ctxWater && waterTypeBreakdown.length > 0) {
    chartWaterTypes = new Chart(ctxWater, {
      type: 'doughnut',
      data: {
        labels: waterTypeBreakdown.map(w => w.type),
        datasets: [{
          data: waterTypeBreakdown.map(w => Number(w.volume) || 0),
          backgroundColor: WATER_COLORS,
          borderWidth: 2,
          borderColor: borderBg
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${fmtNumber(Number(ctx.raw) || 0)} containers` } }
        },
        cutout: '70%'
      }
    })
  }

  // 4. Fulfillment Mode Doughnut
  const ctxModes = (document.getElementById('exec-chart-modes') as HTMLCanvasElement)?.getContext('2d')
  if (ctxModes && modeBreakdown.length > 0) {
    chartModes = new Chart(ctxModes, {
      type: 'doughnut',
      data: {
        labels: modeBreakdown.map(m => m.mode),
        datasets: [{
          data: modeBreakdown.map(m => Number(m.volume) || 0),
          backgroundColor: MODE_COLORS,
          borderWidth: 2,
          borderColor: borderBg
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => ` ${ctx.label}: ${fmtNumber(Number(ctx.raw) || 0)} containers` } }
        },
        cutout: '70%'
      }
    })
  }
}
