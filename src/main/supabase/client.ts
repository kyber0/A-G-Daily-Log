import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { readConfig } from '../store/config'
import { DEFAULT_SUPABASE_URL } from './constants'

export { DEFAULT_SUPABASE_URL } from './constants'

let _client: SupabaseClient | null = null
let _initPromise: Promise<SupabaseClient> | null = null

export async function getSupabase(): Promise<SupabaseClient> {
  if (_client) return _client
  if (_initPromise) return _initPromise

  _initPromise = (async () => {
    try {
      const config = readConfig()
      const url = config.supabaseUrl || process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL
      const anonKey = config.supabaseAnonKey || process.env.SUPABASE_ANON_KEY
      if (!url || !anonKey) {
        throw new Error('Supabase URL or Anon Key is not configured.')
      }

      const client = createClient(url, anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true
        }
      })

      const { data: { session } } = await client.auth.getSession()
      if (!session) {
        const email = config.appAccountEmail || process.env.SUPABASE_APP_EMAIL
        const password = config.appAccountPassword || process.env.SUPABASE_APP_PASSWORD
        if (!email || !password) {
          throw new Error('Supabase app account email or password is not configured.')
        }
        const { error } = await client.auth.signInWithPassword({
          email,
          password
        })
        if (error) throw error
      }

      _client = client
      return _client
    } finally {
      _initPromise = null
    }
  })()

  return _initPromise
}

/**
 * Drop the cached client and in-flight init promise so it is recreated with fresh
 * credentials on the next call to getSupabase().
 */
export function resetSupabaseClient(): void {
  _client = null
  _initPromise = null
}

/**
 * Helper to test Supabase connection and app account credentials without mutating global client.
 */
export async function testSupabaseAuth(
  url: string,
  anonKey: string,
  email: string,
  pass: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!url) return { ok: false, error: 'Project URL is required.' }
    if (!anonKey) return { ok: false, error: 'Anon Key is required.' }
    if (!email) return { ok: false, error: 'App Account Email is required.' }
    if (!pass) return { ok: false, error: 'App Account Password is required.' }

    const client = createClient(url, anonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    })

    const { data, error } = await client.auth.signInWithPassword({
      email,
      password: pass
    })

    if (error) {
      return { ok: false, error: error.message }
    }

    if (!data.session) {
      return { ok: false, error: 'Authentication succeeded but no active session was returned.' }
    }

    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}
