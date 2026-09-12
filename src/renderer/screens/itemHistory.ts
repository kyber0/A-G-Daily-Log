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

export function renderItemHistoryScreen(
  container: HTMLElement,
  _config: AppConfig
): void {
  let sales: ItemSale[] = []

  const today = new Date()
  let currentMonthStr = today.toISOString().substring(0, 7)

  container.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;overflow-y:auto;" class="custom-scroll">
      <!-- Top Control Bar -->
      <div style="padding:14px 28px;background:var(--clr-surface);border-bottom:1px solid var(--clr-border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;position:sticky;top:0;z-index:10;">
        <div style="display:flex;align-items:center;gap:10px;">
          <div style="width:34px;height:34px;border-radius:8px;background:var(--clr-surface-2);border:1px solid var(--clr-border);display:flex;align-items:center;justify-content:center;color:var(--clr-primary);">
            ${Icons.package || Icons.barChart}
          </div>
          <div>
            <h2 style="margin:0;font-size:15px;font-weight:700;color:var(--clr-text);letter-spacing:-0.01em;">Merchandise Sales Analytics</h2>
            <p style="margin:1px 0 0;font-size:11px;color:var(--clr-text-muted);">Product performance, categories &amp; discount deductions</p>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--clr-text-muted);">Month:</span>
          <input type="text" id="sr-month" value="${currentMonthStr}"
            style="padding:6px 12px;border-radius:8px;border:1px solid var(--clr-border);background:var(--clr-surface);color:var(--clr-text);font-size:13px;font-weight:600;font-family:var(--font);cursor:pointer;width:130px;text-align:center;" />
          <button class="btn btn-ghost btn-icon" id="sr-refresh-btn" title="Refresh Analytics" style="padding:7px;border:1px solid var(--clr-border);border-radius:8px;">${Icons.refreshCw}</button>
        </div>
      </div>

      <!-- Dashboard Main Body -->
      <div id="sr-content" style="padding:22px 28px 40px;display:flex;flex-direction:column;gap:20px;">
        <div style="display:flex;justify-content:center;padding:60px;"><div class="spinner"></div></div>
      </div>
    </div>
  `

  const elMonth   = document.getElementById('sr-month')   as HTMLInputElement
  const elContent = document.getElementById('sr-content')!
  const refreshBtn = document.getElementById('sr-refresh-btn')

  flatpickr(elMonth, {
    defaultDate: today,
    plugins: [
      monthSelectPlugin({
        shorthand: true,
        dateFormat: 'Y-m',
        altFormat: 'F Y'
      })
    ],
    onChange: (_selectedDates: Date[], dateStr: string) => {
      currentMonthStr = dateStr
      loadData()
    }
  })

  refreshBtn?.addEventListener('click', loadData)

  async function loadData() {
    elContent.innerHTML = '<div style="display:flex;justify-content:center;padding:60px;"><div class="spinner"></div></div>'
    try {
      const res = await window.api.loadItemSalesMonth(currentMonthStr)
      if (res.ok) sales = res.data || []
      else throw new Error(res.error)
    } catch (e) {
      showToast('Failed to load merchandise report', 'error')
      sales = []
    }
    renderData()
  }

  function renderData() {
    if (sales.length === 0) {
      elContent.innerHTML = `
        <div style="background:var(--clr-surface);border:1px solid var(--clr-border);border-radius:10px;padding:60px 20px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px;">
          <div style="color:var(--clr-text-dim);width:40px;height:40px;">${Icons.package || Icons.barChart}</div>
          <h3 style="margin:0;font-size:16px;color:var(--clr-text);">No Merchandise Sales Found</h3>
          <p style="margin:0;font-size:13px;color:var(--clr-text-muted);">No product sales were recorded for <strong>${currentMonthStr}</strong>.</p>
        </div>`
      return
    }

    let grossAmt = 0
    let totalDisc = 0
    let netTotal = 0
    let totalQty = 0

    const byItem = new Map<string, { qty: number; net: number }>()
    const byCategory = new Map<string, number>()
    const byDate = new Map<string, number>()

    for (const s of sales) {
      const gross = Number(s.salesAmount) || 0
      const disc = Number(s.discount) || 0
      const net = Number(s.salesTotal) || 0
      const qty = Number(s.qty) || 0
      
      grossAmt  += gross
      totalDisc += disc
      netTotal  += net
      totalQty  += qty

      const itmName = s.item || 'Unknown Item'
      const curItem = byItem.get(itmName) || { qty: 0, net: 0 }
      curItem.qty += qty
      curItem.net += net
      byItem.set(itmName, curItem)

      const cat = s.category || 'Uncategorized'
      byCategory.set(cat, (byCategory.get(cat) || 0) + net)
      
      const dStr = s.date || 'Unknown'
      byDate.set(dStr, (byDate.get(dStr) || 0) + net)
    }

    const avgSale = sales.length ? netTotal / sales.length : 0
    const discRate = grossAmt > 0 ? (totalDisc / grossAmt) * 100 : 0

    // Parse friendly month label
    const [yy, mm] = currentMonthStr.split('-')
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    const monthLabel = `${monthNames[parseInt(mm, 10) - 1]} ${yy}`

    elContent.innerHTML = `
      <!-- ── Filter Period Indicator ────────────────────────────────────────── -->
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:var(--clr-surface);border:1px solid var(--clr-border);border-radius:8px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <span style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--clr-text-muted);">Reporting Window:</span>
          <span style="font-size:12.5px;font-weight:700;color:var(--clr-text);">${monthLabel}</span>
        </div>
        <div style="font-size:11px;color:var(--clr-text-dim);">
          ${sales.length} Transactions Logged &nbsp;|&nbsp; ${fmtNumber(totalQty)} Units Sold
        </div>
      </div>

      <!-- ── LEVEL 1: COMMERCIAL SALES PERFORMANCE ─────────────────────────── -->
      <div>
        ${sectionHeader('Level 1: Commercial Sales Performance', 'Net merchandise revenue and transaction unit economics', 'Commercial P&L')}
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
          
          <!-- Card 1: Net Revenue (Hero) -->
          <div style="background:var(--clr-surface);border:1px solid var(--clr-border);border-top:3px solid #7c3aed;border-radius:10px;padding:20px;display:flex;flex-direction:column;gap:14px;">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
              <div>
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--clr-text-muted);">Net Merchandise Revenue</div>
                <div style="font-size:28px;font-weight:800;color:var(--clr-text);letter-spacing:-0.03em;margin-top:4px;line-height:1.1;">
                  ${fmtCurrency(netTotal)}
                </div>
              </div>
              <span style="font-size:11px;font-weight:700;color:#7c3aed;background:rgba(124,58,237,0.08);border:1px solid rgba(124,58,237,0.2);padding:3px 8px;border-radius:6px;white-space:nowrap;">
                Realized Sales
              </span>
            </div>

            <!-- Inflow Breakdown -->
            <div style="background:var(--clr-surface-2);border:1px solid var(--clr-border);border-radius:8px;padding:10px 14px;display:flex;flex-direction:column;gap:8px;">
              <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:600;color:var(--clr-text-muted);">
                <span>Discount Impact</span>
                <span>Deduction: ${discRate.toFixed(1)}% of Gross</span>
              </div>
              <div style="height:6px;background:var(--clr-surface);border-radius:4px;overflow:hidden;display:flex;">
                <div style="width:${Math.max(100 - discRate, 0)}%;background:#7c3aed;" title="Net: ${(100 - discRate).toFixed(1)}%"></div>
                <div style="width:${Math.min(discRate, 100)}%;background:#ef4444;" title="Discounts: ${discRate.toFixed(1)}%"></div>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:12px;margin-top:2px;">
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="width:8px;height:8px;border-radius:2px;background:#7c3aed;"></span>
                  <span style="color:var(--clr-text-muted);">Gross Catalog:</span>
                  <strong style="color:var(--clr-text);">${fmtCurrency(grossAmt)}</strong>
                </div>
                <div style="display:flex;align-items:center;gap:6px;">
                  <span style="width:8px;height:8px;border-radius:2px;background:#ef4444;"></span>
                  <span style="color:var(--clr-text-muted);">Discounts:</span>
                  <strong style="color:#ef4444;">-${fmtCurrency(totalDisc)}</strong>
                </div>
              </div>
            </div>
          </div>

          <!-- Card 2: Basket Economics & Average Sale -->
          <div style="background:var(--clr-surface);border:1px solid var(--clr-border);border-top:3px solid #10b981;border-radius:10px;padding:20px;display:flex;flex-direction:column;gap:14px;">
            <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;">
              <div>
                <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.07em;color:var(--clr-text-muted);">Average Order Value (AOV)</div>
                <div style="font-size:28px;font-weight:800;color:var(--clr-text);letter-spacing:-0.03em;margin-top:4px;line-height:1.1;">
                  ${fmtCurrency(avgSale)}
                </div>
              </div>
              <span style="font-size:11px;font-weight:700;color:#10b981;background:rgba(16,185,129,0.08);border:1px solid rgba(16,185,129,0.2);padding:3px 8px;border-radius:6px;white-space:nowrap;">
                ${sales.length} Orders
              </span>
            </div>

            <!-- Volume context -->
            <div style="background:var(--clr-surface-2);border:1px solid var(--clr-border);border-radius:8px;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">
              <div>
                <div style="font-size:10.5px;color:var(--clr-text-muted);text-transform:uppercase;font-weight:600;">Total Quantity Sold</div>
                <div style="font-size:13px;font-weight:700;color:var(--clr-text);margin-top:2px;">${fmtNumber(totalQty)} units</div>
              </div>
              <div style="text-align:right;">
                <div style="font-size:10.5px;color:var(--clr-text-muted);text-transform:uppercase;font-weight:600;">Average Units / Order</div>
                <div style="font-size:13px;font-weight:700;color:#10b981;margin-top:2px;">${(sales.length > 0 ? totalQty / sales.length : 0).toFixed(1)} items</div>
              </div>
            </div>
          </div>

        </div>
      </div>

      <!-- ── LEVEL 2: PRODUCT CONCENTRATION & CATEGORY MIX ──────────────────── -->
      <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:12px;">
        
        <!-- Top Products Bar Chart -->
        <div>
          ${sectionHeader('Product Concentration', 'Top grossing merchandise items')}
          ${chartCard('Top Products by Net Revenue', 'Ranked contribution of top items', 'chart-top-items', 240)}
        </div>

        <!-- Category Donut -->
        <div>
          ${sectionHeader('Category Contribution', 'Revenue share by product category')}
          ${chartCard('Revenue by Category', 'Distribution across catalog categories', 'chart-category', 240)}
        </div>

      </div>

      <!-- ── LEVEL 3: DAILY SALES PROGRESSION ───────────────────────────────── -->
      <div>
        ${sectionHeader('Level 3: Sales Velocity & Cadence', 'Daily merchandise sales progression throughout the month', 'Trajectory')}
        ${chartCard('Daily Merchandise Sales', 'Day-by-day revenue velocity', 'chart-daily-items', 220)}
      </div>

      <!-- ── LEVEL 4: TRANSACTION JOURNAL / ITEM LOGS ───────────────────────── -->
      <div>
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
          ${sectionHeader('Level 4: Transaction Journal', 'Detailed record of individual customer merchandise sales', 'Sales Ledger')}
          <span style="font-size:12px;font-weight:700;color:var(--clr-text-muted);background:var(--clr-surface-2);border:1px solid var(--clr-border);padding:3px 10px;border-radius:6px;">
            ${sales.length} transactions
          </span>
        </div>
        <div style="background:var(--clr-surface);border:1px solid var(--clr-border);border-radius:10px;overflow:hidden;">
          <div style="max-height:340px;overflow-y:auto;" class="custom-scroll">
            <table style="width:100%;border-collapse:collapse;text-align:left;font-size:12.5px;">
              <thead>
                <tr style="background:var(--clr-surface-2);border-bottom:1px solid var(--clr-border);">
                  <th style="padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--clr-text-muted);letter-spacing:0.05em;width:110px;">Date</th>
                  <th style="padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--clr-text-muted);letter-spacing:0.05em;">Item Name</th>
                  <th style="padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--clr-text-muted);letter-spacing:0.05em;">Category</th>
                  <th style="padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--clr-text-muted);letter-spacing:0.05em;text-align:right;width:70px;">Qty</th>
                  <th style="padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--clr-text-muted);letter-spacing:0.05em;text-align:right;width:100px;">Gross</th>
                  <th style="padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--clr-text-muted);letter-spacing:0.05em;text-align:right;width:90px;">Discount</th>
                  <th style="padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--clr-text-muted);letter-spacing:0.05em;text-align:right;width:110px;">Net Total</th>
                </tr>
              </thead>
              <tbody>
                ${[...sales].sort((a, b) => (b.date || '').localeCompare(a.date || '')).map(s => `
                  <tr style="border-bottom:1px solid var(--clr-border);">
                    <td style="padding:10px 16px;font-family:monospace;color:var(--clr-text-muted);">${s.date}</td>
                    <td style="padding:10px 16px;font-weight:600;color:var(--clr-text);">${s.item}</td>
                    <td style="padding:10px 16px;color:var(--clr-text-muted);">${s.category || 'General'}</td>
                    <td style="padding:10px 16px;text-align:right;font-weight:600;color:var(--clr-text);">${fmtNumber(s.qty)}</td>
                    <td style="padding:10px 16px;text-align:right;color:var(--clr-text-muted);">${fmtCurrency(s.salesAmount)}</td>
                    <td style="padding:10px 16px;text-align:right;color:${s.discount ? '#ef4444' : 'var(--clr-text-dim)'};">${s.discount ? '-' + fmtCurrency(s.discount) : '—'}</td>
                    <td style="padding:10px 16px;text-align:right;font-weight:700;color:var(--clr-text);">${fmtCurrency(s.salesTotal)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `

    // Render Charts
    setTimeout(() => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark'
      const gridColor = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'
      const tickColor = isDark ? '#64748b' : '#94a3b8'

      // 1. Top items (Horizontal Bar)
      const canvasTop = document.getElementById('chart-top-items') as HTMLCanvasElement
      if (canvasTop) {
        if (chartTop) chartTop.destroy()
        const topItems = [...byItem.entries()].sort((a, b) => b[1].net - a[1].net).slice(0, 7)
        chartTop = new Chart(canvasTop, {
          type: 'bar',
          data: {
            labels: topItems.map(t => t[0]),
            datasets: [{
              label: 'Revenue',
              data: topItems.map(t => t[1].net),
              backgroundColor: '#7c3aed',
              borderRadius: 4
            }]
          },
          options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (c) => ` ${fmtCurrency(c.parsed.x ?? 0)}` } }
            },
            scales: {
              x: {
                grid: { color: gridColor },
                ticks: { color: tickColor, font: { size: 11 }, callback: (v) => fmtCompact(Number(v) || 0) }
              },
              y: {
                grid: { display: false },
                ticks: { color: tickColor, font: { size: 11 } }
              }
            }
          }
        })
      }

      // 2. Category Donut
      const canvasCat = document.getElementById('chart-category') as HTMLCanvasElement
      if (canvasCat) {
        if (chartCat) chartCat.destroy()
        const categories = [...byCategory.entries()].sort((a, b) => b[1] - a[1])
        const colors = ['#7c3aed', '#0284c7', '#10b981', '#f59e0b', '#ec4899', '#6366f1', '#14b8a6', '#64748b']
        chartCat = new Chart(canvasCat, {
          type: 'doughnut',
          data: {
            labels: categories.map(t => t[0]),
            datasets: [{
              data: categories.map(t => t[1]),
              backgroundColor: colors,
              borderWidth: 2,
              borderColor: isDark ? '#171a21' : '#ffffff'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '68%',
            plugins: {
              legend: {
                position: 'right',
                labels: { color: tickColor, usePointStyle: true, boxWidth: 8, font: { size: 11 } }
              },
              tooltip: { callbacks: { label: (c) => ` ${c.label}: ${fmtCurrency(c.parsed ?? 0)}` } }
            }
          }
        })
      }

      // 3. Daily Line
      const canvasLine = document.getElementById('chart-daily-items') as HTMLCanvasElement
      if (canvasLine) {
        if (chartLine) chartLine.destroy()
        const daysInMonth = new Date(parseInt(yy, 10), parseInt(mm, 10), 0).getDate()
        const dailyLabels = Array.from({ length: daysInMonth }, (_, i) => String(i + 1))
        const dailyData = dailyLabels.map(dStr => {
          const fullDate = `${yy}-${mm}-${dStr.padStart(2, '0')}`
          return byDate.get(fullDate) || 0
        })

        chartLine = new Chart(canvasLine, {
          type: 'line',
          data: {
            labels: dailyLabels,
            datasets: [{
              label: 'Daily Sales',
              data: dailyData,
              borderColor: '#7c3aed',
              backgroundColor: 'rgba(124, 58, 237, 0.08)',
              fill: true,
              tension: 0.3,
              borderWidth: 2.2,
              pointRadius: dailyLabels.length > 31 ? 0 : 3
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: (c) => ` Revenue: ${fmtCurrency(c.parsed.y ?? 0)}` } }
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
    }, 50)
  }

  loadData()
}
