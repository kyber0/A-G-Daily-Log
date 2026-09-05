import type { AppConfig, ItemSale } from '../../shared/types'
import { showToast } from '../components/ui'
import { Icons } from '../components/icons'
import flatpickr from 'flatpickr'
import monthSelectPlugin from 'flatpickr/dist/plugins/monthSelect/index.js'
import 'flatpickr/dist/flatpickr.min.css'
import 'flatpickr/dist/plugins/monthSelect/style.css'
import Chart from 'chart.js/auto'

let chartTop: Chart | null = null
let chartCat: Chart | null = null
let chartLine: Chart | null = null

function formatAmount(n: number): string {
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function renderItemHistoryScreen(
  container: HTMLElement,
  config: AppConfig
): void {
  let sales: ItemSale[] = []

  const today = new Date()
  let currentMonthStr = today.toISOString().substring(0, 7)

  container.innerHTML = `
    <!-- Header -->
    <div class="screen-header animate-slide-up" style="display:flex;align-items:center;justify-content:space-between;padding:24px 32px 20px;border-bottom:1px solid var(--clr-border);background:var(--clr-surface)">
      <div style="display:flex;align-items:center;gap:12px">
        <span style="color:var(--clr-primary);background:var(--clr-primary-glow);padding:10px;border-radius:12px;display:inline-flex">${Icons.barChart}</span>
        <div>
          <h2 style="margin:0;font-size:20px;font-weight:800;letter-spacing:-0.02em;color:var(--clr-text)">Item Sales Analytics</h2>
          <p style="margin:2px 0 0;font-size:13px;color:var(--clr-text-muted)">Monthly overview for equipment &amp; supplies</p>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--clr-text-muted)">Month</span>
        <input type="text" id="sr-month" value="${currentMonthStr}"
          style="padding:7px 12px;border-radius:10px;border:1px solid var(--clr-border);background:var(--clr-surface);color:var(--clr-text);font-size:13px;font-weight:600;font-family:var(--font);cursor:pointer;transition:border-color .2s;width:140px;text-align:center" />
      </div>
    </div>

    <!-- Content -->
    <div id="sr-content" class="animate-slide-up stagger-1" style="padding:24px 32px;overflow-y:auto;flex:1">
      <div style="display:flex;justify-content:center;padding:48px"><div class="spinner"></div></div>
    </div>
  `

  const elMonth   = document.getElementById('sr-month')   as HTMLInputElement
  const elContent = document.getElementById('sr-content')!

  // Focus ring
  elMonth.addEventListener('focus', () => elMonth.style.borderColor = 'var(--clr-primary)')
  elMonth.addEventListener('blur',  () => elMonth.style.borderColor = 'var(--clr-border)')

  flatpickr(elMonth, {
    defaultDate: today,
    plugins: [
      monthSelectPlugin({
        shorthand: true,
        dateFormat: 'Y-m',
        altFormat: 'F Y'
      })
    ],
    onChange: (selectedDates: Date[], dateStr: string) => {
      currentMonthStr = dateStr
      loadData()
    }
  })

  async function loadData() {
    elContent.innerHTML = '<div style="display:flex;justify-content:center;padding:48px"><div class="spinner"></div></div>'
    try {
      const res = await window.api.loadItemSalesMonth(currentMonthStr)
      if (res.ok) sales = res.data
      else throw new Error(res.error)
    } catch (e) {
      showToast('Failed to load sales report', 'error')
      sales = []
    }
    renderData()
  }

  function renderData() {
    if (sales.length === 0) {
      elContent.innerHTML = `
        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:80px;text-align:center;color:var(--clr-text-muted)">
          <div style="color:var(--clr-text-dim);margin-bottom:20px;transform:scale(2.5)">${Icons.barChart}</div>
          <h3 style="margin:0 0 8px;font-size:18px;color:var(--clr-text)">No Sales Found</h3>
          <p style="margin:0;font-size:14px">No item sales have been logged for <strong>${currentMonthStr}</strong> yet.</p>
        </div>`
      return
    }

    let grossAmt = 0, totalDisc = 0, netTotal = 0, totalQty = 0
    const byItem = new Map<string, number>()
    const byCategory = new Map<string, number>()
    const byDate = new Map<string, number>()

    for (const s of sales) {
      const gross = s.salesAmount || 0
      const disc = s.discount || 0
      const net = s.salesTotal || 0
      const qty = s.qty || 0
      
      grossAmt  += gross
      totalDisc += disc
      netTotal  += net
      totalQty  += qty

      byItem.set(s.item, (byItem.get(s.item) || 0) + net)
      const cat = s.category || 'Uncategorized'
      byCategory.set(cat, (byCategory.get(cat) || 0) + net)
      
      const dStr = s.date || 'Unknown'
      byDate.set(dStr, (byDate.get(dStr) || 0) + net)
    }

    const avgSale = sales.length ? netTotal / sales.length : 0

    let html = `
      <!-- KPI Cards -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px">
        ${buildCard('Gross Amount', '₱' + formatAmount(grossAmt), Icons.banknote, '#0ea5e9', 'Total before discounts')}
        ${buildCard('Total Discounts', '-₱' + formatAmount(totalDisc), Icons.tag, '#ef4444', totalDisc > 0 ? ((totalDisc/grossAmt)*100).toFixed(1)+'% of gross' : 'No discounts')}
        ${buildCard('Net Total', '₱' + formatAmount(netTotal), Icons.trendingUp, '#10b981', 'After discounts')}
        ${buildCard('Avg Sale Value', '₱' + formatAmount(avgSale), Icons.pieChart, '#8b5cf6', 'Per transaction')}
      </div>

      <!-- Charts -->
      <div style="display:grid;grid-template-columns:1.5fr 1fr;gap:16px;margin-bottom:24px;min-height:300px;">
        <!-- Top Products Bar Chart -->
        <div class="glass-panel chart-container" style="padding:24px;display:flex;flex-direction:column;border-radius:20px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
            <h3 style="margin:0;font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:0.1em;color:var(--clr-text-muted);">Top Products by Revenue</h3>
          </div>
          <div style="flex:1;position:relative;"><canvas id="chart-top-items"></canvas></div>
        </div>
        <!-- Category Donut -->
        <div class="glass-panel chart-container" style="padding:24px;display:flex;flex-direction:column;border-radius:20px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
            <h3 style="margin:0;font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:0.1em;color:var(--clr-text-muted);">Revenue by Category</h3>
          </div>
          <div style="flex:1;position:relative;"><canvas id="chart-category"></canvas></div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr;gap:16px;margin-bottom:24px;min-height:300px;">
        <div class="glass-panel chart-container" style="padding:24px;display:flex;flex-direction:column;border-radius:20px;">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
            <h3 style="margin:0;font-weight:600;font-size:13px;text-transform:uppercase;letter-spacing:0.1em;color:var(--clr-text-muted);">Daily Sales Trend</h3>
          </div>
          <div style="flex:1;position:relative;"><canvas id="chart-daily-items"></canvas></div>
        </div>
      </div>
      
      <!-- Table -->
      <div class="glass-panel" style="border-radius: 20px; display: flex; flex-direction: column; overflow: hidden; margin-bottom: 24px;">
        <div style="padding: 20px 24px; border-bottom: 1px solid var(--clr-border); display: flex; align-items: center; justify-content: space-between;">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="color: var(--clr-primary);">${Icons.clipboardList}</span>
            <h3 style="margin: 0; font-size: 16px; font-weight: 700; color: var(--clr-text);">All Sales</h3>
          </div>
          <div style="font-size: 13px; font-weight: 700; background: var(--clr-surface-2); color: var(--clr-text-muted); padding: 4px 12px; border-radius: 12px;">${sales.length} transactions</div>
        </div>
        <div style="overflow-x: auto;">
          <table class="expenses-table" style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr>
                <th style="font-weight: 600; color: var(--clr-text-muted); padding: 12px 16px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--clr-border);">Date</th>
                <th style="font-weight: 600; color: var(--clr-text-muted); padding: 12px 16px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--clr-border);">Item</th>
                <th style="font-weight: 600; color: var(--clr-text-muted); padding: 12px 16px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--clr-border);">Category</th>
                <th style="text-align: right; font-weight: 600; color: var(--clr-text-muted); padding: 12px 16px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--clr-border);">Qty</th>
                <th style="text-align: right; font-weight: 600; color: var(--clr-text-muted); padding: 12px 16px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--clr-border);">Gross</th>
                <th style="text-align: right; font-weight: 600; color: var(--clr-text-muted); padding: 12px 16px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--clr-border);">Discount</th>
                <th style="text-align: right; font-weight: 600; color: var(--clr-text-muted); padding: 12px 16px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--clr-border);">Net Total</th>
              </tr>
            </thead>
            <tbody>
              ${[...sales].sort((a,b)=>b.date.localeCompare(a.date)).map(s => `
                <tr>
                  <td style="padding: 14px 16px; border-bottom: 1px solid var(--clr-border); color: var(--clr-text); font-size: 13px; font-family: monospace;">${s.date}</td>
                  <td style="padding: 14px 16px; border-bottom: 1px solid var(--clr-border); color: var(--clr-text); font-size: 13px; font-weight: 600;">${s.item}</td>
                  <td style="padding: 14px 16px; border-bottom: 1px solid var(--clr-border); color: var(--clr-text-muted); font-size: 13px;">${s.category}</td>
                  <td style="padding: 14px 16px; border-bottom: 1px solid var(--clr-border); color: var(--clr-text); font-size: 13px; text-align: right;">${s.qty}</td>
                  <td style="padding: 14px 16px; border-bottom: 1px solid var(--clr-border); color: var(--clr-text); font-size: 13px; text-align: right;">₱${formatAmount(s.salesAmount)}</td>
                  <td style="padding: 14px 16px; border-bottom: 1px solid var(--clr-border); color: var(--clr-error); font-size: 13px; text-align: right;">${s.discount ? '-₱'+formatAmount(s.discount) : '—'}</td>
                  <td style="padding: 14px 16px; border-bottom: 1px solid var(--clr-border); color: var(--clr-primary); font-size: 13px; font-weight: 700; text-align: right;">₱${formatAmount(s.salesTotal)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `
    elContent.innerHTML = html

    // Render Charts
    setTimeout(() => {
      // Top items (Horizontal Bar)
      const topItems = [...byItem.entries()].sort((a,b)=>b[1]-a[1]).slice(0,8)
      renderHBarChart('chart-top-items', topItems.map(t=>t[0]), topItems.map(t=>t[1]), '#0ea5e9')

      // Category Donut
      const categories = [...byCategory.entries()].sort((a,b)=>b[1]-a[1])
      const colors = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#6366f1', '#14b8a6']
      renderDonutChart('chart-category', categories.map(t=>t[0]), categories.map(t=>t[1]), colors)

      // Daily Line
      const [yy, mm] = currentMonthStr.split('-')
      const daysInMonth = new Date(parseInt(yy), parseInt(mm), 0).getDate()
      const dailyLabels = Array.from({length: daysInMonth}, (_, i) => String(i + 1))
      const dailyData = dailyLabels.map(dStr => {
        const fullDate = `${yy}-${mm}-${dStr.padStart(2, '0')}`
        return byDate.get(fullDate) || 0
      })
      renderLineChart('chart-daily-items', dailyLabels, dailyData, '#8b5cf6')
    }, 50)
  }

  loadData()
}

function buildCard(title: string, value: string, icon: string, color: string, subtitle: string) {
  return `
    <div class="glass-panel" style="padding: 20px 24px; display: flex; align-items: center; gap: 16px; border-radius: 18px; transition: all 0.3s ease; cursor: default;" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='var(--shadow-md)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='';">
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

function renderHBarChart(id: string, labels: string[], data: number[], color: string) {
  const canvas = document.getElementById(id) as HTMLCanvasElement
  if (!canvas) return
  if (chartTop) chartTop.destroy()
  const textColor = document.documentElement.getAttribute('data-theme') === 'dark' ? '#ffffff' : '#000000'
  chartTop = new Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ data, backgroundColor: color, borderRadius: 4, barThickness: 'flex' }] },
    options: {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => '₱' + (c.parsed.x ?? 0).toLocaleString('en-PH') } } },
      scales: { 
        x: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.1)' }, border: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, color: textColor } },
        y: { grid: { display: false }, border: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, color: textColor } }
      }
    }
  })
}

