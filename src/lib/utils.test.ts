import { describe, expect, it } from 'vitest'
import { cn, previewLabel } from './utils'

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

describe('previewLabel', () => {
  it('returns "Preview image" for preview.png', () => {
    expect(previewLabel('preview.png')).toBe('Preview image')
  })

  it('returns layout label for preview_boot.png', () => {
    expect(previewLabel('preview_boot.png')).toBe('Preview image (boot)')
  })

  it('converts underscores to spaces in layout name', () => {
    expect(previewLabel('preview_boot_classic.png')).toBe('Preview image (boot classic)')
  })

  it('returns name as-is for unrecognised pattern', () => {
    expect(previewLabel('other.png')).toBe('other.png')
  })
})
