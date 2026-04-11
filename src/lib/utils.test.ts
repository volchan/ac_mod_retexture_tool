import { describe, expect, it } from 'vitest'
import { cn, heroLabel } from './utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz')
  })

  it('deduplicates tailwind classes via twMerge', () => {
    expect(cn('p-4', 'p-2')).toBe('p-2')
  })

  it('handles empty input', () => {
    expect(cn()).toBe('')
  })

  it('handles undefined and null values', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
  })
})

describe('heroLabel', () => {
  it('returns "Loading screen" for preview.png', () => {
    expect(heroLabel('preview.png')).toBe('Loading screen')
  })

  it('returns layout label for preview_boot.png', () => {
    expect(heroLabel('preview_boot.png')).toBe('Loading screen (boot)')
  })

  it('converts underscores to spaces in layout name', () => {
    expect(heroLabel('preview_boot_classic.png')).toBe('Loading screen (boot classic)')
  })

  it('returns name as-is for unrecognised pattern', () => {
    expect(heroLabel('other.png')).toBe('other.png')
  })
})
