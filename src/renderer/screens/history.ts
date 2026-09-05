import type { AppConfig } from '../../shared/types'
import { Icons } from '../components/icons'
import { renderWaterHistoryScreen } from './waterHistory'

export function renderHistoryScreen(
  container: HTMLElement,
  config: AppConfig,
  onNavigate: (screen: string) => void
): void {
  let activeTab: 'water' | 'item' = 'water'

  container.innerHTML = `
    <style>
      .hy-screen {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }
      .hy-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 20px 32px 16px;
        border-bottom: 1px solid var(--clr-border);
        background: var(--clr-surface);
        flex-shrink: 0;
        gap: 16px;
        flex-wrap: wrap;
      }
      .hy-header-info {
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .hy-header-icon {
        color: var(--clr-primary);
        background: var(--clr-primary-glow);
        padding: 10px;
        border-radius: 14px;
        display: inline-flex;
        flex-shrink: 0;
      }
      .hy-header-title {
        margin: 0;
        font-size: 22px;
        font-weight: 800;
        color: var(--clr-text);
        letter-spacing: -0.5px;
      }
      .hy-header-sub {
        margin: 2px 0 0;
        font-size: 13px;
        color: var(--clr-text-muted);
      }
      .hy-tabs {
        display: flex;
        gap: 4px;
        background: var(--clr-surface-2);
        padding: 4px;
        border-radius: 12px;
        border: 1px solid var(--clr-border);
      }
      .hy-tab {
        padding: 8px 18px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        color: var(--clr-text-muted);
        background: transparent;
        border: none;
        cursor: pointer;
        font-family: var(--font);
        display: flex;
        align-items: center;
        gap: 8px;
        transition: all 0.2s;
        white-space: nowrap;
      }
      .hy-tab:hover:not(.active) {
        color: var(--clr-text);
        background: rgba(255,255,255,0.04);
      }
      .hy-tab.active {
        background: var(--clr-surface);
        color: var(--clr-primary);
        box-shadow: var(--shadow-sm);
      }
      .hy-tab svg {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }
      .hy-content {
        flex: 1;
        overflow: hidden;
        position: relative;
      }
    </style>

    <div class="hy-screen">
      <div class="hy-header">
        <div class="hy-header-info">
          <span class="hy-header-icon">${Icons.history}</span>
          <div>
            <h1 class="hy-header-title">Sales History</h1>
            <p class="hy-header-sub">Browse and review past water and item sales records by date</p>
          </div>
        </div>
        <div class="hy-tabs">
          <button class="hy-tab active" data-tab="water">
            ${Icons.droplets} Water Sales
          </button>
          <button class="hy-tab" data-tab="item">
            ${Icons.shoppingCart} Item Sales
          </button>
        </div>
      </div>
      <div class="hy-content" id="hy-content-area"></div>
    </div>
  `

  const q = <T extends Element>(sel: string) => container.querySelector<T>(sel)!
  const contentArea = q<HTMLDivElement>('#hy-content-area')

  function switchTab(tab: 'water' | 'item') {
    activeTab = tab
    container.querySelectorAll('.hy-tab').forEach(btn => {
      const t = (btn as HTMLElement).dataset.tab
      btn.classList.toggle('active', t === tab)
    })

    if (tab === 'water') {
      renderWaterHistoryScreen(contentArea, config, onNavigate)
    } else {
      import('./itemSalesHistory').then(m => m.renderItemSalesHistoryScreen(contentArea, config))
    }
  }

  container.querySelectorAll('.hy-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = (btn as HTMLElement).dataset.tab as 'water' | 'item'
      if (t !== activeTab) switchTab(t)
    })
  })

  switchTab('water')
}
