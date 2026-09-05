import { Icons } from '../components/icons'
import Chart from 'chart.js/auto'

let chartDaily: Chart | null = null
let chartMonthly: Chart | null = null
let chartProfit: Chart | null = null

export async function renderWaterAnalyticsScreen(container: HTMLElement): Promise<void> {
  // Inject styles once
  if (!document.getElementById('analytics-styles')) {
    const style = document.createElement('style')
    style.id = 'analytics-styles'
    style.innerHTML = `
      @keyframes slideUpFade {
        0% { opacity: 0; transform: translateY(15px); }
        100% { opacity: 1; transform: translateY(0); }
      }
      .animate-slide-up { animation: slideUpFade 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
      .stagger-1 { animation-delay: 0.05s; }
      .stagger-2 { animation-delay: 0.1s; }
      .stagger-3 { animation-delay: 0.15s; }
      .stagger-4 { animation-delay: 0.2s; }
      .chart-container { transition: box-shadow 0.3s ease; }
      .chart-container:hover { box-shadow: 0 8px 30px rgba(0,0,0,0.12); }
      [data-theme="dark"] .chart-container:hover { box-shadow: 0 8px 30px rgba(0,0,0,0.3); }
      .period-btn { padding: 6px 14px; border-radius: 10px; border: 1px solid var(--clr-border); background: transparent; color: var(--clr-text-muted); font-size: 13px; font-weight: 600; cursor: pointer; transition: all 0.2s; font-family: var(--font); }
      .period-btn:hover { background: var(--clr-surface-2); color: var(--clr-text); }
      .period-btn.active { background: var(--clr-primary); color: #fff; border-color: var(--clr-primary); }
      .period-select { padding: 6px 12px; border-radius: 10px; border: 1px solid var(--clr-border); background: var(--clr-surface); color: var(--clr-text); font-size: 13px; font-weight: 600; cursor: pointer; font-family: var(--font); }
      .period-select:focus { outline: none; border-color: var(--clr-primary); }
      .expenses-table th { font-weight: 600; color: var(--clr-text-muted); padding: 12px 16px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--clr-border); }
      .expenses-table td { padding: 14px 16px; border-bottom: 1px solid var(--clr-border); color: var(--clr-text); font-size: 13px; }
      .expenses-table tr:last-child td { border-bottom: none; }
    `
    document.head.appendChild(style)
  }

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1

  container.innerHTML = `
    <div class="screen-header animate-slide-up" style="padding: 24px 32px 20px 32px; display: flex; align-items: center; justify-content: space-between;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="color: var(--clr-primary); background: var(--clr-primary-glow); padding: 8px; border-radius: 12px; display: inline-flex;">
          ${Icons.pieChart}
        </span>
        <div>
          <h1 style="background: linear-gradient(to right, var(--clr-primary), var(--clr-pickup)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.03em;">Analytics Dashboard</h1>
          <p style="color: var(--clr-text-muted); margin: 2px 0 0 0; font-size: 13px;">Real-time insights into your business performance</p>
        </div>
      </div>
      <div style="display: flex; align-items: center; gap: 10px; flex-shrink: 0;">
        <select id="sel-year" class="period-select"></select>
        <select id="sel-month" class="period-select">
          <option value="0">All Months</option>
          <option value="1">January</option><option value="2">February</option><option value="3">March</option>
          <option value="4">April</option><option value="5">May</option><option value="6">June</option>
          <option value="7">July</option><option value="8">August</option><option value="9">September</option>
          <option value="10">October</option><option value="11">November</option><option value="12">December</option>
        </select>
      </div>
    </div>
    <div class="analytics-container animate-slide-up stagger-1" style="padding: 24px 32px 32px 32px; display: flex; flex-direction: column; gap: 24px; overflow-y: auto; flex: 1;">
      
      <!-- All Time Banner -->
      <div id="alltime-banner" class="glass-panel" style="padding: 20px 28px; display: flex; align-items: center; justify-content: space-between; border-radius: 20px; background: linear-gradient(135deg, var(--clr-primary-glow), transparent);">
        <div style="display: flex; align-items: center; gap: 14px;">
          <div style="width: 44px; height: 44px; border-radius: 12px; background: var(--clr-primary-glow); display: flex; align-items: center; justify-content: center; color: var(--clr-primary);">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="7"></circle><polyline points="8.21 13.89 7 23 12 20 17 23 15.79 13.88"></polyline></svg>
          </div>
          <div>
            <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; color: var(--clr-text-muted);">All-Time Total Revenue</div>
            <div id="alltime-value" style="font-size: 32px; font-weight: 800; color: var(--clr-primary); letter-spacing: -0.03em;">Loading...</div>
          </div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; color: var(--clr-text-muted);">Total Days Recorded</div>
          <div id="alltime-days" style="font-size: 28px; font-weight: 800; color: var(--clr-text);">—</div>
        </div>
      </div>

      <!-- KPI Cards -->
      <div id="analytics-cards" style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px;">
        <div style="padding: 20px; text-align: center; color: var(--clr-text-muted);">Loading...</div>
      </div>

      <!-- Charts Row 1 -->
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; min-height: 340px;">
        <div class="glass-panel chart-container" style="padding: 24px; display: flex; flex-direction: column; border-radius: 20px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
            <h3 id="chart-daily-title" style="font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--clr-text-muted);">Daily Revenue</h3>
            <span style="color: var(--clr-primary); font-size: 12px; background: var(--clr-primary-glow); padding: 4px 10px; border-radius: 12px; font-weight: 600;">Trend</span>
          </div>
          <div style="flex: 1; position: relative;"><canvas id="chart-daily"></canvas></div>
        </div>
        <div class="glass-panel chart-container" style="padding: 24px; display: flex; flex-direction: column; border-radius: 20px;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
            <h3 id="chart-profit-title" style="font-weight: 600; font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--clr-text-muted);">Revenue vs Expenses</h3>
            <span style="color: #10b981; font-size: 12px; background: rgba(16, 185, 129, 0.15); padding: 4px 10px; border-radius: 12px; font-weight: 600;">Profitability</span>
          </div>
          <div style="flex: 1; position: relative;"><canvas id="chart-profit"></canvas></div>
        </div>
      </div>

      <!-- Expense List -->
      <div class="glass-panel" style="border-radius: 20px; display: flex; flex-direction: column; overflow: hidden;">
        <div style="padding: 20px 24px; border-bottom: 1px solid var(--clr-border); display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="color: #ef4444;">${Icons.shoppingCart || ''}</span>
            <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: var(--clr-text);">Expense Breakdown</h3>
          </div>
          <div id="expense-total-badge" style="font-size: 13px; font-weight: 700; background: rgba(239, 68, 68, 0.1); color: #ef4444; padding: 4px 12px; border-radius: 12px;">₱0.00</div>
        </div>
        <div style="overflow-x: auto;">
          <table class="expenses-table" style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr>
                <th style="width: 120px;">Date</th>
                <th>Description</th>
                <th>Remarks</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody id="expense-tbody">
              <tr><td colspan="4" style="text-align: center; color: var(--clr-text-muted);">Loading...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      
    </div>
  `

  // Fetch all history once
  const result = await window.api.listHistory()
  if (!result.ok) {
    document.getElementById('analytics-cards')!.innerHTML = `<div style="color:var(--clr-error)">Error loading data: ${result.error}</div>`
    return
  }

  const allDays = result.data

  // Populate year selector from available data + All Time
  const availableYears = [...new Set(allDays.map(d => parseInt(d.date.split('-')[0])))]
    .sort((a, b) => b - a)
  if (!availableYears.includes(currentYear)) availableYears.unshift(currentYear)

  const yearSel = document.getElementById('sel-year') as HTMLSelectElement
  yearSel.innerHTML = `<option value="0">All Time (All Years)</option>` + availableYears.map(y => `<option value="${y}">${y}</option>`).join('')
  yearSel.value = String(currentYear)

  const monthSel = document.getElementById('sel-month') as HTMLSelectElement
  monthSel.value = String(currentMonth)

  // All-time stats
  const allTimeRevenue = allDays.reduce((s, d) => s + (d.totalAmount || 0), 0)
  const fmt = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  document.getElementById('alltime-value')!.textContent = fmt(allTimeRevenue)
  document.getElementById('alltime-days')!.textContent = String(allDays.length)

  // Initial render
  updateDashboard(allDays, currentYear, currentMonth)

  // Auto-update on dropdown change
  const onChange = () => {
    const y = parseInt(yearSel.value)
    if (y === 0) {
      monthSel.style.display = 'none'
    } else {
      monthSel.style.display = 'block'
    }
    const m = y === 0 ? 0 : parseInt(monthSel.value)
    updateDashboard(allDays, y, m)
  }
  yearSel.addEventListener('change', onChange)
  monthSel.addEventListener('change', onChange)
}

