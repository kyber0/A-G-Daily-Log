import type { ExpenseEntry } from '../../shared/types'
import { Icons } from './icons'
import { showToast, showModal } from './ui'

function formatAmount(n: number): string {
  return n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export function openDailyExpensesModal(
  date: string,
  initialExpenses: ExpenseEntry[],
  onSave: (expenses: ExpenseEntry[]) => void
): void {
  // Create modal container
  const modalOverlay = document.createElement('div')
  modalOverlay.className = 'modal-backdrop'
  modalOverlay.style.cssText = `
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(15, 23, 42, 0.7);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    animation: fadeIn 0.2s ease-out;
  `

  let currentExpenses: ExpenseEntry[] = JSON.parse(JSON.stringify(initialExpenses))

  const quickCategories = [
    'Gasoline',
    'Lunch / Meals',
    'Maintenance',
    'Trucking & Delivery',
    'Electricity & Utilities',
    'Packaging & Seals',
    'Supplies',
    'Misc'
  ]

  modalOverlay.innerHTML = `
    <div class="glass-panel" style="width: 80vw; height: 80vh; display: flex; flex-direction: column; border-radius: 20px; background: var(--clr-surface); border: 1px solid var(--clr-border); box-shadow: 0 25px 50px -12px rgba(0,0,0,0.5); overflow: hidden;">
      <!-- Header -->
      <div style="padding: 20px 24px; border-bottom: 1px solid var(--clr-border); display: flex; align-items: center; justify-content: space-between; background: var(--clr-surface);">
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(239, 68, 68, 0.12); color: #ef4444; display: flex; align-items: center; justify-content: center;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"></line><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
          </div>
          <div>
            <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: var(--clr-text);">Daily Expenses</h3>
            <span style="font-size: 12px; color: var(--clr-text-muted); font-weight: 600;">Date: ${date}</span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <div id="modal-exp-total" style="font-size: 14px; font-weight: 800; color: #ef4444; background: rgba(239, 68, 68, 0.1); padding: 4px 12px; border-radius: 10px;">₱0.00</div>
          <button id="btn-close-exp-modal" class="btn btn-ghost btn-icon" style="padding: 6px;">
            ${Icons.xCircle}
          </button>
        </div>
      </div>

      <!-- Body / List -->
      <div style="flex: 1; overflow-y: auto; padding: 20px 24px;" class="custom-scroll">
        <!-- Quick Category Selector -->
        <div style="margin-bottom: 16px;">
          <label style="font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--clr-text-muted); margin-bottom: 8px; display: block;">Quick Category</label>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;" id="quick-cat-container">
            ${quickCategories.map(cat => `
              <button type="button" class="btn-quick-cat" data-cat="${cat}" style="padding: 4px 10px; font-size: 11px; font-weight: 600; border-radius: 8px; border: 1px solid var(--clr-border); background: var(--clr-surface); color: var(--clr-text-muted); cursor: pointer; transition: all 0.15s;">
                ${cat}
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Add Expense Form -->
        <div style="padding: 14px; border-radius: 12px; background: rgba(239, 68, 68, 0.04); border: 1px solid rgba(239, 68, 68, 0.2); margin-bottom: 20px;">
          <div style="display: grid; grid-template-columns: 1.5fr 1fr 1.2fr auto; gap: 10px; align-items: end;">
            <div class="field" style="margin: 0;">
              <label for="inp-exp-desc" style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--clr-text-muted);">Description</label>
              <input type="text" id="inp-exp-desc" placeholder="e.g. Gasoline" style="padding: 8px 10px; font-size: 13px;" />
            </div>
            <div class="field" style="margin: 0;">
              <label for="inp-exp-amt" style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--clr-text-muted);">Amount (₱)</label>
              <input type="number" id="inp-exp-amt" placeholder="0.00" min="0" step="any" style="padding: 8px 10px; font-size: 13px;" />
            </div>
            <div class="field" style="margin: 0;">
              <label for="inp-exp-remarks" style="font-size: 11px; font-weight: 700; text-transform: uppercase; color: var(--clr-text-muted);">Remarks (Opt)</label>
              <input type="text" id="inp-exp-remarks" placeholder="Optional notes" style="padding: 8px 10px; font-size: 13px;" />
            </div>
            <button id="btn-add-exp-row" class="btn btn-primary" style="height: 36px; padding: 0 14px; display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700;">
              ${Icons.plus} Add
            </button>
          </div>
        </div>

        <!-- Expense Table -->
        <div style="border: 1px solid var(--clr-border); border-radius: 12px; overflow: hidden;">
          <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
            <thead>
              <tr style="background: rgba(255,255,255,0.03); border-bottom: 1px solid var(--clr-border); color: var(--clr-text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em;">
                <th style="padding: 10px 14px; width: 35px;">#</th>
                <th style="padding: 10px 14px;">Description</th>
                <th style="padding: 10px 14px;">Remarks</th>
                <th style="padding: 10px 14px; text-align: right; width: 110px;">Amount</th>
                <th style="padding: 10px 14px; text-align: center; width: 50px;"></th>
              </tr>
            </thead>
            <tbody id="modal-exp-tbody"></tbody>
          </table>
        </div>
      </div>

      <!-- Footer -->
      <div style="padding: 16px 24px; border-top: 1px solid var(--clr-border); display: flex; align-items: center; justify-content: space-between; background: var(--clr-surface);">
        <span id="modal-exp-item-count" style="font-size: 12px; color: var(--clr-text-muted); font-weight: 600;">0 entries</span>
        <div style="display: flex; gap: 10px;">
          <button id="btn-cancel-exp-modal" class="btn btn-ghost" style="padding: 8px 16px;">Cancel</button>
          <button id="btn-save-exp-modal" class="btn btn-primary" style="padding: 8px 20px; display: flex; align-items: center; gap: 6px; font-weight: 700;">
            ${Icons.check} Save Expenses
          </button>
        </div>
      </div>
    </div>
  `

  document.body.appendChild(modalOverlay)

  const tbody = modalOverlay.querySelector('#modal-exp-tbody')!
  const totalBadge = modalOverlay.querySelector('#modal-exp-total')!
  const countLabel = modalOverlay.querySelector('#modal-exp-item-count')!
  const inpDesc = modalOverlay.querySelector('#inp-exp-desc') as HTMLInputElement
  const inpAmt = modalOverlay.querySelector('#inp-exp-amt') as HTMLInputElement
  const inpRemarks = modalOverlay.querySelector('#inp-exp-remarks') as HTMLInputElement
  const btnAdd = modalOverlay.querySelector('#btn-add-exp-row')!
  const btnClose = modalOverlay.querySelector('#btn-close-exp-modal')!
  const btnCancel = modalOverlay.querySelector('#btn-cancel-exp-modal')!
  const btnSave = modalOverlay.querySelector('#btn-save-exp-modal')!

  // Quick category pills
  modalOverlay.querySelectorAll('.btn-quick-cat').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = (btn as HTMLElement).dataset.cat || ''
      inpDesc.value = cat
      inpAmt.focus()
    })
  })

  function renderList() {
    if (currentExpenses.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="padding: 28px; text-align: center; color: var(--clr-text-muted); font-size: 13px;">
            No expenses recorded for this day.
          </td>
        </tr>
      `
    } else {
      tbody.innerHTML = currentExpenses.map((exp, idx) => `
        <tr style="border-bottom: 1px solid var(--clr-border);">
          <td style="padding: 10px 14px; color: var(--clr-text-muted); font-weight: 700;">${idx + 1}</td>
          <td style="padding: 10px 14px; font-weight: 600; color: var(--clr-text);">${exp.desc || '—'}</td>
          <td style="padding: 10px 14px; color: var(--clr-text-muted); font-size: 12px;">${exp.remarks || '—'}</td>
          <td style="padding: 10px 14px; text-align: right; font-weight: 700; color: #ef4444;" class="monospace">₱${formatAmount(exp.amount)}</td>
          <td style="padding: 10px 14px; text-align: center;">
            <button class="btn btn-ghost btn-icon btn-del-exp" data-index="${idx}" style="color: var(--clr-error); padding: 4px;" title="Delete">
              ${Icons.trash}
            </button>
          </td>
        </tr>
      `).join('')
    }

    const total = currentExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0)
    totalBadge.textContent = `₱${formatAmount(total)}`
    countLabel.textContent = `${currentExpenses.length} entr${currentExpenses.length === 1 ? 'y' : 'ies'}`

    // Wire delete buttons with confirmation
    tbody.querySelectorAll('.btn-del-exp').forEach(btn => {
      btn.addEventListener('click', async e => {
        const idx = parseInt((e.currentTarget as HTMLElement).dataset.index!, 10)
        const exp = currentExpenses[idx]
        if (!exp) return

        const choice = await showModal({
          icon: Icons.alertTriangle,
          iconColor: 'danger',
          title: 'Delete Expense?',
          body: `Are you sure you want to delete <strong>${exp.desc || 'this expense'}</strong> (₱${formatAmount(exp.amount)})? This change will take effect when saved.`,
          buttons: [
            { id: 'cancel', label: 'Cancel', className: 'btn-secondary' },
            { id: 'confirm', label: 'Delete', className: 'btn-danger' }
          ],
          zIndex: 10001
        })

        if (choice === 'confirm') {
          currentExpenses.splice(idx, 1)
          renderList()
          showToast(`Expense "${exp.desc || 'Entry'}" removed`, 'info')
        }
      })
    })
  }

  function handleAddExpense() {
    const desc = inpDesc.value.trim()
    const amt = parseFloat(inpAmt.value)
    const remarks = inpRemarks.value.trim()

    if (!desc) {
      showToast('Please enter an expense description', 'error')
      inpDesc.focus()
      return
    }
    if (isNaN(amt) || amt <= 0) {
      showToast('Please enter a valid expense amount', 'error')
      inpAmt.focus()
      return
    }

    currentExpenses.push({
      desc,
      amount: amt,
      remarks: remarks || ''
    })

    inpDesc.value = ''
    inpAmt.value = ''
    inpRemarks.value = ''
    inpDesc.focus()
    renderList()
  }

  btnAdd.addEventListener('click', handleAddExpense)
  inpAmt.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAddExpense()
  })

  function closeModal() {
    modalOverlay.remove()
  }

  btnClose.addEventListener('click', closeModal)
  btnCancel.addEventListener('click', closeModal)

  btnSave.addEventListener('click', async () => {
    btnSave.textContent = 'Saving...'
    btnSave.setAttribute('disabled', 'true')
    try {
      const res = await window.api.saveDayExpenses(date, currentExpenses)
      if (!res.ok) {
        showToast(`Failed to save expenses: ${res.error}`, 'error')
        btnSave.textContent = 'Save Expenses'
        btnSave.removeAttribute('disabled')
        return
      }

      showToast(`Saved ${currentExpenses.length} expense entr${currentExpenses.length === 1 ? 'y' : 'ies'} ✓`, 'success')
      onSave(currentExpenses)
      closeModal()
    } catch (err) {
      showToast(`Error saving expenses: ${String(err)}`, 'error')
      btnSave.textContent = 'Save Expenses'
      btnSave.removeAttribute('disabled')
    }
  })

  renderList()
  inpDesc.focus()
}
