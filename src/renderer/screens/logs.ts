import type { AppConfig } from '../../shared/types'
import { Icons } from '../components/icons'

export function renderLogsScreen(
  container: HTMLElement,
  _config: AppConfig
): void {
  // If already rendered, do not wipe DOM (preserves user state!)
  if (container.querySelector('.lg-wrap')) return

  container.innerHTML = `
    <style>
      .lg-wrap {
        display: flex;
        flex-direction: column;
        height: 100%;
        background: var(--clr-bg);
      }
      .lg-tab-bar {
        display: flex;
        align-items: center;
        padding: 8px 28px 0;
        background: var(--clr-surface);
        border-bottom: 1px solid var(--clr-border);
      }
      .lg-tabs-container {
        display: flex;
        gap: 6px;
      }
      .lg-tab {
        padding: 9px 18px;
        border: none;
        border-bottom: 2px solid transparent;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        background: transparent;
        color: var(--clr-text-muted);
        font-family: var(--font);
        transition: all 0.2s;
        display: flex;
        align-items: center;
        gap: 7px;
        white-space: nowrap;
        border-radius: 6px 6px 0 0;
      }
      .lg-tab svg { width: 16px; height: 16px; flex-shrink: 0; }
      .lg-tab.active {
        color: var(--clr-primary);
        border-bottom-color: var(--clr-primary);
        background: var(--clr-primary-glow);
        font-weight: 700;
      }
      .lg-tab:hover:not(.active) {
        color: var(--clr-text);
        background: var(--clr-surface-2);
      }
      .lg-pane {
        height: 100%;
        width: 100%;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
    </style>
    <div class="lg-wrap">
      <div class="lg-tab-bar">
        <div class="lg-tabs-container">
          <button class="lg-tab active" id="lg-tab-water" type="button">
            ${Icons.droplets} Water Audit Trail
          </button>
          <button class="lg-tab" id="lg-tab-item" type="button">
            ${Icons.package} Item Sales Audit Trail
          </button>
        </div>
      </div>
      <div id="lg-content" style="flex:1;overflow:hidden;position:relative;">
        <div id="lg-pane-water" class="lg-pane"></div>
        <div id="lg-pane-item" class="lg-pane" style="display:none;"></div>
      </div>
    </div>
  `

  const btnWater = container.querySelector('#lg-tab-water') as HTMLButtonElement
  const btnItem  = container.querySelector('#lg-tab-item')  as HTMLButtonElement
  const paneWater = container.querySelector('#lg-pane-water') as HTMLElement
  const paneItem  = container.querySelector('#lg-pane-item') as HTMLElement

  let waterLoaded = false
  let itemLoaded = false

  function switchTab(tab: 'water' | 'item') {
    if (tab === 'water') {
      btnWater.classList.add('active')
      btnItem.classList.remove('active')
      paneWater.style.display = 'flex'
      paneItem.style.display = 'none'
      if (!waterLoaded) {
        waterLoaded = true
        import('./waterLogs').then(m => m.renderWaterLogsScreen(paneWater))
      }
    } else {
      btnItem.classList.add('active')
      btnWater.classList.remove('active')
      paneWater.style.display = 'none'
      paneItem.style.display = 'flex'
      if (!itemLoaded) {
        itemLoaded = true
        import('./itemLogs').then(m => m.renderItemLogsScreen(paneItem))
      }
    }
  }

  btnWater.addEventListener('click', () => switchTab('water'))
  btnItem.addEventListener('click',  () => switchTab('item'))

  switchTab('water')
}