function updateDashboard(allDays: import('../../shared/types').HistoryDay[], selYear: number, selMonth: number): void {
  const fmt = (n: number) => '₱' + n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Filter to selected period (selYear 0 = all time)
  const periodDays = allDays.filter(d => {
    if (selYear === 0) return true
    const [y, m] = d.date.split('-').map(Number)
    if (selMonth === 0) return y === selYear          // whole year
    return y === selYear && m === selMonth             // specific month
  })

  const revenue     = periodDays.reduce((s, d) => s + (d.totalAmount || 0), 0)
  const expenses    = periodDays.reduce((s, d) => s + (d.totalExpenses || 0), 0)
  const profit      = revenue - expenses
  const profitMargin= revenue > 0 ? (profit / revenue) * 100 : 0

  const primaryColor  = '#0ea5e9'
  const successColor  = '#10b981'
  const expenseColor  = '#ef4444'
  const neutralColor  = '#64748b'

  // Revenue cards
  document.getElementById('analytics-cards')!.innerHTML = `
    ${buildCard('Total Revenue', fmt(revenue), Icons.banknote, primaryColor, 1, 'Gross earnings')}
    ${buildCard('Total Expenses', fmt(expenses), Icons.shoppingCart, expenseColor, 2, 'Operational costs')}
    ${buildCard('Net Profit', fmt(profit), Icons.trendingUp, successColor, 3, 'Revenue minus expenses')}
    ${buildCard('Profit Margin', profitMargin.toFixed(1) + '%', Icons.pieChart, neutralColor, 4, 'Efficiency ratio')}
  `

  // Expense List
  const expenseRows: any[] = []
  periodDays.forEach(d => {
    if (d.expenses && d.expenses.length > 0) {
      d.expenses.forEach(e => expenseRows.push({ ...e, date: d.date }))
    }
  })
  expenseRows.sort((a, b) => b.date.localeCompare(a.date)) // Newest first
  
  document.getElementById('expense-total-badge')!.textContent = fmt(expenses)
  const tbody = document.getElementById('expense-tbody')!
  
  if (expenseRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--clr-text-muted); padding: 32px;">No expenses logged for this period.</td></tr>`
  } else {
    tbody.innerHTML = expenseRows.map(e => `
      <tr>
        <td style="font-family: monospace; color: var(--clr-text-muted);">${e.date}</td>
        <td style="font-weight: 600;">${e.desc || '—'}</td>
        <td style="color: var(--clr-text-muted);">${e.remarks || '—'}</td>
        <td style="text-align: right; font-weight: 700; color: #ef4444; font-family: monospace;">-₱${e.amount.toLocaleString('en-PH', {minimumFractionDigits: 2})}</td>
      </tr>
    `).join('')
  }

  // Chart labels & data
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  if (selMonth === 0) {
    // Whole year
    const revData = Array(12).fill(0)
    const expData = Array(12).fill(0)
    periodDays.forEach(d => {
      const m = parseInt(d.date.split('-')[1]) - 1
      revData[m] += d.totalAmount || 0
      expData[m] += d.totalExpenses || 0
    })
    
    document.getElementById('chart-daily-title')!.textContent = `Monthly Revenue — ${selYear}`
    renderLineChart('chart-daily', monthNames, revData, primaryColor, '₱')
    
    document.getElementById('chart-profit-title')!.textContent = `Revenue vs Expenses — ${selYear}`
    renderBarChartGrouped('chart-profit', monthNames, revData, expData, primaryColor, expenseColor, '₱')
  } else {
    // Specific month
    const daysInMonth = new Date(selYear, selMonth, 0).getDate()
    const dailyLabels = Array.from({length: daysInMonth}, (_, i) => String(i + 1))
    
    const revData = Array(daysInMonth).fill(0)
    const expData = Array(daysInMonth).fill(0)
    
    periodDays.forEach(d => {
      const day = parseInt(d.date.split('-')[2]) - 1
      revData[day] += d.totalAmount || 0
      expData[day] += d.totalExpenses || 0
    })
    
    document.getElementById('chart-daily-title')!.textContent = `Daily Revenue — ${new Date(selYear, selMonth - 1, 1).toLocaleDateString('en-PH', { month: 'long' })} ${selYear}`
    renderLineChart('chart-daily', dailyLabels, revData, primaryColor, '₱')
    
    document.getElementById('chart-profit-title')!.textContent = `Daily Rev vs Exp — ${new Date(selYear, selMonth - 1, 1).toLocaleDateString('en-PH', { month: 'long' })} ${selYear}`
    renderBarChartGrouped('chart-profit', dailyLabels, revData, expData, primaryColor, expenseColor, '₱')
  }
}

