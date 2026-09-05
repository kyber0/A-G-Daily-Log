import type { AppConfig, LegacyStockItem, InventoryItem } from '../../shared/types'
import { showToast, showModal, showOverlay, hideOverlay } from '../components/ui'
import { Icons } from '../components/icons'

function formatAmount(n: number): string {
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function renderInventoryScreen(
  container: HTMLElement,
  config: AppConfig
): void {
  let stockItems: LegacyStockItem[] = []
  let loading = true

  container.innerHTML = `
    <div class="screen-header">
      <h2>${Icons.package} Inventory & Stock</h2>
      <button class="btn btn-primary" id="inv-btn-add" style="margin-left:auto">${Icons.plus} Add Product</button>
    </div>
    
    <div class="screen-content">
      <div id="inv-state">
        <div class="spinner" style="margin: 40px auto; display: block;"></div>
      </div>
    </div>
  `

  const stateEl = document.getElementById('inv-state')!
  const btnAdd = document.getElementById('inv-btn-add')!

  btnAdd.addEventListener('click', async () => {
    const action = await showModal({
      icon: Icons.plus,
      title: 'Add New Product',
      body: `
        <div style="display:flex;flex-direction:column;gap:12px;text-align:left">
          <div>
            <label style="font-size:11px;font-weight:700;color:var(--clr-text-muted);display:block;margin-bottom:4px">ITEM CODE</label>
            <input type="text" id="add-code" class="form-input" placeholder="e.g. 10-150-105" />
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;color:var(--clr-text-muted);display:block;margin-bottom:4px">DESCRIPTION</label>
            <input type="text" id="add-item" class="form-input" placeholder="e.g. 5 GAL ROUND" />
          </div>
          <div>
            <label style="font-size:11px;font-weight:700;color:var(--clr-text-muted);display:block;margin-bottom:4px">CATEGORY</label>
            <select id="add-category" class="form-input">
              <option value="CONTAINERS">CONTAINERS</option>
              <option value="CAPSEALS">CAPSEALS</option>
              <option value="FILTERS">FILTERS</option>
              <option value="PET BOTTLES">PET BOTTLES</option>
              <option value="OTHERS">OTHERS</option>
            </select>
          </div>
          <div style="display:flex;gap:12px">
            <div style="flex:1">
              <label style="font-size:11px;font-weight:700;color:var(--clr-text-muted);display:block;margin-bottom:4px">PACKING</label>
              <input type="text" id="add-packing" class="form-input" placeholder="e.g. 1 PC" />
            </div>
            <div style="flex:1">
              <label style="font-size:11px;font-weight:700;color:var(--clr-text-muted);display:block;margin-bottom:4px">DEALER PRICE</label>
              <input type="number" id="add-dealer" class="form-input" placeholder="0" />
            </div>
            <div style="flex:1">
              <label style="font-size:11px;font-weight:700;color:var(--clr-text-muted);display:block;margin-bottom:4px">SRP (PRICE)</label>
              <input type="number" id="add-srp" class="form-input" placeholder="0" />
            </div>
          </div>
        </div>
      `,
      buttons: [
        { id: 'cancel', label: 'Cancel', className: 'btn-outline' },
        { id: 'save', label: 'Add Product', className: 'btn-primary' }
      ]
    })

    if (action === 'save') {
      const code = (document.getElementById('add-code') as HTMLInputElement).value.trim()
      const item = (document.getElementById('add-item') as HTMLInputElement).value.trim()
      const category = (document.getElementById('add-category') as HTMLSelectElement).value
      const packing = (document.getElementById('add-packing') as HTMLInputElement).value.trim()
      const dealerPrice = Number((document.getElementById('add-dealer') as HTMLInputElement).value) || 0
      const srp = Number((document.getElementById('add-srp') as HTMLInputElement).value) || 0

      if (!item) {
        showToast('Item description is required', 'error')
        return
      }

      showOverlay()
      try {
        const res = await window.api.addProduct({ code, item, category, packing, dealerPrice, srp })
        if (res.ok) {
          showToast('Product added safely to bottom of Stock Report', 'success')
          loadData()
        } else {
          showToast('Failed to add product: ' + res.error, 'error')
        }
      } catch (err) {
        console.error(err)
        showToast('Error saving product', 'error')
      } finally {
        hideOverlay()
      }
    }
  })

  async function loadData() {
    loading = true
    try {
      const result = await window.api.listStock()
      if (!result.ok) throw new Error(result.error)
      stockItems = result.data
    } catch (e) {
      console.error(e)
      showToast('Failed to load stock data', 'error')
    }
    loading = false
    renderData()
  }

  function renderData() {
    if (!config.inventoryFolder) {
      stateEl.innerHTML = `
        <div style="text-align:center; padding: 60px 20px;">
          ${Icons.folderOpen}
          <h3 style="margin-top:16px; color:var(--clr-text-muted);">Inventory Folder Not Set</h3>
          <p style="color:var(--clr-text-muted); margin-top:8px;">Please configure your inventory folder in Settings.</p>
        </div>
      `
      return
    }

    if (loading) return

    if (stockItems.length === 0) {
      stateEl.innerHTML = `
        <div style="text-align:center; padding: 60px 20px; color:var(--clr-text-muted)">
          <p>No stock data found. Make sure the Stock Report exists.</p>
        </div>
      `
      return
    }

    let html = `
      <div class="table-card">
        <table class="data-table">
          <thead>
            <tr>
              <th>CODE</th>
              <th>ITEM DESCRIPTION</th>
              <th>CATEGORY</th>
              <th class="text-right">SRP</th>
              <th class="text-right">STOCK OUT</th>
              <th class="text-right">BALANCE</th>
              <th>STATUS</th>
            </tr>
          </thead>
          <tbody>
    `

    for (const item of stockItems) {
      const isLow = item.qtyBalance <= 10
      html += `
        <tr>
          <td class="monospace text-muted">${item.code || '-'}</td>
          <td style="font-weight:500">${item.item}</td>
          <td><span class="badge" style="background:var(--clr-surface-hover)">${item.packing}</span></td>
          <td class="text-right monospace">₱${formatAmount(item.srp)}</td>
          <td class="text-right monospace">${item.qtyStockOut}</td>
          <td class="text-right monospace" style="${isLow ? 'color:var(--clr-error);font-weight:600;' : ''}">${item.qtyBalance}</td>
          <td>
            ${isLow ? '<span class="badge" style="background:rgba(239,68,68,0.1);color:var(--clr-error)">LOW STOCK</span>' : ''}
            ${item.status ? `<span class="badge" style="background:var(--clr-surface-hover)">${item.status}</span>` : ''}
          </td>
        </tr>
      `
    }

    html += `
          </tbody>
        </table>
      </div>
    `

    stateEl.innerHTML = html
  }

  loadData()
}
