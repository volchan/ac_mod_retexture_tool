import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { getIsWindows, isMac, isWindows, MOD_SYMBOL, modKbd } from './platform'

const originalPlatform = navigator.platform

function setPlatform(platform: string) {
  Object.defineProperty(navigator, 'platform', { value: platform, configurable: true })
}

beforeEach(() => {
  setPlatform(originalPlatform)
})

afterEach(() => {
  setPlatform(originalPlatform)
})

describe('platform constants', () => {
  it('isMac is a boolean', () => {
    expect(typeof isMac).toBe('boolean')
  })

  it('isWindows is a boolean', () => {
    expect(typeof isWindows).toBe('boolean')
  })

  it('MOD_SYMBOL is a non-empty string', () => {
    expect(typeof MOD_SYMBOL).toBe('string')
    expect(MOD_SYMBOL.length).toBeGreaterThan(0)
  })
})

describe('modKbd', () => {
  it('returns a string containing the key', () => {
    expect(modKbd('A')).toMatch(/A/)
  })

  it('returns MOD_SYMBOL prefix plus the key', () => {
    expect(modKbd('Z')).toBe(`${MOD_SYMBOL}Z`)
  })

  it('handles multi-char key strings', () => {
    expect(modKbd('Enter')).toBe(`${MOD_SYMBOL}Enter`)
  })
})

describe('getIsWindows', () => {
  it('returns true when navigator.platform is Win32', () => {
    setPlatform('Win32')
    expect(getIsWindows()).toBe(true)
  })

  it('returns false when navigator.platform is MacIntel', () => {
    setPlatform('MacIntel')
    expect(getIsWindows()).toBe(false)
  })

  it('returns false when navigator.platform is Linux x86_64', () => {
    setPlatform('Linux x86_64')
    expect(getIsWindows()).toBe(false)
  })

  it('returns a boolean', () => {
    expect(typeof getIsWindows()).toBe('boolean')
  })
})