function renderLineChart(id: string, labels: string[], data: number[], color: string, prefix: string) {
  const canvas = document.getElementById(id) as HTMLCanvasElement
  if (!canvas) return
  const existing = Chart.getChart(canvas); if (existing) existing.destroy()
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createLinearGradient(0, 0, 0, 300)
  gradient.addColorStop(0, color + '66'); gradient.addColorStop(1, color + '00')
  const textColor = document.documentElement.getAttribute('data-theme') === 'dark' ? '#ffffff' : '#000000'
  new Chart(canvas, {
    type: 'line',
    data: { labels, datasets: [{ data, borderColor: color, backgroundColor: gradient, borderWidth: 3, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 6, pointBackgroundColor: '#fff', pointBorderColor: color, pointBorderWidth: 2 }] },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', titleColor: '#e2e8f0', bodyColor: '#fff', padding: 12, cornerRadius: 8, displayColors: false, callbacks: { label: (ctx) => prefix + (ctx.parsed.y ?? 0).toLocaleString('en-PH') } } },
      scales: { y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.1)' }, border: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, color: textColor } }, x: { grid: { display: false }, border: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, color: textColor, maxTicksLimit: 15 } } }
    }
  })
}

function renderBarChartGrouped(id: string, labels: string[], data1: number[], data2: number[], color1: string, color2: string, prefix: string) {
  const canvas = document.getElementById(id) as HTMLCanvasElement
  if (!canvas) return
  const existing = Chart.getChart(canvas); if (existing) existing.destroy()
  const textColor = document.documentElement.getAttribute('data-theme') === 'dark' ? '#ffffff' : '#000000'
  new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Revenue', data: data1, backgroundColor: color1, borderRadius: 4, barPercentage: 0.8, categoryPercentage: 0.8 },
        { label: 'Expenses', data: data2, backgroundColor: color2, borderRadius: 4, barPercentage: 0.8, categoryPercentage: 0.8 }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: true, position: 'bottom', labels: { color: textColor, usePointStyle: true, boxWidth: 8, font: { family: 'Inter', size: 11 } } }, tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.9)', titleColor: '#e2e8f0', bodyColor: '#fff', padding: 12, cornerRadius: 8, callbacks: { label: (ctx) => ctx.dataset.label + ': ' + prefix + (ctx.parsed.y ?? 0).toLocaleString('en-PH') } } },
      scales: { y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.1)' }, border: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, color: textColor } }, x: { grid: { display: false }, border: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, color: textColor, maxTicksLimit: 15 } } }
    }
  })
}

function buildCard(title: string, value: string, icon: string, color: string, delayIndex: number, subtitle: string) {
  return `
    <div class="glass-panel animate-slide-up" style="animation-delay: ${0.05 * delayIndex}s; padding: 20px 24px; display: flex; align-items: center; gap: 16px; border-radius: 18px; transition: all 0.3s ease; cursor: default;" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='var(--shadow-md)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='';">
      <div style="background: ${color}18; color: ${color}; width: 52px; height: 52px; border-radius: 14px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        <div style="transform: scale(1.25);">${icon}</div>
      </div>
      <div style="min-width: 0;">
        <div style="font-size: 11px; color: var(--clr-text-muted); font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em;">${title}</div>
        <div style="font-size: 22px; font-weight: 800; color: var(--clr-text); letter-spacing: -0.02em; line-height: 1.2;">${value}</div>
        <div style="font-size: 11px; color: var(--clr-text-dim); margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${subtitle}</div>
      </div>
    </div>
  `
}
