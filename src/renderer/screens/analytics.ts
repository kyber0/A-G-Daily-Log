import type { AppConfig } from '../../shared/types'
import { Icons } from '../components/icons'

export function renderAnalyticsScreen(container: HTMLElement, config?: AppConfig): void {
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;height:100%;">
      <div style="display:flex;gap:6px;padding:10px 32px;background:var(--clr-surface);border-bottom:1px solid var(--clr-border);flex-shrink:0;">
        <button id="tab-exec-analytics" style="flex:1;padding:10px 16px;border:none;background:var(--clr-primary-glow);border-radius:10px;font-weight:700;font-size:13px;color:var(--clr-primary);cursor:pointer;transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:8px;">
          <span style="display:flex;width:16px;height:16px;">${Icons.activity || Icons.trendingUp}</span> Business Overview
        </button>
        <button id="tab-water-analytics" style="flex:1;padding:10px 16px;border:none;background:transparent;border-radius:10px;font-weight:700;font-size:13px;color:var(--clr-text-muted);cursor:pointer;transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:8px;">
          <span style="display:flex;width:16px;height:16px;">${Icons.droplets || Icons.pieChart}</span> Water Refills
        </button>
        <button id="tab-item-analytics" style="flex:1;padding:10px 16px;border:none;background:transparent;border-radius:10px;font-weight:700;font-size:13px;color:var(--clr-text-muted);cursor:pointer;transition:all 0.2s;display:flex;align-items:center;justify-content:center;gap:8px;">
          <span style="display:flex;width:16px;height:16px;">${Icons.package || Icons.barChart}</span> Merchandise &amp; Inventory
        </button>
      </div>
      <div id="analytics-content-area" style="flex:1;display:flex;flex-direction:column;overflow:hidden;position:relative;"></div>
    </div>
  `

  const btnExec  = document.getElementById('tab-exec-analytics')!
  const btnWater = document.getElementById('tab-water-analytics')!
  const btnItem  = document.getElementById('tab-item-analytics')!
  const contentArea = document.getElementById('analytics-content-area')!

  function resetBtns() {
    [btnExec, btnWater, btnItem].forEach(b => {
      b.style.color = 'var(--clr-text-muted)'
      b.style.background = 'transparent'
    })
  }

  function switchTab(tab: 'exec' | 'water' | 'item') {
    resetBtns()
    if (tab === 'exec') {
      btnExec.style.color = 'var(--clr-primary)'
      btnExec.style.background = 'var(--clr-primary-glow)'
      import('./executiveAnalytics').then(m => m.renderExecutiveAnalyticsScreen(contentArea))
    } else if (tab === 'water') {
      btnWater.style.color = 'var(--clr-primary)'
      btnWater.style.background = 'var(--clr-primary-glow)'
      import('./waterAnalytics').then(m => m.renderWaterAnalyticsScreen(contentArea))
    } else {
      btnItem.style.color = 'var(--clr-primary)'
      btnItem.style.background = 'var(--clr-primary-glow)'
      import('./itemHistory').then(m => m.renderItemHistoryScreen(contentArea, config || {} as any))
    }
  }

  btnExec.addEventListener('click',  () => switchTab('exec'))
  btnWater.addEventListener('click', () => switchTab('water'))
  btnItem.addEventListener('click',  () => switchTab('item'))

  // Default to Business Overview
  switchTab('exec')
}
