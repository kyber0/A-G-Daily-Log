import { app, safeStorage } from 'electron'
import * as fs from 'fs'
import * as path from 'path'
import type { AppConfig } from '../../shared/types'
import { resetSupabaseClient } from '../supabase/client'
import { DEFAULT_SUPABASE_URL } from '../supabase/constants'
import { DEFAULT_GOOGLE_CLIENT_ID, DEFAULT_GOOGLE_CLIENT_SECRET } from '../google/constants'

function getConfigPath(): string {
  try {
    if (app && typeof app.getPath === 'function') {
      return path.join(app.getPath('userData'), 'config.json')
    }
  } catch {}
  return path.join(process.env.APPDATA || process.cwd(), 'ag-daily-log', 'config.json')
}

const CONFIG_PATH = getConfigPath()

const DEFAULT_CONFIG: AppConfig = {
  saveFolder: '',
  backupFolder: '',
  backupTime: '19:00',
  theme: 'light',
  inventoryFolder: '',
  supabaseUrl: process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL,
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  appAccountEmail: process.env.SUPABASE_APP_EMAIL || '',
  appAccountPassword: process.env.SUPABASE_APP_PASSWORD || '',
  googleClientId: process.env.GOOGLE_CLIENT_ID || DEFAULT_GOOGLE_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET || DEFAULT_GOOGLE_CLIENT_SECRET,
  containerTypes: [
    { name: 'SLIM',          requiresWaterType: true  },
    { name: 'ROUND',         requiresWaterType: true  },
    { name: 'SLIM & ROUND',  requiresWaterType: true  },
    { name: 'SLIM NEW (BLUE)',   requiresWaterType: true  },
    { name: 'SLIM NEW (GREEN)',  requiresWaterType: true  },
    { name: 'SLIM NEW (YELLOW)',requiresWaterType: true  },
    { name: 'SLIM NEW (ORANGE)',requiresWaterType: true  },
    { name: 'SLIM NEW (RED)',    requiresWaterType: true  },
    { name: 'HALF',          requiresWaterType: true  },
    { name: '350ML',         requiresWaterType: false },
    { name: '500ML',         requiresWaterType: false },
    { name: '6LITERS',       requiresWaterType: false },
    { name: '7LITERS',       requiresWaterType: false },
    { name: '8LITERS',       requiresWaterType: false },
    { name: '10LITERS',      requiresWaterType: false },
  ],
  waterTypes: ['ALKALINE', 'PURIFIED', 'MINERAL'],
  priceTable: [
    // Gallon types
    { container: 'SLIM',          water: 'ALKALINE', pickup: 40, deliver: 45, note: '' },
    { container: 'SLIM',          water: 'PURIFIED',  pickup: 30, deliver: 35, note: '' },
    { container: 'SLIM',          water: 'MINERAL',   pickup: 25, deliver: 30, note: '' },
    { container: 'ROUND',         water: 'ALKALINE', pickup: 40, deliver: 45, note: '' },
    { container: 'ROUND',         water: 'PURIFIED',  pickup: 30, deliver: 35, note: '' },
    { container: 'ROUND',         water: 'MINERAL',   pickup: 25, deliver: 30, note: '' },
    { container: 'SLIM & ROUND',  water: 'ALKALINE', pickup: 40, deliver: 45, note: '' },
    { container: 'SLIM & ROUND',  water: 'PURIFIED',  pickup: 30, deliver: 35, note: '' },
    { container: 'SLIM & ROUND',  water: 'MINERAL',   pickup: 25, deliver: 30, note: '' },
    // Bottle types (no water type)
    { container: '350ML',  water: '', pickup: 10, deliver: 8,  note: '50 BOTTLE MINIMUM' },
    { container: '500ML',  water: '', pickup: 12, deliver: 9,  note: '50 BOTTLE MINIMUM' },
    { container: '6LITERS',water: '', pickup: 0,  deliver: 0,  note: '' },
    { container: '7LITERS',water: '', pickup: 0,  deliver: 0,  note: '' },
    { container: '8LITERS',water: '', pickup: 0,  deliver: 0,  note: '' },
    { container: '10LITERS',water:'', pickup: 0,  deliver: 0,  note: '' },
  ]
}

let _cache: AppConfig | null = null

