import { Icons } from './icons'

/** Show a toast notification */
export function showToast(message: string, type: 'success' | 'error' | 'info' = 'info', duration = 3000): void {
  const container = document.getElementById('toast-container')!
  const toast = document.createElement('div')

  const icons = {
    success: Icons.checkCircle,
    error:   Icons.xCircle,
    info:    Icons.info,
  }
  toast.className = `toast toast-${type}`
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${message}</span>`
  container.appendChild(toast)

  setTimeout(() => {
    toast.remove()
  }, duration + 300)
}

/** Show/hide the full-screen blocking save overlay */
export function showOverlay(message?: string): void {
  const overlay = document.getElementById('save-overlay')
  if (overlay) {
    overlay.classList.remove('hidden')
    if (message) {
      const textEl = overlay.querySelector('.save-overlay__text')
      if (textEl) textEl.textContent = message
    }
  }
}
export function hideOverlay(): void {
  document.getElementById('save-overlay')?.classList.add('hidden')
}

/** Generic modal with title, body, and action buttons */
export interface ModalButton {
  id: string
  label: string
  className: string
  primary?: boolean
}

export function showModal(opts: {
  icon: string
  iconColor?: 'danger' | 'warning' | 'primary' | 'success'
  title: string
  body: string
  buttons: ModalButton[]
  onOpen?: () => void
  zIndex?: number
}): Promise<string> {
  return new Promise(resolve => {
    const container = document.getElementById('modal-container') || document.body

    const backdrop = document.createElement('div')
    backdrop.className = 'modal-backdrop'
    backdrop.style.zIndex = String(opts.zIndex ?? 10000)
    backdrop.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div class="modal__icon modal__icon--${opts.iconColor ?? 'primary'}">${opts.icon}</div>
        <h2 class="modal__title" id="modal-title">${opts.title}</h2>
        <div class="modal__body">${opts.body}</div>
        <div class="modal__actions">
          ${opts.buttons.map(b => `<button id="modal-btn-${b.id}" class="btn ${b.className}">${b.label}</button>`).join('')}
        </div>
      </div>
    `

    container.appendChild(backdrop)

    // Allow caller to wire up dynamic elements after DOM is ready
    opts.onOpen?.()

    opts.buttons.forEach(b => {
      document.getElementById(`modal-btn-${b.id}`)!.addEventListener('click', () => {
        backdrop.remove()
        resolve(b.id)
      })
    })
  })
}
