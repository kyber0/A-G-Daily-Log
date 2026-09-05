import type { AppConfig } from '../../shared/types'
import { Icons } from '../components/icons'

export function renderLogsScreen(
  container: HTMLElement,
  config: AppConfig
): void {
  container.innerHTML = `
    <style>
      .lg-wrap{display:flex;flex-direction:column;height:100%;}
      .lg-tab-bar{display:flex;gap:4px;padding:8px 24px;background:var(--clr-surface);border-bottom:1px solid var(--clr-border);}
      .lg-tab{padding:9px 16px;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;background:transparent;color:var(--clr-text-muted);font-family:var(--font);transition:all .2s;display:flex;align-items:center;gap:6px;white-space:nowrap;}
      .lg-tab svg{width:15px;height:15px;flex-shrink:0;}
      .lg-tab.active{background:var(--clr-primary-glow);color:var(--clr-primary);}
      .lg-tab:hover:not(.active){background:var(--clr-surface-2);color:var(--clr-text);}
    </style>
    <div class="lg-wrap">
      <div class="lg-tab-bar">
        <button class="lg-tab active" id="lg-tab-water" type="button">
          ${Icons.clipboardList} Water Raw Logs
        </button>
        <button class="lg-tab" id="lg-tab-item" type="button">
          ${Icons.package} Item Sales Logs
        </button>
      </div>
      <div id="lg-content" style="flex:1;overflow:hidden;position:relative;"></div>
    </div>
  `

  const btnWater = container.querySelector('#lg-tab-water') as HTMLButtonElement
  const btnItem  = container.querySelector('#lg-tab-item')  as HTMLButtonElement
  const content  = container.querySelector('#lg-content')   as HTMLElement

  function switchTab(tab: 'water' | 'item') {
    if (tab === 'water') {
      btnWater.classList.add('active')
      btnItem.classList.remove('active')
      import('./waterLogs').then(m => m.renderWaterLogsScreen(content))
    } else {
      btnItem.classList.add('active')
      btnWater.classList.remove('active')
      import('./itemLogs').then(m => m.renderItemLogsScreen(content))
    }
  }

  btnWater.addEventListener('click', () => switchTab('water'))
  btnItem.addEventListener('click',  () => switchTab('item'))

  switchTab('water')
}