function renderDonutChart(id: string, labels: string[], data: number[], colors: string[]) {
  const canvas = document.getElementById(id) as HTMLCanvasElement
  if (!canvas) return
  if (chartCat) chartCat.destroy()
  const textColor = document.documentElement.getAttribute('data-theme') === 'dark' ? '#ffffff' : '#000000'
  chartCat = new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0, hoverOffset: 4 }] },
    options: {
      responsive: true, maintainAspectRatio: false, cutout: '70%',
      plugins: {
        legend: { position: 'right', labels: { color: textColor, usePointStyle: true, boxWidth: 8, font: { family: 'Inter', size: 11 } } },
        tooltip: { callbacks: { label: (c) => '₱' + (c.parsed ?? 0).toLocaleString('en-PH') } }
      }
    }
  })
}

function renderLineChart(id: string, labels: string[], data: number[], color: string) {
  const canvas = document.getElementById(id) as HTMLCanvasElement
  if (!canvas) return
  if (chartLine) chartLine.destroy()
  const ctx = canvas.getContext('2d')!
  const gradient = ctx.createLinearGradient(0, 0, 0, 300)
  gradient.addColorStop(0, color + '66'); gradient.addColorStop(1, color + '00')
  const textColor = document.documentElement.getAttribute('data-theme') === 'dark' ? '#ffffff' : '#000000'
  chartLine = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets: [{ data, borderColor: color, backgroundColor: gradient, borderWidth: 3, fill: true, tension: 0.4, pointRadius: 0, pointHoverRadius: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => '₱' + (c.parsed.y ?? 0).toLocaleString('en-PH') } } },
      scales: { 
        y: { beginAtZero: true, grid: { color: 'rgba(148,163,184,0.1)' }, border: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, color: textColor } },
        x: { grid: { display: false }, border: { display: false }, ticks: { font: { family: 'Inter', size: 11 }, color: textColor, maxTicksLimit: 15 } }
      }
    }
  })
}
