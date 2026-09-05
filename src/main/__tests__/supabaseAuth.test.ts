import { describe, it, expect } from 'vitest'
import { testSupabaseAuth } from '../supabase/client'

describe('Supabase Authentication Client', () => {
  it('validates that Project URL is required', async () => {
    const res = await testSupabaseAuth('', 'anon-key', 'app@domain.internal', 'pass123')
    expect(res.ok).toBe(false)
    expect(res.error).toContain('Project URL is required')
  })

  it('validates that Anon Key is required', async () => {
    const res = await testSupabaseAuth('https://project.supabase.co', '', 'app@domain.internal', 'pass123')
    expect(res.ok).toBe(false)
    expect(res.error).toContain('Anon Key is required')
  })

  it('validates that App Email is required', async () => {
    const res = await testSupabaseAuth('https://project.supabase.co', 'anon-key', '', 'pass123')
    expect(res.ok).toBe(false)
    expect(res.error).toContain('App Account Email is required')
  })

  it('validates that App Password is required', async () => {
    const res = await testSupabaseAuth('https://project.supabase.co', 'anon-key', 'app@domain.internal', '')
    expect(res.ok).toBe(false)
    expect(res.error).toContain('App Account Password is required')
  })

  it('gracefully handles invalid credentials without throwing uncaught exceptions', async () => {
    const res = await testSupabaseAuth(
      'https://invalid-project.supabase.co',
      'invalid-anon-key',
      'nonexistent@domain.internal',
      'wrong-password'
    )
    expect(res.ok).toBe(false)
    expect(res.error).toBeDefined()
  })
})
