import type { AppConfig } from '../../shared/types'
import { Icons } from '../components/icons'
import { showToast } from '../components/ui'

const DEFAULT_URL = 'https://ukjgbonqbufflwxdgian.supabase.co'
const DEFAULT_ANON_KEY = 'sb_publishable_l5Wxy8RQJLqztFnTAFS5rg_DJClhzQy'

/** Render the first-launch / setup welcome screen */
export function renderFirstLaunch(
  container: HTMLElement,
  config: AppConfig,
  onComplete: () => void
): void {
  let chosenFolder = config.saveFolder || ''
  const defaultUrl = config.supabaseUrl || DEFAULT_URL
  const defaultAnonKey = config.supabaseAnonKey || DEFAULT_ANON_KEY
  const defaultEmail = config.appAccountEmail || 'app@agwaterrefill.internal'
  const defaultPassword = config.appAccountPassword || ''

  container.innerHTML = `
    <div class="first-launch">
      <div class="first-launch__card">
        
        <!-- Header -->
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--clr-border); padding-bottom: 10px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div class="first-launch__logo">
              ${Icons.droplets}
            </div>
            <div>
              <h1 class="first-launch__title">A&G Daily Log — Initial Setup</h1>
              <p class="first-launch__sub">
                Select where to save monthly workbooks and configure Supabase Cloud access.
              </p>
            </div>
          </div>
          <span style="font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 12px; background: rgba(14, 165, 233, 0.1); color: var(--clr-primary); border: 1px solid rgba(14, 165, 233, 0.25); display: inline-flex; align-items: center; gap: 6px;">
            ${Icons.shieldCheck} RLS v2.0 Secured
          </span>
        </div>

        <!-- 2-Column Main Layout -->
        <div style="display: grid; grid-template-columns: 1fr 1.35fr; gap: 16px; align-items: stretch;">
          
          <!-- Column 1: Excel & Local Storage -->
          <div style="background: var(--clr-surface-2); border: 1px solid var(--clr-border); border-radius: var(--radius-lg); padding: 14px 16px; display: flex; flex-direction: column; justify-content: space-between; gap: 10px;">
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700; color: var(--clr-text); text-transform: uppercase; letter-spacing: 0.05em;">
                ${Icons.folder} 1. Excel Storage Folder
              </div>
              <div style="font-size: 11.5px; color: var(--clr-text-muted); line-height: 1.4;">
                Select destination folder for monthly sales workbooks and local logs.
              </div>
              <div id="fl-folder-chosen" class="first-launch__folder-chosen ${chosenFolder ? '' : 'hidden'}" style="margin-top: 2px;">
                <span>${Icons.folder}</span>
                <span class="first-launch__folder-path" id="fl-folder-path">${chosenFolder}</span>
              </div>
              <button id="fl-choose-btn" type="button" class="btn btn-secondary btn-sm" style="width: 100%; justify-content: center; gap: 6px;">
                ${Icons.folderOpen} ${chosenFolder ? 'Change Save Folder' : 'Choose Save Folder'}
              </button>
            </div>

            <!-- Offline Architecture Info Card -->
            <div style="background: var(--clr-surface); border: 1px solid var(--clr-border); border-radius: 8px; padding: 10px 12px; display: flex; gap: 8px; align-items: flex-start;">
              <span style="color: var(--clr-primary); flex-shrink: 0; margin-top: 1px;">${Icons.info}</span>
              <div style="font-size: 11px; color: var(--clr-text-muted); line-height: 1.45;">
                <strong style="color: var(--clr-text); font-weight: 600;">Offline-First Design:</strong> All entries are safely recorded to local SQLite first, then synchronized to cloud automatically when connected.
              </div>
            </div>
          </div>

          <!-- Column 2: Supabase Cloud Database -->
          <div style="background: var(--clr-surface-2); border: 1px solid var(--clr-border); border-radius: var(--radius-lg); padding: 14px 16px; display: flex; flex-direction: column; gap: 8px;">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 6px; font-size: 11.5px; font-weight: 700; color: var(--clr-text); text-transform: uppercase; letter-spacing: 0.05em;">
                ${Icons.refreshCw} 2. Supabase Cloud Connection
              </div>
              <span style="font-size: 10.5px; color: var(--clr-text-dim);">Authenticated RLS</span>
            </div>

            <div style="display: flex; flex-direction: column; gap: 3px;">
              <label style="font-size: 11px; font-weight: 600; color: var(--clr-text-muted);">Supabase Project URL</label>
              <input type="text" id="fl-sb-url" value="${defaultUrl}"
                placeholder="https://your-project.supabase.co"
                style="padding: 7px 10px; font-size: 12px; font-family: monospace;" />
            </div>

            <div style="display: flex; flex-direction: column; gap: 3px;">
              <label style="font-size: 11px; font-weight: 600; color: var(--clr-text-muted);">Supabase Anon Key (Public Key)</label>
              <input type="password" id="fl-sb-anon-key" value="${defaultAnonKey}"
                placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
                style="padding: 7px 10px; font-size: 12px; font-family: monospace;" />
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 11px; font-weight: 600; color: var(--clr-text-muted);">App Account Email</label>
                <input type="email" id="fl-app-email" value="${defaultEmail}"
                  placeholder="app@agwaterrefill.internal"
                  style="padding: 7px 10px; font-size: 12px;" />
              </div>
              <div style="display: flex; flex-direction: column; gap: 3px;">
                <label style="font-size: 11px; font-weight: 600; color: var(--clr-text-muted);">App Account Password</label>
                <input type="password" id="fl-app-pass" value="${defaultPassword}"
                  placeholder="Generated password"
                  style="padding: 7px 10px; font-size: 12px;" />
              </div>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 2px;">
              <button id="fl-test-btn" type="button" class="btn btn-ghost btn-sm" style="display: inline-flex; align-items: center; gap: 6px; font-size: 11.5px; padding: 5px 10px; flex-shrink: 0;">
                ${Icons.refreshCw} Test Cloud Connection
              </button>
              <span id="fl-test-status" style="font-size: 11px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right;"></span>
            </div>
          </div>

        </div>

        <!-- Footer -->
        <div style="display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--clr-border); padding-top: 10px;">
          <span style="font-size: 11px; color: var(--clr-text-muted); display: inline-flex; align-items: center; gap: 6px;">
            ${Icons.lock} Stored locally in <code>config.json</code> — secrets are never baked into binary.
          </span>
          <button id="fl-start-btn" type="button" class="btn btn-primary" style="padding: 9px 20px; font-size: 13px; font-weight: 600; display: inline-flex; align-items: center; gap: 8px;">
            Save Configuration & Start App ${Icons.arrowRight}
          </button>
        </div>

      </div>
    </div>
  `

  const chooseBtn = document.getElementById('fl-choose-btn')!
  const startBtn = document.getElementById('fl-start-btn') as HTMLButtonElement
  const testBtn = document.getElementById('fl-test-btn') as HTMLButtonElement
  const testStatus = document.getElementById('fl-test-status')!
  const urlInp = document.getElementById('fl-sb-url') as HTMLInputElement
  const anonInp = document.getElementById('fl-sb-anon-key') as HTMLInputElement
  const emailInp = document.getElementById('fl-app-email') as HTMLInputElement
  const passInp = document.getElementById('fl-app-pass') as HTMLInputElement

  chooseBtn.addEventListener('click', async () => {
    const result = await window.api.chooseFolder()
    if (!result.ok) return

    chosenFolder = result.data
    const pathEl = document.getElementById('fl-folder-path')!
    pathEl.textContent = chosenFolder

    document.getElementById('fl-folder-chosen')!.classList.remove('hidden')
    chooseBtn.innerHTML = `${Icons.folderOpen} Change Folder`
  })

  testBtn.addEventListener('click', async () => {
    const url = urlInp.value.trim()
    const anonKey = anonInp.value.trim()
    const email = emailInp.value.trim()
    const password = passInp.value

    if (!url || !anonKey || !email || !password) {
      testStatus.style.color = 'var(--clr-error)'
      testStatus.textContent = 'Please enter URL, Anon Key, Email, and Password before testing.'
      return
    }

    testStatus.style.color = 'var(--clr-text-muted)'
    testStatus.innerHTML = `<span class="spinner" style="width:12px;height:12px;display:inline-block;margin-right:6px"></span> Testing authentication…`
    testBtn.disabled = true

    try {
      const res = await window.api.testSupabaseAuth({ url, anonKey, email, password })
      if (res.ok) {
        testStatus.style.color = 'var(--clr-success)'
        testStatus.textContent = '✓ Connected and authenticated successfully!'
      } else {
        testStatus.style.color = 'var(--clr-error)'
        testStatus.textContent = `✗ Auth failed: ${res.error}`
      }
    } catch (err: any) {
      testStatus.style.color = 'var(--clr-error)'
      testStatus.textContent = `✗ Error: ${err?.message || String(err)}`
    } finally {
      testBtn.disabled = false
    }
  })

  startBtn.addEventListener('click', async () => {
    const url = urlInp.value.trim()
    const anonKey = anonInp.value.trim()
    const email = emailInp.value.trim()
    const password = passInp.value

    if (!chosenFolder) {
      showToast('Please select a save folder for Excel workbooks.', 'error')
      return
    }
    if (!url || !anonKey) {
      showToast('Supabase Project URL and Anon Key are required.', 'error')
      return
    }
    if (!email || !password) {
      showToast('App account email and password are required.', 'error')
      return
    }

    startBtn.disabled = true
    startBtn.textContent = 'Saving configuration…'

    const updateRes = await window.api.updateSettings({
      saveFolder: chosenFolder,
      supabaseUrl: url,
      supabaseAnonKey: anonKey,
      appAccountEmail: email,
      appAccountPassword: password
    })

    if (!updateRes.ok) {
      showToast(`Failed to save settings: ${updateRes.error}`, 'error')
      startBtn.disabled = false
      startBtn.innerHTML = `Save Configuration & Start App ${Icons.arrowRight}`
      return
    }

    showToast('Setup complete! Loading app…', 'success')
    onComplete()
  })
}