export function readConfig(): AppConfig {
  const canDecrypt = typeof safeStorage !== 'undefined' && safeStorage?.isEncryptionAvailable?.()
  if (_cache && (_cache.appAccountPassword || !canDecrypt)) {
    return _cache
  }
  try {
    const raw = fs.readFileSync(CONFIG_PATH, 'utf-8')
    const parsed = JSON.parse(raw)

    // Decrypt appAccountPassword if encrypted with safeStorage
    let password = parsed.appAccountPassword || ''
    if (parsed.appAccountPasswordEncrypted) {
      try {
        if (canDecrypt) {
          password = safeStorage.decryptString(Buffer.from(parsed.appAccountPasswordEncrypted, 'base64'))
        }
      } catch (err) {
        console.warn('[config] safeStorage decryption failed:', err)
        password = parsed.appAccountPassword || ''
      }
    }

    // Decrypt googleClientSecret if encrypted with safeStorage
    let googleSecret = parsed.googleClientSecret || ''
    if (parsed.googleClientSecretEncrypted) {
      try {
        if (typeof safeStorage !== 'undefined' && safeStorage?.isEncryptionAvailable?.()) {
          googleSecret = safeStorage.decryptString(Buffer.from(parsed.googleClientSecretEncrypted, 'base64'))
        }
      } catch (err) {
        console.warn('[config] safeStorage Google secret decryption failed:', err)
        googleSecret = parsed.googleClientSecret || ''
      }
    }

    // Merge defaults so new fields appear automatically on existing installs
    _cache = {
      ...DEFAULT_CONFIG,
      ...parsed,
      appAccountPassword: password,
      googleClientSecret: googleSecret || DEFAULT_GOOGLE_CLIENT_SECRET
    } as AppConfig
    delete (_cache as any).supabaseServiceKey
    delete (_cache as any).appAccountPasswordEncrypted
    delete (_cache as any).googleClientSecretEncrypted
    if (!_cache.supabaseUrl) _cache.supabaseUrl = DEFAULT_SUPABASE_URL
    if (!_cache.supabaseAnonKey && process.env.SUPABASE_ANON_KEY) {
      _cache.supabaseAnonKey = process.env.SUPABASE_ANON_KEY
    }
    if (!_cache.googleClientId) _cache.googleClientId = DEFAULT_GOOGLE_CLIENT_ID

    // If password or Google secret was stored unencrypted on disk, migrate to encrypted at rest
    const needsMigration = (parsed.appAccountPassword && !parsed.appAccountPasswordEncrypted) ||
                           (parsed.googleClientSecret && !parsed.googleClientSecretEncrypted)
    if (needsMigration && typeof safeStorage !== 'undefined' && safeStorage?.isEncryptionAvailable?.()) {
      try {
        writeConfig(_cache)
      } catch {}
    }

    return _cache
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function writeConfig(cfg: AppConfig): void {
  if (!cfg.supabaseUrl) cfg.supabaseUrl = DEFAULT_SUPABASE_URL
  delete (cfg as any).supabaseServiceKey
  const prev = _cache

  // Prepare disk payload with encrypted credentials
  const toSave: any = { ...cfg }
  if (cfg.appAccountPassword) {
    try {
      if (typeof safeStorage !== 'undefined' && safeStorage?.isEncryptionAvailable?.()) {
        toSave.appAccountPasswordEncrypted = safeStorage.encryptString(cfg.appAccountPassword).toString('base64')
        delete toSave.appAccountPassword
      }
    } catch (err) {
      console.warn('[config] safeStorage encryption failed, saving plaintext fallback:', err)
    }
  }

  if (cfg.googleClientSecret) {
    try {
      if (typeof safeStorage !== 'undefined' && safeStorage?.isEncryptionAvailable?.()) {
        toSave.googleClientSecretEncrypted = safeStorage.encryptString(cfg.googleClientSecret).toString('base64')
        delete toSave.googleClientSecret
      }
    } catch (err) {
      console.warn('[config] safeStorage Google secret encryption failed, saving plaintext fallback:', err)
    }
  }

  fs.mkdirSync(path.dirname(CONFIG_PATH), { recursive: true })
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(toSave, null, 2), 'utf-8')
  _cache = cfg

  // If Supabase credentials changed, invalidate the cached client so it
  // is recreated with the new credentials on the next database call.
  if (
    !prev ||
    prev.supabaseUrl !== cfg.supabaseUrl ||
    prev.supabaseAnonKey !== cfg.supabaseAnonKey ||
    prev.appAccountEmail !== cfg.appAccountEmail ||
    prev.appAccountPassword !== cfg.appAccountPassword
  ) {
    resetSupabaseClient()
  }
}

export function isFirstRun(): boolean {
  if (!fs.existsSync(CONFIG_PATH)) return true
  const cfg = readConfig()
  return !cfg.saveFolder || !cfg.supabaseAnonKey || !cfg.appAccountEmail || !cfg.appAccountPassword
}
