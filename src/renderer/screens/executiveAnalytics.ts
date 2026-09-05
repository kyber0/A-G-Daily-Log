import { Icons } from '../components/icons'
import Chart from 'chart.js/auto'
import type { ExecutiveAnalyticsData } from '../../main/ipc/analyticsIpc'

let chartRevenueTrend: Chart | null = null
let chartRevenueMix: Chart | null = null
let chartWaterTypes: Chart | null = null
let chartModes: Chart | null = null

function fmtCurrency(n: number): string {
  return '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtNumber(n: number): string {
  return n.toLocaleString('en-PH')
}

export async function renderExecutiveAnalyticsScreen(container: HTMLElement): Promise<void> {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;overflow-y:auto;" class="custom-scroll">
      <!-- Top Control Bar -->
      <div style="padding:20px 32px 16px;background:var(--clr-surface);border-bottom:1px solid var(--clr-border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;position:sticky;top:0;z-index:10;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="width:40px;height:40px;border-radius:12px;background:var(--clr-primary-glow);display:flex;align-items:center;justify-content:center;color:var(--clr-primary);">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
          </div>
          <div>
            <h2 style="margin:0;font-size:18px;font-weight:800;color:var(--clr-text);letter-spacing:-0.02em;">Executive Business Dashboard</h2>
            <p style="margin:2px 0 0;font-size:12px;color:var(--clr-text-muted);">Comprehensive financial performance, water refill volume, and inventory health</p>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;">
          <select id="exec-sel-year" class="period-select" style="padding:7px 12px;border-radius:10px;border:1px solid var(--clr-border);background:var(--clr-surface);color:var(--clr-text);font-size:13px;font-weight:700;cursor:pointer;">
          </select>
          <select id="exec-sel-month" class="period-select" style="padding:7px 12px;border-radius:10px;border:1px solid var(--clr-border);background:var(--clr-surface);color:var(--clr-text);font-size:13px;font-weight:700;cursor:pointer;">
            <option value="0">All Months (Full Year)</option>
            <option value="1">January</option><option value="2">February</option><option value="3">March</option>
            <option value="4">April</option><option value="5">May</option><option value="6">June</option>
            <option value="7">July</option><option value="8">August</option><option value="9">September</option>
            <option value="10">October</option><option value="11">November</option><option value="12">December</option>
          </select>
          <button class="btn btn-ghost btn-icon" id="exec-refresh-btn" title="Refresh Dashboard" style="padding:8px;">${Icons.refreshCw}</button>
        </div>
      </div>

      <!-- Dashboard Main Body -->
      <div id="exec-dashboard-content" style="padding:28px 32px;display:flex;flex-direction:column;gap:24px;">
        <div style="display:flex;justify-content:center;padding:60px;"><div class="spinner"></div></div>
      </div>
    </div>
  `

  const yearSel = document.getElementById('exec-sel-year') as HTMLSelectElement
  const monthSel = document.getElementById('exec-sel-month') as HTMLSelectElement
  const refreshBtn = document.getElementById('exec-refresh-btn')

  // Generate Year options (from 2022 to current Year + 1) + All Time
  const years = [currentYear + 1, currentYear, 2026, 2025, 2024, 2023, 2022]
  const uniqueYears = [...new Set(years)].sort((a, b) => b - a)
  yearSel.innerHTML = `<option value="0">All Time (Lifetime)</option>` + uniqueYears.map(y => `<option value="${y}">${y}</option>`).join('')
  yearSel.value = '0' // Default to All Time
  monthSel.style.display = 'none'

  async function loadDashboard() {
    const y = parseInt(yearSel.value, 10)
    if (y === 0) {
      monthSel.style.display = 'none'
    } else {
      monthSel.style.display = 'block'
    }
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

function renderDashboard(container: HTMLElement, data: ExecutiveAnalyticsData): void {
  const { kpis, trends, waterTypeBreakdown, modeBreakdown, topItems, topExpenses, inventoryStats, period } = data

  container.innerHTML = `
    <!-- Top KPI Grid -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(240px, 1fr));gap:16px;">
      <!-- Total Gross Revenue -->
      <div class="glass-panel" style="padding:22px;border-radius:18px;background:linear-gradient(135deg, rgba(14,165,233,0.12), rgba(14,165,233,0.03));border:1px solid rgba(14,165,233,0.25);display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:var(--clr-primary);">Total Gross Revenue</span>
          <span style="padding:4px 8px;border-radius:8px;background:rgba(14,165,233,0.2);color:var(--clr-primary);font-size:12px;font-weight:700;">${period.label}</span>
        </div>
        <div style="font-size:28px;font-weight:900;color:var(--clr-text);letter-spacing:-0.03em;">${fmtCurrency(kpis.totalRevenue)}</div>
        <div style="font-size:12px;color:var(--clr-text-muted);display:flex;gap:12px;">
          <span>Refills: <b>${fmtCurrency(kpis.waterRevenue)}</b></span>
          <span>Merchandise: <b>${fmtCurrency(kpis.itemRevenue)}</b></span>
        </div>
      </div>

      <!-- Net Operating Profit -->
      <div class="glass-panel" style="padding:22px;border-radius:18px;background:linear-gradient(135deg, rgba(16,185,129,0.12), rgba(16,185,129,0.03));border:1px solid rgba(16,185,129,0.25);display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#10b981;">Net Operating Income</span>
          <span style="padding:4px 8px;border-radius:8px;background:rgba(16,185,129,0.2);color:#10b981;font-size:12px;font-weight:800;">${kpis.profitMargin.toFixed(1)}% Margin</span>
        </div>
        <div style="font-size:28px;font-weight:900;color:#10b981;letter-spacing:-0.03em;">${fmtCurrency(kpis.netProfit)}</div>
        <div style="font-size:12px;color:var(--clr-text-muted);">
          Operational Expenses: <b style="color:#ef4444;">${fmtCurrency(kpis.totalExpenses)}</b>
        </div>
      </div>

      <!-- Volume & Activity -->
      <div class="glass-panel" style="padding:22px;border-radius:18px;background:linear-gradient(135deg, rgba(99,102,241,0.12), rgba(99,102,241,0.03));border:1px solid rgba(99,102,241,0.25);display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#6366f1;">Volume Refilled</span>
          <span style="padding:4px 8px;border-radius:8px;background:rgba(99,102,241,0.2);color:#6366f1;font-size:12px;font-weight:700;">${kpis.totalDaysActive} Active Days</span>
        </div>
        <div style="font-size:28px;font-weight:900;color:var(--clr-text);letter-spacing:-0.03em;">${fmtNumber(kpis.totalContainersRefilled)} <span style="font-size:14px;font-weight:600;color:var(--clr-text-muted);">containers</span></div>
        <div style="font-size:12px;color:var(--clr-text-muted);">
          Avg Daily Sales: <b>${fmtCurrency(kpis.avgDailyRevenue)}/day</b>
        </div>
      </div>

      <!-- Inventory Health -->
      <div class="glass-panel" style="padding:22px;border-radius:18px;background:linear-gradient(135deg, rgba(245,158,11,0.12), rgba(245,158,11,0.03));border:1px solid rgba(245,158,11,0.25);display:flex;flex-direction:column;gap:8px;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <span style="font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;color:#f59e0b;">Stock Asset Value</span>
          <span style="padding:4px 8px;border-radius:8px;background:rgba(245,158,11,0.2);color:#f59e0b;font-size:12px;font-weight:700;">${inventoryStats.totalSkus} SKUs</span>
        </div>
        <div style="font-size:28px;font-weight:900;color:var(--clr-text);letter-spacing:-0.03em;">${fmtCurrency(inventoryStats.totalInventoryValueCost)}</div>
        <div style="font-size:12px;color:var(--clr-text-muted);display:flex;gap:10px;">
          <span>Potential SRP: <b>${fmtCurrency(inventoryStats.totalInventoryValueSrp)}</b></span>
          ${inventoryStats.lowStockCount > 0 ? `<span style="color:#ef4444;font-weight:700;">${inventoryStats.lowStockCount} Low</span>` : ''}
        </div>
      </div>
    </div>

    <!-- Main Trend Chart -->
    <div class="glass-panel" style="padding:24px;border-radius:20px;display:flex;flex-direction:column;gap:16px;">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div>
          <h3 style="margin:0;font-size:15px;font-weight:800;color:var(--clr-text);text-transform:uppercase;letter-spacing:0.05em;">Revenue, Expenses & Profit Trajectory</h3>
          <p style="margin:2px 0 0;font-size:12px;color:var(--clr-text-muted);">Daily financial timeline and container volume flow</p>
        </div>
        <div style="display:flex;align-items:center;gap:12px;font-size:12px;font-weight:700;">
          <span style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:#0ea5e9;"></span> Water Sales</span>
          <span style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:#8b5cf6;"></span> Item Sales</span>
          <span style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:#ef4444;"></span> Expenses</span>
          <span style="display:flex;align-items:center;gap:6px;"><span style="width:10px;height:10px;border-radius:50%;background:#10b981;"></span> Net Profit</span>
        </div>
      </div>
      <div style="height:320px;position:relative;">
        <canvas id="exec-chart-trend"></canvas>
      </div>
    </div>

    <!-- 3-Column Visual Breakdown -->
    <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:20px;">
      <!-- Water Types Distribution -->
      <div class="glass-panel" style="padding:24px;border-radius:20px;display:flex;flex-direction:column;gap:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <h3 style="margin:0;font-size:14px;font-weight:800;color:var(--clr-text);text-transform:uppercase;letter-spacing:0.05em;">Water Type Breakdown</h3>
          <span style="font-size:11px;color:var(--clr-text-muted);font-weight:600;">By Refill Volume</span>
        </div>
        <div style="height:200px;position:relative;display:flex;align-items:center;justify-content:center;">
          <canvas id="exec-chart-watertypes"></canvas>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
          ${waterTypeBreakdown.slice(0, 4).map(w => `
            <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px;">
              <span style="font-weight:600;color:var(--clr-text);">${w.type}</span>
              <span style="color:var(--clr-text-muted);"><b>${fmtNumber(w.volume)}</b> (${w.percentage.toFixed(1)}%) — ${fmtCurrency(w.revenue)}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Delivery vs Pickup Mode -->
      <div class="glass-panel" style="padding:24px;border-radius:20px;display:flex;flex-direction:column;gap:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <h3 style="margin:0;font-size:14px;font-weight:800;color:var(--clr-text);text-transform:uppercase;letter-spacing:0.05em;">Sales Channel & Mode</h3>
          <span style="font-size:11px;color:var(--clr-text-muted);font-weight:600;">Delivery vs Walk-in</span>
        </div>
        <div style="height:200px;position:relative;display:flex;align-items:center;justify-content:center;">
          <canvas id="exec-chart-modes"></canvas>
        </div>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;">
          ${modeBreakdown.map(m => `
            <div style="display:flex;align-items:center;justify-content:space-between;font-size:12px;">
              <span style="font-weight:600;color:var(--clr-text);">${m.mode}</span>
              <span style="color:var(--clr-text-muted);"><b>${fmtNumber(m.volume)}</b> containers — ${fmtCurrency(m.revenue)}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Top Selling Products Leaderboard -->
      <div class="glass-panel" style="padding:24px;border-radius:20px;display:flex;flex-direction:column;gap:16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <h3 style="margin:0;font-size:14px;font-weight:800;color:var(--clr-text);text-transform:uppercase;letter-spacing:0.05em;">Top Merchandise Items</h3>
          <span style="font-size:11px;color:var(--clr-text-muted);font-weight:600;">By Revenue</span>
        </div>
        <div style="display:flex;flex-direction:column;gap:10px;overflow-y:auto;max-height:280px;" class="custom-scroll">
          ${topItems.length === 0 ? '<div style="color:var(--clr-text-muted);text-align:center;padding:24px;">No item sales for this period.</div>' : ''}
          ${topItems.map((item, idx) => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border-radius:10px;background:var(--clr-surface-2);font-size:12px;">
              <div style="display:flex;align-items:center;gap:8px;overflow:hidden;">
                <span style="font-weight:800;color:var(--clr-primary);width:16px;">#${idx + 1}</span>
                <span style="font-weight:600;color:var(--clr-text);white-space:nowrap;text-overflow:ellipsis;overflow:hidden;" title="${item.name}">${item.name}</span>
              </div>
              <div style="text-align:right;flex-shrink:0;">
                <div style="font-weight:700;color:var(--clr-text);">${fmtCurrency(item.revenue)}</div>
                <div style="font-size:10px;color:var(--clr-text-muted);">${item.qty} units sold</div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `

  // Destroy old charts
  if (chartRevenueTrend) { chartRevenueTrend.destroy(); chartRevenueTrend = null }
  if (chartWaterTypes) { chartWaterTypes.destroy(); chartWaterTypes = null }
  if (chartModes) { chartModes.destroy(); chartModes = null }

  // ── Render Trend Chart ───────────────────────────────────────────────────
  const ctxTrend = (document.getElementById('exec-chart-trend') as HTMLCanvasElement)?.getContext('2d')
  if (ctxTrend && trends.length > 0) {
    const labels = trends.map(t => t.date.substring(5))
    chartRevenueTrend = new Chart(ctxTrend, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Net Profit',
            data: trends.map(t => t.netProfit),
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            fill: true,
            tension: 0.35,
            borderWidth: 2.5,
            pointRadius: trends.length > 35 ? 0 : 3
          },
          {
            label: 'Water Sales',
            data: trends.map(t => t.waterRevenue),
            borderColor: '#0ea5e9',
            backgroundColor: 'transparent',
            borderDash: [4, 4],
            tension: 0.35,
            borderWidth: 2,
            pointRadius: trends.length > 35 ? 0 : 2
          },
          {
            label: 'Item Sales',
            data: trends.map(t => t.itemRevenue),
            borderColor: '#8b5cf6',
            backgroundColor: 'transparent',
            tension: 0.35,
            borderWidth: 2,
            pointRadius: trends.length > 35 ? 0 : 2
          },
          {
            label: 'Expenses',
            data: trends.map(t => t.expenses),
            borderColor: '#ef4444',
            backgroundColor: 'transparent',
            tension: 0.35,
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
              label: (ctx) => ` ${ctx.dataset.label}: ₱${(ctx.raw as number).toLocaleString('en-PH', { minimumFractionDigits: 2 })}`
            }
          }
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            grid: { color: 'rgba(255,255,255,0.06)' },
            ticks: { callback: (v) => '₱' + Number(v).toLocaleString('en-PH') }
          }
        }
      }
    })
  }

  // ── Render Water Types Doughnut Chart ────────────────────────────────────
  const ctxWater = (document.getElementById('exec-chart-watertypes') as HTMLCanvasElement)?.getContext('2d')
  if (ctxWater && waterTypeBreakdown.length > 0) {
    chartWaterTypes = new Chart(ctxWater, {
      type: 'doughnut',
      data: {
        labels: waterTypeBreakdown.map(w => w.type),
        datasets: [{
          data: waterTypeBreakdown.map(w => w.volume),
          backgroundColor: ['#0ea5e9', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        cutout: '70%'
      }
    })
  }

  // ── Render Modes Doughnut Chart ──────────────────────────────────────────
  const ctxModes = (document.getElementById('exec-chart-modes') as HTMLCanvasElement)?.getContext('2d')
  if (ctxModes && modeBreakdown.length > 0) {
    chartModes = new Chart(ctxModes, {
      type: 'doughnut',
      data: {
        labels: modeBreakdown.map(m => m.mode),
        datasets: [{
          data: modeBreakdown.map(m => m.volume),
          backgroundColor: ['#3b82f6', '#10b981'],
          borderWidth: 0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        cutout: '70%'
      }
    })
  }
}
