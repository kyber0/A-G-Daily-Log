import { Icons } from '../components/icons'
import Chart from 'chart.js/auto'
import type { HistoryDay } from '../../shared/types'

let chartDaily: Chart | null = null
let chartProfit: Chart | null = null

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

export async function renderWaterAnalyticsScreen(container: HTMLElement): Promise<void> {
  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;overflow-y:auto;" class="custom-scroll">
      <!-- Top Control Bar -->
      <div style="padding:14px 28px;background:var(--clr-surface);border-bottom:1px solid var(--clr-border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;position:sticky;top:0;z-index:10;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:34px;height:34px;border-radius:8px;background:var(--clr-surface-2);border:1px solid var(--clr-border);display:flex;align-items:center;justify-content:center;color:var(--clr-primary);">
            ${Icons.droplets || Icons.pieChart}
          </div>
          <div>
            <h2 style="margin:0;font-size:15px;font-weight:700;color:var(--clr-text);letter-spacing:-0.01em;">Water Refills Analytics</h2>
            <p style="margin:1px 0 0;font-size:11px;color:var(--clr-text-muted);">Refill station production, sales &amp; operational expenses</p>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <select id="water-sel-year" style="padding:6px 12px;border-radius:8px;border:1px solid var(--clr-border);background:var(--clr-surface);color:var(--clr-text);font-size:13px;font-weight:600;cursor:pointer;"></select>
          <select id="water-sel-month" style="padding:6px 12px;border-radius:8px;border:1px solid var(--clr-border);background:var(--clr-surface);color:var(--clr-text);font-size:13px;font-weight:600;cursor:pointer;">
            <option value="0">All Months</option>
            <option value="1">January</option><option value="2">February</option><option value="3">March</option>
            <option value="4">April</option><option value="5">May</option><option value="6">June</option>
            <option value="7">July</option><option value="8">August</option><option value="9">September</option>
            <option value="10">October</option><option value="11">November</option><option value="12">December</option>
          </select>
          <button class="btn btn-ghost btn-icon" id="water-refresh-btn" title="Refresh Analytics" style="padding:7px;border:1px solid var(--clr-border);border-radius:8px;">${Icons.refreshCw}</button>
        </div>
      </div>

      <!-- Dashboard Main Body -->
      <div id="water-dashboard-content" style="padding:22px 28px 40px;display:flex;flex-direction:column;gap:20px;">
        <div style="display:flex;justify-content:center;padding:60px;"><div class="spinner"></div></div>
      </div>
    </div>
  `

  const yearSel = document.getElementById('water-sel-year') as HTMLSelectElement
  const monthSel = document.getElementById('water-sel-month') as HTMLSelectElement
  const refreshBtn = document.getElementById('water-refresh-btn')
  const contentArea = document.getElementById('water-dashboard-content')!

  let allDays: HistoryDay[] = []

  async function fetchHistory() {
    contentArea.innerHTML = `<div style="display:flex;justify-content:center;padding:60px;"><div class="spinner"></div></div>`
    const res = await window.api.listHistory()
    if (!res.ok) {
      contentArea.innerHTML = `<div style="padding:40px;text-align:center;color:var(--clr-error);">Failed to load water history: ${res.error}</div>`
      return
    }
    allDays = res.data || []

    const availableYears = [...new Set(allDays.map(d => parseInt(d.date.split('-')[0])))]
      .filter(y => !isNaN(y))
      .sort((a, b) => b - a)

    if (!availableYears.includes(currentYear)) availableYears.unshift(currentYear)

    yearSel.innerHTML = `<option value="0">All Time</option>` + availableYears.map(y => `<option value="${y}">${y}</option>`).join('')
    yearSel.value = String(currentYear)
    monthSel.value = String(currentMonth)

    updateView()
  }

  function updateView() {
    const y = parseInt(yearSel.value, 10)
    monthSel.style.display = y === 0 ? 'none' : 'inline-block'
    const m = y === 0 ? 0 : parseInt(monthSel.value, 10)
    renderWaterDashboard(contentArea, allDays, y, m)
  }

  yearSel.addEventListener('change', updateView)
  monthSel.addEventListener('change', updateView)
  refreshBtn?.addEventListener('click', fetchHistory)

  await fetchHistory()
}

function renderWaterDashboard(container: HTMLElement, allDays: HistoryDay[], selYear: number, selMonth: number): void {
  // Filter days based on selection
  const periodDays = allDays.filter(d => {
    if (selYear === 0) return true
    const [yStr, mStr] = d.date.split('-')
    const y = parseInt(yStr, 10)
    const m = parseInt(mStr, 10)
    if (selMonth === 0) return y === selYear
    return y === selYear && m === selMonth
  })

  // Aggregate financials & operational counts
  const totalRevenue = periodDays.reduce((s, d) => s + (Number(d.totalAmount) || 0), 0)
  const totalExpenses = periodDays.reduce((s, d) => s + (Number(d.totalExpenses) || 0), 0)
  const netProfit = totalRevenue - totalExpenses
  const profitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0
  const activeDays = periodDays.length
  const avgDailyRevenue = activeDays > 0 ? totalRevenue / activeDays : 0
  const avgDailyExpense = activeDays > 0 ? totalExpenses / activeDays : 0
  const totalEntries = periodDays.reduce((s, d) => s + (Number(d.rowCount) || 0), 0)

  const expenseRatio = totalRevenue > 0 ? (totalExpenses / totalRevenue) * 100 : 0
  const marginColor = profitMargin >= 50 ? '#10b981' : profitMargin >= 25 ? '#f59e0b' : '#ef4444'
  const profitColor = netProfit >= 0 ? '#10b981' : '#ef4444'

  // Determine period label
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  let periodLabel = 'All Time'
  if (selYear > 0) {
    if (selMonth > 0) {
      periodLabel = `${monthNames[selMonth - 1]} ${selYear}`
    } else {
      periodLabel = `${selYear} (Full Year)`
    }
  }

  // Flatten expenses
  const expenseRows: { date: string; desc: string; amount: number; remarks: string }[] = []
  periodDays.forEach(d => {
    if (d.expenses && Array.isArray(d.expenses)) {
      d.expenses.forEach(e => {
        expenseRows.push({
          date: d.date,
          desc: e.desc || 'General Expense',
          amount: Number(e.amount) || 0,
          remarks: e.remarks || ''
        })
      })
    }
  })
  expenseRows.sort((a, b) => b.date.localeCompare(a.date))

  container.innerHTML = `
    <!-- ── Filter Period Indicator ────────────────────────────────────────── -->
    <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:var(--clr-surface);border:1px solid var(--clr-border);border-radius:8px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--clr-text-muted);">Reporting Window:</span>
        <span style="font-size:12.5px;font-weight:700;color:var(--clr-text);">${periodLabel}</span>
      </div>
      <div style="font-size:11px;color:var(--clr-text-dim);">
        ${activeDays} Active Days Logged &nbsp;|&nbsp; ${fmtNumber(totalEntries)} Sales Entries
      </div>
    </div>

    <!-- ── LEVEL 1: FINANCIAL PERFORMANCE (WATER P&L) ─────────────────────── -->
    <div>
      ${sectionHeader('Level 1: Financial Performance (Water P&L)', 'Top-line refill sales and bottom-line operating earnings', 'Core P&L')}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        
        <!-- Card 1: Water Gross Revenue -->
        <div style="background:var(--clr-surface);border:1px solid var(--clr-border);border-top:3px solid #0284c7;border-radius:10px;padding:20px;display:flex;flex-direction:column;gap:14px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
            <div>
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--clr-text-muted);">Water Refill Revenue</div>
              <div style="font-size:28px;font-weight:800;color:var(--clr-text);letter-spacing:-0.03em;margin-top:4px;line-height:1.1;">
                ${fmtCurrency(totalRevenue)}
              </div>
            </div>
            <span style="font-size:11px;font-weight:700;color:#0284c7;background:rgba(2,132,199,0.08);border:1px solid rgba(2,132,199,0.2);padding:3px 8px;border-radius:6px;white-space:nowrap;">
              Inflow
            </span>
          </div>

          <!-- Inflow Performance Context -->
          <div style="background:var(--clr-surface-2);border:1px solid var(--clr-border);border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
            <div>
              <div style="font-size:10.5px;color:var(--clr-text-muted);text-transform:uppercase;font-weight:600;">Average Daily Revenue</div>
              <div style="font-size:13px;font-weight:700;color:var(--clr-text);margin-top:2px;">${fmtCurrency(avgDailyRevenue)} / day</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:10.5px;color:var(--clr-text-muted);text-transform:uppercase;font-weight:600;">Recorded Pace</div>
              <div style="font-size:13px;font-weight:700;color:#0284c7;margin-top:2px;">${activeDays} trading days</div>
            </div>
          </div>
        </div>

        <!-- Card 2: Net Operating Income -->
        <div style="background:var(--clr-surface);border:1px solid var(--clr-border);border-top:3px solid ${profitColor};border-radius:10px;padding:20px;display:flex;flex-direction:column;gap:14px;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
            <div>
              <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--clr-text-muted);">Net Water Operating Income</div>
              <div style="font-size:28px;font-weight:800;color:${profitColor};letter-spacing:-0.03em;margin-top:4px;line-height:1.1;">
                ${fmtCurrency(netProfit)}
              </div>
            </div>
            <span style="font-size:11px;font-weight:700;color:${marginColor};background:color-mix(in srgb, ${marginColor} 10%, transparent);border:1px solid color-mix(in srgb, ${marginColor} 25%, transparent);padding:3px 8px;border-radius:6px;white-space:nowrap;">
              ${profitMargin.toFixed(1)}% Margin
            </span>
          </div>

          <!-- Expense Burn Breakdown -->
          <div style="background:var(--clr-surface-2);border:1px solid var(--clr-border);border-radius:8px;padding:10px 14px;display:flex;flex-direction:column;gap:8px;">
            <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:600;color:var(--clr-text-muted);">
              <span>Expense Burn</span>
              <span>Deductions: ${expenseRatio.toFixed(1)}%</span>
            </div>
            <div style="height:6px;background:var(--clr-surface);border-radius:4px;overflow:hidden;display:flex;">
              <div style="width:${Math.min(expenseRatio, 100)}%;background:#ef4444;" title="Expenses: ${expenseRatio.toFixed(1)}%"></div>
              <div style="width:${Math.max(100 - expenseRatio, 0)}%;background:#10b981;" title="Retained: ${(100 - expenseRatio).toFixed(1)}%"></div>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:2px;">
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="width:8px;height:8px;border-radius:2px;background:#ef4444;"></span>
                <span style="color:var(--clr-text-muted);">Daily Expenses:</span>
                <strong style="color:#ef4444;">-${fmtCurrency(totalExpenses)}</strong>
              </div>
              <div style="display:flex;align-items:center;gap:6px;">
                <span style="width:8px;height:8px;border-radius:2px;background:#10b981;"></span>
                <span style="color:var(--clr-text-muted);">Retained Net:</span>
                <strong style="color:#10b981;">${fmtCurrency(netProfit)}</strong>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>

    <!-- ── LEVEL 2: OPERATIONAL EFFICIENCY & PACE ─────────────────────────── -->
    <div>
      ${sectionHeader('Level 2: Operating Efficiency & Cadence', 'Trading consistency and cost control metrics', 'Efficiency')}
      <div style="display:grid;grid-template-columns:repeat(3, 1fr);gap:12px;">
        
        <div style="background:var(--clr-surface);border:1px solid var(--clr-border);border-left:3px solid #2563eb;border-radius:10px;padding:14px 18px;display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--clr-text-muted);">Active Trading Days</div>
          <div style="font-size:22px;font-weight:800;color:var(--clr-text);">${activeDays} <span style="font-size:12px;color:var(--clr-text-muted);font-weight:600;">days</span></div>
          <div style="font-size:11px;color:var(--clr-text-muted);">Days with recorded sales transactions</div>
        </div>

        <div style="background:var(--clr-surface);border:1px solid var(--clr-border);border-left:3px solid #0d9488;border-radius:10px;padding:14px 18px;display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--clr-text-muted);">Daily Sales Velocity</div>
          <div style="font-size:22px;font-weight:800;color:var(--clr-text);">${fmtCurrency(avgDailyRevenue)}</div>
          <div style="font-size:11px;color:var(--clr-text-muted);">Average refill income per active day</div>
        </div>

        <div style="background:var(--clr-surface);border:1px solid var(--clr-border);border-left:3px solid #ef4444;border-radius:10px;padding:14px 18px;display:flex;flex-direction:column;gap:6px;">
          <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--clr-text-muted);">Daily Operational Burn</div>
          <div style="font-size:22px;font-weight:800;color:#ef4444;">${fmtCurrency(avgDailyExpense)}</div>
          <div style="font-size:11px;color:var(--clr-text-muted);">Average daily operational expenses</div>
        </div>

      </div>
    </div>

    <!-- ── CHARTS: TRAJECTORY & REVENUE VS EXPENSES ────────────────────────── -->
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
      
      <!-- Revenue Trajectory Chart -->
      <div>
        ${sectionHeader('Revenue Trajectory', 'Timeline progression across the period')}
        ${chartCard('Revenue Progression', 'Daily or monthly water refill earnings', 'chart-water-daily', 260)}
      </div>

      <!-- Revenue vs Expenses Grouped Bar -->
      <div>
        ${sectionHeader('Income vs Outflow', 'Operating profitability comparison')}
        ${chartCard(
          'Revenue vs Operating Expenses',
          'Comparison of earnings against daily operating costs',
          'chart-water-profit',
          260,
          `
            <div style="display:flex;gap:10px;align-items:center;">
              <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:var(--clr-text-muted);"><span style="width:8px;height:8px;border-radius:2px;background:#0284c7;"></span>Revenue</span>
              <span style="display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:600;color:var(--clr-text-muted);"><span style="width:8px;height:8px;border-radius:2px;background:#ef4444;"></span>Expenses</span>
            </div>
          `
        )}
      </div>

    </div>

    <!-- ── EXPENSES LEDGER TABLE ──────────────────────────────────────────── -->
    <div>
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
        ${sectionHeader('Operational Expenses Ledger', 'Detailed log of operational costs incurred in this period', 'Cost Ledger')}
        <span style="font-size:12px;font-weight:700;color:#ef4444;background:rgba(239,68,68,0.08);border:1px solid rgba(239,68,68,0.2);padding:3px 10px;border-radius:6px;">
          Total: ${fmtCurrency(totalExpenses)}
        </span>
      </div>
      <div style="background:var(--clr-surface);border:1px solid var(--clr-border);border-radius:10px;overflow:hidden;">
        <div style="max-height:300px;overflow-y:auto;" class="custom-scroll">
          <table style="width:100%;border-collapse:collapse;text-align:left;font-size:12.5px;">
            <thead>
              <tr style="background:var(--clr-surface-2);border-bottom:1px solid var(--clr-border);">
                <th style="padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--clr-text-muted);letter-spacing:0.05em;width:120px;">Date</th>
                <th style="padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--clr-text-muted);letter-spacing:0.05em;">Description</th>
                <th style="padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--clr-text-muted);letter-spacing:0.05em;">Remarks</th>
                <th style="padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--clr-text-muted);letter-spacing:0.05em;text-align:right;width:130px;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${expenseRows.length === 0 ? `
                <tr><td colspan="4" style="text-align:center;color:var(--clr-text-muted);padding:36px;">No expenses recorded for this period.</td></tr>
              ` : expenseRows.map(e => `
                <tr style="border-bottom:1px solid var(--clr-border);">
                  <td style="padding:10px 16px;font-family:monospace;color:var(--clr-text-muted);">${e.date}</td>
                  <td style="padding:10px 16px;font-weight:600;color:var(--clr-text);">${e.desc}</td>
                  <td style="padding:10px 16px;color:var(--clr-text-muted);">${e.remarks || '—'}</td>
                  <td style="padding:10px 16px;text-align:right;font-weight:700;color:#ef4444;font-family:monospace;">-${fmtCurrency(e.amount)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `

  // ─── Destroy and rebuild charts ──────────────────────────────────────────
  if (chartDaily) { chartDaily.destroy(); chartDaily = null }
  if (chartProfit) { chartProfit.destroy(); chartProfit = null }

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
  const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
  const tickColor = isDark ? '#64748b' : '#94a3b8'

  const canvasDaily = document.getElementById('chart-water-daily') as HTMLCanvasElement
  const canvasProfit = document.getElementById('chart-water-profit') as HTMLCanvasElement

  let labels: string[] = []
  let revData: number[] = []
  let expData: number[] = []

  if (selYear === 0) {
    // All time: Group by year
    const yearlyMap = new Map<string, { rev: number; exp: number }>()
    allDays.forEach(d => {
      const y = d.date.split('-')[0]
      const cur = yearlyMap.get(y) || { rev: 0, exp: 0 }
      cur.rev += Number(d.totalAmount) || 0
      cur.exp += Number(d.totalExpenses) || 0
      yearlyMap.set(y, cur)
    })
    const sortedYears = [...yearlyMap.keys()].sort()
    labels = sortedYears
    revData = sortedYears.map(y => yearlyMap.get(y)!.rev)
    expData = sortedYears.map(y => yearlyMap.get(y)!.exp)
  } else if (selMonth === 0) {
    // Full year: Group by 12 months
    const shortMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    labels = shortMonths
    revData = Array(12).fill(0)
    expData = Array(12).fill(0)
    periodDays.forEach(d => {
      const mIdx = parseInt(d.date.split('-')[1], 10) - 1
      if (mIdx >= 0 && mIdx < 12) {
        revData[mIdx] += Number(d.totalAmount) || 0
        expData[mIdx] += Number(d.totalExpenses) || 0
      }
    })
  } else {
    // Specific month: Daily
    const daysInMonth = new Date(selYear, selMonth, 0).getDate()
    labels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1))
    revData = Array(daysInMonth).fill(0)
    expData = Array(daysInMonth).fill(0)
    periodDays.forEach(d => {
      const day = parseInt(d.date.split('-')[2], 10) - 1
      if (day >= 0 && day < daysInMonth) {
        revData[day] += Number(d.totalAmount) || 0
        expData[day] += Number(d.totalExpenses) || 0
      }
    })
  }

  // 1. Revenue Trajectory Line Chart
  if (canvasDaily) {
    chartDaily = new Chart(canvasDaily, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Water Revenue',
          data: revData,
          borderColor: '#0284c7',
          backgroundColor: 'rgba(2, 132, 199, 0.08)',
          fill: true,
          tension: 0.3,
          borderWidth: 2.2,
          pointRadius: labels.length > 31 ? 0 : 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (ctx) => ` Revenue: ${fmtCurrency(Number(ctx.raw) || 0)}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: tickColor, font: { size: 11 }, maxTicksLimit: 14 }
          },
          y: {
            grid: { color: gridColor },
            ticks: { color: tickColor, font: { size: 11 }, callback: (v) => fmtCompact(Number(v) || 0) }
          }
        }
      }
    })
  }

  // 2. Profit / Expense Bar Chart
  if (canvasProfit) {
    chartProfit = new Chart(canvasProfit, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Revenue',
            data: revData,
            backgroundColor: '#0284c7',
            borderRadius: 4,
            barPercentage: 0.75,
            categoryPercentage: 0.8
          },
          {
            label: 'Expenses',
            data: expData,
            backgroundColor: '#ef4444',
            borderRadius: 4,
            barPercentage: 0.75,
            categoryPercentage: 0.8
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
            ticks: { color: tickColor, font: { size: 11 }, maxTicksLimit: 14 }
          },
          y: {
            grid: { color: gridColor },
            ticks: { color: tickColor, font: { size: 11 }, callback: (v) => fmtCompact(Number(v) || 0) }
          }
        }
      }
    })
  }
}
