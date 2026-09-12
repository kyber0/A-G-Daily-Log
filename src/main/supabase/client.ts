import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { readConfig } from '../store/config'
import { DEFAULT_SUPABASE_URL } from './constants'

export { DEFAULT_SUPABASE_URL } from './constants'

let _client: SupabaseClient | null = null
let _initPromise: Promise<SupabaseClient> | null = null

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

function isJwtExpiredError(err: unknown): boolean {
  const msg = String(err).toLowerCase()
  return (
    msg.includes('jwt expired') ||
    msg.includes('invalid jwt') ||
    msg.includes('token is expired') ||
    msg.includes('not authenticated') ||
    msg.includes('session_not_found') ||
    msg.includes('invalid refresh token')
  )
}

async function _doSignIn(
  client: SupabaseClient,
  config: ReturnType<typeof readConfig>
): Promise<void> {
  const email = config.appAccountEmail || process.env.SUPABASE_APP_EMAIL
  const password = config.appAccountPassword || process.env.SUPABASE_APP_PASSWORD
  if (!email || !password) {
    throw new Error('Supabase app account email or password is not configured.')
  }
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw error
}

async function _createAndSignIn(): Promise<SupabaseClient> {
  const config = readConfig()
  const url = config.supabaseUrl || process.env.SUPABASE_URL || DEFAULT_SUPABASE_URL
  const anonKey = config.supabaseAnonKey || process.env.SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    throw new Error('Supabase URL or Anon Key is not configured.')
  }

  const client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true }
  })

  const { data: { session } } = await client.auth.getSession()

  if (!session) {
    // No cached session — sign in fresh
    await _doSignIn(client, config)
  } else {
    // Cached session exists — check whether it has already expired
    const expiresAt = session.expires_at // seconds since epoch
    const nowSec = Math.floor(Date.now() / 1000)
    if (expiresAt && nowSec >= expiresAt - 30) {
      console.warn('[supabase] Session expired or about to expire — refreshing token…')
      const { data: refreshed, error: refreshErr } = await client.auth.refreshSession()
      if (refreshErr || !refreshed.session) {
        console.warn('[supabase] Token refresh failed — re-authenticating…', refreshErr?.message)
        await _doSignIn(client, config)
      }
    }
  }

  // Proactively reset the cache if Supabase's background refresh ever fails
  // (e.g. the computer woke from sleep long after the token expired)
  client.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      console.warn('[supabase] Auth state → SIGNED_OUT — resetting cached client.')
      _client = null
      _initPromise = null
    }
  })

  return client
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export async function getSupabase(): Promise<SupabaseClient> {
  if (_client) return _client
  if (_initPromise) return _initPromise

  _initPromise = _createAndSignIn()
    .then((client) => {
      _client = client
      _initPromise = null
      return client
    })
    .catch((err) => {
      _initPromise = null
      throw err
    })

  return _initPromise
}

/**
 * Execute a Supabase operation with automatic JWT-expiry retry.
 *
 * If the operation throws OR returns a { error } object whose message
 * indicates an expired/invalid JWT, the cached client is reset and the
 * operation is retried exactly once after a fresh sign-in.
 *
 * Example:
 *   const { data, error } = await withSupabaseRetry((sb) =>
 *     sb.from('table').select('*')
 *   )
 */
export async function withSupabaseRetry<T>(
  fn: (sb: SupabaseClient) => Promise<T>
): Promise<T> {
  let sb: SupabaseClient
  let result: T

  try {
    sb = await getSupabase()
    result = await fn(sb)
  } catch (err) {
    if (!isJwtExpiredError(err)) throw err
    console.warn('[supabase] JWT error (thrown) — resetting and retrying once…', String(err))
    _client = null
    _initPromise = null
    sb = await getSupabase()
    return fn(sb)
  }

  // Check for auth errors returned inside Supabase { data, error } envelopes
  if (result && typeof result === 'object' && 'error' in result) {
    const qErr = (result as any).error
    if (qErr && isJwtExpiredError(qErr.message ?? qErr)) {
      console.warn('[supabase] JWT error (in result.error) — resetting and retrying once…', qErr.message)
      _client = null
      _initPromise = null
      sb = await getSupabase()
      return fn(sb)
    }
  }

  return result
}

/**
 * Drop the cached client so it is recreated (with fresh credentials) on the
 * next call to getSupabase().
 */
export function resetSupabaseClient(): void {
  _client = null
  _initPromise = null
}

/**
 * Test Supabase credentials without touching the global cached client.
 */
export async function testSupabaseAuth(
  url: string,
  anonKey: string,
  email: string,
  pass: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!url)     return { ok: false, error: 'Project URL is required.' }
    if (!anonKey) return { ok: false, error: 'Anon Key is required.' }
    if (!email)   return { ok: false, error: 'App Account Email is required.' }
    if (!pass)    return { ok: false, error: 'App Account Password is required.' }

    const client = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    const { data, error } = await client.auth.signInWithPassword({ email, password: pass })
    if (error) return { ok: false, error: error.message }
    if (!data.session) {
      return { ok: false, error: 'Authentication succeeded but no active session was returned.' }
    }

    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  }
}
