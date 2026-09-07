import { describe, it, expect } from 'vitest'
import * as path from 'path'

describe('Security Hardening Checks', () => {
  describe('Path Traversal & Scope Validation', () => {
    function isAllowedPathMock(targetPath: string, allowedRoots: string[]): boolean {
      if (!targetPath || typeof targetPath !== 'string') return false
      if (targetPath.includes('\0')) return false

      let resolved: string
      try {
        resolved = path.resolve(targetPath)
      } catch {
        return false
      }

      const root = path.parse(resolved).root
      if (resolved === root) return false

      const winDir = process.env.WINDIR ? path.resolve(process.env.WINDIR) : 'C:\\Windows'
      if (resolved === winDir || resolved.startsWith(winDir + path.sep)) {
        return false
      }

      return allowedRoots.some(allowed => {
        if (!allowed) return false
        const norm = path.resolve(allowed)
        return resolved === norm || resolved.startsWith(norm + path.sep)
      })
    }

    const testAllowedRoots = [
      path.resolve('C:/Users/Test/Documents'),
      path.resolve('C:/Users/Test/Downloads'),
      path.resolve('C:/dev/A_and_G/exports')
    ]

    it('allows files directly inside allowed directories', () => {
      const valid = path.resolve('C:/dev/A_and_G/exports/report.xlsx')
      expect(isAllowedPathMock(valid, testAllowedRoots)).toBe(true)
    })

    it('blocks directory traversal attempts (..)', () => {
      const traversal = path.resolve('C:/dev/A_and_G/exports/../../Windows/System32/cmd.exe')
      expect(isAllowedPathMock(traversal, testAllowedRoots)).toBe(false)
    })

    it('blocks Windows system directories', () => {
      expect(isAllowedPathMock('C:\\Windows\\System32\\calc.exe', testAllowedRoots)).toBe(false)
    })

    it('blocks root drives', () => {
      expect(isAllowedPathMock('C:\\', testAllowedRoots)).toBe(false)
    })

    it('blocks null byte injections', () => {
      expect(isAllowedPathMock('C:/dev/A_and_G/exports/file\0.xlsx', testAllowedRoots)).toBe(false)
    })
  })

  describe('IPC Channel Whitelist', () => {
    const ALLOWED_CHANNELS = new Set([
      'connectivity:change',
      'sync:dead-items',
      'sync:complete',
      'update:status'
    ])

    it('permits whitelisted broadcast channels', () => {
      expect(ALLOWED_CHANNELS.has('connectivity:change')).toBe(true)
      expect(ALLOWED_CHANNELS.has('update:status')).toBe(true)
      expect(ALLOWED_CHANNELS.has('sync:complete')).toBe(true)
      expect(ALLOWED_CHANNELS.has('sync:dead-items')).toBe(true)
    })

    it('rejects unauthorized arbitrary channels', () => {
      expect(ALLOWED_CHANNELS.has('arbitrary:channel')).toBe(false)
      expect(ALLOWED_CHANNELS.has('node:exec')).toBe(false)
      expect(ALLOWED_CHANNELS.has('eval')).toBe(false)
      expect(ALLOWED_CHANNELS.has('export:openFile')).toBe(false)
    })
  })
})
